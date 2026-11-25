# ECOP — Emalahleni Council Portal

A cloud-native Digital Asset Management solution: **Create once, reimagine everywhere.**

**Stack**: React Next.js (Server Actions + Turbopack) · Django REST Framework (JWT) · PostgreSQL · Shadcn UI · Tailwind CSS · Docker

**Last updated:** 25 November 2026

---

## Architecture

```
┌──────────────┐        ┌────────────────────┐        ┌──────────────┐
│  Next.js 16  │  HTTP  │  Django 6 + DRF    │  SQL   │  PostgreSQL  │
│  (App Router │        │  (JWT Auth + API)  │        │  (Docker)    │
│   + Actions) │        │                    │        │              │
│ localhost:300│◀──────▶│  localhost:8000    │◀──────▶│  (db + pgAdmin)│
└──────────────┘   JWT  └────────────────────┘        └──────────────┘
       │                        │
       │                        └─ media volume (uploads persist)
       │
       └─ S3-ready storage backend (swap local → S3)
```

## Core Features

| Category | Features |
|---|---|
| **Asset Management** | Multi-file upload + drag-drop, subfolders, bulk select/delete, preview (PDF/img/audio/video), download tracking, **recursive file counts** on parent folders |
| **Multi-tenancy** | Teams/workspaces with isolated asset storage |
| **Client Sharing** | Time-limited, password-protected share links |
| **Social** | Comments, ratings (1–5 stars), activity feeds |
| **Profiles** | Self-service username, email, SA cell number, avatar, bio, password change |
| **Calendar** | Meetings month view with highlighted meeting days, My/All filter, day drill-down, links to collections/documents |
| **Complaints** | Ward-scoped complaint list from the CMS gateway, status/priority chips, **collapsible reply thread** (chat view) |
| **Access control** | Superadmin-granted capabilities, employee numbers, forced first-login password change |
| **Data Protection** | RBAC, audit logs, file encryption at rest (planned) |
| **Admin Panel** | Statistics dashboard, user/team management, audit trail |
| **Meeting Archive** | Per-meeting permanent resource folder (`Archive/<year>/<meeting>/`) — **planned, see §7** |
| **Responsive UI** | Mobile-first: off-canvas nav drawer, compact calendar grid + day agenda, stacked complaint cards |

---

## Access Model — Accounts, Authentication & Authorization

Three separate questions, three separate layers. Keep them separate or the system becomes confusing:

- **Authentication** = *who you are* (login, JWT tokens).
- **Accounts / tenancy** = *where you belong* (teams, membership, active workspace).
- **Authorization** = *what you may do* (capabilities, folder ACLs, team roles).

```
Login (AuthN) → Identity (User)
                    │
        ┌───────────┴────────────┐
        │                        │
  Accounts/tenancy         Authorization
  (where you work)         (what you can do)
  Team + Membership        ├─ Capabilities (feature switches)
  UserProfile.active_team  ├─ Team membership (data partition)
                           ├─ Category ACL (folder access)
                           └─ Team role (team admin only)
```

### The four authorization layers

| Concept | Question it answers | Implemented by | Configured in |
|---|---|---|---|
| **Authentication** | "Who is this request?" | SimpleJWT + session auth, `IsAuthenticated` | `/login`, `frontend/lib/api.ts` |
| **Accounts / tenancy** | "Which workspace do I belong to?" | `Team`, `Membership`, `UserProfile` | `/dashboard/team`, `python/accounts/models.py` |
| **Capabilities** | "Which *features* may I use?" | Django permissions `accounts.view_teams`, `documents.share_files`, `accounts.edit_employee_numbers`; `manage_access` = superuser | `/dashboard/access`, Django admin |
| **Content ACL** | "Which *folders/assets* may I see?" | `Category.access_groups/access_users`, per-file equivalents, `Category.is_shareable` | Django admin → Categories/Files |
| **Team role** | "May I administer this team?" | `Membership.role` = owner / admin / member | `/dashboard/team` |
| **Platform admin** | "May I do anything?" | `is_superuser` (bypass), `is_staff` (stats) | Django admin |

**Key separation:** Django **Groups** ("Councillors", "TopManagement") are *content roles* used only by the Category ACL. **Teams** are *data partitions*. A group never grants team access, and a team role never grants extra folder access.

### Decision order (single source of truth)

Every category/file read in `python/documents/models.py` runs:

```
1. superuser?                  → allow
2. is_published?               → else deny
3. object.team is set?         → user must be a member of that team
4. user whitelisted on object? → allow
5. object has access_groups?   → user must be in ≥1 of them
6. otherwise                   → allow (all members of the team)
```

Then:

| Action | Extra rule |
|---|---|
| **View/download file** | file ACL **and** its category ACL must both pass (cascade) |
| **Create share link** | `share_files` capability **and** `category.is_shareable=True` **and** view access |
| **Public share link** | token + optional password — intentionally bypasses login/ACL, so the gates above matter |
| **View Teams** | `view_teams` capability |
| **Manage team members** | superuser, or `owner`/`admin` membership |
| **Manage capabilities** | superuser only |

Effective rules:

```
can_view  = superuser OR (published AND in_team AND folder_acl AND file_acl)
can_share = (superuser OR share_files) AND category.is_shareable AND can_view
can_admin = superuser OR membership.role ∈ {owner, admin}
```

### Worked example

Setup: Team **Emalahleni Council**; groups `Councillors`, `Councillors-Finance`; folder
`Council Meetings/Annexures` limited to `Councillors-Finance` with `is_shareable=False`.

| Step | alice (Finance group) | bob (Councillors) | carol (other team) |
|---|---|---|---|
| Authenticated | ✅ | ✅ | ✅ |
| Published | ✅ | ✅ | ✅ |
| Team member | ✅ | ✅ | ❌ → **404** |
| Category ACL | ✅ | ❌ → **404** | — |
| Result | **sees it** | **404** | **404** |

alice's attempt to create a share link → **403**, even with `share_files`, because the category is not shareable.

### Modelling subgroups

Django groups are **flat** — there is no native nesting. Use:

- **Folder hierarchy** → the Category tree (`Council Meetings > Annexures > 2026 Budget`).
- **Role hierarchy** → separate flat groups (`Councillors`, `Councillors-Finance`, `Councillors-Finance-Budget`).
- **Access inheritance** → grant groups on the highest folder possible; the cascade reaches files. Add users to every group whose access they need.
- A true nested-group model would require a new `GroupHierarchy` model — only if committees outgrow flat groups.

Rule of thumb: **hierarchy lives in the folder tree, not in the group tree.**

### Who configures what

| Task | Who | Where |
|---|---|---|
| Create users (with employee number + default password) | Superadmin | `/dashboard/access` |
| Edit employee numbers | Superadmin or users granted `edit_employee_numbers` | `/dashboard/access` |
| Create users/groups, assign users to groups | Superadmin | Django admin |
| Grant `view_teams` / `share_files` | Superadmin | `/dashboard/access` |
| Create teams, add/remove members, switch workspace | Superadmin, team owner/admin | `/dashboard/team` |
| Set folder visibility, mark confidential (`is_shareable`) | Superadmin | Django admin → Categories |
| Create share links for non-confidential assets | Anyone with `share_files` | Asset detail page |

### Caveats

1. **`active_team` is a default, not a restriction.** Reads use the union of a user's team memberships; uploads use the active team. To enforce "one workspace at a time", compare against `get_active_team(user)` in `_can_view`.
2. **Legacy `team = NULL` content is visible to every authenticated user** — assign existing content to a team for full isolation.
3. **No ACL on a category = visible to all members of that team.**
4. **Individual whitelist (`access_users`) beats group restriction.**
5. **Share links are bearer tokens** — revoke them from `/dashboard/shared`; disabling `is_shareable` kills existing links immediately.
6. **`is_staff` sees global statistics; `is_superuser` bypasses ACL and manages access** — keep the two distinct.

### Rules that keep it coherent

1. **Teams partition data** — never use a team to express a role.
2. **Groups express content roles** — never use a group to grant features.
3. **Capabilities express features** — never encode them in team roles or folder ACLs.
4. **Folder ACL expresses sensitivity** — grant at the highest folder, mark confidential folders non-shareable.

---

## Current Status: MVP Core Complete

### ✅ Phase 1-8 (ECOP Foundation)
All 8 phases complete. The existing `documents` app (Category, StoredFile, Comment, Rating, DownloadLog, UploadLog) is the perfect foundation for DAM assets.

---

## Current Status: MVP Complete ✅

All 8 phases + dashboard UI complete. Full stack running and verified.

### Completed Deliverables

| Phase | Scope | Status |
|---|---|---|
| 1-8 (Backend) | Django app, models, API, JWT auth, ACL, seeding | ✅ Complete |
| 5 (Frontend Shell) | Pages, components, auth, preview | ✅ Complete |
| 6 (Preview Polish) | Content-type resolution, comments fetch | ✅ Complete |
| 7 (Admin Stats) | Stats endpoints + dashboard home | ✅ Complete |
| 8 (Hardening) | JWT auth, seed_portal command, Docker media | ✅ Complete |
| Client sharing | `SharedLink` (expiry + password), public share page, `/dashboard/shared` | ✅ Complete |
| Multi-tenancy | `accounts` app: Team/Membership/UserProfile, team-scoped assets, `/dashboard/team` | ✅ Complete |
| Capabilities | Superadmin grants `view_teams` / `share_files`; per-category sharing policy (`is_shareable`) blocks confidential folders | ✅ Complete |
| User profiles | Self-service username, email, SA cell number, bio, avatar upload, password change | ✅ Complete |
| Employee numbers | Unique `S`-prefixed (7 chars), editable only by superadmin/assigned editors; new users get default password + forced first-login change | ✅ Complete |
| Calendar | Meetings month view + sticky upcoming sidebar; `/dashboard/calendar` and standalone `/calendar`; My/All filter; clickable dates → day view; meeting times link to related collection/document/meeting; staff CRUD | ✅ Complete |
| Tests | 87 backend tests at MVP; accounts suite alone is now 57 (uniqueness, auth config, forced password change) | ✅ Complete |
| Dashboard UI | Sidebar, header, asset/collection pages | ✅ Complete |
| Resource rename | "Collection"/"Documents" → **Resource**; "Asset" → **File**; subcategories → **Subfolders**; consistent across UI + admin | ✅ Complete |
| Recursive file counts | `Category.total_file_count` — parent folders now report files held in their subfolders instead of `0` | ✅ Complete |
| Mobile-first navigation | Off-canvas drawer under `md`, hamburger in header, overlay + close button, auto-close on nav click; inline sidebar on desktop | ✅ Complete |
| Calendar redesign | Highlighted meeting days (tint + bold number + count badge + legend), compact mobile grid, per-day agenda panel, day-detail page with time rail and working `#meeting-<id>` deep links | ✅ Complete |
| Complaint replies | `report_replies` fetched via the gateway; accordion chat view with `from_staff` styling and author attribution | ✅ Complete |
| Complaint cards | 2-column responsive grid; icon pills for reference / department / issue type / priority / area / channel | ✅ Complete |
| Councillor identity | `UserProfile` gains `political_party`, `representation` (ward\|pr), `pr_seat`, `ward_code` from the MP312 gazette; PR-seat check constraint; party is a plain column, never a Group | ✅ Complete |
| Unique identity data | `cell_number` + `employee_number` unique; `email` uniquely indexed case-insensitively via partial index (`WHERE email <> ''`); absence stored as `NULL` so many users may omit them | ✅ Complete |
| Optional identity at signup | `email`, `cell_number`, `employee_number` are optional on `POST /api/access/users/`; `first_name` / `last_name` accepted | ✅ Complete |
| Roster import | `manage.py import_councillors` (MP312 CSV, idempotent, `--dry-run`/`--update-existing`/`--group`); `manage.py backfill_identity_data` for NULL placeholders | ✅ Complete |
| SSO gating | Public `GET /api/auth/config/`; login page shows the SSO button only when OIDC is configured. Authentik deferred, not deleted | ✅ Complete |
| Default password | `settings.DEFAULT_NEW_USER_PASSWORD` (env-overridable) = `#ECOP26-31`; forced change on first login | ✅ Complete |

### Running Services

| Service | URL |
|---|---|
| Frontend (Next.js 16) | http://localhost:3000 |
| Standalone Calendar | http://localhost:3000/calendar |
| Backend (Django 6 + DRF) | http://127.0.0.1:8000 |
| Admin | http://127.0.0.1:8000/admin/ (admin/admin123) |
| JWT Login | POST http://127.0.0.1:8000/api/auth/token/ |

Process management: `ecosystem.config.js` + PM2 (`pm2 start ecosystem.config.js`).
PM2 cannot execute script paths containing spaces, so the Django app is launched
through a space-free wrapper script rather than a path under the project folder.
If the API port is overridden, set `NEXT_PUBLIC_API_PORT` for the frontend too.

### Next Steps (when resuming)

1. **Meeting Archive** — per-meeting permanent resource folders (design complete, see §7)
2. **Production Docker** — fix frontend image build (`pnpm` build-script approval)
3. **S3 storage** — `django-storages` + `boto3` (prerequisite for archive immutability)
4. **CI/CD** — GitHub Actions running `python manage.py test` + `next build`

---

## 2. Backend — `documents` app

### 2.1 Models

```python
class Category(models.Model):
    parent = models.ForeignKey('self', null=True, blank=True,
                               on_delete=models.CASCADE, related_name='children')
    title = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)          # Phoca "alias"
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to='categories/', blank=True)
    # ACL
    access_groups = models.ManyToManyField(Group, blank=True,
                                           related_name='category_access')
    access_users = models.ManyToManyField(User, blank=True,
                                          related_name='category_access')
    # Ownership
    owner = models.ForeignKey(User, null=True, on_delete=models.SET_NULL,
                              related_name='owned_categories')
    team = models.ForeignKey('accounts.Team', null=True, blank=True,
                             on_delete=models.CASCADE, related_name='categories')
    is_published = models.BooleanField(default=True)
    is_shareable = models.BooleanField(default=True)   # False = confidential
    ordering = models.PositiveIntegerField(default=0)

    # Planned for the meeting archive (§7)
    # is_archive  = models.BooleanField(default=False)
    # archived_at = models.DateTimeField(null=True, blank=True)

    @property
    def total_file_count(self):
        """Files in this category *and* all subfolders (recursive)."""
        count = self.files.filter(is_published=True).count()
        for child in self.children.all():
            count += child.total_file_count
        return count

class StoredFile(models.Model):
    class StorageKind(models.TextChoices):
        LOCAL = 'local'
        EXTERNAL = 'external'

    # Optional: files with no category live in the root Files area.
    category = models.ForeignKey(Category, null=True, blank=True,
                                 on_delete=models.SET_NULL,
                                 related_name='files')
    title = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)           # auto-suffixed on collision
    description = models.TextField(blank=True)
    storage = models.CharField(choices=StorageKind.choices, default=StorageKind.LOCAL)
    local_file = models.FileField(upload_to='files/%Y/%m/', blank=True)
    external_url = models.URLField(blank=True)     # file on external server
    filesize = models.BigIntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True)
    # ACL (same pattern as Category)
    access_groups = models.ManyToManyField(Group, blank=True)
    access_users = models.ManyToManyField(User, blank=True)
    owner = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    is_published = models.BooleanField(default=True)
    download_count = models.PositiveIntegerField(default=0)
    created / modified timestamps

class Comment(models.Model):
    content_type = FK to ContentType        # polymorphic: file OR category
    object_id = PositiveIntegerField()
    content_object = GenericForeignKey()
    user = FK(User)
    text = TextField()
    is_approved = BooleanField(default=True)
    created = DateTimeField(auto_now_add=True)

class Rating(models.Model):                  # 1–5 stars, one per user per object
    content_type / object_id / content_object   (generic)
    user = FK(User)
    value = PositiveSmallIntegerField(validators=[MinValueValidator(1),
                                                  MaxValueValidator(5)])
    unique_together: (content_type, object_id, user)

class DownloadLog(models.Model):             # statistics view
    file = FK(StoredFile, related_name='download_logs')
    user = FK(User, null=True)
    downloaded_at = DateTimeField(auto_now_add=True)
    ip_address = GenericIPAddressField(null=True)

class UploadLog(models.Model):
    file = FK(StoredFile, related_name='upload_logs')
    user = FK(User)
    uploaded_at = DateTimeField(auto_now_add=True)
    action = choices: created / replaced
```

### 2.2 ACL rules (Phoca-style)

Enforced in a single helper used by every endpoint:

```python
def can_access(obj, user) -> bool:
    if user.is_superuser: return True
    if not obj.is_published: return False
    if obj.access_users.filter(pk=user.pk).exists(): return True
    if obj.access_groups.exists() and not obj.access_groups
            .filter(pk__in=user.groups.all()).exists(): return False
    return True
```

- No ACL set → public (to authenticated portal users).
- Groups/users set → whitelist only.
- Category ACL **cascades**: a file is visible only if the user can access the
  category **and** the file.
- Team isolation: objects with a `team` are visible only to that team's members;
  blank team means shared with every authenticated user.
- Share links require the `documents.share_files` capability, **and** the file's
  category must have `is_shareable=True`. Confidential folders such as
  "Annexures" should be marked non-shareable; existing links die immediately.
- Capabilities (`accounts.view_teams`, `documents.share_files`) are granted only
  by the superadmin via `/dashboard/access` or Django admin.
- Django groups double as council roles: `Councillors`, `TopManagement`,
  `Admin`. No `Public` group — authenticated users without explicit ACL restrictions are treated as public to published content.

### 2.3 File type handling (preview / play / download)

Determined from `mime_type` / extension:

| Type | Extension | Behaviour |
|---|---|---|
| PDF | `.pdf` | inline preview (browser PDF viewer) |
| Image | `.png .jpg .jpeg .gif .webp` | `<img>` preview |
| Audio | `.mp3 .wav .ogg` | HTML5 `<audio>` player |
| Video | `.mp4 .webm` (`flv` → convert to mp4) | HTML5 `<video>` player |
| Other | everything else | download only |

API endpoint `GET /api/files/<id>/download/`:
1. ACL check → 403 if denied.
2. Increment `download_count`, write `DownloadLog`.
3. `local` → serve with `FileResponse` (X-Accel-Redirect friendly).
4. `external` → 302 redirect to `external_url`.

Upload endpoint accepts multipart POST, validates extension/size, computes
`filesize` + `mime_type`, writes `UploadLog`.

### 2.4 REST API (DRF)

```
/api/auth/login/            POST   session login (csrf)
/api/auth/me/               GET    current user + groups

/api/categories/            GET    visible tree/list (filtered by ACL)
/api/categories/<slug>/     GET    detail + children + files
POST/PUT/DELETE                    admin only

/api/files/?category=<slug> GET    list visible files in category
/api/files/<id>/            GET    metadata + preview type + rating summary
/api/files/<id>/download/   GET    ACL + counter + serve/redirect
/api/files/<id>/upload-replace/ POST admin/owner

/api/objects/<ct>/<id>/comments/  GET/POST
/api/objects/<ct>/<id>/ratings/   GET summary, POST (upsert own rating)

/api/complaints/            GET    ward-scoped list (Django → Supabase gateway)
/api/complaints/<id>/replies/ GET   reply thread for one complaint

/api/admin/stats/downloads/ GET    paginated DownloadLog (admin)
/api/admin/stats/uploads/   GET    paginated UploadLog (admin)
/api/admin/stats/summary/   GET    totals per file/category/user
```

Serializers expose computed fields: `preview_kind`, `can_download`,
`rating_avg`, `rating_count`, `comment_count`, and `total_file_count`
(recursive, on the category tree).

Note: `/api/complaints/` is served by a `ViewSet` + `DefaultRouter` in
`python/complaints/urls.py` — the replies route is a `@action(detail=True)`,
so it only resolves under a router (a plain `path()` would 404).

### 2.5 Django admin

Register all models with `raw_id_fields` for ACL M2Ms; statistics via
`DownloadLog`/`UploadLog` list views with date filters and CSV export action.

---

## 3. Frontend — Next.js

```
app/
  layout.tsx                     # root shell
  page.tsx                       # portal root (ACL-aware category tree)
  calendar/page.tsx              # standalone calendar
  files/[id]/page.tsx            # file detail: preview, comments, ratings
  login/page.tsx, login/oidc/    # password + Authentik SSO
  logout/, share/[token]/        # logout + public share view
  dashboard/
    layout.tsx                   # nav drawer + header shell (auth guard)
    page.tsx                     # stats + upcoming meetings + resources
    access/  analytics/  assets/ assets/[id]/
    calendar/ calendar/[date]/ calendar/meetings/[id]/
    categories/[slug]/           # ⚠ relocated from app/categories/
    collections/ collections/[slug]/
    complaints/  profile/  settings/  shared/  team/
components/
  app-sidebar (mobile drawer) · app-header (hamburger) · auth-provider
  calendar-app · category-tree · file-card · file-dropzone · preview
  comment-form · comment-list · star-rating
lib/
  api.ts                         # fetch wrapper + typed API surface
  file-types.ts                  # preview kind mapping
  meetings.ts                    # isoDay, meetingHref, formatters
  utils.ts                       # cn(), formatFileSize
```

Key behaviours:
- JWT auth (`access_token` in `localStorage`) with automatic refresh on 401;
  base URL resolved by `getApiBaseUrl()` so LAN clients hit the right host/port.
- `Preview` component switches on `preview_kind` from API.
- Mobile-first: sidebar is an off-canvas drawer below `md`; calendar collapses
  to a compact grid + day agenda; complaint cards stack to one column.
- Deep links (`#meeting-<id>`) are re-applied after async data loads, since the
  browser's native anchor scroll fires before the element exists.
- Tailwind styling; loading skeletons; 403/empty states for every list.

---

## 4. Phased Delivery

| Phase | Scope | Done when |
|---|---|---|
| **1. Scaffold** | `documents` app, models, migrations, admin registration, DRF installed | `makemigrations`/`migrate` pass, admin browsable |
| **2. Core API** | Categories + files CRUD ACL-filtered, auth endpoints | Authenticated user sees only permitted tree |
| **3. Files I/O** | Upload/download endpoints, logs, external URL support | Download increments stats; external 302 works |
| **4. Social** | Comments + ratings endpoints | Users can comment/rate files & categories |
| **5. Frontend shell** | Layout, login, category tree, file list | Portal navigable at :3000 |
| **6. Preview** | Preview component (pdf/img/audio/video) | PDFs preview inline, mp3 plays |
| **7. Admin stats** | Statistics pages + Django admin reports | Upload/download logs visible with filters |
| **8. Hardening** | Permissions polish, seed data, Docker media volume, docs | Full flow works in Docker |
| **9. Mobile & polish** | Off-canvas nav, calendar redesign, recursive counts, complaint replies | Usable on a phone; counts correct at any depth |
| **10. Councillor identity** | Gazette fields, unique identity data, roster import, SSO gating | 71 councillors importable; SSO hidden until configured |

---

## 5. Docker / Ops Notes

- Add `media/` named volume to `web` service: `- media:/app/media` (uploads
  persist across rebuilds).
- For truly external storage later: swap in `django-storages` (S3) or keep the
  `external_url` field and host files on a separate nginx box — the model
  already supports both.
- `DEBUG=0` in production; serve media via nginx (`X-Accel-Redirect`) rather
  than Django.
- Seed: management command `seed_portal` creating groups (Councillors,
  TopManagement, Admin), sample categories/files, and a superuser.
- **CORS / hosts**: `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` must include the
  LAN address the frontend is served from (`http://172.20.17.16:3002`), or API
  calls fail with 502/401 from other devices.
- **PM2**: `ecosystem.config.js` and `python/start_django.sh` are **gitignored**
  — every environment supplies its own. PM2 cannot execute script paths that
  contain spaces, which is why the launcher sits at a space-free path.
- **Password hashing / JWT**: `SECRET_KEY` shorter than 32 bytes triggers an
  `InsecureKeyLengthWarning` from PyJWT — set a longer key in production.

### Git repositories & branches

The project uses **two repositories**:

| Repository | Contents | Branches |
|---|---|---|
| [councilportalv2](https://github.com/Msaination/councilportalv2) | Django backend (`python/`), docs, and the frontend submodule pointer | `main`, `staging` |
| [councilportalv2-frontend](https://github.com/Msaination/councilportalv2-frontend) | Next.js UI (`frontend/`) | `main`, `staging` |

- `main` = production-ready; `staging` = pre-production integration.
- The parent repo pins an **exact frontend commit** through the submodule, so
  each parent branch defines its precise backend + UI deployment.
- Read the live pin with `git submodule status` — do not trust a hash written
  in this document; it goes stale on every frontend commit.
- Pushing a frontend commit does **not** move the parent pointer: you must
  `git add frontend && git commit` in the parent as a separate step.
- Deploy staging:
  `git clone --recurse-submodules -b staging https://github.com/Msaination/councilportalv2.git`
- Frontend change flow: commit/push on frontend `staging`, then `git add frontend`
  in the parent `staging` branch and commit the bumped pointer. Promote the same
  way into `main`.

---

## 6. External Integration — Municipality Complaint Management System

**Requirement (from project owner):** ward councillors log into the Council
Portal and see the complaints/statuses that belong to them, pulled from the
municipality's existing Complaint Management System (CMS).

- CMS location: `http://172.20.17.16:3000/dashboard` (LAN only)
- Verified: the CMS is a **Next.js** app (Turbopack build) — same family as
  the portal frontend, reachable server-to-server on the municipal LAN.
- Councillors currently have **separate logins** for each system today.

### 6.1 Integration options

| Option | How it works | When to use |
|---|---|---|
| **A. Server-to-server gateway (recommended)** | Portal user logs in once (portal JWT). Django calls the CMS API/database with a **service account**, filters by the councillor's identity, returns data to the portal. | Fastest path; CMS login untouched; all authorization decided in our trusted backend. |
| **B. True SSO (OIDC/OAuth)** — **DECIDED** | Shared IdP — **Authentik** (see §6.6). Both apps accept one credential issued by Authentik. | Chosen by the project owner for Phase 3. Still requires CMS to support OIDC login — see the §6.3 discovery gate. |
| **C. Shared user table / direct DB read** | Django reads the CMS database directly (ideally a read-only view). | Stopgap only — couples the systems at schema level; CMS updates can break us silently. |

**Avoid:** browser-side calls from the portal frontend straight to the CMS API
(needs CORS, duplicate token handling, and client-trustable filtering =
insecure).

### 6.2 Authentication workflow (Option A)

```
Councillor ──logs in once──▶ Portal (Next.js) ──JWT──▶ Django
                                                          │
                                        maps employee no. ─┤
                                        → CMS identity    │
                                                          ▼
                                              CMS API / DB (service
                                              account, LAN, server-to-server)
```

- Councillors keep **one credential** — the portal login. They never see CMS
  credentials; the browser never touches the CMS.
- Django ↔ CMS trust is a **service account / internal API key**, not user
  credentials.
- Identity mapping: portal **employee numbers** (unique `S`-prefixed, already
  in `UserProfile`) ↔ CMS user ID — a small mapping table in our Postgres.

### 6.3 Phased workflow

1. **Discovery (no code)** — *partially done 2026-11-12 (see §6.7 for
   results):* 
   - Does the CMS expose a REST/GraphQL API, or only a UI? (Probe `/api/*`.)
     → **No API found**: `/api`, `/api/complaints`, `/api/wards`,
     `/api/health` all 404; root redirects to `/login`.
   - Supabase identified as the CMS data backend: project ref
     `hnubeqlosizpsfbjblnr.supabase.co` (found in the served JS bundle).
   - **SSO gate (hard requirement):** does the CMS support OIDC login? If
     not, SSO becomes a feature request to the CMS developers and Phase 2
     (service-account gateway) remains the only path for Phase 3's goal.
   - How does it authenticate (own login, JWT, session cookie)?
   - How are complaints keyed to a councillor — ward number, user ID, name?
     → Assumed ward number (§6.7); **confirm the complaints table schema**
     (needs credentials or the Supabase dashboard — next discovery step).
   - Data needed: list, status, dates, ward. **Read-only first** — no write-back.
2. **Phase 2 — read-only dashboard (quick win)** — ✅ *implemented 2026-11-12*
   - **Live fetch** through Django's `complaints` app: Supabase PostgREST
     query with the CMS's service-role key (read from the CMS repo's
     `.env.local` — never duplicated, never sent to the browser).
   - Django endpoint `GET /api/complaints/` — resolves logged-in user →
     `UserProfile.ward` → `WHERE ward = 'Ward <n>'` server-side.
     503 = not configured, 502 = CMS unreachable, friendly payload when
     no ward is assigned.
   - Portal page **"My Complaints"** (`/dashboard/complaints`, sidebar
     item) — status badges, ward badge, refresh, empty/error states.
3. **Phase 3 — SSO with Authentik** (decided, see §6.6): deploy Authentik as
   the shared IdP on the municipal LAN; both the portal and the CMS
   authenticate against it. The §6.2 gateway is retained for complaint data.
4. **Phase 4 — write-back** (e.g. "escalate" from the portal): only after
   Phase 2 is stable. Start read-only; it halves the risk.

### 6.4 Caveats

- If the CMS has **no API**, fall back to (in order of preference): a small
  API added to the CMS → a read-only DB view → a scheduled sync (e.g. every
  15 min). A scheduled sync is usually the pragmatic middle ground.
- Both systems are on the `172.20.x.x` LAN — server-to-server calls are
  trivial and already isolated from the internet.
- Decide **freshness**: real-time vs. cached (15 min). For council dashboards
  caching is almost always fine and kinder to the CMS.
- Filtering by councillor must happen **server-side** (our backend), never in
  the browser.

### 6.5 Identity decision record (auth, user creation, data flow)

**Decision: the Council Portal is the system of record for councillor
identities. The CMS is a downstream consumer.**

| Question | Decision |
|---|---|
| Self-registration for councillors? | **No.** Admin creates the account (keeps employee numbers verified, no unknown accounts in a system holding council documents). Open registration would need an approval queue anyway = admin creation with extra steps. |
| Default access level | Existing model: authenticated access gated by capabilities/ACLs — viewing "my complaints" is ordinary member access, no special capability needed. |
| First-login password change | **Keep the current portal flow**: admin creates → forced password change on first login → councillor active. |
| Which system registers first? | **Council Portal.** It already owns the profile model (employee number, cell, email, avatar) and the creation workflow. The CMS is a point solution; point solutions don't own org-wide identities. |
| How does the CMS get councillor data (name, email, cell, employee no.)? | Provisioned **from** the portal — never manually re-entered in the CMS. Mechanism, per CMS capability: **(1)** push provisioning (Django → CMS API via service account), **(2)** pull sync (CMS/scheduled job fetches the roster from a portal admin endpoint), or **(3)** SSO claims from a shared IdP (Phase 3). |
| Who owns profile edits? | **Portal only.** CMS mirrors; changes propagate portal → CMS, never the reverse. |
| Passwords | **DECIDED (2026-11-11): Option A — the IdP owns credentials.** Authentik holds the real councillor password (MFA, lockout, policy live there); the portal's local password is a **break-glass** credential for superusers/emergency only, and is never pushed anywhere. Under Option A the CMS account exists only so complaint records have an owner; under SSO the CMS has no password of its own. |

**Rule of thumb:** register and edit in the Council Portal; every other
system subscribes.

**Implementation (2026-11-11):** push provisioning is live —

- `accounts/authentik.py::provision_user()` mirrors portal users into
  Authentik (find-by-username → PATCH/POST, idempotent, best-effort: a down
  broker never blocks portal operations).
- Hooks: superadmin user creation (sends the temp password, which the
  councillor replaces **in Authentik** on first SSO login) and profile
  identity edits (username/email).
- `manage.py provision_authentik_users [usernames...]` backfills everyone.
- JIT auto-create is **off** (`OIDC_CREATE_USER = False`): an Authentik-only
  account can never mint a portal account — provisioning only flows
  portal → Authentik, one direction.
- Service token: `AUTHENTIK_ADMIN_TOKEN` in the gitignored `authentik/.env`.

### 6.6 SSO decision — Authentik as the Identity Provider

**Decision (2026-11-10): the project will use Authentik as the dedicated IdP
for Phase 3 SSO.**

```mermaid
flowchart TD
    C[Councillor / Staff] -->|one login| A[Authentik IdP :9443]
    A -->|OIDC token| P[Council Portal<br/>Next.js + Django]
    A -->|OIDC token| X[Complaint System :3000]
    P -->|service account| X
```

- **Flow:** portal (or CMS) redirects to Authentik → user logs in once →
  Authentik issues an OIDC token with claims (name, email, employee number,
  roles) → each app validates the token server-side. No password ever
  reaches the applications; the browser only ferries redirects.
- **Profile data** arrives in the token claims at each login — no identity
  sync jobs needed; profile edits in the portal are reflected on next login.
- **Why Authentik:** Docker-native (fits the existing compose stack), user
  federation back to Django (portal stays the creation point per §6.5), MFA /
  password policy / lockout in one place, fully self-hosted on the municipal
  LAN (no data leaves the network).
- **Roles are unchanged:** Authentik is the *login broker*, not the source of
  truth. Accounts are still created in the Council Portal (§6.5) and
  federated to Authentik; the §6.1 Option A gateway still carries complaint
  *data* — SSO answers "who is this?", the gateway answers "which data may
  they see?".
- **Sequencing:** portal integration with Authentik first; CMS integration
  only after the §6.3 discovery gate confirms the CMS supports OIDC.
- **Phase 2 is still required** regardless — the gateway is needed for
  complaint data either way.

**Status (2026-11-25): SSO is currently DISABLED — deferred, not removed.**

The integration code is complete and dormant; nothing was deleted, because
re-enabling is cheaper than re-implementing and the §6.6 decision still stands.

| Piece | State |
|---|---|
| `accounts/authentik.py`, `oidc.py`, `oidc_views.py` | Present, wired into `AUTHENTICATION_BACKENDS` |
| Provisioning signal | No-ops when `AUTHENTIK_ADMIN_TOKEN` is absent (logs a skip) |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` | Empty → OIDC endpoints resolve to `''` |
| Login page SSO button | **Hidden** unless the backend reports it configured |
| Authentik container | May be stopped — that is the free "off switch" |

Discovery endpoint (public, unauthenticated):

```
GET /api/auth/config/   →   {"sso_enabled": false, "sso_login_url": null}
```

`sso_enabled` requires **both** `OIDC_ISSUER` and `OIDC_CLIENT_ID`; a
half-configured provider counts as disabled, because an issuer without a client
id builds a redirect that fails at the IdP.

**To re-enable** — set the two env vars and restart Django. No frontend
rebuild, no code change; a `NEXT_PUBLIC_*` flag was deliberately avoided
because those are baked in at build time:

```bash
OIDC_ISSUER=http://localhost:9080/application/o/council-portal/
OIDC_CLIENT_ID=<client-id>
# then
python manage.py provision_authentik_users
```

**Why defer:** no CMS OIDC support is confirmed yet (§6.3 hard gate), and the
portal's own password auth plus forced first-login change is sufficient for
onboarding the gazetted roster today.

### 6.7 Complaints ↔ councillor association — ward is the join key

**Question (2026-11-12):** complaints must be associated with their ward
and ward councillor, but councillors don't exist as rows in Supabase (CMS's
DB). How are they linked — and does SSO solve it?

**Decision: SSO is not the link. The WARD is.** SSO answers *"who is this
person?"* (Authentik token); it does not create durable relationships
between rows in two databases — its claims exist only for the login session.
The association is a data join performed server-side:

```
Council Portal (source of truth)        Supabase / CMS (source of truth)
┌──────────────────────────┐            ┌───────────────────────────┐
│ UserProfile              │   join on  │ Complaint                 │
 │  ward: 12        ◄──────┼────────────┼─ ward: 12                 │
 │  employee_no: S12345    │            │  status: open             │
 └──────────────────────────┘            └───────────────────────────┘
        no councillor row needed in Supabase
```

**Flow:** councillor registered in portal (incl. ward) → logs in (SSO or
password) → Django gateway resolves JWT → `profile.ward` → queries Supabase
`WHERE ward = <their ward>` **server-side** → returns only their complaints.
SSO's role is limited to making the *person* claiming that ward trustworthy.

**Implementation status (2026-11-12):** *(discovery + Phase 2 gateway live)*

- `UserProfile.ward` added (`PositiveSmallIntegerField`, migration
  `accounts.0006`) — admin-assigned like `employee_number`, never
  self-service (read-only on `/api/profile/`, editable via
  `/api/access/users/` under the same `edit_employee_numbers` gate).
  Exposed in Django admin (list + filter).
- Discovery **complete**: the ignored local CMS reference directory (`CMS/`)
  has no REST API of its own; complaint data lives in Supabase and credentials
  are configured through `python/.env` or server environment variables.
  Live `complaints` columns include `reference_number`, `title`, `ward_number`,
  `issue_type`, `assigned_department`, `location_address`, `description`,
  `priority`, `status`, `created_at`, and `received_via`.
- **Ward format (live-verified):** `ward_number` is text containing the bare
  number (for example `"12"`), matching `UserProfile.ward`.
- Live statuses: `Received, New, Assigned, In Progress, Completed`
  (+ `Escalated, Resolved` in the CMS's own status list). 19 complaints
  across 10 wards at time of writing.
- **Phase 2 gateway live:** `python/complaints/` (client + endpoint +
  tests), sidebar item, `/dashboard/complaints` page. Verified end-to-end:
  ward 12 → 2 real rows; service-role key never appears in responses
  (asserted in tests and against the live API).
- Remaining: set councillors' wards via `/dashboard/access`, then (later)
  optional write-back per §6.3 Phase 4.

**Reply thread (2026-11-24):** each complaint can expand into its chat history
from Supabase's `report_replies` table.

- `client.py::fetch_replies_for_complaint()` — `complaint_id=eq.<id>`,
  ordered `created_at.asc`.
- Exposed as `GET /api/complaints/<id>/replies/` via a `@action` on a
  `ComplaintViewSet` registered with a `DefaultRouter`. A plain `path()` will
  **not** serve this route.
- Replies carry `created_at`, `body`, `from_staff`; the UI renders staff
  messages right-aligned with primary branding and others left-aligned.
- ⚠ `author_name` currently resolves to `Staff` / `User` — the CMS does not
  expose a per-reply author name in the current `select`. Real names require
  resolving the reply's user relation (see open item below).
- Open: confirm the correct PostgREST syntax for nesting the user relation;
  `user(full_name)` was rejected with a 400, so the current query ships without
  it.

**Never:** browser → Supabase direct (breaks §6.1/§6.4 — credentials and
filtering would be client-side).

---

## 7. Meeting Archive — planned feature

**Goal:** every meeting keeps its documents forever, reachable from the meeting
itself. Not implemented yet; this section is the agreed design.

### 7.1 Concept

An archive folder **is a `Category`** — no new content model. One extra FK on
`Meeting` ties the two together, and everything downstream (upload, preview,
download logging, `total_file_count`, ACL, share links) already works.

```
Archive/
  2026/
    2026-11-26-first-council/      ← Category, slug mtg-6-first-council
      Agenda.pdf  Minutes.pdf  Annexure A.pdf
    2026-11-30-mpac/
  2027/
```

### 7.2 Data model

```python
# documents/models.py — Category
is_archive  = models.BooleanField(default=False)   # marks the subtree as sealed
archived_at = models.DateTimeField(null=True, blank=True)

# calendar_app/models.py — Meeting
archive_category = models.ForeignKey(
    'documents.Category', null=True, blank=True,
    on_delete=models.SET_NULL,          # deleting a meeting keeps the archive
    related_name='archived_meetings',
)
```

**Do not reuse `Meeting.category`.** That field already means "related
collection" and is rendered by `meetingHref()` as the "Open X" link. Overloading
it would make one link mean two different things over time.

Slug rule: `mtg-<meeting_id>-<title-slug>`. `Category.slug` is globally unique,
so embedding the id prevents collisions between same-titled meetings.

### 7.3 Lifecycle

| Trigger | Trade-off |
|---|---|
| **On meeting creation** — folder exists immediately | staff can add the agenda *before* the meeting; no scheduler needed |
| Lazy on first view | zero infrastructure, but implicit and unpredictable |
| Scheduled daily scan | deterministic and auditable, but needs cron/pm2 scheduling |

**Recommended:** create eagerly at meeting creation, then *seal* once the
meeting ends. "Past" must use `COALESCE(ends_at, starts_at) < now()` because
`ends_at` is nullable — `starts_at < now()` would seal meetings in progress.

### 7.4 Permanence guards

1. **Block category deletion** — refuse `destroy` when `category.is_archive`
   (plus a `pre_delete` signal as a second layer).
2. **Block file mutation** in sealed folders — `destroy`, `replace`,
   `bulk_delete` must all refuse.
3. **Copy the meeting's ACL at creation** — mirror `Meeting.team` →
   `Category.team` and `Meeting.groups` → `Category.access_groups`. Without
   this, confidential annexures leak to anyone who can browse Archives.
   *Ship this in the same commit as folder creation, never later.*
4. **Default `is_shareable = False`** for archived confidential material.
5. **Audit** — `UploadLog`/`DownloadLog` exist; a deletion log is still needed.
6. **Durability** — the media volume survives restarts, not host loss. True
   immutability needs S3 + versioning/object-lock (a separate phase).

### 7.5 Surfacing in the UI

- Serializer adds `archive_slug` and `archived_at`.
- Day-detail page shows a distinct action — `Archive · 4 files →` with an
  archive icon — separate from the existing `Open <document>` link.
- Future meetings may show the same folder labelled `Meeting folder`
  (pre-meeting docs), or hide it until sealed.
- Requires a **separate `archiveHref()` helper** in `lib/meetings.ts`; reusing
  `meetingHref()` would render two links pointing at different folders.

### 7.6 Browse entry point

Sidebar **Archive** item → `/dashboard/collections/meeting-archive`, or a
dedicated Archived-meetings page grouped by year.

Keep the archive root **out of the normal Resources listing** (`is_archive`
filter in `CategoryViewSet.list`) so it doesn't clutter LIBRARY/COUNCIL/MPAC —
but keep it **published**, because unpublished categories fail `can_view` and
direct links would 404.

### 7.7 Backfill

`manage.py backfill_meeting_archives [--dry-run]` — walk meetings where
`COALESCE(ends_at, starts_at) < now()` and `archive_category IS NULL`, create
the year bucket + folder with copied ACL, optionally move the meeting's existing
`file`. Idempotent, so it doubles as the cron entry point if the scheduled
trigger is chosen later.

### 7.8 Phasing

| Phase | Scope |
|---|---|
| **v1** | `archive_category` + `is_archive`, folder on meeting creation, archive link on past meetings, deletion guards, ACL copy |
| **v2** | Year-bucket auto-creation, backfill command, Archive browsing page |
| **v3** | Sealed read-only enforcement, deletion audit log |
| **v4** | S3 + versioning/object-lock for genuine immutability |

### 7.9 Open decisions

1. Pre-meeting docs? (yes → eager creation; no → scheduled seal)
2. One archive per meeting, or one per date?
3. Who may write into an unsealed folder — staff only, or attendees too?
4. Sealing by time (`ends_at` passed) or explicit staff action? Time-based can
   seal a postponed meeting.
5. Do archived files *move* or *copy* into the folder? Moving breaks existing
   links to the original asset page.

---

## 8. Immediate Next Steps

1. **Seed the councillor roster** — `tmp/MP312.csv` is ready (71 rows, wards 1–36
   contiguous). Back up the database first, then:
   ```bash
   cp python/db.sqlite3 python/db.sqlite3.pre-seed
   python manage.py import_councillors ../tmp/MP312.csv --group Councillors --dry-run
   python manage.py import_councillors ../tmp/MP312.csv --group Councillors
   ```
   Remember: Authentik provisioning is inactive (no token), so these accounts are
   Django-only until `provision_authentik_users` is run.
2. **Meeting Archive v1** — implement §7 (fields, folder creation, ACL copy, link, guards).
3. **Production Docker** — fix the frontend image build (pnpm build-script approval) and run `docker compose up -d --build`.
4. **CI/CD** — GitHub Actions running `python manage.py test` and the Next.js build.
5. **S3 storage** — swap local media for `django-storages` + `boto3` when needed (also unblocks §7.4.6).
6. **Complaints write-back** — optional, per §6.3 Phase 4.
7. **Deferred:** SSO re-enablement (§6.6, waiting on CMS OIDC support) and
   per-reply author names in the complaint thread (needs the correct PostgREST
   relation; `user(full_name)` returned 400).

### Known gaps

| Gap | Impact | Notes |
|---|---|---|
| Councillor emails absent | No password-reset email possible | Join against an HR roster on `full_name` |
| 35 PR councillors have `ward = NULL` | They see **no** complaints | Correct per §6.7 — complaints key on ward |
| `author_name` in replies | Shows `Staff` / `User`, not a real name | CMS `select` exposes no author |
| Frontend password constant | Duplicates `settings.DEFAULT_NEW_USER_PASSWORD` | Backend is authoritative; keep in sync |
| Backfill placeholders | Sequential and guessable (`0820000011` = user 11) | Dev/staging only — replace with real numbers |
