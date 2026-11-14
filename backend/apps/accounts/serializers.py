from django.contrib.auth import password_validation
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.core.roles import Role

from .models import User


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    password = serializers.CharField(write_only=True, required=False, style={"input_type": "password"})
    # Renseignés par les modules concernés (classes du maître, enfants du parent).
    assigned_class_ids = serializers.SerializerMethodField()
    associated_student_ids = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "first_name", "last_name", "full_name", "email", "phone", "role",
            "is_active", "can_view_finance", "must_change_password", "password",
            "assigned_class_ids", "associated_student_ids", "last_login", "date_joined",
        ]
        read_only_fields = ["id", "last_login", "date_joined", "must_change_password"]

    def get_assigned_class_ids(self, obj):
        if obj.role != Role.MAITRE:
            return []
        return [str(i) for i in obj.classrooms.values_list("id", flat=True)]

    def get_associated_student_ids(self, obj):
        if obj.role != Role.PARENT:
            return []
        return [str(i) for i in obj.guardianships.values_list("student_id", flat=True)]

    def validate_role(self, value):
        actor = self.context["request"].user
        if actor.role != Role.DIRECTEUR and value != Role.PARENT:
            raise serializers.ValidationError("Seul le directeur peut créer ou modifier ce type de compte.")
        return value

    def validate(self, attrs):
        actor = self.context["request"].user
        if actor.role != Role.DIRECTEUR:
            # L'assistant ne touche ni aux droits financiers ni à l'activation des comptes.
            for forbidden in ("can_view_finance", "is_active"):
                if forbidden in attrs:
                    raise serializers.ValidationError({forbidden: "Réservé au directeur."})
        if self.instance is None and "password" not in attrs:
            raise serializers.ValidationError({"password": "Un mot de passe initial est requis."})
        if "password" in attrs:
            password_validation.validate_password(attrs["password"], self.instance)
        return attrs

    def create(self, validated):
        password = validated.pop("password")
        user = User(**validated, establishment=self.context["request"].user.establishment)
        user.set_password(password)
        user.must_change_password = True
        user.save()
        return user

    def update(self, instance, validated):
        password = validated.pop("password", None)
        for k, v in validated.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
            instance.must_change_password = True
        instance.save()
        return instance


class MeSerializer(UserSerializer):
    """Profil de l'utilisateur connecté : il ne peut modifier que ses coordonnées."""

    class Meta(UserSerializer.Meta):
        read_only_fields = [f for f in UserSerializer.Meta.fields if f not in ("first_name", "last_name", "email", "phone")]


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        if not self.user.establishment_id:
            raise serializers.ValidationError("Ce compte n'est rattaché à aucun établissement.")
        data["user"] = MeSerializer(self.user, context=self.context).data
        return data


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Mot de passe actuel incorrect.")
        return value

    def validate_new_password(self, value):
        password_validation.validate_password(value, self.context["request"].user)
        return value
