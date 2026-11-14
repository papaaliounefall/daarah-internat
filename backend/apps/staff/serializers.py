from rest_framework import serializers

from apps.core.files import signed_file_url
from apps.core.serializers import TenantModelSerializer

from . import services
from .models import StaffDocument, StaffMember, StaffPosition

SENSITIVE_FIELDS = ("id_number", "notes")


class StaffMemberSerializer(TenantModelSerializer):
    """Dossier complet : directeur uniquement (contient pièce d'identité et notes)."""

    user_name = serializers.CharField(source="user.full_name", read_only=True, default="")

    class Meta:
        model = StaffMember
        fields = ["id", "user", "user_name", "full_name", "category", "role_title", "phone", "email", "address",
                  "hire_date", "end_date", "status", "id_number", "notes", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_user(self, value):
        if value is not None:
            if value.role == "PARENT":
                raise serializers.ValidationError("Un compte parent ne peut pas être lié à un dossier du personnel.")
            qs = StaffMember.objects.filter(user=value)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError("Ce compte est déjà lié à un autre dossier du personnel.")
        return value

    def validate(self, attrs):
        hire = attrs.get("hire_date", getattr(self.instance, "hire_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if hire and end and end < hire:
            raise serializers.ValidationError({"end_date": "La date de fin ne peut pas précéder la date d'entrée."})
        return attrs

    def create(self, validated):
        staff = super().create(validated)
        # La première fonction ouvre l'historique.
        services.open_position(staff, staff.role_title, start_date=staff.hire_date, note="Entrée en fonction")
        return staff

    def update(self, instance, validated):
        old_title = instance.role_title
        new_title = validated.get("role_title", old_title)
        validated = {k: v for k, v in validated.items() if k != "role_title"}
        instance = super().update(instance, validated)
        if new_title != old_title:  # changement de fonction : historisé
            services.open_position(instance, new_title, note="Changement de fonction")
        return instance


class StaffMemberLimitedSerializer(serializers.ModelSerializer):
    """Vue de l'assistant : nom, fonction, téléphone et statut uniquement."""

    class Meta:
        model = StaffMember
        fields = ["id", "full_name", "category", "role_title", "phone", "status"]
        read_only_fields = fields


class StaffPositionSerializer(TenantModelSerializer):
    class Meta:
        model = StaffPosition
        fields = ["id", "staff", "role_title", "start_date", "end_date", "note"]
        read_only_fields = ["id", "staff", "end_date"]


class StaffDocumentSerializer(TenantModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = StaffDocument
        fields = ["id", "staff", "title", "file", "file_url", "created_at"]
        read_only_fields = ["id", "staff", "created_at"]
        extra_kwargs = {"file": {"write_only": True}}

    def get_file_url(self, obj):
        return signed_file_url(self.context.get("request"), obj.file)
