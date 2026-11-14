# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod

# libpq pour psycopg ; curl pour les healthchecks
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements/base.txt requirements/base.txt
RUN pip install -r requirements/base.txt

COPY . .

# Utilisateur sans privilèges
RUN useradd --system --uid 10001 --home /app daara \
    && mkdir -p /data/media /app/staticfiles \
    && sed -i 's/\r$//' /app/entrypoint.sh \
    && chown -R daara:daara /app /data \
    && chmod +x /app/entrypoint.sh

USER daara

# Fichiers statiques de l'admin Django (clé factice : uniquement pour collectstatic)
RUN DJANGO_SECRET_KEY=build-only-not-a-secret python manage.py collectstatic --noinput

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60", "--access-logfile", "-"]
