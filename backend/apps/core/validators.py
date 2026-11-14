"""Validation des fichiers envoyés : taille, extension ET contenu réel (pas seulement le nom)."""
import os

from django.conf import settings
from django.core.exceptions import ValidationError
from PIL import Image

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
DOC_EXT = IMAGE_EXT | {".pdf"}


def _check_size(f, max_size):
    max_size = max_size or settings.MAX_UPLOAD_SIZE
    if f.size > max_size:
        raise ValidationError(f"Fichier trop volumineux (maximum {max_size // (1024 * 1024)} Mo).")


def validate_image(f):
    _check_size(f, None)
    ext = os.path.splitext(f.name)[1].lower()
    if ext not in IMAGE_EXT:
        raise ValidationError("Format d'image non autorisé (JPG, PNG ou WebP).")
    try:
        f.seek(0)
        img = Image.open(f)
        img.verify()
    except Exception as exc:  # noqa: BLE001
        raise ValidationError("Le fichier n'est pas une image valide.") from exc
    finally:
        f.seek(0)


def validate_document(f):
    """Image ou PDF."""
    _check_size(f, None)
    ext = os.path.splitext(f.name)[1].lower()
    if ext not in DOC_EXT:
        raise ValidationError("Format non autorisé (PDF, JPG, PNG ou WebP).")
    if ext == ".pdf":
        f.seek(0)
        head = f.read(5)
        f.seek(0)
        if head != b"%PDF-":
            raise ValidationError("Le fichier n'est pas un PDF valide.")
    else:
        validate_image(f)
