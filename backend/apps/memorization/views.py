import datetime
import uuid

import django_filters
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record
from apps.core.pagination import StandardPagination
from apps.core.permissions import RolePermission
from apps.core.roles import ADMIN_ROLES, ALL_ROLES, Role
from apps.core.views import AuditedMixin, NoDeleteMixin, TenantViewSetMixin
from apps.students.models import Student
from apps.students.selectors import student_ids_for, student_scope

from . import services
from .models import Evaluation, EvaluationCriterion, Lesson, QualityLevel, Revision
from .serializers import (
    EvaluationCorrectionSerializer, EvaluationCriterionSerializer, EvaluationFamilySerializer, EvaluationSerializer,
    LessonCorrectionSerializer, LessonFamilySerializer, LessonSerializer, QualityLevelSerializer,
    RevisionCorrectionSerializer, RevisionFamilySerializer, RevisionSerializer,
)

WRITERS = {Role.MAITRE, Role.DIRECTEUR}  # saisie et correction : maître (périmètre) et directeur


# ---------------------------------------------------------------- filtres ----------------
class _VersionedFilter(django_filters.FilterSet):
    student = django_filters.UUIDFilter(field_name="student_id")
    teacher = django_filters.UUIDFilter(field_name="teacher_id")
    date_after = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    date_before = django_filters.DateFilter(field_name="date", lookup_expr="lte")


class LessonFilter(_VersionedFilter):
    surah = django_filters.NumberFilter(field_name="surah_id")
    classroom = django_filters.UUIDFilter(field_name="classroom_id")

    class Meta:
        model = Lesson
        fields = ["date", "quality"]


class RevisionFilter(_VersionedFilter):
    surah = django_filters.NumberFilter(field_name="surah_id")

    class Meta:
        model = Revision
        fields = ["date", "quality"]


class EvaluationFilter(_VersionedFilter):
    class Meta:
        model = Evaluation
        fields = ["date"]


# ---------------------------------------------------------------- vues versionnées -------
class VersionedViewSet(AuditedMixin, TenantViewSetMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
                       mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Création + lecture + ``correct``. Ni PUT/PATCH ni DELETE : jamais d'écrasement ni de suppression."""

    family_serializer_class = None
    correction_serializer_class = None
    create_service = None
    correct_service = None
    ordering_fields = ["date", "created_at"]
    role_access = {
        "list": ALL_ROLES, "retrieve": ALL_ROLES, "create": WRITERS, "correct": WRITERS,
    }

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        include_history = self.request.query_params.get("include_history", "").lower() in ("1", "true")
        if user.role == Role.PARENT or (self.action == "list" and not include_history):
            qs = qs.filter(is_current=True)
        return qs

    def scope_queryset(self, qs):
        user = self.request.user
        if user.role in ADMIN_ROLES:
            return qs
        return qs.filter(student_id__in=student_ids_for(user))  # maître : ses classes ; parent : ses enfants

    def get_serializer_class(self):
        if getattr(self, "swagger_fake_view", False):  # génération du schéma OpenAPI
            return self.serializer_class
        if self.request.user.role == Role.PARENT:
            return self.family_serializer_class
        if self.action == "correct":
            return self.correction_serializer_class
        return self.serializer_class

    def perform_create(self, serializer):
        obj = type(self).create_service(self.request.user, dict(serializer.validated_data))
        serializer.instance = obj
        record(self.request, "CREATE", obj)

    @action(detail=True, methods=["post"])
    def correct(self, request, pk=None):
        """Crée une nouvelle ligne qui remplace l'ancienne (conservée, ``is_current=False``). Motif obligatoire."""
        old = self.get_object()
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        reason = data.pop("correction_reason")
        new = type(self).correct_service(request.user, old, data, reason)
        record(request, "CORRECT", new, changes={"supersedes": old.pk, "correction_reason": reason})
        return Response(self.serializer_class(new, context=self.get_serializer_context()).data, status=201)


class LessonViewSet(VersionedViewSet):
    queryset = Lesson.objects.select_related("student", "teacher", "surah", "classroom")
    serializer_class = LessonSerializer
    family_serializer_class = LessonFamilySerializer
    correction_serializer_class = LessonCorrectionSerializer
    filterset_class = LessonFilter
    create_service = staticmethod(services.create_lesson)
    correct_service = staticmethod(services.correct_lesson)


class RevisionViewSet(VersionedViewSet):
    queryset = Revision.objects.select_related("student", "teacher", "surah")
    serializer_class = RevisionSerializer
    family_serializer_class = RevisionFamilySerializer
    correction_serializer_class = RevisionCorrectionSerializer
    filterset_class = RevisionFilter
    create_service = staticmethod(services.create_revision)
    correct_service = staticmethod(services.correct_revision)


class EvaluationViewSet(VersionedViewSet):
    queryset = Evaluation.objects.select_related("student", "teacher").prefetch_related("scores__criterion")
    serializer_class = EvaluationSerializer
    family_serializer_class = EvaluationFamilySerializer
    correction_serializer_class = EvaluationCorrectionSerializer
    filterset_class = EvaluationFilter
    create_service = staticmethod(services.create_evaluation)
    correct_service = staticmethod(services.correct_evaluation)


# ---------------------------------------------------------------- configuration ----------
class QualityLevelViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    """Niveaux de qualité configurables par le directeur (désactivation plutôt que suppression)."""

    queryset = QualityLevel.objects.all()
    serializer_class = QualityLevelSerializer
    role_access = {
        "list": ALL_ROLES, "retrieve": ALL_ROLES,
        "create": {Role.DIRECTEUR}, "update": {Role.DIRECTEUR}, "partial_update": {Role.DIRECTEUR},
    }
    filterset_fields = ["is_active"]

    def perform_create(self, serializer):
        if "rank" not in serializer.validated_data:
            last = QualityLevel.objects.filter(establishment=self.request.user.establishment).order_by("-rank").first()
            serializer.validated_data["rank"] = (last.rank + 1) if last else 0
        super().perform_create(serializer)


class EvaluationCriterionViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    queryset = EvaluationCriterion.objects.all()
    serializer_class = EvaluationCriterionSerializer
    role_access = {
        "list": ALL_ROLES, "retrieve": ALL_ROLES,
        "create": {Role.DIRECTEUR}, "update": {Role.DIRECTEUR}, "partial_update": {Role.DIRECTEUR},
    }
    filterset_fields = ["is_active"]


# ---------------------------------------------------------------- chronologie ------------
TIMELINE_TYPES = {
    "LESSON": (Lesson, LessonSerializer, LessonFamilySerializer),
    "REVISION": (Revision, RevisionSerializer, RevisionFamilySerializer),
    "EVALUATION": (Evaluation, EvaluationSerializer, EvaluationFamilySerializer),
}


def _date_param(request, name):
    raw = request.query_params.get(name)
    if not raw:
        return None
    try:
        return datetime.date.fromisoformat(raw)
    except ValueError:
        raise ValidationError({name: "Date invalide (format AAAA-MM-JJ)."}) from None


class TimelineView(APIView):
    """Chronologie fusionnée leçons + révisions + évaluations d'un talibé (plus récent d'abord)."""

    permission_classes = [RolePermission]
    role_access = {"get": ALL_ROLES}

    def get(self, request):
        user = request.user
        sid = request.query_params.get("student")
        if not sid:
            raise ValidationError({"student": "Précisez le talibé (paramètre « student »)."})
        try:
            sid = uuid.UUID(sid)
        except ValueError:
            raise NotFound("Talibé introuvable.") from None
        student = student_scope(Student.objects.filter(establishment_id=user.establishment_id), user).filter(pk=sid).first()
        if student is None:
            raise NotFound("Talibé introuvable.")

        wanted = [t.strip().upper() for t in request.query_params.get("type", "").split(",") if t.strip()]
        unknown = [t for t in wanted if t not in TIMELINE_TYPES]
        if unknown:
            raise ValidationError({"type": f"Type inconnu : {', '.join(unknown)} (LESSON, REVISION, EVALUATION)."})
        types = wanted or list(TIMELINE_TYPES)
        after, before = _date_param(request, "date_after"), _date_param(request, "date_before")
        surah = request.query_params.get("surah")
        if surah:
            try:
                surah = int(surah)
            except ValueError:
                raise ValidationError({"surah": "Doit être un nombre entier."}) from None
        teacher = request.query_params.get("teacher")
        history = request.query_params.get("include_history", "").lower() in ("1", "true") and user.role != Role.PARENT

        rows = []
        for kind in types:
            model, staff_ser, family_ser = TIMELINE_TYPES[kind]
            if surah and kind == "EVALUATION":
                continue  # une évaluation ne porte pas sur une sourate précise
            qs = model.objects.filter(establishment_id=user.establishment_id, student=student)
            if not history:
                qs = qs.filter(is_current=True)
            if after:
                qs = qs.filter(date__gte=after)
            if before:
                qs = qs.filter(date__lte=before)
            if surah:
                qs = qs.filter(surah_id=surah)
            if teacher:
                qs = qs.filter(teacher_id=teacher)
            qs = qs.select_related("student", "teacher")
            if kind != "EVALUATION":
                qs = qs.select_related("surah")
            else:
                qs = qs.prefetch_related("scores__criterion")
            serializer_class = family_ser if user.role == Role.PARENT else staff_ser
            rows.extend((o.date, o.created_at, kind, serializer_class, o) for o in qs)
        rows.sort(key=lambda r: (r[0], r[1]), reverse=True)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(rows, request)
        ctx = {"request": request}
        data = []
        for _, _, kind, serializer_class, obj in page:
            item = dict(serializer_class(obj, context=ctx).data)
            item["type"] = kind
            data.append(item)
        return paginator.get_paginated_response(data)
