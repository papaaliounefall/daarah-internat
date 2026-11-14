from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel


class ItemCategory(TenantModel):
    name = models.CharField(max_length=100)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "item categories"
        constraints = [models.UniqueConstraint(fields=["establishment", "name"], name="uniq_item_category")]

    def __str__(self):
        return self.name


class Supplier(TenantModel):
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=40, blank=True)
    address = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["name"]


class Item(TenantModel):
    category = models.ForeignKey(ItemCategory, on_delete=models.PROTECT, related_name="items")
    name = models.CharField(max_length=200)
    unit = models.CharField(max_length=30, default="unité")
    # Modifié UNIQUEMENT par ``services.apply_movement`` (jamais directement).
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0, editable=False)
    min_threshold = models.DecimalField("seuil d'alerte", max_digits=12, decimal_places=2, default=0)
    default_supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["category__name", "name"]
        constraints = [
            models.UniqueConstraint(fields=["establishment", "name"], name="uniq_item_name"),
            models.CheckConstraint(condition=models.Q(quantity__gte=0), name="item_qty_nonneg"),
        ]


class MovementKind(models.TextChoices):
    IN = "ENTREE", "Entrée"
    OUT = "SORTIE", "Sortie"
    ADJUST = "AJUSTEMENT", "Ajustement d'inventaire"


class StockMovement(TenantModel):
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="movements")
    kind = models.CharField(max_length=10, choices=MovementKind.choices)
    quantity = models.DecimalField(max_digits=12, decimal_places=2)  # positive ; le sens dépend du type
    # Stock avant / après le mouvement (renseignés par ``services.apply_movement``). Pour un
    # AJUSTEMENT, ``quantity`` est la quantité comptée (absolue) et l'écart se lit dans before/after.
    quantity_before = models.DecimalField(max_digits=12, decimal_places=2, editable=False, default=0)
    quantity_after = models.DecimalField(max_digits=12, decimal_places=2, editable=False)
    date = models.DateField(default=timezone.localdate)
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    reason = models.CharField(max_length=255, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-date", "-created_at"]
