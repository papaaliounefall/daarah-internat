from django.conf import settings
from django.db import models

from apps.core.models import BaseModel, Establishment


class AuditLog(BaseModel):
    """Journal d'activité. Écriture seule : aucune API de modification ni de suppression."""

    establishment = models.ForeignKey(Establishment, on_delete=models.PROTECT, related_name="+", null=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    user_name = models.CharField(max_length=200, blank=True)  # instantané : survit à la suppression du compte
    user_role = models.CharField(max_length=20, blank=True)
    action = models.CharField(max_length=60)  # CREATE, UPDATE, DELETE, LOGIN, PDF_CARD, ...
    model = models.CharField(max_length=80, blank=True)
    object_id = models.CharField(max_length=64, blank=True)
    object_repr = models.CharField(max_length=255, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["establishment", "-created_at"]),
            models.Index(fields=["model", "object_id"]),
        ]

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.user_name} {self.action} {self.model}"
