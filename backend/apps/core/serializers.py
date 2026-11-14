from rest_framework import serializers


class TenantRelatedField(serializers.PrimaryKeyRelatedField):
    """Clé étrangère limitée à l'établissement de l'utilisateur.

    Empêche de rattacher un enregistrement à un objet d'un autre Daara (IDOR) : un identifiant
    étranger est traité comme inexistant.
    """

    def get_queryset(self):
        qs = super().get_queryset()
        request = self.context.get("request")
        if qs is None or request is None:
            return qs
        if any(f.name == "establishment" for f in qs.model._meta.get_fields()):
            return qs.filter(establishment_id=request.user.establishment_id)
        return qs


class TenantModelSerializer(serializers.ModelSerializer):
    """Base de tous les sérialiseurs de données d'un établissement."""

    serializer_related_field = TenantRelatedField

    def get_fields(self):
        fields = super().get_fields()
        fields.pop("establishment", None)
        return fields
