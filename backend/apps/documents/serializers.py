from rest_framework import serializers

from apps.core.files import signed_file_url

from .models import StudentCard


class StudentCardSerializer(serializers.ModelSerializer):
    """Version de carte (directeur / assistant) : motif, données imprimées, auteur."""

    pdf_url = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()
    generated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StudentCard
        fields = ["id", "student", "version", "is_current", "reason", "snapshot", "generated_by_name",
                  "pdf_url", "download_url", "created_at"]
        read_only_fields = fields

    def get_pdf_url(self, obj):
        return signed_file_url(self.context.get("request"), obj.pdf)

    def get_download_url(self, obj):
        return f"/api/cards/{obj.pk}/pdf/"

    def get_generated_by_name(self, obj):
        return obj.generated_by.full_name if obj.generated_by else ""


class StudentCardFamilySerializer(StudentCardSerializer):
    """Ce qu'un parent voit : uniquement la carte courante, sans motif ni détail interne."""

    class Meta(StudentCardSerializer.Meta):
        fields = ["id", "student", "version", "pdf_url", "download_url", "created_at"]
        read_only_fields = fields


class GenerateCardSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)


class BatchCardSerializer(serializers.Serializer):
    students = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=200, allow_empty=False)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)
