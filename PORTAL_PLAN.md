# NextGen DAM — SaaS Digital Asset Management Platform

A cloud-native Digital Asset Management solution: **Create once, reimagine everywhere.**

**Stack**: React Next.js (Server Actions + Turbopack) · Django REST Framework (JWT) · PostgreSQL · Shadcn UI · Tailwind CSS · Docker

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
| **Asset Management** | Upload, organize into collections, preview (PDF/img/audio/video), download tracking |
| **Multi-tenancy** | Teams/workspaces with isolated asset storage |
| **Client Sharing** | Time-limited, password-protected share links |
| **Social** | Comments, ratings (1–5 stars), activity feeds |
| **Data Protection** | RBAC, audit logs, file encryption at rest (planned) |
| **Admin Panel** | Statistics dashboard, user/team management, audit trail |

---

## Current Status: MVP Core Complete

### ✅ Phase 1-8 (Emalahleni Council Portal → DAM Foundation)
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
| Dashboard UI | Sidebar, header, asset/collection pages | ✅ Complete |

### Running Services

| Service | URL |
|---|---|
| Frontend (Next.js 16) | http://localhost:3000 |
| Backend (Django 6 + DRF) | http://127.0.0.1:8000 |
| Admin | http://127.0.0.1:8000/admin/ (admin/admin123) |
| JWT Login | POST http://127.0.0.1:8000/api/auth/token/ |

### Next Steps (when resuming)

1. **Multi-tenancy** — `accounts` app with Team/User profile models
2. **Client sharing** — `SharedLink` model with expiry + password
3. **Production Docker** — `docker compose up -d --build`
4. **S3 storage** — `django-storages` + `boto3`
5. **Tests + CI/CD** — Unit/integration tests, GitHub Actions

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
    is_published = models.BooleanField(default=True)
    ordering = models.PositiveIntegerField(default=0)

class StoredFile(models.Model):
    class StorageKind(models.TextChoices):
        LOCAL = 'local'
        EXTERNAL = 'external'

    category = models.ForeignKey(Category, on_delete=models.CASCADE,
                                 related_name='files')
    title = models.CharField(max_length=255)
    slug = models.SlugField()
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

/api/admin/stats/downloads/ GET    paginated DownloadLog (admin)
/api/admin/stats/uploads/   GET    paginated UploadLog (admin)
/api/admin/stats/summary/   GET    totals per file/category/user
```

Serializers expose computed fields: `preview_kind`, `can_download`,
`rating_avg`, `rating_count`, `comment_count`.

### 2.5 Django admin

Register all models with `raw_id_fields` for ACL M2Ms; statistics via
`DownloadLog`/`UploadLog` list views with date filters and CSV export action.

---

## 3. Frontend — Next.js

```
app/
  (portal)/
    page.tsx                     # root category tree
    categories/[slug]/page.tsx   # subcategories + file grid/table
    files/[id]/page.tsx          # detail: preview, comments, ratings
    login/page.tsx
  admin/
    statistics/page.tsx          # downloads/uploads tables + filters
components/
  CategoryTree, FileCard, FileTable, Preview (pdf/img/audio/video switch),
  CommentList, CommentForm, StarRating, AclNotice
lib/
  api.ts                         # fetch wrapper (credentials: 'include')
  file-types.ts                  # preview kind mapping
```

Key behaviours:
- Session-cookie auth against Django (`CSRF` token handling in `api.ts`).
- `Preview` component switches on `preview_kind` from API.
- Admin statistics page guarded client-side by role + server-side by API ACL.
- Tailwind styling; loading skeletons; 403 page variant for ACL denials.

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

---

## 6. Immediate Next Steps

1. `django-admin startapp documents` + add to `INSTALLED_APPS` with
   `rest_framework`, `django_filters`.
2. Write models above → migrate.
3. Register in admin → create groups + test categories.
4. Build serializers/views per Phase 2.
