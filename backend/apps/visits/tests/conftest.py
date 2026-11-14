import pytest

from apps.guardians.models import Guardianship
from .helpers import make_student


@pytest.fixture
def child(est, classroom, parent):
    st = make_student(est, classroom)
    Guardianship.objects.create(establishment=est, user=parent, student=st)
    return st


@pytest.fixture
def stranger_child(est, classroom2):
    """Enfant d'un autre parent."""
    return make_student(est, classroom2, first_name="Ibrahima", last_name="Sow")
