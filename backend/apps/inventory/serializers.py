from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from apps.finance.numeric import NumericTenantSerializer

from . import services
from .models import Item, ItemCategory, MovementKind, StockMovement, Supplier


def _unique_name(serializer, model, value, label):
    value = value.strip()
    qs = model.objects.filter(establishment_id=serializer.context["request"].user.establishment_id, name__iexact=value)
    if serializer.instance:
        qs = qs.exclude(pk=serializer.instance.pk)
    if qs.exists():
        raise serializers.ValidationError(f"{label} porte déjà ce nom.")
    return value


class ItemCategorySerializer(NumericTenantSerializer):
    items_count = serializers.IntegerField(source="items.count", read_only=True)

    class Meta:
        model = ItemCategory
        fields = ["id", "name", "items_count"]
        read_only_fields = ["id"]

    def validate_name(self, value):
        return _unique_name(self, ItemCategory, value, "Une catégorie")


class SupplierSerializer(NumericTenantSerializer):
    class Meta:
        model = Supplier
        fields = ["id", "name", "phone", "address"]
        read_only_fields = ["id"]


class ItemSerializer(NumericTenantSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    supplier_name = serializers.CharField(source="default_supplier.name", read_only=True, default="")
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, coerce_to_string=False)
    is_low = serializers.SerializerMethodField()
    last_restocked = serializers.SerializerMethodField()
    # Création seulement : quantité de départ, enregistrée comme mouvement d'entrée « Stock initial ».
    initial_quantity = serializers.DecimalField(max_digits=12, decimal_places=2, write_only=True, required=False, min_value=Decimal("0"))

    class Meta:
        model = Item
        fields = ["id", "name", "category", "category_name", "unit", "quantity", "min_threshold", "is_low",
                  "default_supplier", "supplier_name", "last_restocked", "is_active", "initial_quantity"]
        read_only_fields = ["id"]

    def get_is_low(self, obj) -> bool:
        return obj.quantity <= obj.min_threshold

    def get_last_restocked(self, obj):
        if hasattr(obj, "last_entry"):
            return obj.last_entry
        m = obj.movements.filter(kind=MovementKind.IN).order_by("-date").first()
        return m.date if m else None

    def validate_name(self, value):
        return _unique_name(self, Item, value, "Un article")

    def validate_min_threshold(self, value):
        if value < 0:
            raise serializers.ValidationError("Le seuil d'alerte ne peut pas être négatif.")
        return value

    @transaction.atomic
    def create(self, validated):
        initial = validated.pop("initial_quantity", Decimal("0"))
        item = super().create(validated)
        if initial and initial > 0:
            services.apply_movement(
                item, MovementKind.IN, initial, user=self.context["request"].user, supplier=item.default_supplier,
                reason="Stock initial",
            )
        return item


class StockMovementSerializer(NumericTenantSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True)
    unit = serializers.CharField(source="item.unit", read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default="")
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True, default="")

    class Meta:
        model = StockMovement
        fields = ["id", "item", "item_name", "unit", "kind", "quantity", "quantity_before", "quantity_after", "date",
                  "supplier", "supplier_name", "reason", "recorded_by_name", "created_at"]
        read_only_fields = ["id", "quantity_before", "quantity_after", "created_at"]
