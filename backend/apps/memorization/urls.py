from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("lessons", views.LessonViewSet, basename="lesson")
router.register("revisions", views.RevisionViewSet, basename="revision")
router.register("evaluations", views.EvaluationViewSet, basename="evaluation")
router.register("quality-levels", views.QualityLevelViewSet, basename="quality-level")
router.register("evaluation-criteria", views.EvaluationCriterionViewSet, basename="evaluation-criterion")

urlpatterns = [
    path("memorization/timeline/", views.TimelineView.as_view(), name="memorization-timeline"),
    *router.urls,
]
