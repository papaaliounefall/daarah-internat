"""Rendu PDF de la carte talibé, fidèle au modèle officiel (90 x 60 mm).

Le fond est le modèle officiel « vierge » (``template.build_blank_background``) ; on y superpose uniquement :
la photo du talibé dans la zone intérieure du cadre doré et les valeurs sur les lignes de champs.

Les coordonnées ci-dessous sont des PIXELS DU MODÈLE (1280 x 853) mesurés sur l'image ; ``_x``/``_y`` les
convertissent en points PDF. Pour ajuster l'alignement, modifier uniquement ``FIELDS`` / ``PHOTO_BOX`` ou
``VALUE_*`` puis régénérer un aperçu (voir docs/api/documents.md).
"""
from __future__ import annotations

import io

from PIL import Image, ImageOps
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from . import arabic
from .template import BLANK, MODEL, build_blank_background

# --- format et repère -------------------------------------------------------------------------------
PAGE_W, PAGE_H = 90 * mm, 60 * mm
IMG_W, IMG_H = 1280, 853  # dimensions du modèle en pixels


def _x(px: float) -> float:
    return px * PAGE_W / IMG_W


def _y(py: float) -> float:
    return (IMG_H - py) * PAGE_H / IMG_H


# --- champs : (clé, ordonnée de la ligne, abscisse de début de ligne) en pixels du modèle ---------------
FIELDS = [
    ("classe", 410, 696),
    ("numero", 452.5, 720),
    ("nom", 495, 672),
    ("pere", 537, 668),
    ("mere", 579.5, 677),
    ("nationalite", 622, 760),
    ("ville", 664.5, 666),
    ("telephone", 707, 750),
    ("date_inscription", 749, 851),
]
LINE_END_X = 1200          # fin commune des lignes de champs
VALUE_PAD_LEFT = 12        # retrait du texte après le début de la ligne
VALUE_PAD_RIGHT = 6
VALUE_RISE = 4.5             # le texte repose légèrement au-dessus de la ligne
VALUE_MAX_PT = 6.4         # taille de départ (le libellé du modèle fait ~6,4 pt)
VALUE_MIN_PT = 4.2         # taille plancher avant troncature
VALUE_FONT = arabic.LATIN_BOLD
VALUE_COLOR = (0.06, 0.16, 0.12)  # vert très sombre, proche des libellés du modèle

# Zone photo : intérieur du tracé pointillé du cadre (x0, y0, x1, y1) + coins coupés, en pixels du modèle.
PHOTO_BOX = (116, 432, 481, 681)
PHOTO_CHAMFER = 28
PHOTO_ANCHOR_Y = 0.30      # recadrage « cover » : on conserve plutôt le haut de l'image (visage)
PHOTO_DPI = 600


def _photo_reader(raw: bytes | None) -> ImageReader | None:
    """Recadre la photo pour remplir la zone SANS déformation (cover), jamais d'étirement."""
    if not raw:
        return None
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    except Exception:  # noqa: BLE001 - fichier illisible : on imprime la carte sans photo
        return None
    x0, y0, x1, y1 = PHOTO_BOX
    zone_w_mm = _x(x1 - x0) / mm
    zone_h_mm = (_y(y0) - _y(y1)) / mm
    ratio = zone_w_mm / zone_h_mm
    w, h = img.size
    if w / h > ratio:  # trop large : on rogne les côtés, centré
        new_w = round(h * ratio)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    else:              # trop haut : on rogne en conservant le haut
        new_h = round(w / ratio)
        top = round((h - new_h) * PHOTO_ANCHOR_Y)
        img = img.crop((0, top, w, top + new_h))
    target_w = round(zone_w_mm / 25.4 * PHOTO_DPI)
    if img.width > target_w:
        img = img.resize((target_w, round(target_w / ratio)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    buf.seek(0)
    return ImageReader(buf)


def _draw_photo(c: canvas.Canvas, reader: ImageReader) -> None:
    x0, y0, x1, y1 = PHOTO_BOX
    k = PHOTO_CHAMFER
    pts = [(x0 + k, y0), (x1 - k, y0), (x1, y0 + k), (x1, y1 - k), (x1 - k, y1), (x0 + k, y1), (x0, y1 - k), (x0, y0 + k)]
    c.saveState()
    path = c.beginPath()
    path.moveTo(_x(pts[0][0]), _y(pts[0][1]))
    for px, py in pts[1:]:
        path.lineTo(_x(px), _y(py))
    path.close()
    c.clipPath(path, stroke=0, fill=0)
    c.drawImage(reader, _x(x0), _y(y1), _x(x1) - _x(x0), _y(y0) - _y(y1))
    c.restoreState()


def render_card(values: dict, photo: bytes | None = None, *, title: str = "Carte talibé") -> bytes:
    """Retourne le PDF (octets) d'une carte. ``values`` : clés de ``FIELDS`` -> texte (str)."""
    arabic.register_fonts()
    if not BLANK.exists():  # fond dérivé du modèle ; reconstruit si absent
        build_blank_background(MODEL, BLANK)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(PAGE_W, PAGE_H))
    c.setTitle(title)
    c.setAuthor("Daara Internat Shaykh Aliou Fatima")
    c.setSubject("Carte talibé")
    c.drawImage(str(BLANK), 0, 0, PAGE_W, PAGE_H)

    reader = _photo_reader(photo)
    if reader is not None:
        _draw_photo(c, reader)

    c.setFillColorRGB(*VALUE_COLOR)
    for key, line_y, line_x in FIELDS:
        text = (values.get(key) or "").strip()
        if not text:
            continue
        arabic.draw_text(
            c, _x(line_x + VALUE_PAD_LEFT), _y(line_y - VALUE_RISE), text,
            font=VALUE_FONT, size=VALUE_MAX_PT, min_size=VALUE_MIN_PT,
            max_width=_x(LINE_END_X - VALUE_PAD_RIGHT) - _x(line_x + VALUE_PAD_LEFT),
        )
    c.showPage()
    c.save()
    return buf.getvalue()
