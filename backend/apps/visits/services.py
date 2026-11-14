"""Cycle de vie d'une demande de visite : création par le parent, décision de l'administration,
réponse du parent à une proposition. Toutes les transitions sont atomiques et verrouillées.

    EN_ATTENTE ──accept──────────▶ ACCEPTEE
        │ ├─────refuse(motif)────▶ REFUSEE            (ACCEPTEE ──refuse──▶ REFUSEE possible : visite retirée)
        │ ├─────propose──────────▶ MODIFICATION_PROPOSEE ◀── propose (re-proposition, ou report d'une visite ACCEPTEE)
        │ └─────cancel (parent)──▶ ANNULEE
    MODIFICATION_PROPOSEE ─accept-proposal (parent)─▶ ACCEPTEE (créneau = proposition)
                          ─decline-proposal (parent)▶ ANNULEE
                          ─cancel (parent)──────────▶ ANNULEE

Règle d'annulation par le parent : tant que la demande est EN_ATTENTE ou MODIFICATION_PROPOSEE.
Une visite ACCEPTEE est confirmée : le parent contacte le Daara (l'administration peut la refuser/reporter).
REFUSEE et ANNULEE sont définitives : le parent dépose une nouvelle demande.
"""
from __future__ import annotations

import datetime

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.core.roles import ADMIN_ROLES
from apps.notifications.services import NotificationKind, notify, notify_roles
from apps.students.models import Student

from .models import VisitRequest, VisitStatus

S = VisitStatus

ALLOWED = {
    "accept": {S.PENDING},
    "refuse": {S.PENDING, S.ACCEPTED},
    "propose": {S.PENDING, S.RESCHEDULED, S.ACCEPTED},
    "cancel": {S.PENDING, S.RESCHEDULED},
    "accept_proposal": {S.RESCHEDULED},
    "decline_proposal": {S.RESCHEDULED},
}
ACTIVE = {S.PENDING, S.ACCEPTED, S.RESCHEDULED}


def _fmt(d, t):
    return f"{d:%d/%m/%Y} à {t:%H:%M}"


def _check_future(date: datetime.date, time: datetime.time, field: str):
    now = timezone.localtime()
    if date < now.date() or (date == now.date() and time <= now.time()):
        raise ValidationError({field: "Le créneau choisi est déjà passé."})


def _lock(visit_id, action: str) -> VisitRequest:
    visit = VisitRequest.objects.select_for_update().select_related("student", "guardian").get(pk=visit_id)
    if visit.status not in ALLOWED[action]:
        raise ValidationError({"detail": _why_not(visit, action)})
    return visit


def _why_not(visit: VisitRequest, action: str) -> str:
    label = S(visit.status).label.lower()
    if action == "cancel" and visit.status == S.ACCEPTED:
        return "Cette visite est déjà confirmée : contactez le Daara pour l'annuler ou la reporter."
    if visit.status in (S.REFUSED, S.CANCELLED):
        return f"Cette demande est {label} : elle est clôturée. Déposez une nouvelle demande si nécessaire."
    if action in ("accept_proposal", "decline_proposal"):
        return "Aucune proposition de l'administration n'est en attente pour cette demande."
    if action == "accept" and visit.status == S.RESCHEDULED:
        return "Une nouvelle date a été proposée : la réponse du parent est attendue."
    if action == "accept" and visit.status == S.ACCEPTED:
        return "Cette demande est déjà acceptée."
    return f"Action impossible : la demande est « {label} »."


# ---------------------------------------------------------------- parent -----------------
@transaction.atomic
def create_visit(user, *, student_id, date, time, message="") -> VisitRequest:
    student = Student.objects.filter(
        pk=student_id, establishment_id=user.establishment_id, guardianships__user=user
    ).first()
    if student is None:
        raise NotFound("Talibé introuvable.")  # inconnu ou non lié à ce parent : même réponse
    if student.is_archived:
        raise ValidationError({"student": "Ce dossier est archivé : aucune visite ne peut être demandée."})
    _check_future(date, time, "requested_date")
    if VisitRequest.objects.filter(student=student, requested_date=date, status__in=ACTIVE).exists():
        raise ValidationError({"requested_date": "Une demande est déjà en cours pour ce talibé à cette date."})
    visit = VisitRequest.objects.create(
        establishment=user.establishment, guardian=user, student=student, requested_date=date,
        requested_time=time, message=message or "",
    )
    notify_roles(
        user.establishment, ADMIN_ROLES, NotificationKind.VISIT, "Nouvelle demande de visite",
        f"{user.full_name} souhaite rendre visite à {student.full_name} le {_fmt(date, time)}.",
        link_type="visit", link_id=str(visit.pk),
    )
    return visit


def _tell_admins(visit, title, text):
    notify_roles(visit.establishment, ADMIN_ROLES, NotificationKind.VISIT, title, text,
                 link_type="visit", link_id=str(visit.pk))


@transaction.atomic
def cancel(user, visit_id) -> VisitRequest:
    visit = _lock(visit_id, "cancel")
    visit.status = S.CANCELLED
    visit.save(update_fields=["status", "updated_at"])
    _tell_admins(visit, "Demande de visite annulée",
                 f"{visit.guardian.full_name} a annulé sa demande de visite pour {visit.student.full_name}.")
    return visit


@transaction.atomic
def accept_proposal(user, visit_id) -> VisitRequest:
    visit = _lock(visit_id, "accept_proposal")
    _check_future(visit.proposed_date, visit.proposed_time, "proposed_date")
    visit.status = S.ACCEPTED
    visit.save(update_fields=["status", "updated_at"])
    _tell_admins(visit, "Proposition de visite acceptée",
                 f"{visit.guardian.full_name} accepte le {_fmt(visit.proposed_date, visit.proposed_time)} "
                 f"pour la visite de {visit.student.full_name}.")
    return visit


@transaction.atomic
def decline_proposal(user, visit_id) -> VisitRequest:
    visit = _lock(visit_id, "decline_proposal")
    visit.status = S.CANCELLED
    visit.save(update_fields=["status", "updated_at"])
    _tell_admins(visit, "Proposition de visite déclinée",
                 f"{visit.guardian.full_name} décline la proposition pour la visite de {visit.student.full_name} "
                 "(demande close).")
    return visit


# ---------------------------------------------------------------- administration ---------
def _decided(visit: VisitRequest, user, status, reason: str):
    visit.status = status
    visit.decided_by = user
    visit.decided_at = timezone.now()
    visit.reason = (reason or "").strip()


@transaction.atomic
def accept(user, visit_id, *, reason="") -> VisitRequest:
    visit = _lock(visit_id, "accept")
    _check_future(visit.requested_date, visit.requested_time, "requested_date")
    _decided(visit, user, S.ACCEPTED, reason)
    visit.proposed_date = visit.proposed_time = None
    visit.save()
    notify([visit.guardian], NotificationKind.VISIT, "Visite acceptée",
           f"Votre visite auprès de {visit.student.full_name} est confirmée le "
           f"{_fmt(visit.requested_date, visit.requested_time)}." + (f" Note : {visit.reason}" if visit.reason else ""),
           link_type="visit", link_id=str(visit.pk))
    return visit


@transaction.atomic
def refuse(user, visit_id, *, reason) -> VisitRequest:
    reason = (reason or "").strip()
    if not reason:
        raise ValidationError({"reason": "Le motif du refus est obligatoire."})
    visit = _lock(visit_id, "refuse")
    _decided(visit, user, S.REFUSED, reason)
    visit.save()
    notify([visit.guardian], NotificationKind.VISIT, "Visite refusée",
           f"Votre demande de visite pour {visit.student.full_name} ({_fmt(visit.requested_date, visit.requested_time)}) "
           f"n'a pas pu être acceptée. Motif : {visit.reason}",
           link_type="visit", link_id=str(visit.pk))
    return visit


@transaction.atomic
def propose(user, visit_id, *, date, time, reason="") -> VisitRequest:
    visit = _lock(visit_id, "propose")
    _check_future(date, time, "proposed_date")
    _decided(visit, user, S.RESCHEDULED, reason)
    visit.proposed_date, visit.proposed_time = date, time
    visit.save()
    notify([visit.guardian], NotificationKind.VISIT, "Autre créneau proposé pour votre visite",
           f"Le Daara vous propose le {_fmt(date, time)} pour la visite de {visit.student.full_name}."
           + (f" Note : {visit.reason}" if visit.reason else "") + " Répondez depuis votre espace.",
           link_type="visit", link_id=str(visit.pk))
    return visit
