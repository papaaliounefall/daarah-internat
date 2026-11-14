# Conventions du frontend

Pile : React 19 + TypeScript (strict) + Vite + Tailwind 4 + React Router 7 + Zustand + Axios + Recharts + Lucide.
Le frontend ne contient **aucune donnée métier en dur** : tout provient de l'API Django (`/api`).

## Réseau
- `src/lib/api.ts` : instance Axios `http` (JWT en en-tête, rafraîchissement automatique, conversion
  **camelCase ⇄ snake_case** automatique des corps JSON et des `params`). `errorMessage(err)` donne un message
  français lisible. `listAll<T>(url, params)` charge toutes les pages d'une liste de référence.
- Les envois de **fichiers** utilisent `toFormData({...})` (de `src/lib/case.ts`) : clés converties en snake_case.
- Pas de `fetch` direct vers l'API ; pas de `localStorage` pour des données métier.
- Photos / documents / PDF : l'API renvoie des **URLs signées temporaires** (`photoUrl`, `fileUrl`) utilisables
  directement dans `<img src>` / `<a href>` / `<iframe>`.

## Données dans les composants
- Lecture : `useFetch(() => http.get(...).then(r => r.data), [deps])` (`src/hooks/useFetch.ts`) → `{data, loading, error, reload}`.
  Toujours afficher : `<Spinner/>` pendant le chargement, `<ErrorState message onRetry/>` en cas d'erreur,
  `<EmptyState/>` si la liste est vide.
- Écriture : `await http.post(...)`, puis `reload()` ; erreurs → `toast.error(errorMessage(e))`, succès → `toast.success(...)`.
  Opérations sensibles (annuler un paiement, archiver, refuser…) : `<ConfirmDialog/>` avant.
- Séparer : appels API dans `src/services/<domaine>.ts` (fonctions typées), logique d'affichage dans les composants.
- Types : `src/types/index.ts` (noyau, **ne pas modifier** sans nécessité) + `src/types/<domaine>.ts` par module.

## Interface (cahier des charges §3 : sobre, professionnelle, pas d'allure « générée par IA »)
- Kit : `src/components/ui` (`Button`, `TextField`/`SelectField`/`TextAreaField`, `Modal`, `ConfirmDialog`, `Badge`,
  `PageHeader`, `Spinner`, `EmptyState`, `ErrorState`, `useToast`). Classes utilitaires : `input`, `panel`, `table-base`.
- Couleurs : `brand-*` (vert), `gold-*` (or discret), `paper`, `ink`, `line`, `danger`. Pas de dégradés, pas d'ombres
  marquées, coins `rounded-md`, bordures fines, pas d'emoji dans l'UI, pas de grands titres. Tableaux lisibles,
  formulaires avec libellés explicites, boutons à verbe d'action. Cartes uniquement quand elles groupent vraiment du contenu.
- Responsive : mobile d'abord (tables → listes ou défilement horizontal maîtrisé), cibles tactiles ≥ 40 px.
- Accessibilité : libellés `<label>`, `aria-label` sur les boutons-icônes, rôle `alert`/`status`, focus visible.
- Texte arabe : classe `font-arabic` ; **texte coranique : `font-quran`**, `dir="rtl"`, `lang="ar"`.
- Langue : français ; montants `Intl.NumberFormat('fr-FR')` + « FCFA » ; dates `jj/mm/aaaa`.

## Droits
Le masquage de boutons selon `user.role` n'est qu'un confort d'interface : le serveur refuse de toute façon
(403/404). Navigation et gardes : `src/app/navigation.ts`, `src/app/App.tsx`.

## Vérifications
`npm run lint` (tsc strict) et `npm run test` (Vitest) doivent passer ; `npm run build` doit réussir.
