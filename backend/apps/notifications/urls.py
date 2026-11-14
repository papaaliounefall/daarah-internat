from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("notifications", views.NotificationViewSet, basename="notification")
router.register("announcements", views.AnnouncementViewSet, basename="announcement")

urlpatterns = router.urls
