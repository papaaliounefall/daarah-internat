"""Fixtures communes. Deux établissements pour tester l'isolation, quatre rôles dans le premier."""
import datetime

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.academics.models import AcademicYear, ClassRoom
from apps.core.models import Establishment
from apps.core.roles import Role

User = get_user_model()
PASSWORD = "Motdepasse-Test-2026"


def make_user(est, role, username, **extra):
    user = User(username=username, first_name=username.title(), last_name="Test", role=role, establishment=est, **extra)
    user.set_password(PASSWORD)
    user.save()
    return user


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def est(db):
    return Establishment.objects.create(name="Daara A", slug="daara-a", registration_prefix="DAF")


@pytest.fixture
def other_est(db):
    return Establishment.objects.create(name="Daara B", slug="daara-b", registration_prefix="DBB")


@pytest.fixture
def director(est):
    return make_user(est, Role.DIRECTEUR, "directeur")


@pytest.fixture
def assistant(est):
    return make_user(est, Role.ASSISTANT, "assistant")


@pytest.fixture
def teacher(est):
    return make_user(est, Role.MAITRE, "maitre")


@pytest.fixture
def teacher2(est):
    return make_user(est, Role.MAITRE, "maitre2")


@pytest.fixture
def parent(est):
    return make_user(est, Role.PARENT, "parent")


@pytest.fixture
def other_director(other_est):
    return make_user(other_est, Role.DIRECTEUR, "directeur-b")


@pytest.fixture
def api(director):
    return client_for(director)


@pytest.fixture
def year(est):
    today = datetime.date.today()
    return AcademicYear.objects.create(
        establishment=est, name=f"{today.year}-{today.year + 1}", start_date=datetime.date(today.year, 1, 1),
        end_date=datetime.date(today.year + 1, 12, 31), is_current=True,
    )


@pytest.fixture
def classroom(est, year, teacher):
    return ClassRoom.objects.create(establishment=est, name="Hifz", academic_year=year, teacher=teacher, capacity=3)


@pytest.fixture
def classroom2(est, year, teacher2):
    return ClassRoom.objects.create(establishment=est, name="Ibtida", academic_year=year, teacher=teacher2, capacity=3)
