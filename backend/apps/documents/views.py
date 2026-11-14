"""Cartes talibé, reçus de paiement et rapport financier (PDF).

Toutes les réponses PDF sont servies par des vues authentifiées (jamais d'URL média publique) ; les PDF de cartes
stockés sont en plus accessibles par URL signée à durée limitée (``pdf_url``, voir ``apps.core.files``).
"""
import datetime
import logging

from django.http import Http404, HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record
from apps.core.permissions import RolePermission
from apps.core.roles import ADMIN_ROLES, Role
from apps.core.views import TenantViewSetMixin
from apps.students.models import Student
from apps.students.selectors import student_ids_for, student_scope

from . import services
from .finance_data import finance_report_data
from .models import StudentCard
from .pdf.receipt import render_receipt
from .pdf.report import render_finance_report
from .serializers import (
    BatchCardSerializer, GenerateCardSerializer, StudentCardFamilySerializer, StudentCardSerializer,
)
from .tasks import generate_student_card

logger = logging.getLogger(__name__)

ADMIN_OR_PARENT = ADMIN_ROLES | {Role.PARENT}


class AnyAcceptNegotiation(DefaultContentNegotiation):
    """Les endpoints PDF répondent en ``application/pdf`` quel que soit l'en-tête Accept du navigateur."""

    def select_renderer(self, request, renderers, format_suffix=None):
        return renderers[0], renderers[0].media_type


def pdf_response(data: bytes, filename: str) -> HttpResponse:
    resp = HttpResponse(data, content_type="application/pdf")
    resp["Content-Disposition"] = f'inline; filename="{filename}"'
    resp["Cache-Control"] = "private, no-store"
    resp["X-Content-Type-Options"] = "nosniff"
    return resp


def _safe_name(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in value)


# ---------------------------------------------------------------------------------------------------
# Cartes talibé
# ---------------------------------------------------------------------------------------------------
class StudentCardViewSet(TenantViewSetMixin, viewsets.GenericViewSet):
    """Cartes d'un talibé : aperçu, génération (nouvelle version), carte courante, historique."""

    queryset = Student.objects.all()
    serializer_class = StudentCardSerializer
    content_negotiation_class = AnyAcceptNegotiation
    role_access = {
        "preview": ADMIN_ROLES, "generate": ADMIN_ROLES,
        "current": ADMIN_OR_PARENT, "history": ADMIN_OR_PARENT,
    }

    def scope_queryset(self, qs):
        return student_scope(qs, self.request.user)

    def preview(self, request, pk=None):
        """PDF inline de la carte avec les données ACTUELLES du dossier, sans rien enregistrer."""
        student = self.get_object()
        pdf, _values = services.render_student_card(student)
        record(request, "PDF_CARD_PREVIEW", student)
        return pdf_response(pdf, f"apercu-carte-{_safe_name(student.registration_number)}.pdf")

    def current(self, request, pk=None):
        """Télécharge la carte courante enregistrée (directeur, assistant, parent de l'enfant)."""
        student = self.get_object()
        card = student.cards.filter(is_current=True).first()
        if card is None:
            raise Http404("Aucune carte n'a encore été générée pour ce talibé.")
        record(request, "PDF_CARD_DOWNLOAD", card, changes={"student": str(student.pk), "version": card.version})
        return pdf_response(services.card_pdf_bytes(card),
                            f"carte-{_safe_name(student.registration_number)}-v{card.version}.pdf")

    def generate(self, request, pk=None):
        """Génère et ENREGISTRE la version suivante de la carte (l'ancienne n'est jamais écrasée)."""
        student = self.get_object()
        ser = GenerateCardSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        card = services.generate_card(student, user=request.user, reason=ser.validated_data.get("reason", ""),
                                      request=request)
        return Response(StudentCardSerializer(card, context={"request": request}).data, status=status.HTTP_201_CREATED)

    def history(self, request, pk=None):
        student = self.get_object()
        qs = student.cards.select_related("generated_by")
        if request.user.role == Role.PARENT:
            qs = qs.filter(is_current=True)
            ser = StudentCardFamilySerializer
        else:
            ser = StudentCardSerializer
        return Response(ser(qs, many=True, context={"request": request}).data)


class CardViewSet(TenantViewSetMixin, viewsets.GenericViewSet):
    """Accès par identifiant de carte et génération en lot."""

    queryset = StudentCard.objects.select_related("student")
    serializer_class = BatchCardSerializer
    content_negotiation_class = AnyAcceptNegotiation
    role_access = {"pdf": ADMIN_OR_PARENT, "batch": ADMIN_ROLES}

    def scope_queryset(self, qs):
        user = self.request.user
        qs = qs.filter(student_id__in=student_ids_for(user))
        if user.role == Role.PARENT:
            qs = qs.filter(is_current=True)  # un parent ne télécharge que la carte courante
        return qs

    def pdf(self, request, pk=None):
        card = self.get_object()
        record(request, "PDF_CARD_DOWNLOAD", card, changes={"student": str(card.student_id), "version": card.version})
        return pdf_response(services.card_pdf_bytes(card),
                            f"carte-{_safe_name(card.student.registration_number)}-v{card.version}.pdf")

    def batch(self, request):
        """Génère une nouvelle version de carte pour chaque talibé (tâche Celery par talibé)."""
        ser = BatchCardSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ids = set(ser.validated_data["students"])
        found = student_scope(Student.objects.filter(establishment=request.user.establishment, pk__in=ids),
                              request.user)
        found_ids = {s for s in found.values_list("pk", flat=True)}
        if found_ids != ids:
            raise ValidationError({"students": "Un ou plusieurs talibés sont introuvables."})
        reason = ser.validated_data.get("reason", "")
        for sid in sorted(str(i) for i in found_ids):
            try:
                generate_student_card.delay(sid, user_id=str(request.user.pk), reason=reason or "Génération en lot")
            except Exception:  # noqa: BLE001 - broker indisponible : exécution immédiate plutôt qu'un échec
                logger.exception("Broker indisponible : génération synchrone de la carte %s", sid)
                generate_student_card.apply(args=(sid,), kwargs={"user_id": str(request.user.pk),
                                                               "reason": reason or "Génération en lot"})
        record(request, "PDF_CARD_BATCH", model="StudentCard", changes={"students": sorted(str(i) for i in found_ids)})
        return Response({"queued": len(found_ids)}, status=status.HTTP_202_ACCEPTED)


# ---------------------------------------------------------------------------------------------------
# Reçu de paiement et rapport financier
# ---------------------------------------------------------------------------------------------------
class ReceiptView(APIView):
    """``GET /api/documents/receipts/{payment_id}/`` : reçu A5 d'un paiement (annulé : mention ANNULÉ)."""

    permission_classes = [RolePermission]
    content_negotiation_class = AnyAcceptNegotiation
    role_access = {"get": ADMIN_OR_PARENT}
    finance_scope = True  # un assistant n'y accède que s'il a ``can_view_finance``

    def get(self, request, pk):
        from apps.finance.models import Payment

        qs = Payment.objects.filter(establishment_id=request.user.establishment_id).select_related(
            "student", "due", "recorded_by", "cancelled_by", "establishment")
        if request.user.role == Role.PARENT:  # parent : uniquement les paiements de SES enfants
            qs = qs.filter(student_id__in=student_ids_for(request.user))
        payment = qs.filter(pk=pk).first()
        if payment is None:
            raise Http404()
        pdf = render_receipt(services.receipt_data(payment, request.user))
        record(request, "PDF_RECEIPT", payment, changes={"receipt_number": payment.receipt_number})
        return pdf_response(pdf, f"recu-{_safe_name(payment.receipt_number)}.pdf")


def _parse_date(value: str | None, name: str, default: datetime.date) -> datetime.date:
    if not value:
        return default
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        raise ValidationError({name: "Date invalide (format attendu : AAAA-MM-JJ)."})


class FinanceReportView(APIView):
    """``GET /api/documents/finance-report/?from=AAAA-MM-JJ&to=AAAA-MM-JJ`` : rapport financier PDF (A4)."""

    permission_classes = [RolePermission]
    content_negotiation_class = AnyAcceptNegotiation
    role_access = {"get": ADMIN_ROLES}
    finance_scope = True

    def get(self, request):
        today = timezone.localdate()
        date_from = _parse_date(request.query_params.get("from"), "from", today.replace(day=1))
        date_to = _parse_date(request.query_params.get("to"), "to", today)
        if date_from > date_to:
            raise ValidationError({"to": "La date de fin doit être postérieure ou égale à la date de début."})
        if (date_to - date_from).days > 3660:
            raise ValidationError({"to": "Période trop étendue (10 ans maximum)."})
        est = request.user.establishment
        data = finance_report_data(est, date_from, date_to)
        pdf = render_finance_report(data, est, request.user.full_name, timezone.localtime().strftime("%d/%m/%Y %H:%M"))
        record(request, "PDF_FINANCE_REPORT", model="FinanceReport",
               changes={"from": date_from, "to": date_to, "revenue": data["revenue_total"],
                        "expenses": data["expenses_total"]})
        return pdf_response(pdf, f"rapport-financier-{date_from}-{date_to}.pdf")
