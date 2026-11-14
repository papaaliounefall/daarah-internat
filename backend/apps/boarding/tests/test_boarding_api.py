import pytest

from apps.boarding.models import BoardingAssignment, BoardingMovement, Building, Room
from apps.guardians.models import Guardianship
from apps.staff.models import StaffMember
from apps.students.models import Student
from conftest import client_for

pytestmark = pytest.mark.django_db


def mk_student(est, first="Ali", **kw):
    return Student.objects.create(establishment=est, first_name=first, last_name="Diop", gender="M", **kw)


@pytest.fixture
def building(est):
    return Building.objects.create(establishment=est, name="Bâtiment Fatima")


@pytest.fixture
def room(est, building):
    return Room.objects.create(establishment=est, building=building, number="101", name="Médine", capacity=2)


@pytest.fixture
def room2(est, building):
    return Room.objects.create(establishment=est, building=building, number="102", capacity=2)


def assign(api, student, room, **kw):
    return api.post("/api/boarding/assignments/", {"student": str(student.pk), "room": str(room.pk), **kw}, format="json")


# ---------- droits par rôle ----------
def test_roles_on_buildings_and_rooms(api, assistant, teacher, parent, building, room):
    assert client_for(assistant).post("/api/boarding/buildings/", {"name": "Bât. B"}, format="json").status_code == 201
    assert client_for(teacher).get("/api/boarding/rooms/").status_code == 200
    assert client_for(teacher).post("/api/boarding/buildings/", {"name": "Bât. C"}, format="json").status_code == 403
    assert client_for(teacher).patch(f"/api/boarding/rooms/{room.pk}/", {"capacity": 5}, format="json").status_code == 403
    assert client_for(parent).post("/api/boarding/rooms/", {}, format="json").status_code == 403
    assert client_for(parent).get("/api/boarding/buildings/").status_code == 403
    assert client_for(parent).get("/api/boarding/occupancy/").status_code == 403
    assert client_for(parent).get("/api/boarding/movements/").status_code == 403


def test_only_admin_roles_assign(api, teacher, parent, est, room):
    s = mk_student(est)
    assert assign(client_for(teacher), s, room).status_code == 403
    assert assign(client_for(parent), s, room).status_code == 403
    assert assign(api, s, room).status_code == 201


def test_no_hard_delete(api, building, room):
    assert api.delete(f"/api/boarding/rooms/{room.pk}/").status_code in (403, 405)
    assert api.delete(f"/api/boarding/buildings/{building.pk}/").status_code in (403, 405)
    assert Room.objects.filter(pk=room.pk).exists()


# ---------- chambres ----------
def test_room_crud_and_supervisor(api, est, building):
    sup = StaffMember.objects.create(establishment=est, full_name="Surveillant Général", role_title="Surveillant")
    r = api.post("/api/boarding/rooms/", {"building": str(building.pk), "number": "201", "capacity": 4, "supervisor": str(sup.pk)}, format="json")
    assert r.status_code == 201, r.content
    body = r.json()
    assert body["occupancy"] == 0 and body["free_places"] == 4
    assert body["supervisor_name"] == "Surveillant Général" and body["building_name"] == "Bâtiment Fatima"
    dup = api.post("/api/boarding/rooms/", {"building": str(building.pk), "number": "201", "capacity": 4}, format="json")
    assert dup.status_code == 400


def test_room_capacity_cannot_go_below_occupancy(api, est, room):
    for n in ("A", "B"):
        assert assign(api, mk_student(est, n), room).status_code == 201
    r = api.patch(f"/api/boarding/rooms/{room.pk}/", {"capacity": 1}, format="json")
    assert r.status_code == 400
    assert api.patch(f"/api/boarding/rooms/{room.pk}/", {"is_active": False}, format="json").status_code == 400
    assert api.get(f"/api/boarding/rooms/{room.pk}/").json()["occupancy"] == 2


# ---------- affectations ----------
def test_capacity_is_enforced(api, est, room):
    assert assign(api, mk_student(est, "A"), room).status_code == 201
    assert assign(api, mk_student(est, "B"), room).status_code == 201
    r = assign(api, mk_student(est, "C"), room)
    assert r.status_code == 400 and "complète" in str(r.json())
    assert BoardingAssignment.objects.filter(room=room, end_date__isnull=True).count() == 2


def test_double_assignment_refused(api, est, room, room2):
    s = mk_student(est)
    assert assign(api, s, room).status_code == 201
    r = assign(api, s, room2)
    assert r.status_code == 400 and "déjà une affectation" in str(r.json())
    assert BoardingAssignment.objects.filter(student=s, end_date__isnull=True).count() == 1


def test_bed_already_taken(api, est, room):
    assert assign(api, mk_student(est, "A"), room, bed_number="L1").status_code == 201
    r = assign(api, mk_student(est, "B"), room, bed_number="L1")
    assert r.status_code == 400 and "bed_number" in r.json()


def test_archived_student_refused(api, est, room):
    s = mk_student(est, is_archived=True)
    assert assign(api, s, room).status_code == 400


def test_inactive_room_refused(api, est, room):
    room.is_active = False
    room.save()
    assert assign(api, mk_student(est), room).status_code == 400


def test_change_room_closes_previous_and_keeps_history(api, est, room, room2):
    s = mk_student(est)
    assign(api, s, room, bed_number="L1")
    r = api.post("/api/boarding/assignments/change-room/", {"student": str(s.pk), "room": str(room2.pk), "bed_number": "L2"}, format="json")
    assert r.status_code == 201, r.content
    rows = BoardingAssignment.objects.filter(student=s).order_by("created_at")
    assert rows.count() == 2  # l'historique est conservé
    assert rows[0].end_date is not None and rows[1].end_date is None and rows[1].room_id == room2.pk
    hist = api.get(f"/api/boarding/assignments/?student={s.pk}").json()
    assert hist["count"] == 2
    assert api.get(f"/api/boarding/assignments/?student={s.pk}&active=true").json()["count"] == 1


def test_change_room_respects_capacity_and_no_active(api, est, room, room2):
    a, b, c = mk_student(est, "A"), mk_student(est, "B"), mk_student(est, "C")
    for st in (a, b):
        assign(api, st, room2)
    assign(api, c, room)
    r = api.post("/api/boarding/assignments/change-room/", {"student": str(c.pk), "room": str(room2.pk)}, format="json")
    assert r.status_code == 400
    assert BoardingAssignment.objects.get(student=c, end_date__isnull=True).room_id == room.pk  # rien n'a bougé
    nobody = mk_student(est, "Z")
    assert api.post("/api/boarding/assignments/change-room/", {"student": str(nobody.pk), "room": str(room.pk)}, format="json").status_code == 400


def test_change_bed_within_same_room_when_full(api, est, room):
    a, b = mk_student(est, "A"), mk_student(est, "B")
    assign(api, a, room, bed_number="L1")
    assign(api, b, room, bed_number="L2")
    r = api.post("/api/boarding/assignments/change-room/", {"student": str(a.pk), "room": str(room.pk), "bed_number": "L3"}, format="json")
    assert r.status_code == 201, r.content  # il quitte sa place : la chambre pleine ne bloque pas le changement de lit


def test_release_ends_assignment_without_delete(api, est, room):
    s = mk_student(est)
    a = assign(api, s, room).json()
    r = api.post(f"/api/boarding/assignments/{a['id']}/release/", {"reason": "Fin de scolarité"}, format="json")
    assert r.status_code == 200 and r.json()["end_date"] is not None and r.json()["is_active"] is False
    assert BoardingAssignment.objects.filter(pk=a["id"]).exists()
    assert api.post(f"/api/boarding/assignments/{a['id']}/release/", {}, format="json").status_code == 400
    assert assign(api, s, room).status_code == 201  # le talibé peut réintégrer plus tard


# ---------- isolation ----------
def test_other_establishment_cannot_see_or_use(api, other_director, est, room):
    s = mk_student(est)
    assign(api, s, room)
    other = client_for(other_director)
    assert other.get(f"/api/boarding/rooms/{room.pk}/").status_code == 404
    assert other.get("/api/boarding/rooms/").json()["count"] == 0
    assert other.get("/api/boarding/assignments/").json()["count"] == 0
    r = other.post("/api/boarding/assignments/", {"student": str(s.pk), "room": str(room.pk)}, format="json")
    assert r.status_code == 400  # identifiants étrangers = inexistants (anti-IDOR)
    assert other.get("/api/boarding/occupancy/").json()["capacity"] == 0


def test_cannot_use_foreign_room_with_own_student(other_director, other_est, est, room):
    mine = mk_student(other_est)
    r = client_for(other_director).post("/api/boarding/assignments/", {"student": str(mine.pk), "room": str(room.pk)}, format="json")
    assert r.status_code == 400
    assert not BoardingAssignment.objects.exists()


# ---------- périmètre maître / parent ----------
def test_parent_sees_only_children_room_without_other_occupants(api, parent, est, room, room2):
    mine, other = mk_student(est, "Mine"), mk_student(est, "Other")
    Guardianship.objects.create(establishment=est, user=parent, student=mine)
    assign(api, mine, room, bed_number="L1")
    assign(api, other, room, bed_number="L2")
    assign(api, mk_student(est, "Third"), room2)
    c = client_for(parent)
    rooms = c.get("/api/boarding/rooms/").json()["results"]
    assert [r["id"] for r in rooms] == [str(room.pk)]  # room2 n'est pas visible
    assert "occupancy" not in rooms[0] and "capacity" not in rooms[0]
    assert [x["student_name"] for x in rooms[0]["my_children"]] == ["Mine Diop"]
    assert "Other" not in str(rooms)
    assert c.get(f"/api/boarding/rooms/{room2.pk}/").status_code == 404
    assert c.get(f"/api/boarding/rooms/{room.pk}/occupants/").status_code == 403
    mine_rows = c.get("/api/boarding/assignments/").json()
    assert mine_rows["count"] == 1 and mine_rows["results"][0]["student"] == str(mine.pk)


def test_teacher_sees_only_own_students_among_occupants(api, teacher, est, room, classroom):
    from apps.academics.models import Enrollment

    mine, other = mk_student(est, "Mine"), mk_student(est, "Other")
    Enrollment.objects.create(establishment=est, student=mine, academic_year=classroom.academic_year, classroom=classroom)
    assign(api, mine, room)
    assign(api, other, room)
    c = client_for(teacher)
    occ = c.get(f"/api/boarding/rooms/{room.pk}/occupants/").json()
    assert [o["student"] for o in occ] == [str(mine.pk)]
    assert c.get("/api/boarding/assignments/").json()["count"] == 1
    assert c.get("/api/boarding/rooms/").json()["results"][0]["occupancy"] == 2  # agrégat seulement


# ---------- mouvements ----------
def test_movements_flow(api, est, room):
    s = mk_student(est)
    body = {"student": str(s.pk), "kind": "SORTIE", "reason": "Week-end en famille"}
    assert api.post("/api/boarding/movements/", body, format="json").status_code == 400  # pas à l'internat
    assign(api, s, room)
    assert api.post("/api/boarding/movements/", {"student": str(s.pk), "kind": "ENTREE"}, format="json").status_code == 400  # déjà présent
    assert api.post("/api/boarding/movements/", body, format="json").status_code == 201
    assert api.post("/api/boarding/movements/", body, format="json").status_code == 400  # déjà sorti
    out = api.get("/api/boarding/movements/currently-out/").json()
    assert [o["student"] for o in out] == [str(s.pk)]
    assert api.get("/api/boarding/occupancy/").json()["students_out"] == 1
    assert api.post("/api/boarding/movements/", {"student": str(s.pk), "kind": "ENTREE"}, format="json").status_code == 201
    assert api.get("/api/boarding/movements/currently-out/").json() == []
    mv = BoardingMovement.objects.first()
    assert api.patch(f"/api/boarding/movements/{mv.pk}/", {"reason": "x"}, format="json").status_code in (403, 405)
    assert api.delete(f"/api/boarding/movements/{mv.pk}/").status_code in (403, 405)
    assert BoardingMovement.objects.filter(pk=mv.pk).exists()


def test_movement_future_date_refused(api, est, room):
    s = mk_student(est)
    assign(api, s, room)
    r = api.post("/api/boarding/movements/", {"student": str(s.pk), "kind": "SORTIE", "occurred_at": "2999-01-01T10:00:00Z"}, format="json")
    assert r.status_code == 400


# ---------- occupation ----------
def test_occupancy_endpoint(api, assistant, est, building, room, room2):
    assign(api, mk_student(est, "A"), room)
    assign(api, mk_student(est, "B"), room2)
    data = client_for(assistant).get("/api/boarding/occupancy/").json()
    assert data["capacity"] == 4 and data["occupied"] == 2 and data["free"] == 2 and data["occupancy_rate"] == 50.0
    assert len(data["buildings"]) == 1 and len(data["buildings"][0]["rooms"]) == 2


def test_audit_trail_for_assignment(api, est, room):
    from apps.audit.models import AuditLog

    assign(api, mk_student(est), room)
    assert AuditLog.objects.filter(action="BOARDING_ASSIGN").exists()
