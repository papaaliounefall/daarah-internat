from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.services import record
from apps.core.roles import ADMIN_ROLES, ALL_ROLES, Role
from apps.core.views import AuditedMixin, TenantViewSetMixin
from apps.students.models import Student

from .models import Guardianship
from .serializers import GuardianshipSerializer, ParentAccountSerializer

User = get_user_model()


class GuardianshipViewSet(AuditedMixin, TenantViewSetMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
                          mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Liens parent ↔ enfant. Retirer un lien ne supprime ni le compte ni l'enfant."""

    queryset = Guardianship.objects.select_related("user", "student")
    serializer_class = GuardianshipSerializer
    role_access = {
        "list": ALL_ROLES, "retrieve": ALL_ROLES, "create": ADMIN_ROLES, "destroy": ADMIN_ROLES,
        "create_account": ADMIN_ROLES,
    }
    filterset_fields = ["student", "user"]

    def scope_queryset(self, qs):
        user = self.request.user
        if user.role == Role.PARENT:
            return qs.filter(user=user)
        if user.role == Role.MAITRE:
            return qs.none()
        return qs

    @action(detail=False, methods=["post"], url_path="create-account")
    def create_account(self, request):
        ser = ParentAccountSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        students = list(Student.objects.filter(pk__in=d["students"], establishment=request.user.establishment))
        if len(students) != len(set(d["students"])):
            raise ValidationError({"students": "Un ou plusieurs talibés sont introuvables."})
        with transaction.atomic():
            user = User(
                username=d["username"], first_name=d["first_name"], last_name=d.get("last_name", ""),
                phone=d.get("phone", ""), email=d.get("email", ""), role=Role.PARENT,
                establishment=request.user.establishment, must_change_password=True,
            )
            user.set_password(d["password"])
            user.save()
            for st in students:
                Guardianship.objects.create(
                    establishment=request.user.establishment, user=user, student=st,
                    relation=d["relation"], is_primary=True,
                )
        record(request, "PARENT_ACCOUNT_CREATE", user, changes={"students": [str(s.pk) for s in students]})
        return Response({"id": str(user.pk), "username": user.username, "students": [str(s.pk) for s in students]}, status=201)
