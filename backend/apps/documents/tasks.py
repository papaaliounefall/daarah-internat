"""Tâches Celery des documents."""
from __future__ import annotations

import logging

from celery import shared_task
from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)


@shared_task(name="apps.documents.tasks.generate_student_card")
def generate_student_card(student_id: str, user_id: str | None = None, reason: str = "", only_if_missing: bool = False):
    """Génère (une nouvelle version de) la carte d'un talibé. Retourne l'identifiant de la carte, ou None.

    N'échoue jamais : toute erreur est journalisée et auditée (``PDF_CARD_FAILED``) pour ne pas bloquer l'appelant.
    ``only_if_missing`` : génération automatique idempotente (ne crée rien si une carte existe déjà).
    """
    from apps.audit.services import record
    from apps.students.models import Student

    from . import services

    student = None
    try:
        student = Student.objects.select_related("establishment").get(pk=student_id)
        if only_if_missing and student.cards.exists():
            return None
        user = get_user_model().objects.filter(pk=user_id).first() if user_id else None
        reason = reason or (services.AUTO_REASON if only_if_missing else "")
        card = services.generate_card(student, user=user, reason=reason)
        return str(card.pk)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Échec de génération de la carte du talibé %s", student_id)
        try:
            record(None, "PDF_CARD_FAILED", student, user=None, model="Student", detail=type(exc).__name__,
                   changes={"student": str(student_id)})
        except Exception:  # noqa: BLE001
            logger.exception("Audit de l'échec impossible")
        return None


@shared_task(name="apps.documents.tasks.refresh_student_card")
def refresh_student_card(student_id: str):
    """Régénère la carte (nouvelle version, l'ancienne est conservée) si le dossier a changé depuis son édition.

    Idempotent : ne crée rien si la carte courante est déjà à jour. N'échoue jamais."""
    from apps.audit.services import record
    from apps.students.models import Student

    from . import services

    student = None
    try:
        student = Student.objects.select_related("establishment").get(pk=student_id)
        if student.is_archived or not services.card_is_stale(student):
            return None
        return str(services.generate_card(student, reason=services.AUTO_UPDATE_REASON).pk)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Échec de mise à jour de la carte du talibé %s", student_id)
        try:
            record(None, "PDF_CARD_FAILED", student, user=None, model="Student", detail=type(exc).__name__,
                   changes={"student": str(student_id)})
        except Exception:  # noqa: BLE001
            logger.exception("Audit de l'échec impossible")
        return None
