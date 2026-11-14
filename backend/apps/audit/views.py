from rest_framework import mixins, serializers, viewsets

from apps.core.roles import Role
from apps.core.views import TenantViewSetMixin

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = ["id", "created_at", "user_name", "user_role", "action", "model", "object_id", "object_repr", "changes", "ip_address"]
        read_only_fields = fields


class AuditLogViewSet(TenantViewSetMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Lecture seule, réservée au directeur."""

    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    role_access = {"list": {Role.DIRECTEUR}, "retrieve": {Role.DIRECTEUR}}
    filterset_fields = ["action", "model", "user"]
    search_fields = ["user_name", "object_repr", "action"]
