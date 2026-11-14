from django.contrib.auth import get_user_model
from django.contrib.auth import password_validation
from rest_framework import serializers

from apps.core.serializers import TenantModelSerializer
from apps.core.roles import Role

from .models import Guardianship

User = get_user_model()


class GuardianshipSerializer(TenantModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)

    class Meta:
        model = Guardianship
        fields = ["id", "user", "user_name", "student", "student_name", "relation", "is_primary"]
        read_only_fields = ["id"]

    def validate_user(self, user):
        if user.role != Role.PARENT:
            raise serializers.ValidationError("Le compte doit avoir le rôle Parent.")
        return user


class ParentAccountSerializer(serializers.Serializer):
    """Création d'un compte parent et rattachement à un ou plusieurs enfants."""

    username = serializers.CharField(max_length=150)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)
    students = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
    relation = serializers.ChoiceField(choices=Guardianship._meta.get_field("relation").choices, default="PERE")

    def validate_username(self, v):
        if User.objects.filter(username__iexact=v).exists():
            raise serializers.ValidationError("Cet identifiant est déjà utilisé.")
        return v

    def validate_password(self, v):
        password_validation.validate_password(v)
        return v
