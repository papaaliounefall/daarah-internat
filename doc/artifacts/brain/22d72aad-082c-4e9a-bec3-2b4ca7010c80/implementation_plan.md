# Plateforme de Gestion — Daara Internat Shaykh Aliou Fatima (Kahone, Sénégal)

Système intégré de gestion scolaire, administrative, coranique, internat et financière pour le Daara Internat Shaykh Aliou Fatima à Kahone (Kaolack), alliant rigueur institutionnelle, lecteur coranique complet avec récitation audio de référence (Cheikh Mahmoud Khalil Al-Husary) et génération haute fidélité des Cartes Talibé officielles.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Choix confirmés lors de la phase de cadrage :**
> - **Environnement d'exécution dans le Studio :** Frontend React TypeScript autonome avec couche de services modulaires, API mockée complète et stockage local persistant (Local Storage / IndexedDB), garantissant une exécution immédiate sans coupure et exportable vers un backend Django / PostgreSQL de production.
> - **Récitateur Coranique par défaut :** Cheikh Mahmoud Khalil Al-Husary (référence pédagogique universelle pour l'apprentissage du tajwid et la mémorisation dans les daaras), avec possibilité d'écouter la sourate entière ou le passage étudié.
> - **Mode Démonstration & Évaluation :** Sélecteur rapide de profils avec données de démonstration réalistes ancrées à Kahone / Kaolack (Directeur, Directeur Assistant, Maître Coranique, Espace Parent multi-enfants), tout en conservant le module de connexion sécurisé complet.
> - **Carte Talibé Officielle :** Reproduction fidèle au millimètre près du modèle graphique officiel fourni (`WhatsApp_Image_2026-10-30_at_14.01.06_8a36b9c7.jpeg`) avec médaillon d'or, cadre ornemental, calligraphie arabe et impression PDF vectorielle.

---

### 1. Overview & Core Concept

- **Mission :** Remplacer les registres papier et les outils dispersés par une plateforme unifiée, sobre, rapide et accessible, adaptée au quotidien des daaras modernes sénégalais.
- **Utilisateurs cibles :**
  - **Directeur (Supervision générale) :** Vue 360° sur les effectifs, finances (recettes, dépenses, impayés), internat, validation des sorties et parrainages.
  - **Directeur Assistant / Secrétariat :** Enrôlement des talibés, attribution des classes, suivi des réinscriptions, impression des cartes et attestations.
  - **Maître Coranique (Oustaz) :** Saisie ultra-rapide en 3 clics des leçons du jour (Sourate, Verset début/fin, Juz, Hizb, qualité), révisions et évaluations du tajwid.
  - **Parent / Tuteur :** Consultation transparente de la progression de chaque enfant, lecture et écoute du Coran au verset exact atteint, demandes de visite de weekend.
  - **Portail Public :** Vitrine institutionnelle du Daara à Kahone (histoire, encadrement, contact, modalités d'inscription).

---

### 2. User Experience & Visual Design

#### A. Identité Graphique & Esthétique Institutionnelle
- **Atmosphère :** Noblesse spirituelle, clarté administrative, sobriété sans artifice. Aucune esthétique générique d'IA (pas de dégradés violets criards, pas de badges capsules superflus, pas de cartes imbriquées).
- **Palette chromatique 60-30-10 :**
  - *Fond & Structure (60%) :* Blanc cassé parchemin (`#FBFBF9`) et fond de cartes blanc pur (`#FFFFFF`) avec séparateurs discrets 1px (`#E8ECE9`).
  - *Vert Institutionnel (30%) :* Vert émeraude profond (`#114232` et `#0D3327`) pour les barres de titre, en-têtes et repères d'identité.
  - *Accent Or Discret (10%) :* Or impérial feutré (`#C5A059` et `#B38F46`) pour les insignes, les distinctions d'excellence coranique et les boutons d'action clés.
- **Typographie :**
  - *Titres & Affichage :* `Plus Jakarta Sans` et `Manrope` (structure claire, autorité institutionnelle).
  - *Coran & Calligraphie Arabe :* Police Uthmani (`Amiri` / `Scheherazade New` / `KFGQPC Uthmanic Script HAFS`) avec prise en charge RTL rigoureuse, diacritiques complets et numérotation ornementale des versets (`ayah`).
  - *Chiffres & Finances :* Chiffres tabulaires (`tabular-nums`, monospaced) pour les montants en FCFA et les identifiants d'élèves.

#### B. Parcours Utilisateurs Principaux
1. **Enrôlement d'un Talibé & Génération de Carte :**
   - Saisie du formulaire structuré (identité, parents/tuteurs à Kahone/Dakar/Diaspora, régime social ou payant, affectation de chambre d'internat).
   - Génération instantanée de l'aperçu de la Carte Talibé conforme à la maquette officielle avec bouton d'impression directe et export PDF.
2. **Cahier de Suivi Coranique par le Maître :**
   - Sélection de la classe affectée, liste des talibés avec leur dernier verset validé.
   - Enregistrement d'une nouvelle leçon en quelques secondes (sélection rapide Sourate 1 à 114, verset début/fin, Hizb/Juz calculés automatiquement).
3. **Espace Parent & Synchronisation Coranique :**
   - Sélecteur de l'enfant (si fratrie inscrite).
   - Bouton « Lire la sourate » : ouvre le lecteur coranique avec défilement automatique et surbrillance du dernier verset atteint par le talibé.
   - Bouton « Écouter la récitation » : déclenche l'audio maîtrisé d'Al-Husary pour accompagner la révision à domicile.
   - Formulaire de demande de visite avec suivi des réponses en temps réel.

---

### 3. Key Product Decisions & Trade-Offs

- **Décision 1 : Données coraniques certifiées (Corpus Hafs vérifié & Audio Quran.com)**
  - *Choix :* Intégration de la structure complète des 114 sourates (noms arabes et phonétiques, 6236 versets avec texte complet Hafs issu de l'API Quran.com / Tanzil, Juz 1 à 30, Hizb 1 à 60) et flux audio haute qualité de Mahmoud Khalil Al-Husary.
  - *Justification :* Règle absolue de fidélité religieuse : aucun texte généré artificiellement, aucun risque de décalage de verset.
- **Décision 2 : Double niveau de persistance des données**
  - *Choix :* Moteur de stockage réactif local (IndexedDB / LocalStorage) avec jeu de données initial riche et cohérent pour Kahone, doté d'une fonction de sauvegarde/restauration JSON et de l'export de schémas Django REST Framework / PostgreSQL prêts pour le déploiement sur serveur dédié.
  - *Justification :* Permet une utilisation fluide, testable immédiatement dans le studio, résistant aux pannes réseau et directement transposable en production.
- **Décision 3 : Moteur de rendu haute fidélité pour la Carte Talibé**
  - *Choix :* Rendu DOM/Canvas/SVG vectoriel reproduisant les éléments de la carte physique (`WhatsApp_Image_2026-10-30_at_14.01.06_8a36b9c7.jpeg`) avec support d'impression CSS `@media print` optimisé à 300 DPI et téléchargement d'image/document.
  - *Justification :* Élimine les dépendances binaires lourdes côté client tout en offrant une reproduction 100% fidèle au modèle papier déjà utilisé au Daara.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PORTAIL PUBLIC & AUTHENTIFICATION                     │
│  - Vitrine Institutionnelle (Kahone)   - Sélecteur Démo / Connexion Sécurisée│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                    GESTIONNAIRE D'ÉTAT & SERVICES MÉTIER                    │
│   (State Store persistant, RBAC Guards, Synchronisation Locale & API)       │
├───────────────────┬───────────────────┬───────────────────┬─────────────────┤
│    ACADEMICS      │    MEMORIZATION   │      FINANCE      │    BOARDING     │
│ - Années scolaires│ - 114 Sourates    │ - Inscriptions    │ - Bâtiments     │
│ - Classes & Salles│ - Leçons quotid.  │ - Mensualités     │ - Chambres      │
│ - Talibés & Tuteurs - Révisions & Tajwid│ - Dépenses/Reçus  │ - Lits & Sorties│
└─────────┬─────────┴─────────┬─────────┴─────────┬─────────┴────────┬────────┘
          │                   │                   │                  │
┌─────────▼─────────┐ ┌───────▼─────────┐ ┌───────▼─────────┐ ┌──────▼────────┐
│  ESPACE DIRECTEUR │ │ ESPACE MAÎTRE   │ │  ESPACE PARENT  │ │ CARTE TALIBÉ  │
│ - KPIs & Finances │ │ - Saisie leçons │ │ - Suivi enfants │ │ - Moteur SVG/ │
│ - Validation dons │ │ - Évaluations   │ │ - Lecteur Coran │ │   Canvas/Print│
│ - Journal audit   │ │ - Présences     │ │ - Visites       │ │ - Export PDF  │
└───────────────────┘ └─────────────────┘ └─────────────────┘ └───────────────┘
```

#### Modèle de Données & Relations
1. **User :** `id, username, email, full_name, role (DIRECTEUR, ASSISTANT, MAITRE, PARENT), phone, is_active, avatar_url`
2. **AcademicYear :** `id, name (ex: 2026-2027), start_date, end_date, is_current`
3. **ClassRoom :** `id, name (ex: Niveau 1 - Ibtida'i, Hifz Avancé), academic_year_id, teacher_id (Maître)`
4. **Student (Talibé) :** `id, registration_number (ex: DAF-2026-0042), first_name, last_name, gender, birth_date, birth_place, nationality, address, status (PAYANT / SOCIAL), photo_url, father_name, father_phone, mother_name, mother_phone, guardian_id, room_id, current_class_id, enrollment_date`
5. **Guardian (Parent/Tuteur) :** `id, user_id, relation_type, address, emergency_contact, children_ids[]`
6. **Room (Internat) :** `id, building_name, room_number, capacity, current_occupancy, supervisor_name`
7. **QuranProgress (Leçon) :** `id, student_id, teacher_id, date, surah_number (1-114), surah_name, ayah_start, ayah_end, juz, hizb, quality (EXCELLENT, BIEN, MOYEN, A_REVOIR), teacher_notes`
8. **QuranRevision :** `id, student_id, teacher_id, date, surahs_reviewed[], tajwid_score (1-5), comments`
9. **Attendance :** `id, student_id, class_id, date, period (MATIN, SOIR), status (PRESENT, ABSENT, RETARD), reason`
10. **VisitRequest :** `id, guardian_id, student_id, requested_date, requested_time, status (EN_ATTENTE, ACCEPTEE, REFUSEE, MODIFIEE), response_notes`
11. **FinancialRecord :** `id, student_id, fee_type (INSCRIPTION, MENSUALITE, DON), amount, date, payment_method (WAVE, ORANGE_MONEY, ESPECES), receipt_number, cashier_id, status (PAYE, IMPAYE)`
12. **InventoryItem :** `id, category (ALIMENTAIRE, SCOLAIRE, SANTE), name, quantity, unit, min_threshold`

---

### 5. Plan de Réalisation Détaillé par Phases

- **Phase 1 — Fondations & Thème Institutionnel :**
  - Configuration Tailwind avec palette officielle (Vert institutionnel `#114232`, Or `#C5A059`, Blanc cassé).
  - Typographie arabe Uthmani et polices de travail.
  - Modèle de données central, gestionnaire de persistance locale et données d'amorçage réalistes de Kahone.
  - Sélecteur de profil démo et sécurité RBAC par rôle.
- **Phase 2 — Portail Public & Tableau de Bord Général :**
  - Page d'accueil publique du Daara Shaykh Aliou Fatima (Kahone - Kaolack, Sénégal).
  - Tableau de bord personnalisé pour chaque rôle (Directeur, Assistant, Maître, Parent).
- **Phase 3 — Gestion des Talibés, Inscriptions & Carte Officielle :**
  - Annuaire des talibés avec recherche, filtres (classes, régime social/payant, internat).
  - Fiche détaillée du talibé et formulaire d'inscription/réinscription.
  - Module Carte Talibé : reproduction fidèle du modèle fourni, aperçu temps réel et impression/téléchargement.
- **Phase 4 — Module d'Apprentissage Coranique :**
  - Interface du maître coranique pour l'enregistrement rapide des leçons, révisions et appréciations de tajwid.
  - Calcul et affichage automatique du Juz, Hizb, et des jalons de mémorisation.
  - Historique chronologique complet par talibé.
- **Phase 5 — Lecteur Coranique Complet & Espace Parent :**
  - Lecteur des 114 sourates en arabe Uthmani avec repères de Juz et Hizb.
  - Récitation audio de Cheikh Mahmoud Khalil Al-Husary avec commandes de lecture/pause/répétition.
  - Synchronisation avec la progression du talibé (surlignage du dernier verset appris).
  - Espace parent multi-enfants et module de demande de visite de weekend.
- **Phase 6 — Internat, Présences, Personnel, Finances & Stocks :**
  - Affectation des chambres et suivi de l'occupation des dortoirs.
  - Feuille de présence quotidienne rapide.
  - Gestion des frais scolaires, mensualités, paiements (Wave, Orange Money, Espèces) et reçus.
  - Volet social (parrainages des talibés sociaux, dons).
  - Suivi des approvisionnements et stocks de l'internat.
- **Phase 7 — Contrôle Qualité, Validation & Documentation d'Export :**
  - Audit visuel et réactivité mobile/tablette/desktop.
  - Vérification de la non-régression et compilation sans avertissement.
  - Documentation pour l'exportation vers Django REST Framework / PostgreSQL.
