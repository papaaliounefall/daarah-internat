import datetime

import pytest

from apps.audit.models import AuditLog
from apps.memorization.models import Lesson
from apps.notifications.models import Notification
from conftest import client_for

pytestmark = pytest.mark.django_db


def lesson_payload(student, **kw):
    base = {"student": str(student.pk), "surah": 112, "ayah_start": 1, "ayah_end": 3, "quality": "JAYYID"}
    base.update(kw)
    return base


def post_lesson(client, student, **kw):
    return client.post("/api/lessons/", lesson_payload(student, **kw), format="json")


# ---------------------------------------------------------------- création ---------------
def test_teacher_creates_lesson_with_server_computed_location(corpus, teacher, student):
    r = post_lesson(client_for(teacher), student, juz=1, hizb=2, page=3)  # tentative d'injection ignorée
    assert r.status_code == 201, r.content
    d = r.json()
    assert (d["juz"], d["hizb"], d["page"]) == (30, 60, 604)
    assert d["surah_number"] == 112 and d["surah_name"] == "Al-Ikhlas" and d["surah_name_arabic"]
    assert d["student_name"] == "Mansour Fall" and d["teacher_name"]
    assert d["quality_label"] == "Bien" and d["quality_label_ar"]
    assert d["is_current"] is True and d["date"] == datetime.date.today().isoformat()
    assert d["class_name"] == "Hifz"
    lesson = Lesson.objects.get(pk=d["id"])
    assert lesson.teacher == teacher and lesson.establishment_id == teacher.establishment_id
    assert AuditLog.objects.filter(action="CREATE", model="Lesson", object_id=str(lesson.pk)).exists()


def test_director_can_create_for_any_student(corpus, director, teacher2, student2):
    r = post_lesson(client_for(director), student2)
    assert r.status_code == 201
    # sans maître précisé : le maître de la classe de l'élève
    assert Lesson.objects.get(pk=r.json()["id"]).teacher == teacher2


@pytest.mark.parametrize("payload", [
    {"ayah_start": 5, "ayah_end": 3},       # début > fin
    {"ayah_start": 1, "ayah_end": 5},       # la sourate 112 n'a que 4 versets
    {"ayah_start": 0, "ayah_end": 2},
    {"surah": 115},
    {"surah": 0},
])
def test_invalid_verse_ranges_rejected(corpus, teacher, student, payload):
    r = post_lesson(client_for(teacher), student, **payload)
    assert r.status_code == 400, r.content
    assert Lesson.objects.count() == 0


def test_range_error_messages_in_french(corpus, teacher, student):
    r = post_lesson(client_for(teacher), student, ayah_end=9)
    assert "n'existe pas" in str(r.json())


def test_unknown_or_inactive_quality_rejected(corpus, teacher, student, director):
    c = client_for(teacher)
    assert post_lesson(c, student, quality="INCONNU").status_code == 400
    from apps.memorization.models import QualityLevel

    QualityLevel.objects.filter(code="MAQBUL").update(is_active=False)
    assert post_lesson(c, student, quality="MAQBUL").status_code == 400


def test_quality_must_belong_to_own_establishment(corpus, teacher, student, other_est):
    from apps.memorization.models import QualityLevel

    QualityLevel.objects.filter(establishment=teacher.establishment, code="JAYYID").delete()
    assert post_lesson(client_for(teacher), student, quality="JAYYID").status_code == 400


def test_future_date_rejected(corpus, teacher, student):
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    assert post_lesson(client_for(teacher), student, date=tomorrow).status_code == 400


def test_teacher_cannot_create_for_other_class_student(corpus, teacher, student2):
    r = post_lesson(client_for(teacher), student2)
    assert r.status_code == 404
    assert Lesson.objects.count() == 0


def test_cannot_create_for_student_of_other_establishment(corpus, director, other_est):
    from .helpers import make_student

    foreign = make_student(other_est)
    assert post_lesson(client_for(director), foreign).status_code == 404


def test_archived_student_rejected(corpus, director, student):
    student.is_archived = True
    student.save()
    assert post_lesson(client_for(director), student).status_code == 400


@pytest.mark.parametrize("who", ["assistant", "parent"])
def test_assistant_and_parent_cannot_write(corpus, request, who, child):
    user = request.getfixturevalue(who)
    assert post_lesson(client_for(user), child).status_code == 403


def test_unauthenticated_rejected(corpus, student):
    from rest_framework.test import APIClient

    assert APIClient().post("/api/lessons/", lesson_payload(student), format="json").status_code in (401, 403)


# ---------------------------------------------------------------- lecture / périmètre ----
def test_teacher_only_sees_own_students_lessons(corpus, teacher, teacher2, student, student2, director):
    a = post_lesson(client_for(director), student).json()
    b = post_lesson(client_for(director), student2).json()
    c = client_for(teacher)
    assert {x["id"] for x in c.get("/api/lessons/").json()["results"]} == {a["id"]}
    assert c.get(f"/api/lessons/{a['id']}/").status_code == 200
    assert c.get(f"/api/lessons/{b['id']}/").status_code == 404


def test_assistant_reads_all_but_cannot_write(corpus, assistant, director, student, student2):
    post_lesson(client_for(director), student)
    post_lesson(client_for(director), student2)
    c = client_for(assistant)
    assert c.get("/api/lessons/").json()["count"] == 2
    lid = Lesson.objects.first().pk
    assert c.post(f"/api/lessons/{lid}/correct/", {"quality": "MAQBUL", "correction_reason": "x"}, format="json").status_code == 403


def test_isolation_between_establishments(corpus, director, other_director, student):
    lid = post_lesson(client_for(director), student).json()["id"]
    c = client_for(other_director)
    assert c.get("/api/lessons/").json()["count"] == 0
    assert c.get(f"/api/lessons/{lid}/").status_code == 404
    assert c.post(f"/api/lessons/{lid}/correct/", {"quality": "JAYYID", "correction_reason": "x"}, format="json").status_code == 404


def test_filters(corpus, director, student):
    c = client_for(director)
    post_lesson(c, student, surah=112, date="2026-01-10")
    post_lesson(c, student, surah=114, ayah_start=1, ayah_end=2, date="2026-02-10")
    assert c.get("/api/lessons/?surah=114").json()["count"] == 1
    assert c.get("/api/lessons/?date_after=2026-02-01").json()["count"] == 1
    assert c.get("/api/lessons/?date_before=2026-01-31").json()["count"] == 1
    assert c.get(f"/api/lessons/?student={student.pk}").json()["count"] == 2


# ---------------------------------------------------------------- parent -----------------
def test_parent_sees_only_children_and_no_internal_fields(corpus, director, teacher, parent, child, student2):
    c = client_for(teacher)
    r = post_lesson(c, child, observations="Hésite sur le tajwid", appreciation="Très appliqué").json()
    post_lesson(client_for(director), student2, observations="autre enfant")
    pc = client_for(parent)
    res = pc.get("/api/lessons/").json()["results"]
    assert [x["id"] for x in res] == [r["id"]]
    item = res[0]
    assert item["appreciation"] == "Très appliqué"
    for forbidden in ("observations", "correction_reason", "internal_notes", "is_current", "supersedes"):
        assert forbidden not in item
    assert "tajwid" not in str(pc.get(f"/api/lessons/{r['id']}/").json())
    other = Lesson.objects.get(student=student2)
    assert pc.get(f"/api/lessons/{other.pk}/").status_code == 404


def test_parent_never_sees_superseded_rows(corpus, teacher, parent, child):
    c = client_for(teacher)
    lid = post_lesson(c, child).json()["id"]
    c.post(f"/api/lessons/{lid}/correct/", {"quality": "MAQBUL", "correction_reason": "erreur"}, format="json")
    pc = client_for(parent)
    assert pc.get("/api/lessons/?include_history=true").json()["count"] == 1
    assert pc.get(f"/api/lessons/{lid}/").status_code == 404  # l'ancienne version n'est pas exposée


# ---------------------------------------------------------------- corrections ------------
def test_correction_creates_new_row_and_keeps_old(corpus, teacher, student):
    c = client_for(teacher)
    old = post_lesson(c, student, observations="v1").json()
    r = c.post(f"/api/lessons/{old['id']}/correct/",
               {"ayah_end": 4, "quality": "MUMTAZ", "correction_reason": "Erreur de saisie"}, format="json")
    assert r.status_code == 201, r.content
    new = r.json()
    assert new["id"] != old["id"] and new["supersedes"] == old["id"] and new["is_current"] is True
    assert new["ayah_end"] == 4 and new["quality"] == "MUMTAZ" and new["correction_reason"] == "Erreur de saisie"
    assert new["observations"] == "v1" and new["ayah_start"] == 1  # champs non fournis conservés
    o = Lesson.objects.get(pk=old["id"])
    assert o.is_current is False and o.ayah_end == 3 and o.quality == "JAYYID"  # ancienne ligne intacte
    assert Lesson.objects.count() == 2
    ids = {x["id"] for x in c.get("/api/lessons/").json()["results"]}
    assert ids == {new["id"]}
    allids = {x["id"] for x in c.get("/api/lessons/?include_history=true").json()["results"]}
    assert allids == {new["id"], old["id"]}
    assert AuditLog.objects.filter(action="CORRECT", object_id=new["id"]).exists()


def test_correction_requires_reason(corpus, teacher, student):
    c = client_for(teacher)
    lid = post_lesson(c, student).json()["id"]
    assert c.post(f"/api/lessons/{lid}/correct/", {"quality": "MUMTAZ"}, format="json").status_code == 400
    assert c.post(f"/api/lessons/{lid}/correct/", {"quality": "MUMTAZ", "correction_reason": "  "}, format="json").status_code == 400
    assert Lesson.objects.count() == 1


def test_correction_validates_range_again(corpus, teacher, student):
    c = client_for(teacher)
    lid = post_lesson(c, student).json()["id"]
    r = c.post(f"/api/lessons/{lid}/correct/", {"ayah_end": 99, "correction_reason": "x"}, format="json")
    assert r.status_code == 400 and Lesson.objects.count() == 1


def test_cannot_correct_a_superseded_lesson_twice(corpus, teacher, student):
    c = client_for(teacher)
    lid = post_lesson(c, student).json()["id"]
    assert c.post(f"/api/lessons/{lid}/correct/", {"quality": "MUMTAZ", "correction_reason": "a"}, format="json").status_code == 201
    r = c.post(f"/api/lessons/{lid}/correct/", {"quality": "MAQBUL", "correction_reason": "b"}, format="json")
    assert r.status_code == 400 and "déjà été corrigée" in str(r.json())
    assert Lesson.objects.count() == 2


def test_chain_of_corrections(corpus, teacher, student):
    c = client_for(teacher)
    first = post_lesson(c, student).json()["id"]
    second = c.post(f"/api/lessons/{first}/correct/", {"quality": "MUMTAZ", "correction_reason": "a"}, format="json").json()["id"]
    third = c.post(f"/api/lessons/{second}/correct/", {"quality": "MAQBUL", "correction_reason": "b"}, format="json").json()["id"]
    assert Lesson.objects.filter(is_current=True).get().pk.hex == third.replace("-", "")


def test_teacher_cannot_correct_other_class_lesson(corpus, teacher, director, student2):
    lid = post_lesson(client_for(director), student2).json()["id"]
    r = client_for(teacher).post(f"/api/lessons/{lid}/correct/", {"quality": "MUMTAZ", "correction_reason": "x"}, format="json")
    assert r.status_code == 404


def test_director_can_correct_and_teacher_attribution_kept(corpus, director, teacher, student):
    lid = post_lesson(client_for(teacher), student).json()["id"]
    r = client_for(director).post(f"/api/lessons/{lid}/correct/", {"quality": "MUMTAZ", "correction_reason": "Contrôle"}, format="json")
    assert r.status_code == 201
    assert Lesson.objects.get(pk=r.json()["id"]).teacher == teacher


def test_no_update_no_delete(corpus, teacher, director, student):
    c = client_for(director)
    lid = post_lesson(c, student).json()["id"]
    assert c.delete(f"/api/lessons/{lid}/").status_code in (403, 405)
    assert c.patch(f"/api/lessons/{lid}/", {"quality": "MUMTAZ"}, format="json").status_code in (403, 405)
    assert c.put(f"/api/lessons/{lid}/", lesson_payload(student), format="json").status_code in (403, 405)
    assert Lesson.objects.get(pk=lid).quality == "JAYYID"


# ---------------------------------------------------------------- notifications ----------
def test_lesson_notifies_guardians_only(corpus, teacher, parent, child, student2, est):
    from conftest import make_user
    from apps.core.roles import Role
    from apps.guardians.models import Guardianship

    stranger = make_user(est, Role.PARENT, "autreparent")
    Guardianship.objects.create(establishment=est, user=stranger, student=student2)
    post_lesson(client_for(teacher), child)
    notes = Notification.objects.all()
    assert notes.count() == 1
    n = notes.get()
    assert n.recipient == parent and n.kind == "CORAN" and n.link_type == "student" and n.link_id == str(child.pk)


def test_progress_derived_from_current_lesson(corpus, teacher, director, student):
    c = client_for(teacher)
    lid = post_lesson(c, student, surah=114, ayah_start=1, ayah_end=6).json()["id"]
    s = client_for(director).get(f"/api/students/{student.pk}/").json()
    assert s["current_surah_number"] == 114 and s["current_ayah"] == 6 and s["current_juz"] == 30
    c.post(f"/api/lessons/{lid}/correct/", {"ayah_end": 5, "correction_reason": "x"}, format="json")
    s = client_for(director).get(f"/api/students/{student.pk}/").json()
    assert s["current_ayah"] == 5  # la version courante prévaut
