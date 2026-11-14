"""Base de sérialiseurs : les décimaux (montants FCFA, quantités) sont sérialisés en NOMBRES JSON, pas en chaînes.

Conforme à CONVENTIONS.md règle 11. (À déplacer dans ``apps.core`` si d'autres apps en ont besoin.)
"""
from rest_framework import serializers

from apps.core.serializers import TenantModelSerializer


class NumericDecimalsMixin:
    def build_standard_field(self, field_name, model_field):
        cls, kwargs = super().build_standard_field(field_name, model_field)
        if issubclass(cls, serializers.DecimalField):
            kwargs["coerce_to_string"] = False
        return cls, kwargs


class NumericModelSerializer(NumericDecimalsMixin, serializers.ModelSerializer):
    pass


class NumericTenantSerializer(NumericDecimalsMixin, TenantModelSerializer):
    pass
