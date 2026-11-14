# API Portail public

## Public (sans authentification, `AllowAny`, jeton ignoré)

### `GET /api/public/site/?slug=<slug>`
`slug` facultatif (défaut `settings.DEFAULT_ESTABLISHMENT_SLUG`) ; établissement inconnu ou inactif : `404`.
Limité par le throttle anonyme (`THROTTLE_ANON`, 60/min). Cache navigateur 5 min.
```json
{"establishment": {"name": "...", "slug": "...", "city": "...", "country": "..."},
 "content": {"tagline": "", "history": "", "mission": "", "vision": "", "values": [{"title": "", "text": ""}],
             "activities": [{"title": "", "text": ""}], "team": [{"name": "", "role": ""}], "admission_info": "",
             "contact_phone": "", "contact_email": "", "address": "", "latitude": null, "longitude": null}}
```
Liste blanche explicite (`public_site_payload`) : **jamais** de talibés, parents, personnel (hors `team`, liste
saisie volontairement par le directeur), identifiants internes ou demandes de contact. Téléphone/e-mail/adresse
retombent sur ceux de l'établissement s'ils ne sont pas renseignés dans le contenu.

### `POST /api/public/contact/`
Corps : `name` (2-150), `phone` (≤ 40, chiffres/espaces/`+-().`), `email`, `message` (10-3000), `slug` (facultatif),
`website` (**honeypot**, doit rester vide). Au moins un de `phone` / `email`. Balises HTML retirées.
- `201 {"detail": "Votre demande a bien été envoyée…"}` ; crée un `ContactRequest`, notifie directeur et assistant
  (type `GENERAL`, `link_type="contact_request"`), journalise `CONTACT_REQUEST`.
- `website` rempli : réponse `201` identique mais **rien n'est enregistré** (le robot ne détecte pas le piège).
- `400` messages en français par champ ; `404` slug inconnu ; `429` au-delà de `THROTTLE_PUBLIC_FORM` (défaut
  **5/heure par IP**, scope `public_form`). Derrière Nginx, vérifier que l'IP réelle est transmise (`X-Forwarded-For`).

## Privé (JWT)

### `GET|PUT|PATCH /api/site-content/` : directeur uniquement
Lit/modifie le contenu de son établissement (créé à la première lecture). PUT et PATCH sont tous deux partiels
(les champs absents ne sont pas effacés). Validation : textes longs ≤ 10 000 caractères, `values`/`activities`
≤ 30 éléments `{title ≤150, text ≤1000}`, `team` ≤ 50 `{name, role}`, latitude/longitude valides, e-mail valide,
HTML retiré, clés inconnues refusées. Modifications journalisées (anciennes/nouvelles valeurs).
Pas de champ image pour l'instant ; si ajouté, utiliser `apps.core.validators.validate_image` et une URL signée.

### `/api/contact-requests/` : directeur et assistant
`GET` liste (filtres `?is_processed=true|false`, `?search=`), `GET /{id}/`, `POST /{id}/mark-processed/`
(`{"processed": false}` pour rouvrir). Champs : `id, name, phone, email, message, is_processed, processed_at,
processed_by_name, created_at`. Pas de création/modification/suppression par l'API privée. Maître/parent : `403` ;
autre établissement : `404`.

> Montage : les routes privées sont déclarées dans `apps/public_site/urls.py::private_patterns` et ajoutées à
> `/api/` depuis `apps/notifications/urls.py` (sans modifier `config/urls.py`).

## Commande `seed_site_content`
`python manage.py seed_site_content [--slug …] [--force]` : crée/complète l'établissement et le contenu avec les
**seuls faits vérifiables** de la carte officielle : nom « Daara Internat Shaykh Aliou Fatima », Kahone - Kaolack -
Sénégal, tél. 77 634 46 76 / 70 640 40 58, e-mail seydinandiaye1975@gmail.com. Idempotente ; ne remplace pas ce qui a
déjà été saisi (sauf `--force`, limité à ces faits de contact).
**Laissés volontairement vides, à rédiger par le Daara** : `tagline`, `history`, `mission`, `vision`, `values`,
`activities`, `team`, `admission_info`, `latitude`, `longitude`. Rien n'est inventé.

---
## Page d'accueil enrichie (ajout)

### `GET /api/public/site/` — champs ajoutés
`content` : `hero_image_url` (URL **stable** `/api/files/public/<jeton signé>`, cache navigateur 24 h, réservée aux
contenus publics), `hero_text`, `teachings[{title,text}]`, `boarding_intro`, `boarding[{title,text}]`,
`approach[{title,text}]` (étapes du parcours, dans l'ordre), `social_links[{label,url}]`, `legal_notice`, `privacy_policy`.
Racine : `news[{id,title,summary,body,image_url,published_on}]` (publiées uniquement, ≤ 30, plus récentes d'abord) et
`gallery[{id,image_url,caption}]` (publiées, ≤ 24). Une section vide n'est pas affichée par le frontend.

### `POST /api/public/visit-request/` (anonyme, throttle `public_form`, honeypot `website`)
Corps : `name`, `phone`, `child_name`, `desired_date` (≥ aujourd'hui), `message` (facultatif), `slug` (facultatif).
Crée un `ContactRequest` de `kind="VISITE"` (même boîte que les demandes d'information) et notifie directeur/assistant.
Ce n'est **pas** une inscription. `ContactRequest` expose désormais `kind`, `child_name`, `desired_date`.

### Privé
- `PATCH /api/site-content/` accepte les nouveaux champs (listes validées : `teachings` ≤ 12, `boarding` ≤ 12,
  `approach` ≤ 8, `social_links` ≤ 8 avec `url` en http(s) ; textes HTML retirés). Réponse : `hero_image_url` inclus.
- `POST /api/site-content/hero-image/` (multipart, champ `image`, directeur) ; `DELETE` la retire.
- `/api/news-posts/` CRUD (directeur et assistant) : `title, summary, body, image (écriture, multipart), image_url,
  published_on, is_published`. `/api/gallery-images/` CRUD : `image (multipart), image_url, caption, order, is_published`.
  Suppression autorisée (contenu éditorial public), journalisée.
