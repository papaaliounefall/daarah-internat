import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models

from apps.core.models import Establishment
from apps.core.roles import Role


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    establishment = models.ForeignKey(
        Establishment, on_delete=models.PROTECT, related_name="users", null=True, blank=True
    )
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.PARENT)
    phone = models.CharField("téléphone", max_length=30, blank=True)
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    # Le directeur peut accorder à un assistant l'accès aux données financières.
    can_view_finance = models.BooleanField(default=False)
    must_change_password = models.BooleanField(default=False)

    class Meta:
        ordering = ["last_name", "first_name"]
        indexes = [models.Index(fields=["establishment", "role"])]

    @property
    def full_name(self) -> str:
        return self.get_full_name() or self.username

    def __str__(self):
        return f"{self.full_name} ({self.get_role_display()})"
