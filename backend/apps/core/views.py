"""Mixins de vues : isolation par établissement, périmètre par rôle, journalisation.

Ordre recommandé des classes de base d'un viewset :

    class XViewSet(AuditedMixin, TenantViewSetMixin, viewsets.ModelViewSet):
        permission_classes = [RolePermission]
        role_access = {...}
        queryset = X.objects.all()
        serializer_class = XSerializer

        def scope_queryset(self, qs):      # périmètre propre au rôle (maître, parent…)
            ...
"""
from rest_framework import status
from rest_framework.response import Response

from apps.audit.services import record
from apps.core.permissions import RolePermission


class TenantViewSetMixin:
    permission_classes = [RolePermission]

    def get_queryset(self):
        qs = super().get_queryset()
        # Filtre d'établissement TOUJOURS appliqué, avant tout périmètre de rôle.
        qs = qs.filter(establishment_id=self.request.user.establishment_id)
        return self.scope_queryset(qs)

    def scope_queryset(self, qs):
        return qs

    def perform_create(self, serializer):
        serializer.save(establishment=self.request.user.establishment)


class AuditedMixin:
    """Journalise création, modification (avec anciennes/nouvelles valeurs) et suppression."""

    audit_exclude = ()

    def perform_create(self, serializer):
        super().perform_create(serializer)
        record(self.request, "CREATE", serializer.instance)

    def perform_update(self, serializer):
        instance = serializer.instance
        tracked = [f for f in serializer.validated_data if f not in self.audit_exclude]
        before = {f: getattr(instance, f, None) for f in tracked}
        super().perform_update(serializer)
        instance = serializer.instance
        changes = {}
        for f in tracked:
            new = getattr(instance, f, None)
            if before[f] != new:
                changes[f] = {"old": before[f], "new": new}
        record(self.request, "UPDATE", instance, changes=changes)

    def perform_destroy(self, instance):
        record(self.request, "DELETE", instance)
        super().perform_destroy(instance)


class NoDeleteMixin:
    """Interdit la suppression définitive via l'API (corrections par nouvelle entrée / annulation)."""

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "La suppression définitive n'est pas autorisée. Utilisez l'archivage ou l'annulation."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )
