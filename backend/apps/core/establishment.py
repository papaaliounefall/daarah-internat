"""Identité et paramètres de l'établissement de l'utilisateur connecté."""
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record

from .models import Establishment
from .permissions import RolePermission
from .roles import ALL_ROLES, Role


class EstablishmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Establishment
        fields = [
            "id", "name", "name_ar", "slug", "city", "country", "address", "phone", "email",
            "primary_color", "accent_color", "expense_approval_threshold", "registration_prefix",
        ]
        read_only_fields = ["id", "slug", "registration_prefix"]  # le préfixe de matricule ne change jamais


class EstablishmentView(APIView):
    permission_classes = [RolePermission]
    role_access = {"get": ALL_ROLES, "patch": {Role.DIRECTEUR}}

    def get(self, request):
        return Response(EstablishmentSerializer(request.user.establishment).data)

    def patch(self, request):
        est = request.user.establishment
        ser = EstablishmentSerializer(est, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        before = {f: getattr(est, f) for f in ser.validated_data}
        ser.save()
        record(request, "UPDATE", est, changes={f: {"old": before[f], "new": getattr(est, f)} for f in before if before[f] != getattr(est, f)})
        return Response(ser.data)
