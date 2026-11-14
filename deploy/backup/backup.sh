#!/bin/sh
# Sauvegarde automatique : PostgreSQL (pg_dump) + fichiers médias, rotation de 14 jours.
# Tourne en boucle dans le conteneur « backup » (une sauvegarde toutes les BACKUP_INTERVAL_HOURS).
set -eu
DEST=/backups
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
INTERVAL="$(( ${BACKUP_INTERVAL_HOURS:-24} * 3600 ))"

while true; do
    STAMP="$(date +%Y%m%d-%H%M%S)"
    echo "[backup] $STAMP : début"
    PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$DEST/db-$STAMP.dump.tmp" \
        && mv "$DEST/db-$STAMP.dump.tmp" "$DEST/db-$STAMP.dump" \
        && tar -czf "$DEST/media-$STAMP.tar.gz" -C /data media \
        && echo "[backup] $STAMP : OK" \
        || { echo "[backup] $STAMP : ÉCHEC" >&2; rm -f "$DEST/db-$STAMP.dump.tmp"; }
    find "$DEST" -type f \( -name 'db-*.dump' -o -name 'media-*.tar.gz' \) -mtime "+$KEEP_DAYS" -delete
    sleep "$INTERVAL"
done
