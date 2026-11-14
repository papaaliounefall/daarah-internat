#!/bin/sh
# Obtient un vrai certificat HTTPS (Let's Encrypt) pour DOMAIN, puis recharge Nginx.
# Prérequis : le DNS de DOMAIN pointe vers ce serveur, les ports 80 et 443 sont ouverts.
# Usage : DOMAIN=daara.example.sn EMAIL=admin@example.sn sh deploy/init-letsencrypt.sh
set -e
: "${DOMAIN:?Définir DOMAIN}"
: "${EMAIL:?Définir EMAIL}"

# Supprimer le certificat auto-signé temporaire pour laisser certbot écrire le vrai.
docker compose run --rm --entrypoint "rm -rf /etc/letsencrypt/live/${DOMAIN} /etc/letsencrypt/archive/${DOMAIN} /etc/letsencrypt/renewal/${DOMAIN}.conf" certbot

docker compose run --rm --entrypoint "certbot certonly --webroot -w /var/www/certbot \
    -d ${DOMAIN} --email ${EMAIL} --agree-tos --no-eff-email --non-interactive" certbot

docker compose exec nginx nginx -s reload
echo "Certificat installé pour ${DOMAIN}. Le renouvellement est automatique (service certbot)."
