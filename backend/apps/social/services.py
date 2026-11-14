"""Règles métier du volet social : dons (numérotation, annulation) et parrainages."""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.models import Sequence

from .models import Donation, Sponsorship, SponsorshipStatus


def require_reason(reason, field="reason") -> str:
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise ValidationError({field: "Un motif est obligatoire (3 caractères minimum)."})
    return reason[:255]


@transaction.atomic
def record_donation(*, user, sponsor=None, donor_name="", donor_phone="", amount, date=None, purpose="", method="ESPECES",
                    attachment=None) -> Donation:
    """Enregistre un don et lui attribue un numéro séquentiel atomique (``DON-2026-001``)."""
    est = user.establishment
    today = timezone.localdate()
    date = date or today
    if date > today:
        raise ValidationError({"date": "La date du don ne peut pas être dans le futur."})
    if sponsor is not None and sponsor.establishment_id != est.pk:
        raise ValidationError({"sponsor": "Parrain introuvable."})
    donor_name = (donor_name or "").strip() or (sponsor.name if sponsor else "")
    if not donor_name:
        raise ValidationError({"donor_name": "Le nom du donateur est obligatoire."})
    n = Sequence.next(est, "donation", today.year)
    return Donation.objects.create(
        establishment=est, sponsor=sponsor, donor_name=donor_name, donor_phone=donor_phone, amount=amount, date=date,
        purpose=purpose, method=method, receipt_number=f"DON-{today.year}-{n:03d}", attachment=attachment, recorded_by=user,
    )


@transaction.atomic
def cancel_donation(donation: Donation, *, user, reason: str) -> Donation:
    reason = require_reason(reason)
    donation = Donation.objects.select_for_update().get(pk=donation.pk)
    if donation.is_cancelled:
        raise ValidationError({"detail": "Ce don est déjà annulé."})
    donation.is_cancelled = True
    donation.cancel_reason = reason
    donation.cancelled_by = user
    donation.cancelled_at = timezone.now()
    donation.save(update_fields=["is_cancelled", "cancel_reason", "cancelled_by", "cancelled_at", "updated_at"])
    return donation


def normalize_sponsorship(status, end_date, start_date):
    """Un parrainage terminé reçoit une date de fin ; une date de fin ne précède jamais le début."""
    if end_date and start_date and end_date < start_date:
        raise ValidationError({"end_date": "La date de fin ne peut pas précéder la date de début."})
    if status == SponsorshipStatus.ENDED and not end_date:
        end_date = timezone.localdate()
    return end_date


def active_sponsorships(qs=None):
    return (qs if qs is not None else Sponsorship.objects.all()).filter(status=SponsorshipStatus.ACTIVE)
