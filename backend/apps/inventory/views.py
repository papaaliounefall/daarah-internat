import django_filters
from django.db.models import Count, F, Max, Q, Sum
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record
from apps.core.permissions import RolePermission
from apps.core.roles import ADMIN_ROLES
from apps.core.views import AuditedMixin, NoDeleteMixin, TenantViewSetMixin

from . import services
from .models import Item, ItemCategory, MovementKind, StockMovement, Supplier
from .serializers import ItemCategorySerializer, ItemSerializer, StockMovementSerializer, SupplierSerializer

CRUD = {
    "list": ADMIN_ROLES, "retrieve": ADMIN_ROLES, "create": ADMIN_ROLES,
    "update": ADMIN_ROLES, "partial_update": ADMIN_ROLES,
}


class ItemCategoryViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    queryset = ItemCategory.objects.all()
    serializer_class = ItemCategorySerializer
    search_fields = ["name"]
    role_access = CRUD


class SupplierViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    search_fields = ["name", "phone"]
    role_access = CRUD


class ItemFilter(django_filters.FilterSet):
    low = django_filters.BooleanFilter(method="filter_low")

    class Meta:
        model = Item
        fields = ["category", "is_active", "default_supplier"]

    def filter_low(self, qs, name, value):
        low = Q(quantity__lte=F("min_threshold"))
        return qs.filter(low) if value else qs.exclude(low)


def items_qs():
    return Item.objects.select_related("category", "default_supplier").annotate(
        last_entry=Max("movements__date", filter=Q(movements__kind=MovementKind.IN))
    )


class ItemViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    """Articles. La quantité n'est JAMAIS modifiable ici : uniquement via les mouvements de stock."""

    queryset = items_qs()
    serializer_class = ItemSerializer
    filterset_class = ItemFilter
    search_fields = ["name", "category__name"]
    ordering_fields = ["name", "quantity", "min_threshold"]
    audit_exclude = ("initial_quantity",)
    role_access = CRUD


class MovementFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="date", lookup_expr="lte")

    class Meta:
        model = StockMovement
        fields = ["item", "kind", "supplier", "item__category"]


class StockMovementViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
                           mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Mouvements de stock : création, consultation. Aucun mouvement n'est modifié ni supprimé
    (correction = nouvel ajustement)."""

    queryset = StockMovement.objects.select_related("item", "supplier", "recorded_by")
    serializer_class = StockMovementSerializer
    filterset_class = MovementFilter
    search_fields = ["item__name", "reason"]
    role_access = {"list": ADMIN_ROLES, "retrieve": ADMIN_ROLES, "create": ADMIN_ROLES}

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        movement = services.apply_movement(
            d["item"], d["kind"], d["quantity"], user=request.user, date=d.get("date"),
            supplier=d.get("supplier"), reason=d.get("reason", ""),
        )
        record(request, "STOCK_MOVEMENT", movement, changes={
            "item": str(movement.item_id), "kind": movement.kind,
            "quantity": {"old": movement.quantity_before, "new": movement.quantity_after},
        })
        return Response(self.get_serializer(movement).data, status=201)


class AlertsView(APIView):
    """Articles actifs dont la quantité est inférieure ou égale au seuil d'alerte."""

    permission_classes = [RolePermission]
    role_access = {"get": ADMIN_ROLES}

    def get(self, request):
        qs = services.low_stock(items_qs().filter(establishment_id=request.user.establishment_id)).order_by("quantity", "name")
        data = ItemSerializer(qs, many=True, context={"request": request}).data
        return Response({"count": len(data), "results": data})


class SummaryView(APIView):
    """Tableau de bord des stocks."""

    permission_classes = [RolePermission]
    role_access = {"get": ADMIN_ROLES}

    def get(self, request):
        est = request.user.establishment_id
        items = Item.objects.filter(establishment_id=est)
        active = items.filter(is_active=True)
        low = Q(quantity__lte=F("min_threshold"))
        since = services.recent_window(30)
        mv = StockMovement.objects.filter(establishment_id=est, date__gte=since)
        by_cat = (
            active.values("category_id", "category__name")
            .annotate(items=Count("pk"), low_items=Count("pk", filter=low))
            .order_by("category__name")
        )
        recent = StockMovement.objects.filter(establishment_id=est).select_related("item", "recorded_by", "supplier")[:10]
        return Response({
            "total_items": items.count(),
            "active_items": active.count(),
            "low_stock_count": active.filter(low).count(),
            "out_of_stock_count": active.filter(quantity=0).count(),
            "categories": [
                {"id": str(c["category_id"]), "name": c["category__name"], "items": c["items"], "low_items": c["low_items"]}
                for c in by_cat
            ],
            "last_30_days": {
                "since": since,
                "entries": mv.filter(kind=MovementKind.IN).count(),
                "exits": mv.filter(kind=MovementKind.OUT).count(),
                "adjustments": mv.filter(kind=MovementKind.ADJUST).count(),
                "quantity_in": mv.filter(kind=MovementKind.IN).aggregate(t=Sum("quantity"))["t"] or 0,
                "quantity_out": mv.filter(kind=MovementKind.OUT).aggregate(t=Sum("quantity"))["t"] or 0,
            },
            "recent_movements": StockMovementSerializer(recent, many=True, context={"request": request}).data,
            "generated_on": timezone.localdate(),
        })
