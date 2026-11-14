# API Stocks (`apps/inventory`)

Préfixe `/api/inventory/`. Accès : **directeur et assistant** (lecture et écriture) ; maître et parent → 403. Pagination standard, `?search=`. Quantités : nombres décimaux (2 décimales).

## Catégories `/categories/` · Fournisseurs `/suppliers/`
`GET /`, `GET /{id}/`, `POST /`, `PATCH /{id}/`. Catégorie : `id, name (unique, insensible à la casse), items_count`. Fournisseur : `id, name, phone, address`. Pas de suppression.

## Articles `/items/`
`GET /` (filtres `category`, `is_active`, `default_supplier`, `low=true|false`) · `GET /{id}/` · `POST /` · `PATCH /{id}/`
Champs : `id, name (unique), category, category_name, unit, quantity (lecture seule), min_threshold, is_low, default_supplier, supplier_name, last_restocked, is_active`.
- **La quantité n'est jamais modifiable ici** (ignorée en `POST`/`PATCH`). `initial_quantity` (écriture, création seulement) crée un mouvement `ENTREE` « Stock initial ».
- `is_low` : `quantity <= min_threshold`. `last_restocked` : date de la dernière entrée.
- Désactivation (`is_active=false`) à la place de la suppression ; un article désactivé n'accepte plus de mouvement.

## Mouvements `/movements/`
`GET /` (filtres `item`, `kind`, `supplier`, `item__category`, `date_from`, `date_to`) · `GET /{id}/` · `POST /` `{item, kind, quantity, date?, supplier?, reason?}`
Réponse : `id, item, item_name, unit, kind, quantity, quantity_before, quantity_after, date, supplier, supplier_name, reason, recorded_by_name, created_at`.

`services.apply_movement` est le **seul** point d'écriture de la quantité (transaction + verrou de ligne) :
- `ENTREE` : `quantity > 0` ajoutée ;
- `SORTIE` : `quantity > 0` retirée ; **refusée (400) si elle dépasse le stock** (`Stock insuffisant : …`) ;
- `AJUSTEMENT` : `quantity >= 0` = **quantité comptée** lors d'un inventaire ; motif obligatoire ; l'écart se lit dans `quantity_before` → `quantity_after`.
Autres refus : quantité nulle/négative/invalide, date future, fournisseur d'un autre établissement, article désactivé. Un mouvement n'est ni modifié ni supprimé (correction = nouvel ajustement).

**Notification** : quand un mouvement fait passer un article de « au-dessus du seuil » à « au seuil ou en dessous » (ou à zéro), les directeurs reçoivent une notification `GENERAL` « Stock bas » (`link_type=inventory_item`, `dedupe_key = stock-low-<article>-<date>` → une seule par article et par jour).

## Alertes `GET /alerts/`
`{count, results:[article…]}` — articles actifs avec `quantity <= min_threshold`, triés par quantité croissante.

## Tableau de bord `GET /summary/`
`total_items, active_items, low_stock_count, out_of_stock_count, categories:[{id, name, items, low_items}], last_30_days:{since, entries, exits, adjustments, quantity_in, quantity_out}, recent_movements[10], generated_on`.

## Audit
`CREATE`/`UPDATE` (catégories, fournisseurs, articles) et `STOCK_MOVEMENT` (avec `quantity` ancien → nouveau).
