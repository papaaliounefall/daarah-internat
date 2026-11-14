import pytest

from apps.guardians.models import Guardianship
from apps.quran.tests.factories import load_mini_corpus

from .helpers import make_student


@pytest.fixture
def corpus(db):
    return load_mini_corpus()


@pytest.fixture
def student(est, classroom):
    return make_student(est, classroom)


@pytest.fixture
def student2(est, classroom2):
    """Élève de l'autre maître."""
    return make_student(est, classroom2, first_name="Ibrahima")


@pytest.fixture
def child(student, parent, est):
    Guardianship.objects.create(establishment=est, user=parent, student=student)
    return student
