import django_filters
from django.db.models import Count, Prefetch, Q, Sum
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record
from apps.core.pagination import StandardPagination
from apps.core.permissions import RolePermission
from apps.core.roles import ADMIN_ROLES, DIRECTOR_ONLY
from apps.core.views import AuditedMixin, NoDeleteMixin, TenantViewSetMixin
from apps.students.models import Student, StudentStatus, StudentStatusChange

from . import services
from .models import Donation, Sponsor, Sponsorship, SponsorshipStatus
from .serializers import DonationSerializer, SponsorSerializer, SponsorshipSerializer


class SponsorViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    """Parrains, partenaires, donateurs. Pas de suppression (les dons et parrainages y sont rattachés)."""

    queryset = Sponsor.objects.all()
    serializer_class = SponsorSerializer
    filterset_fields = ["kind"]
    search_fields = ["name", "phone", "email", "country"]
    role_access = {
        "list": ADMIN_ROLES, "retrieve": ADMIN_ROLES,
        "create": DIRECTOR_ONLY, "update": DIRECTOR_ONLY, "partial_update": DIRECTOR_ONLY,
    }

    def get_queryset(self):
        return super().get_queryset().annotate(
            active_count=Count("sponsorships", filter=Q(sponsorships__status=SponsorshipStatus.ACTIVE))
        )


class SponsorshipViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    """Dossiers de parrainage. Directeur : écriture ; assistant : lecture. Pas de suppression (statut TERMINE)."""

    queryset = Sponsorship.objects.select_related("student", "sponsor")
    serializer_class = SponsorshipSerializer
    filterset_fields = ["student", "sponsor", "status"]
    search_fields = ["student__first_name", "student__last_name", "student__registration_number", "sponsor__name"]
    role_access = {
        "list": ADMIN_ROLES, "retrieve": ADMIN_ROLES,
        "create": DIRECTOR_ONLY, "update": DIRECTOR_ONLY, "partial_update": DIRECTOR_ONLY,
    }


class DonationFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="date", lookup_expr="lte")

    class Meta:
        model = Donation
        fields = ["sponsor", "method", "is_cancelled"]


class DonationViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    """Dons : données financières (``finance_scope``). Écriture réservée au directeur ; jamais modifiés ni supprimés."""

    finance_scope = True
    queryset = Donation.objects.select_related("sponsor", "recorded_by", "cancelled_by")
    serializer_class = DonationSerializer
    filterset_class = DonationFilter
    search_fields = ["donor_name", "receipt_number", "purpose", "sponsor__name"]
    audit_exclude = ("attachment",)
    http_method_names = ["get", "post", "head", "options"]
    role_access = {"list": ADMIN_ROLES, "retrieve": ADMIN_ROLES, "create": DIRECTOR_ONLY, "cancel": DIRECTOR_ONLY}

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        donation = services.record_donation(
            user=request.user, sponsor=d.get("sponsor"), donor_name=d.get("donor_name", ""),
            donor_phone=d.get("donor_phone", ""), amount=d["amount"], date=d.get("date"), purpose=d.get("purpose", ""),
            method=d.get("method", "ESPECES"), attachment=d.get("attachment"),
        )
        record(request, "DONATION_CREATE", donation, changes={"amount": donation.amount, "receipt_number": donation.receipt_number})
        return Response(self.get_serializer(donation).data, status=201)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Annule le don (statut conservé, motif obligatoire) ; il sort des recettes."""
        donation = services.cancel_donation(self.get_object(), user=request.user, reason=request.data.get("reason"))
        record(request, "DONATION_CANCEL", donation, changes={"reason": donation.cancel_reason})
        return Response(self.get_serializer(donation).data)


class OverviewView(APIView):
    """Talibés sociaux vs payants, parrains actifs et historique des changements de statut. Lecture seule."""

    permission_classes = [RolePermission]
    role_access = {"get": ADMIN_ROLES}

    def get(self, request):
        est_id = request.user.establishment_id
        params = request.query_params
        base = Student.objects.filter(establishment_id=est_id)
        if params.get("include_archived") != "true":
            base = base.filter(is_archived=False)

        active_sp = Sponsorship.objects.filter(establishment_id=est_id, status=SponsorshipStatus.ACTIVE)
        counts = base.aggregate(
            social=Count("pk", filter=Q(status=StudentStatus.SOCIAL)),
            paying=Count("pk", filter=Q(status=StudentStatus.PAYANT)),
        )
        sponsored_social = base.filter(status=StudentStatus.SOCIAL, sponsorships__status=SponsorshipStatus.ACTIVE).distinct().count()
        summary = {
            "social_count": counts["social"],
            "paying_count": counts["paying"],
            "sponsored_social_count": sponsored_social,
            "social_without_sponsor_count": counts["social"] - sponsored_social,
            "active_sponsorships": active_sp.count(),
            "total_monthly_sponsorship": active_sp.aggregate(t=Sum("monthly_amount"))["t"] or 0,
        }

        qs = base
        status = params.get("status")
        if status:
            if status not in StudentStatus.values:
                raise ValidationError({"status": "Statut invalide (PAYANT ou SOCIAL)."})
            qs = qs.filter(status=status)
        sponsored = params.get("sponsored")
        if sponsored in ("true", "false"):
            has = Q(sponsorships__status=SponsorshipStatus.ACTIVE)
            qs = qs.filter(has).distinct() if sponsored == "true" else qs.exclude(pk__in=base.filter(has).values("pk"))
        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search) | Q(last_name__icontains=search) | Q(registration_number__icontains=search)
            )
        qs = qs.prefetch_related(
            Prefetch("sponsorships", queryset=active_sp.select_related("sponsor"), to_attr="active_sponsorships"),
            Prefetch("status_changes", queryset=StudentStatusChange.objects.select_related("changed_by"), to_attr="history"),
        ).order_by("last_name", "first_name")

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        results = [self._row(s) for s in page]
        response = paginator.get_paginated_response(results)
        response.data["summary"] = summary
        return response

    @staticmethod
    def _row(s):
        return {
            "id": str(s.pk),
            "registration_number": s.registration_number,
            "full_name": s.full_name,
            "status": s.status,
            "sponsors": [
                {"sponsorship_id": str(sp.pk), "sponsor_id": str(sp.sponsor_id), "sponsor_name": sp.sponsor.name,
                 "monthly_amount": sp.monthly_amount, "start_date": sp.start_date}
                for sp in s.active_sponsorships
            ],
            "status_changes": [
                {"from_status": c.from_status, "to_status": c.to_status, "reason": c.reason,
                 "effective_date": c.effective_date, "changed_by_name": c.changed_by.full_name if c.changed_by else ""}
                for c in s.history
            ],
        }
