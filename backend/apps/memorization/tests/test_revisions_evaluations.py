from decimal import Decimal

import pytest

from apps.memorization.models import Evaluation, EvaluationCriterion, EvaluationScore, Revision
from apps.notifications.models import Notification
from conftest import client_for

pytestmark = pytest.mark.django_db


def rev_payload(student, **kw):
    base = {"student": str(student.pk), "surah": 114, "ayah_start": 1, "ayah_end": 6, "quality": "JAYYID_JIDDAN"}
    base.update(kw)
    return base


def criteria(est):
    return list(EvaluationCriterion.objects.filter(establishment=est).order_by("order"))


def eval_payload(student, est, scores=None, **kw):
    cr = criteria(est)
    scores = scores if scores is not None else [(cr[0], 16), (cr[1], 12)]
    base = {"student": str(student.pk), "scope": "Sourate An-Nas",
            "scores": [{"criterion": str(c.pk), "score": s} for c, s in scores]}
    base.update(kw)
    return base


# ---------------------------------------------------------------- révisions --------------
def test_revision_create_and_range(corpus, teacher, student):
    c = client_for(teacher)
    r = c.post("/api/revisions/", rev_payload(student, difficulties="Confond deux versets"), format="json")
    assert r.status_code == 201, r.content
    d = r.json()
    assert d["ayah_range"] == "1-6" and d["surah_name"] == "An-Nas" and d["difficulties"] == "Confond deux versets"
    assert c.post("/api/revisions/", rev_payload(student, ayah_end=7), format="json").status_code == 400
    assert c.post("/api/revisions/", rev_payload(student, ayah_start=4, ayah_end=2), format="json").status_code == 400
    assert Revision.objects.count() == 1


def test_revision_scope_and_roles(corpus, teacher, student2, assistant, parent, child):
    assert client_for(teacher).post("/api/revisions/", rev_payload(student2), format="json").status_code == 404
    assert client_for(assistant).post("/api/revisions/", rev_payload(child), format="json").status_code == 403
    assert client_for(parent).post("/api/revisions/", rev_payload(child), format="json").status_code == 403


def test_revision_parent_view_hides_internal_fields(corpus, teacher, parent, child):
    c = client_for(teacher)
    c.post("/api/revisions/", rev_payload(child, difficulties="D", recommendations="R", appreciation="Bravo"), format="json")
    item = client_for(parent).get("/api/revisions/").json()["results"][0]
    assert item["appreciation"] == "Bravo"
    for f in ("difficulties", "recommendations", "correction_reason", "is_current"):
        assert f not in item


def test_revision_correction_keeps_history(corpus, teacher, student):
    c = client_for(teacher)
    old = c.post("/api/revisions/", rev_payload(student), format="json").json()
    r = c.post(f"/api/revisions/{old['id']}/correct/", {"ayah_end": 3, "correction_reason": "Plage erronée"}, format="json")
    assert r.status_code == 201 and r.json()["supersedes"] == old["id"]
    assert Revision.objects.get(pk=old["id"]).is_current is False
    assert Revision.objects.get(pk=old["id"]).ayah_end == 6
    assert c.get("/api/revisions/").json()["count"] == 1
    assert c.get("/api/revisions/?include_history=true").json()["count"] == 2
    assert c.post(f"/api/revisions/{old['id']}/correct/", {"correction_reason": "x"}, format="json").status_code == 400
    assert c.post(f"/api/revisions/{r.json()['id']}/correct/", {"ayah_end": 99, "correction_reason": "x"}, format="json").status_code == 400


def test_revision_no_notification(corpus, teacher, child):
    client_for(teacher).post("/api/revisions/", rev_payload(child), format="json")
    assert Notification.objects.count() == 0


# ---------------------------------------------------------------- évaluations ------------
def test_default_criteria_exist(est):
    names = [c.name for c in criteria(est)]
    assert names == ["Exactitude de la mémorisation", "Fluidité de la récitation",
                     "Respect des règles de tajwid", "Autonomie du talibé"]


def test_evaluation_overall_score_is_weighted_average_on_20(corpus, teacher, student, est):
    cr = criteria(est)
    cr[0].max_score, cr[0].weight = Decimal("10"), Decimal("2")  # note sur 10, poids 2
    cr[0].save()
    cr[1].weight = Decimal("1")
    cr[1].save()
    payload = eval_payload(student, est, scores=[(cr[0], 8), (cr[1], 14)])
    r = client_for(teacher).post("/api/evaluations/", payload, format="json")
    assert r.status_code == 201, r.content
    # (8/10*20*2 + 14/20*20*1) / 3 = (32 + 14) / 3 = 15.33
    assert Decimal(str(r.json()["overall_score"])) == Decimal("15.33")
    assert len(r.json()["scores"]) == 2 and r.json()["scores"][0]["criterion_name"]


def test_evaluation_overall_score_ignores_client_value(corpus, teacher, student, est):
    payload = eval_payload(student, est)
    payload["overall_score"] = 20
    r = client_for(teacher).post("/api/evaluations/", payload, format="json")
    assert Decimal(str(r.json()["overall_score"])) == Decimal("14")  # (16 + 12) / 2


@pytest.mark.parametrize("bad", [
    [(0, 25)],            # au-dessus du max
    [(0, -1)],            # négatif
    [(0, 10), (0, 12)],   # critère noté deux fois
    [],                   # aucun critère
])
def test_evaluation_score_validation(corpus, teacher, student, est, bad):
    cr = criteria(est)
    scores = [(cr[i], s) for i, s in bad]
    r = client_for(teacher).post("/api/evaluations/", eval_payload(student, est, scores=scores), format="json")
    assert r.status_code == 400, r.content
    assert Evaluation.objects.count() == 0


def test_evaluation_inactive_or_foreign_criterion_rejected(corpus, teacher, student, est, other_est):
    cr = criteria(est)
    cr[0].is_active = False
    cr[0].save()
    c = client_for(teacher)
    assert c.post("/api/evaluations/", eval_payload(student, est, scores=[(cr[0], 10)]), format="json").status_code == 400
    foreign = EvaluationCriterion.objects.filter(establishment=other_est).first()
    r = c.post("/api/evaluations/", {"student": str(student.pk), "scores": [{"criterion": str(foreign.pk), "score": 10}]}, format="json")
    assert r.status_code == 400
    assert Evaluation.objects.count() == 0


def test_evaluation_roles_and_scope(corpus, teacher, student2, student, est, assistant, parent, child):
    assert client_for(teacher).post("/api/evaluations/", eval_payload(student2, est), format="json").status_code == 404
    assert client_for(assistant).post("/api/evaluations/", eval_payload(student, est), format="json").status_code == 403
    assert client_for(parent).post("/api/evaluations/", eval_payload(student, est), format="json").status_code == 403


def test_evaluation_notifies_guardians_and_hides_internal_notes(corpus, teacher, parent, child, est):
    r = client_for(teacher).post(
        "/api/evaluations/", eval_payload(child, est, appreciation="Très bien", internal_notes="Confidentiel"), format="json"
    )
    assert r.status_code == 201
    n = Notification.objects.get()
    assert n.recipient == parent and n.kind == "EVALUATION"
    assert "Confidentiel" not in n.message
    item = client_for(parent).get("/api/evaluations/").json()["results"][0]
    assert item["appreciation"] == "Très bien" and "internal_notes" not in item and "correction_reason" not in item
    assert item["scores"] and item["overall_score"] is not None
    staff = client_for(teacher).get(f"/api/evaluations/{r.json()['id']}/").json()
    assert staff["internal_notes"] == "Confidentiel"


def test_evaluation_correction_without_scores_copies_them(corpus, teacher, student, est):
    c = client_for(teacher)
    old = c.post("/api/evaluations/", eval_payload(student, est), format="json").json()
    r = c.post(f"/api/evaluations/{old['id']}/correct/", {"appreciation": "Corrigé", "correction_reason": "Faute de frappe"}, format="json")
    assert r.status_code == 201, r.content
    new = r.json()
    assert new["supersedes"] == old["id"] and new["appreciation"] == "Corrigé"
    assert Decimal(str(new["overall_score"])) == Decimal(str(old["overall_score"]))
    assert EvaluationScore.objects.filter(evaluation_id=new["id"]).count() == 2
    assert EvaluationScore.objects.filter(evaluation_id=old["id"]).count() == 2  # anciennes notes intactes
    assert Evaluation.objects.get(pk=old["id"]).is_current is False


def test_evaluation_correction_with_new_scores(corpus, teacher, student, est):
    c = client_for(teacher)
    cr = criteria(est)
    old = c.post("/api/evaluations/", eval_payload(student, est), format="json").json()
    r = c.post(f"/api/evaluations/{old['id']}/correct/",
               {"scores": [{"criterion": str(cr[0].pk), "score": 20}], "correction_reason": "Re-notation"}, format="json")
    assert r.status_code == 201
    assert Decimal(str(r.json()["overall_score"])) == Decimal("20")
    assert Decimal(str(Evaluation.objects.get(pk=old["id"]).overall_score)) == Decimal("14")
    assert c.post(f"/api/evaluations/{old['id']}/correct/", {"correction_reason": "x"}, format="json").status_code == 400
    assert c.post(f"/api/evaluations/{r.json()['id']}/correct/", {"appreciation": "x"}, format="json").status_code == 400


def test_evaluation_isolation(corpus, teacher, other_director, student, est):
    eid = client_for(teacher).post("/api/evaluations/", eval_payload(student, est), format="json").json()["id"]
    c = client_for(other_director)
    assert c.get(f"/api/evaluations/{eid}/").status_code == 404
    assert c.get("/api/evaluations/").json()["count"] == 0
