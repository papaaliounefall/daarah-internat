# API Finance (`apps/finance`)

Toutes les vues ont `finance_scope = True` : **un assistant n'y accède que si `can_view_finance` lui a été accordé** (sinon 403). Maître : 403 partout. Parent : 403 partout **sauf** `GET /api/finance/my-children-payments/`.
Montants FCFA : nombres entiers (jamais de décimales). Pagination standard. Aucune suppression nulle part : annulation avec motif ou désactivation.

## Matrice des droits

| Ressource | Directeur | Assistant avec `can_view_finance` | Assistant sans / Maître | Parent |
|---|---|---|---|---|
| Grille de frais, réductions | lecture + écriture | lecture | 403 | 403 |
| Échéances (lecture) / impayés / rapport | oui | oui | 403 | 403 |
| Échéances : création, `generate`, `cancel` | oui | 403 | 403 | 403 |
| Paiements : lecture, création | oui | oui | 403 | 403 |
| Paiements : `cancel` | oui | **403** | 403 | 403 |
| Dépenses : lecture, création, modification limitée | oui | oui | 403 | 403 |
| Dépenses : `approve`, `reject`, `cancel` | oui | **403** | 403 | 403 |
| `my-children-payments` | 403 | 403 | 403 | oui (ses enfants) |

## Grille de frais `/api/finance/fees/`
`GET /`, `GET /{id}/`, `POST /`, `PATCH /{id}/` (écriture : directeur). Filtres : `academic_year, kind, applies_to, is_active`.
Champs : `id, academic_year, academic_year_name, name, kind (INSCRIPTION|MENSUALITE|EXCEPTIONNEL), amount (>= 0), applies_to (TOUS|PAYANT|SOCIAL), due_day (1–28, optionnel), is_active`.
Modifier un montant ne change pas les échéances déjà générées ; désactiver une grille l'exclut des prochaines générations.

## Réductions `/api/finance/discounts/`
`GET /`, `POST /`, `PATCH /{id}/` (directeur). Champs : `student, student_name, registration_number, academic_year, label, kind (MONTANT|POURCENT), value, reason, approved_by_name, is_active`.
`approved_by` = le directeur qui crée. Pourcentage ∈ ]0;100], montant > 0. `student/academic_year/kind/value` ne sont pas modifiables : désactiver (`is_active=false`) puis recréer. Les réductions actives de l'année s'appliquent aux **mensualités** lors de la génération (pourcentages cumulés plafonnés à 100 %, puis montants fixes déduits, résultat >= 0).

## Échéances `/api/finance/dues/`
`GET /` (filtres `student, academic_year, kind, fee_schedule, is_cancelled, status=IMPAYEE|PARTIELLE|PAYEE|ANNULEE, overdue=true|false, due_from, due_to`) · `GET /{id}/`
Champs : `id, student, student_name, registration_number, academic_year, fee_schedule, kind, label, period, due_date, amount, paid_amount, balance, status, is_overdue, is_cancelled`. `paid_amount` = somme des paiements non annulés.

- `POST /` (directeur) `{student, academic_year, kind, label, due_date, amount}` — frais ponctuel (exceptionnel…).
- `POST /generate/` (directeur) `{academic_year?, fee_schedules?: [ids], students?: [ids], from_month?: "AAAA-MM", to_month?: "AAAA-MM"}` — **idempotent**.
  Réponse : `{academic_year, created, already_existing, zero_amount_skipped, students, schedules, months}`.
  Règles : talibés avec inscription ACTIVE dans l'année, non archivés ; `applies_to` confronté au statut courant (PAYANT/SOCIAL) ; mensualités = une par talibé × grille × mois de l'année (ou de la fenêtre `from_month`/`to_month`), à partir du mois d'inscription (`enrolled_on`), échéance au `due_day` (1 par défaut) ; inscription/exceptionnel = une seule par talibé et par grille ; échéance à 0 FCFA après réduction non créée ; une échéance déjà générée (même annulée) n'est jamais recréée ni modifiée ; année clôturée ou aucune grille active → 400. Verrou sur l'année pour éviter deux générations simultanées.
- `POST /{id}/cancel/` (directeur) `{reason}` — refusé (400) si l'échéance a reçu des paiements non annulés.

## Impayés / dettes `GET /api/finance/arrears/`
Paramètres : `academic_year` (défaut : année active ; `all` = toutes), `student`, `overdue_only` (défaut `true` : échéances échues), `min_balance`.
`{count, total_balance, academic_year, results:[{student, student_name, registration_number, student_status, total_due, total_paid, balance, overdue_count, oldest_due_date, dues?}]}` triés par dette décroissante ; `dues` (détail des échéances restant dues) uniquement avec `?student=`.

## Paiements `/api/payments/` (alias `/api/finance/payments/`)
`GET /` (filtres `student, due, status, method, fee_kind, recorded_by, date_from, date_to`, `?search=` reçu/nom/matricule/référence) · `GET /{id}/` · `POST /` · `POST /{id}/cancel/`. **Pas de `PATCH`/`PUT`/`DELETE`** : un montant ne se modifie jamais.

`POST` : `{student?, due?, amount, method?, date?, reference?, notes?, fee_kind?, period_label?}`
- `student` ou `due` obligatoire (le talibé se déduit de l'échéance) ;
- `amount` entier > 0 ; `method` ∈ ESPECES|WAVE|ORANGE_MONEY|VIREMENT|AUTRE ; `reference` = référence de transaction **saisie** (aucune intégration Wave/Orange Money, rien n'est simulé) ; date non future ;
- avec `due` : même talibé, échéance non annulée et non soldée, `amount <=` solde restant (« Le montant dépasse le solde restant de l'échéance (N FCFA). ») ; `fee_kind` et `period_label` repris de l'échéance ; échéance verrouillée pendant l'opération ; paiements partiels autorisés ;
- sans `due` : paiement libre (acompte, inscription…).
- `receipt_number` : `REC-<année>-<NNNN>` via `Sequence.next` (atomique, sans doublon ; un refus ne consomme pas de numéro).

Réponse : `id, receipt_number, student, student_name, registration_number, due, fee_kind, period_label, amount, date, method, reference, status (PAYE|ANNULE), recorded_by_name, notes, cancelled_by_name, cancelled_at, cancel_reason, created_at`.

`POST /{id}/cancel/` `{reason}` (directeur) — motif obligatoire (>= 3 car.) ; statut `ANNULE`, `cancelled_by/at` ; la ligne et le numéro de reçu sont conservés ; le solde de l'échéance se libère ; 400 si déjà annulé. Une correction = annulation + nouveau paiement.

## Espace parent `GET /api/finance/my-children-payments/` (rôle PARENT uniquement)
Choix : un parent n'a aucun droit finance général ; il consulte en lecture seule les paiements de **ses** enfants (lien `Guardianship`). Filtres `student, status, fee_kind, method`. Champs : `id, receipt_number, student, student_name, registration_number, fee_kind, period_label, amount, date, method, status` — ni auteur de saisie, ni notes, ni référence, ni motif d'annulation. Staff (directeur/assistant/maître) : 403 sur cette URL ; ils utilisent `/api/payments/`.

## Dépenses `/api/expenses/` (alias `/api/finance/expenses/`)
`GET /` (filtres `category, status, created_by, date_from, date_to`) · `GET /{id}/` · `POST /` (JSON ou multipart) · `PATCH /{id}/` · `POST /{id}/approve|reject|cancel/`.
Champs : `id, category (ALIMENTATION|SANTE|ENTRETIEN|SALAIRES|ENERGIE|FOURNITURES|AUTRE), title, amount, date, paid_to, reference, attachment (écriture), attachment_url (URL signée 1 h), status (EN_ATTENTE|VALIDEE|REFUSEE|ANNULEE), requires_approval, created_by_name, approved_by_name, decided_at, decision_note, cancel_reason, cancelled_by_name, cancelled_at, created_at`.

**Validation des dépenses sensibles** (seuil = `establishment.expense_approval_threshold`, défaut 100 000 FCFA) :
- dépense saisie par le **directeur** : `VALIDEE` immédiatement (quel que soit le montant) ;
- par l'assistant, `amount >= seuil` : `EN_ATTENTE` + notification `FINANCE` aux directeurs (« Dépense à valider ») ;
- par l'assistant, `amount < seuil` : `VALIDEE` automatiquement (sans approbateur nommé).
- `approve` `{note?}` / `reject` `{reason}` (motif obligatoire) : directeur seul, uniquement depuis `EN_ATTENTE`.
- `cancel` `{reason}` (directeur) : depuis `VALIDEE` ou `EN_ATTENTE`, motif obligatoire.
- Montant et date **non modifiables** après création (évite de contourner le seuil) ; `PATCH` limité à `category, title, paid_to, reference, attachment`, refusé si refusée/annulée.
- Seules les dépenses `VALIDEE` comptent dans le rapport.

## Rapport `GET /api/finance/summary/?from=AAAA-MM-JJ&to=AAAA-MM-JJ`
Défaut : du 1er janvier de l'année en cours à aujourd'hui (60 mois maximum). Calculé sur les données réelles.
```
{ from, to,
  total_payments, total_donations, total_revenue,     // paiements PAYE + dons non annulés
  total_expenses, balance,                            // dépenses VALIDEE ; solde = recettes - dépenses
  outstanding, outstanding_dues_count, students_in_arrears,   // impayés à la date `to` (échéances échues - paiements jusqu'à `to`)
  pending_expenses_count, pending_expenses_amount,    // dépenses EN_ATTENTE (informatif)
  revenue_by_type:   [{key: MENSUALITE|INSCRIPTION|EXCEPTIONNEL|DON, label, amount, count}],
  revenue_by_method: [{key, label, amount, count}],   // paiements + dons
  monthly: [{month: "AAAA-MM", payments, donations, revenue, expenses, balance}] }  // tous les mois de la période
```
L'export PDF est assuré par l'application `documents` à partir des mêmes modèles (`apps.finance.reports.financial_summary` / `arrears_rows` sont réutilisables).

## Audit
`PAYMENT_CREATE`, `PAYMENT_CANCEL` (motif), `EXPENSE_CREATE`, `EXPENSE_APPROVE`, `EXPENSE_REJECT`, `EXPENSE_CANCEL`, `DUES_GENERATE`, `DUE_CANCEL`, `CREATE`/`UPDATE` (grille, réductions, dépenses).
