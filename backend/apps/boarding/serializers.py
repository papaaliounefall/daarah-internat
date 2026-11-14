from rest_framework import serializers

from apps.core.serializers import TenantModelSerializer

from .models import BoardingAssignment, BoardingMovement, Building, Room


class BuildingSerializer(TenantModelSerializer):
    rooms_count = serializers.IntegerField(source="rooms.count", read_only=True)

    class Meta:
        model = Building
        fields = ["id", "name", "rooms_count"]
        read_only_fields = ["id"]

    def validate_name(self, value):
        value = value.strip()
        qs = Building.objects.filter(establishment_id=self.context["request"].user.establishment_id, name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Un bâtiment porte déjà ce nom.")
        return value


class RoomSerializer(TenantModelSerializer):
    building_name = serializers.CharField(source="building.name", read_only=True)
    supervisor_name = serializers.CharField(source="supervisor.full_name", read_only=True, default="")
    occupancy = serializers.SerializerMethodField()
    free_places = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = ["id", "building", "building_name", "number", "name", "capacity", "occupancy", "free_places",
                  "supervisor", "supervisor_name", "is_active"]
        read_only_fields = ["id"]

    def get_occupancy(self, obj) -> int:
        n = getattr(obj, "occupancy_count", None)
        return n if n is not None else obj.assignments.filter(end_date__isnull=True).count()

    def get_free_places(self, obj) -> int:
        return max(obj.capacity - self.get_occupancy(obj), 0)

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("La capacité doit être d'au moins 1 place.")
        if self.instance is not None:
            used = self.instance.assignments.filter(end_date__isnull=True).count()
            if value < used:
                raise serializers.ValidationError(f"{used} talibé(s) occupent déjà cette chambre : capacité minimale {used}.")
        return value

    def validate_supervisor(self, value):
        if value is not None and value.status == "PARTI":
            raise serializers.ValidationError("Ce membre du personnel a quitté l'établissement.")
        return value

    def validate(self, attrs):
        building = attrs.get("building", getattr(self.instance, "building", None))
        number = attrs.get("number", getattr(self.instance, "number", None))
        if building is not None and number:
            qs = Room.objects.filter(building=building, number__iexact=number.strip())
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"number": "Ce numéro de chambre existe déjà dans ce bâtiment."})
        if self.instance is not None and attrs.get("is_active") is False:
            if self.instance.assignments.filter(end_date__isnull=True).exists():
                raise serializers.ValidationError({"is_active": "Des talibés occupent encore cette chambre."})
        return attrs


class ParentRoomSerializer(serializers.ModelSerializer):
    """Ce qu'un parent voit : la chambre de SES enfants, sans effectif ni liste des autres occupants."""

    building_name = serializers.CharField(source="building.name", read_only=True)
    supervisor_name = serializers.CharField(source="supervisor.full_name", read_only=True, default="")
    my_children = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = ["id", "building_name", "number", "name", "supervisor_name", "my_children"]
        read_only_fields = fields

    def get_my_children(self, obj):
        user = self.context["request"].user
        qs = obj.assignments.filter(end_date__isnull=True, student__guardianships__user=user).select_related("student")
        return [
            {"student": str(a.student_id), "student_name": a.student.full_name, "bed_number": a.bed_number,
             "start_date": a.start_date}
            for a in qs
        ]


class AssignmentSerializer(TenantModelSerializer):
    """Lecture et validation d'entrée d'une affectation ; l'écriture passe par ``services``."""

    student_name = serializers.CharField(source="student.full_name", read_only=True)
    registration_number = serializers.CharField(source="student.registration_number", read_only=True)
    room_label = serializers.SerializerMethodField()
    building_name = serializers.CharField(source="room.building.name", read_only=True)
    assigned_by_name = serializers.CharField(source="assigned_by.full_name", read_only=True, default="")
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = BoardingAssignment
        fields = ["id", "student", "student_name", "registration_number", "room", "room_label", "building_name",
                  "bed_number", "start_date", "end_date", "note", "assigned_by_name", "is_active", "created_at"]
        read_only_fields = ["id", "start_date", "end_date", "created_at"]

    def get_room_label(self, obj) -> str:
        return obj.room.name or obj.room.number

    def get_is_active(self, obj) -> bool:
        return obj.end_date is None


class MovementSerializer(TenantModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    registration_number = serializers.CharField(source="student.registration_number", read_only=True)
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True, default="")

    class Meta:
        model = BoardingMovement
        fields = ["id", "student", "student_name", "registration_number", "kind", "occurred_at", "reason",
                  "expected_return", "recorded_by_name", "created_at"]
        read_only_fields = ["id", "created_at"]
