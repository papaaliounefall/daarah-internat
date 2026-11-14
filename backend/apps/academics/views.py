from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.services import record
from apps.core.permissions import RolePermission
from apps.core.roles import ADMIN_ROLES, ALL_ROLES, STAFF_ROLES, Role
from apps.core.views import AuditedMixin, NoDeleteMixin, TenantViewSetMixin
from apps.students.models import Student
from apps.students.selectors import student_scope

from . import services
from .models import AcademicYear, ClassRoom, Enrollment, EnrollmentKind
from .serializers import AcademicYearSerializer, ClassRoomSerializer, EnrollmentSerializer, annotate_classes


class AcademicYearViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer
    role_access = {
        "list": ALL_ROLES, "retrieve": ALL_ROLES,
        "create": {Role.DIRECTEUR}, "update": {Role.DIRECTEUR}, "partial_update": {Role.DIRECTEUR},
        "activate": {Role.DIRECTEUR}, "close": {Role.DIRECTEUR},
    }

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        year = services.activate_year(self.get_object())
        record(request, "YEAR_ACTIVATE", year)
        return Response(self.get_serializer(year).data)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        year = services.close_year(self.get_object())
        record(request, "YEAR_CLOSE", year)
        return Response(self.get_serializer(year).data)


class ClassRoomViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    queryset = ClassRoom.objects.all()
    serializer_class = ClassRoomSerializer
    role_access = {
        "list": STAFF_ROLES | {Role.PARENT}, "retrieve": STAFF_ROLES | {Role.PARENT},
        "create": ADMIN_ROLES, "update": ADMIN_ROLES, "partial_update": ADMIN_ROLES,
        "students": STAFF_ROLES,
    }
    filterset_fields = ["academic_year", "teacher"]
    search_fields = ["name", "level"]

    def get_queryset(self):
        return annotate_classes(super().get_queryset())

    def scope_queryset(self, qs):
        user = self.request.user
        if user.role == Role.MAITRE:
            return qs.filter(teacher=user)  # un maître ne voit que ses classes
        if user.role == Role.PARENT:
            return qs.filter(enrollments__student__guardianships__user=user).distinct()
        return qs

    @action(detail=True, methods=["get"])
    def students(self, request, pk=None):
        """Effectif de la classe (inscriptions actives)."""
        from apps.students.serializers import StudentFamilySerializer, StudentSerializer
        from apps.students.selectors import with_derived

        cls = self.get_object()
        qs = student_scope(Student.objects.filter(establishment=request.user.establishment), request.user)
        qs = with_derived(qs.filter(enrollments__classroom=cls, enrollments__status="ACTIVE").distinct())
        ser_cls = StudentSerializer if request.user.role in ADMIN_ROLES else StudentFamilySerializer
        return Response(ser_cls(qs, many=True, context={"request": request}).data)


class EnrollmentViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
                        mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Inscriptions annuelles (jamais modifiées en place : changement de classe = action tracée)."""

    queryset = Enrollment.objects.select_related("student", "academic_year", "classroom").prefetch_related("assignments__classroom")
    serializer_class = EnrollmentSerializer
    role_access = {
        "list": STAFF_ROLES | {Role.PARENT}, "retrieve": STAFF_ROLES | {Role.PARENT},
        "create": ADMIN_ROLES, "change_class": ADMIN_ROLES, "reenroll": ADMIN_ROLES, "withdraw": ADMIN_ROLES,
    }
    filterset_fields = ["student", "academic_year", "classroom", "status", "kind"]

    def scope_queryset(self, qs):
        user = self.request.user
        if user.role == Role.MAITRE:
            return qs.filter(classroom__teacher=user)
        if user.role == Role.PARENT:
            return qs.filter(student__guardianships__user=user)
        return qs

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        kind = EnrollmentKind.RENEWAL if d["student"].enrollments.exists() else EnrollmentKind.NEW
        enrollment = services.enroll(d["student"], d["academic_year"], d.get("classroom"), user=request.user, kind=kind)
        record(request, "ENROLL", enrollment)
        return Response(self.get_serializer(enrollment).data, status=201)

    @action(detail=True, methods=["post"], url_path="change-class")
    def change_class(self, request, pk=None):
        enrollment = self.get_object()
        try:
            new_class = ClassRoom.objects.get(pk=request.data.get("classroom"), establishment=request.user.establishment)
        except (ClassRoom.DoesNotExist, ValueError, TypeError, Exception):  # noqa: BLE001
            raise ValidationError({"classroom": "Classe introuvable."})
        services.change_class(enrollment, new_class, user=request.user, reason=request.data.get("reason", ""))
        record(request, "CLASS_CHANGE", enrollment, changes={"classroom": new_class.name})
        return Response(self.get_serializer(self.get_queryset().get(pk=enrollment.pk)).data)  # relu : historique à jour

    @action(detail=False, methods=["post"])
    def reenroll(self, request):
        """Réinscription en masse : ``{"academic_year": id, "students": [ids], "classroom": id|null}``."""
        try:
            year = AcademicYear.objects.get(pk=request.data.get("academic_year"), establishment=request.user.establishment)
        except Exception:  # noqa: BLE001
            raise ValidationError({"academic_year": "Année introuvable."})
        classroom = None
        if request.data.get("classroom"):
            classroom = ClassRoom.objects.filter(pk=request.data["classroom"], establishment=request.user.establishment).first()
            if classroom is None:
                raise ValidationError({"classroom": "Classe introuvable."})
        students = Student.objects.filter(
            pk__in=request.data.get("students", []), establishment=request.user.establishment, is_archived=False
        )
        done, skipped = [], []
        for st in students:
            try:
                e = services.enroll(st, year, classroom, user=request.user, kind=EnrollmentKind.RENEWAL)
                done.append(str(e.pk))
            except ValidationError as exc:
                skipped.append({"student": str(st.pk), "error": exc.detail})
        record(request, "REENROLL_BULK", model="Enrollment", detail=f"{len(done)} réinscriptions, année {year.name}")
        return Response({"enrolled": done, "skipped": skipped})

    @action(detail=True, methods=["post"])
    def withdraw(self, request, pk=None):
        enrollment = self.get_object()
        enrollment.status = "RETIREE"
        enrollment.save(update_fields=["status", "updated_at"])
        record(request, "ENROLL_WITHDRAW", enrollment)
        return Response(self.get_serializer(enrollment).data)
