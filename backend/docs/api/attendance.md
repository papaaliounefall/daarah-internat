# API Présences (`apps/attendance`)

Un pointage = un talibé × une date × une période (`MATIN` | `SOIR`), unique par créneau. Statuts : `PRESENT`, `ABSENT`,
`RETARD`, `EXCUSE` (absence excusée). Jamais de suppression : une correction est un **nouvel upsert** du même créneau,
tracé dans le journal d'audit (anciennes/nouvelles valeurs).

## Droits

| | Directeur | Assistant | Maître | Parent |
|---|---|---|---|---|
| Enregistrer (`POST /`, `/bulk/`) | tout | tout | **élèves de ses classes** | 403 |
| Lister / détail | tout | tout | pointages de ses élèves (autre : 404) | **ses enfants** uniquement (lecture seule) |
| `stats`, `monthly-report` | oui | oui | ses classes (autre classe : 404) | 403 |

Lot contenant un talibé inconnu / archivé / hors périmètre / d'un autre établissement : **404 pour tout le lot**, rien n'est écrit.

## `GET /api/attendance/`

Filtres : `date`, `date_after`, `date_before`, `classroom` (uuid), `student` (uuid), `status`, `period`, `search`, `ordering`
(`date`, `student__last_name`, `status`). Pagination standard. Élément :
`id, student, student_id, student_name, registration_number, classroom, class_id, class_name, date, period, status, reason,
recorded_by, recorded_by_name, created_at, updated_at`.

## `POST /api/attendance/bulk/`

```json
{"date": "2026-11-07", "period": "MATIN", "classroom": "uuid (facultatif)",
 "records": [{"student": "uuid", "status": "ABSENT", "reason": "Maladie"}]}
```
- `date` : défaut aujourd'hui, jamais dans le futur. `period` : défaut `MATIN`. `records` : 1 à 500, un talibé une seule fois.
- `classroom` facultatif : s'il est donné, chaque talibé doit y être inscrit (sinon 400 listant les noms) et la classe
  est enregistrée sur le pointage ; sinon la classe est celle de l'inscription active de l'année courante.
- Upsert par `(talibé, date, période)`. Réponse : `{created, updated, unchanged, records:[…]}` (201 si au moins une création, sinon 200).

## `POST /api/attendance/`

Un seul pointage (mêmes règles) : `{student, status, reason?, date?, period?, classroom?}`. 201 si créé, 200 si corrigé.

## `GET /api/attendance/stats/?classroom=&month=YYYY-MM`

`month` : défaut mois courant (400 si format invalide). `classroom` facultatif. Réponse :
```json
{"month": "2026-03", "classroom": "uuid|null", "total": 4, "present": 1, "absent": 1, "late": 1, "excused": 1,
 "attendance_rate": 50.0, "by_day": [{"date": "2026-03-02", "present": 1, "…": 0, "attendance_rate": 50.0}],
 "by_classroom": [{"classroom": "uuid", "class_name": "Hifz", "total": 4, "…": 0}]}
```
`attendance_rate` (%) = (présents + retards) / total des pointages, absences excusées incluses au dénominateur ; `null` si aucun pointage.
`by_classroom` n'est fourni que sans filtre `classroom`.

## `GET /api/attendance/monthly-report/?classroom=<obligatoire>&month=YYYY-MM`

```json
{"classroom": "uuid", "class_name": "Hifz", "month": "2026-03", "days_recorded": 2,
 "students": [{"student_id": "uuid", "student_name": "Abdou Ba", "registration_number": "DAF-…",
               "present": 0, "absent": 1, "late": 0, "excused": 1, "total": 2, "attendance_rate": 0.0}],
 "totals": {"present": 0, "absent": 0, "late": 0, "excused": 0, "total": 0, "attendance_rate": null}}
```
Tous les talibés inscrits à la classe sont listés (comptes à 0 s'ils n'ont aucun pointage), triés par nom.

## Notifications

Un pointage `ABSENT` (non excusé) notifie les parents liés au talibé (`kind=PRESENCE`) **une seule fois par créneau**
(`dedupe_key = absence:<student>:<date>:<période>`) : les ré-enregistrements, ou un retour à ABSENT après correction, ne renotifient pas.
`RETARD`, `EXCUSE` et `PRESENT` ne notifient pas.

## Audit

Chaque correction effective écrit une entrée `UPDATE` (ancien/nouveau statut ou motif) ; chaque envoi écrit une entrée
`ATTENDANCE_UPSERT` (créés / corrigés / inchangés).
