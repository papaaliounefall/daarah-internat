# Déploiement en production (Docker + Nginx + HTTPS)

## Prérequis
- Un serveur Linux avec Docker et Docker Compose v2, ports 80 et 443 ouverts.
- Un nom de domaine dont le DNS pointe vers le serveur (nécessaire pour un vrai certificat HTTPS).

## 1. Configuration
```bash
cp .env.example .env
```
Renseigner dans `.env` : `DOMAIN`, `DJANGO_SECRET_KEY` (`python -c "import secrets; print(secrets.token_urlsafe(64))"`),
`POSTGRES_PASSWORD`, les informations de l'établissement et du directeur initial. **Ne jamais versionner `.env`.**
Si `DIRECTOR_PASSWORD` est vide, un mot de passe aléatoire est affiché une seule fois dans les logs du service
`backend` (`docker compose logs backend | grep "Mot de passe initial"`) ; le changement est exigé à la première connexion.

## 2. Démarrage
```bash
docker compose up -d --build
docker compose exec backend python manage.py import_quran      # corpus coranique (une fois)
```
Nginx démarre avec un certificat auto-signé temporaire pour ne pas bloquer le démarrage.

## 3. Certificat HTTPS (Let's Encrypt)
```bash
DOMAIN=daara.exemple.sn EMAIL=admin@exemple.sn sh deploy/init-letsencrypt.sh
```
Le service `certbot` renouvelle ensuite automatiquement ; Nginx doit être rechargé après renouvellement
(`docker compose exec nginx nginx -s reload`, ou planifier cette commande chaque semaine).

## 4. Sauvegardes et restauration
Le service `backup` exécute un `pg_dump` + archive des fichiers (`BACKUP_INTERVAL_HOURS`, défaut 24 h) dans
`BACKUP_DIR` (défaut `./backups`) avec rotation (`BACKUP_KEEP_DAYS`, défaut 14 jours).
**Copiez régulièrement ce dossier hors du serveur** (disque externe, autre machine) : une sauvegarde sur le même
disque ne protège pas d'une panne du serveur.

Restauration : `sh deploy/backup/restore.sh 20261107-020000` (horodatage du fichier `db-…dump`).
Testez la restauration sur une machine de test avant d'en avoir besoin.

## 5. Mises à jour
```bash
git pull && docker compose up -d --build     # les migrations s'exécutent au démarrage du service backend
```

## 6. Sécurité en production — contrôle
- `DJANGO_DEBUG` jamais activé ; `config.settings.prod` refuse de démarrer sans clé secrète.
- HTTPS forcé (redirection 80→443, HSTS), cookies sécurisés, en-têtes CSP/anti-clickjacking, limitation de débit sur la connexion.
- Les fichiers privés (photos, documents, PDF) ne sont servis que par URL signée de 1 h (Nginx `internal` + `X-Accel-Redirect`).
- PostgreSQL et Redis ne sont pas exposés à l'extérieur du réseau Docker.
- Le conteneur Django tourne sans privilèges.
