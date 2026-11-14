from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.services import record
from apps.core.roles import ADMIN_ROLES, DIRECTOR_ONLY, Role
from apps.core.views import AuditedMixin, NoDeleteMixin, TenantViewSetMixin

from . import services
from .models import StaffMember
from .serializers import (
    SENSITIVE_FIELDS, StaffDocumentSerializer, StaffMemberLimitedSerializer, StaffMemberSerializer,
    StaffPositionSerializer,
)


class StaffViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    """Dossiers du personnel.

    Directeur : tout. Assistant : lecture de nom / fonction / téléphone / statut. Maître et parent : aucun accès.
    Pas de suppression : un départ passe le statut à « PARTI » (action ``leave``).
    """

    queryset = StaffMember.objects.select_related("user")
    serializer_class = StaffMemberSerializer
    filterset_fields = ["category", "status"]
    search_fields = ["full_name", "role_title", "phone"]
    ordering_fields = ["full_name", "hire_date"]
    audit_exclude = SENSITIVE_FIELDS  # valeurs sensibles jamais copiées dans le journal
    role_access = {
        "list": ADMIN_ROLES, "retrieve": ADMIN_ROLES,
        "create": DIRECTOR_ONLY, "update": DIRECTOR_ONLY, "partial_update": DIRECTOR_ONLY, "leave": DIRECTOR_ONLY,
        "positions": DIRECTOR_ONLY, "add_position": DIRECTOR_ONLY,
        "documents": DIRECTOR_ONLY, "add_document": DIRECTOR_ONLY,
    }

    def get_serializer_class(self):
        if self.action in ("list", "retrieve") and getattr(self.request.user, "role", None) != Role.DIRECTEUR:
            return StaffMemberLimitedSerializer
        return StaffMemberSerializer

    def perform_update(self, serializer):
        touched = [f for f in SENSITIVE_FIELDS if f in serializer.validated_data]
        super().perform_update(serializer)
        if touched:  # on journalise le fait, pas la valeur
            record(self.request, "UPDATE_SENSITIVE", serializer.instance, changes={"fields": touched})

    @action(detail=True, methods=["post"])
    def leave(self, request, pk=None):
        """Départ du membre du personnel (dossier conservé)."""
        staff = self.get_object()
        if staff.status == "PARTI":
            raise ValidationError({"detail": "Ce membre du personnel est déjà parti."})
        end = request.data.get("end_date")
        end = serializers.DateField().run_validation(end) if end else None
        if end and end < staff.hire_date:
            raise ValidationError({"end_date": "La date de fin ne peut pas précéder la date d'entrée."})
        services.leave(staff, end_date=end)
        record(request, "STAFF_LEAVE", staff)
        return Response(self.get_serializer(staff).data)

    @action(detail=True, methods=["get"])
    def positions(self, request, pk=None):
        staff = self.get_object()
        return Response(StaffPositionSerializer(staff.positions.all(), many=True, context={"request": request}).data)

    @positions.mapping.post
    def add_position(self, request, pk=None):
        """Nouvelle fonction : clôture la précédente et met à jour la fonction du dossier."""
        staff = self.get_object()
        ser = StaffPositionSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        position = services.open_position(staff, d["role_title"], start_date=d.get("start_date"), note=d.get("note", ""))
        record(request, "STAFF_POSITION", position, changes={"staff": str(staff.pk), "role_title": position.role_title})
        return Response(StaffPositionSerializer(position, context={"request": request}).data, status=201)

    @action(detail=True, methods=["get"])
    def documents(self, request, pk=None):
        staff = self.get_object()
        return Response(StaffDocumentSerializer(staff.documents.all(), many=True, context={"request": request}).data)

    @documents.mapping.post
    def add_document(self, request, pk=None):
        staff = self.get_object()
        ser = StaffDocumentSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        doc = ser.save(establishment=request.user.establishment, staff=staff)
        record(request, "STAFF_DOCUMENT_ADD", doc, changes={"staff": str(staff.pk)})
        return Response(StaffDocumentSerializer(doc, context={"request": request}).data, status=201)
