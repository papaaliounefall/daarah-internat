"""Requêtes de lecture réutilisables : périmètre par rôle et champs dérivés d'un talibé."""
from django.apps import apps
from django.db.models import OuterRef, Prefetch, Subquery

from apps.core.roles import Role


def student_scope(qs, user):
    """Restreint un queryset de Student à ce que l'utilisateur a le droit de voir.

    - directeur / assistant : tout l'établissement ;
    - maître : talibés inscrits, cette année, dans une classe dont il est le maître ;
    - parent : uniquement ses enfants (table ``Guardianship``).
    """
    if user.role in (Role.DIRECTEUR, Role.ASSISTANT):
        return qs
    if user.role == Role.MAITRE:
        return qs.filter(
            enrollments__academic_year__is_current=True,
            enrollments__status="ACTIVE",
            enrollments__classroom__teacher=user,
        ).distinct()
    if user.role == Role.PARENT:
        return qs.filter(guardianships__user=user).distinct()
    return qs.none()


def student_ids_for(user):
    """Identifiants des talibés visibles par l'utilisateur (pour filtrer d'autres modèles)."""
    from .models import Student

    return student_scope(Student.objects.filter(establishment_id=user.establishment_id), user).values("pk")


def with_derived(qs):
    """Ajoute inscription courante, chambre active et dernière leçon sans requêtes N+1."""
    Enrollment = apps.get_model("academics", "Enrollment")
    Assignment = apps.get_model("boarding", "BoardingAssignment")
    Lesson = apps.get_model("memorization", "Lesson")
    latest = Lesson.objects.filter(student=OuterRef("pk"), is_current=True).order_by("-date", "-created_at")
    return (
        qs.prefetch_related(
            Prefetch(
                "enrollments",
                queryset=Enrollment.objects.filter(academic_year__is_current=True)
                .select_related("classroom", "classroom__teacher", "academic_year"),
                to_attr="current_enrollments",
            ),
            Prefetch(
                "boarding_assignments",
                queryset=Assignment.objects.filter(end_date__isnull=True).select_related("room", "room__building"),
                to_attr="active_boarding",
            ),
        )
        .annotate(
            prog_surah_id=Subquery(latest.values("surah_id")[:1]),
            prog_ayah=Subquery(latest.values("ayah_end")[:1]),
            prog_juz=Subquery(latest.values("juz")[:1]),
            prog_hizb=Subquery(latest.values("hizb")[:1]),
            prog_date=Subquery(latest.values("date")[:1]),
        )
    )
