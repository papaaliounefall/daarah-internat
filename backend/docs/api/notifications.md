# API Notifications et informations du Daara

Préfixe `/api/`. Tous les rôles authentifiés (directeur, assistant, maître, parent).

## Notifications (privées)
Chaque utilisateur ne voit **que les siennes** : celles d'un autre utilisateur, même du même établissement, répondent `404`.
Lecture seule côté API (les notifications sont créées par le serveur via `apps.notifications.services`).

| Méthode + URL | Description |
|---|---|
| `GET /notifications/` | Liste paginée, récentes d'abord. Filtres : `?unread=true|false`, `?kind=FINANCE`, `?link_type=student`. |
| `GET /notifications/unread-count/` | `{"count": n}` (option `?kind=`). |
| `GET /notifications/{id}/` | Détail. |
| `POST /notifications/{id}/read/` | Marque comme lue (idempotent). Retourne la notification. |
| `POST /notifications/read-all/` | Marque toutes les siennes comme lues ; corps facultatif `{"kind": "FINANCE"}`. `{"updated": n}`. |

Champs : `id, kind (CORAN|EVALUATION|PRESENCE|VISITE|FINANCE|GENERAL), kind_display, title, message, channel, link_type,
link_id, is_read, read_at, created_at`. `link_type/link_id` permettent au front de naviguer (`student`, `due`,
`announcement`, `contact_request`, `visit`…).

## Informations du Daara (`Announcement`)
| Méthode + URL | Rôles | Description |
|---|---|---|
| `POST /announcements/` | directeur, **assistant** | `{"title", "message", "audience": ["PARENT","MAITRE"]}` ; `audience` vide/absente = tous les rôles de l'établissement. |
| `GET /announcements/` , `GET /announcements/{id}/` | tous | Directeur/assistant : toutes ; maître/parent : celles dont l'audience les concerne (`404` sinon). |

Choix : l'assistant peut diffuser (cahier des charges §4.2 : « opérations administratives autorisées ») ; pas de
modification ni de suppression (une correction = une nouvelle information). Validation : titre ≤ 200, message ≤ 5000,
rôles valides.
Diffusion : à la fin de la transaction, tâche Celery `broadcast_announcement` -> `notify_roles(...)` avec
`dedupe_key="announcement:<id>"` : **idempotente** (relancer la tâche ne duplique rien). Si le broker est
indisponible, la diffusion s'exécute immédiatement (l'annonce reste enregistrée).

## Rappels d'échéances : `apps.notifications.tasks.send_due_reminders`
Déjà planifiée quotidiennement (`CELERY_BEAT_SCHEDULE["rappels-echeances"]`).
- Échéance concernée (`finance.Due`) : non annulée, talibé non archivé, **échue dans ≤ 3 jours ou en retard**, restant
  dû > 0 avec **restant = montant - somme des paiements `PAYE` liés** (les paiements annulés ne comptent pas).
- Destinataires : parents liés au talibé (`Guardianship`), directeur(s), assistants avec `can_view_finance`
  (jamais maîtres ni assistants sans droit financier).
- Anti-répétition : un même destinataire n'est pas relancé pour la même échéance **moins de 7 jours** après le
  précédent rappel (`dedupe_key = "due:<id_échéance>:<date>"` ; une même exécution rejouée le même jour ne crée rien).
- Type `FINANCE` ; `link_type="student"` pour les parents, `"due"` pour le personnel.

## SMS / WhatsApp (extension future)
Seul le canal `IN_APP` est actif ; `Notification.channel` accepte déjà `SMS` et `WHATSAPP` mais **rien n'est envoyé ni
simulé**. Pour ajouter un fournisseur réel : créer un connecteur (clé API en variable d'environnement), puis une tâche
qui crée/relit les notifications du canal voulu et les remet au fournisseur, sans changer l'API ci-dessus.
