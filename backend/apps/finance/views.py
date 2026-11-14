import datetime
import uuid
from decimal import Decimal

import django_filters
from django.db.models import F, Q
from django.utils import timezone
from rest_framework import generics, mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import AcademicYear
from apps.audit.services import record
from apps.core.permissions import RolePermission
from apps.core.roles import ADMIN_ROLES, DIRECTOR_ONLY, Role
from apps.core.views import AuditedMixin, NoDeleteMixin, TenantViewSetMixin
from apps.students.models import Student

from . import reports, services
from .models import Due, Expense, FeeSchedule, Payment, StudentDiscount
from .serializers import (
    DueSerializer, ExpenseSerializer, FeeScheduleSerializer, GenerateDuesSerializer, ParentPaymentSerializer,
    PaymentSerializer, StudentDiscountSerializer,
)


class FinanceMixin:
    """Toutes les vues financières : un assistant n'y accède que si ``can_view_finance`` lui a été accordé."""

    finance_scope = True


class FeeScheduleViewSet(FinanceMixin, AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    """Grille des frais. Écriture : directeur. Modifier un montant ne change pas les échéances déjà générées."""

    queryset = FeeSchedule.objects.select_related("academic_year")
    serializer_class = FeeScheduleSerializer
    filterset_fields = ["academic_year", "kind", "applies_to", "is_active"]
    search_fields = ["name"]
    role_access = {
        "list": ADMIN_ROLES, "retrieve": ADMIN_ROLES,
        "create": DIRECTOR_ONLY, "update": DIRECTOR_ONLY, "partial_update": DIRECTOR_ONLY,
    }


class StudentDiscountViewSet(FinanceMixin, AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    """Réductions accordées. Créées et approuvées par le directeur ; désactivables, jamais supprimées."""

    queryset = StudentDiscount.objects.select_related("student", "approved_by")
    serializer_class = StudentDiscountSerializer
    filterset_fields = ["student", "academic_year", "kind", "is_active"]
    search_fields = ["student__first_name", "student__last_name", "student__registration_number", "label"]
    role_access = {
        "list": ADMIN_ROLES, "retrieve": ADMIN_ROLES,
        "create": DIRECTOR_ONLY, "update": DIRECTOR_ONLY, "partial_update": DIRECTOR_ONLY,
    }

    def perform_create(self, serializer):
        serializer.save(establishment=self.request.user.establishment, approved_by=self.request.user)
        record(self.request, "CREATE", serializer.instance)


class DueFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(
        choices=[("PAYEE", "Payée"), ("PARTIELLE", "Partielle"), ("IMPAYEE", "Impayée"), ("ANNULEE", "Annulée")],
        method="filter_status",
    )
    overdue = django_filters.BooleanFilter(method="filter_overdue")
    due_from = django_filters.DateFilter(field_name="due_date", lookup_expr="gte")
    due_to = django_filters.DateFilter(field_name="due_date", lookup_expr="lte")

    class Meta:
        model = Due
        fields = ["student", "academic_year", "kind", "is_cancelled", "fee_schedule"]

    def filter_status(self, qs, name, value):
        if value == "ANNULEE":
            return qs.filter(is_cancelled=True)
        qs = qs.filter(is_cancelled=False)
        if value == "PAYEE":
            return qs.filter(paid__gte=F("amount"))
        if value == "PARTIELLE":
            return qs.filter(paid__gt=0, paid__lt=F("amount"))
        return qs.filter(paid=0)

    def filter_overdue(self, qs, name, value):
        late = Q(is_cancelled=False, due_date__lt=timezone.localdate(), paid__lt=F("amount"))
        return qs.filter(late) if value else qs.exclude(late)


class DueViewSet(FinanceMixin, AuditedMixin, NoDeleteMixin, TenantViewSetMixin, mixins.CreateModelMixin,
                 mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Échéances. ``generate`` crée les mensualités ; ``create`` ajoute un frais exceptionnel ponctuel."""

    queryset = Due.objects.select_related("student")
    serializer_class = DueSerializer
    filterset_class = DueFilter
    search_fields = ["student__first_name", "student__last_name", "student__registration_number", "label"]
    ordering_fields = ["due_date", "amount"]
    role_access = {
        "list": ADMIN_ROLES, "retrieve": ADMIN_ROLES,
        "create": DIRECTOR_ONLY, "generate": DIRECTOR_ONLY, "cancel": DIRECTOR_ONLY,
    }

    def get_queryset(self):
        return services.annotate_dues(super().get_queryset())

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Génère (idempotent) les échéances de l'année. Corps facultatif :
        ``academic_year``, ``fee_schedules`` [ids], ``students`` [ids], ``from_month``/``to_month`` (AAAA-MM)."""
        ser = GenerateDuesSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        year = d.get("academic_year") or AcademicYear.objects.filter(establishment=request.user.establishment, is_current=True).first()
        if year is None:
            raise ValidationError({"academic_year": "Aucune année scolaire active : précisez l'année."})

        def month(v):
            return datetime.date(int(v[:4]), int(v[5:7]), 1) if v else None

        result = services.generate_dues(
            user=request.user, academic_year=year, schedules=d.get("fee_schedules"), students=d.get("students"),
            from_month=month(d.get("from_month")), to_month=month(d.get("to_month")),
        )
        record(request, "DUES_GENERATE", model="Due", detail=f"{result['created']} échéances créées, année {year.name}")
        return Response({"academic_year": str(year.pk), **result})

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        due = services.cancel_due(self.get_object(), reason=request.data.get("reason"))
        record(request, "DUE_CANCEL", due, changes={"reason": str(request.data.get("reason"))[:255]})
        return Response(self.get_serializer(self.get_queryset().get(pk=due.pk)).data)


class ArrearsView(FinanceMixin, APIView):
    """Impayés et dettes par talibé. Filtres : ``academic_year`` (défaut : année active, ``all`` = toutes),
    ``student``, ``overdue_only`` (défaut true : échéances échues seulement), ``min_balance``."""

    permission_classes = [RolePermission]
    role_access = {"get": ADMIN_ROLES}

    def get(self, request):
        est = request.user.establishment
        p = request.query_params
        year = None
        if p.get("academic_year") != "all":
            if p.get("academic_year"):
                year = AcademicYear.objects.filter(pk=_uuid(p["academic_year"], "academic_year"), establishment=est).first()
                if year is None:
                    raise ValidationError({"academic_year": "Année introuvable."})
            else:
                year = AcademicYear.objects.filter(establishment=est, is_current=True).first()
        student = None
        if p.get("student"):
            student = Student.objects.filter(pk=_uuid(p["student"], "student"), establishment=est).first()
            if student is None:
                raise ValidationError({"student": "Talibé introuvable."})
        rows = reports.arrears_rows(
            est, academic_year=year, student=student, overdue_only=p.get("overdue_only", "true") != "false",
            with_dues=student is not None,
        )
        if p.get("min_balance"):
            try:
                rows = [r for r in rows if r["balance"] >= Decimal(p["min_balance"])]
            except Exception:  # noqa: BLE001
                raise ValidationError({"min_balance": "Montant invalide."})
        return Response({
            "count": len(rows), "total_balance": sum((r["balance"] for r in rows), Decimal("0")),
            "academic_year": str(year.pk) if year else None, "results": rows,
        })


def _uuid(value, field):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise ValidationError({field: "Identifiant invalide."})


class PaymentFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="date", lookup_expr="lte")

    class Meta:
        model = Payment
        fields = ["student", "due", "status", "method", "fee_kind", "recorded_by"]


class PaymentViewSet(FinanceMixin, AuditedMixin, NoDeleteMixin, TenantViewSetMixin, mixins.CreateModelMixin,
                     mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Paiements. Ni modification ni suppression : correction = annulation avec motif (directeur) + nouveau paiement.

    Aucune intégration Wave / Orange Money : seule la référence de transaction saisie est enregistrée."""

    queryset = Payment.objects.select_related("student", "due", "recorded_by", "cancelled_by")
    serializer_class = PaymentSerializer
    filterset_class = PaymentFilter
    search_fields = ["receipt_number", "student__first_name", "student__last_name", "student__registration_number", "reference"]
    ordering_fields = ["date", "amount", "receipt_number", "created_at"]
    role_access = {"list": ADMIN_ROLES, "retrieve": ADMIN_ROLES, "create": ADMIN_ROLES, "cancel": DIRECTOR_ONLY}

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        payment = services.record_payment(
            user=request.user, student=d["student"], amount=d["amount"], method=d.get("method"), date=d.get("date"),
            reference=d.get("reference", ""), notes=d.get("notes", ""), due=d.get("due"), fee_kind=d.get("fee_kind"),
            period_label=d.get("period_label", ""),
        )
        record(request, "PAYMENT_CREATE", payment, changes={
            "receipt_number": payment.receipt_number, "amount": payment.amount, "student": str(payment.student_id),
        })
        return Response(self.get_serializer(payment).data, status=201)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Annule le paiement (statut ANNULE, motif obligatoire). Le reçu et la ligne sont conservés."""
        payment = services.cancel_payment(self.get_object(), user=request.user, reason=request.data.get("reason"))
        record(request, "PAYMENT_CANCEL", payment, changes={"reason": payment.cancel_reason, "amount": payment.amount})
        return Response(self.get_serializer(payment).data)


class MyChildrenPaymentsView(FinanceMixin, generics.ListAPIView):
    """Paiements des enfants du parent connecté (lecture seule, rôle PARENT uniquement).

    Le staff passe par ``/api/payments/`` ; un parent n'a aucun accès à la finance générale."""

    permission_classes = [RolePermission]
    role_access = {"get": {Role.PARENT}}
    serializer_class = ParentPaymentSerializer
    filterset_fields = ["student", "status", "fee_kind", "method"]
    search_fields = ["receipt_number"]
    ordering_fields = ["date"]

    def get_queryset(self):
        u = self.request.user
        return (
            Payment.objects.filter(establishment_id=u.establishment_id, student__guardianships__user=u)
            .select_related("student").distinct().order_by("-date", "-created_at")
        )


class ExpenseFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="date", lookup_expr="lte")

    class Meta:
        model = Expense
        fields = ["category", "status", "created_by"]


class ExpenseViewSet(FinanceMixin, AuditedMixin, NoDeleteMixin, TenantViewSetMixin, mixins.CreateModelMixin,
                     mixins.UpdateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Dépenses. Montant et date non modifiables ; au-delà du seuil, validation du directeur ; annulation avec motif."""

    queryset = Expense.objects.select_related("created_by", "approved_by", "cancelled_by")
    serializer_class = ExpenseSerializer
    filterset_class = ExpenseFilter
    search_fields = ["title", "paid_to", "reference"]
    ordering_fields = ["date", "amount", "created_at"]
    audit_exclude = ("attachment",)
    role_access = {
        "list": ADMIN_ROLES, "retrieve": ADMIN_ROLES, "create": ADMIN_ROLES,
        "update": ADMIN_ROLES, "partial_update": ADMIN_ROLES,
        "approve": DIRECTOR_ONLY, "reject": DIRECTOR_ONLY, "cancel": DIRECTOR_ONLY,
    }

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        expense = services.create_expense(
            user=request.user, category=d.get("category", "AUTRE"), title=d["title"], amount=d["amount"],
            date=d.get("date"), paid_to=d.get("paid_to", ""), reference=d.get("reference", ""), attachment=d.get("attachment"),
        )
        record(request, "EXPENSE_CREATE", expense, changes={"amount": expense.amount, "status": expense.status})
        return Response(self.get_serializer(expense).data, status=201)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        expense = services.approve_expense(self.get_object(), user=request.user, note=request.data.get("note", ""))
        record(request, "EXPENSE_APPROVE", expense, changes={"amount": expense.amount})
        return Response(self.get_serializer(expense).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        expense = services.reject_expense(self.get_object(), user=request.user, reason=request.data.get("reason"))
        record(request, "EXPENSE_REJECT", expense, changes={"reason": expense.decision_note})
        return Response(self.get_serializer(expense).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        expense = services.cancel_expense(self.get_object(), user=request.user, reason=request.data.get("reason"))
        record(request, "EXPENSE_CANCEL", expense, changes={"reason": expense.cancel_reason, "amount": expense.amount})
        return Response(self.get_serializer(expense).data)


class SummaryView(FinanceMixin, APIView):
    """Rapport financier : recettes (paiements + dons), dépenses validées, solde, impayés, répartition, évolution mensuelle.

    ``?from=AAAA-MM-JJ&to=AAAA-MM-JJ`` (défaut : du 1er janvier à aujourd'hui)."""

    permission_classes = [RolePermission]
    role_access = {"get": ADMIN_ROLES}

    def get(self, request):
        start, end = reports.default_period()
        field = serializers.DateField()
        parsed, errors = {}, {}
        for key in ("from", "to"):
            raw = request.query_params.get(key)
            if raw:
                try:
                    parsed[key] = field.run_validation(raw)
                except ValidationError:
                    errors[key] = "Date invalide (format AAAA-MM-JJ)."
        if errors:
            raise ValidationError(errors)
        start = parsed.get("from", start)
        end = parsed.get("to", max(end, start))
        return Response(reports.financial_summary(request.user.establishment, start, end))
