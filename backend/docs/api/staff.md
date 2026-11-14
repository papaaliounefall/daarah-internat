# API Personnel (`apps/staff`)

Préfixe `/api/staff/`. Pagination standard, `?search=` (nom, fonction, téléphone), filtres `category`, `status`.

## Droits

| Action | Directeur | Assistant | Maître | Parent |
|---|---|---|---|---|
| Liste / détail | dossier complet | **nom, fonction, téléphone, statut seulement** | 403 | 403 |
| Création / modification / départ | oui | 403 | 403 | 403 |
| Historique des fonctions, documents | oui | 403 | 403 | 403 |

Pas de suppression (`DELETE` → 403/405) : un départ passe le statut à `PARTI` (`leave`).

## Dossiers `/api/staff/`
`GET /` · `GET /{id}/` · `POST /` · `PATCH /{id}/`

**Directeur** : `id, user, user_name, full_name, category (MAITRE|ADMIN|AUTRE), role_title, phone, email, address, hire_date, end_date, status (ACTIF|CONGE|PARTI), id_number, notes, created_at`.
**Assistant** (lecture) : `id, full_name, category, role_title, phone, status`. `id_number`, `notes`, e-mail, adresse et documents ne sont jamais envoyés.

Règles : `end_date >= hire_date` ; `user` (optionnel) doit être un compte de l'établissement, non parent, et lié à un seul dossier. À la création, une première `StaffPosition` est ouverte. Modifier `role_title` ferme la fonction en cours et en ouvre une nouvelle (historisé). Le journal d'audit ne contient jamais la valeur de `id_number` / `notes` (seule l'action `UPDATE_SENSITIVE` et le nom des champs sont journalisés).

### `POST /{id}/leave/` `{end_date?}`
Statut `PARTI`, `end_date`, fonctions en cours clôturées. 400 si déjà parti ou si `end_date < hire_date`.

### `GET|POST /{id}/positions/`
Historique des fonctions : `id, staff, role_title, start_date, end_date, note`. `POST {role_title, start_date?, note?}` clôture la fonction ouverte (à la date de début de la nouvelle) et met à jour `role_title` du dossier.

### `GET|POST /{id}/documents/`
`POST` multipart `{title, file}` — PDF/JPG/PNG/WebP, taille limitée, contenu réel vérifié (400 sinon). Réponse : `id, staff, title, file_url, created_at` ; `file_url` est une URL signée valable 1 h (`/api/files/<jeton>/`). Pas de suppression de document.

## Audit
`CREATE`, `UPDATE`, `UPDATE_SENSITIVE`, `STAFF_LEAVE`, `STAFF_POSITION`, `STAFF_DOCUMENT_ADD`.
