"""Règles métier du personnel : historique des fonctions."""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from .models import StaffMember, StaffPosition


@transaction.atomic
def open_position(staff: StaffMember, role_title: str, *, start_date=None, note: str = "") -> StaffPosition:
    """Ouvre une nouvelle fonction : la précédente est clôturée (historique conservé) et le dossier mis à jour."""
    start = start_date or timezone.localdate()
    StaffPosition.objects.filter(staff=staff, end_date__isnull=True).update(end_date=start)
    position = StaffPosition.objects.create(
        establishment=staff.establishment, staff=staff, role_title=role_title, start_date=start, note=note,
    )
    if staff.role_title != role_title:
        staff.role_title = role_title
        staff.save(update_fields=["role_title", "updated_at"])
    return position


@transaction.atomic
def leave(staff: StaffMember, *, end_date=None) -> StaffMember:
    """Départ du personnel : statut « parti », fonctions en cours clôturées. Le dossier est conservé."""
    end = end_date or timezone.localdate()
    staff.status = "PARTI"
    staff.end_date = end
    staff.save(update_fields=["status", "end_date", "updated_at"])
    StaffPosition.objects.filter(staff=staff, end_date__isnull=True).update(end_date=end)
    return staff
