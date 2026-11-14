"""La carte courante suit le dossier : photo ajoutée après coup, changement d'identité ou de classe."""
import pytest

from apps.academics.models import Enrollment
from apps.documents import services

pytestmark = pytest.mark.django_db


def versions(student):
    return list(student.cards.order_by("version").values_list("version", "is_current"))


def test_photo_added_after_first_card_creates_new_version(student, photo_file):
    services.generate_card(student)  # première carte, sans photo
    assert versions(student) == [(1, True)]
    student.photo.save("photo.jpg", photo_file, save=True)
    student.refresh_from_db()
    # Celery est exécuté en mode « eager » dans les tests ; on_commit est déclenché hors transaction de test :
    from apps.documents.tasks import refresh_student_card

    refresh_student_card(str(student.pk))
    assert versions(student) == [(1, False), (2, True)]
    assert student.cards.get(version=2).snapshot["photo"].startswith("students/photos/")
    assert student.cards.get(version=1).snapshot["photo"] == ""  # l'ancienne version est conservée


def test_no_new_version_when_nothing_changed(student):
    services.generate_card(student)
    from apps.documents.tasks import refresh_student_card

    assert refresh_student_card(str(student.pk)) is None
    assert versions(student) == [(1, True)]


def test_printed_field_change_regenerates(student):
    services.generate_card(student)
    student.father_name = "Nouveau Père"
    student.save()
    from apps.documents.tasks import refresh_student_card

    assert refresh_student_card(str(student.pk)) is not None
    assert student.cards.get(is_current=True).snapshot["pere"] == "Nouveau Père"


def test_class_change_regenerates(student, classroom2, year):
    services.generate_card(student)
    enr = Enrollment.objects.get(student=student)
    enr.classroom = classroom2
    enr.save()
    from apps.documents.tasks import refresh_student_card

    refresh_student_card(str(student.pk))
    assert student.cards.get(is_current=True).snapshot["classe"] == classroom2.name


def test_student_without_card_is_not_touched(student):
    from apps.documents.tasks import refresh_student_card

    assert refresh_student_card(str(student.pk)) is None
    assert student.cards.count() == 0


def test_archived_student_card_not_refreshed(student):
    services.generate_card(student)
    student.is_archived = True
    student.father_name = "X"
    student.save()
    from apps.documents.tasks import refresh_student_card

    assert refresh_student_card(str(student.pk)) is None
