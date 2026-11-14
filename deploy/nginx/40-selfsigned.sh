#!/bin/sh
# Démarrage de Nginx sans certificat réel : génère un certificat auto-signé TEMPORAIRE
# pour ${DOMAIN}. Remplacé par Let's Encrypt via deploy/init-letsencrypt.sh.
set -e
DIR="/etc/nginx/certs/live/${DOMAIN}"
if [ ! -f "$DIR/fullchain.pem" ]; then
    echo "[nginx] Aucun certificat pour ${DOMAIN} : génération d'un certificat auto-signé temporaire."
    mkdir -p "$DIR"
    openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
        -keyout "$DIR/privkey.pem" -out "$DIR/fullchain.pem" \
        -subj "/CN=${DOMAIN}" >/dev/null 2>&1
fi
