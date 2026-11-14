
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.audit.models import AuditLog
from apps.staff.models import StaffMember, StaffPosition
from conftest import client_for

pytestmark = pytest.mark.django_db

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


def payload(**kw):
    base = {"full_name": "Cheikh Ndiaye", "category": "MAITRE", "role_title": "Maître coranique principal",
            "phone": "770000000", "email": "c@example.org", "hire_date": "2024-10-01", "id_number": "1234567890123",
            "notes": "Observation interne", "address": "Touba"}
    base.update(kw)
    return base


def create(api, **kw):
    r = api.post("/api/staff/", payload(**kw), format="json")
    assert r.status_code == 201, r.content
    return r.json()


def test_director_crud_and_initial_position(api):
    s = create(api)
    assert s["id_number"] == "1234567890123" and s["notes"]
    pos = api.get(f"/api/staff/{s['id']}/positions/").json()
    assert len(pos) == 1 and pos[0]["role_title"] == "Maître coranique principal" and pos[0]["end_date"] is None
    r = api.patch(f"/api/staff/{s['id']}/", {"phone": "771111111"}, format="json")
    assert r.status_code == 200 and r.json()["phone"] == "771111111"


def test_assistant_sees_only_limited_fields(api, assistant):
    s = create(api)
    c = client_for(assistant)
    rows = c.get("/api/staff/").json()["results"]
    assert set(rows[0]) == {"id", "full_name", "category", "role_title", "phone", "status"}
    one = c.get(f"/api/staff/{s['id']}/").json()
    assert "id_number" not in one and "notes" not in one and "email" not in one
    assert "1234567890123" not in str(rows) + str(one)


def test_assistant_cannot_write_or_access_sensitive(api, assistant):
    s = create(api)
    c = client_for(assistant)
    assert c.post("/api/staff/", payload(), format="json").status_code == 403
    assert c.patch(f"/api/staff/{s['id']}/", {"phone": "1"}, format="json").status_code == 403
    assert c.get(f"/api/staff/{s['id']}/documents/").status_code == 403
    assert c.get(f"/api/staff/{s['id']}/positions/").status_code == 403
    assert c.post(f"/api/staff/{s['id']}/leave/", {}, format="json").status_code == 403


def test_teacher_and_parent_have_no_access(api, teacher, parent):
    s = create(api)
    for user in (teacher, parent):
        c = client_for(user)
        assert c.get("/api/staff/").status_code == 403
        assert c.get(f"/api/staff/{s['id']}/").status_code == 403
        assert c.post("/api/staff/", payload(), format="json").status_code == 403


def test_unauthenticated_denied(api):
    from rest_framework.test import APIClient

    assert APIClient().get("/api/staff/").status_code in (401, 403)


def test_isolation_between_establishments(api, other_director):
    s = create(api)
    other = client_for(other_director)
    assert other.get("/api/staff/").json()["count"] == 0
    assert other.get(f"/api/staff/{s['id']}/").status_code == 404
    assert other.patch(f"/api/staff/{s['id']}/", {"phone": "1"}, format="json").status_code == 404
    assert other.get(f"/api/staff/{s['id']}/documents/").status_code == 404


def test_cannot_link_user_from_other_establishment(api, other_director):
    r = api.post("/api/staff/", payload(user=str(other_director.pk)), format="json")
    assert r.status_code == 400  # compte d'un autre Daara = inexistant


def test_link_user_rules(api, teacher, parent):
    assert api.post("/api/staff/", payload(user=str(parent.pk)), format="json").status_code == 400
    assert api.post("/api/staff/", payload(user=str(teacher.pk)), format="json").status_code == 201
    assert api.post("/api/staff/", payload(full_name="Autre", user=str(teacher.pk)), format="json").status_code == 400


def test_position_history_on_role_change(api):
    s = create(api)
    r = api.patch(f"/api/staff/{s['id']}/", {"role_title": "Directeur des études"}, format="json")
    assert r.status_code == 200 and r.json()["role_title"] == "Directeur des études"
    pos = StaffPosition.objects.filter(staff_id=s["id"]).order_by("created_at")
    assert pos.count() == 2 and pos[0].end_date is not None and pos[1].end_date is None
    r = api.post(f"/api/staff/{s['id']}/positions/", {"role_title": "Surveillant général", "start_date": "2026-01-10"}, format="json")
    assert r.status_code == 201
    assert StaffMember.objects.get(pk=s["id"]).role_title == "Surveillant général"
    assert StaffPosition.objects.filter(staff_id=s["id"], end_date__isnull=True).count() == 1


def test_leave_keeps_record(api):
    s = create(api)
    r = api.post(f"/api/staff/{s['id']}/leave/", {"end_date": "2026-06-30"}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "PARTI"
    assert StaffMember.objects.filter(pk=s["id"]).exists()
    assert not StaffPosition.objects.filter(staff_id=s["id"], end_date__isnull=True).exists()
    assert api.post(f"/api/staff/{s['id']}/leave/", {}, format="json").status_code == 400
    assert api.post(f"/api/staff/{create(api, full_name='X')['id']}/leave/", {"end_date": "2000-01-01"}, format="json").status_code == 400


def test_no_hard_delete(api):
    s = create(api)
    assert api.delete(f"/api/staff/{s['id']}/").status_code in (403, 405)
    assert StaffMember.objects.filter(pk=s["id"]).exists()


def test_documents_upload_validated_and_signed_url(api):
    s = create(api)
    ok = api.post(f"/api/staff/{s['id']}/documents/", {"title": "Contrat", "file": SimpleUploadedFile("contrat.pdf", PDF, "application/pdf")}, format="multipart")
    assert ok.status_code == 201, ok.content
    body = ok.json()
    assert "/api/files/" in body["file_url"] and "file" not in body
    bad = api.post(f"/api/staff/{s['id']}/documents/", {"title": "Faux", "file": SimpleUploadedFile("x.pdf", b"not a pdf")}, format="multipart")
    assert bad.status_code == 400
    exe = api.post(f"/api/staff/{s['id']}/documents/", {"title": "Exe", "file": SimpleUploadedFile("x.exe", PDF)}, format="multipart")
    assert exe.status_code == 400
    assert len(api.get(f"/api/staff/{s['id']}/documents/").json()) == 1


def test_sensitive_values_not_written_to_audit_log(api):
    s = create(api)
    api.patch(f"/api/staff/{s['id']}/", {"id_number": "SECRET-ID-999", "notes": "confidentiel"}, format="json")
    logs = AuditLog.objects.filter(model="StaffMember")
    assert logs.filter(action="UPDATE_SENSITIVE").exists()
    assert "SECRET-ID-999" not in str(list(logs.values_list("changes", flat=True)))
    assert "confidentiel" not in str(list(logs.values_list("changes", flat=True)))


def test_end_date_before_hire_rejected(api):
    r = api.post("/api/staff/", payload(end_date="2020-01-01"), format="json")
    assert r.status_code == 400
