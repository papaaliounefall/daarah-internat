"""Règles métier des stocks : SEUL point d'entrée pour modifier une quantité."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.roles import Role
from apps.notifications.services import NotificationKind, notify_roles

from .models import Item, MovementKind, StockMovement

CENT = Decimal("0.01")


def _q(value) -> Decimal:
    try:
        return Decimal(str(value)).quantize(CENT)
    except Exception:  # noqa: BLE001
        raise ValidationError({"quantity": "Quantité invalide."})


@transaction.atomic
def apply_movement(item: Item, kind: str, quantity, *, user, date=None, supplier=None, reason: str = "") -> StockMovement:
    """Enregistre un mouvement et met à jour la quantité sous verrou de ligne.

    - ENTREE : ajoute ``quantity`` (> 0) ;
    - SORTIE : retire ``quantity`` (> 0) ; refusée si elle dépasse le stock ;
    - AJUSTEMENT : ``quantity`` (>= 0) est la quantité comptée lors d'un inventaire (motif obligatoire).
    """
    if kind not in MovementKind.values:
        raise ValidationError({"kind": "Type de mouvement invalide."})
    qty = _q(quantity)
    locked = Item.objects.select_for_update().get(pk=item.pk, establishment_id=user.establishment_id)
    if not locked.is_active:
        raise ValidationError({"item": "Cet article est désactivé."})
    today = timezone.localdate()
    date = date or today
    if date > today:
        raise ValidationError({"date": "La date ne peut pas être dans le futur."})
    if supplier is not None and supplier.establishment_id != locked.establishment_id:
        raise ValidationError({"supplier": "Fournisseur introuvable."})
    before = locked.quantity
    if kind == MovementKind.ADJUST:
        if qty < 0:
            raise ValidationError({"quantity": "La quantité comptée ne peut pas être négative."})
        if not reason.strip():
            raise ValidationError({"reason": "Le motif est obligatoire pour un ajustement d'inventaire."})
        after = qty
    else:
        if qty <= 0:
            raise ValidationError({"quantity": "La quantité doit être supérieure à zéro."})
        if kind == MovementKind.OUT:
            if qty > before:
                raise ValidationError({"quantity": f"Stock insuffisant : {before} {locked.unit} disponible(s), sortie de {qty} demandée."})
            after = before - qty
        else:
            after = before + qty
    movement = StockMovement.objects.create(
        establishment=locked.establishment, item=locked, kind=kind, quantity=qty, quantity_before=before,
        quantity_after=after, date=date, supplier=supplier, reason=reason, recorded_by=user,
    )
    locked.quantity = after
    locked.save(update_fields=["quantity", "updated_at"])
    _alert_if_low(locked, before, after)
    item.quantity = after  # garde l'instance de l'appelant à jour
    return movement


def _alert_if_low(item: Item, before: Decimal, after: Decimal):
    """Notifie le directeur quand l'article passe sous (ou atteint) son seuil, une fois par article et par jour."""
    if before > item.min_threshold >= after or (after == 0 < before):
        notify_roles(
            item.establishment, [Role.DIRECTEUR], NotificationKind.GENERAL,
            "Stock bas",
            f"« {item.name} » est sous le seuil d'alerte : {after} {item.unit} restant(s) (seuil {item.min_threshold}).",
            link_type="inventory_item", link_id=str(item.pk),
            dedupe_key=f"stock-low-{item.pk}-{timezone.localdate().isoformat()}",
        )


def low_stock(qs):
    """Articles actifs dont la quantité est inférieure ou égale au seuil d'alerte."""
    from django.db.models import F

    return qs.filter(is_active=True, quantity__lte=F("min_threshold"))


def recent_window(days: int = 30):
    return timezone.localdate() - timedelta(days=days)
