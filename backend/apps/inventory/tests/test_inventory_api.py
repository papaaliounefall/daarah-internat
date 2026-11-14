from decimal import Decimal

import pytest

from apps.inventory.models import Item, ItemCategory, StockMovement, Supplier
from apps.inventory import services
from apps.notifications.models import Notification
from conftest import client_for

pytestmark = pytest.mark.django_db


@pytest.fixture
def cat(est):
    return ItemCategory.objects.create(establishment=est, name="Alimentaire")


@pytest.fixture
def rice(est, cat):
    return Item.objects.create(establishment=est, category=cat, name="Riz", unit="Sacs", min_threshold=Decimal("5"))


def move(api, item, kind, qty, **kw):
    return api.post("/api/inventory/movements/", {"item": str(item.pk), "kind": kind, "quantity": str(qty), **kw}, format="json")


# ---------- droits ----------
def test_roles(api, assistant, teacher, parent, rice):
    for url in ("items", "categories", "suppliers", "movements"):
        assert client_for(teacher).get(f"/api/inventory/{url}/").status_code == 403
        assert client_for(parent).get(f"/api/inventory/{url}/").status_code == 403
        assert client_for(assistant).get(f"/api/inventory/{url}/").status_code == 200
    for url in ("alerts", "summary"):
        assert client_for(teacher).get(f"/api/inventory/{url}/").status_code == 403
        assert client_for(parent).get(f"/api/inventory/{url}/").status_code == 403
    assert client_for(teacher).post("/api/inventory/categories/", {"name": "X"}, format="json").status_code == 403
    assert move(client_for(parent), rice, "ENTREE", 1).status_code == 403
    assert move(client_for(assistant), rice, "ENTREE", 1).status_code == 201  # l'assistant gère les stocks


# ---------- articles ----------
def test_item_create_with_initial_quantity(api, cat):
    r = api.post("/api/inventory/items/", {"name": "Huile", "category": str(cat.pk), "unit": "Bidons", "min_threshold": "3", "initial_quantity": "10"}, format="json")
    assert r.status_code == 201, r.content
    body = r.json()
    assert Decimal(body["quantity"]) == 10 and body["is_low"] is False and body["category_name"] == "Alimentaire"
    mv = StockMovement.objects.get()
    assert mv.kind == "ENTREE" and mv.quantity_after == 10 and mv.reason == "Stock initial"


def test_quantity_not_editable_directly(api, rice):
    r = api.patch(f"/api/inventory/items/{rice.pk}/", {"quantity": "999", "name": "Riz parfumé"}, format="json")
    assert r.status_code == 200
    rice.refresh_from_db()
    assert rice.quantity == 0 and rice.name == "Riz parfumé"
    r = api.post("/api/inventory/items/", {"name": "Sucre", "category": str(rice.category_id), "quantity": "50"}, format="json")
    assert r.status_code == 201 and Decimal(r.json()["quantity"]) == 0


def test_duplicate_names_and_no_delete(api, rice, cat):
    assert api.post("/api/inventory/items/", {"name": "riz", "category": str(cat.pk)}, format="json").status_code == 400
    assert api.post("/api/inventory/categories/", {"name": "ALIMENTAIRE"}, format="json").status_code == 400
    assert api.delete(f"/api/inventory/items/{rice.pk}/").status_code in (403, 405)
    assert Item.objects.filter(pk=rice.pk).exists()


# ---------- mouvements ----------
def test_entry_exit_and_quantity_after(api, rice):
    r = move(api, rice, "ENTREE", 20)
    assert r.status_code == 201 and Decimal(r.json()["quantity_after"]) == 20 and Decimal(r.json()["quantity_before"]) == 0
    r = move(api, rice, "SORTIE", 7.5, reason="Cuisine")
    assert r.status_code == 201 and Decimal(r.json()["quantity_after"]) == Decimal("12.5")
    rice.refresh_from_db()
    assert rice.quantity == Decimal("12.50")
    assert api.get(f"/api/inventory/movements/?item={rice.pk}").json()["count"] == 2


def test_negative_stock_refused(api, rice):
    move(api, rice, "ENTREE", 3)
    r = move(api, rice, "SORTIE", 4)
    assert r.status_code == 400 and "insuffisant" in str(r.json())
    rice.refresh_from_db()
    assert rice.quantity == 3
    assert StockMovement.objects.count() == 1  # aucun mouvement fantôme


def test_invalid_quantities(api, rice):
    assert move(api, rice, "ENTREE", 0).status_code == 400
    assert move(api, rice, "SORTIE", -2).status_code == 400
    assert move(api, rice, "ENTREE", "abc").status_code == 400
    assert move(api, rice, "ENTREE", 1, date="2999-01-01").status_code == 400


def test_adjustment_sets_counted_quantity_with_reason(api, rice):
    move(api, rice, "ENTREE", 10)
    assert move(api, rice, "AJUSTEMENT", 8).status_code == 400  # motif obligatoire
    r = move(api, rice, "AJUSTEMENT", 8, reason="Inventaire de fin de mois")
    assert r.status_code == 201
    assert Decimal(r.json()["quantity_before"]) == 10 and Decimal(r.json()["quantity_after"]) == 8
    rice.refresh_from_db()
    assert rice.quantity == 8


def test_movements_are_immutable(api, rice):
    mv = move(api, rice, "ENTREE", 5).json()
    assert api.patch(f"/api/inventory/movements/{mv['id']}/", {"quantity": "50"}, format="json").status_code in (403, 405)
    assert api.delete(f"/api/inventory/movements/{mv['id']}/").status_code in (403, 405)
    assert StockMovement.objects.filter(pk=mv["id"]).exists()


def test_inactive_item_refused(api, rice):
    rice.is_active = False
    rice.save()
    assert move(api, rice, "ENTREE", 1).status_code == 400


def test_supplier_of_other_establishment_rejected(api, rice, other_est):
    foreign = Supplier.objects.create(establishment=other_est, name="Étranger")
    assert move(api, rice, "ENTREE", 1, supplier=str(foreign.pk)).status_code == 400


def test_service_rejects_oversized_exit_directly(director, rice):
    with pytest.raises(Exception):
        services.apply_movement(rice, "SORTIE", 1, user=director)


# ---------- alertes ----------
def test_alerts_and_summary(api, est, cat, rice):
    other = Item.objects.create(establishment=est, category=cat, name="Sucre", min_threshold=Decimal("2"))
    move(api, rice, "ENTREE", 10)
    move(api, other, "ENTREE", 50)
    alerts = api.get("/api/inventory/alerts/").json()
    assert alerts["count"] == 0
    move(api, rice, "SORTIE", 6)  # reste 4 <= seuil 5
    alerts = api.get("/api/inventory/alerts/").json()
    assert alerts["count"] == 1 and alerts["results"][0]["name"] == "Riz" and alerts["results"][0]["is_low"] is True
    s = api.get("/api/inventory/summary/").json()
    assert s["total_items"] == 2 and s["low_stock_count"] == 1 and s["out_of_stock_count"] == 0
    assert s["last_30_days"]["entries"] == 2 and s["last_30_days"]["exits"] == 1
    assert s["categories"][0]["low_items"] == 1 and len(s["recent_movements"]) == 3
    assert api.get("/api/inventory/items/?low=true").json()["count"] == 1


def test_low_stock_notification_once_per_day(api, director, assistant, rice):
    move(api, rice, "ENTREE", 10)
    assert Notification.objects.count() == 0
    move(api, rice, "SORTIE", 6)  # franchit le seuil
    notes = Notification.objects.all()
    assert notes.count() == 1 and notes[0].recipient_id == director.pk  # directeur seulement
    assert str(rice.pk) == notes[0].link_id
    move(api, rice, "SORTIE", 1)  # déjà sous le seuil : pas de nouvelle alerte
    move(api, rice, "ENTREE", 10)
    move(api, rice, "SORTIE", 12)  # re-franchit le seuil le même jour : dedupe_key
    assert Notification.objects.count() == 1


def test_no_alert_when_staying_above_threshold(api, director, rice):
    move(api, rice, "ENTREE", 20)
    move(api, rice, "SORTIE", 10)
    assert Notification.objects.count() == 0


# ---------- isolation ----------
def test_isolation(api, other_director, rice):
    other = client_for(other_director)
    assert other.get("/api/inventory/items/").json()["count"] == 0
    assert other.get(f"/api/inventory/items/{rice.pk}/").status_code == 404
    assert move(other, rice, "ENTREE", 5).status_code == 400  # article inexistant pour lui
    assert other.get("/api/inventory/summary/").json()["total_items"] == 0
    assert other.get("/api/inventory/alerts/").json()["count"] == 0
    cat_id = rice.category_id
    r = other.post("/api/inventory/items/", {"name": "Hack", "category": str(cat_id)}, format="json")
    assert r.status_code == 400
