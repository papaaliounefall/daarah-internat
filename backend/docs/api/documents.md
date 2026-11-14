# API Documents : carte talibé, reçus, rapport financier

Préfixe `/api/`. Authentification JWT. Toutes les réponses PDF sont `application/pdf` (affichage `inline`),
quel que soit l'en-tête `Accept`. Pour afficher un PDF dans le navigateur, récupérer la réponse en `blob`
(le JWT est un en-tête) ou utiliser `pdf_url` (URL signée, valable 1 h, voir `/api/files/<jeton>/`).
Chaque génération/consultation est journalisée (`PDF_CARD`, `PDF_CARD_PREVIEW`, `PDF_CARD_DOWNLOAD`,
`PDF_CARD_BATCH`, `PDF_CARD_FAILED`, `PDF_RECEIPT`, `PDF_FINANCE_REPORT`).

## 1. Carte talibé

| Méthode + URL | Rôles | Rôle |
|---|---|---|
| `GET /students/{id}/card/preview/` | directeur, assistant | PDF inline avec les données **actuelles** du dossier. Rien n'est enregistré. |
| `POST /students/{id}/card/` | directeur, assistant | Génère **et enregistre** la version suivante. Corps `{"reason": "Perte"}` (facultatif). `201` + objet carte. |
| `GET /students/{id}/card/` | directeur, assistant, **parent de l'enfant** | PDF de la carte **courante** enregistrée (`404` si aucune). |
| `GET /students/{id}/cards/` | directeur, assistant ; parent (carte courante seulement) | Historique des versions (plus récente d'abord). |
| `GET /cards/{id}/pdf/` | directeur, assistant ; parent (uniquement la version courante d'un de ses enfants) | PDF d'une version précise. |
| `POST /cards/batch/` | directeur, assistant | `{"students": [ids…], "reason": "Rentrée"}` (1 à 200). Une tâche Celery par talibé. `202 {"queued": n}`. |

Le **maître** n'a aucun accès aux cartes (`403`). Un talibé hors du périmètre de l'utilisateur (autre
établissement, enfant d'un autre parent) répond `404`. Pas de suppression de carte.

### Objet carte (directeur/assistant)
```json
{"id": "uuid", "student": "uuid", "version": 2, "is_current": true, "reason": "Perte",
 "snapshot": {"classe": "Hifz", "numero": "DAF-2026-0001", "nom": "FALL Mansour", "pere": "...", "mere": "...",
              "nationalite": "Sénégalaise", "ville": "Kahone", "telephone": "77 634 46 76",
              "date_inscription": "07/11/2026", "photo": "students/photos/x.jpg", "generated_at": "..."},
 "generated_by_name": "Directeur", "pdf_url": "https://…/api/files/<jeton>/", "download_url": "/api/cards/<id>/pdf/",
 "created_at": "..."}
```
Pour un parent : uniquement `id, student, version, pdf_url, download_url, created_at` (pas de motif ni de snapshot).

### Règles métier
- Chaque génération crée une **nouvelle version** (`version` + 1) ; l'ancienne passe `is_current=false` ; aucun
  écrasement, tous les PDF restent stockés. Un verrou sur le dossier évite deux versions identiques simultanées.
- `reason` absent : « Première édition » (1re carte) ou « Régénération ».
- Valeurs imprimées : **Classe** = classe de l'inscription de l'année active (sinon la plus récente) ; **Numéro** =
  matricule ; **Nom** = `NOM Prénom` ; **Père / Mère** ; **Nationalité** ; **Ville** = lieu de naissance, sinon
  adresse ; **Téléphone** = responsable légal, sinon père, sinon mère ; **Date d'inscription** `jj/mm/aaaa`.
  Texte trop long : taille de police réduite automatiquement (6,4 pt -> 4,2 pt) puis troncature « … ».
  Les noms en arabe sont rendus avec reshaping + bidi + police Amiri.
- Photo : recadrée « cover » (sans déformation, haut de l'image privilégié) dans la zone intérieure du cadre doré,
  coins coupés comme le tracé pointillé du modèle. Sans photo, la zone reste vide.
- **Génération automatique** : `post_save(created)` sur `students.Student` -> `transaction.on_commit` -> tâche
  `generate_student_card(only_if_missing=True)`. Exécutée **après** le commit, donc la classe créée juste après le
  dossier par la vue est imprimée. Une panne (broker, rendu, disque) ne fait jamais échouer l'inscription : log +
  audit `PDF_CARD_FAILED`. Désactivable : `DOCUMENTS_AUTO_CARD = False`. Si la classe change plus tard,
  régénérer la carte (`POST …/card/` avec `reason`).
- Les PDF sont stockés sous `MEDIA_ROOT/documents/cards/<établissement>/…` et servis uniquement par URL signée ou
  par les vues authentifiées ci-dessus.

## 2. Reçu de paiement : `GET /documents/receipts/{payment_id}/`
Rôles : directeur ; assistant **avec** `can_view_finance` ; parent pour les paiements de **ses** enfants (autre : `404`).
Maître : `403`. PDF A5 : emblème et en-tête de l'établissement (nom, coordonnées, couleurs ; en-tête arabe officiel pour
l'établissement par défaut), n° de reçu, talibé + matricule, objet/période, échéance liée, mode, référence, date,
« encaissé par », montant `35 000 FCFA`, zones de signature. Paiement annulé : filigrane **ANNULÉ**, montant barré,
motif et auteur de l'annulation.

## 3. Rapport financier : `GET /documents/finance-report/?from=AAAA-MM-JJ&to=AAAA-MM-JJ`
Rôles : directeur ; assistant avec `can_view_finance`. Défaut : 1er du mois courant -> aujourd'hui. `400` si date
invalide, `from > to` ou période > 10 ans. PDF A4 contenant :
- **Recettes** = paiements `PAYE` de la période + dons non annulés de la période ; **Dépenses** = dépenses `VALIDEE`
  uniquement (les « en attente / refusées / annulées » sont exclues, leur nombre est signalé) ; **Solde** = recettes - dépenses ;
- répartition des paiements par nature et par mode, dépenses par catégorie, évolution mensuelle ;
- **Impayés** : échéances non annulées échues au plus tard à la date `to`, restant dû > 0 (montant - paiements `PAYE`
  liés), regroupées par talibé (40 plus gros restants affichés, total complet donné).
Tout est calculé directement depuis `finance.Payment/Expense/Due` et `social.Donation`, filtré sur l'établissement.

## 4. Régénérer / ajuster la carte (développeurs)
- Modèle officiel : `apps/documents/assets/carte_talibe_modele.jpg` (1280×853 px, page 90×60 mm). Fond utilisé :
  `carte_talibe_vierge.jpg` (textes « PHOTO – Coller la photo ici / Format photo 35x45mm » effacés par interpolation du
  fond du cadre). Reconstruire : `python manage.py build_card_template` (zones à effacer : `TEXT_MASKS` dans
  `pdf/template.py`).
- Coordonnées en **pixels du modèle** dans `pdf/card.py` : `FIELDS` (ordonnée et début de chaque ligne), `LINE_END_X`,
  `VALUE_*` (retrait, hauteur au-dessus de la ligne, taille max/min, police, couleur), `PHOTO_BOX`, `PHOTO_CHAMFER`.
- Contrôle visuel : `python manage.py render_card_sample --out controle.pdf [--photo visage.jpg]` (valeurs repères
  `[classe]`, `[nom]`…), puis conversion en PNG (`pip install pymupdf` ; `pymupdf.open("controle.pdf")[0].get_pixmap(dpi=343).save("controle.png")`)
  et comparaison à l'original. Le fond reconstitué diffère du modèle de < 0,4/255 en moyenne hors zones masquées.
- Polices embarquées (`assets/fonts/`, licences SIL OFL jointes) : Amiri (arabe), Noto Sans (latin). `pdf/arabic.py` :
  `shape()` (reshaping + bidi), `draw_text()` (alignement, réduction auto), à utiliser pour tout texte arabe variable.
