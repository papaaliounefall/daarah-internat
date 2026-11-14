import django_filters
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.services import record
from apps.core.roles import ADMIN_ROLES, ALL_ROLES, STAFF_ROLES, Role
from apps.core.views import TenantViewSetMixin
from apps.students.selectors import student_ids_for

from . import selectors, services
from .models import AttendanceRecord
from .serializers import AttendanceBulkSerializer, AttendanceCreateSerializer, AttendanceRecordSerializer


class AttendanceFilter(django_filters.FilterSet):
    date_after = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    date_before = django_filters.DateFilter(field_name="date", lookup_expr="lte")
    classroom = django_filters.UUIDFilter(field_name="classroom_id")
    student = django_filters.UUIDFilter(field_name="student_id")

    class Meta:
        model = AttendanceRecord
        fields = ["date", "status", "period"]


class AttendanceViewSet(TenantViewSetMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
                        mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Pointages. Aucune suppression ni modification directe : une correction est un nouvel upsert (audité)."""

    queryset = AttendanceRecord.objects.select_related("student", "classroom", "recorded_by")
    serializer_class = AttendanceRecordSerializer
    filterset_class = AttendanceFilter
    search_fields = ["student__first_name", "student__last_name", "student__registration_number"]
    ordering_fields = ["date", "student__last_name", "status"]
    role_access = {
        "list": ALL_ROLES, "retrieve": ALL_ROLES,           # parent : ses enfants uniquement (scope_queryset)
        "create": STAFF_ROLES, "bulk": STAFF_ROLES,         # directeur, assistant, maître (ses classes)
        "stats": STAFF_ROLES, "monthly_report": STAFF_ROLES,
    }

    def scope_queryset(self, qs):
        user = self.request.user
        if user.role in ADMIN_ROLES:
            return qs
        return qs.filter(student_id__in=student_ids_for(user))  # maître : ses classes ; parent : ses enfants

    # ---- saisie ------------------------------------------------------------------------
    def _save(self, request, *, items, data):
        classroom = services.resolve_classroom(request.user, data["classroom"]) if data.get("classroom") else None
        date = data.get("date") or timezone.localdate()
        results = services.upsert_records(request.user, items=items, date=date, period=data["period"], classroom=classroom)
        changed = 0
        for r in results:
            if r.created:
                continue
            new = {"status": r.record.status, "reason": r.record.reason}
            if r.old != new:
                changed += 1
                record(request, "UPDATE", r.record, changes={k: {"old": r.old[k], "new": new[k]} for k in new if r.old[k] != new[k]})
        created = sum(1 for r in results if r.created)
        record(
            request, "ATTENDANCE_UPSERT", model="AttendanceRecord",
            detail=f"{date.isoformat()} {data['period']} : {created} créés, {changed} corrigés, {len(results) - created - changed} inchangés",
        )
        return results, created, changed

    def create(self, request, *args, **kwargs):
        ser = AttendanceCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        results, created, _ = self._save(
            request, items=[{"student": d["student"], "status": d["status"], "reason": d.get("reason", "")}], data=d
        )
        out = AttendanceRecordSerializer(results[0].record, context=self.get_serializer_context()).data
        return Response(out, status=201 if created else 200)

    @action(detail=False, methods=["post"])
    def bulk(self, request):
        """Pointage d'une classe en une requête : upsert par (talibé, date, période)."""
        ser = AttendanceBulkSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        results, created, changed = self._save(request, items=[dict(i) for i in d["records"]], data=d)
        records = AttendanceRecordSerializer(
            [r.record for r in results], many=True, context=self.get_serializer_context()
        ).data
        return Response(
            {"created": created, "updated": changed, "unchanged": len(results) - created - changed, "records": records},
            status=201 if created else 200,
        )

    # ---- statistiques --------------------------------------------------------------------
    def _month_queryset(self, request):
        label, first, last = selectors.parse_month(request.query_params.get("month"))
        qs = self.get_queryset().filter(date__gte=first, date__lte=last)
        classroom = None
        if request.query_params.get("classroom"):
            classroom = services.resolve_classroom(request.user, _uuid(request.query_params["classroom"]))
            qs = qs.filter(classroom=classroom)
        return label, first, last, qs, classroom

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Compteurs et taux de présence du mois, par jour et (sans filtre de classe) par classe."""
        label, _, _, qs, classroom = self._month_queryset(request)
        data = selectors.stats(qs, classroom)
        return Response({"month": label, **data})

    @action(detail=False, methods=["get"], url_path="monthly-report")
    def monthly_report(self, request):
        """Comptes mensuels par talibé pour une classe (``classroom`` obligatoire)."""
        if not request.query_params.get("classroom"):
            raise ValidationError({"classroom": "Précisez la classe (paramètre « classroom »)."})
        _, first, last, qs, classroom = self._month_queryset(request)
        return Response(selectors.monthly_report(qs, classroom, first, last))


def _uuid(raw):
    import uuid

    try:
        return uuid.UUID(raw)
    except ValueError:
        from rest_framework.exceptions import NotFound

        raise NotFound("Classe introuvable.") from None
