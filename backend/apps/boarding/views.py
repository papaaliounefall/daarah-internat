import django_filters
from django.db.models import Count, IntegerField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record
from apps.core.permissions import RolePermission
from apps.core.roles import ADMIN_ROLES, STAFF_ROLES, Role
from apps.core.views import AuditedMixin, NoDeleteMixin, TenantViewSetMixin
from apps.students.selectors import student_ids_for

from . import services
from .models import BoardingAssignment, BoardingMovement, Building, MovementKind, Room
from .serializers import (
    AssignmentSerializer, BuildingSerializer, MovementSerializer, ParentRoomSerializer, RoomSerializer,
)

READ_STAFF = STAFF_ROLES  # directeur, assistant, maître
READ_ALL = STAFF_ROLES | {Role.PARENT}


def annotate_occupancy(qs):
    active = BoardingAssignment.objects.filter(room=OuterRef("pk"), end_date__isnull=True).order_by().values("room")
    count = Subquery(active.annotate(n=Count("pk")).values("n")[:1], output_field=IntegerField())
    return qs.annotate(occupancy_count=Coalesce(count, Value(0)))


class BuildingViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    queryset = Building.objects.all()
    serializer_class = BuildingSerializer
    search_fields = ["name"]
    role_access = {
        "list": READ_STAFF, "retrieve": READ_STAFF,
        "create": ADMIN_ROLES, "update": ADMIN_ROLES, "partial_update": ADMIN_ROLES,
    }


class RoomViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    """Chambres. Écriture : directeur + assistant ; maître : lecture ; parent : chambre de ses enfants seulement."""

    queryset = Room.objects.select_related("building", "supervisor")
    serializer_class = RoomSerializer
    filterset_fields = ["building", "is_active", "supervisor"]
    search_fields = ["number", "name", "building__name"]
    role_access = {
        "list": READ_ALL, "retrieve": READ_ALL, "occupants": READ_STAFF,
        "create": ADMIN_ROLES, "update": ADMIN_ROLES, "partial_update": ADMIN_ROLES,
    }

    def get_queryset(self):
        return annotate_occupancy(super().get_queryset())

    def scope_queryset(self, qs):
        user = self.request.user
        if user.role == Role.PARENT:
            return qs.filter(
                pk__in=BoardingAssignment.objects.filter(
                    end_date__isnull=True, student__guardianships__user=user
                ).values("room_id")
            )
        return qs

    def get_serializer_class(self):
        return ParentRoomSerializer if getattr(self.request.user, "role", None) == Role.PARENT else RoomSerializer

    @action(detail=True, methods=["get"])
    def occupants(self, request, pk=None):
        """Occupants actuels. Un maître ne voit que les talibés de ses classes."""
        room = self.get_object()
        qs = room.assignments.filter(end_date__isnull=True).select_related("student", "room", "room__building", "assigned_by")
        if request.user.role == Role.MAITRE:
            qs = qs.filter(student__in=student_ids_for(request.user))
        return Response(AssignmentSerializer(qs, many=True, context={"request": request}).data)


class AssignmentFilter(django_filters.FilterSet):
    active = django_filters.BooleanFilter(method="filter_active")
    building = django_filters.UUIDFilter(field_name="room__building")

    class Meta:
        model = BoardingAssignment
        fields = ["student", "room"]

    def filter_active(self, qs, name, value):
        return qs.filter(end_date__isnull=bool(value))


class AssignmentViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
                        mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Affectations (historique conservé : un changement clôture l'ancienne ligne, rien n'est supprimé)."""

    queryset = BoardingAssignment.objects.select_related("student", "room", "room__building", "assigned_by")
    serializer_class = AssignmentSerializer
    filterset_class = AssignmentFilter
    search_fields = ["student__first_name", "student__last_name", "student__registration_number", "room__number", "room__name"]
    role_access = {
        "list": READ_ALL, "retrieve": READ_ALL,
        "create": ADMIN_ROLES, "change_room": ADMIN_ROLES, "release": ADMIN_ROLES,
    }

    def scope_queryset(self, qs):
        user = self.request.user
        if user.role in ADMIN_ROLES:
            return qs
        return qs.filter(student__in=student_ids_for(user))  # maître : ses élèves ; parent : ses enfants

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        assignment = services.assign_student(
            d["student"], d["room"], user=request.user, bed_number=d.get("bed_number", ""), note=d.get("note", ""),
        )
        record(request, "BOARDING_ASSIGN", assignment, changes={"student": str(assignment.student_id), "room": str(assignment.room_id)})
        return Response(self.get_serializer(assignment).data, status=201)

    @action(detail=False, methods=["post"], url_path="change-room")
    def change_room(self, request):
        """Change un talibé de chambre : l'affectation précédente est clôturée, la nouvelle ouverte."""
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        previous = services.active_assignment(d["student"])
        assignment = services.change_room(
            d["student"], d["room"], user=request.user, bed_number=d.get("bed_number", ""), note=d.get("note", ""),
        )
        record(request, "BOARDING_CHANGE_ROOM", assignment, changes={
            "student": str(assignment.student_id),
            "room": {"old": previous.room_id if previous else None, "new": assignment.room_id},
        })
        return Response(self.get_serializer(assignment).data, status=201)

    @action(detail=True, methods=["post"])
    def release(self, request, pk=None):
        """Sortie définitive de l'internat (clôture l'affectation active)."""
        assignment = services.release(self.get_object(), user=request.user, reason=str(request.data.get("reason", ""))[:200])
        record(request, "BOARDING_RELEASE", assignment, changes={"student": str(assignment.student_id)})
        return Response(self.get_serializer(assignment).data)


class MovementFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="occurred_at", lookup_expr="date__gte")
    date_to = django_filters.DateFilter(field_name="occurred_at", lookup_expr="date__lte")

    class Meta:
        model = BoardingMovement
        fields = ["student", "kind"]


def _out_assignments(qs):
    last = BoardingMovement.objects.filter(student=OuterRef("student")).order_by("-occurred_at", "-created_at")
    return qs.filter(end_date__isnull=True).annotate(last_kind=Subquery(last.values("kind")[:1])).filter(last_kind=MovementKind.EXIT)


class MovementViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
                      mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Entrées / sorties de l'internat. Un mouvement enregistré n'est ni modifié ni supprimé."""

    queryset = BoardingMovement.objects.select_related("student", "recorded_by")
    serializer_class = MovementSerializer
    filterset_class = MovementFilter
    search_fields = ["student__first_name", "student__last_name", "student__registration_number", "reason"]
    role_access = {"list": READ_STAFF, "retrieve": READ_STAFF, "create": ADMIN_ROLES, "currently_out": READ_STAFF}

    def scope_queryset(self, qs):
        user = self.request.user
        if user.role == Role.MAITRE:
            return qs.filter(student__in=student_ids_for(user))
        return qs

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        mv = services.record_movement(
            d["student"], d["kind"], user=request.user, occurred_at=d.get("occurred_at"),
            reason=d.get("reason", ""), expected_return=d.get("expected_return"),
        )
        record(request, "BOARDING_MOVEMENT", mv, changes={"student": str(mv.student_id), "kind": mv.kind})
        return Response(self.get_serializer(mv).data, status=201)

    @action(detail=False, methods=["get"], url_path="currently-out")
    def currently_out(self, request):
        """Talibés de l'internat actuellement sortis (dernier mouvement = sortie)."""
        qs = _out_assignments(
            BoardingAssignment.objects.filter(establishment_id=request.user.establishment_id).select_related("student", "room", "room__building")
        )
        if request.user.role == Role.MAITRE:
            qs = qs.filter(student__in=student_ids_for(request.user))
        out = []
        for a in qs:
            mv = a.student.boarding_movements.filter(kind=MovementKind.EXIT).first()
            out.append({
                "student": str(a.student_id), "student_name": a.student.full_name,
                "registration_number": a.student.registration_number, "room": str(a.room_id),
                "room_label": a.room.name or a.room.number,
                "since": mv.occurred_at if mv else None, "expected_return": mv.expected_return if mv else None,
                "reason": mv.reason if mv else "",
            })
        return Response(out)


class OccupancyView(APIView):
    """Vue d'ensemble de l'occupation (agrégats : aucune identité d'enfant)."""

    permission_classes = [RolePermission]
    role_access = {"get": READ_STAFF}

    def get(self, request):
        est_id = request.user.establishment_id
        rooms = annotate_occupancy(Room.objects.filter(establishment_id=est_id).select_related("building", "supervisor")).order_by(
            "building__name", "number"
        )
        buildings: dict = {}
        total_capacity = total_occupied = 0
        for r in rooms:
            b = buildings.setdefault(r.building_id, {
                "id": str(r.building_id), "name": r.building.name, "capacity": 0, "occupied": 0, "free": 0, "rooms": [],
            })
            occ = r.occupancy_count or 0
            row = {
                "id": str(r.pk), "number": r.number, "name": r.name, "capacity": r.capacity, "occupancy": occ,
                "free_places": max(r.capacity - occ, 0), "is_active": r.is_active,
                "supervisor_name": r.supervisor.full_name if r.supervisor else "",
            }
            b["rooms"].append(row)
            b["occupied"] += occ
            if r.is_active:
                b["capacity"] += r.capacity
                b["free"] += row["free_places"]
                total_capacity += r.capacity
            total_occupied += occ
        # Les bâtiments sans chambre apparaissent aussi.
        for b in Building.objects.filter(establishment_id=est_id).order_by("name"):
            buildings.setdefault(b.pk, {"id": str(b.pk), "name": b.name, "capacity": 0, "occupied": 0, "free": 0, "rooms": []})
        out_count = _out_assignments(BoardingAssignment.objects.filter(establishment_id=est_id)).count()
        return Response({
            "capacity": total_capacity,
            "occupied": total_occupied,
            "free": max(total_capacity - total_occupied, 0),
            "occupancy_rate": round(100 * total_occupied / total_capacity, 1) if total_capacity else 0,
            "students_out": out_count,
            "buildings": sorted(buildings.values(), key=lambda b: b["name"]),
        })
