"""Agrégats de présence (statistiques par classe, rapport mensuel)."""
from __future__ import annotations

import calendar
import datetime
import re

from django.db.models import Count, Q
from rest_framework.exceptions import ValidationError

from apps.academics.models import Enrollment

from .models import AttendanceRecord, AttendanceStatus


def parse_month(raw: str | None) -> tuple[str, datetime.date, datetime.date]:
    """« AAAA-MM » (défaut : mois courant) -> (libellé, premier jour, dernier jour)."""
    if not raw:
        today = datetime.date.today()
        year, month = today.year, today.month
    else:
        m = re.fullmatch(r"(\d{4})-(\d{2})", raw)
        if not m or not 1 <= int(m.group(2)) <= 12 or int(m.group(1)) < 2000:
            raise ValidationError({"month": "Mois invalide (format AAAA-MM)."})
        year, month = int(m.group(1)), int(m.group(2))
    last = calendar.monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}", datetime.date(year, month, 1), datetime.date(year, month, last)


COUNTS = {
    "present": Count("id", filter=Q(status=AttendanceStatus.PRESENT)),
    "absent": Count("id", filter=Q(status=AttendanceStatus.ABSENT)),
    "late": Count("id", filter=Q(status=AttendanceStatus.LATE)),
    "excused": Count("id", filter=Q(status=AttendanceStatus.EXCUSED)),
    "total": Count("id"),
}


def rate(present: int, late: int, total: int):
    """Taux de présence en % = (présents + retards) / total des pointages (absences excusées comprises)."""
    return round((present + late) * 100 / total, 1) if total else None


def _row(d: dict) -> dict:
    d["attendance_rate"] = rate(d["present"], d["late"], d["total"])
    return d


def stats(records_qs, classroom) -> dict:
    records_qs = records_qs.order_by()  # l'ordre par défaut fausserait les regroupements
    totals = records_qs.aggregate(**COUNTS)
    out = _row(dict(totals))
    out["classroom"] = str(classroom.pk) if classroom else None
    out["by_day"] = [
        _row({"date": r.pop("date").isoformat(), **r})
        for r in records_qs.values("date").annotate(**COUNTS).order_by("date")
    ]
    if classroom is None:
        out["by_classroom"] = [
            _row({"classroom": str(r["classroom_id"]) if r["classroom_id"] else None,
                  "class_name": r["classroom__name"] or "", **{k: r[k] for k in COUNTS}})
            for r in records_qs.values("classroom_id", "classroom__name").annotate(**COUNTS).order_by("classroom__name")
        ]
    return out


def monthly_report(records_qs, classroom, first: datetime.date, last: datetime.date) -> dict:
    """Comptes par talibé pour une classe et un mois (élèves inscrits sans pointage inclus, à zéro)."""
    records_qs = records_qs.order_by()
    rows = {
        r["student_id"]: r
        for r in records_qs.values("student_id", "student__first_name", "student__last_name", "student__registration_number")
        .annotate(**COUNTS)
    }
    enrolled = Enrollment.objects.filter(classroom=classroom, status="ACTIVE", student__is_archived=False).select_related("student")
    for e in enrolled:
        rows.setdefault(e.student_id, {
            "student_id": e.student_id, "student__first_name": e.student.first_name,
            "student__last_name": e.student.last_name, "student__registration_number": e.student.registration_number,
            "present": 0, "absent": 0, "late": 0, "excused": 0, "total": 0,
        })
    students = sorted(rows.values(), key=lambda r: (r["student__last_name"].lower(), r["student__first_name"].lower()))
    items = [
        _row({
            "student_id": str(r["student_id"]), "student_name": f"{r['student__first_name']} {r['student__last_name']}".strip(),
            "registration_number": r["student__registration_number"],
            **{k: r[k] for k in COUNTS},
        })
        for r in students
    ]
    totals = _row({k: sum(i[k] for i in items) for k in COUNTS})
    return {
        "classroom": str(classroom.pk), "class_name": classroom.name, "month": first.strftime("%Y-%m"),
        "days_recorded": records_qs.values("date").distinct().count(),
        "students": items, "totals": totals,
    }
