import pytest

from apps.guardians.models import Guardianship
from apps.students.models import Student
from conftest import client_for

pytestmark = pytest.mark.django_db


def payload(**kw):
    base = {"first_name": "Mansour", "last_name": "Fall", "gender": "M", "status": "PAYANT"}
    base.update(kw)
    return base


def create_student(api, classroom=None, **kw):
    data = payload(**kw)
    if classroom is not None:
        data["classroom"] = str(classroom.pk)
    r = api.post("/api/students/", data, format="json")
    assert r.status_code == 201, r.content
    return r.json()


def test_create_generates_registration_number_and_enrolls(api, classroom, year):
    s = create_student(api, classroom)
    assert s["registration_number"].startswith("DAF-") and s["registration_number"].endswith("-0001")
    assert s["class_id"] == str(classroom.pk)
    assert s["academic_year_id"] == str(year.pk)
    assert create_student(api, classroom)["registration_number"].endswith("-0002")


def test_create_requires_active_year(api):
    r = api.post("/api/students/", payload(), format="json")
    assert r.status_code == 400


def test_capacity_enforced(api, classroom):
    for _ in range(3):
        create_student(api, classroom)
    r = api.post("/api/students/", {**payload(), "classroom": str(classroom.pk)}, format="json")
    assert r.status_code == 400
    assert "complète" in str(r.json())


def test_no_hard_delete(api, classroom):
    s = create_student(api, classroom)
    assert api.delete(f"/api/students/{s['id']}/").status_code in (403, 405)
    assert Student.objects.filter(pk=s["id"]).exists()


def test_archive_hides_from_default_list(api, classroom):
    s = create_student(api, classroom)
    assert api.post(f"/api/students/{s['id']}/archive/").status_code == 200
    assert api.get("/api/students/").json()["count"] == 0
    assert api.get("/api/students/?is_archived=true").json()["count"] == 1


def test_status_change_director_only_and_history(api, assistant, classroom):
    s = create_student(api, classroom)
    assert client_for(assistant).post(f"/api/students/{s['id']}/change-status/", {"status": "SOCIAL"}, format="json").status_code == 403
    r = api.post(f"/api/students/{s['id']}/change-status/", {"status": "SOCIAL", "reason": "Famille démunie"}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "SOCIAL"
    hist = api.get(f"/api/students/{s['id']}/status-history/").json()
    assert hist[0]["from_status"] == "PAYANT" and hist[0]["to_status"] == "SOCIAL"


def test_status_not_editable_through_patch(api, classroom):
    s = create_student(api, classroom)
    api.patch(f"/api/students/{s['id']}/", {"status": "SOCIAL"}, format="json")
    assert Student.objects.get(pk=s["id"]).status == "PAYANT"


def test_teacher_only_sees_own_class(api, teacher, teacher2, classroom, classroom2):
    mine = create_student(api, classroom, first_name="A")
    other = create_student(api, classroom2, first_name="B")
    c = client_for(teacher)
    ids = {x["id"] for x in c.get("/api/students/").json()["results"]}
    assert ids == {mine["id"]}
    assert c.get(f"/api/students/{other['id']}/").status_code == 404
    assert c.post("/api/students/", payload(), format="json").status_code == 403
    assert c.patch(f"/api/students/{mine['id']}/", {"first_name": "X"}, format="json").status_code == 403
    assert "notes" not in c.get(f"/api/students/{mine['id']}/").json()


def test_parent_only_sees_own_children_read_only(api, parent, classroom):
    mine = create_student(api, classroom, first_name="A")
    other = create_student(api, classroom, first_name="B")
    Guardianship.objects.create(establishment=parent.establishment, user=parent, student=Student.objects.get(pk=mine["id"]))
    c = client_for(parent)
    assert {x["id"] for x in c.get("/api/students/").json()["results"]} == {mine["id"]}
    assert c.get(f"/api/students/{other['id']}/").status_code == 404
    assert c.patch(f"/api/students/{mine['id']}/", {"first_name": "X"}, format="json").status_code == 403
    body = c.get(f"/api/students/{mine['id']}/").json()
    assert "notes" not in body


def test_tenant_isolation(api, other_director, classroom):
    s = create_student(api, classroom)
    other = client_for(other_director)
    assert other.get("/api/students/").json()["count"] == 0
    assert other.get(f"/api/students/{s['id']}/").status_code == 404
    assert other.patch(f"/api/students/{s['id']}/", {"first_name": "Hack"}, format="json").status_code == 404


def test_cannot_enroll_in_foreign_classroom(api, other_director, classroom, other_est):
    """IDOR : l'identifiant d'une classe d'un autre Daara est traité comme inexistant."""
    from apps.academics.models import AcademicYear, ClassRoom
    import datetime

    y = AcademicYear.objects.create(establishment=other_est, name="2026-2027", start_date=datetime.date(2026, 1, 1), end_date=datetime.date(2026, 12, 31))
    foreign = ClassRoom.objects.create(establishment=other_est, name="X", academic_year=y, capacity=5)
    r = api.post("/api/students/", {**payload(), "classroom": str(foreign.pk)}, format="json")
    assert r.status_code == 400


def test_requires_authentication():
    from rest_framework.test import APIClient

    assert APIClient().get("/api/students/").status_code == 401


def test_audit_trail_records_updates(api, classroom):
    from apps.audit.models import AuditLog

    s = create_student(api, classroom)
    api.patch(f"/api/students/{s['id']}/", {"address": "Kahone"}, format="json")
    log = AuditLog.objects.filter(action="UPDATE", model="Student").first()
    assert log and log.changes["address"]["new"] == "Kahone"


def test_change_class_keeps_history(api, classroom, classroom2):
    s = create_student(api, classroom)
    enr = api.get(f"/api/enrollments/?student={s['id']}").json()["results"][0]
    r = api.post(f"/api/enrollments/{enr['id']}/change-class/", {"classroom": str(classroom2.pk)}, format="json")
    assert r.status_code == 200
    assert len(r.json()["assignments"]) == 2
    assert api.get(f"/api/students/{s['id']}/").json()["class_id"] == str(classroom2.pk)
