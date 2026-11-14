"""API interne de notification. Les autres applications n'importent QUE ce module.

    from apps.notifications.services import notify, notify_guardians, notify_roles

Chaque fonction est tolérante : une panne de notification ne doit jamais faire échouer
l'opération métier qui l'a déclenchée.
"""
from __future__ import annotations

import logging
from typing import Iterable

from django.contrib.auth import get_user_model

from .models import Notification, NotificationKind

logger = logging.getLogger(__name__)


def notify(users: Iterable, kind: str, title: str, message: str, *, link_type: str = "", link_id: str = "", dedupe_key: str = "") -> int:
    """Crée une notification interne par destinataire. Retourne le nombre créé."""
    created = 0
    try:
        for user in users:
            if not user.is_active or not user.establishment_id:
                continue
            key = dedupe_key
            if key and Notification.objects.filter(recipient=user, dedupe_key=key).exists():
                continue
            Notification.objects.create(
                establishment_id=user.establishment_id, recipient=user, kind=kind, title=title,
                message=message, link_type=link_type, link_id=str(link_id) if link_id else "", dedupe_key=key,
            )
            created += 1
    except Exception:  # noqa: BLE001
        logger.exception("Échec de création de notification (%s)", kind)
    return created


def notify_roles(establishment, roles: Iterable[str], kind: str, title: str, message: str, **kw) -> int:
    User = get_user_model()
    users = User.objects.filter(establishment=establishment, role__in=list(roles), is_active=True)
    return notify(users, kind, title, message, **kw)


def notify_guardians(student, kind: str, title: str, message: str, **kw) -> int:
    """Notifie les comptes parents liés à ce talibé (et eux seuls)."""
    User = get_user_model()
    users = User.objects.filter(guardianships__student=student, is_active=True).distinct()
    kw.setdefault("link_type", "student")
    kw.setdefault("link_id", str(student.pk))
    return notify(users, kind, title, message, **kw)


__all__ = ["notify", "notify_roles", "notify_guardians", "NotificationKind"]
