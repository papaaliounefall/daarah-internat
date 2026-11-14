from django.conf import settings
from django.db import models

from apps.core.models import TenantModel


class NotificationKind(models.TextChoices):
    LESSON = "CORAN", "Leçon / suivi coranique"
    EVALUATION = "EVALUATION", "Évaluation"
    ABSENCE = "PRESENCE", "Absence"
    VISIT = "VISITE", "Visite"
    FINANCE = "FINANCE", "Échéance financière"
    GENERAL = "GENERAL", "Information du Daara"


class Channel(models.TextChoices):
    IN_APP = "IN_APP", "Interne"
    SMS = "SMS", "SMS (non activé)"
    WHATSAPP = "WHATSAPP", "WhatsApp (non activé)"


class Notification(TenantModel):
    """Notification interne : visible uniquement par son destinataire.

    SMS/WhatsApp : le champ ``channel`` est prévu pour une extension ultérieure ; aucun envoi
    externe n'est simulé tant qu'un fournisseur réel n'est pas configuré.
    """

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=12, choices=NotificationKind.choices, default=NotificationKind.GENERAL)
    title = models.CharField(max_length=200)
    message = models.TextField()
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.IN_APP)
    link_type = models.CharField(max_length=40, blank=True)  # ex. « student », « visit »
    link_id = models.CharField(max_length=64, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    # Clé d'idempotence (évite les doublons d'alertes, ex. rappel d'échéance quotidien).
    dedupe_key = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["recipient", "read_at", "-created_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["recipient", "dedupe_key"], condition=~models.Q(dedupe_key=""), name="uniq_notification_dedupe"
            )
        ]


class Announcement(TenantModel):
    """Information importante du Daara, diffusée aux rôles choisis."""

    title = models.CharField(max_length=200)
    message = models.TextField()
    audience = models.JSONField(default=list)  # liste de rôles ; vide = tous
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-created_at"]
