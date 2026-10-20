# Council Portal v2 — Digital Asset Management Platform

A full-stack Digital Asset Management (DAM) platform for municipal councils, built with a modern cloud-native architecture. Migrated from a legacy Phoca Download Joomla component.

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [API Documentation](#api-documentation)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Docker Deployment](#docker-deployment)
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
| **Asset Management** | Upload, organize into collections, preview (PDF/img/audio/video), download tracking |
| **Multi-tenancy** | Teams/workspaces with isolated asset storage |
| **ACL** | Group/user-level access control on categories and files |
| **Social** | Comments, ratings (1–5 stars), activity feeds |
| **Admin Dashboard** | Statistics dashboard, user/team management, audit trail |
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

```bash
# Django
DEBUG=True
SECRET_KEY=change-this-in-production
ALLOWED_HOSTS=localhost,127.0.0.1

# Database (PostgreSQL)
DB_NAME=council_portal
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=db
DB_PORT=5432

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:3000

# JWT
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=60
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7
```

### Frontend (`.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api
NEXT_PUBLIC_SITE_NAME=Council Portal
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

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

## Development Notes

- The `/php` directory contains the legacy Phoca Download Joomla component, used only as a reference during development. It is excluded from version control.
- Both the Django backend and Next.js frontend can run independently for local development.
- JWT authentication is the primary auth method; session auth is available as a fallback for browser-based access.
- ACL is enforced at the model level via `can_view()` and `can_download()` helpers, applied consistently across all API endpoints.

---

## License

This project is part of the Emalahleni Council Portal initiative. © 2026.
