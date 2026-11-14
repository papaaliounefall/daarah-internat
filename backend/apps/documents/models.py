from django.conf import settings
from django.db import models

from apps.core.models import TenantModel


class StudentCard(TenantModel):
    """Carte talibé générée. Chaque (ré)impression crée une nouvelle version ; l'historique est conservé."""

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="cards")
    version = models.PositiveSmallIntegerField()
    is_current = models.BooleanField(default=True)
    pdf = models.FileField(upload_to="documents/cards/")
    snapshot = models.JSONField(default=dict)  # données imprimées sur cette version
    reason = models.CharField(max_length=255, blank=True)  # ex. « Perte », « Changement de classe »
    generated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-version"]
        constraints = [models.UniqueConstraint(fields=["student", "version"], name="uniq_card_version")]
