import django_filters
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.audit.services import record
from apps.core.roles import ADMIN_ROLES, Role
from apps.core.views import TenantViewSetMixin

from . import services
from .models import VisitRequest
from .serializers import (
    AcceptSerializer, ProposeSerializer, RefuseSerializer, VisitCreateSerializer, VisitRequestSerializer,
)

PARENT = {Role.PARENT}


class VisitFilter(django_filters.FilterSet):
    student = django_filters.UUIDFilter(field_name="student_id")
    guardian = django_filters.UUIDFilter(field_name="guardian_id")
    date_after = django_filters.DateFilter(field_name="requested_date", lookup_expr="gte")
    date_before = django_filters.DateFilter(field_name="requested_date", lookup_expr="lte")

    class Meta:
        model = VisitRequest
        fields = ["status", "requested_date"]


class VisitRequestViewSet(TenantViewSetMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
                          mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Demandes de visite. Jamais supprimées : annulation, refus ou clôture (statuts)."""

    queryset = VisitRequest.objects.select_related("guardian", "student", "decided_by")
    serializer_class = VisitRequestSerializer
    filterset_class = VisitFilter
    search_fields = ["student__first_name", "student__last_name", "guardian__first_name", "guardian__last_name"]
    ordering_fields = ["created_at", "requested_date", "status"]
    role_access = {
        "list": ADMIN_ROLES | PARENT, "retrieve": ADMIN_ROLES | PARENT,
        "create": PARENT, "cancel": PARENT, "accept_proposal": PARENT, "decline_proposal": PARENT,
        "accept": ADMIN_ROLES, "refuse": ADMIN_ROLES, "propose": ADMIN_ROLES,
    }

    def scope_queryset(self, qs):
        user = self.request.user
        if user.role == Role.PARENT:
            return qs.filter(guardian=user)  # un parent ne voit que SES demandes
        if user.role in ADMIN_ROLES:
            return qs
        return qs.none()  # le maître n'a aucun accès

    def _out(self, visit):
        return Response(self.get_serializer(self.get_queryset().get(pk=visit.pk)).data)

    def create(self, request, *args, **kwargs):
        ser = VisitCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        visit = services.create_visit(
            request.user, student_id=d["student"], date=d["requested_date"], time=d["requested_time"], message=d["message"],
        )
        record(request, "CREATE", visit)
        resp = self._out(visit)
        resp.status_code = 201
        return resp

    # ---- administration ----
    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        visit = self.get_object()
        ser = AcceptSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        visit = services.accept(request.user, visit.pk, reason=ser.validated_data["reason"])
        record(request, "VISIT_ACCEPT", visit)
        return self._out(visit)

    @action(detail=True, methods=["post"])
    def refuse(self, request, pk=None):
        visit = self.get_object()
        ser = RefuseSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        visit = services.refuse(request.user, visit.pk, reason=ser.validated_data["reason"])
        record(request, "VISIT_REFUSE", visit, changes={"reason": visit.reason})
        return self._out(visit)

    @action(detail=True, methods=["post"])
    def propose(self, request, pk=None):
        visit = self.get_object()
        ser = ProposeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        visit = services.propose(
            request.user, visit.pk, date=d["proposed_date"], time=d["proposed_time"], reason=d["reason"],
        )
        record(request, "VISIT_PROPOSE", visit, changes={"proposed_date": visit.proposed_date, "proposed_time": visit.proposed_time})
        return self._out(visit)

    # ---- parent ----
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        visit = services.cancel(request.user, self.get_object().pk)
        record(request, "VISIT_CANCEL", visit)
        return self._out(visit)

    @action(detail=True, methods=["post"], url_path="accept-proposal")
    def accept_proposal(self, request, pk=None):
        visit = services.accept_proposal(request.user, self.get_object().pk)
        record(request, "VISIT_ACCEPT_PROPOSAL", visit)
        return self._out(visit)

    @action(detail=True, methods=["post"], url_path="decline-proposal")
    def decline_proposal(self, request, pk=None):
        visit = services.decline_proposal(request.user, self.get_object().pk)
        record(request, "VISIT_DECLINE_PROPOSAL", visit)
        return self._out(visit)
