import datetime

import pytest

from apps.attendance.models import AttendanceRecord
from apps.audit.models import AuditLog
from apps.notifications.models import Notification
from conftest import client_for

pytestmark = pytest.mark.django_db

TODAY = datetime.date.today()


def bulk(client, records, **kw):
    body = {"date": TODAY.isoformat(), "period": "MATIN", "records": records, **kw}
    return client.post("/api/attendance/bulk/", body, format="json")


def rec(student, status="PRESENT", **kw):
    return {"student": str(student.pk), "status": status, **kw}


# ---------------------------------------------------------------- saisie -----------------
def test_bulk_creates_records_for_class(teacher, classroom, student, student_b):
    r = bulk(client_for(teacher), [rec(student), rec(student_b, "RETARD", reason="Transport")], classroom=str(classroom.pk))
    assert r.status_code == 201, r.content
    d = r.json()
    assert (d["created"], d["updated"], d["unchanged"]) == (2, 0, 0)
    assert AttendanceRecord.objects.count() == 2
    late = AttendanceRecord.objects.get(student=student_b)
    assert late.status == "RETARD" and late.reason == "Transport" and late.classroom == classroom and late.recorded_by == teacher
    item = next(i for i in d["records"] if i["student_id"] == str(student_b.pk))
    assert item["student_name"] == "Abdou Ba" and item["class_name"] == "Hifz" and item["period"] == "MATIN"


def test_bulk_is_upsert_per_slot_and_audited(teacher, director, student):
    c = client_for(teacher)
    bulk(c, [rec(student, "ABSENT")])
    r = bulk(client_for(director), [rec(student, "EXCUSE", reason="Maladie")])
    assert r.status_code == 200 and (r.json()["created"], r.json()["updated"]) == (0, 1)
    assert AttendanceRecord.objects.count() == 1
    a = AttendanceRecord.objects.get()
    assert a.status == "EXCUSE" and a.reason == "Maladie" and a.recorded_by == director
    log = AuditLog.objects.get(action="UPDATE", model="AttendanceRecord")
    assert log.changes["status"] == {"old": "ABSENT", "new": "EXCUSE"}
    assert AuditLog.objects.filter(action="ATTENDANCE_UPSERT").count() == 2
    # même valeur renvoyée : inchangé
    r = bulk(client_for(director), [rec(student, "EXCUSE", reason="Maladie")])
    assert r.json()["unchanged"] == 1 and AuditLog.objects.filter(action="UPDATE").count() == 1


def test_other_period_is_another_slot(teacher, student):
    c = client_for(teacher)
    bulk(c, [rec(student)], period="MATIN")
    bulk(c, [rec(student, "ABSENT")], period="SOIR")
    assert AttendanceRecord.objects.count() == 2


def test_assistant_and_director_can_record_everywhere(assistant, director, student, student2):
    assert bulk(client_for(assistant), [rec(student), rec(student2)]).status_code == 201
    assert bulk(client_for(director), [rec(student2, "ABSENT")]).status_code == 200


def test_teacher_limited_to_own_classes(teacher, student, student2):
    r = bulk(client_for(teacher), [rec(student), rec(student2)])
    assert r.status_code == 404
    assert AttendanceRecord.objects.count() == 0  # lot refusé en entier


def test_teacher_cannot_use_other_classroom(teacher, classroom2, student2):
    assert bulk(client_for(teacher), [rec(student2)], classroom=str(classroom2.pk)).status_code == 404


def test_students_must_belong_to_given_classroom(director, classroom, student, student2):
    r = bulk(client_for(director), [rec(student), rec(student2)], classroom=str(classroom.pk))
    assert r.status_code == 400 and "Sow" in str(r.json())
    assert AttendanceRecord.objects.count() == 0


def test_parent_cannot_record(parent, child):
    assert bulk(client_for(parent), [rec(child)]).status_code == 403
    assert client_for(parent).post("/api/attendance/", rec(child), format="json").status_code == 403


def test_cross_establishment_student_rejected(director, other_est):
    from .helpers import make_student

    foreign = make_student(other_est)
    assert bulk(client_for(director), [rec(foreign)]).status_code == 404


@pytest.mark.parametrize("body", [
    {"records": []},
    {"records": [{"student": "pas-un-uuid", "status": "PRESENT"}]},
    {"period": "NUIT"},
])
def test_bulk_validation(director, student, body):
    payload = {"date": TODAY.isoformat(), "period": "MATIN", "records": [rec(student)], **body}
    assert client_for(director).post("/api/attendance/bulk/", payload, format="json").status_code == 400


def test_bulk_rejects_bad_status_future_date_duplicates_archived(director, student, student_b):
    c = client_for(director)
    assert bulk(c, [rec(student, "ABSENT_BIZARRE")]).status_code == 400
    future = (TODAY + datetime.timedelta(days=1)).isoformat()
    assert c.post("/api/attendance/bulk/", {"date": future, "records": [rec(student)]}, format="json").status_code == 400
    assert bulk(c, [rec(student), rec(student, "ABSENT")]).status_code == 400
    student_b.is_archived = True
    student_b.save()
    assert bulk(c, [rec(student_b)]).status_code == 404
    assert AttendanceRecord.objects.count() == 0


def test_single_create_is_upsert(teacher, student):
    c = client_for(teacher)
    body = {"student": str(student.pk), "status": "PRESENT", "date": TODAY.isoformat()}
    assert c.post("/api/attendance/", body, format="json").status_code == 201
    r = c.post("/api/attendance/", {**body, "status": "RETARD"}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "RETARD"
    assert AttendanceRecord.objects.count() == 1


def test_no_delete_no_patch(director, student):
    bulk(client_for(director), [rec(student)])
    pk = AttendanceRecord.objects.get().pk
    c = client_for(director)
    assert c.delete(f"/api/attendance/{pk}/").status_code in (403, 405)
    assert c.patch(f"/api/attendance/{pk}/", {"status": "ABSENT"}, format="json").status_code in (403, 405)
    assert AttendanceRecord.objects.count() == 1


# ---------------------------------------------------------------- notifications ----------
def test_absence_notifies_guardians_once_per_slot(teacher, child, parent):
    c = client_for(teacher)
    bulk(c, [rec(child, "ABSENT")])
    assert Notification.objects.count() == 1
    n = Notification.objects.get()
    assert n.recipient == parent and n.kind == "PRESENCE" and n.dedupe_key.startswith("absence:")
    # ré-enregistrement du même créneau, ou retour en absent après correction : aucune nouvelle alerte
    bulk(c, [rec(child, "ABSENT", reason="Inconnu")])
    bulk(c, [rec(child, "PRESENT")])
    bulk(c, [rec(child, "ABSENT")])
    assert Notification.objects.count() == 1
    # un autre créneau est une nouvelle absence
    bulk(c, [rec(child, "ABSENT")], period="SOIR")
    assert Notification.objects.count() == 2


@pytest.mark.parametrize("status", ["PRESENT", "RETARD", "EXCUSE"])
def test_only_unexcused_absence_notifies(teacher, child, status):
    bulk(client_for(teacher), [rec(child, status)])
    assert Notification.objects.count() == 0


def test_absence_only_notifies_own_guardians(teacher, child, student_b, est):
    from conftest import make_user
    from apps.core.roles import Role
    from apps.guardians.models import Guardianship

    other_parent = make_user(est, Role.PARENT, "parent2")
    Guardianship.objects.create(establishment=est, user=other_parent, student=student_b)
    bulk(client_for(teacher), [rec(child, "ABSENT")])
    assert set(Notification.objects.values_list("recipient__username", flat=True)) == {"parent"}


# ---------------------------------------------------------------- lecture ----------------
def test_list_filters(director, student, student_b):
    c = client_for(director)
    d1, d2 = TODAY - datetime.timedelta(days=2), TODAY
    for d in (d1, d2):
        c.post("/api/attendance/bulk/", {"date": d.isoformat(), "records": [rec(student, "ABSENT"), rec(student_b)]}, format="json")
    c.post("/api/attendance/bulk/", {"date": d2.isoformat(), "period": "SOIR", "records": [rec(student)]}, format="json")
    q = lambda s: c.get(f"/api/attendance/?{s}").json()["count"]
    assert q("") == 5
    assert q(f"date={d1.isoformat()}") == 2
    assert q(f"date_after={d2.isoformat()}") == 3
    assert q(f"date_before={d1.isoformat()}") == 2
    assert q("status=ABSENT") == 2
    assert q("period=SOIR") == 1
    assert q(f"student={student_b.pk}") == 2


def test_list_filter_by_classroom(director, classroom, classroom2, student, student2):
    c = client_for(director)
    bulk(c, [rec(student), rec(student2)])
    assert c.get(f"/api/attendance/?classroom={classroom.pk}").json()["count"] == 1
    assert c.get(f"/api/attendance/?classroom={classroom2.pk}").json()["count"] == 1


def test_teacher_sees_only_own_students(teacher, director, student, student2):
    bulk(client_for(director), [rec(student), rec(student2)])
    c = client_for(teacher)
    res = c.get("/api/attendance/").json()
    assert res["count"] == 1 and res["results"][0]["student_id"] == str(student.pk)
    other = AttendanceRecord.objects.get(student=student2)
    assert c.get(f"/api/attendance/{other.pk}/").status_code == 404


def test_parent_reads_only_children(parent, director, child, student2):
    bulk(client_for(director), [rec(child, "ABSENT", reason="x"), rec(student2)])
    c = client_for(parent)
    res = c.get("/api/attendance/").json()
    assert res["count"] == 1 and res["results"][0]["student_id"] == str(child.pk)
    other = AttendanceRecord.objects.get(student=student2)
    assert c.get(f"/api/attendance/{other.pk}/").status_code == 404
    assert c.get(f"/api/attendance/?student={student2.pk}").json()["count"] == 0


def test_isolation_between_establishments(director, other_director, student):
    bulk(client_for(director), [rec(student)])
    pk = AttendanceRecord.objects.get().pk
    c = client_for(other_director)
    assert c.get("/api/attendance/").json()["count"] == 0
    assert c.get(f"/api/attendance/{pk}/").status_code == 404
    assert c.get("/api/attendance/stats/").json()["total"] == 0


# ---------------------------------------------------------------- statistiques -----------
@pytest.fixture
def march(director, student, student_b, student2):
    c = client_for(director)
    days = [
        ("2026-03-02", [rec(student), rec(student_b, "ABSENT"), rec(student2)]),
        ("2026-03-03", [rec(student, "RETARD"), rec(student_b, "EXCUSE"), rec(student2, "ABSENT")]),
        ("2026-04-01", [rec(student, "ABSENT")]),
    ]
    for d, rows in days:
        r = c.post("/api/attendance/bulk/", {"date": d, "records": rows}, format="json")
        assert r.status_code == 201, r.content


def test_stats_for_classroom_and_month(march, teacher, classroom):
    r = client_for(teacher).get(f"/api/attendance/stats/?classroom={classroom.pk}&month=2026-03")
    assert r.status_code == 200
    d = r.json()
    assert d["month"] == "2026-03" and d["classroom"] == str(classroom.pk)
    assert (d["total"], d["present"], d["absent"], d["late"], d["excused"]) == (4, 1, 1, 1, 1)
    assert d["attendance_rate"] == 50.0  # (présent + retard) / total
    assert [x["date"] for x in d["by_day"]] == ["2026-03-02", "2026-03-03"]
    assert "by_classroom" not in d


def test_stats_all_classes_for_director_and_scope_for_teacher(march, director, teacher):
    d = client_for(director).get("/api/attendance/stats/?month=2026-03").json()
    assert d["total"] == 6 and len(d["by_classroom"]) == 2
    t = client_for(teacher).get("/api/attendance/stats/?month=2026-03").json()
    assert t["total"] == 4  # seulement sa classe


def test_stats_validation_and_access(march, teacher2, classroom, parent, assistant):
    assert client_for(teacher2).get(f"/api/attendance/stats/?classroom={classroom.pk}&month=2026-03").status_code == 404
    assert client_for(parent).get("/api/attendance/stats/").status_code == 403
    assert client_for(assistant).get("/api/attendance/stats/?month=2026-03").status_code == 200
    c = client_for(assistant)
    assert c.get("/api/attendance/stats/?month=2026-13").status_code == 400
    assert c.get("/api/attendance/stats/?month=mars").status_code == 400
    assert c.get("/api/attendance/stats/?month=2026-03&classroom=zzz").status_code == 404
    assert c.get("/api/attendance/stats/?month=2025-01").json()["attendance_rate"] is None


def test_monthly_report(march, director, classroom, student, student_b, est):
    from .helpers import make_student

    ghost = make_student(est, classroom, first_name="Zero", last_name="Zed")  # inscrit, jamais pointé
    r = client_for(director).get(f"/api/attendance/monthly-report/?classroom={classroom.pk}&month=2026-03")
    assert r.status_code == 200
    d = r.json()
    assert d["class_name"] == "Hifz" and d["month"] == "2026-03" and d["days_recorded"] == 2
    by = {s["student_id"]: s for s in d["students"]}
    assert set(by) == {str(student.pk), str(student_b.pk), str(ghost.pk)}
    assert (by[str(student.pk)]["present"], by[str(student.pk)]["late"], by[str(student.pk)]["total"]) == (1, 1, 2)
    assert by[str(student.pk)]["attendance_rate"] == 100.0
    assert (by[str(student_b.pk)]["absent"], by[str(student_b.pk)]["excused"]) == (1, 1)
    assert by[str(ghost.pk)]["total"] == 0 and by[str(ghost.pk)]["attendance_rate"] is None
    assert [s["student_name"] for s in d["students"]] == ["Abdou Ba", "Mansour Fall", "Zero Zed"]
    assert d["totals"]["total"] == 4


def test_monthly_report_rules(march, teacher, teacher2, parent, classroom):
    assert client_for(teacher).get("/api/attendance/monthly-report/?month=2026-03").status_code == 400
    assert client_for(teacher2).get(f"/api/attendance/monthly-report/?classroom={classroom.pk}").status_code == 404
    assert client_for(parent).get(f"/api/attendance/monthly-report/?classroom={classroom.pk}").status_code == 403
    assert client_for(teacher).get(f"/api/attendance/monthly-report/?classroom={classroom.pk}&month=2026-03").status_code == 200
