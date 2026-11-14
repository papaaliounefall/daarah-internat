import datetime

import pytest

from apps.finance.models import Due
from apps.students.models import Student
from conftest import client_for

pytestmark = pytest.mark.django_db


def make_student(est, **kw):
    return Student.objects.create(establishment=est, first_name="A", last_name="B", gender="M", **kw)


@pytest.mark.parametrize("who", ["director", "assistant", "teacher", "parent"])
def test_dashboard_works_on_empty_installation(request, who, est):
    user = request.getfixturevalue(who)
    r = client_for(user).get("/api/dashboard/")
    assert r.status_code == 200, r.content
    assert r.json()["role"] == user.role


def test_director_dashboard_with_overdue_due(api, est, year):
    st = make_student(est)
    Due.objects.create(establishment=est, student=st, academic_year=year, kind="MENSUALITE", label="x",
                       due_date=datetime.date.today() - datetime.timedelta(days=5), amount=35000)
    body = api.get("/api/dashboard/").json()
    assert body["finance"]["arrears_total"] == 35000
    assert body["students_total"] == 1


def test_finance_block_hidden_from_assistant_without_flag(assistant, est):
    assert "finance" not in client_for(assistant).get("/api/dashboard/").json()
    assistant.can_view_finance = True
    assistant.save()
    assert "finance" in client_for(assistant).get("/api/dashboard/").json()


def test_boarding_filter_externes(api, est, year):
    from apps.boarding.models import Building, BoardingAssignment, Room

    a, b = make_student(est), make_student(est)
    room = Room.objects.create(establishment=est, building=Building.objects.create(establishment=est, name="B"), number="1", capacity=2)
    BoardingAssignment.objects.create(establishment=est, student=a, room=room)
    assert {x["id"] for x in api.get("/api/students/?boarding=true").json()["results"]} == {str(a.pk)}
    assert {x["id"] for x in api.get("/api/students/?boarding=false").json()["results"]} == {str(b.pk)}


def test_parent_dashboard_only_own_children(parent, est):
    from apps.guardians.models import Guardianship

    mine, other = make_student(est), make_student(est)
    Guardianship.objects.create(establishment=est, user=parent, student=mine)
    kids = client_for(parent).get("/api/dashboard/").json()["children"]
    assert [k["student_id"] for k in kids] == [str(mine.pk)]
