# API Demandes de visite (`apps/visits`)

Base : `/api/visit-requests/`. Les demandes ne sont jamais supprimées (statuts). Le maître n'y a aucun accès (403).

## Droits

| Action | Directeur | Assistant | Maître | Parent |
|---|---|---|---|---|
| `GET /`, `GET /{id}/` | toutes | toutes | 403 | **ses** demandes (autre : 404) |
| `POST /` (créer) | 403 | 403 | 403 | oui, **pour ses enfants** |
| `accept`, `refuse`, `propose` | oui | oui | 403 | 403 |
| `cancel`, `accept-proposal`, `decline-proposal` | 403 | 403 | 403 | oui, sa demande |

Filtres liste : `status, student, guardian, requested_date, date_after, date_before, search, ordering`.

## Représentation

`id, guardian, guardian_id, guardian_name, student, student_id, student_name, requested_date, requested_time, message,
status, status_label, decision_date, decided_by, decided_by_name, admin_note, proposed_date, proposed_time,
confirmed_date, confirmed_time, created_at, updated_at`.
`admin_note` = motif / note de l'administration. `confirmed_*` : créneau retenu quand `status=ACCEPTEE`
(proposition acceptée si elle existe, sinon créneau demandé) ; la demande initiale n'est jamais écrasée.

## Création — `POST /api/visit-requests/`

`{"student": "uuid", "requested_date": "2026-11-10", "requested_time": "10:00", "message": "facultatif"}`
- Le talibé doit être lié au parent (Guardianship) ; sinon 404 (identique à un identifiant inconnu).
- Créneau (date + heure) **non passé** ; talibé non archivé ; pas de seconde demande active (EN_ATTENTE / ACCEPTEE /
  MODIFICATION_PROPOSEE) pour le même talibé à la même date (400).
- Notifie directeur et assistant (`kind=VISITE`, `link_type=visit`).

## Statuts et transitions

`EN_ATTENTE`, `ACCEPTEE`, `REFUSEE`, `MODIFICATION_PROPOSEE`, `ANNULEE`.

| Action (rôle) | Depuis | Vers | Corps |
|---|---|---|---|
| `accept` (admin) | EN_ATTENTE | ACCEPTEE | `{reason?}` (note facultative) |
| `refuse` (admin) | EN_ATTENTE, ACCEPTEE | REFUSEE | `{reason}` **obligatoire** |
| `propose` (admin) | EN_ATTENTE, MODIFICATION_PROPOSEE, ACCEPTEE | MODIFICATION_PROPOSEE | `{proposed_date, proposed_time, reason?}` (créneau non passé) |
| `cancel` (parent) | EN_ATTENTE, MODIFICATION_PROPOSEE | ANNULEE | — |
| `accept-proposal` (parent) | MODIFICATION_PROPOSEE | ACCEPTEE (créneau = proposition) | — |
| `decline-proposal` (parent) | MODIFICATION_PROPOSEE | ANNULEE (demande close) | — |

Règle d'annulation : le parent peut annuler **tant que la demande n'est pas acceptée** (en attente, ou proposition à
traiter). Une visite acceptée est confirmée : le parent contacte le Daara, qui peut la refuser (avec motif) ou la
reporter (`propose`). `REFUSEE` et `ANNULEE` sont définitives : le parent redépose une demande.

Toute autre transition → **400** avec un message français explicite dans `detail` (ex. « Cette visite est déjà
confirmée : contactez le Daara… », « Cette demande est refusée : elle est clôturée… », « Aucune proposition de
l'administration n'est en attente… »). Les transitions sont atomiques et verrouillées (pas de double décision concurrente).

## Notifications (`kind=VISITE`, `link_type=visit`, `link_id=<id>`)

- Nouvelle demande → DIRECTEUR + ASSISTANT.
- accept / refuse (avec motif) / propose → le parent qui a fait la demande (et lui seul).
- cancel / accept-proposal / decline-proposal du parent → DIRECTEUR + ASSISTANT.

## Audit

`CREATE`, `VISIT_ACCEPT`, `VISIT_REFUSE`, `VISIT_PROPOSE`, `VISIT_CANCEL`, `VISIT_ACCEPT_PROPOSAL`, `VISIT_DECLINE_PROPOSAL`.
