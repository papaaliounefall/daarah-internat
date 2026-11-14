from decimal import Decimal

from rest_framework import serializers

from apps.core.files import signed_file_url
from apps.finance.numeric import NumericTenantSerializer
from apps.finance.models import PaymentMethod

from . import services
from .models import Donation, Sponsor, Sponsorship, SponsorshipStatus


class SponsorSerializer(NumericTenantSerializer):
    active_sponsorships = serializers.SerializerMethodField()

    class Meta:
        model = Sponsor
        fields = ["id", "name", "kind", "phone", "email", "country", "notes", "active_sponsorships", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_active_sponsorships(self, obj) -> int:
        n = getattr(obj, "active_count", None)
        return n if n is not None else obj.sponsorships.filter(status=SponsorshipStatus.ACTIVE).count()


class DonationSerializer(NumericTenantSerializer):
    """Les dons ne se modifient pas : annulation avec motif (``cancel``) puis nouvelle saisie."""

    sponsor_name = serializers.CharField(source="sponsor.name", read_only=True, default="")
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True, default="")
    cancelled_by_name = serializers.CharField(source="cancelled_by.full_name", read_only=True, default="")
    attachment = serializers.FileField(write_only=True, required=False, allow_null=True)
    attachment_url = serializers.SerializerMethodField()
    method = serializers.ChoiceField(choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    donor_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=0, min_value=Decimal("1"), coerce_to_string=False)

    class Meta:
        model = Donation
        fields = ["id", "receipt_number", "sponsor", "sponsor_name", "donor_name", "donor_phone", "amount", "date",
                  "purpose", "method", "attachment", "attachment_url", "recorded_by_name", "is_cancelled",
                  "cancel_reason", "cancelled_by_name", "cancelled_at", "created_at"]
        read_only_fields = ["id", "receipt_number", "is_cancelled", "cancel_reason", "cancelled_at", "created_at"]

    def get_attachment_url(self, obj):
        return signed_file_url(self.context.get("request"), obj.attachment)

    def validate_attachment(self, value):
        from apps.core.validators import validate_document
        from django.core.exceptions import ValidationError as DjangoValidationError

        if value:
            try:
                validate_document(value)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(exc.messages)
        return value


class SponsorshipSerializer(NumericTenantSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    registration_number = serializers.CharField(source="student.registration_number", read_only=True)
    student_status = serializers.CharField(source="student.status", read_only=True)
    sponsor_name = serializers.CharField(source="sponsor.name", read_only=True)
    sponsor_phone = serializers.CharField(source="sponsor.phone", read_only=True)
    sponsor_email = serializers.CharField(source="sponsor.email", read_only=True)
    monthly_amount = serializers.DecimalField(max_digits=12, decimal_places=0, min_value=Decimal("0"), default=0, coerce_to_string=False)

    class Meta:
        model = Sponsorship
        fields = ["id", "student", "student_name", "registration_number", "student_status", "sponsor", "sponsor_name",
                  "sponsor_phone", "sponsor_email", "monthly_amount", "start_date", "end_date", "status", "notes",
                  "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_student(self, value):
        if value.is_archived:
            raise serializers.ValidationError("Ce talibé est archivé.")
        return value

    def validate(self, attrs):
        inst = self.instance
        if inst is not None and "student" in attrs and attrs["student"] != inst.student:
            raise serializers.ValidationError({"student": "Le talibé d'un dossier de parrainage ne peut pas être changé."})
        status = attrs.get("status", getattr(inst, "status", SponsorshipStatus.ACTIVE))
        start = attrs.get("start_date", getattr(inst, "start_date", None))
        end = attrs.get("end_date", getattr(inst, "end_date", None))
        attrs["end_date"] = services.normalize_sponsorship(status, end, start)
        if inst is not None and inst.status == SponsorshipStatus.ENDED and status != SponsorshipStatus.ENDED:
            raise serializers.ValidationError({"status": "Un parrainage terminé ne peut pas être réactivé : créez-en un nouveau."})
        return attrs
