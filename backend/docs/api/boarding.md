# API Internat (`apps/boarding`)

Préfixe `/api/boarding/`. JSON snake_case, identifiants UUID, erreurs DRF en français (`{"detail": ...}` ou `{champ: [messages]}`).
Pagination standard (`?page=`, `?page_size=`) sur toutes les listes ; recherche `?search=`.

## Droits (résumé)

| Ressource | Directeur | Assistant | Maître | Parent |
|---|---|---|---|---|
| Bâtiments, chambres (lecture) | oui | oui | oui | chambre de ses enfants seulement (`/rooms/`) |
| Bâtiments, chambres (écriture) | oui | oui | non (403) | non (403) |
| Affectations (lecture) | tout | tout | ses élèves | ses enfants |
| Affectations (écriture) | oui | oui | non | non |
| Entrées / sorties | lecture + écriture | lecture + écriture | lecture (ses élèves) | non (403) |
| Occupation | oui | oui | oui (agrégats) | non (403) |

Hors périmètre = **404** (pas de fuite d'existence). Aucune suppression : `DELETE` → 403/405 (désactiver une chambre : `is_active=false`, impossible si occupée).

## Bâtiments `/buildings/`
`GET /` · `GET /{id}/` · `POST /` · `PATCH /{id}/` — champs : `id`, `name` (unique par établissement), `rooms_count` (lecture).

## Chambres `/rooms/`
`GET /` (filtres `building`, `is_active`, `supervisor`) · `GET /{id}/` · `POST /` · `PATCH /{id}/`
`GET /{id}/occupants/` — occupants actuels (affectations actives) ; un maître ne voit que ses élèves ; parent : 403.

Réponse (directeur / assistant / maître) :
`id, building (id), building_name, number, name, capacity, occupancy, free_places, supervisor (id staff), supervisor_name, is_active`.
Règles : `capacity >= 1` et jamais inférieure à l'occupation actuelle ; `(building, number)` unique ; une chambre occupée ne peut pas être désactivée ; le responsable doit être un membre du personnel de l'établissement n'ayant pas quitté.

**Parent** — mêmes URLs, forme réduite et uniquement les chambres où loge un de ses enfants :
`id, building_name, number, name, supervisor_name, my_children[{student, student_name, bed_number, start_date}]`
(ni capacité, ni effectif, ni autres occupants).

## Affectations `/assignments/`
`GET /` (filtres `student`, `room`, `building`, `active=true|false`) · `GET /{id}/`
Champs : `id, student, student_name, registration_number, room, room_label, building_name, bed_number, start_date, end_date, note, assigned_by_name, is_active`.

- `POST /` `{student, room, bed_number?, note?}` — première affectation. Refus (400) si : chambre complète (`« … est complète (N places) »`), talibé déjà affecté (utiliser le changement de chambre), lit déjà pris dans la chambre, talibé archivé, chambre désactivée. Verrou de ligne (`select_for_update`) sur la chambre.
- `POST /change-room/` `{student, room, bed_number?, note?}` — clôture l'affectation active (`end_date` = aujourd'hui, **historique conservé**) puis en ouvre une nouvelle. Capacité vérifiée en excluant le talibé lui-même (changement de lit dans la même chambre autorisé). 400 si aucune affectation active.
- `POST /{id}/release/` `{reason?}` — sortie définitive de l'internat : l'affectation est clôturée, jamais supprimée. 400 si déjà clôturée.

## Entrées / sorties `/movements/`
`GET /` (filtres `student`, `kind`, `date_from`, `date_to`) · `GET /{id}/` · `POST /` `{student, kind: ENTREE|SORTIE, occurred_at?, reason?, expected_return?}`
`GET /currently-out/` — talibés actuellement sortis (`student, student_name, registration_number, room, room_label, since, expected_return, reason`).
Règles : le talibé doit avoir une affectation active ; `SORTIE` refusée s'il est déjà sorti, `ENTREE` refusée s'il est déjà présent ; date non future ; `expected_return` postérieur à la sortie. Un mouvement n'est ni modifié ni supprimé.

## Occupation `GET /occupancy/`
`{capacity, occupied, free, occupancy_rate, students_out, buildings:[{id, name, capacity, occupied, free, rooms:[{id, number, name, capacity, occupancy, free_places, is_active, supervisor_name}]}]}` — la capacité ne compte que les chambres actives. Aucune identité d'enfant.

## Audit
`BOARDING_ASSIGN`, `BOARDING_CHANGE_ROOM`, `BOARDING_RELEASE`, `BOARDING_MOVEMENT` + `CREATE`/`UPDATE` des bâtiments et chambres.
