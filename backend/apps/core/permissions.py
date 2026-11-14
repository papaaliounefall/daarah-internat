"""Contrôle d'accès par rôle, appliqué côté serveur sur chaque requête.

Chaque vue déclare ``role_access`` : action DRF (ou méthode HTTP en minuscules pour les
APIView) -> ensemble de rôles autorisés. La clé ``"*"`` sert de valeur par défaut.
Une action absente et sans ``"*"`` est REFUSÉE.

    class StudentViewSet(...):
        role_access = {"list": ADMIN_ROLES | {Role.MAITRE}, "create": ADMIN_ROLES, "*": ADMIN_ROLES}

Attribut optionnel ``finance_scope = True`` : un assistant n'accède alors à la vue que si
l'option ``can_view_finance`` lui a été accordée par le directeur.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .roles import Role


class RolePermission(BasePermission):
    message = "Vous n'avez pas les droits nécessaires pour cette opération."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated or not user.is_active:
            return False
        if user.establishment_id is None:
            return False  # compte sans établissement : jamais d'accès aux données métier
        access = getattr(view, "role_access", None)
        if access is None:
            return False
        key = getattr(view, "action", None) or request.method.lower()
        allowed = access.get(key, access.get("*"))
        if allowed is None or user.role not in allowed:
            return False
        if getattr(view, "finance_scope", False) and user.role == Role.ASSISTANT:
            return bool(user.can_view_finance)
        return True


class IsAuthenticatedWithEstablishment(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_active and u.establishment_id)


class ReadOnlyOrDenied(BasePermission):
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS
