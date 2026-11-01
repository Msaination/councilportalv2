# Emalahleni Council Portal v2 — Development Summary

**Date:** November 1, 2026  
**Project:** NextGen DAM — SaaS Digital Asset Management Platform  
**Developer:** GitHub Copilot (Poolside: Laguna S 2.1)  
**Status:** MVP + Access Control, Profiles & Calendar Complete — Ready for Production Hardening

---

## 1. Executive Summary

Built a full-stack Digital Asset Management (DAM) platform from scratch, migrating from a legacy Phoca Download Joomla component to a modern cloud-native architecture. The system provides a complete document repository for councillors and top management with ACL-based access control, file preview/playback, social features (comments/ratings), a statistics dashboard, client share links, multi-tenant teams, granular capabilities, self-service profiles, and a meetings calendar.

### Architecture Overview

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

### Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (Turbopack), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, lucide-react, Radix UI |
| **Backend** | Django 6.1, Django REST Framework, djangorestframework-simplejwt, django-filter, django-cors-headers, python-magic |
| **Database** | PostgreSQL 15 (Docker), SQLite fallback (dev) |
| **Auth** | JWT tokens (Simple JWT) with session auth fallback |
| **Infrastructure** | Docker Compose (web, db, adminer, frontend), named volumes |

---

## 2. What Was Built Today

### Phase 1-2: Backend Foundation (Python/Django)

**6 models created** in `documents/models.py`:

1. **Category** — Recursive self-referencing tree for collections
   - ACL via `access_groups`/`access_users` M2M fields
   - `owner`, `is_published`, `ordering` fields
   - Image field for category icons

2. **StoredFile** — Asset with dual storage support
   - `StorageKind.LOCAL` or `StorageKind.EXTERNAL` (URL)
   - MIME type detection via `python-magic`
   - `filesize`, `download_count`, `is_published` fields
   - DB constraint: must have payload for its storage type

3. **Comment** — Generic FK (works for both files AND categories)
   - `is_approved` flag for moderation
   - User attribution + timestamp

4. **Rating** — 1–5 stars, one per user per object
   - `unique_together` constraint prevents duplicates
   - Upsert behavior via `update_or_create`

5. **DownloadLog** — Tracks every download (user, IP, timestamp)

6. **UploadLog** — Tracks every upload/replace (action: created/replaced)

**30+ API endpoints** — All verified working with JWT auth:

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/token/` | POST | JWT login (username, password) |
| `/api/auth/token/refresh/` | POST | Refresh access token |
| `/api/auth/me/` | GET | Current user + groups |
| `/api/auth/login/logout/` | POST | Session auth (browser) |
| `/api/auth/csrf/` | GET | CSRF cookie (session auth) |
| `/api/categories/` | GET | ACL-filtered category tree |
| `/api/categories/<slug>/` | GET | Category detail + children |
| `/api/categories/<slug>/files/` | GET | Files in category |
| `/api/files/` | GET | All visible files |
| `/api/files/<id>/` | GET | File metadata + social metrics |
| `/api/files/<id>/download/` | GET | ACL-gated download + logging |
| `/api/files/upload/` | POST | Upload new file (admin) |
| `/api/files/<id>/replace/` | POST | Replace file payload |
| `/api/files/content-types/` | GET | Resolve ContentType IDs |
| `/api/comments/` | GET/POST | List/create comments |
| `/api/ratings/` | GET/POST | List/upsert ratings |
| `/api/admin/stats/summary/` | GET | Totals + top files |
| `/api/admin/stats/downloads/` | GET | Paginated download logs |
| `/api/files/<id>/share/` | POST | Create client share link (expiry + password) |
| `/api/shared-links/` | GET/DELETE | List/revoke own share links |
| `/api/shared/<token>/` | GET (public) | Share metadata (password-gated) |
| `/api/teams/` | GET/POST | List/create workspace teams (`view_teams` capability) |
| `/api/teams/<slug>/members/` | GET/POST | Team member management |
| `/api/access/users/` | GET/POST | Superadmin: list/create users |
| `/api/access/users/<id>/` | PATCH | Capabilities or employee number (assigned editors) |
| `/api/profile/` | GET/PATCH | Own profile (avatar, cell, bio, identity) |
| `/api/profile/password/` | POST | Change own password |
| `/api/meetings/` | GET/POST | Calendar meetings (`?scope=mine`, `?date=YYYY-MM-DD`) |
| `/api/meetings/<id>/` | GET/PATCH/DELETE | Meeting detail / edit / delete |

### Phase 3: Social Layer + ACL Refinement

- **Comment ACL**: `CommentViewSet.perform_create()` validates target object exists + user can view
- **Rating upsert**: `RatingSerializer` uses `update_or_create` — verified count stays at 1 after updating
- **ACL `get_queryset`/`get_object`**: Fixed list/404 issues by returning real QuerySets and applying ACL in `get_object()`
- **`UploadLog.user`** changed to nullable (`null=True, on_delete=SET_NULL`) for system-seeded logs

### Phase 4: Frontend Shell (Next.js)

**12 files created** across `app/` and `components/`:

| File | Purpose |
|---|---|
| `lib/api.ts` | Full API client with JWT auth, CSRF handling, pagination unwrapping, typed interfaces |
| `lib/file-types.ts` | Extension → preview-kind mapping (pdf/image/audio/video/download) |
| `components/auth-provider.tsx` | React context for JWT auth (login/logout/reload/auto-refresh) |
| `components/category-tree.tsx` | Recursive collapsible category browser |
| `components/file-card.tsx` | Card view with title, type, size, rating, download button |
| `components/preview.tsx` | Polymorphic preview (PDF iframe, img, audio, video, download link) |
| `components/star-rating.tsx` | Interactive 1–5 star widget with hover + optimistic updates |
| `components/comment-list.tsx` | Comment display with user avatar + timestamp |
| `components/comment-form.tsx` | Comment submission with CSRF + error handling |
| `app/page.tsx` | Landing page with logo + Sign In button + redirect-if-authenticated |
| `app/login/page.tsx` | JWT login form |
| `app/layout.tsx` | Root layout with AuthProvider + header |

### Phase 5: Dashboard UI

**8 new files** for the dashboard experience:

| File | Purpose |
|---|---|
| `app/dashboard/layout.tsx` | Dashboard layout (sidebar + header + auth guard) |
| `app/dashboard/page.tsx` | Dashboard home with stats cards + collections |
| `app/dashboard/assets/page.tsx` | Asset management (grid/table toggle, sort, filter) |
| `app/dashboard/assets/[id]/page.tsx` | Asset detail (preview, rating, comments, download) |
| `app/dashboard/collections/page.tsx` | Collection browser with search |
| `app/dashboard/collections/[slug]/page.tsx` | Collection detail view |
| `components/app-sidebar.tsx` | Collapsible sidebar with shadcn Tooltip + logo |
| `components/app-header.tsx` | Top bar with search + user dropdown |

**6 shadcn/ui components** manually created:
- `ui/button.tsx`, `ui/card.tsx`, `ui/input.tsx`
- `ui/avatar.tsx`, `ui/dropdown-menu.tsx`, `ui/tooltip.tsx`, `ui/separator.tsx`, `ui/badge.tsx`

### Phase 6: Hardening + Seed Data

- **`seed_portal` management command** — Creates 3 roles (Councillors, TopManagement, Admin — no Public group), 4 root categories + 1 ACL-restricted subcategory, 2 sample files (local text + external URL), and a dev superuser (admin/admin123)
- **JWT authentication** added alongside session auth — `djangorestframework-simplejwt[crypto]`
- **Frontend API client** updated to use JWT Bearer tokens with auto-refresh
- **Pagination handling** — `apiFetch()` automatically unwraps DRF's `{count, next, previous, results}` format
- **Docker Compose** — Added `media` named volume for persistent uploads

### Logo Integration

- `emalahleni-logo.png` placed in `public/` folder
- Used as **favicon** (via Next.js metadata `icons`)
- Displayed in **landing page header**, **dashboard sidebar**, and **root layout header**
- Sidebar logo visible in both collapsed and expanded states

---

## 3. Infrastructure & Development Servers

Both servers are currently running:

| Service | URL | Status |
|---|---|---|
| **Next.js Frontend** | http://localhost:3000 | ✅ Running (HTTP 200) |
| **Django Backend** | http://127.0.0.1:8000 | ✅ Running (HTTP 200) |
| **Django Admin** | http://127.0.0.1:8000/admin/ | ✅ admin / admin123 |
| **JWT Token** | POST http://127.0.0.1:8000/api/auth/token/ | ✅ Working |

---

## 4. Key Design Decisions

1. **JWT over Session Auth** — Better for multi-tenant SaaS, mobile clients, and API-first design
2. **ACL at model level** — Single `can_view()`/`can_download()` helper used by all endpoints
3. **Generic FKs for comments/ratings** — Same Comment/Rating model works for files AND categories
4. **ContentType API endpoint** — Frontend resolves IDs dynamically instead of hardcoding
5. **Dynamic routes** (`export const dynamic = 'force-dynamic'`) — Required for `useParams()` in Next.js 16 with App Router
6. **No Public group** — Authenticated users see unrestricted published content; no anonymous access

---

## 5. Next Steps (Updated 1 November 2026)

### Completed: Multi-Tenancy (Accounts App)
Delivered: `Team`, `Membership`, and `UserProfile` models; team-scoped categories/files; active-workspace switching; team member management UI.

### Completed: Client Sharing
Delivered: `SharedLink` (expiry + PBKDF2 password), public `/share/<token>` page, `/dashboard/shared` management, `share_files` capability, and per-category `is_shareable` policy that blocks confidential folders.

### Priority 1: Production Docker Deployment
```bash
cd python/
docker compose up -d --build
```
- Fix the `frontend` image build (`pnpm` build-script approval for `unrs-resolver`)
- Switch from SQLite to PostgreSQL for production
- Set `DEBUG=0`, configure `ALLOWED_HOSTS`
- Add nginx for media serving with `X-Accel-Redirect`

### Priority 2: S3 Storage
- Add `django-storages` + `boto3`; swap local media for S3.

### Priority 3: CI/CD
- GitHub Actions: run the 87-test backend suite and the Next.js build on every push.

### Priority 4: Advanced Features
- Activity feed (audit trail of all actions)
- Bulk upload + ZIP extraction
- File versioning (history of replaced files)
- Search (full-text search via PostgreSQL `tsvector`)
- Real-time notifications (WebSocket or polling)

---

## 6. How to Run

### Development:
```bash
# Terminal 1: Django backend
cd python/
.venv/bin/python manage.py runserver 8000

# Terminal 2: Next.js frontend
cd frontend/
pnpm dev

# Seed data (if needed)
cd python/
.venv/bin/python manage.py seed_portal --superuser --clear
```

### Production (Docker):
```bash
cd python/
docker compose up -d --build
```

---

## 7. API Documentation

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

---

---

## 8. Progress Update — 1 November 2026

### Client sharing (shipped)
- `SharedLink` model with unique token, expiry, PBKDF2 password, soft revoke
- Public `/share/<token>` page with password gate + inline preview/download
- `/dashboard/shared` management UI (copy link, revoke)
- Gated by the `documents.share_files` capability **and** `Category.is_shareable`; existing links die immediately when a category becomes non-shareable

### Multi-tenancy (shipped)
- `accounts` app: `Team`, `Membership` (owner/admin/member), `UserProfile.active_team`
- Team FK added to `Category`/`StoredFile`; visibility requires team membership
- Team page (`/dashboard/team`) supports create, switch, add/remove members
- Uploads automatically assign the uploader's active team

### Capabilities & access control (shipped)
- Superadmin-granted Django permissions: `view_teams`, `share_files`, `edit_employee_numbers`
- `/dashboard/access` UI for creating users, toggling capabilities, editing employee numbers
- Category ACL now cascades to files; ratings are ACL-checked; comments validate targets safely
- Superadmin-only capability management; assigned editors can only change employee numbers

### Profiles, employee numbers & first-login security (shipped)
- `/dashboard/profile`: username, email, SA cell number (`0XXXXXXXXX`), bio (500 chars), avatar (≤2 MB), password change
- Unique employee number: `S`-prefixed, max 7 chars; read-only for users, editable only by superadmin/assigned editors
- New users are created with default password `Password#v2cp2026` and `must_change_password=True`
- Forced first-login change: login redirects to the profile page; all normal APIs return 403 until the password is changed

### Calendar application (shipped)
- New `calendar_app` with `Meeting` (title, description, location, start/end, team, attendees, groups, related collection/document)
- Month grid + upcoming sidebar (`/dashboard/calendar`), plus standalone `/calendar`
- **My meetings / All meetings** filter; `?date=YYYY-MM-DD` day filter
- Clickable dates → day view; clickable times → related document, collection, or meeting detail page
- Staff-only create/delete; upcoming meetings card on the dashboard home

### Quality & fixes
- **87 backend tests** passing (ACL, uploads, downloads, social, sharing, teams, capabilities, profiles, calendar)
- Fixed: local file download `JSON.parse` crash (now authenticated blob download)
- Fixed: category ACL not cascading to files
- Fixed: ratings could target invisible objects
- Fixed: missing `JsonResponse` import and unsafe comment target handling
- Fixed: calendar visibility leak for team-less attendee meetings; past-meeting detail/delete 404s
- Frontend: `tsc` clean, ESLint 0 errors; logout clears tokens and hard-reloads; top-right user menu consistent across dashboard

### Current service map
| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Dashboard | http://localhost:3000/dashboard |
| Calendar (standalone) | http://localhost:3000/calendar |
| Backend API | http://localhost:8000 |
| Django admin | http://localhost:8000/admin/ (admin / admin123) |

---

## 9. Repository & Branching

The project uses two Git repositories with matching branch models:

| Repository | Contents | Branches |
|---|---|---|
| [councilportalv2](https://github.com/Msaination/councilportalv2) | Django backend (`python/`), docs, frontend submodule pointer | `main`, `staging` |
| [councilportalv2-frontend](https://github.com/Msaination/councilportalv2-frontend) | Next.js UI (`frontend/`) | `main`, `staging` |

- `main` = production-ready; `staging` = pre-production integration.
- The parent repo pins an exact frontend commit via the submodule, so each
  parent branch fully defines its backend + UI deployment.
- Current state: parent `main`/`staging` at `b01c14a`; frontend `main`/`staging`
  at `50703f6`.

### Frontend change flow (staging)
```bash
cd frontend && git switch staging
# edit, commit, push
git push origin staging
cd .. && git add frontend && git commit -m "chore: bump frontend (staging)"
git push origin staging
```

### Promote staging to main
```bash
git -C frontend switch main
git -C frontend merge --ff-only staging
git -C frontend push origin main

git switch main
git add frontend
git commit -m "chore: bump frontend for main"
git push origin main
```

### Deploy staging
```bash
git clone --recurse-submodules -b staging \
  https://github.com/Msaination/councilportalv2.git
```

---

*Prepared by GitHub Copilot on 2026-10-20; updated 2026-11-01*