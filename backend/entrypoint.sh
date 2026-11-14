#!/bin/sh
set -e

# Attente de PostgreSQL
python - <<'PY'
import os, sys, time
import psycopg
for _ in range(60):
    try:
        psycopg.connect(
            dbname=os.environ.get("POSTGRES_DB", "daara"),
            user=os.environ.get("POSTGRES_USER", "daara"),
            password=os.environ.get("POSTGRES_PASSWORD", ""),
            host=os.environ.get("POSTGRES_HOST", "db"),
            port=os.environ.get("POSTGRES_PORT", "5432"),
            connect_timeout=3,
        ).close()
        sys.exit(0)
    except Exception:
        time.sleep(1)
print("PostgreSQL injoignable", file=sys.stderr)
sys.exit(1)
PY

# Seul le service « backend » migre (RUN_MIGRATIONS=1) pour éviter les migrations concurrentes.
if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
    python manage.py migrate --noinput
    python manage.py bootstrap_daara
fi

exec "$@"
