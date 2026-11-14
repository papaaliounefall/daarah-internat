import logging

import django_filters
from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.audit.services import record
from apps.core.roles import ADMIN_ROLES, ALL_ROLES
from apps.core.views import TenantViewSetMixin

from .models import Announcement, Notification, NotificationKind
from .serializers import AnnouncementSerializer, NotificationSerializer
from .tasks import broadcast_announcement

logger = logging.getLogger(__name__)


class NotificationFilter(django_filters.FilterSet):
    unread = django_filters.BooleanFilter(method="filter_unread")
    kind = django_filters.ChoiceFilter(choices=NotificationKind.choices)

    class Meta:
        model = Notification
        fields = ["kind", "link_type"]

    def filter_unread(self, qs, name, value):
        return qs.filter(read_at__isnull=True) if value else qs.filter(read_at__isnull=False)


class NotificationViewSet(TenantViewSetMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                          viewsets.GenericViewSet):
    """Notifications de l'utilisateur connecté, et seulement les siennes (celles d'autrui : 404)."""

    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    filterset_class = NotificationFilter
    ordering_fields = ["created_at"]
    role_access = {"list": ALL_ROLES, "retrieve": ALL_ROLES, "unread_count": ALL_ROLES, "read": ALL_ROLES,
                   "read_all": ALL_ROLES}

    def scope_queryset(self, qs):
        return qs.filter(recipient=self.request.user)

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        qs = self.get_queryset().filter(read_at__isnull=True)
        kind = request.query_params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)
        return Response({"count": qs.count()})

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        notif = self.get_object()
        if notif.read_at is None:
            notif.read_at = timezone.now()
            notif.save(update_fields=["read_at", "updated_at"])
        return Response(self.get_serializer(notif).data)

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        qs = self.get_queryset().filter(read_at__isnull=True)
        kind = request.data.get("kind") if hasattr(request.data, "get") else None
        if kind:
            qs = qs.filter(kind=kind)
        now = timezone.now()
        return Response({"updated": qs.update(read_at=now, updated_at=now)})


class AnnouncementViewSet(TenantViewSetMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
                          mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Informations importantes du Daara.

    Création : directeur et assistant (opérations administratives courantes, cahier des charges §4.2).
    Lecture : tous les rôles, limitée aux annonces dont l'audience les concerne (administration : tout).
    Pas de modification ni de suppression : une correction = une nouvelle annonce.
    """

    queryset = Announcement.objects.select_related("created_by")
    serializer_class = AnnouncementSerializer
    role_access = {"list": ALL_ROLES, "retrieve": ALL_ROLES, "create": ADMIN_ROLES}

    def scope_queryset(self, qs):
        user = self.request.user
        if user.role in ADMIN_ROLES:
            return qs
        # ``audience`` est une liste JSON : filtrage en Python (faible volume), indépendant du SGBD.
        ids = [a.pk for a in qs if not a.audience or user.role in a.audience]
        return qs.filter(pk__in=ids)

    def perform_create(self, serializer):
        with transaction.atomic():
            serializer.save(establishment=self.request.user.establishment, created_by=self.request.user)
            ann = serializer.instance
            record(self.request, "CREATE", ann, changes={"audience": ann.audience or "tous"})
            transaction.on_commit(lambda: self._broadcast(str(ann.pk)))

    @staticmethod
    def _broadcast(announcement_id):
        try:
            broadcast_announcement.delay(announcement_id)
        except Exception:  # noqa: BLE001 - broker indisponible : diffusion immédiate, l'annonce reste enregistrée
            logger.exception("Broker indisponible : diffusion synchrone de l'annonce %s", announcement_id)
            broadcast_announcement.apply(args=(announcement_id,))
