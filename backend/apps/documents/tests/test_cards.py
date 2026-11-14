import pytest

from apps.audit.models import AuditLog
from apps.documents import services, tasks
from apps.documents.models import StudentCard
from apps.documents.pdf.card import FIELDS, PAGE_H, PAGE_W, render_card
from apps.students.models import Student
from conftest import client_for

pytestmark = pytest.mark.django_db


def url(student, suffix=""):
    return f"/api/students/{student.pk}/card/{suffix}"


# --------------------------------------------------------------------------- rendu PDF
def test_render_card_is_valid_pdf_with_model_page_size():
    pdf = render_card({"nom": "FALL Mansour", "numero": "DAF-2026-0001"})
    assert pdf.startswith(b"%PDF")
    fitz = pytest.importorskip("fitz")
    page = fitz.open(stream=pdf, filetype="pdf")[0]
    assert round(page.rect.width / 72 * 25.4) == 90 and round(page.rect.height / 72 * 25.4) == 60
    assert abs(PAGE_W / PAGE_H - 1.5) < 1e-6


def test_render_card_prints_every_field_value():
    fitz = pytest.importorskip("fitz")
    values = {k: f"valeur-{k}" for k, *_ in FIELDS}
    page = fitz.open(stream=render_card(values), filetype="pdf")[0]
    text = page.get_text()
    for k, *_ in FIELDS:
        assert f"valeur-{k}" in text
    assert "Coller la photo" not in text  # le texte d'exemple du modèle est masqué dans le fond


def test_card_values_rules(student, classroom):
    student.birth_place = ""
    student.address = "Médina Kaolack"
    student.guardian_phone, student.father_phone = "", "70 640 40 58"
    student.save()
    v = services.card_values(student)
    assert v["nom"] == "FALL Mansour"
    assert v["classe"] == "Hifz"
    assert v["ville"] == "Médina Kaolack"            # repli sur l'adresse
    assert v["telephone"] == "70 640 40 58"          # repli sur le père
    assert v["date_inscription"] == "07/11/2026"
    assert v["numero"] == student.registration_number


def test_long_and_arabic_values_do_not_crash():
    pdf = render_card({"nom": "NDIAYE " + "Ahmadou " * 20, "pere": "مصطفى ولد عبد الله", "classe": ""})
    assert pdf.startswith(b"%PDF")


def test_photo_is_placed_without_distortion(student, photo_file):
    fitz = pytest.importorskip("fitz")
    student.photo.save("p.jpg", photo_file, save=True)
    pdf, _ = services.render_student_card(student)
    page = fitz.open(stream=pdf, filetype="pdf")[0]
    imgs = page.get_images(full=True)
    assert len(imgs) == 2  # fond + photo
    rects = [(i, page.get_image_rects(i[0])[0]) for i in imgs]
    photo, zone = next((i, r) for i, r in rects if r.width < 100)
    # la photo recadrée a exactement le ratio de la zone : aucun étirement malgré une source 35x45
    assert abs(photo[2] / photo[3] - zone.width / zone.height) < 0.02


# --------------------------------------------------------------------------- endpoints
def test_preview_does_not_persist(api, student):
    r = api.get(url(student, "preview/"))
    assert r.status_code == 200
    assert r["Content-Type"] == "application/pdf" and r.content.startswith(b"%PDF")
    assert "inline" in r["Content-Disposition"]
    assert StudentCard.objects.count() == 0
    assert AuditLog.objects.filter(action="PDF_CARD_PREVIEW").exists()


def test_accept_header_pdf_is_not_406(api, student):
    assert api.get(url(student, "preview/"), HTTP_ACCEPT="application/pdf").status_code == 200


def test_generate_creates_versions_never_overwrites(api, student, director):
    r1 = api.post(url(student), {"reason": "Première impression"}, format="json")
    assert r1.status_code == 201
    b1 = r1.json()
    assert b1["version"] == 1 and b1["is_current"] and b1["snapshot"]["classe"] == "Hifz"
    assert b1["pdf_url"].startswith("/api/files/")
    assert "/media/" not in b1["pdf_url"]

    r2 = api.post(url(student), {"reason": "Perte"}, format="json")
    assert r2.status_code == 201 and r2.json()["version"] == 2
    cards = list(StudentCard.objects.filter(student=student).order_by("version"))
    assert [c.version for c in cards] == [1, 2]
    assert [c.is_current for c in cards] == [False, True]
    assert cards[1].reason == "Perte" and cards[1].generated_by == director
    assert cards[0].pdf.name != cards[1].pdf.name  # le fichier v1 existe toujours, distinct
    assert cards[0].pdf.storage.exists(cards[0].pdf.name)
    assert AuditLog.objects.filter(action="PDF_CARD", object_id=str(cards[1].pk)).exists()


def test_generate_without_reason_gets_default_reason(api, student):
    assert api.post(url(student), {}, format="json").json()["reason"] == "Première édition"
    assert api.post(url(student), {}, format="json").json()["reason"] == "Régénération"


def test_signed_pdf_url_serves_the_pdf(api, student):
    from rest_framework.test import APIClient

    pdf_url = api.post(url(student), {}, format="json").json()["pdf_url"]
    r = APIClient().get(pdf_url.replace("http://testserver", ""))  # URL signée : pas de JWT nécessaire
    assert r.status_code == 200 and b"".join(r.streaming_content).startswith(b"%PDF")


def test_history_and_current_download(api, student):
    api.post(url(student), {"reason": "a"}, format="json")
    api.post(url(student), {"reason": "b"}, format="json")
    hist = api.get(f"/api/students/{student.pk}/cards/").json()
    assert [h["version"] for h in hist] == [2, 1]
    cur = api.get(url(student))
    assert cur.status_code == 200 and cur.content.startswith(b"%PDF")
    assert "v2" in cur["Content-Disposition"]
    by_id = api.get(f"/api/cards/{hist[1]['id']}/pdf/")  # une ancienne version reste consultable (admin)
    assert by_id.status_code == 200 and by_id.content.startswith(b"%PDF")


def test_current_404_when_no_card(api, student):
    assert api.get(url(student)).status_code == 404


def test_assistant_can_generate(assistant, student):
    c = client_for(assistant)
    assert c.post(url(student), {}, format="json").status_code == 201
    assert c.get(url(student, "preview/")).status_code == 200


def test_teacher_has_no_access_even_to_own_pupil(teacher, student):
    c = client_for(teacher)
    assert c.get(url(student, "preview/")).status_code == 403
    assert c.post(url(student), {}, format="json").status_code == 403
    assert c.get(url(student)).status_code == 403
    assert c.get(f"/api/students/{student.pk}/cards/").status_code == 403


def test_parent_can_download_current_card_of_own_child_only(api, parent, child_of_parent, make_student, classroom):
    api.post(url(child_of_parent), {"reason": "a"}, format="json")
    api.post(url(child_of_parent), {"reason": "b"}, format="json")
    other = make_student(classroom, first_name="Autre", last_name="Enfant")
    api.post(url(other), {}, format="json")
    p = client_for(parent)

    r = p.get(url(child_of_parent))
    assert r.status_code == 200 and r.content.startswith(b"%PDF") and "v2" in r["Content-Disposition"]
    hist = p.get(f"/api/students/{child_of_parent.pk}/cards/").json()
    assert len(hist) == 1 and hist[0]["version"] == 2
    assert "snapshot" not in hist[0] and "reason" not in hist[0]
    old = StudentCard.objects.get(student=child_of_parent, version=1)
    cur = StudentCard.objects.get(student=child_of_parent, version=2)
    assert p.get(f"/api/cards/{cur.pk}/pdf/").status_code == 200
    assert p.get(f"/api/cards/{old.pk}/pdf/").status_code == 404           # pas l'ancienne version
    other_card = StudentCard.objects.get(student=other)
    assert p.get(f"/api/cards/{other_card.pk}/pdf/").status_code == 404    # pas l'enfant d'un autre
    assert p.get(url(other)).status_code == 404
    assert p.get(f"/api/students/{other.pk}/cards/").status_code == 404
    # lecture seule : ni aperçu, ni génération, ni lot
    assert p.get(url(child_of_parent, "preview/")).status_code == 403
    assert p.post(url(child_of_parent), {}, format="json").status_code == 403
    assert p.post("/api/cards/batch/", {"students": [str(child_of_parent.pk)]}, format="json").status_code == 403


def test_isolation_between_establishments(other_director, student, api):
    api.post(url(student), {}, format="json")
    card = StudentCard.objects.get(student=student)
    c = client_for(other_director)
    assert c.get(url(student, "preview/")).status_code == 404
    assert c.post(url(student), {}, format="json").status_code == 404
    assert c.get(url(student)).status_code == 404
    assert c.get(f"/api/students/{student.pk}/cards/").status_code == 404
    assert c.get(f"/api/cards/{card.pk}/pdf/").status_code == 404
    assert c.post("/api/cards/batch/", {"students": [str(student.pk)]}, format="json").status_code == 400


def test_unauthenticated_is_rejected(student):
    from rest_framework.test import APIClient

    assert APIClient().get(url(student, "preview/")).status_code in (401, 403)


def test_batch_generation(api, make_student, classroom, teacher):
    s1, s2 = make_student(classroom), make_student(classroom, first_name="Ibra")
    r = api.post("/api/cards/batch/", {"students": [str(s1.pk), str(s2.pk)], "reason": "Rentrée"}, format="json")
    assert r.status_code == 202 and r.json()["queued"] == 2
    for s in (s1, s2):
        card = StudentCard.objects.get(student=s)
        assert card.version == 1 and card.reason == "Rentrée"
    api.post("/api/cards/batch/", {"students": [str(s1.pk)]}, format="json")
    assert StudentCard.objects.filter(student=s1).count() == 2
    assert client_for(teacher).post("/api/cards/batch/", {"students": [str(s1.pk)]}, format="json").status_code == 403
    assert api.post("/api/cards/batch/", {"students": []}, format="json").status_code == 400
    assert api.post("/api/cards/batch/", {"students": ["00000000-0000-0000-0000-000000000000"]},
                    format="json").status_code == 400


# --------------------------------------------------------------------------- génération automatique
def test_auto_generation_after_creation_includes_class(api, classroom, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True) as cbs:
        r = api.post("/api/students/", {"first_name": "Mansour", "last_name": "Fall", "gender": "M",
                                        "father_name": "Abdoulaye Fall", "classroom": str(classroom.pk)}, format="json")
    assert r.status_code == 201 and len(cbs) >= 1
    card = StudentCard.objects.get(student_id=r.json()["id"])
    assert card.version == 1 and card.is_current and card.generated_by is None
    assert card.snapshot["classe"] == "Hifz"          # la classe créée après le dossier est bien imprimée
    assert card.snapshot["nom"] == "FALL Mansour"
    assert card.reason == services.AUTO_REASON
    assert card.pdf.storage.exists(card.pdf.name)


def test_no_card_before_commit(api, classroom):
    # sans exécuter les callbacks on_commit, rien n'est généré (génération en fin de transaction)
    api.post("/api/students/", {"first_name": "A", "last_name": "B", "gender": "M", "classroom": str(classroom.pk)},
             format="json")
    assert StudentCard.objects.count() == 0


def test_auto_generation_is_idempotent(student):
    assert tasks.generate_student_card(str(student.pk), only_if_missing=True)
    assert tasks.generate_student_card(str(student.pk), only_if_missing=True) is None
    assert StudentCard.objects.filter(student=student).count() == 1


def test_generation_failure_never_breaks_enrollment(api, classroom, monkeypatch, django_capture_on_commit_callbacks):
    def boom(*a, **k):
        raise RuntimeError("disque plein")

    monkeypatch.setattr(services, "generate_card", boom)
    with django_capture_on_commit_callbacks(execute=True):
        r = api.post("/api/students/", {"first_name": "A", "last_name": "B", "gender": "M",
                                        "classroom": str(classroom.pk)}, format="json")
    assert r.status_code == 201
    assert Student.objects.filter(pk=r.json()["id"]).exists()
    assert StudentCard.objects.count() == 0
    assert AuditLog.objects.filter(action="PDF_CARD_FAILED").exists()


def test_broker_failure_never_breaks_enrollment(api, classroom, monkeypatch, django_capture_on_commit_callbacks):
    def boom(*a, **k):
        raise ConnectionError("redis down")

    monkeypatch.setattr(tasks.generate_student_card, "delay", boom)
    with django_capture_on_commit_callbacks(execute=True):
        r = api.post("/api/students/", {"first_name": "A", "last_name": "B", "gender": "M"}, format="json")
    assert r.status_code == 201
    assert AuditLog.objects.filter(action="PDF_CARD_FAILED").exists()
