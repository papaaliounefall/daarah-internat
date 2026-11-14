from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.academics.models import AcademicYear
from apps.core.files import signed_file_url
from apps.core.validators import validate_document
from apps.students.models import Student

from . import services
from .numeric import NumericModelSerializer, NumericTenantSerializer
from .models import (
    DiscountKind, Due, Expense, ExpenseStatus, FeeSchedule, Payment, PaymentMethod, StudentDiscount,
)

FCFA = dict(max_digits=12, decimal_places=0, coerce_to_string=False)


class FeeScheduleSerializer(NumericTenantSerializer):
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)
    amount = serializers.DecimalField(min_value=Decimal("0"), **FCFA)

    class Meta:
        model = FeeSchedule
        fields = ["id", "academic_year", "academic_year_name", "name", "kind", "amount", "applies_to", "due_day", "is_active"]
        read_only_fields = ["id"]

    def validate_due_day(self, value):
        if value is not None and not 1 <= value <= 28:
            raise serializers.ValidationError("Le jour d'échéance doit être compris entre 1 et 28.")
        return value

    def validate_academic_year(self, value):
        if value.is_closed:
            raise serializers.ValidationError("Cette année scolaire est clôturée.")
        return value


class StudentDiscountSerializer(NumericTenantSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    registration_number = serializers.CharField(source="student.registration_number", read_only=True)
    approved_by_name = serializers.CharField(source="approved_by.full_name", read_only=True, default="")

    class Meta:
        model = StudentDiscount
        fields = ["id", "student", "student_name", "registration_number", "academic_year", "label", "kind", "value",
                  "reason", "approved_by_name", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        if self.instance is not None:
            # La valeur d'une réduction accordée ne change pas : on la désactive et on en crée une nouvelle.
            for f in ("student", "academic_year", "kind", "value"):
                if f in attrs and attrs[f] != getattr(self.instance, f):
                    raise serializers.ValidationError({f: "Non modifiable : désactivez cette réduction et créez-en une nouvelle."})
            return attrs
        kind, value = attrs.get("kind", DiscountKind.PERCENT), attrs.get("value")
        if value is None or value <= 0:
            raise serializers.ValidationError({"value": "La valeur doit être supérieure à zéro."})
        if kind == DiscountKind.PERCENT and value > 100:
            raise serializers.ValidationError({"value": "Un pourcentage ne peut pas dépasser 100."})
        if attrs["student"].is_archived:
            raise serializers.ValidationError({"student": "Ce talibé est archivé."})
        return attrs


class DueSerializer(NumericTenantSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    registration_number = serializers.CharField(source="student.registration_number", read_only=True)
    amount = serializers.DecimalField(min_value=Decimal("1"), **FCFA)
    paid_amount = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Due
        fields = ["id", "student", "student_name", "registration_number", "academic_year", "fee_schedule", "kind",
                  "label", "period", "due_date", "amount", "paid_amount", "balance", "status", "is_overdue", "is_cancelled"]
        # Création manuelle (frais exceptionnel) uniquement ; les mensualités viennent de « generate ».
        read_only_fields = ["id", "fee_schedule", "period", "is_cancelled"]

    def _paid(self, obj):
        paid = getattr(obj, "paid", None)
        return paid if paid is not None else services.due_paid(obj)

    def get_paid_amount(self, obj):
        return self._paid(obj)

    def get_balance(self, obj):
        return max(obj.amount - self._paid(obj), Decimal("0"))

    def get_status(self, obj):
        obj.paid = self._paid(obj)
        return services.due_status(obj)

    def get_is_overdue(self, obj):
        from django.utils import timezone

        return (not obj.is_cancelled) and obj.due_date < timezone.localdate() and self.get_balance(obj) > 0

    def validate_student(self, value):
        if value.is_archived:
            raise serializers.ValidationError("Ce talibé est archivé.")
        return value

    def validate_academic_year(self, value):
        if value.is_closed:
            raise serializers.ValidationError("Cette année scolaire est clôturée.")
        return value


class PaymentSerializer(NumericTenantSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    registration_number = serializers.CharField(source="student.registration_number", read_only=True)
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True, default="")
    cancelled_by_name = serializers.CharField(source="cancelled_by.full_name", read_only=True, default="")
    amount = serializers.DecimalField(min_value=Decimal("1"), **FCFA)
    method = serializers.ChoiceField(choices=PaymentMethod.choices, default=PaymentMethod.CASH)

    class Meta:
        model = Payment
        fields = ["id", "receipt_number", "student", "student_name", "registration_number", "due", "fee_kind",
                  "period_label", "amount", "date", "method", "reference", "status", "recorded_by_name", "notes",
                  "cancelled_by_name", "cancelled_at", "cancel_reason", "created_at"]
        read_only_fields = ["id", "receipt_number", "status", "cancelled_at", "cancel_reason", "created_at"]
        extra_kwargs = {"student": {"required": False}}  # déduit de l'échéance si absent

    def validate(self, attrs):
        if not attrs.get("student") and not attrs.get("due"):
            raise serializers.ValidationError({"student": "Indiquez le talibé ou l'échéance payée."})
        if attrs.get("due") is not None and not attrs.get("student"):
            attrs["student"] = attrs["due"].student
        return attrs


class ParentPaymentSerializer(NumericModelSerializer):
    """Ce qu'un parent voit d'un paiement de son enfant : pas d'auteur, de notes ni de motif interne."""

    student_name = serializers.CharField(source="student.full_name", read_only=True)
    registration_number = serializers.CharField(source="student.registration_number", read_only=True)

    class Meta:
        model = Payment
        fields = ["id", "receipt_number", "student", "student_name", "registration_number", "fee_kind", "period_label",
                  "amount", "date", "method", "status"]
        read_only_fields = fields


class ExpenseSerializer(NumericTenantSerializer):
    amount = serializers.DecimalField(min_value=Decimal("1"), **FCFA)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default="")
    approved_by_name = serializers.CharField(source="approved_by.full_name", read_only=True, default="")
    cancelled_by_name = serializers.CharField(source="cancelled_by.full_name", read_only=True, default="")
    attachment = serializers.FileField(write_only=True, required=False, allow_null=True)
    attachment_url = serializers.SerializerMethodField()
    requires_approval = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = ["id", "category", "title", "amount", "date", "paid_to", "reference", "attachment", "attachment_url",
                  "status", "requires_approval", "created_by_name", "approved_by_name", "decided_at", "decision_note",
                  "cancel_reason", "cancelled_by_name", "cancelled_at", "created_at"]
        read_only_fields = ["id", "status", "decided_at", "decision_note", "cancel_reason", "cancelled_at", "created_at"]

    def get_attachment_url(self, obj):
        return signed_file_url(self.context.get("request"), obj.attachment)

    def get_requires_approval(self, obj) -> bool:
        return obj.status == ExpenseStatus.PENDING

    def validate_attachment(self, value):
        if value:
            try:
                validate_document(value)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(exc.messages)
        return value

    def validate(self, attrs):
        if self.instance is not None:
            if self.instance.status in (ExpenseStatus.REJECTED, ExpenseStatus.CANCELLED):
                raise serializers.ValidationError("Une dépense refusée ou annulée n'est plus modifiable.")
            for f in ("amount", "date"):
                if f in attrs and attrs[f] != getattr(self.instance, f):
                    raise serializers.ValidationError(
                        {f: "Non modifiable : annulez cette dépense (avec motif) et saisissez-en une nouvelle."}
                    )
        return attrs


# --- entrées des actions ---
class GenerateDuesSerializer(serializers.Serializer):
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all(), required=False)
    fee_schedules = serializers.PrimaryKeyRelatedField(queryset=FeeSchedule.objects.all(), many=True, required=False)
    students = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all(), many=True, required=False)
    from_month = serializers.RegexField(r"^\d{4}-(0[1-9]|1[0-2])$", required=False, error_messages={"invalid": "Format attendu : AAAA-MM."})
    to_month = serializers.RegexField(r"^\d{4}-(0[1-9]|1[0-2])$", required=False, error_messages={"invalid": "Format attendu : AAAA-MM."})

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        est = self.context["request"].user.establishment_id
        self.fields["academic_year"].queryset = AcademicYear.objects.filter(establishment_id=est)
        self.fields["fee_schedules"].child_relation.queryset = FeeSchedule.objects.filter(establishment_id=est)
        self.fields["students"].child_relation.queryset = Student.objects.filter(establishment_id=est)
