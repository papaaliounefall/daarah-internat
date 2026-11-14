import datetime

import pytest

from apps.audit.models import AuditLog
from apps.core.roles import Role
from apps.notifications.models import Notification
from apps.visits.models import VisitRequest
from conftest import client_for, make_user

pytestmark = pytest.mark.django_db

TOMORROW = datetime.date.today() + datetime.timedelta(days=1)
IN_3_DAYS = datetime.date.today() + datetime.timedelta(days=3)


def ask(client, student, date=TOMORROW, time="10:00", **kw):
    body = {"student": str(student.pk), "requested_date": getattr(date, "isoformat", lambda: date)(), "requested_time": time, **kw}
    return client.post("/api/visit-requests/", body, format="json")


def new_visit(parent, child, **kw):
    r = ask(client_for(parent), child, **kw)
    assert r.status_code == 201, r.content
    return r.json()


def act(user, visit_id, name, **body):
    return client_for(user).post(f"/api/visit-requests/{visit_id}/{name}/", body, format="json")


# ---------------------------------------------------------------- création ---------------
def test_parent_creates_request_for_own_child(parent, child, director, assistant):
    r = ask(client_for(parent), child, message="Je viens avec ses frères")
    assert r.status_code == 201, r.content
    d = r.json()
    assert d["status"] == "EN_ATTENTE" and d["guardian_name"] and d["student_name"] == "Mansour Fall"
    assert d["requested_date"] == TOMORROW.isoformat() and d["requested_time"].startswith("10:00")
    assert d["message"] == "Je viens avec ses frères" and d["confirmed_date"] is None
    v = VisitRequest.objects.get()
    assert v.guardian == parent and v.establishment_id == parent.establishment_id
    assert AuditLog.objects.filter(action="CREATE", model="VisitRequest").exists()
    # nouvelle demande -> directeur et assistant (et eux seuls)
    assert set(Notification.objects.values_list("recipient__username", flat=True)) == {"directeur", "assistant"}
    assert set(Notification.objects.values_list("kind", flat=True)) == {"VISITE"}


def test_parent_cannot_request_for_other_child(parent, child, stranger_child):
    assert ask(client_for(parent), stranger_child).status_code == 404
    assert VisitRequest.objects.count() == 0


def test_cannot_request_for_child_of_other_establishment(parent, other_est):
    from .helpers import make_student

    assert ask(client_for(parent), make_student(other_est)).status_code == 404


def test_past_date_or_time_rejected(parent, child):
    c = client_for(parent)
    yesterday = datetime.date.today() - datetime.timedelta(days=1)
    r = ask(c, child, date=yesterday)
    assert r.status_code == 400 and "passé" in str(r.json())
    assert ask(c, child, date=datetime.date.today(), time="00:00").status_code == 400
    assert ask(c, child, time="25:99").status_code == 400
    assert ask(c, child, date="pas-une-date").status_code == 400
    assert VisitRequest.objects.count() == 0


def test_duplicate_active_request_same_day_rejected_but_allowed_after_cancel(parent, child):
    v = new_visit(parent, child)
    assert ask(client_for(parent), child).status_code == 400
    assert act(parent, v["id"], "cancel").status_code == 200
    assert ask(client_for(parent), child).status_code == 201


@pytest.mark.parametrize("who", ["director", "assistant", "teacher"])
def test_only_parent_can_create(request, who, child):
    assert ask(client_for(request.getfixturevalue(who)), child).status_code == 403


def test_message_optional(parent, child):
    assert new_visit(parent, child)["message"] == ""


# ---------------------------------------------------------------- visibilité -------------
def test_parent_sees_only_own_requests(parent, child, est, stranger_child):
    mine = new_visit(parent, child)
    other_parent = make_user(est, Role.PARENT, "parent2")
    from apps.guardians.models import Guardianship

    Guardianship.objects.create(establishment=est, user=other_parent, student=stranger_child)
    theirs = new_visit(other_parent, stranger_child)
    c = client_for(parent)
    assert [x["id"] for x in c.get("/api/visit-requests/").json()["results"]] == [mine["id"]]
    assert c.get(f"/api/visit-requests/{theirs['id']}/").status_code == 404
    for name in ("cancel", "accept-proposal", "decline-proposal"):
        assert c.post(f"/api/visit-requests/{theirs['id']}/{name}/").status_code == 404


def test_admins_see_all_teacher_forbidden(parent, child, director, assistant, teacher):
    new_visit(parent, child)
    for u in (director, assistant):
        assert client_for(u).get("/api/visit-requests/").json()["count"] == 1
    c = client_for(teacher)
    assert c.get("/api/visit-requests/").status_code == 403
    assert c.get(f"/api/visit-requests/{VisitRequest.objects.get().pk}/").status_code == 403


def test_isolation_between_establishments(parent, child, other_director):
    v = new_visit(parent, child)
    c = client_for(other_director)
    assert c.get("/api/visit-requests/").json()["count"] == 0
    assert c.get(f"/api/visit-requests/{v['id']}/").status_code == 404
    assert c.post(f"/api/visit-requests/{v['id']}/accept/").status_code == 404


def test_filters(parent, child, director):
    a = new_visit(parent, child, date=TOMORROW)
    new_visit(parent, child, date=IN_3_DAYS)
    act(director, a["id"], "accept")
    c = client_for(director)
    assert c.get("/api/visit-requests/?status=ACCEPTEE").json()["count"] == 1
    assert c.get(f"/api/visit-requests/?date_after={IN_3_DAYS.isoformat()}").json()["count"] == 1
    assert c.get(f"/api/visit-requests/?student={child.pk}").json()["count"] == 2
    assert c.get(f"/api/visit-requests/?guardian={parent.pk}").json()["count"] == 2


# ---------------------------------------------------------------- décisions --------------
def test_accept(parent, child, director):
    v = new_visit(parent, child)
    Notification.objects.all().delete()
    r = act(director, v["id"], "accept", reason="Venez à l'heure de la prière")
    assert r.status_code == 200, r.content
    d = r.json()
    assert d["status"] == "ACCEPTEE" and d["decided_by"] == str(director.pk) and d["decision_date"]
    assert d["admin_note"] == "Venez à l'heure de la prière"
    assert d["confirmed_date"] == TOMORROW.isoformat() and d["confirmed_time"].startswith("10:00")
    n = Notification.objects.get()
    assert n.recipient == parent and n.kind == "VISITE" and n.link_type == "visit" and n.link_id == v["id"]
    assert AuditLog.objects.filter(action="VISIT_ACCEPT").exists()


def test_assistant_can_decide(parent, child, assistant):
    v = new_visit(parent, child)
    assert act(assistant, v["id"], "accept").status_code == 200


def test_refuse_requires_reason(parent, child, director):
    v = new_visit(parent, child)
    assert act(director, v["id"], "refuse").status_code == 400
    assert act(director, v["id"], "refuse", reason="   ").status_code == 400
    assert VisitRequest.objects.get().status == "EN_ATTENTE"
    Notification.objects.all().delete()
    r = act(director, v["id"], "refuse", reason="Période d'examens")
    assert r.status_code == 200 and r.json()["status"] == "REFUSEE" and r.json()["admin_note"] == "Période d'examens"
    n = Notification.objects.get()
    assert n.recipient == parent and "Période d'examens" in n.message


def test_propose_then_parent_accepts(parent, child, director):
    v = new_visit(parent, child)
    Notification.objects.all().delete()
    r = act(director, v["id"], "propose", proposed_date=IN_3_DAYS.isoformat(), proposed_time="15:30", reason="Cours le matin")
    assert r.status_code == 200 and r.json()["status"] == "MODIFICATION_PROPOSEE"
    assert r.json()["proposed_date"] == IN_3_DAYS.isoformat() and r.json()["proposed_time"].startswith("15:30")
    assert Notification.objects.get().recipient == parent
    Notification.objects.all().delete()
    r = act(parent, v["id"], "accept-proposal")
    assert r.status_code == 200 and r.json()["status"] == "ACCEPTEE"
    assert r.json()["confirmed_date"] == IN_3_DAYS.isoformat() and r.json()["confirmed_time"].startswith("15:30")
    assert r.json()["requested_date"] == TOMORROW.isoformat()  # la demande initiale n'est pas écrasée
    assert set(Notification.objects.values_list("recipient__username", flat=True)) == {"directeur"}


def test_propose_then_parent_declines(parent, child, director):
    v = new_visit(parent, child)
    act(director, v["id"], "propose", proposed_date=IN_3_DAYS.isoformat(), proposed_time="15:30")
    r = act(parent, v["id"], "decline-proposal")
    assert r.status_code == 200 and r.json()["status"] == "ANNULEE"
    assert act(parent, v["id"], "accept-proposal").status_code == 400  # clôturée


def test_repropose_and_reschedule_accepted_visit(parent, child, director):
    v = new_visit(parent, child)
    p1 = act(director, v["id"], "propose", proposed_date=IN_3_DAYS.isoformat(), proposed_time="09:00")
    later = (IN_3_DAYS + datetime.timedelta(days=1)).isoformat()
    p2 = act(director, v["id"], "propose", proposed_date=later, proposed_time="11:00")
    assert p1.status_code == p2.status_code == 200 and p2.json()["proposed_date"] == later
    act(parent, v["id"], "accept-proposal")
    p3 = act(director, v["id"], "propose", proposed_date=IN_3_DAYS.isoformat(), proposed_time="08:00")  # report
    assert p3.status_code == 200 and p3.json()["status"] == "MODIFICATION_PROPOSEE" and p3.json()["confirmed_date"] is None


def test_propose_validation(parent, child, director):
    v = new_visit(parent, child)
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    assert act(director, v["id"], "propose", proposed_date=yesterday, proposed_time="10:00").status_code == 400
    assert act(director, v["id"], "propose", proposed_date=IN_3_DAYS.isoformat()).status_code == 400
    assert act(director, v["id"], "propose").status_code == 400
    assert VisitRequest.objects.get().status == "EN_ATTENTE"


# ---------------------------------------------------------------- annulation parent ------
def test_parent_cancels_pending_and_admins_are_told(parent, child, director, assistant):
    v = new_visit(parent, child)
    Notification.objects.all().delete()
    r = act(parent, v["id"], "cancel")
    assert r.status_code == 200 and r.json()["status"] == "ANNULEE"
    assert Notification.objects.count() == 2  # directeur + assistant


def test_parent_cancels_when_modification_proposed(parent, child, director):
    v = new_visit(parent, child)
    act(director, v["id"], "propose", proposed_date=IN_3_DAYS.isoformat(), proposed_time="09:00")
    assert act(parent, v["id"], "cancel").json()["status"] == "ANNULEE"


def test_parent_cannot_cancel_accepted_visit(parent, child, director):
    v = new_visit(parent, child)
    act(director, v["id"], "accept")
    r = act(parent, v["id"], "cancel")
    assert r.status_code == 400 and "confirmée" in str(r.json())
    assert VisitRequest.objects.get().status == "ACCEPTEE"


def test_admin_can_withdraw_accepted_visit_with_reason(parent, child, director):
    v = new_visit(parent, child)
    act(director, v["id"], "accept")
    r = act(director, v["id"], "refuse", reason="Fermeture exceptionnelle")
    assert r.status_code == 200 and r.json()["status"] == "REFUSEE"


# ---------------------------------------------------------------- transitions invalides --
@pytest.mark.parametrize("final", ["refuse", "cancel"])
def test_final_states_are_closed(parent, child, director, final):
    v = new_visit(parent, child)
    if final == "refuse":
        act(director, v["id"], "refuse", reason="Non")
    else:
        act(parent, v["id"], "cancel")
    for who, name, body in [
        (director, "accept", {}), (director, "refuse", {"reason": "x"}),
        (director, "propose", {"proposed_date": IN_3_DAYS.isoformat(), "proposed_time": "10:00"}),
        (parent, "cancel", {}), (parent, "accept-proposal", {}), (parent, "decline-proposal", {}),
    ]:
        r = act(who, v["id"], name, **body)
        assert r.status_code == 400, (name, r.content)
        assert isinstance(r.json().get("detail") or r.json(), (str, dict))
    assert VisitRequest.objects.get().status == ("REFUSEE" if final == "refuse" else "ANNULEE")


def test_invalid_transitions_clear_french_messages(parent, child, director):
    v = new_visit(parent, child)
    r = act(parent, v["id"], "accept-proposal")
    assert r.status_code == 400 and "Aucune proposition" in r.json()["detail"]
    assert act(parent, v["id"], "decline-proposal").status_code == 400
    act(director, v["id"], "accept")
    r = act(director, v["id"], "accept")
    assert r.status_code == 400 and "déjà acceptée" in r.json()["detail"]
    v2 = new_visit(parent, child, date=IN_3_DAYS)
    act(director, v2["id"], "propose", proposed_date=IN_3_DAYS.isoformat(), proposed_time="09:00")
    r = act(director, v2["id"], "accept")
    assert r.status_code == 400 and "réponse du parent" in r.json()["detail"]


# ---------------------------------------------------------------- droits -----------------
@pytest.mark.parametrize("name,body", [
    ("accept", {}), ("refuse", {"reason": "x"}), ("propose", {"proposed_date": IN_3_DAYS.isoformat(), "proposed_time": "10:00"}),
])
def test_parent_and_teacher_cannot_decide(parent, child, teacher, name, body):
    v = new_visit(parent, child)
    assert act(parent, v["id"], name, **body).status_code == 403
    assert act(teacher, v["id"], name, **body).status_code == 403
    assert VisitRequest.objects.get().status == "EN_ATTENTE"


@pytest.mark.parametrize("name", ["cancel", "accept-proposal", "decline-proposal"])
def test_admins_cannot_use_parent_actions(parent, child, director, assistant, name):
    v = new_visit(parent, child)
    assert act(director, v["id"], name).status_code == 403
    assert act(assistant, v["id"], name).status_code == 403


def test_no_delete_no_edit(parent, child, director):
    v = new_visit(parent, child)
    for u in (parent, director):
        c = client_for(u)
        assert c.delete(f"/api/visit-requests/{v['id']}/").status_code in (403, 405)
        assert c.patch(f"/api/visit-requests/{v['id']}/", {"status": "ACCEPTEE"}, format="json").status_code in (403, 405)
    assert VisitRequest.objects.get().status == "EN_ATTENTE"
