import io

import pytest
from django.core.management import call_command

from apps.core.models import Establishment
from apps.memorization.defaults import seed_defaults
from apps.memorization.models import EvaluationCriterion, QualityLevel
from conftest import client_for

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------- semis ------------------
def test_new_establishment_gets_defaults_via_signal(db):
    est = Establishment.objects.create(name="Nouveau", slug="nouveau")
    codes = list(QualityLevel.objects.filter(establishment=est).order_by("rank").values_list("code", flat=True))
    assert codes == ["MUMTAZ", "JAYYID_JIDDAN", "JAYYID", "MAQBUL", "A_REVOIR"]
    crit = EvaluationCriterion.objects.filter(establishment=est)
    assert crit.count() == 4 and all(c.max_score == 20 for c in crit)
    assert QualityLevel.objects.get(establishment=est, code="MUMTAZ").label == "Excellent"


def test_seed_is_idempotent_and_keeps_customisation(est):
    QualityLevel.objects.filter(establishment=est, code="MUMTAZ").update(label="Parfait")
    EvaluationCriterion.objects.filter(establishment=est).first().delete()
    res = seed_defaults(est)
    assert res == {"quality_levels": 0, "criteria": 1}
    assert QualityLevel.objects.get(establishment=est, code="MUMTAZ").label == "Parfait"
    assert QualityLevel.objects.filter(establishment=est).count() == 5


def test_seed_command_for_existing_establishments(est, other_est):
    QualityLevel.objects.all().delete()
    EvaluationCriterion.objects.all().delete()
    out = io.StringIO()
    call_command("seed_memorization_defaults", stdout=out)
    assert QualityLevel.objects.filter(establishment=est).count() == 5
    assert QualityLevel.objects.filter(establishment=other_est).count() == 5
    call_command("seed_memorization_defaults", "--establishment", est.slug, stdout=out)
    assert QualityLevel.objects.count() == 10


# ---------------------------------------------------------------- configuration ----------
def test_quality_levels_read_by_all_write_by_director_only(est, director, assistant, teacher, parent):
    for u in (director, assistant, teacher, parent):
        r = client_for(u).get("/api/quality-levels/")
        assert r.status_code == 200 and r.json()["count"] == 5
    body = {"code": "FAIBLE", "label": "Faible", "label_ar": "ضعيف"}
    for u in (assistant, teacher, parent):
        assert client_for(u).post("/api/quality-levels/", body, format="json").status_code == 403
    r = client_for(director).post("/api/quality-levels/", body, format="json")
    assert r.status_code == 201 and r.json()["rank"] == 5  # ajouté en dernier
    assert client_for(director).post("/api/quality-levels/", body, format="json").status_code == 400  # doublon de code
    assert client_for(director).post("/api/quality-levels/", {"code": "bad code", "label": "x"}, format="json").status_code == 400


def test_quality_level_update_code_immutable_and_no_delete(est, director):
    c = client_for(director)
    q = QualityLevel.objects.get(establishment=est, code="MAQBUL")
    r = c.patch(f"/api/quality-levels/{q.pk}/", {"label": "Moyen", "is_active": False}, format="json")
    assert r.status_code == 200 and r.json()["label"] == "Moyen" and r.json()["is_active"] is False
    assert c.patch(f"/api/quality-levels/{q.pk}/", {"code": "AUTRE"}, format="json").status_code == 400
    assert c.delete(f"/api/quality-levels/{q.pk}/").status_code in (403, 405)
    assert QualityLevel.objects.filter(pk=q.pk).exists()


def test_quality_level_isolation(est, other_director):
    q = QualityLevel.objects.filter(establishment=est).first()
    c = client_for(other_director)
    assert c.get(f"/api/quality-levels/{q.pk}/").status_code == 404
    assert c.patch(f"/api/quality-levels/{q.pk}/", {"label": "x"}, format="json").status_code == 404


def test_criteria_configuration(est, director, teacher, student=None):
    c = client_for(director)
    assert client_for(teacher).post("/api/evaluation-criteria/", {"name": "Posture"}, format="json").status_code == 403
    r = c.post("/api/evaluation-criteria/", {"name": "Posture", "max_score": 10, "weight": 0.5}, format="json")
    assert r.status_code == 201 and r.json()["max_score"] in ("10.00", 10, 10.0)
    assert c.post("/api/evaluation-criteria/", {"name": "posture"}, format="json").status_code == 400  # doublon (casse ignorée)
    assert c.post("/api/evaluation-criteria/", {"name": "Zéro", "max_score": 0}, format="json").status_code == 400
    assert c.get("/api/evaluation-criteria/").json()["count"] == 5


def test_used_criterion_cannot_change_scale(corpus, est, director, teacher, student):
    cr = EvaluationCriterion.objects.filter(establishment=est).first()
    client_for(teacher).post(
        "/api/evaluations/", {"student": str(student.pk), "scores": [{"criterion": str(cr.pk), "score": 10}]}, format="json"
    )
    c = client_for(director)
    assert c.patch(f"/api/evaluation-criteria/{cr.pk}/", {"max_score": 10}, format="json").status_code == 400
    assert c.patch(f"/api/evaluation-criteria/{cr.pk}/", {"weight": 3}, format="json").status_code == 400
    assert c.patch(f"/api/evaluation-criteria/{cr.pk}/", {"name": "Renommé", "is_active": False}, format="json").status_code == 200


# ---------------------------------------------------------------- chronologie ------------
@pytest.fixture
def timeline_data(corpus, est, teacher, student):
    c = client_for(teacher)
    c.post("/api/lessons/", {"student": str(student.pk), "surah": 112, "ayah_start": 1, "ayah_end": 4, "quality": "MUMTAZ", "date": "2026-03-01"}, format="json")
    c.post("/api/lessons/", {"student": str(student.pk), "surah": 114, "ayah_start": 1, "ayah_end": 3, "quality": "JAYYID", "date": "2026-03-10"}, format="json")
    c.post("/api/revisions/", {"student": str(student.pk), "surah": 112, "ayah_start": 1, "ayah_end": 4, "quality": "JAYYID", "date": "2026-03-05"}, format="json")
    cr = EvaluationCriterion.objects.filter(establishment=est).first()
    c.post("/api/evaluations/", {"student": str(student.pk), "date": "2026-03-20", "scores": [{"criterion": str(cr.pk), "score": 15}]}, format="json")
    return student


def test_timeline_merges_and_sorts(timeline_data, teacher):
    r = client_for(teacher).get(f"/api/memorization/timeline/?student={timeline_data.pk}")
    assert r.status_code == 200
    items = r.json()["results"]
    assert [(i["type"], i["date"]) for i in items] == [
        ("EVALUATION", "2026-03-20"), ("LESSON", "2026-03-10"), ("REVISION", "2026-03-05"), ("LESSON", "2026-03-01"),
    ]


def test_timeline_filters(timeline_data, teacher, director):
    c = client_for(teacher)
    base = f"/api/memorization/timeline/?student={timeline_data.pk}"
    assert [i["type"] for i in c.get(base + "&type=LESSON").json()["results"]] == ["LESSON", "LESSON"]
    assert len(c.get(base + "&type=LESSON,REVISION").json()["results"]) == 3
    assert len(c.get(base + "&date_after=2026-03-06&date_before=2026-03-15").json()["results"]) == 1
    sur = c.get(base + "&surah=112").json()["results"]
    assert {i["type"] for i in sur} == {"LESSON", "REVISION"}  # pas d'évaluation quand on filtre par sourate
    assert len(c.get(base + f"&teacher={teacher.pk}").json()["results"]) == 4
    assert len(c.get(base + f"&teacher={director.pk}").json()["results"]) == 0


def test_timeline_validation(timeline_data, teacher):
    c = client_for(teacher)
    assert c.get("/api/memorization/timeline/").status_code == 400
    assert c.get(f"/api/memorization/timeline/?student={timeline_data.pk}&type=BIZARRE").status_code == 400
    assert c.get(f"/api/memorization/timeline/?student={timeline_data.pk}&date_after=pas-une-date").status_code == 400
    assert c.get("/api/memorization/timeline/?student=pas-un-uuid").status_code == 404


def test_timeline_scope_and_isolation(timeline_data, teacher2, other_director, assistant):
    url = f"/api/memorization/timeline/?student={timeline_data.pk}"
    assert client_for(teacher2).get(url).status_code == 404       # autre classe
    assert client_for(other_director).get(url).status_code == 404  # autre établissement
    assert client_for(assistant).get(url).status_code == 200


def test_timeline_for_parent_hides_internal_and_history(corpus, timeline_data, teacher, parent, est):
    from apps.guardians.models import Guardianship

    c = client_for(teacher)
    lessons = c.get("/api/lessons/").json()["results"]
    c.post(f"/api/lessons/{lessons[0]['id']}/correct/", {"observations": "interne", "correction_reason": "x"}, format="json")
    url = f"/api/memorization/timeline/?student={timeline_data.pk}"
    assert client_for(parent).get(url).status_code == 404  # pas encore lié à l'enfant
    Guardianship.objects.create(establishment=est, user=parent, student=timeline_data)
    res = client_for(parent).get(url + "&include_history=true").json()["results"]
    assert len(res) == 4  # historique ignoré pour les parents
    blob = str(res)
    assert "interne" not in blob and "observations" not in blob and "internal_notes" not in blob


def test_timeline_include_history_for_staff(timeline_data, teacher):
    c = client_for(teacher)
    lessons = c.get("/api/lessons/").json()["results"]
    c.post(f"/api/lessons/{lessons[0]['id']}/correct/", {"quality": "MAQBUL", "correction_reason": "x"}, format="json")
    url = f"/api/memorization/timeline/?student={timeline_data.pk}"
    assert len(c.get(url).json()["results"]) == 4
    assert len(c.get(url + "&include_history=true").json()["results"]) == 5
