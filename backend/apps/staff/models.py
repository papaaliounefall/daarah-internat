from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel
from apps.core.validators import validate_document


class StaffCategory(models.TextChoices):
    TEACHER = "MAITRE", "Maître coranique"
    ADMIN = "ADMIN", "Personnel administratif"
    OTHER = "AUTRE", "Autre employé"


class StaffStatus(models.TextChoices):
    ACTIVE = "ACTIF", "Actif"
    LEAVE = "CONGE", "En congé"
    LEFT = "PARTI", "Parti"


class StaffMember(TenantModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="staff_profile")
    full_name = models.CharField(max_length=200)
    category = models.CharField(max_length=10, choices=StaffCategory.choices, default=StaffCategory.OTHER)
    role_title = models.CharField("fonction", max_length=200)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    hire_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=6, choices=StaffStatus.choices, default=StaffStatus.ACTIVE)
    # Données sensibles : réservées au directeur (voir sérialiseurs).
    id_number = models.CharField("pièce d'identité", max_length=60, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["full_name"]

    def __str__(self):
        return self.full_name


class StaffPosition(TenantModel):
    """Historique des fonctions / affectations."""

    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name="positions")
    role_title = models.CharField(max_length=200)
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-start_date"]


class StaffDocument(TenantModel):
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name="documents")
    title = models.CharField(max_length=160)
    file = models.FileField(upload_to="staff/documents/", validators=[validate_document])

    class Meta:
        ordering = ["-created_at"]
