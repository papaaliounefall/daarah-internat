import re

import pytest
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas

from apps.documents.pdf import arabic

HEADER = "مدرسة الشيخ علي فاطمة الداخلية"
PRESENTATION = re.compile("[ﭐ-﷿ﹰ-﻿]")


def test_latin_text_is_untouched():
    assert arabic.shape("Mansour Fall 77 634") == "Mansour Fall 77 634"
    assert not arabic.has_arabic("Mansour")
    assert arabic.has_arabic("محمد")


def test_arabic_is_reshaped_into_presentation_forms_and_reordered():
    shaped = arabic.shape("محمد")
    # lettres liées : plus aucune lettre arabe « de base », uniquement des formes de présentation
    assert all(PRESENTATION.match(ch) for ch in shaped)
    assert shaped != "محمد"
    # ordre visuel inversé : la 1re lettre logique (م) est dessinée en DERNIER (forme initiale à droite)
    assert shaped[-1] == "ﻣ"  # م initiale
    assert shaped[0] == "ﺩ" or shaped[0] == "ﺪ"  # د finale/isolée à gauche


def test_header_all_glyphs_exist_in_amiri():
    arabic.register_fonts()
    font = pdfmetrics.getFont(arabic.AR)
    shaped = arabic.shape(HEADER)
    missing = [ch for ch in shaped if ch != " " and ord(ch) not in font.face.charToGlyph]
    assert not missing, f"glyphes absents de la police : {missing}"


def test_lam_alef_ligature_for_allah():
    shaped = arabic.shape("الله")
    assert any(ch in shaped for ch in ("ﷲ", "ﻻ", "ﻼ", "ﻻ"))


def test_mixed_text_keeps_latin_and_digits():
    shaped = arabic.shape("محمد Fall 2026")
    assert "Fall" in shaped and "2026" in shaped
    assert arabic.font_for("محمد Fall") == arabic.AR
    assert arabic.font_for("Fall") == arabic.LATIN
    assert arabic.font_for("محمد", arabic.LATIN_BOLD) == arabic.AR_BOLD


def test_pdf_embeds_amiri_font_and_text_is_extractable(tmp_path):
    import io

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(300, 120))
    arabic.draw_text(c, 280, 80, HEADER, font=arabic.AR_BOLD, size=14, align="right")
    c.showPage()
    c.save()
    pdf = buf.getvalue()
    assert pdf.startswith(b"%PDF")
    assert b"Amiri" in pdf          # nom de la police (sous-ensemble)
    assert b"/FontFile2" in pdf     # police réellement EMBARQUÉE (TrueType)
    fitz = pytest.importorskip("fitz")
    doc = fitz.open(stream=pdf, filetype="pdf")
    fonts = doc[0].get_fonts()
    assert any("Amiri" in f[3] for f in fonts)
    # Le texte extrait (ordre logique) est en formes de présentation liées : rendu correct, pas de lettres isolées.
    extracted = doc[0].get_text().replace(" ", "").strip()
    assert extracted == arabic.shape(HEADER)[::-1].replace(" ", "")
    assert all(PRESENTATION.match(ch) for ch in extracted)


def test_fit_size_shrinks_and_truncates():
    arabic.register_fonts()
    long = "Mouhamadou Moustapha Cheikh Ahmadou Bamba Mbacké"
    size = arabic.fit_size(long, arabic.LATIN_BOLD, 7, 130, 4.2)
    assert 4.2 <= size < 7
    assert arabic.text_width(long, arabic.LATIN_BOLD, size) <= 130 + 0.01
    out = arabic.truncate_to_width(long * 3, arabic.LATIN_BOLD, 4.2, 40)
    assert out.endswith("…") and arabic.text_width(out, arabic.LATIN_BOLD, 4.2) <= 40
    # texte court : taille inchangée
    assert arabic.fit_size("Hifz", arabic.LATIN_BOLD, 7, 60) == 7


def test_arabic_right_alignment_anchor():
    import io

    arabic.register_fonts()
    c = canvas.Canvas(io.BytesIO(), pagesize=(300, 100))
    drawn = arabic.draw_text(c, 280, 50, HEADER, font=arabic.AR, size=12, align="right", max_width=40 * mm)
    assert drawn <= 12
