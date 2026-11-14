from django.conf import settings
from django.db import models

from apps.core.models import TenantModel


class VisitStatus(models.TextChoices):
    PENDING = "EN_ATTENTE", "En attente"
    ACCEPTED = "ACCEPTEE", "Acceptée"
    REFUSED = "REFUSEE", "Refusée"
    RESCHEDULED = "MODIFICATION_PROPOSEE", "Modification proposée"
    CANCELLED = "ANNULEE", "Annulée"


class VisitRequest(TenantModel):
    guardian = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="visit_requests")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="visit_requests")
    requested_date = models.DateField()
    requested_time = models.TimeField()
    message = models.TextField(blank=True)
    status = models.CharField(max_length=24, choices=VisitStatus.choices, default=VisitStatus.PENDING)
    # Réponse de l'administration
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    decided_at = models.DateTimeField(null=True, blank=True)
    reason = models.CharField("motif / note", max_length=500, blank=True)
    proposed_date = models.DateField(null=True, blank=True)
    proposed_time = models.TimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["establishment", "status"]), models.Index(fields=["guardian", "-created_at"])]
