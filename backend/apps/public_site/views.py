import logging

from django.conf import settings
from django.http import Http404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit.services import record
from apps.core.models import Establishment
from apps.core.permissions import RolePermission
from apps.core.roles import ADMIN_ROLES, DIRECTOR_ONLY, Role
from apps.core.views import TenantViewSetMixin
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify_roles

from apps.core.views import AuditedMixin

from .models import ContactRequest, GalleryImage, NewsPost, SiteContent
from .serializers import (
    ContactRequestSerializer, GalleryImageSerializer, NewsPostSerializer, PublicContactSerializer,
    PublicVisitSerializer, SiteContentSerializer, public_site_payload,
)

logger = logging.getLogger(__name__)


def _resolve_establishment(slug: str | None) -> Establishment:
    slug = (slug or "").strip() or settings.DEFAULT_ESTABLISHMENT_SLUG
    est = Establishment.objects.filter(slug=slug, is_active=True).first()
    if est is None:
        raise Http404("Établissement introuvable.")
    return est


# ---------------------------------------------------------------------------------------------------
# Public (sans authentification)
# ---------------------------------------------------------------------------------------------------
class PublicSiteView(APIView):
    """``GET /api/public/site/?slug=`` : identité et contenu institutionnel. Jamais de données de talibés."""

    permission_classes = [AllowAny]
    authentication_classes: list = []   # un jeton invalide ne doit pas casser une page publique
    throttle_classes = [AnonRateThrottle]

    def get(self, request):
        est = _resolve_establishment(request.query_params.get("slug"))
        content = SiteContent.objects.filter(establishment=est).first()
        resp = Response(public_site_payload(est, content, request))
        resp["Cache-Control"] = "public, max-age=300"
        return resp


class PublicContactView(APIView):
    """``POST /api/public/contact/`` : demande d'information (anonyme, limitée, anti-spam)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_form"

    OK = {"detail": "Votre demande a bien été envoyée. Nous vous recontacterons dans les meilleurs délais."}

    def post(self, request):
        ser = PublicContactSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        if data.get("website"):
            # Honeypot rempli : c'est un robot. On répond comme si tout allait bien, sans rien enregistrer.
            logger.warning("Formulaire de contact : honeypot rempli, demande ignorée.")
            return Response(self.OK, status=status.HTTP_201_CREATED)
        est = _resolve_establishment(data.get("slug"))
        req = ContactRequest.objects.create(
            establishment=est, name=data["name"], phone=data.get("phone", ""), email=data.get("email", ""),
            message=data["message"],
        )
        record(request, "CONTACT_REQUEST", req)
        preview = req.message if len(req.message) <= 140 else req.message[:137] + "..."
        notify_roles(est, [Role.DIRECTEUR, Role.ASSISTANT], NotificationKind.GENERAL,
                     "Nouvelle demande d'information", f"{req.name} : {preview}",
                     link_type="contact_request", link_id=str(req.pk))
        return Response(self.OK, status=status.HTTP_201_CREATED)


class PublicVisitView(APIView):
    """``POST /api/public/visit-request/`` : demande de visite d'un futur parent (anonyme, limitée, anti-spam).

    Enregistrée dans la même boîte que les demandes d'information (``ContactRequest``, kind=VISITE)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_form"

    OK = {"detail": "Votre demande de visite a bien été envoyée. L'administration vous recontactera pour confirmer la date. "
                    "Une demande de visite n'est pas une inscription."}

    def post(self, request):
        ser = PublicVisitSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        if d.get("website"):
            return Response(self.OK, status=status.HTTP_201_CREATED)
        est = _resolve_establishment(d.get("slug"))
        req = ContactRequest.objects.create(
            establishment=est, kind="VISITE", name=d["name"], phone=d["phone"], child_name=d["child_name"],
            desired_date=d["desired_date"], message=d.get("message", ""),
        )
        record(request, "VISIT_REQUEST_PUBLIC", req)
        notify_roles(est, [Role.DIRECTEUR, Role.ASSISTANT], NotificationKind.VISIT, "Demande de visite (site public)",
                     f"{req.name} souhaite visiter le Daara le {req.desired_date:%d/%m/%Y} (enfant : {req.child_name}).",
                     link_type="contact_request", link_id=str(req.pk))
        return Response(self.OK, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------------------------------
# Privé
# ---------------------------------------------------------------------------------------------------
class SiteContentView(APIView):
    """``/api/site-content/`` : le directeur lit et modifie le contenu du portail (PUT et PATCH : mise à jour partielle)."""

    permission_classes = [RolePermission]
    role_access = {"get": DIRECTOR_ONLY, "put": DIRECTOR_ONLY, "patch": DIRECTOR_ONLY}

    def _content(self, request):
        content, _ = SiteContent.objects.get_or_create(establishment=request.user.establishment)
        return content

    def get(self, request):
        return Response(SiteContentSerializer(self._content(request), context={"request": request}).data)

    def put(self, request):
        return self.patch(request)

    def patch(self, request):
        content = self._content(request)
        ser = SiteContentSerializer(content, data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        before = {f: getattr(content, f) for f in ser.validated_data}
        ser.save()
        changes = {f: {"old": before[f], "new": getattr(content, f)} for f in before if before[f] != getattr(content, f)}
        record(request, "UPDATE", content, changes=changes, model="SiteContent")
        return Response(SiteContentSerializer(content, context={"request": request}).data)


class HeroImageView(APIView):
    """``POST /api/site-content/hero-image/`` (multipart, champ ``image``) ; ``DELETE`` retire la photo."""

    permission_classes = [RolePermission]
    role_access = {"post": DIRECTOR_ONLY, "delete": DIRECTOR_ONLY}

    def post(self, request):
        from apps.core.validators import validate_image

        f = request.FILES.get("image")
        if f is None:
            return Response({"image": ["Choisissez une image."]}, status=400)
        validate_image(f)
        content, _ = SiteContent.objects.get_or_create(establishment=request.user.establishment)
        content.hero_image = f
        content.save(update_fields=["hero_image", "updated_at"])
        record(request, "UPDATE", content, model="SiteContent", detail="photo d'accueil")
        return Response(SiteContentSerializer(content, context={"request": request}).data)

    def delete(self, request):
        content, _ = SiteContent.objects.get_or_create(establishment=request.user.establishment)
        content.hero_image = None
        content.save(update_fields=["hero_image", "updated_at"])
        record(request, "UPDATE", content, model="SiteContent", detail="photo d'accueil retirée")
        return Response(SiteContentSerializer(content, context={"request": request}).data)


class NewsPostViewSet(AuditedMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    """Actualités du site public : directeur et assistant. Le contenu éditorial peut être supprimé (audité)."""

    queryset = NewsPost.objects.all()
    serializer_class = NewsPostSerializer
    role_access = {"*": ADMIN_ROLES}
    audit_exclude = ("image",)
    filterset_fields = ["is_published"]
    search_fields = ["title", "summary"]


class GalleryImageViewSet(AuditedMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    queryset = GalleryImage.objects.all()
    serializer_class = GalleryImageSerializer
    role_access = {"*": ADMIN_ROLES}
    audit_exclude = ("image",)


class ContactRequestViewSet(TenantViewSetMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                            viewsets.GenericViewSet):
    """Demandes d'information reçues du portail public (directeur et assistant)."""

    queryset = ContactRequest.objects.select_related("processed_by")
    serializer_class = ContactRequestSerializer
    role_access = {"list": ADMIN_ROLES, "retrieve": ADMIN_ROLES, "mark_processed": ADMIN_ROLES}
    filterset_fields = ["is_processed"]
    search_fields = ["name", "email", "phone", "message"]

    @action(detail=True, methods=["post"], url_path="mark-processed")
    def mark_processed(self, request, pk=None):
        """Marque la demande comme traitée (``{"processed": false}`` la remet « à traiter »)."""
        obj = self.get_object()
        flag = request.data.get("processed", True) if hasattr(request.data, "get") else True
        processed = flag not in (False, "false", "False", "0", 0)
        obj.is_processed = processed
        obj.processed_at = timezone.now() if processed else None
        obj.processed_by = request.user if processed else None
        obj.save(update_fields=["is_processed", "processed_at", "processed_by", "updated_at"])
        record(request, "CONTACT_PROCESSED" if processed else "CONTACT_REOPENED", obj)
        return Response(self.get_serializer(obj).data)
