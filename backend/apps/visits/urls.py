from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("visit-requests", views.VisitRequestViewSet, basename="visit-request")

urlpatterns = router.urls
