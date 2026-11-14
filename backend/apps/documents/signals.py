"""Génération automatique de la carte à l'enregistrement d'un talibé.

Le signal ``post_save`` (création) ne génère rien immédiatement : il enregistre un callback
``transaction.on_commit``. L'inscription (classe) est créée par la vue DANS la même transaction, juste après
le dossier ; la carte n'est donc produite qu'APRÈS le commit, quand la classe existe et peut être imprimée.
Une panne (broker, rendu, disque) ne fait jamais échouer l'inscription : elle est journalisée et auditée.
"""
import logging

from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _dispatch(student_id: str) -> None:
    from .tasks import generate_student_card

    try:
        generate_student_card.delay(student_id, only_if_missing=True, reason="")
    except Exception:  # noqa: BLE001 - broker indisponible, etc. : l'inscription reste valide
        logger.exception("Impossible de planifier la génération de la carte du talibé %s", student_id)
        try:
            from apps.audit.services import record
            from apps.students.models import Student

            student = Student.objects.filter(pk=student_id).first()
            record(None, "PDF_CARD_FAILED", student, changes={"error": "planification impossible"})
        except Exception:  # noqa: BLE001
            logger.exception("Audit de l'échec de planification impossible")


@receiver(post_save, sender="students.Student", dispatch_uid="documents.auto_student_card")
def schedule_card_generation(sender, instance, created, raw=False, **kwargs):
    if not created or raw or not getattr(settings, "DOCUMENTS_AUTO_CARD", True):
        return
    student_id = str(instance.pk)
    transaction.on_commit(lambda: _dispatch(student_id))


def _dispatch_refresh(student_id: str) -> None:
    from .tasks import refresh_student_card

    try:
        refresh_student_card.delay(student_id)
    except Exception:  # noqa: BLE001 - la mise à jour de la carte ne doit jamais bloquer une modification
        logger.exception("Impossible de planifier la mise à jour de la carte du talibé %s", student_id)


@receiver(post_save, sender="students.Student", dispatch_uid="documents.refresh_card_on_student_change")
def refresh_card_on_student_change(sender, instance, created, raw=False, **kwargs):
    """Photo ou informations imprimées modifiées : la carte courante est régénérée (nouvelle version)."""
    if created or raw or not getattr(settings, "DOCUMENTS_AUTO_CARD", True):
        return
    student_id = str(instance.pk)
    transaction.on_commit(lambda: _dispatch_refresh(student_id))


@receiver(post_save, sender="academics.Enrollment", dispatch_uid="documents.refresh_card_on_enrollment")
def refresh_card_on_enrollment(sender, instance, created, raw=False, **kwargs):
    """Changement de classe : la classe imprimée sur la carte change."""
    if raw or not getattr(settings, "DOCUMENTS_AUTO_CARD", True):
        return
    student_id = str(instance.student_id)
    transaction.on_commit(lambda: _dispatch_refresh(student_id))
