"""Règles métier des inscriptions et classes."""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import AcademicYear, ClassAssignment, ClassRoom, Enrollment, EnrollmentKind, EnrollmentStatus


def current_year(establishment) -> AcademicYear | None:
    return AcademicYear.objects.filter(establishment=establishment, is_current=True).first()


@transaction.atomic
def enroll(student, academic_year: AcademicYear, classroom: ClassRoom | None, *, user, kind=EnrollmentKind.NEW, reason="") -> Enrollment:
    """Inscrit (ou réinscrit) un talibé pour une année, avec affectation de classe tracée."""
    if academic_year.is_closed:
        raise ValidationError({"academic_year": "Cette année scolaire est clôturée."})
    if classroom is not None and classroom.academic_year_id != academic_year.pk:
        raise ValidationError({"classroom": "Cette classe n'appartient pas à l'année scolaire choisie."})
    if Enrollment.objects.filter(student=student, academic_year=academic_year).exists():
        raise ValidationError({"detail": "Ce talibé est déjà inscrit pour cette année scolaire."})
    _check_capacity(classroom)
    enrollment = Enrollment.objects.create(
        establishment=student.establishment, student=student, academic_year=academic_year,
        classroom=classroom, kind=kind, student_status=student.status,
    )
    if classroom is not None:
        ClassAssignment.objects.create(
            establishment=student.establishment, enrollment=enrollment, classroom=classroom,
            changed_by=user, reason=reason or kind.label,
        )
    return enrollment


def _check_capacity(classroom: ClassRoom | None):
    if classroom is None:
        return
    # Verrou sur la classe pour éviter deux inscriptions simultanées au-delà de la capacité.
    locked = ClassRoom.objects.select_for_update().get(pk=classroom.pk)
    count = Enrollment.objects.filter(classroom=locked, status=EnrollmentStatus.ACTIVE).count()
    if count >= locked.capacity:
        raise ValidationError({"classroom": f"La classe « {locked.name} » est complète ({locked.capacity} places)."})


@transaction.atomic
def change_class(enrollment: Enrollment, new_classroom: ClassRoom, *, user, reason="") -> Enrollment:
    if enrollment.academic_year.is_closed:
        raise ValidationError({"detail": "Année clôturée : changement de classe impossible."})
    if new_classroom.academic_year_id != enrollment.academic_year_id:
        raise ValidationError({"classroom": "Cette classe n'appartient pas à l'année de l'inscription."})
    if enrollment.classroom_id == new_classroom.pk:
        raise ValidationError({"classroom": "Le talibé est déjà dans cette classe."})
    _check_capacity(new_classroom)
    today = timezone.localdate()
    enrollment.assignments.filter(end_date__isnull=True).update(end_date=today)
    enrollment.classroom = new_classroom
    enrollment.save(update_fields=["classroom", "updated_at"])
    ClassAssignment.objects.create(
        establishment=enrollment.establishment, enrollment=enrollment, classroom=new_classroom,
        changed_by=user, reason=reason or "Changement de classe",
    )
    return enrollment


@transaction.atomic
def activate_year(year: AcademicYear) -> AcademicYear:
    if year.is_closed:
        raise ValidationError({"detail": "Une année clôturée ne peut pas être réactivée."})
    AcademicYear.objects.filter(establishment=year.establishment, is_current=True).exclude(pk=year.pk).update(is_current=False)
    year.is_current = True
    year.save(update_fields=["is_current", "updated_at"])
    return year


@transaction.atomic
def close_year(year: AcademicYear) -> AcademicYear:
    """Clôture : les inscriptions actives passent à « terminée » ; tout reste consultable."""
    Enrollment.objects.filter(academic_year=year, status=EnrollmentStatus.ACTIVE).update(status=EnrollmentStatus.COMPLETED)
    year.is_closed = True
    year.is_current = False
    year.save(update_fields=["is_closed", "is_current", "updated_at"])
    return year
