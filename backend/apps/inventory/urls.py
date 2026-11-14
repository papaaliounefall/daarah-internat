from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("inventory/categories", views.ItemCategoryViewSet, basename="inventory-category")
router.register("inventory/suppliers", views.SupplierViewSet, basename="inventory-supplier")
router.register("inventory/items", views.ItemViewSet, basename="inventory-item")
router.register("inventory/movements", views.StockMovementViewSet, basename="inventory-movement")

urlpatterns = [
    path("inventory/alerts/", views.AlertsView.as_view(), name="inventory-alerts"),
    path("inventory/summary/", views.SummaryView.as_view(), name="inventory-summary"),
    *router.urls,
]
