from apps.academics.models import Enrollment
from apps.students.models import Student


def make_student(est, classroom=None, first_name="Mansour", last_name="Fall", **kw):
    st = Student.objects.create(establishment=est, first_name=first_name, last_name=last_name, gender="M", **kw)
    if classroom is not None:
        Enrollment.objects.create(establishment=est, student=st, academic_year=classroom.academic_year, classroom=classroom)
    return st
