"""Tâches Celery des notifications : diffusion d'informations et rappels d'échéances.

Aucun envoi SMS / WhatsApp : seul le canal interne (``Channel.IN_APP``) est actif. Extension future : une tâche
dédiée lira les ``Notification`` dont ``channel`` vaut SMS/WHATSAPP et les remettra au fournisseur réel configuré
(voir docs/api/notifications.md). Rien n'est simulé tant qu'aucun fournisseur n'existe.
"""
from __future__ import annotations

import datetime
import logging
from decimal import Decimal

from celery import shared_task
from django.contrib.auth import get_user_model
from django.db.models import DecimalField, ExpressionWrapper, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.core.roles import Role

from .models import Announcement, Notification, NotificationKind
from .services import notify, notify_roles

logger = logging.getLogger(__name__)

REMINDER_WINDOW_DAYS = 3     # on rappelle une échéance dans ≤ 3 jours (ou déjà en retard)
REMINDER_INTERVAL_DAYS = 7   # au plus un rappel par destinataire et par échéance toutes les semaines


def _fcfa(amount) -> str:
    return f"{int(Decimal(amount)):,}".replace(",", " ") + " FCFA"


@shared_task(name="apps.notifications.tasks.broadcast_announcement")
def broadcast_announcement(announcement_id: str) -> int:
    """Diffuse une information du Daara aux rôles choisis. Idempotent (``dedupe_key`` par destinataire)."""
    ann = Announcement.objects.select_related("establishment").filter(pk=announcement_id).first()
    if ann is None:
        return 0
    roles = ann.audience or list(Role.values)
    return notify_roles(
        ann.establishment, roles, NotificationKind.GENERAL, ann.title, ann.message,
        link_type="announcement", link_id=str(ann.pk), dedupe_key=f"announcement:{ann.pk}",
    )


def _due_message(due, remaining, today) -> tuple[str, str]:
    delta = (due.due_date - today).days
    if delta < 0:
        when = f"en retard de {-delta} jour{'s' if -delta > 1 else ''}"
    elif delta == 0:
        when = "à payer aujourd'hui"
    else:
        when = f"à payer dans {delta} jour{'s' if delta > 1 else ''}"
    student = f"{due.student.first_name} {due.student.last_name}".strip()
    title = "Échéance en retard" if delta < 0 else "Échéance à venir"
    msg = (f"{due.label} — {student} : {_fcfa(remaining)} restant dû, échéance du "
           f"{due.due_date.strftime('%d/%m/%Y')} ({when}).")
    return title, msg


@shared_task(name="apps.notifications.tasks.send_due_reminders")
def send_due_reminders(today: datetime.date | None = None) -> dict:
    """Notifie parents du talibé et responsables financiers des échéances impayées proches ou en retard.

    Échéance concernée : non annulée, restant dû > 0 (montant - paiements PAYE liés), échue dans ≤ 3 jours ou
    déjà échue, talibé non archivé. Destinataires : parents liés au talibé, directeur(s), assistant(s) ayant
    ``can_view_finance``. Un même destinataire n'est pas relancé pour la même échéance moins de 7 jours après.
    """
    from apps.finance.models import Due

    today = today or timezone.localdate()
    since = timezone.now() - datetime.timedelta(days=REMINDER_INTERVAL_DAYS)
    User = get_user_model()
    paid = Coalesce(Sum("payments__amount", filter=Q(payments__status="PAYE")), Value(Decimal(0)),
                    output_field=DecimalField())
    dues = (
        Due.objects.filter(is_cancelled=False, due_date__lte=today + datetime.timedelta(days=REMINDER_WINDOW_DAYS),
                           student__is_archived=False, establishment__is_active=True)
        .annotate(paid=paid)
        .annotate(remaining=ExpressionWrapper(F("amount") - F("paid"), output_field=DecimalField()))
        .filter(remaining__gt=0)
        .select_related("student", "establishment")
        .order_by("due_date")
    )
    stats = {"dues": 0, "notifications": 0}
    for due in list(dues):
        title, msg = _due_message(due, due.remaining, today)
        parents = User.objects.filter(guardianships__student=due.student_id, is_active=True,
                                      establishment_id=due.establishment_id)
        finance_staff = User.objects.filter(establishment_id=due.establishment_id, is_active=True).filter(
            Q(role=Role.DIRECTEUR) | Q(role=Role.ASSISTANT, can_view_finance=True))
        key = f"due:{due.pk}:"
        for users, link_type, link_id in ((parents, "student", str(due.student_id)), (finance_staff, "due", str(due.pk))):
            users = list(users.distinct())
            recent = set(Notification.objects.filter(
                recipient__in=users, dedupe_key__startswith=key, created_at__gte=since
            ).values_list("recipient_id", flat=True))
            targets = [u for u in users if u.pk not in recent]
            stats["notifications"] += notify(targets, NotificationKind.FINANCE, title, msg, link_type=link_type,
                                             link_id=link_id, dedupe_key=f"{key}{today.isoformat()}")
        stats["dues"] += 1
    return stats
