# API Coran (`apps/quran`)

Corpus **global** (commun à tous les établissements), en **lecture seule**. Le texte provient exclusivement de la
commande `import_quran` : il n'est jamais généré, modifié, réordonné ni « complété » par l'application.
Aucun texte de repli n'existe : si une donnée manque, l'API répond vide / 404.

Accès : tout utilisateur authentifié rattaché à un établissement (directeur, assistant, maître, parent). Méthodes
`GET`/`HEAD` uniquement (autres : 405).

## Cache (connexion instable)

Toutes les réponses portent `ETag` et `Cache-Control: private, max-age=86400`. Envoyer `If-None-Match: <ETag>` renvoie
**304** sans corps si le contenu n'a pas changé. Le front peut donc stocker les sourates (Cache Storage / IndexedDB)
et les revalider à bas coût.

## Endpoints

| Méthode + URL | Description |
|---|---|
| `GET /api/quran/surahs/` | 114 sourates : `number, name_arabic, name_simple, name_french, revelation_place, verses_count, page_start, page_end, bismillah_pre`. Enveloppe `{count, next:null, previous:null, results}`. |
| `GET /api/quran/surahs/{n}/` | Métadonnées + `ayat` (tous les versets). `?from=&to=` restreint à une plage (`from ≤ to`, sinon 400). 404 si `n` ∉ 1..114. |
| `GET /api/quran/ayat/?surah=&juz=&page=` | Versets filtrés (filtres combinables, **au moins un obligatoire**, sinon 400). `page` = page du mushaf de Médine (1..604) ; ce n'est PAS la pagination (réponse non paginée `{count, results}`). |
| `GET /api/quran/reciters/` | Récitateurs disponibles : `slug, name, source, is_default, license_note`. |
| `GET /api/quran/surahs/{n}/audio/?reciter=<slug>` | `{reciter, surah, chapter_audio, verses}`. Récitateur par défaut si `reciter` omis (400 si aucun importé, 404 si slug inconnu). `chapter_audio` = `{ayah:null, verse_key:null, url, duration_seconds}` ou `null` ; `verses` = `[{ayah, verse_key, url, duration_seconds}]` (vide si l'audio verset n'a pas été importé). |

Verset : `surah, number_in_surah, verse_key ("2:255"), text_uthmani, juz, hizb (1..60), rub_el_hizb (1..240), page, sajda`.

Les URL audio sont des URL externes (quranicaudio.com / EveryAyah) **fournies par la source** ; le front les lit avec
`<audio>` (préchargement `none`, mise en cache navigateur). Elles ne passent pas par les URL signées privées.

## Import : `python manage.py import_quran [--with-verse-audio] [--no-audio]`

- Source : API publique Quran.com v4 `https://api.quran.com/api/v4` :
  `chapters?language=fr`, `verses/by_chapter/{n}?fields=text_uthmani&per_page=300`,
  `resources/chapter_reciters` + `chapter_recitations/{id}` (audio de sourate),
  `resources/recitations` + `recitations/{id}/by_chapter/{n}` (audio verset, option).
- Champs retenus par verset : `text_uthmani` (**tel quel**, sans nettoyage), `juz_number`, `hizb_number` (1..60),
  `rub_el_hizb_number`, `page_number` (mushaf de Médine), `sajdah_number` (→ `sajda`).
- Récitateur : **Mahmoud Khalil Al-Husary, style Murattal** (`husary-murattal`, id source 6). La source expose aussi un style
  « Muallim » (id 12), non importé. Les URL audio de sourate viennent de `audio_url` ; celles des versets sont
  protocole-relatives (`//mirrors.quranicaudio.com/...`) : seul le préfixe `https:` est ajouté. Toute URL qui resterait
  relative est refusée (jamais inventée).
- Contrôles bloquants (code de sortie ≠ 0, **aucune écriture** : tout est dans une transaction) : 114 sourates,
  6236 versets au total, suites de versets continues et conformes à `verses_count`, clés `s:v` cohérentes, bornes
  juz 1..30 / hizb 1..60 / rub 1..240 / page 1..604, contrôle final en base.
- Idempotent (upsert) ; nouvelles tentatives automatiques (4) en cas d'erreur réseau.
- Résultat de l'import réel de validation : 114 sourates, 6236 versets, 114 audios de sourate, 6236 audios de verset,
  juz 1..30, hizb 1..60, rub 1..240, pages 1..604 (14 versets de sajda selon la source).

## `services.resolve_range(surah_number, ayah_start, ayah_end)`

Valide la plage (sourate 1..114, `1 ≤ début ≤ fin ≤ verses_count`, versets présents dans le corpus) et retourne
`ResolvedRange(surah, ayah_start, ayah_end, juz, hizb, page)` — juz/hizb/page **du dernier verset**. Lève
`ValidationError` avec message français par champ (`surah`, `ayah_start`, `ayah_end`, ou `detail` si le corpus n'est pas
importé). Utilisé par `memorization` ; le client ne saisit jamais juz/hizb/page.

## Source, licence et conditions d'usage (à vérifier par l'établissement)

- **Quran.com / Quran Foundation** : l'API `api.quran.com/api/v4` utilisée ici est l'API publique historique, accessible sans
  clé au moment de l'écriture. La documentation officielle actuelle (api-docs.quran.foundation) décrit désormais des
  « Content APIs » avec authentification OAuth2 (client credentials). **À vérifier** : conditions d'utilisation, éventuel
  besoin de demander un accès officiel pour un usage en production, limites de débit. L'import étant ponctuel (corpus
  stocké localement), la charge sur la source est minimale ; ne pas l'exécuter en boucle.
- **Texte uthmani** : Quran.com indique s'appuyer sur des textes vérifiés (notamment le projet **Tanzil**). Licence Tanzil
  (Creative Commons Attribution 3.0) : copie et diffusion autorisées **sans modification du texte**, avec **mention de la source
  (Tanzil Project) et lien vers tanzil.net**, et reproduction de la notice de droits. À afficher dans le lecteur
  (pied de page « Texte : Tanzil Project — tanzil.net »). **À confirmer** par l'établissement : la mention exacte
  requise par Quran.com pour le texte qu'il distribue.
- **Audio** (récitation d'Al-Husary via quranicaudio.com / EveryAyah) : les conditions de diffusion et de mise en cache
  hors ligne ne sont pas précisées par l'API. **À vérifier avant tout usage public** (portail public, téléchargement).
  Le champ `Reciter.license_note` le rappelle.
- Le texte et les numéros de versets ne doivent jamais être corrigés à la main : en cas d'erreur constatée, signaler à
  la source puis relancer `import_quran`.
