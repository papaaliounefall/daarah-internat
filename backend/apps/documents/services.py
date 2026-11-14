"""Règles métier des cartes talibé : données imprimées, versionnage, génération.

Chaque (ré)génération crée une NOUVELLE version (``version`` + 1) ; l'ancienne passe ``is_current=False``.
Aucune version n'est jamais écrasée ni supprimée.
"""
from __future__ import annotations

import logging
import uuid

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from apps.academics.models import Enrollment
from apps.audit.services import record
from apps.students.models import Student

from .models import StudentCard
from .pdf.card import render_card

logger = logging.getLogger(__name__)

AUTO_REASON = "Génération automatique à l'inscription"


def current_enrollment(student: Student) -> Enrollment | None:
    """Inscription de l'année active (sinon la plus récente) : source de la « Classe » imprimée."""
    qs = Enrollment.objects.filter(student=student).select_related("classroom", "academic_year")
    enr = qs.filter(academic_year__is_current=True).first()
    return enr or qs.order_by("-academic_year__start_date").first()


def card_values(student: Student) -> dict:
    """Valeurs imprimées sur la carte (jj/mm/aaaa, NOM Prénom, repli ville/téléphone)."""
    enr = current_enrollment(student)
    classe = enr.classroom.name if enr and enr.classroom else ""
    nom = f"{student.last_name.upper()} {student.first_name}".strip()
    return {
        "classe": classe,
        "numero": student.registration_number,
        "nom": nom,
        "pere": student.father_name,
        "mere": student.mother_name,
        "nationalite": student.nationality,
        "ville": student.birth_place or student.address,
        "telephone": student.guardian_phone or student.father_phone or student.mother_phone,
        "date_inscription": student.enrollment_date.strftime("%d/%m/%Y") if student.enrollment_date else "",
    }


def _photo_bytes(student: Student) -> bytes | None:
    if not student.photo:
        return None
    try:
        with student.photo.open("rb") as fh:
            return fh.read()
    except Exception:  # noqa: BLE001 - fichier manquant : carte sans photo plutôt qu'une erreur
        logger.warning("Photo introuvable pour le talibé %s", student.pk)
        return None


def render_student_card(student: Student) -> tuple[bytes, dict]:
    values = card_values(student)
    pdf = render_card(values, _photo_bytes(student), title=f"Carte talibé {student.registration_number}")
    return pdf, values


@transaction.atomic
def generate_card(student: Student, *, user=None, reason: str = "", request=None) -> StudentCard:
    """Crée la version suivante de la carte et la rend courante."""
    # Verrou sur le dossier : deux générations simultanées n'obtiennent jamais le même numéro de version.
    locked = Student.objects.select_for_update().get(pk=student.pk)
    last = locked.cards.order_by("-version").first()
    version = (last.version if last else 0) + 1
    reason = (reason or "").strip() or ("Première édition" if last is None else "Régénération")

    pdf, values = render_student_card(locked)
    locked.cards.filter(is_current=True).update(is_current=False)
    card = StudentCard(
        establishment_id=locked.establishment_id, student=locked, version=version, is_current=True,
        reason=reason[:255], generated_by=user if getattr(user, "is_authenticated", False) else None,
        snapshot={**values, "photo": locked.photo.name if locked.photo else "", "generated_at": timezone.now().isoformat()},
    )
    filename = f"{locked.establishment_id}/{locked.registration_number}-v{version}-{uuid.uuid4().hex[:8]}.pdf"
    card.pdf.save(filename, ContentFile(pdf), save=False)
    card.save()
    record(request, "PDF_CARD", card, user=user,
           changes={"student": str(locked.pk), "version": version, "reason": reason})
    return card


AUTO_UPDATE_REASON = "Mise à jour automatique (informations ou photo modifiées)"


def card_is_stale(student: Student) -> bool:
    """Vrai si la carte courante ne reflète plus le dossier (photo, identité, parents, classe, téléphone…)."""
    current = student.cards.filter(is_current=True).first()
    if current is None:
        return False  # pas de carte : rien à mettre à jour (la création est gérée à l'inscription)
    now = {**card_values(student), "photo": student.photo.name if student.photo else ""}
    old = current.snapshot or {}
    return any(old.get(k, "") != v for k, v in now.items())


def card_pdf_bytes(card: StudentCard) -> bytes:
    with card.pdf.open("rb") as fh:
        return fh.read()


# ---------------------------------------------------------------------------------------------------
# Reçus et rapports financiers
# ---------------------------------------------------------------------------------------------------
def receipt_data(payment, printed_by) -> dict:
    """Données imprimées sur le reçu d'un paiement (ne modifie rien)."""
    from apps.finance.models import FeeKind, PaymentMethod

    student = payment.student
    obj = FeeKind(payment.fee_kind).label if payment.fee_kind in FeeKind.values else payment.fee_kind
    if payment.period_label:
        obj = f"{obj} — {payment.period_label}"
    cancelled = payment.status == "ANNULE"
    info = ""
    if cancelled:
        who = payment.cancelled_by.full_name if payment.cancelled_by else ""
        when = payment.cancelled_at.astimezone().strftime("%d/%m/%Y") if payment.cancelled_at else ""
        info = " ".join(p for p in [f"Annulé le {when}" if when else "", f"par {who}" if who else ""] if p)
    return {
        "establishment": payment.establishment,
        "receipt_number": payment.receipt_number,
        "student_name": f"{student.last_name.upper()} {student.first_name}".strip(),
        "registration_number": student.registration_number,
        "object": obj,
        "due_label": payment.due.label if payment.due else "",
        "method": PaymentMethod(payment.method).label if payment.method in PaymentMethod.values else payment.method,
        "reference": payment.reference,
        "date": payment.date.strftime("%d/%m/%Y"),
        "amount": payment.amount,
        "recorded_by": payment.recorded_by.full_name if payment.recorded_by else "",
        "cancelled": cancelled,
        "cancel_reason": payment.cancel_reason,
        "cancelled_info": info,
        "printed_at": timezone.localtime().strftime("%d/%m/%Y %H:%M"),
        "printed_by": printed_by.full_name,
    }
