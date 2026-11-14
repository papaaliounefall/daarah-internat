import datetime

import pytest

from apps.academics.models import Enrollment
from apps.finance.models import FeeSchedule
from apps.guardians.models import Guardianship
from apps.students.models import Student


@pytest.fixture
def Y(year):
    return year.start_date.year


@pytest.fixture
def mk_student(est, year):
    """Crée un talibé inscrit pour l'année active depuis le début de l'année."""

    def _mk(first="Ali", status="PAYANT", enrolled_on=None, enroll=True, **kw):
        s = Student.objects.create(establishment=est, first_name=first, last_name="Diop", gender="M", status=status, **kw)
        if enroll:
            Enrollment.objects.create(
                establishment=est, student=s, academic_year=year, enrolled_on=enrolled_on or year.start_date,
                student_status=status,
            )
        return s

    return _mk


@pytest.fixture
def monthly_fee(est, year):
    return FeeSchedule.objects.create(
        establishment=est, academic_year=year, name="Mensualité", kind="MENSUALITE", amount=10000, applies_to="PAYANT", due_day=5,
    )


@pytest.fixture
def link_parent(est, parent):
    def _link(student):
        Guardianship.objects.create(establishment=est, user=parent, student=student)

    return _link


@pytest.fixture
def make_due(est, year):
    from apps.finance.models import Due

    def _mk(student, amount=10000, due_date=None, label="Mensualité", **kw):
        return Due.objects.create(
            establishment=est, student=student, academic_year=year, kind="MENSUALITE", label=label,
            due_date=due_date or datetime.date(year.start_date.year, 1, 5), amount=amount, **kw,
        )

    return _mk
