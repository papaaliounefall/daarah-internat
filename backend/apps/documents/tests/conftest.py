import datetime
import io

import pytest
from django.core.files.base import ContentFile
from PIL import Image, ImageDraw

from apps.academics.models import Enrollment
from apps.guardians.models import Guardianship
from apps.students.models import Student


def make_photo(w=350, h=450) -> bytes:
    img = Image.new("RGB", (w, h), (190, 150, 120))
    ImageDraw.Draw(img).ellipse((w // 4, h // 6, 3 * w // 4, h // 2), fill=(110, 70, 50))
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


@pytest.fixture
def make_student(est, year):
    def _make(classroom=None, establishment=None, **kw):
        defaults = dict(
            first_name="Mansour", last_name="Fall", gender="M", father_name="Abdoulaye Fall", mother_name="Awa Sow",
            guardian_phone="77 634 46 76", birth_place="Kahone", enrollment_date=datetime.date(2026, 11, 7),
        )
        defaults.update(kw)
        student = Student.objects.create(establishment=establishment or est, **defaults)
        if classroom is not None:
            Enrollment.objects.create(establishment=student.establishment, student=student, academic_year=year,
                                      classroom=classroom)
        return student

    return _make


@pytest.fixture
def student(make_student, classroom):
    return make_student(classroom)


@pytest.fixture
def child_of_parent(parent, student, est):
    Guardianship.objects.create(establishment=est, user=parent, student=student)
    return student


@pytest.fixture
def photo_file():
    return ContentFile(make_photo(), name="photo.jpg")
