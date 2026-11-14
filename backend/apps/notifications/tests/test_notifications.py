import datetime
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.finance.models import Due, Payment
from apps.guardians.models import Guardianship
from apps.notifications import tasks
from apps.notifications.models import Announcement, Notification
from apps.notifications.services import notify, notify_guardians, notify_roles
from apps.students.models import Student
from conftest import client_for, make_user

pytestmark = pytest.mark.django_db

TODAY = datetime.date.today()


def mk(user, title="Titre", kind="GENERAL", **kw):
    return Notification.objects.create(establishment_id=user.establishment_id, recipient=user, kind=kind,
                                       title=title, message="Message", **kw)


# --------------------------------------------------------------------------- API privée
def test_user_sees_only_own_notifications(director, assistant, other_director):
    mine = mk(director, "à moi")
    mk(assistant, "à l'assistant")
    mk(other_director, "autre daara")
    r = client_for(director).get("/api/notifications/")
    assert r.status_code == 200
    assert [n["id"] for n in r.json()["results"]] == [str(mine.pk)]


def test_cannot_read_someone_elses_notification_even_in_same_establishment(director, assistant):
    n = mk(assistant)
    c = client_for(director)
    assert c.get(f"/api/notifications/{n.pk}/").status_code == 404
    assert c.post(f"/api/notifications/{n.pk}/read/").status_code == 404
    n.refresh_from_db()
    assert n.read_at is None


def test_cannot_access_notification_of_other_establishment(director, other_director):
    n = mk(other_director)
    assert client_for(director).get(f"/api/notifications/{n.pk}/").status_code == 404


@pytest.mark.parametrize("fixture", ["director", "assistant", "teacher", "parent"])
def test_every_role_can_use_notifications(request, fixture):
    user = request.getfixturevalue(fixture)
    n = mk(user)
    c = client_for(user)
    assert c.get("/api/notifications/").status_code == 200
    assert c.get("/api/notifications/unread-count/").json() == {"count": 1}
    assert c.post(f"/api/notifications/{n.pk}/read/").status_code == 200
    assert c.get("/api/notifications/unread-count/").json() == {"count": 0}


def test_filters_unread_and_kind(director):
    mk(director, "a", kind="FINANCE")
    mk(director, "b", kind="VISITE")
    done = mk(director, "c", kind="FINANCE", read_at=timezone.now())
    c = client_for(director)
    assert c.get("/api/notifications/?unread=true").json()["count"] == 2
    assert c.get("/api/notifications/?unread=false").json()["results"][0]["id"] == str(done.pk)
    assert c.get("/api/notifications/?kind=FINANCE").json()["count"] == 2
    assert c.get("/api/notifications/?kind=FINANCE&unread=true").json()["count"] == 1
    assert c.get("/api/notifications/unread-count/?kind=VISITE").json() == {"count": 1}
    assert c.get("/api/notifications/?kind=N_IMPORTE_QUOI").status_code == 400


def test_mark_read_is_idempotent_and_read_all_only_touches_own(director, assistant):
    n = mk(director)
    mk(director)
    other = mk(assistant)
    c = client_for(director)
    first = c.post(f"/api/notifications/{n.pk}/read/").json()
    assert first["is_read"] and first["read_at"]
    again = c.post(f"/api/notifications/{n.pk}/read/").json()
    assert again["read_at"] == first["read_at"]
    assert c.post("/api/notifications/read-all/").json() == {"updated": 1}
    other.refresh_from_db()
    assert other.read_at is None                                   # celle de l'assistant est intacte


def test_read_all_by_kind(director):
    mk(director, kind="FINANCE")
    mk(director, kind="VISITE")
    c = client_for(director)
    assert c.post("/api/notifications/read-all/", {"kind": "FINANCE"}, format="json").json() == {"updated": 1}
    assert c.get("/api/notifications/unread-count/").json() == {"count": 1}


def test_notifications_are_read_only_via_api(director):
    n = mk(director)
    c = client_for(director)
    assert c.post("/api/notifications/", {"title": "x", "message": "y"}, format="json").status_code in (403, 405)
    assert c.delete(f"/api/notifications/{n.pk}/").status_code in (403, 405)
    assert c.patch(f"/api/notifications/{n.pk}/", {"title": "x"}, format="json").status_code in (403, 405)
    assert Notification.objects.filter(pk=n.pk, title="Titre").exists()


def test_unauthenticated_rejected():
    from rest_framework.test import APIClient

    assert APIClient().get("/api/notifications/").status_code in (401, 403)


# --------------------------------------------------------------------------- services internes
def test_notify_dedupe_and_inactive_users(director, assistant):
    assistant.is_active = False
    assistant.save()
    assert notify([director, assistant], "GENERAL", "t", "m", dedupe_key="k1") == 1
    assert notify([director], "GENERAL", "t", "m", dedupe_key="k1") == 0
    assert notify([director], "GENERAL", "t", "m") == 1 and notify([director], "GENERAL", "t", "m") == 1


def test_notify_guardians_reaches_only_linked_parents(est, student, parent):
    other_parent = make_user(est, "PARENT", "parent2")
    Guardianship.objects.create(establishment=est, user=parent, student=student)
    assert notify_guardians(student, "CORAN", "Leçon", "Nouvelle leçon") == 1
    assert Notification.objects.filter(recipient=parent, link_type="student", link_id=str(student.pk)).exists()
    assert not Notification.objects.filter(recipient=other_parent).exists()


def test_notify_roles_scoped_to_establishment(est, director, assistant, other_director):
    assert notify_roles(est, ["DIRECTEUR", "ASSISTANT"], "GENERAL", "t", "m") == 2
    assert not Notification.objects.filter(recipient=other_director).exists()


# --------------------------------------------------------------------------- informations du Daara
def test_announcement_broadcast_to_chosen_roles(director, assistant, teacher, parent, other_director,
                                                django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        r = client_for(director).post("/api/announcements/", {
            "title": "Fermeture exceptionnelle", "message": "Le Daara ferme vendredi.",
            "audience": ["PARENT", "MAITRE"],
        }, format="json")
    assert r.status_code == 201, r.content
    got = set(Notification.objects.filter(kind="GENERAL").values_list("recipient__username", flat=True))
    assert got == {"parent", "maitre"}
    n = Notification.objects.get(recipient=parent)
    assert n.title == "Fermeture exceptionnelle" and n.link_type == "announcement"
    assert AuditLog.objects.filter(action="CREATE", model="Announcement").exists()


def test_announcement_empty_audience_means_everyone_in_establishment(director, assistant, teacher, parent,
                                                                    other_director, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        client_for(director).post("/api/announcements/", {"title": "Info", "message": "Bonjour"}, format="json")
    assert Notification.objects.count() == 4  # directeur, assistant, maître, parent — pas l'autre Daara
    assert not Notification.objects.filter(recipient=other_director).exists()


def test_announcement_broadcast_is_idempotent(director, parent, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        client_for(director).post("/api/announcements/", {"title": "Info", "message": "x"}, format="json")
    ann = Announcement.objects.get()
    before = Notification.objects.count()
    assert tasks.broadcast_announcement(str(ann.pk)) == 0
    assert Notification.objects.count() == before


def test_assistant_can_create_announcement_but_not_teacher_or_parent(assistant, teacher, parent):
    body = {"title": "Info", "message": "x", "audience": ["PARENT"]}
    assert client_for(assistant).post("/api/announcements/", body, format="json").status_code == 201
    assert client_for(teacher).post("/api/announcements/", body, format="json").status_code == 403
    assert client_for(parent).post("/api/announcements/", body, format="json").status_code == 403


def test_announcement_validation(director):
    c = client_for(director)
    assert c.post("/api/announcements/", {"title": " ", "message": "x"}, format="json").status_code == 400
    assert c.post("/api/announcements/", {"title": "t", "message": ""}, format="json").status_code == 400
    assert c.post("/api/announcements/", {"title": "t", "message": "m", "audience": ["ROI"]},
                  format="json").status_code == 400
    assert c.post("/api/announcements/", {"title": "t" * 201, "message": "m"}, format="json").status_code == 400


def test_announcement_visibility_by_audience_and_isolation(director, teacher, parent, other_director):
    c = client_for(director)
    c.post("/api/announcements/", {"title": "Pour les parents", "message": "x", "audience": ["PARENT"]}, format="json")
    c.post("/api/announcements/", {"title": "Pour tous", "message": "x"}, format="json")
    titles = lambda user: {a["title"] for a in client_for(user).get("/api/announcements/").json()["results"]}
    assert titles(director) == {"Pour les parents", "Pour tous"}
    assert titles(parent) == {"Pour les parents", "Pour tous"}
    assert titles(teacher) == {"Pour tous"}
    assert titles(other_director) == set()
    foreign = Announcement.objects.get(title="Pour tous")
    assert client_for(other_director).get(f"/api/announcements/{foreign.pk}/").status_code == 404
    assert client_for(teacher).get(
        f"/api/announcements/{Announcement.objects.get(title='Pour les parents').pk}/").status_code == 404


def test_announcements_cannot_be_modified_or_deleted(director):
    c = client_for(director)
    c.post("/api/announcements/", {"title": "t", "message": "m"}, format="json")
    ann = Announcement.objects.get()
    assert c.delete(f"/api/announcements/{ann.pk}/").status_code in (403, 405)
    assert c.patch(f"/api/announcements/{ann.pk}/", {"title": "x"}, format="json").status_code in (403, 405)
    ann.refresh_from_db()
    assert ann.title == "t"


# --------------------------------------------------------------------------- rappels d'échéances
@pytest.fixture
def due_setup(est, student, parent, director, assistant, year):
    Guardianship.objects.create(establishment=est, user=parent, student=student)
    return Due.objects.create(establishment=est, student=student, academic_year=year, kind="MENSUALITE",
                              label="Mensualité novembre", due_date=TODAY - datetime.timedelta(days=2), amount=35000)


def test_reminders_notify_parents_and_finance_staff(due_setup, parent, director, assistant, teacher):
    finance_assistant = make_user(director.establishment, "ASSISTANT", "assist-fin", can_view_finance=True)
    stats = tasks.send_due_reminders()
    assert stats == {"dues": 1, "notifications": 3}
    recipients = set(Notification.objects.filter(kind="FINANCE").values_list("recipient__username", flat=True))
    assert recipients == {"parent", "directeur", "assist-fin"}   # ni assistant sans droit, ni maître
    n = Notification.objects.get(recipient=parent)
    assert "35 000 FCFA" in n.message and "en retard de 2 jours" in n.message and n.title == "Échéance en retard"
    assert n.link_type == "student"
    assert Notification.objects.get(recipient=director).link_type == "due"
    assert not Notification.objects.filter(recipient=assistant).exists()
    assert not Notification.objects.filter(recipient=teacher).exists()


def test_reminders_remaining_amount_after_partial_payment(due_setup, student, director):
    Payment.objects.create(establishment=student.establishment, receipt_number="R1", student=student, due=due_setup,
                           amount=Decimal("10000"), recorded_by=director)
    Payment.objects.create(establishment=student.establishment, receipt_number="R2", student=student, due=due_setup,
                           amount=Decimal("5000"), status="ANNULE", recorded_by=director)  # annulé : ne compte pas
    tasks.send_due_reminders()
    assert "25 000 FCFA" in Notification.objects.filter(kind="FINANCE").first().message


def test_reminders_skip_settled_cancelled_future_and_archived(due_setup, est, student, director, year, make_student):
    Payment.objects.create(establishment=est, receipt_number="R1", student=student, due=due_setup, amount=35000,
                           recorded_by=director)  # soldée
    Due.objects.create(establishment=est, student=student, academic_year=year, kind="MENSUALITE", label="annulée",
                       due_date=TODAY - datetime.timedelta(days=1), amount=1000, is_cancelled=True)
    Due.objects.create(establishment=est, student=student, academic_year=year, kind="MENSUALITE", label="lointaine",
                       due_date=TODAY + datetime.timedelta(days=4), amount=1000)
    archived = make_student(first_name="Archive", is_archived=True)
    Due.objects.create(establishment=est, student=archived, academic_year=year, kind="MENSUALITE", label="arch",
                       due_date=TODAY - datetime.timedelta(days=1), amount=1000)
    assert tasks.send_due_reminders() == {"dues": 0, "notifications": 0}


def test_reminders_window_is_three_days(est, student, year, director):
    for i, days in enumerate((0, 3, 4)):
        Due.objects.create(establishment=est, student=student, academic_year=year, kind="MENSUALITE", label=f"d{days}",
                           due_date=TODAY + datetime.timedelta(days=days), amount=1000 + i)
    assert tasks.send_due_reminders()["dues"] == 2   # aujourd'hui et +3 jours, pas +4


def test_reminders_not_repeated_within_a_week(due_setup, parent):
    first = tasks.send_due_reminders()["notifications"]
    assert first >= 2
    assert tasks.send_due_reminders() == {"dues": 1, "notifications": 0}          # même jour
    assert tasks.send_due_reminders(today=TODAY + datetime.timedelta(days=3))["notifications"] == 0  # < 7 jours
    # une semaine plus tard (les notifications d'origine ont 7+ jours) : nouveau rappel
    Notification.objects.filter(kind="FINANCE").update(created_at=timezone.now() - datetime.timedelta(days=8))
    again = tasks.send_due_reminders(today=TODAY + datetime.timedelta(days=8))
    assert again["notifications"] == first
    assert Notification.objects.filter(recipient=parent, kind="FINANCE").count() == 2


def test_reminders_isolated_by_establishment(due_setup, other_director, make_student, other_est):
    tasks.send_due_reminders()
    assert not Notification.objects.filter(recipient=other_director).exists()


def test_celery_beat_schedule_points_to_existing_task():
    from django.conf import settings

    assert settings.CELERY_BEAT_SCHEDULE["rappels-echeances"]["task"] == "apps.notifications.tasks.send_due_reminders"
    assert callable(tasks.send_due_reminders)


def test_no_external_channel_is_used(due_setup):
    tasks.send_due_reminders()
    assert set(Notification.objects.values_list("channel", flat=True)) == {"IN_APP"}
