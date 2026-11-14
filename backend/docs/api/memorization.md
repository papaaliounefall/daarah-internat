# API Suivi coranique (`apps/memorization`)

Leçons, révisions, évaluations, niveaux de qualité, critères d'évaluation, chronologie.
Toutes les données sont filtrées par établissement. Identifiants = UUID ; JSON en snake_case.

## Principes

- **Jamais d'écrasement ni de suppression.** Pas de `PUT`/`PATCH`/`DELETE` sur leçons/révisions/évaluations (403/405).
  Une correction = `POST /{id}/correct/` : crée une **nouvelle ligne** (`supersedes` = ancienne), marque l'ancienne
  `is_current=false` (conservée telle quelle), **motif obligatoire** (`correction_reason`). On ne corrige que la version
  courante (sinon 400 « déjà été corrigée »). La nouvelle ligne conserve le maître d'origine (`teacher`) ; le directeur
  peut passer `teacher` (un MAITRE de l'établissement).
- Les listes ne renvoient que `is_current=true`. `?include_history=true` renvoie tout (ignoré pour un parent, qui ne voit
  jamais les versions remplacées).
- **juz / hizb / page** d'une leçon sont calculés côté serveur (`quran.services.resolve_range`, dernier verset) ;
  toute valeur envoyée par le client est ignorée.
- La progression courante d'un talibé (`current_surah_*`, `current_ayah`, `current_juz`…) est dérivée de sa dernière
  leçon courante par `students` : rien n'est dupliqué ici.

## Droits

| | Directeur | Assistant | Maître | Parent |
|---|---|---|---|---|
| Lire leçons/révisions/évaluations/chronologie | tout | tout | élèves de ses classes (hors périmètre : 404) | uniquement ses enfants (Guardianship), vue réduite |
| Créer / corriger | oui | **403** | ses élèves (créer pour un élève hors classes : **404**) | **403** |
| Niveaux de qualité & critères : lire | oui | oui | oui | oui |
| Niveaux de qualité & critères : écrire | oui | **403** | **403** | **403** |

Un identifiant de talibé inconnu, d'un autre établissement ou hors périmètre répond la même chose (404) — pas de fuite d'existence.
Un talibé archivé ne peut recevoir aucune saisie (400).

## Vue « famille » (parent)

Champs **absents** pour un parent : `observations`, `internal_notes`, `difficulties`, `recommendations`,
`correction_reason`, `is_current`, `supersedes`, `teacher` (id). Seule `appreciation` est partagée. Champs restants :
`id, student, student_id, student_name, teacher_name, date, …, quality, quality_label, quality_label_ar, appreciation, created_at`.

## Leçons — `/api/lessons/`

`GET` (liste, filtres : `student, teacher, surah, classroom, quality, date, date_after, date_before, include_history`,
`ordering=date|created_at`), `GET /{id}/`, `POST` (création), `POST /{id}/correct/`.

Création (`POST`) :
```json
{"student": "uuid", "surah": 112, "ayah_start": 1, "ayah_end": 4, "quality": "JAYYID",
 "date": "2026-11-07", "observations": "interne", "appreciation": "visible famille", "teacher": "uuid (directeur seulement)"}
```
`date` : défaut aujourd'hui, jamais dans le futur. `quality` = code d'un `QualityLevel` **actif** de l'établissement.
Sans `teacher`, un directeur crée au nom du maître de la classe du talibé (à défaut : lui-même) ; un maître saisit toujours en son nom.

Réponse (staff) : `id, student, student_id, student_name, teacher, teacher_id, teacher_name, date, surah, surah_number,
surah_name, surah_name_arabic, ayah_start, ayah_end, juz, hizb, page, quality, quality_label, quality_label_ar,
observations, appreciation, class_id, class_name, is_current, supersedes, correction_reason, created_at`.

Correction (`POST /{id}/correct/`) : tout champ de la création sauf `student` (facultatif ; non fourni = conservé) + `correction_reason`
obligatoire. Réponse `201` = la nouvelle ligne. Plage revalidée.

Erreurs de plage (400, français) : sourate inexistante, début < 1, début > fin, verset au-delà de `verses_count`.

Notification : une nouvelle leçon prévient les parents du talibé (`kind=CORAN`). Les corrections ne notifient pas.

## Révisions — `/api/revisions/`

Mêmes règles. Champs : `student, surah, ayah_start, ayah_end, ayah_range ("1-6"), quality, difficulties, recommendations,
appreciation, date, teacher`. Pas de notification. Filtres : `student, teacher, surah, quality, date*`.

## Évaluations — `/api/evaluations/`

Création : `{"student", "date", "scope": "Sourate An-Nas", "appreciation", "internal_notes", "scores": [{"criterion": "uuid", "score": 16}]}`.

- Au moins un critère ; chaque critère actif, de l'établissement, noté une seule fois, `0 ≤ score ≤ max_score`.
- `overall_score` (sur 20, 2 décimales) = **moyenne pondérée** des notes ramenées sur 20 :
  `Σ(score / max_score × 20 × weight) / Σ weight`. Calculé serveur, jamais accepté du client.
- Lecture : `scores: [{criterion, criterion_name, score, max_score}]`, `overall_score`, `surah_evaluated` (alias de `scope`).
- Correction : `scores` facultatif (absent = notes recopiées sur la nouvelle version, `overall_score` identique). Les anciennes notes restent sur l'ancienne ligne.
- Notification : `kind=EVALUATION` aux parents (note globale, sans notes internes).

## Niveaux de qualité — `/api/quality-levels/`

`code` (MAJUSCULES_ET_CHIFFRES, unique par établissement, **immuable** une fois créé car l'historique le référence),
`label`, `label_ar`, `rank` (0 = meilleur ; défaut : en dernier), `is_active`. Pas de suppression : désactiver
(`is_active=false`) — l'historique garde ses libellés. Valeurs par défaut créées pour tout nouvel établissement
(signal `post_save` sur `Establishment`) et via `python manage.py seed_memorization_defaults [--establishment slug]` :
`MUMTAZ` Excellent / ممتاز, `JAYYID_JIDDAN` Très bien / جيد جدًا, `JAYYID` Bien / جيد, `MAQBUL` Passable / مقبول,
`A_REVOIR` À revoir / يحتاج إلى مراجعة. Le semis n'écrase jamais une configuration existante.

## Critères — `/api/evaluation-criteria/`

`name` (unique, casse ignorée), `max_score` (>0, défaut 20), `weight` (>0, défaut 1), `order`, `is_active`.
Par défaut : Exactitude de la mémorisation, Fluidité de la récitation, Respect des règles de tajwid, Autonomie du talibé.
Un critère **déjà utilisé** ne peut plus changer de `max_score`/`weight` (400) : le désactiver et en créer un nouveau.

## Chronologie — `GET /api/memorization/timeline/`

Paramètre obligatoire `student` (404 si hors périmètre/inconnu). Filtres : `type` (`LESSON,REVISION,EVALUATION`,
liste séparée par des virgules), `date_after`, `date_before` (AAAA-MM-JJ), `surah` (exclut les évaluations), `teacher`,
`include_history`. Pagination standard (`page`, `page_size`). Chaque élément = la sérialisation de l'objet
(staff ou famille selon le rôle) + `"type"`. Tri : date décroissante puis création décroissante.

## Codes d'erreur

400 validation (messages français par champ) · 403 rôle insuffisant · 404 hors périmètre / autre établissement ·
405 méthode non autorisée.
