"""Tableaux de bord par profil. Toutes les valeurs sont calculées sur les données réelles de la base,
dans le périmètre de l'utilisateur (établissement + rôle) ; rien n'est fictif."""
import datetime

from django.db.models import Count, DecimalField, F, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import AcademicYear, ClassRoom, Enrollment
from apps.core.permissions import RolePermission
from apps.core.roles import ALL_ROLES, Role
from apps.students.models import Student
from apps.students.selectors import student_scope


def _money(v):
    return int(v or 0)


def _finance_allowed(user) -> bool:
    return user.role == Role.DIRECTEUR or (user.role == Role.ASSISTANT and user.can_view_finance)


def _finance_block(est, today):
    from apps.finance.models import Due, Expense, Payment

    month_start = today.replace(day=1)
    pay = Payment.objects.filter(establishment=est, status="PAYE")
    exp = Expense.objects.filter(establishment=est, status="VALIDEE")
    revenue = pay.filter(date__gte=month_start).aggregate(s=Sum("amount"))["s"]
    expenses = exp.filter(date__gte=month_start).aggregate(s=Sum("amount"))["s"]
    paid = Subquery(
        Payment.objects.filter(due=OuterRef("pk"), status="PAYE").values("due").annotate(s=Sum("amount")).values("s")[:1],
        output_field=DecimalField(),
    )
    dues = Due.objects.filter(establishment=est, is_cancelled=False, due_date__lt=today).annotate(paid_amount=Coalesce(paid, Value(0), output_field=DecimalField()))
    arrears = sum(max(0, (d.amount - d.paid_amount)) for d in dues)
    pending_expenses = Expense.objects.filter(establishment=est, status="EN_ATTENTE").count()
    return {
        "month_revenue": _money(revenue), "month_expenses": _money(expenses),
        "month_balance": _money(revenue) - _money(expenses), "arrears_total": _money(arrears),
        "pending_expenses": pending_expenses,
    }


def _missing_fields(s: Student):
    missing = []
    if not s.photo:
        missing.append("photo")
    if not s.birth_date:
        missing.append("date de naissance")
    if not (s.guardian_phone or s.father_phone or s.mother_phone):
        missing.append("téléphone du responsable")
    if not (s.father_name or s.mother_name or s.guardian_name):
        missing.append("parents / responsable")
    return missing


class DashboardView(APIView):
    permission_classes = [RolePermission]
    role_access = {"get": ALL_ROLES}

    def get(self, request):
        user = request.user
        est = user.establishment
        today = timezone.localdate()
        year = AcademicYear.objects.filter(establishment=est, is_current=True).first()
        base = {"role": user.role, "today": today.isoformat(),
                "academic_year": {"id": str(year.pk), "name": year.name} if year else None}
        handler = {
            Role.DIRECTEUR: self.director, Role.ASSISTANT: self.assistant,
            Role.MAITRE: self.teacher, Role.PARENT: self.parent,
        }[user.role]
        return Response({**base, **handler(user, est, year, today)})

    # ---- helpers ----
    def _attendance_today(self, est, today, classroom_ids=None):
        from apps.attendance.models import AttendanceRecord

        qs = AttendanceRecord.objects.filter(establishment=est, date=today)
        if classroom_ids is not None:
            qs = qs.filter(classroom_id__in=classroom_ids)
        c = {r["status"]: r["n"] for r in qs.values("status").annotate(n=Count("id"))}
        total = sum(c.values())
        present = c.get("PRESENT", 0) + c.get("RETARD", 0)
        return {
            "present": c.get("PRESENT", 0), "absent": c.get("ABSENT", 0), "late": c.get("RETARD", 0),
            "excused": c.get("EXCUSE", 0), "recorded": total,
            "rate": round(100 * present / total, 1) if total else None,
        }

    def _by_class(self, est, year, class_qs=None):
        qs = class_qs if class_qs is not None else ClassRoom.objects.filter(establishment=est, academic_year=year)
        qs = qs.annotate(n=Count("enrollments", filter=Q(enrollments__status="ACTIVE"))).select_related("teacher")
        return [
            {"class_id": str(c.pk), "class_name": c.name, "count": c.n, "capacity": c.capacity,
             "teacher_name": c.teacher.full_name if c.teacher else ""}
            for c in qs
        ]

    # ---- directeur ----
    def director(self, user, est, year, today):
        from apps.boarding.models import BoardingAssignment, Room
        from apps.inventory.models import Item
        from apps.visits.models import VisitRequest
        from django.contrib.auth import get_user_model

        students = Student.objects.filter(establishment=est, is_archived=False)
        status = {r["status"]: r["n"] for r in students.values("status").annotate(n=Count("id"))}
        capacity = Room.objects.filter(establishment=est, is_active=True).aggregate(s=Sum("capacity"))["s"] or 0
        occupied = BoardingAssignment.objects.filter(establishment=est, end_date__isnull=True).count()
        evolution = [
            {"year": y.name, "count": y.n}
            for y in AcademicYear.objects.filter(establishment=est).annotate(n=Count("enrollments")).order_by("start_date")
        ]
        low_stock = Item.objects.filter(establishment=est, is_active=True, quantity__lte=F("min_threshold")).count()
        data = {
            "students_total": students.count(),
            "students_by_status": {"PAYANT": status.get("PAYANT", 0), "SOCIAL": status.get("SOCIAL", 0)},
            "classes": self._by_class(est, year) if year else [],
            "teachers_count": get_user_model().objects.filter(establishment=est, role=Role.MAITRE, is_active=True).count(),
            "attendance_today": self._attendance_today(est, today),
            "enrollment_evolution": evolution,
            "boarding": {"capacity": capacity, "occupied": occupied},
            "visits_pending": VisitRequest.objects.filter(establishment=est, status="EN_ATTENTE").count(),
            "alerts": {"low_stock_items": low_stock,
                       "incomplete_files": sum(1 for s in students if _missing_fields(s))},
        }
        data["finance"] = _finance_block(est, today)
        data["alerts"]["pending_expenses"] = data["finance"]["pending_expenses"]
        data["alerts"]["overdue_amount"] = data["finance"]["arrears_total"]
        return data

    # ---- assistant ----
    def assistant(self, user, est, year, today):
        from apps.documents.models import StudentCard
        from apps.visits.models import VisitRequest

        students = Student.objects.filter(establishment=est, is_archived=False)
        recent = Enrollment.objects.filter(establishment=est, academic_year=year).select_related("student", "classroom").order_by("-created_at")[:8] if year else []
        incomplete = []
        for s in students:
            m = _missing_fields(s)
            if m:
                incomplete.append({"student_id": str(s.pk), "student_name": s.full_name, "registration_number": s.registration_number, "missing": m})
        with_card = StudentCard.objects.filter(establishment=est, is_current=True).values_list("student_id", flat=True)
        data = {
            "recent_enrollments": [
                {"id": str(e.pk), "student_id": str(e.student_id), "student_name": e.student.full_name, "kind": e.kind,
                 "class_name": e.classroom.name if e.classroom else "", "enrolled_on": e.enrolled_on.isoformat()}
                for e in recent
            ],
            "renewals_count": Enrollment.objects.filter(establishment=est, academic_year=year, kind="REINSCRIPTION").count() if year else 0,
            "incomplete_files": incomplete[:20],
            "incomplete_files_count": len(incomplete),
            "classes": self._by_class(est, year) if year else [],
            "cards_to_generate": students.exclude(pk__in=with_card).count(),
            "visits_pending": VisitRequest.objects.filter(establishment=est, status="EN_ATTENTE").count(),
        }
        if _finance_allowed(user):
            data["finance"] = _finance_block(est, today)
        return data

    # ---- maître coranique ----
    def teacher(self, user, est, year, today):
        from apps.memorization.models import Evaluation, Lesson, Revision

        classes = ClassRoom.objects.filter(establishment=est, teacher=user, **({"academic_year": year} if year else {}))
        class_ids = list(classes.values_list("pk", flat=True))
        students = student_scope(Student.objects.filter(establishment=est, is_archived=False), user)
        since = today - datetime.timedelta(days=30)
        recently_evaluated = Evaluation.objects.filter(
            establishment=est, is_current=True, date__gte=since, student__in=students
        ).values_list("student_id", flat=True)
        to_evaluate = students.exclude(pk__in=recently_evaluated)
        lessons = Lesson.objects.filter(establishment=est, is_current=True, student__in=students).select_related("student", "surah")[:10]
        revisions = Revision.objects.filter(establishment=est, is_current=True, student__in=students).select_related("student", "surah")[:10]
        return {
            "classes": self._by_class(est, year, classes),
            "students_count": students.count(),
            "recent_lessons": [
                {"id": str(l.pk), "student_id": str(l.student_id), "student_name": l.student.full_name, "date": l.date.isoformat(),
                 "surah_number": l.surah_id, "surah_name": l.surah.name_simple, "ayah_start": l.ayah_start, "ayah_end": l.ayah_end,
                 "quality": l.quality}
                for l in lessons
            ],
            "recent_revisions": [
                {"id": str(r.pk), "student_id": str(r.student_id), "student_name": r.student.full_name, "date": r.date.isoformat(),
                 "surah_name": r.surah.name_simple, "ayah_start": r.ayah_start, "ayah_end": r.ayah_end, "quality": r.quality}
                for r in revisions
            ],
            "to_evaluate": [{"student_id": str(s.pk), "student_name": s.full_name} for s in to_evaluate[:15]],
            "to_evaluate_count": to_evaluate.count(),
            "attendance_today": self._attendance_today(est, today, class_ids),
        }

    # ---- parent ----
    def parent(self, user, est, year, today):
        from apps.attendance.models import AttendanceRecord
        from apps.memorization.models import Evaluation, Lesson, Revision
        from apps.notifications.models import Notification

        children = []
        since = today - datetime.timedelta(days=30)
        for st in student_scope(Student.objects.filter(establishment=est, is_archived=False), user):
            lesson = Lesson.objects.filter(student=st, is_current=True).select_related("surah").first()
            rev = Revision.objects.filter(student=st, is_current=True).select_related("surah").first()
            ev = Evaluation.objects.filter(student=st, is_current=True).first()
            att = {r["status"]: r["n"] for r in AttendanceRecord.objects.filter(student=st, date__gte=since).values("status").annotate(n=Count("id"))}
            children.append({
                "student_id": str(st.pk), "student_name": st.full_name,
                # Uniquement des informations destinées aux familles : jamais d'observations internes.
                "last_lesson": {"date": lesson.date.isoformat(), "surah_number": lesson.surah_id, "surah_name": lesson.surah.name_simple,
                                "ayah_start": lesson.ayah_start, "ayah_end": lesson.ayah_end, "appreciation": lesson.appreciation} if lesson else None,
                "last_revision": {"date": rev.date.isoformat(), "surah_name": rev.surah.name_simple, "ayah_start": rev.ayah_start,
                                  "ayah_end": rev.ayah_end, "appreciation": rev.appreciation} if rev else None,
                "last_evaluation": {"date": ev.date.isoformat(), "overall_score": float(ev.overall_score) if ev.overall_score is not None else None,
                                    "appreciation": ev.appreciation} if ev else None,
                "attendance_30_days": {"present": att.get("PRESENT", 0), "absent": att.get("ABSENT", 0),
                                       "late": att.get("RETARD", 0), "excused": att.get("EXCUSE", 0)},
            })
        return {
            "children": children,
            "unread_notifications": Notification.objects.filter(recipient=user, read_at__isnull=True).count(),
        }
