from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel
from apps.core.validators import validate_document


class SponsorKind(models.TextChoices):
    SPONSOR = "PARRAIN", "Parrain"
    PARTNER = "PARTENAIRE", "Partenaire"
    DONOR = "DONATEUR", "Donateur"


class Sponsor(TenantModel):
    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=10, choices=SponsorKind.choices, default=SponsorKind.SPONSOR)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    country = models.CharField(max_length=80, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]


class Donation(TenantModel):
    sponsor = models.ForeignKey(Sponsor, on_delete=models.SET_NULL, null=True, blank=True, related_name="donations")
    donor_name = models.CharField(max_length=200)
    donor_phone = models.CharField(max_length=40, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=0)
    date = models.DateField(default=timezone.localdate)
    purpose = models.CharField("objet / affectation", max_length=255, blank=True)
    method = models.CharField(max_length=14, default="ESPECES")
    receipt_number = models.CharField(max_length=30, editable=False)
    attachment = models.FileField(upload_to="social/justificatifs/", blank=True, null=True, validators=[validate_document])
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    is_cancelled = models.BooleanField(default=False)
    cancel_reason = models.CharField(max_length=255, blank=True)
    cancelled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["establishment", "receipt_number"], name="uniq_donation_receipt"),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="donation_amount_positive"),
        ]


class SponsorshipStatus(models.TextChoices):
    ACTIVE = "ACTIF", "Actif"
    SUSPENDED = "SUSPENDU", "Suspendu"
    ENDED = "TERMINE", "Terminé"


class Sponsorship(TenantModel):
    """Dossier de parrainage d'un talibé (typiquement un talibé du volet social)."""

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="sponsorships")
    sponsor = models.ForeignKey(Sponsor, on_delete=models.PROTECT, related_name="sponsorships")
    monthly_amount = models.DecimalField(max_digits=12, decimal_places=0, default=0)
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=8, choices=SponsorshipStatus.choices, default=SponsorshipStatus.ACTIVE)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-start_date"]
