"""Règles métier de l'internat : affectations (capacité, double affectation), sorties, mouvements."""
from __future__ import annotations

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.students.models import Student

from .models import BoardingAssignment, BoardingMovement, MovementKind, Room


def active_assignment(student) -> BoardingAssignment | None:
    return (
        BoardingAssignment.objects.filter(student=student, end_date__isnull=True)
        .select_related("room", "room__building").first()
    )


def occupancy(room: Room) -> int:
    return BoardingAssignment.objects.filter(room=room, end_date__isnull=True).count()


def _lock_room(room: Room, establishment) -> Room:
    """Verrouille la ligne de la chambre : deux affectations simultanées ne peuvent pas dépasser la capacité."""
    try:
        return Room.objects.select_for_update().select_related("building").get(pk=room.pk, establishment=establishment)
    except Room.DoesNotExist:
        raise ValidationError({"room": "Chambre introuvable."})


def _check_student(student: Student, establishment):
    if student.establishment_id != establishment.pk:
        raise ValidationError({"student": "Talibé introuvable."})
    if student.is_archived:
        raise ValidationError({"student": "Ce talibé est archivé : affectation impossible."})


def _check_room_and_bed(room: Room, bed_number: str, *, ignore_assignment=None):
    if not room.is_active:
        raise ValidationError({"room": f"La chambre « {room} » est désactivée."})
    used = BoardingAssignment.objects.filter(room=room, end_date__isnull=True)
    if ignore_assignment is not None:
        used = used.exclude(pk=ignore_assignment.pk)
    if used.count() >= room.capacity:
        raise ValidationError({"room": f"La chambre « {room} » est complète ({room.capacity} places)."})
    if bed_number and used.filter(bed_number=bed_number).exists():
        raise ValidationError({"bed_number": f"Le lit « {bed_number} » est déjà occupé dans cette chambre."})


def _create(student, room, bed_number, user, note, start_date) -> BoardingAssignment:
    try:
        with transaction.atomic():  # point de sauvegarde : une contrainte violée ne casse pas la transaction parente
            return BoardingAssignment.objects.create(
                establishment=student.establishment, student=student, room=room, bed_number=bed_number or "",
                start_date=start_date or timezone.localdate(), note=note or "", assigned_by=user,
            )
    except IntegrityError:
        raise ValidationError({"detail": "Affectation impossible : talibé déjà affecté ou lit déjà occupé."})


@transaction.atomic
def assign_student(student: Student, room: Room, *, user, bed_number: str = "", note: str = "", start_date=None) -> BoardingAssignment:
    """Première affectation (ou retour à l'internat) ; refuse si le talibé a déjà une affectation active."""
    est = user.establishment
    room = _lock_room(room, est)
    _check_student(student, est)
    if active_assignment(student) is not None:
        raise ValidationError({"student": "Ce talibé a déjà une affectation active. Utilisez le changement de chambre."})
    _check_room_and_bed(room, bed_number)
    return _create(student, room, bed_number, user, note, start_date)


@transaction.atomic
def change_room(student: Student, room: Room, *, user, bed_number: str = "", note: str = "") -> BoardingAssignment:
    """Clôture l'affectation en cours (historique conservé) et ouvre la nouvelle."""
    est = user.establishment
    room = _lock_room(room, est)
    _check_student(student, est)
    current = BoardingAssignment.objects.select_for_update().filter(student=student, end_date__isnull=True).first()
    if current is None:
        raise ValidationError({"student": "Ce talibé n'a pas d'affectation active : utilisez l'affectation."})
    if current.room_id == room.pk and (current.bed_number or "") == (bed_number or ""):
        raise ValidationError({"room": "Le talibé occupe déjà cette chambre et ce lit."})
    _check_room_and_bed(room, bed_number, ignore_assignment=current)
    today = timezone.localdate()
    current.end_date = today
    current.save(update_fields=["end_date", "updated_at"])
    return _create(student, room, bed_number, user, note or "Changement de chambre", today)


@transaction.atomic
def release(assignment: BoardingAssignment, *, user, reason: str = "") -> BoardingAssignment:
    """Sortie définitive de l'internat : l'affectation est clôturée, jamais supprimée."""
    assignment = BoardingAssignment.objects.select_for_update().get(pk=assignment.pk)
    if assignment.end_date is not None:
        raise ValidationError({"detail": "Cette affectation est déjà clôturée."})
    assignment.end_date = timezone.localdate()
    if reason:
        assignment.note = ((assignment.note + " | ") if assignment.note else "") + f"Sortie : {reason}"
        assignment.note = assignment.note[:255]
    assignment.save(update_fields=["end_date", "note", "updated_at"])
    return assignment


def is_out(student) -> bool:
    last = BoardingMovement.objects.filter(student=student).order_by("-occurred_at", "-created_at").first()
    return bool(last and last.kind == MovementKind.EXIT)


@transaction.atomic
def record_movement(student: Student, kind: str, *, user, occurred_at=None, reason="", expected_return=None) -> BoardingMovement:
    _check_student(student, user.establishment)
    Student.objects.select_for_update().get(pk=student.pk)  # sérialise les mouvements d'un même talibé
    if active_assignment(student) is None:
        raise ValidationError({"student": "Ce talibé n'est pas affecté à l'internat."})
    out = is_out(student)
    if kind == MovementKind.EXIT and out:
        raise ValidationError({"kind": "Ce talibé est déjà sorti : enregistrez d'abord son retour."})
    if kind == MovementKind.ENTRY and not out:
        raise ValidationError({"kind": "Ce talibé est déjà présent à l'internat."})
    when = occurred_at or timezone.now()
    if when > timezone.now() + timedelta(minutes=5):
        raise ValidationError({"occurred_at": "La date ne peut pas être dans le futur."})
    if expected_return and expected_return < when:
        raise ValidationError({"expected_return": "Le retour prévu doit suivre la sortie."})
    return BoardingMovement.objects.create(
        establishment=student.establishment, student=student, kind=kind, occurred_at=when, reason=reason,
        expected_return=expected_return if kind == MovementKind.EXIT else None, recorded_by=user,
    )
