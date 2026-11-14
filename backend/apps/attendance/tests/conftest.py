import pytest

from apps.guardians.models import Guardianship
from .helpers import make_student


@pytest.fixture
def student(est, classroom):
    return make_student(est, classroom)


@pytest.fixture
def student_b(est, classroom):
    return make_student(est, classroom, first_name="Abdou", last_name="Ba")


@pytest.fixture
def student2(est, classroom2):
    return make_student(est, classroom2, first_name="Ibrahima", last_name="Sow")


@pytest.fixture
def child(student, parent, est):
    Guardianship.objects.create(establishment=est, user=parent, student=student)
    return student
