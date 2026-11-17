# ECOP — Emalahleni Council Portal

A full-stack council portal and digital asset management (DAM) platform for municipal councils, built with a modern cloud-native architecture. Migrated from a legacy Phoca Download Joomla component.

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [API Documentation](#api-documentation)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Docker Deployment](#docker-deployment)
- [Branching & Deployment](#branching--deployment)
- [License](#license)

---

## Architecture

```
┌──────────────┐        ┌────────────────────┐        ┌──────────────┐
│  Next.js 16  │  HTTP  │  Django 6 + DRF    │  SQL   │  PostgreSQL  │
│  (App Router │        │  (JWT Auth + API)  │        │  (Docker)    │
│   + Actions) │        │                    │        │              │
│ localhost:3000│◀──────▶│  localhost:8000    │◀──────▶│  (db)        │
└──────────────┘   JWT  └────────────────────┘        └──────────────┘
       │                        │
       │                        └─ media volume (uploads persist)
       │
       └─ S3-ready storage backend (swap local → S3)
```

## Features

| Category | Features |
|---|---|
| **Asset Management** | Upload, organize resources into categories, preview (PDF/img/audio/video), download tracking |
| **Multi-tenancy** | Committees/workspaces with isolated resource storage |
| **ACL** | Group/user-level access control on categories and files |
| **Social** | Comments, ratings (1–5 stars), activity feeds |
| **Admin Dashboard** | Statistics dashboard, user/committee management, audit trail |
| **Client Sharing** | Time-limited, password-protected share links |
| **Authentication** | JWT tokens (Simple JWT) with session auth fallback |

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (Turbopack), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, lucide-react, Radix UI |
| **Backend** | Django 6.1, Django REST Framework, djangorestframework-simplejwt, django-filter, django-cors-headers, python-magic |
| **Database** | PostgreSQL 15 (Docker), SQLite fallback (dev) |
| **Auth** | JWT tokens (Simple JWT) with session auth fallback |
| **Infrastructure** | Docker Compose (web, db, adminer, frontend), named volumes |

---

## Getting Started

### Prerequisites

- **Python** 3.12+
- **Node.js** 20+
- **pnpm** (for frontend)
- **Docker & Docker Compose** (for production)

### Development Setup

#### 1. Clone the repository

```bash
git clone https://github.com/Msaination/councilportalv2.git
cd councilportalv2
```

#### 2. Backend (Python/Django)

```bash
cd python/

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
# or: .venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Seed initial data (creates superuser admin/admin123)
python manage.py seed_portal --superuser --clear

# Start the development server
python manage.py runserver 8000
```

**Server:** http://127.0.0.1:8000  
**Admin:** http://127.0.0.1:8000/admin/ (admin / admin123)

#### 3. Frontend (Next.js)

```bash
# From project root
cd frontend/
pnpm install
pnpm dev
```

**App:** http://localhost:3000

---

## API Documentation

### Authentication (JWT)

```bash
# Login
curl -X POST http://127.0.0.1:8000/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Response: {"refresh": "...", "access": "..."}

# Use token
curl http://127.0.0.1:8000/api/categories/ \
  -H "Authorization: Bearer <access_token>"
```

### Key Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/token/` | POST | JWT login (username, password) |
| `/api/auth/token/refresh/` | POST | Refresh access token |
| `/api/auth/me/` | GET | Current user + groups |
| `/api/categories/` | GET | ACL-filtered category tree |
| `/api/categories/<slug>/` | GET | Category detail + children |
| `/api/categories/<slug>/files/` | GET | Files in category |
| `/api/files/` | GET | All visible files |
| `/api/files/<id>/` | GET | File metadata + social metrics |
| `/api/files/<id>/download/` | GET | ACL-gated download + logging |
| `/api/files/upload/` | POST | Upload new file |
| `/api/files/<id>/replace/` | POST | Replace file payload |
| `/api/files/<id>/share/` | POST | Create client share link (expiry + optional password) |
| `/api/shared-links/` | GET/DELETE | List/revoke your share links |
| `/api/shared/<token>/` | GET (public) | Share metadata (password-gated) |
| `/api/shared/<token>/download/` | GET (public) | Public download/preview + logging |
| `/api/teams/` | GET/POST | List your committees / create a committee |
| `/api/teams/<slug>/` | GET/PATCH/DELETE | Committee detail, rename, delete (owner) |
| `/api/teams/<slug>/members/` | GET/POST | List / add committee members |
| `/api/teams/<slug>/members/<user_id>/` | DELETE | Remove a committee member |
| `/api/teams/<slug>/switch/` | POST | Set the active committee workspace |
| `/api/access/users/` | GET/POST | List users / create user (superadmin, default password) |
| `/api/access/users/<id>/` | PATCH | Superadmin: capabilities; assigned editors: employee number |
| `/api/profile/` | GET/PATCH | Own profile (username, email, employee no., cell, bio, avatar) |
| `/api/profile/password/` | POST | Change own password (clears first-login requirement) |
| `/api/meetings/` | GET/POST | List meetings (`?scope=mine`, `?date=YYYY-MM-DD`, `?include_past=1`) / schedule (staff) |
| `/api/meetings/<id>/` | GET/PATCH/DELETE | Meeting detail / edit / delete (staff) |
| `/api/comments/` | GET/POST | List/create comments |
| `/api/ratings/` | GET/POST | List/upsert ratings |
| `/api/admin/stats/summary/` | GET | Totals + top files |
| `/api/admin/stats/downloads/` | GET | Paginated download logs |

### Upload (multipart)

```bash
curl -X POST http://127.0.0.1:8000/api/files/upload/ \
  -H "Authorization: Bearer <token>" \
  -F "file=@document.pdf" \
  -F "title=Annual Report" \
  -F "slug=annual-report-2026" \
  -F "category=policies" \
  -F "description=2026 financial report"
```

See [API Documentation](DAM_PROJECT_SUMMARY.md#7-api-documentation) for full details.

---

## Project Structure

```
councilportalv2/
├── frontend/                 # Next.js 16 frontend app
│   ├── app/                  # App Router pages
│   │   ├── (auth)/           # Login, landing pages
│   │   ├── dashboard/        # Admin dashboard (layout, pages)
│   │   ├── categories/       # Category browser ([slug])
│   │   └── files/            # File detail ([id])
│   ├── components/           # React components
│   │   ├── ui/               # shadcn/ui components
│   │   ├── auth-provider.tsx
│   │   ├── app-sidebar.tsx
│   │   ├── app-header.tsx
│   │   ├── category-tree.tsx
│   │   ├── file-card.tsx
│   │   ├── preview.tsx
│   │   ├── star-rating.tsx
│   │   ├── comment-form.tsx
│   │   └── comment-list.tsx
│   ├── lib/
│   │   ├── api.ts            # API client (JWT, CSRF, pagination)
│   │   ├── file-types.ts     # Extension → preview mapping
│   │   └── utils.ts          # Utility helpers
│   ├── public/               # Static assets (logo, favicons)
│   ├── styles/               # Tailwind CSS globals
│   ├── Dockerfile
│   └── package.json
├── python/                   # Django 6 backend
│   ├── council_portal/       # Project settings
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── documents/            # Main app
│   │   ├── models.py         # Category, StoredFile, Comment, Rating, logs
│   │   ├── views.py          # DRF ViewSets
│   │   ├── serializers.py
│   │   ├── urls.py
│   │   ├── admin.py
│   │   └── management/
│   │       └── commands/seed_portal.py
│   ├── media/                # Uploaded files (Git-ignored)
│   ├── db.sqlite3            # SQLite DB (Git-ignored)
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── requirements.txt
│   └── manage.py
├── php/                      # Legacy Phoca Download reference (NOT tracked by git)
├── .gitignore
└── README.md
```

---

## Environment Variables

### Backend (`python/.env`)

Copy `python/.env.example` to `python/.env`; Django loads it automatically.
**Real environment variables always win**, so on a server prefer Docker Compose
`env_file`, systemd `EnvironmentFile`, or Windows `setx`.

```bash
# Django
DJANGO_DEBUG=1
DJANGO_SECRET_KEY=change-this-in-production
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

# Database — leave POSTGRES_HOST blank for the SQLite dev fallback
POSTGRES_DB=council_portal
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=db
POSTGRES_PORT=5432

# CORS — comma-separated browser origins; include the deployed frontend URL
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Supabase complaints gateway — server-only secret; never expose to frontend
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
# Legacy Supabase key name is also supported:
# SUPABASE_SERVICE_ROLE_KEY=...
```

`python/.env` is the only file-based source for database and Supabase settings.
Actual process environment variables (Docker, systemd, or Windows `setx`)
override values in the file. The optional `authentik/.env` fallback is only for
local OIDC development. `/CMS` is an ignored reference directory and is not
read by Django.

### Frontend (`.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SITE_NAME=ECOP
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`NEXT_PUBLIC_API_URL` is the Django server origin only; do not append `/api`.
The frontend adds API paths itself. When ECOP is opened from another machine,
loopback API URLs are resolved to the frontend's host and Django's configured
port (default `8098`; override with `NEXT_PUBLIC_API_PORT`).

### Windows LAN server

For the current IntranetApp server (`172.20.17.16`), configure `python/.env`:

```dotenv
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,172.20.17.16,IntranetApp
CORS_ALLOWED_ORIGINS=http://172.20.17.16:8089,http://localhost:3000,http://127.0.0.1:3000
```

Set `NEXT_PUBLIC_API_URL=http://172.20.17.16:8098` in the frontend's ignored
`.env.local` before building. Run Django bound to the LAN interface and the
frontend on the expected port:

```powershell
# API
python manage.py runserver 0.0.0.0:8098

# Frontend (from the frontend directory)
pnpm exec next dev --hostname 0.0.0.0 --port 8089
```

Allow inbound TCP ports `8089` and `8098` in Windows Firewall for the trusted
LAN. `runserver` and `next dev` are for intranet testing; use production-grade
server processes behind IIS/reverse proxy for a public production deployment.

---

## Docker Deployment

```bash
cd python/
docker compose up -d --build
```

Services:
| Service | URL | Description |
|---|---|---|
| **Web** | http://localhost:8000 | Django backend |
| **Frontend** | http://localhost:3000 | Next.js frontend |
| **DB** | localhost:5433 | PostgreSQL 15 |
| **Adminer** | http://localhost:8080 | Database admin UI |

---

## Branching & Deployment

The project spans **two Git repositories**:

| Repository | Contents |
|---|---|
| `councilportalv2` | Django backend (`python/`), docs, and the `frontend` submodule pointer |
| `councilportalv2-frontend` | Next.js UI (`frontend/`) |

Both repositories use the same branch model:

| Branch | Purpose |
|---|---|
| `main` | Production-ready code |
| `staging` | Pre-production / integration testing |

The parent repo pins an **exact frontend commit** through the submodule, so each parent branch controls precisely which UI commit it deploys. GitHub Actions validates Django changes in the parent repository and lint, type-checks, and builds the frontend in the frontend repository. Both CI workflows run for pushes and pull requests targeting `staging` or `main`.

### Change flow (staging)
```bash
git switch staging
git pull --ff-only origin staging
git switch -c feature/short-description
git submodule update --init --recursive

cd frontend
git switch staging
git pull --ff-only origin staging
git switch -c feature/short-description
# edit and commit the UI changes
git push -u origin feature/short-description
# Open a pull request from the frontend feature branch to staging
# Merge it after frontend CI passes

cd ..
# After the frontend PR merges, refresh the submodule to the new staging commit
git -C frontend switch staging
git -C frontend pull --ff-only origin staging
git add frontend
# Commit the updated submodule pointer with any backend changes
git commit -m "chore: update frontend submodule"
git push -u origin feature/short-description
# Open a pull request from the parent feature branch to staging
# Merge it after backend CI passes
```

### Promote staging to main
```bash
# In GitHub, open and merge a staging-to-main pull request in the frontend repo
git -C frontend fetch origin
git -C frontend switch main
git -C frontend pull --ff-only origin main

# Update the parent staging branch through a feature branch
git switch staging
git pull --ff-only origin staging
git switch -c chore/promote-frontend
git -C frontend checkout main
git -C frontend pull --ff-only origin main
git add frontend
git commit -m "chore: update frontend submodule"
git push -u origin chore/promote-frontend
# Open and merge a parent-repository PR from the feature branch to staging
# Then open and merge a staging-to-main PR after backend CI passes
```

Protect `staging` and `main` in both GitHub repositories: require pull requests, require the `Backend CI / test` or `Frontend CI / validate` check as appropriate, and disallow force pushes. Use `staging` for integration and deploy it to a test environment; promote to `main` only after acceptance. Configure deployment jobs separately once the hosting target and required secrets are defined.

### Deploy staging
```bash
git clone --recurse-submodules -b staging \
  https://github.com/Msaination/councilportalv2.git

# Existing clone:
git switch staging
git submodule update --init --recursive
```

---

## Development Notes

- The `/php` directory contains the legacy Phoca Download Joomla component, used only as a reference during development. It is excluded from version control.
- Both the Django backend and Next.js frontend can run independently for local development.
- JWT authentication is the primary auth method; session auth is available as a fallback for browser-based access.
- ACL is enforced at the model level via `can_view()` and `can_download()` helpers, applied consistently across all API endpoints.

---

## License

This project is part of the Emalahleni Council Portal initiative. © 2026.
