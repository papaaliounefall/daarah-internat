# syntax=docker/dockerfile:1
# Contexte de build = racine du dépôt (voir docker-compose.yml).

# --- Construction du frontend ---
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY frontend/ .
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

# --- Nginx : application statique + proxy API + HTTPS ---
FROM nginx:1.27-alpine
RUN apk add --no-cache openssl
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/nginx/proxy_params.conf /etc/nginx/proxy_params.conf
COPY deploy/nginx/security_headers.conf /etc/nginx/security_headers.conf
COPY deploy/nginx/40-selfsigned.sh /docker-entrypoint.d/40-selfsigned.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-selfsigned.sh && chmod +x /docker-entrypoint.d/40-selfsigned.sh
# Le template utilise des variables nginx ($host…) : seul ${DOMAIN} doit être substitué.
ENV NGINX_ENVSUBST_FILTER=DOMAIN
