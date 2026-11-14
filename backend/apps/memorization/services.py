"""Règles métier du suivi coranique : création, correction (sans écrasement), score global, notifications."""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.core.roles import Role
from apps.notifications.services import NotificationKind, notify_guardians
from apps.quran.services import resolve_range

from .defaults import seed_defaults  # noqa: F401  (ré-exporté : API publique du module)
from .models import Evaluation, EvaluationScore, Lesson, QualityLevel, Revision

TWO = Decimal("0.01")


# ---------------------------------------------------------------- utilitaires -----------
def quality_labels(establishment) -> dict[str, tuple[str, str]]:
    """code -> (libellé, libellé arabe), niveaux inactifs inclus (l'historique reste lisible)."""
    return {q.code: (q.label, q.label_ar) for q in QualityLevel.objects.filter(establishment=establishment)}


def check_quality(establishment, code: str) -> str:
    if not QualityLevel.objects.filter(establishment=establishment, code=code, is_active=True).exists():
        raise ValidationError({"quality": "Niveau de qualité inconnu ou désactivé pour cet établissement."})
    return code


def current_classroom(student):
    """Classe active du talibé pour l'année en cours (None si non inscrit)."""
    enrollment = (
        student.enrollments.filter(academic_year__is_current=True, status="ACTIVE")
        .select_related("classroom", "classroom__teacher").first()
    )
    return enrollment.classroom if enrollment else None


def require_reason(reason) -> str:
    reason = (reason or "").strip()
    if not reason:
        raise ValidationError({"correction_reason": "Le motif de la correction est obligatoire."})
    return reason[:255]


def overall_score(scores: list[tuple]) -> Decimal | None:
    """Moyenne pondérée des scores ramenés sur 20. ``scores`` = [(critère, note)]."""
    num = Decimal(0)
    den = Decimal(0)
    for criterion, score in scores:
        num += Decimal(score) / criterion.max_score * Decimal(20) * criterion.weight
        den += criterion.weight
    if den == 0:
        return None
    return (num / den).quantize(TWO, rounding=ROUND_HALF_UP)


def _supersede_target(model, old):
    """Verrouille la ligne et refuse de corriger une version déjà remplacée."""
    locked = model.objects.select_for_update().get(pk=old.pk)
    if not locked.is_current:
        raise ValidationError(
            {"detail": "Cette entrée a déjà été corrigée : corrigez la version courante (voir l'historique)."}
        )
    return locked


def _default_teacher(user, student, requested):
    if user.role == Role.MAITRE:
        return user
    if requested is not None:
        return requested
    classroom = current_classroom(student)
    return classroom.teacher if classroom and classroom.teacher else user


# ---------------------------------------------------------------- leçons -----------------
@transaction.atomic
def create_lesson(user, data: dict) -> Lesson:
    est = user.establishment
    student = data["student"]
    rng = resolve_range(data["surah_id"], data["ayah_start"], data["ayah_end"])  # juz/hizb/page : côté serveur
    check_quality(est, data["quality"])
    lesson = Lesson.objects.create(
        establishment=est, student=student, teacher=_default_teacher(user, student, data.get("teacher")),
        classroom=current_classroom(student), date=data["date"], surah=rng.surah,
        ayah_start=rng.ayah_start, ayah_end=rng.ayah_end, juz=rng.juz, hizb=rng.hizb, page=rng.page,
        quality=data["quality"], observations=data.get("observations", ""), appreciation=data.get("appreciation", ""),
    )
    notify_guardians(
        student, NotificationKind.LESSON, "Nouvelle leçon enregistrée",
        f"{student.first_name} : sourate {rng.surah.name_simple}, versets {rng.ayah_start} à {rng.ayah_end}.",
    )
    return lesson


@transaction.atomic
def correct_lesson(user, old: Lesson, changes: dict, reason: str) -> Lesson:
    reason = require_reason(reason)
    old = _supersede_target(Lesson, old)
    est = user.establishment
    surah_id = changes.get("surah_id", old.surah_id)
    rng = resolve_range(surah_id, changes.get("ayah_start", old.ayah_start), changes.get("ayah_end", old.ayah_end))
    quality = changes.get("quality", old.quality)
    if quality != old.quality:
        check_quality(est, quality)
    new = Lesson.objects.create(
        establishment=est, student=old.student, classroom=old.classroom,
        teacher=changes.get("teacher") if user.role != Role.MAITRE and changes.get("teacher") else old.teacher,
        date=changes.get("date", old.date), surah=rng.surah, ayah_start=rng.ayah_start, ayah_end=rng.ayah_end,
        juz=rng.juz, hizb=rng.hizb, page=rng.page, quality=quality,
        observations=changes.get("observations", old.observations),
        appreciation=changes.get("appreciation", old.appreciation),
        supersedes=old, correction_reason=reason,
    )
    old.is_current = False
    old.save(update_fields=["is_current", "updated_at"])
    return new


# ---------------------------------------------------------------- révisions ---------------
@transaction.atomic
def create_revision(user, data: dict) -> Revision:
    est = user.establishment
    student = data["student"]
    rng = resolve_range(data["surah_id"], data["ayah_start"], data["ayah_end"])
    check_quality(est, data["quality"])
    return Revision.objects.create(
        establishment=est, student=student, teacher=_default_teacher(user, student, data.get("teacher")),
        date=data["date"], surah=rng.surah, ayah_start=rng.ayah_start, ayah_end=rng.ayah_end,
        quality=data["quality"], difficulties=data.get("difficulties", ""),
        recommendations=data.get("recommendations", ""), appreciation=data.get("appreciation", ""),
    )


@transaction.atomic
def correct_revision(user, old: Revision, changes: dict, reason: str) -> Revision:
    reason = require_reason(reason)
    old = _supersede_target(Revision, old)
    est = user.establishment
    rng = resolve_range(
        changes.get("surah_id", old.surah_id), changes.get("ayah_start", old.ayah_start),
        changes.get("ayah_end", old.ayah_end),
    )
    quality = changes.get("quality", old.quality)
    if quality != old.quality:
        check_quality(est, quality)
    new = Revision.objects.create(
        establishment=est, student=old.student,
        teacher=changes.get("teacher") if user.role != Role.MAITRE and changes.get("teacher") else old.teacher,
        date=changes.get("date", old.date), surah=rng.surah, ayah_start=rng.ayah_start, ayah_end=rng.ayah_end,
        quality=quality, difficulties=changes.get("difficulties", old.difficulties),
        recommendations=changes.get("recommendations", old.recommendations),
        appreciation=changes.get("appreciation", old.appreciation),
        supersedes=old, correction_reason=reason,
    )
    old.is_current = False
    old.save(update_fields=["is_current", "updated_at"])
    return new


# ---------------------------------------------------------------- évaluations ------------
def _write_scores(evaluation: Evaluation, scores: list[dict]) -> Decimal | None:
    seen = set()
    pairs = []
    for item in scores:
        criterion, value = item["criterion"], Decimal(item["score"])
        if criterion.pk in seen:
            raise ValidationError({"scores": "Un critère ne peut être noté qu'une seule fois."})
        seen.add(criterion.pk)
        if not criterion.is_active:
            raise ValidationError({"scores": f"Le critère « {criterion.name} » est désactivé."})
        if value < 0 or value > criterion.max_score:
            raise ValidationError(
                {"scores": f"La note du critère « {criterion.name} » doit être comprise entre 0 et {criterion.max_score:g}."}
            )
        pairs.append((criterion, value))
    if not pairs:
        raise ValidationError({"scores": "Notez au moins un critère."})
    EvaluationScore.objects.bulk_create(
        [EvaluationScore(establishment=evaluation.establishment, evaluation=evaluation, criterion=c, score=v) for c, v in pairs]
    )
    return overall_score(pairs)


@transaction.atomic
def create_evaluation(user, data: dict) -> Evaluation:
    student = data["student"]
    evaluation = Evaluation.objects.create(
        establishment=user.establishment, student=student, teacher=_default_teacher(user, student, data.get("teacher")),
        date=data["date"], scope=data.get("scope", ""), appreciation=data.get("appreciation", ""),
        internal_notes=data.get("internal_notes", ""),
    )
    evaluation.overall_score = _write_scores(evaluation, data.get("scores") or [])
    evaluation.save(update_fields=["overall_score", "updated_at"])
    notify_guardians(
        student, NotificationKind.EVALUATION, "Nouvelle évaluation",
        f"{student.first_name} : évaluation du {evaluation.date:%d/%m/%Y}, note globale {evaluation.overall_score:g}/20.",
    )
    return evaluation


@transaction.atomic
def correct_evaluation(user, old: Evaluation, changes: dict, reason: str) -> Evaluation:
    reason = require_reason(reason)
    old = _supersede_target(Evaluation, old)
    new = Evaluation.objects.create(
        establishment=user.establishment, student=old.student,
        teacher=changes.get("teacher") if user.role != Role.MAITRE and changes.get("teacher") else old.teacher,
        date=changes.get("date", old.date), scope=changes.get("scope", old.scope),
        appreciation=changes.get("appreciation", old.appreciation),
        internal_notes=changes.get("internal_notes", old.internal_notes),
        supersedes=old, correction_reason=reason,
    )
    if "scores" in changes:
        scores = changes["scores"]
    else:  # notes inchangées : recopiées à l'identique sur la nouvelle version
        scores = None
    if scores is None:  # notes inchangées : recopiées telles quelles (même si un critère a été désactivé depuis)
        new.overall_score = _copy_scores(new, old)
    else:
        new.overall_score = _write_scores(new, scores)
    new.save(update_fields=["overall_score", "updated_at"])
    old.is_current = False
    old.save(update_fields=["is_current", "updated_at"])
    return new


def _copy_scores(new: Evaluation, old: Evaluation) -> Decimal | None:
    pairs = [(s.criterion, s.score) for s in old.scores.select_related("criterion")]
    EvaluationScore.objects.bulk_create(
        [EvaluationScore(establishment=new.establishment, evaluation=new, criterion=c, score=v) for c, v in pairs]
    )
    return overall_score(pairs)
