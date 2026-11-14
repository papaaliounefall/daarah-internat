# Plateforme de gestion — Daara Internat Shaykh Aliou Fatima

Logiciel de gestion de l'établissement (Kahone, Kaolack, Sénégal) : talibés, années scolaires et classes, suivi
coranique, lecteur du Coran, présences, internat, personnel, finances, social et parrainages, stocks, visites,
cartes talibé, espace parents, portail public.

| Couche | Technologie |
|---|---|
| Frontend | React 19, TypeScript (strict), Vite, Tailwind 4, React Router, Zustand, Axios, Recharts |
| API | Django 5.2 LTS, Django REST Framework, JWT (SimpleJWT, rotation + liste noire) |
| Base de données | PostgreSQL 16 |
| Asynchrone | Redis + Celery (cartes en lot, annonces, rappels d'échéances) |
| Documents | ReportLab (PDF), arabic-reshaper + python-bidi + police Amiri |
| Production | Docker Compose, Nginx (HTTPS, en-têtes de sécurité, limitation de débit), Certbot, sauvegardes automatiques |

## Organisation

```
backend/    API Django (apps : core, accounts, academics, students, guardians, quran, memorization, attendance,
            boarding, staff, finance, social, inventory, visits, documents, notifications, audit, dashboard, public_site)
frontend/   Application React
deploy/     Nginx, sauvegarde/restauration, Let's Encrypt
docs/       Cahier des charges, architecture, déploiement ; API détaillée : backend/docs/api
```

## Démarrage en développement

```bash
docker compose -f docker-compose.dev.yml up --build
# Application : http://localhost:3000   API : http://localhost:8000/api/   Documentation API : http://localhost:8000/api/docs/
# Compte initial : directeur / ChangeMe-Dev-2026!  (changement exigé à la première connexion)
docker compose -f docker-compose.dev.yml exec backend python manage.py import_quran   # corpus coranique (réseau requis)
```

Sans Docker : `cd backend && python -m venv .venv && pip install -r requirements/dev.txt`, puis
`DB_ENGINE=sqlite python manage.py migrate --settings=config.settings.dev` ; `cd frontend && npm install && npm run dev`.

## Tests

```bash
cd backend && python -m pytest          # API : droits par rôle, isolation entre établissements, règles métier
cd frontend && npm run lint && npm test # TypeScript strict + Vitest
```

## Production

Voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (HTTPS, sauvegardes, restauration, mises à jour).
Architecture, modèle de données et matrice des droits : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Cahier des charges : [docs/cahier-des-charges/CAHIER_DES_CHARGES.md](docs/cahier-des-charges/CAHIER_DES_CHARGES.md).
