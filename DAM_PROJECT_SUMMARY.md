# ECOP — Emalahleni Council Portal — Development Summary

**Date:** 25 November 2026  
**Project:** ECOP — Emalahleni Council Portal  
**Developer:** GitHub Copilot (Poolside: Laguna S 2.1)  
**Status:** MVP + Access Control, Profiles, Calendar, Mobile UI & Councillor Identity — Ready for Production Hardening

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
| **Auth** | JWT tokens (Simple JWT) with session auth fallback; Authentik OIDC integration present but **disabled** (§6.6) |
| **Infrastructure** | Docker Compose (web, db, adminer, frontend), named volumes; PM2 for local process supervision (config gitignored) |

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

## 5. Next Steps (Updated 25 November 2026)

### Completed: Multi-Tenancy (Accounts App)
Delivered: `Team`, `Membership`, and `UserProfile` models; team-scoped categories/files; active-workspace switching; team member management UI.

### Completed: Client Sharing
Delivered: `SharedLink` (expiry + PBKDF2 password), public `/share/<token>` page, `/dashboard/shared` management, `share_files` capability, and per-category `is_shareable` policy that blocks confidential folders.

### Completed: Councillor roster import (see §9)
Delivered: gazette identity fields, unique `cell_number` / `employee_number` / `email`, `import_councillors`, `backfill_identity_data`, and `tmp/MP312.csv` (71 councillors).

### Completed: SSO gating (see §9)
Delivered: public `GET /api/auth/config/`; the login page shows the SSO button only when OIDC is configured. Authentik is deferred, not removed.

### Priority 1: Seed the councillor roster
```bash
cp python/db.sqlite3 python/db.sqlite3.pre-seed
cd python
python manage.py import_councillors ../tmp/MP312.csv --group Councillors --dry-run
python manage.py import_councillors ../tmp/MP312.csv --group Councillors
```
- 71 users, forced password change on first login
- Emails absent — to be joined from an HR roster later
- Authentik provisioning is inactive until `AUTHENTIK_ADMIN_TOKEN` is set

### Priority 2: Production Docker Deployment
```bash
cd python/
docker compose up -d --build
```
- Fix the `frontend` image build (`pnpm` build-script approval for `unrs-resolver`)
- Switch from SQLite to PostgreSQL for production
- Set `DEBUG=0`, configure `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS`
- Add nginx for media serving with `X-Accel-Redirect`
- Supply `ecosystem.config.js` per environment — it is gitignored on purpose

### Priority 3: S3 Storage
- Add `django-storages` + `boto3`; swap local media for S3.
- Prerequisite for Meeting Archive immutability (`PORTAL_PLAN.md` §7.4.6)

### Priority 4: Meeting Archive
- Per-meeting permanent resource folders — design agreed in `PORTAL_PLAN.md` §7
- v1: `archive_category` + `is_archive`, folder on meeting creation, archive link on past meetings, deletion guards, **ACL copy**

### Priority 5: CI/CD
- GitHub Actions: run the backend suite and the Next.js build on every push.

### Priority 6: Advanced Features
- Activity feed (audit trail of all actions)
- Bulk upload + ZIP extraction
- File versioning (history of replaced files)
- Search (full-text search via PostgreSQL `tsvector`)
- Real-time notifications (WebSocket or polling)
- Complaint write-back to the CMS (`PORTAL_PLAN.md` §6.3 Phase 4)
- Per-reply author names in the complaint thread (needs the correct PostgREST relation)

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
- New users are created with default password `#ECOP26-31` (from `settings.DEFAULT_NEW_USER_PASSWORD`, overridable per environment) and `must_change_password=True`. `email` and `employee_number` are now optional at creation so gazetted councillors can be onboarded without HR data.
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
| Auth config (public) | http://localhost:8000/api/auth/config/ |

> Ports drift in practice: the frontend reads `NEXT_PUBLIC_API_PORT` from
> `frontend/.env.local`, and Django has been run on both 8000 and 8001 during
> debugging. Confirm with `lsof -i :8000` before assuming.

---

## 9. Progress Update — 25 November 2026

### Resource & file UX (shipped)
- Naming aligned across UI and admin: **Resource** (was Collection/Documents), **File** (was Asset), **Subfolder** (was Subcategory)
- Multi-file upload with drag-and-drop; subfolder creation from any category page
- Multi-select with bulk delete; per-file delete on both grid and table views
- `Category.total_file_count` — parent folders now report files held in their subfolders instead of `0`
- Fixed: bulk delete was deleting the parent category; the header button now calls `removeFiles`

### Mobile-first UI (shipped)
- Sidebar became an off-canvas drawer below `md` — hamburger in the header, overlay, close button, auto-close on nav click; inline on desktop
- `AppHeader.onMenuClick` is optional so the standalone `/calendar` page still renders
- Complaint cards collapse to one column on phones, two from `sm`
- Dashboard **Upcoming meetings** card redesigned: date chips, relative-day labels (`Today` / `Tomorrow` / `In 3 days`), `Next` and `Mine` badges, skeleton and empty states

### Calendar redesign (shipped)
- Days **with meetings** are visually distinct: primary tint, bold day number, count badge on mobile, `Includes yours` stronger tint, and a legend explaining all three states
- Compact mobile grid plus a per-day agenda panel (the month grid is too small for detail on a phone)
- Segmented `My meetings / All meetings` control replaces two competing buttons
- Day-detail page (`/dashboard/calendar/[date]`) restyled to match: date chip, `‹ Today ›` day navigation, time rail, attendee pills
- Fixed: `#meeting-<id>` deep links never scrolled — meetings arrive client-side, so the anchor is now replayed after the data lands

### Complaint reply thread (shipped)
- `ReportReplySerializer` + `GET /api/complaints/<id>/replies/` — an `@action` on a `ComplaintViewSet` registered with a `DefaultRouter` (a plain `path()` 404s)
- `client.py::fetch_replies_for_complaint()` reads `report_replies` ordered `created_at asc`
- Accordion chat view: staff replies right-aligned with primary branding, others left-aligned
- Complaint cards now show icon pills for reference / department / issue type / priority / area / channel
- Open: `author_name` resolves to `Staff` / `User`; the CMS exposes no per-reply author in the current `select`

### Councillor identity & unique data (shipped)
- New `UserProfile` fields from the MP312 gazette: `political_party`, `representation` (ward|pr), `pr_seat`, `ward_code`
- `CheckConstraint` blocks a PR seat number on a ward councillor
- Party is a **plain column, never a Django Group** — groups are content-role ACL carriers
- `cell_number` and `employee_number` are unique; `email` is uniquely indexed case-insensitively via a **partial index** (`WHERE email <> ''`)
- Absence is stored as `NULL`, not `''` — SQL treats NULLs as distinct, so any number of users may omit these fields
- `email`, `cell_number` and `employee_number` are now **optional at user creation**
- `manage.py import_councillors` — idempotent import of the gazette CSV (`--dry-run`, `--update-existing`, `--group`)
- `manage.py backfill_identity_data` — fills NULL identity fields with unique placeholders; `--username-from-cell` requires `--only`

### Roster data
- `tmp/MP312.csv`: **71 councillors** parsed from the gazette — 36 ward, 35 PR, wards **1–36 contiguous**
- Ward numbers align with `UserProfile.ward`, the join key to complaints (`PORTAL_PLAN.md` §6.7)

### SSO gating (shipped)
- New public `GET /api/auth/config/` returns `{sso_enabled, sso_login_url}`
- The login page shows **Continue with Council SSO** only when OIDC is actually configured
- Re-enabling later needs two env vars and a restart — **no frontend rebuild**
- Authentik code retained; provisioning already no-ops when the token is absent

### Infrastructure
- PM2 config (`ecosystem.config.js`, `python/start_django.sh`) is now **gitignored** — each environment supplies its own
  - PM2 cannot execute script paths containing spaces; the launcher lives at a space-free path
- `.gitignore` also covers `ecosystem.config.*.js` and `.pm2/`

### Quality
- **57 backend tests** passing (was 87 across all apps; accounts suite grew to 57)
- New tests: auth config states, cell/email uniqueness, re-saving your own values, blank values coexisting as `NULL`
- Frontend `pnpm build` and `pnpm lint` clean
- Fixed: a browser extension injecting attributes onto `<html>` caused a hydration warning on every route — resolved with scoped `suppressHydrationWarning`

---

## 10. Repository & Branching

The project uses two Git repositories with matching branch models:

| Repository | Contents | Branches |
|---|---|---|
| [councilportalv2](https://github.com/Msaination/councilportalv2) | Django backend (`python/`), docs, frontend submodule pointer | `main`, `staging` |
| [councilportalv2-frontend](https://github.com/Msaination/councilportalv2-frontend) | Next.js UI (`frontend/`) | `main`, `staging` |

- `main` = production-ready; `staging` = pre-production integration.
- The parent repo pins an exact frontend commit via the submodule, so each
  parent branch fully defines its backend + UI deployment.
- Read the live pin with `git submodule status` — a hash written into a document
  goes stale on every frontend commit. Pushing a frontend commit does **not**
  move the parent pointer; that needs a separate `git add frontend && git commit`.
- PM2 config is intentionally **not** committed (see §9). Each environment
  supplies its own `ecosystem.config.js`.

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