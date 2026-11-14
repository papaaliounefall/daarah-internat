from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("staff", views.StaffViewSet, basename="staff")

urlpatterns = router.urls
