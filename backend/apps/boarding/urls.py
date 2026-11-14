from rest_framework.routers import DefaultRouter

from django.urls import path

from . import views

router = DefaultRouter()
router.register("boarding/buildings", views.BuildingViewSet, basename="boarding-building")
router.register("boarding/rooms", views.RoomViewSet, basename="boarding-room")
router.register("boarding/assignments", views.AssignmentViewSet, basename="boarding-assignment")
router.register("boarding/movements", views.MovementViewSet, basename="boarding-movement")

urlpatterns = [
    path("boarding/occupancy/", views.OccupancyView.as_view(), name="boarding-occupancy"),
    *router.urls,
]
