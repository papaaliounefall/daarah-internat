"""Règles métier des présences : upsert par créneau, notification d'absence dédupliquée."""
from __future__ import annotations

import datetime
from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.academics.models import ClassRoom, Enrollment
from apps.core.roles import Role
from apps.notifications.services import NotificationKind, notify_guardians
from apps.students.models import Student
from apps.students.selectors import student_scope

from .models import AttendanceRecord, AttendanceStatus, Period

MAX_BATCH = 500


@dataclass
class UpsertResult:
    record: AttendanceRecord
    created: bool
    old: dict | None  # valeurs avant correction (None si création)


def resolve_classroom(user, classroom_id) -> ClassRoom:
    """Classe de l'établissement ; un maître n'a accès qu'aux siennes (sinon 404)."""
    qs = ClassRoom.objects.filter(establishment_id=user.establishment_id, pk=classroom_id)
    if user.role == Role.MAITRE:
        qs = qs.filter(teacher=user)
    classroom = qs.first()
    if classroom is None:
        raise NotFound("Classe introuvable.")
    return classroom


def load_students(user, ids) -> dict:
    """Talibés (non archivés) du périmètre de l'utilisateur ; un seul inconnu / hors périmètre => 404 pour tout le lot."""
    ids = list(ids)
    qs = student_scope(Student.objects.filter(establishment_id=user.establishment_id, is_archived=False), user)
    found = {s.pk: s for s in qs.filter(pk__in=ids)}
    if len(found) != len(set(ids)):
        raise NotFound("Un ou plusieurs talibés sont introuvables.")
    return found


def _classrooms_by_student(student_ids) -> dict:
    enrolls = Enrollment.objects.filter(
        student_id__in=student_ids, academic_year__is_current=True, status="ACTIVE"
    ).select_related("classroom")
    return {e.student_id: e.classroom for e in enrolls}


@transaction.atomic
def upsert_records(user, *, items: list[dict], date: datetime.date, period: str, classroom: ClassRoom | None = None) -> list[UpsertResult]:
    """Crée ou corrige les pointages d'un créneau (élève, date, période). Jamais de suppression."""
    if date > timezone.localdate():
        raise ValidationError({"date": "La date ne peut pas être dans le futur."})
    if period not in Period.values:
        raise ValidationError({"period": "Période invalide (MATIN ou SOIR)."})
    if not items:
        raise ValidationError({"records": "Aucun pointage à enregistrer."})
    if len(items) > MAX_BATCH:
        raise ValidationError({"records": f"Au maximum {MAX_BATCH} pointages par envoi."})
    ids = [it["student"] for it in items]
    if len(set(ids)) != len(ids):
        raise ValidationError({"records": "Un talibé apparaît plusieurs fois dans l'envoi."})
    students = load_students(user, ids)
    own_classes = _classrooms_by_student(ids)
    if classroom is not None:
        outside = [s for s in ids if own_classes.get(s) is None or own_classes[s].pk != classroom.pk]
        if outside:
            names = ", ".join(students[s].full_name for s in outside[:5])
            raise ValidationError({"records": f"Ces talibés ne sont pas inscrits dans la classe « {classroom.name} » : {names}."})

    results = []
    for it in items:
        student = students[it["student"]]
        room = classroom or own_classes.get(student.pk)
        rec = (
            AttendanceRecord.objects.select_for_update()
            .filter(student=student, date=date, period=period).first()
        )
        status, reason = it["status"], it.get("reason", "") or ""
        if rec is None:
            rec = AttendanceRecord.objects.create(
                establishment=user.establishment, student=student, classroom=room, date=date, period=period,
                status=status, reason=reason, recorded_by=user,
            )
            results.append(UpsertResult(rec, True, None))
        else:
            old = {"status": rec.status, "reason": rec.reason}
            if old != {"status": status, "reason": reason} or (room and rec.classroom_id != room.pk):
                rec.status, rec.reason, rec.recorded_by = status, reason, user
                if room:
                    rec.classroom = room
                rec.save()
            results.append(UpsertResult(rec, False, old))
        if status == AttendanceStatus.ABSENT:
            _notify_absence(student, date, period)
    return results


def _notify_absence(student, date, period):
    """Une absence non excusée prévient les parents UNE SEULE fois par créneau (clé de déduplication)."""
    label = Period(period).label.lower()
    notify_guardians(
        student, NotificationKind.ABSENCE, "Absence enregistrée",
        f"{student.first_name} a été noté absent le {date:%d/%m/%Y} ({label}).",
        dedupe_key=f"absence:{student.pk}:{date.isoformat()}:{period}",
    )
