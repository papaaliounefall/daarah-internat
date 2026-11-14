# Conventions du backend (à respecter par toute nouvelle app)

Référence vivante : lire `apps/students/` et `apps/academics/` (views, serializers, selectors, services, tests)
avant d'écrire une nouvelle app. Les **modèles de toutes les apps existent déjà** (`models.py` + migrations initiales).

## Règles non négociables

1. **Isolation par établissement.** Tout modèle métier hérite de `TenantModel`. Tout ViewSet hérite de
   `TenantViewSetMixin` (filtre `establishment_id` TOUJOURS appliqué) et tout serializer de
   `TenantModelSerializer` (clés étrangères limitées à l'établissement : anti-IDOR).
2. **Permissions côté serveur.** Chaque vue déclare `role_access = {action: {rôles}}` (voir
   `apps/core/permissions.py`, les ensembles `ADMIN_ROLES`, `STAFF_ROLES`, `ALL_ROLES` sont dans `apps/core/roles.py`).
   Action absente = refusée. Les vues finance déclarent `finance_scope = True` (un assistant n'y accède que si
   `user.can_view_finance`). **Ne jamais compter sur le masquage d'un bouton côté React.**
3. **Périmètre par rôle** via `scope_queryset(self, qs)` :
   - maître → uniquement ses classes / ses élèves (`apps.students.selectors.student_scope`, `student_ids_for`) ;
   - parent → uniquement les enfants liés par `guardians.Guardianship`, en **lecture seule** ;
   - un objet hors périmètre répond **404** (pas 403, pas de fuite d'existence).
4. **Pas de suppression définitive** des données métier : archivage, annulation avec motif, ou correction par nouvelle
   ligne (`supersedes`). Utiliser `NoDeleteMixin`. Les montants/quantités ne se modifient que par des services transactionnels.
5. **Journal d'audit** : `AuditedMixin` sur les ViewSets ; pour les actions personnalisées sensibles appeler
   `apps.audit.services.record(request, "ACTION", obj, changes={...})`. Jamais de mot de passe/jeton dans les logs.
6. **Règles métier dans `services.py`** (transactions atomiques, `select_for_update` pour compteurs/capacités), pas dans les vues.
   Les numéros séquentiels (reçus…) utilisent `apps.core.models.Sequence.next(establishment, key, year)`.
7. **Fichiers privés** : valider avec `apps.core.validators` (déjà branchés sur les champs), exposer via
   `apps.core.files.signed_file_url(request, fieldfile)` (URL signée 1 h). Jamais d'URL média publique.
8. **Notifications** : n'utiliser que `apps.notifications.services` (`notify`, `notify_roles`, `notify_guardians`).
9. **Aucune donnée fictive** dans le code livré ; les jeux de démonstration vont dans une commande de management
   explicite (`seed_demo`, réalisée par ailleurs) et jamais dans une migration.
10. **JSON** : snake_case côté API (le frontend convertit en camelCase). Réponses d'erreur DRF standard
    (`{"detail": ...}` ou `{champ: [messages]}`) avec messages **en français** compréhensibles.
11. Identifiants = UUID (str). Montants FCFA = `Decimal` entiers (decimal_places=0), sérialisés en nombre.
12. Pagination : `StandardPagination` (`?page_size=` jusqu'à 1000). Filtres : `django_filters` + `search_fields`.

## Gabarit d'un ViewSet

```python
class XViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    queryset = X.objects.select_related(...)
    serializer_class = XSerializer
    role_access = {"list": STAFF_ROLES, "retrieve": STAFF_ROLES, "create": ADMIN_ROLES, "update": ADMIN_ROLES,
                   "partial_update": ADMIN_ROLES}
    filterset_fields = [...]
    def scope_queryset(self, qs): ...
```
URL : `router.register("x-things", XViewSet, basename="x-thing")` dans `apps/<app>/urls.py` (déjà inclus par `config/urls.py`,
préfixe `/api/`).

## Tests (obligatoires pour chaque app)

`apps/<app>/tests/test_*.py`, `pytest.mark.django_db`, fixtures de `backend/conftest.py`
(`est`, `other_est`, `director`, `assistant`, `teacher`, `teacher2`, `parent`, `other_director`, `api`, `year`,
`classroom`, `classroom2`, helper `client_for(user)`). Tester au minimum : droits par rôle (403), périmètre (404),
isolation entre établissements, règles métier et cas limites (capacité, doublon, montant négatif, etc.).

Lancer : `cd backend && ./.venv/Scripts/python -m pytest apps/<app>` (SQLite en mémoire).
Après modification d'un modèle de VOTRE app : `./.venv/Scripts/python manage.py makemigrations <app> --settings=config.settings.test`
(ne modifier que vos apps ; si un changement d'une autre app est nécessaire, le signaler dans votre rapport final).

## Documentation d'API

Chaque app documente ses endpoints dans `backend/docs/api/<app>.md` : méthode + URL, rôles autorisés, corps de requête,
forme de la réponse (noms de champs snake_case), règles métier et codes d'erreur. Le frontend s'appuie dessus.
