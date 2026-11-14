from django.contrib.auth import get_user_model
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.audit.services import record
from apps.core.permissions import RolePermission
from apps.core.roles import ADMIN_ROLES, Role
from apps.core.views import AuditedMixin, TenantViewSetMixin

from .serializers import ChangePasswordSerializer, LoginSerializer, MeSerializer, UserSerializer

User = get_user_model()


class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    serializer_class = LoginSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        try:
            response = super().post(request, *args, **kwargs)
        except (AuthenticationFailed, InvalidToken, TokenError):
            record(request, "LOGIN_FAILED", model="User", detail=f"identifiant={request.data.get('username', '')[:50]}")
            raise
        user = User.objects.filter(username=request.data.get("username")).first()
        if user:
            record(request, "LOGIN", user, user=user)
        return response


class RefreshView(TokenRefreshView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


class LogoutView(APIView):
    """Révoque le refresh token (liste noire)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get("refresh")
        if token:
            try:
                RefreshToken(token).blacklist()
            except TokenError:
                pass
        record(request, "LOGOUT", request.user, model="User")
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        ser = MeSerializer(request.user, data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = ChangePasswordSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        request.user.set_password(ser.validated_data["new_password"])
        request.user.must_change_password = False
        request.user.save(update_fields=["password", "must_change_password"])
        record(request, "PASSWORD_CHANGE", request.user, model="User")
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserViewSet(AuditedMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    """Gestion des comptes. Pas de suppression : on désactive (conservation de l'historique)."""

    queryset = User.objects.all().order_by("last_name", "first_name")
    serializer_class = UserSerializer
    permission_classes = [RolePermission]
    role_access = {
        "list": ADMIN_ROLES, "retrieve": ADMIN_ROLES,
        "create": ADMIN_ROLES, "update": ADMIN_ROLES, "partial_update": ADMIN_ROLES,
        "deactivate": {Role.DIRECTEUR}, "destroy": set(),
    }
    filterset_fields = ["role", "is_active"]
    search_fields = ["username", "first_name", "last_name", "email"]
    audit_exclude = ("password",)

    def get_queryset(self):
        # User n'a pas de champ « establishment_id » hérité de TenantModel : même filtre, explicite.
        return super().get_queryset()

    def scope_queryset(self, qs):
        user = self.request.user
        if user.role == Role.ASSISTANT:
            # L'assistant ne voit pas le directeur ni les autres assistants dans les écrans de gestion.
            return qs.exclude(role__in=[Role.DIRECTEUR])
        return qs

    def perform_create(self, serializer):
        serializer.save()  # l'établissement est fixé par le sérialiseur

    def perform_update(self, serializer):
        target = serializer.instance
        actor = self.request.user
        if actor.role != Role.DIRECTEUR and target.role != Role.PARENT:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Seul le directeur peut modifier ce compte.")
        super().perform_update(serializer)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        user = self.get_object()
        if user.pk == request.user.pk:
            return Response({"detail": "Vous ne pouvez pas désactiver votre propre compte."}, status=400)
        user.is_active = False
        user.save(update_fields=["is_active"])
        record(request, "DEACTIVATE", user)
        return Response(UserSerializer(user, context={"request": request}).data)
