# Architecture

## Vue d'ensemble

```
Navigateur (React) ──HTTPS──▶ Nginx ──/api──▶ Django REST (gunicorn) ──▶ PostgreSQL
                                │                    │
                                │                    └──▶ Redis ◀── Celery worker / beat
                                └─ statique React         (cartes en lot, annonces, rappels d'échéances)
                                   fichiers privés : X-Accel-Redirect après vérification d'une URL signée
```

- **Une seule source de vérité** : la base PostgreSQL. Le frontend ne stocke aucune donnée métier.
- **Les droits sont appliqués par le serveur** (DRF) à chaque requête : identité (JWT) → établissement → rôle → périmètre.
  Masquer un bouton dans React n'est jamais considéré comme une protection.

## Multi-établissement
Chaque donnée métier hérite de `core.TenantModel` (clé étrangère `establishment`). Les ViewSets héritent de
`TenantViewSetMixin` : le filtre d'établissement est appliqué **avant** tout autre filtre, et les clés étrangères reçues
dans une requête sont restreintes à l'établissement de l'utilisateur (`TenantRelatedField`) — un identifiant d'un autre
Daara est traité comme inexistant. Un deuxième Daara = une ligne `Establishment` + ses utilisateurs (aucun changement de code).
Le corpus coranique (`quran`) est global.

## Applications backend
| App | Rôle |
|---|---|
| core | Établissement, base UUID, compteurs atomiques (matricules, reçus), permissions, validateurs de fichiers, URLs signées |
| accounts | Utilisateur (4 rôles), JWT (access 15 min, refresh 7 j rotatif + liste noire), profil, comptes |
| academics | Années scolaires (une seule active), classes, **inscriptions annuelles** (indépendantes du dossier), historique des affectations |
| students | **Dossier permanent** du talibé (matricule stable), documents, historique des changements social/payant |
| guardians | Lien parent ↔ enfant (plusieurs enfants, plusieurs responsables) |
| quran | 114 sourates, 6 236 versets (texte importé tel quel de Quran.com), juz/hizb/page, récitateurs et audio réels |
| memorization | Leçons, révisions, évaluations ; niveaux et critères configurables ; corrections sans écrasement |
| attendance | Présences par créneau, statistiques et rapports mensuels |
| boarding | Bâtiments, chambres, affectations (capacité et lit unique garantis), entrées/sorties |
| staff | Personnel, historique des fonctions, documents |
| finance | Grille de frais, échéances, paiements (reçus numérotés, annulation avec motif), dépenses (validation par seuil), rapports |
| social | Parrains/donateurs, dons, parrainages |
| inventory | Articles, mouvements transactionnels, seuils d'alerte |
| visits | Demandes de visite et leur traitement |
| documents | Cartes talibé (PDF ReportLab, versions), reçus, rapports financiers PDF |
| notifications | Notifications internes, annonces, rappels d'échéances |
| audit | Journal d'activité immuable |
| dashboard | Tableaux de bord par profil (agrégats réels) |
| public_site | Contenu du portail public, formulaire de contact |

## Modèle de données (relations principales)
```
Establishment 1─* User            Establishment 1─* Student ─* Guardianship *─1 User(PARENT)
AcademicYear 1─* ClassRoom *─1 User(MAITRE)
Student 1─* Enrollment *─1 AcademicYear ; Enrollment *─1 ClassRoom ; Enrollment 1─* ClassAssignment (historique)
Student 1─* Lesson/Revision/Evaluation (supersedes → corrections) ; Evaluation 1─* EvaluationScore *─1 EvaluationCriterion
Student 1─* AttendanceRecord ; Student 1─* BoardingAssignment *─1 Room *─1 Building
Student 1─* Due 1─* Payment ; Student 1─* StudentStatusChange ; Student 1─* Sponsorship *─1 Sponsor
Student 1─* StudentCard (version) ; Student 1─* VisitRequest *─1 User(PARENT)
Item 1─* StockMovement ; User 1─* Notification ; AuditLog (écriture seule)
```
Contraintes en base : une seule année active ; un seul lit actif par talibé ; un lit occupé par un seul talibé ;
`(talibé, année)` unique pour les inscriptions ; montants strictement positifs ; stock ≥ 0 ; numéros de reçu uniques.

## Matrice des droits (résumé — le détail par endpoint est dans `backend/docs/api/`)
| Domaine | Directeur | Assistant | Maître | Parent |
|---|---|---|---|---|
| Talibés | tout (archivage, statut) | créer/modifier, documents, export | lecture de ses élèves | lecture de ses enfants |
| Années, classes | tout | classes, inscriptions | lecture de ses classes | — |
| Leçons / révisions / évaluations | tout | lecture | saisie pour ses élèves | lecture (appréciations seulement) |
| Présences | tout | saisie, lecture | saisie pour ses classes | lecture de ses enfants |
| Internat, stocks, personnel (limité) | tout | écriture / lecture selon module | — | chambre de son enfant |
| Finances | tout | **seulement si `can_view_finance`** | — | paiements de ses enfants |
| Utilisateurs | tout | crée des parents uniquement | — | — |
| Journal d'activité, paramètres | oui | non | non | non |
| Visites | traite | traite | — | demande pour ses enfants |
| Cartes | tout | génère/imprime | — | télécharge celle de son enfant |

Un objet hors périmètre répond **404** (pas d'indice sur son existence).

## Règles d'intégrité métier
- Un talibé garde son matricule à vie ; l'inscription annuelle est une entité distincte.
- Aucune suppression définitive via l'API : archivage, annulation avec motif, ou correction par nouvelle ligne.
- Une leçon n'est jamais écrasée : la correction crée une nouvelle ligne qui la remplace (`supersedes`).
- Juz, hizb et page d'une leçon sont calculés par le serveur depuis le corpus (jamais saisis).
- Les montants et quantités ne changent que par des services transactionnels (verrous de lignes).

## Sécurité
JWT court + refresh rotatif révocable ; limitation de débit (connexion, formulaire public) ; validation des fichiers
(taille, extension **et** contenu) ; fichiers privés par URL signée expirante ; journal d'audit des opérations sensibles
sans secrets ; en-têtes de sécurité et HTTPS (voir DEPLOYMENT.md) ; isolation entre établissements testée.

## Protection des données personnelles (Sénégal)
La plateforme traite des données de mineurs. Avant la mise en service, l'établissement doit (hors périmètre du code) :
déclarer le traitement auprès de la Commission de Protection des Données Personnelles (CDP), définir la durée de
conservation (les dossiers archivés sont conservés mais exclus des listes), informer les familles, et restreindre les
sauvegardes aux personnes habilitées. Les exports (CSV) et générations de PDF sont journalisés.
