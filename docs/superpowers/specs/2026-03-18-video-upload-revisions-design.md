# Design: Video Upload + Timestamped Revisions

**Date:** 2026-03-18
**Status:** Approved

---

## What We're Building

First core feature of Revision AI. Editors create a project, upload an MP4, and strategists leave timestamped revision notes on the video. No auth, no AI classification yet — just the core loop working end-to-end.

---

## Supabase

### Storage
- Bucket: `videos`, public read access
- Upload path: `{project_id}/{timestamp_ms}.mp4`
- Public URL: `{SUPABASE_URL}/storage/v1/object/public/videos/{path}`

### Tables

**projects**
```sql
id           uuid primary key default gen_random_uuid()
title        text not null
video_url    text
created_at   timestamptz default now()
```

**revisions**
```sql
id                 uuid primary key default gen_random_uuid()
project_id         uuid references projects(id) on delete cascade
timestamp_seconds  numeric not null
note               text not null
category           text  -- 'small' | 'big' | null
created_at         timestamptz default now()
```

---

## Backend

### New dependency
- `multer` (memoryStorage — no disk writes, buffer passed directly to Supabase)

### Routes added to `backend/index.js`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects` | Create project `{ title }` → return project row |
| POST | `/projects/:id/upload` | Multipart MP4 → Supabase Storage → update `video_url` → return project |
| GET | `/projects/:id` | Return project + revisions ordered by `timestamp_seconds` |
| POST | `/projects/:id/revisions` | Insert `{ timestamp_seconds, note }` → return revision |

---

## Frontend

### Routing (`App.jsx`)
```
/ → UploadPage
/review/:id → ReviewPage
```

### UploadPage (`/`)
- Title input + MP4 file input + submit button
- On submit: POST /projects → POST /projects/:id/upload → navigate to /review/:id
- Disable form + show "Uploading…" during request

### ReviewPage (`/review/:id`)
- Load: GET /projects/:id (project + revisions)
- HTML5 `<video>` with `ref` for timestamp capture
- "Add Revision Note" button → captures `videoRef.current.currentTime` → shows textarea
- Submit → POST /projects/:id/revisions → append to revision list immediately
- Revision list: `MM:SS — note text`, ordered by timestamp_seconds

---

## Out of Scope (this iteration)
- Auth
- File size limits
- AI classification (category stays null)
- Playwright e2e tests (next step)
