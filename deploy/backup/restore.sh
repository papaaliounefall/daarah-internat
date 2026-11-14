#!/bin/sh
# Restauration d'une sauvegarde. ATTENTION : remplace les données actuelles.
# Usage : sh deploy/backup/restore.sh <horodatage>      ex. 20261107-020000
set -eu
STAMP="${1:?Indiquer l'horodatage de la sauvegarde (voir le dossier des sauvegardes)}"

echo "Arrêt de l'application…"
docker compose stop backend worker beat

echo "Restauration de la base…"
docker compose run --rm --no-deps -T --entrypoint sh backup -c \
  "PGPASSWORD=\$POSTGRES_PASSWORD pg_restore -h \$POSTGRES_HOST -U \$POSTGRES_USER -d \$POSTGRES_DB --clean --if-exists --no-owner /backups/db-${STAMP}.dump"

echo "Restauration des fichiers…"
docker compose run --rm --no-deps -T --entrypoint sh backup -c "tar -xzf /backups/media-${STAMP}.tar.gz -C /data"

echo "Redémarrage…"
docker compose start backend worker beat
echo "Restauration terminée."
