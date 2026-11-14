from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("academic-years", views.AcademicYearViewSet, basename="academic-year")
router.register("classes", views.ClassRoomViewSet, basename="classroom")
router.register("enrollments", views.EnrollmentViewSet, basename="enrollment")

urlpatterns = router.urls
