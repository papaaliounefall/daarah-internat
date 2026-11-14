# API Social, dons et parrainages (`apps/social`)

Préfixe `/api/social/`. Montants FCFA : nombres entiers. Pagination standard.

## Droits

| Ressource | Directeur | Assistant | Maître / Parent |
|---|---|---|---|
| Parrains, parrainages, vue d'ensemble | lecture + écriture | **lecture seule** | 403 |
| Dons (`finance_scope`) | lecture + écriture + annulation | lecture **seulement si `can_view_finance`**, jamais d'écriture | 403 |

Aucune suppression (`DELETE` → 403/405). Hors établissement → 404 ; identifiants étrangers dans un corps → 400.

## Parrains / partenaires / donateurs `/sponsors/`
`GET /`, `GET /{id}/`, `POST /`, `PATCH /{id}/` (écriture : directeur). Filtre `kind` (PARRAIN | PARTENAIRE | DONATEUR), `?search=`.
Champs : `id, name, kind, phone, email, country, notes, active_sponsorships, created_at`. (Aucun total de dons ici : ce sont des données financières.)

## Parrainages `/sponsorships/`
`GET /` (filtres `student`, `sponsor`, `status`) · `GET /{id}/` · `POST /` · `PATCH /{id}/` (écriture : directeur).
Champs : `id, student, student_name, registration_number, student_status, sponsor, sponsor_name, sponsor_phone, sponsor_email, monthly_amount, start_date, end_date, status (ACTIF|SUSPENDU|TERMINE), notes, created_at`.
Règles : montant >= 0 ; `end_date >= start_date` ; passer à `TERMINE` renseigne `end_date` (aujourd'hui) si absente ; un parrainage `TERMINE` ne peut pas être réactivé (en créer un nouveau) ; le talibé d'un dossier ne change pas ; talibé archivé refusé. Le talibé n'est pas forcément « social ».

## Dons `/donations/` (alias `/api/donations/`)
`finance_scope = True`.
`GET /` (filtres `sponsor`, `method`, `is_cancelled`, `date_from`, `date_to`, `?search=`) · `GET /{id}/` · `POST /` · `POST /{id}/cancel/`. Pas de `PATCH`/`DELETE`.

`POST` : `{donor_name?, donor_phone?, sponsor?, amount, date?, purpose?, method?, attachment?}` (JSON ou multipart).
- `amount` entier > 0 ; `method` ∈ ESPECES|WAVE|ORANGE_MONEY|VIREMENT|AUTRE (par défaut ESPECES) — seule la saisie est enregistrée, aucune intégration de paiement ;
- `donor_name` défaut = nom du parrain si `sponsor` fourni, sinon obligatoire ;
- date non future ; `attachment` (justificatif PDF/image validé) jamais renvoyé en clair : `attachment_url` = URL signée 1 h.
- `receipt_number` : `DON-<année>-<NNN>` (séquence atomique par établissement et par année : `DON-2026-001`).

Réponse : `id, receipt_number, sponsor, sponsor_name, donor_name, donor_phone, amount, date, purpose, method, attachment_url, recorded_by_name, is_cancelled, cancel_reason, cancelled_by_name, cancelled_at, created_at`.

`POST /{id}/cancel/` `{reason}` (directeur) — motif obligatoire (>= 3 caractères) ; `is_cancelled=true`, auteur et date conservés ; le numéro reste attribué ; le don sort des recettes ; 400 si déjà annulé.

## Vue d'ensemble `GET /overview/`
Talibés sociaux vs payants, avec parrains actifs et historique des changements de statut (`students.StudentStatusChange`).
Paramètres : `status=SOCIAL|PAYANT`, `sponsored=true|false`, `search`, `include_archived=true` (par défaut les archivés sont exclus), `page`, `page_size`.

```json
{
  "count": 3, "next": null, "previous": null,
  "summary": {"social_count": 2, "paying_count": 1, "sponsored_social_count": 1, "social_without_sponsor_count": 1,
              "active_sponsorships": 1, "total_monthly_sponsorship": 15000},
  "results": [{
    "id": "…", "registration_number": "DAF-2026-0001", "full_name": "Ali Diop", "status": "SOCIAL",
    "sponsors": [{"sponsorship_id": "…", "sponsor_id": "…", "sponsor_name": "Fondation Baraka", "monthly_amount": 15000, "start_date": "2026-01-01"}],
    "status_changes": [{"from_status": "PAYANT", "to_status": "SOCIAL", "reason": "…", "effective_date": "…", "changed_by_name": "…"}]
  }]
}
```
Le changement de statut lui-même reste `POST /api/students/{id}/change-status/` (directeur, historisé) ; il ne supprime jamais d'information antérieure.

## Audit
`CREATE`/`UPDATE` (parrains, parrainages), `DONATION_CREATE`, `DONATION_CANCEL`.
