# منصة مستر وليد عونى التعليمية — System Architecture

**Phase 0 deliverable. Sources of truth:** `PLAN.md` (Master Technical Implementation Plan) and `BLUEPRINT.md` (approved Execution Blueprint, contract for phases 0–11). This document extracts and expands blueprint §§1, 2, 13, 14, 15. No architecture is invented here; where a binding architecture-gate requirement supersedes blueprint wording, it is flagged **[BINDING]**.

**Project root:** `C:\Users\admin\Desktop\WALIDAWNY`
**Frontend env (existing):**
- `VITE_SUPABASE_URL=https://nfusbrktrqfrnaetetmr.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<provided separately>`

---

## 1. System Overview

### 1.1 Product

An Arabic-first, RTL educational platform for "Mr. Walid". Students buy **per-unit permanent (lifetime) access** — a single activation code opens **one unit forever** — to a video + PDF curriculum organized as **Grade → Unit → Lesson → (Video, PDF)**. Mr. Walid manages curriculum, students, unit purchases and content; an Admin additionally manages system configuration, per-unit pricing, roles and audit logs. Trial lessons (`lessons.is_trial`) open without any purchase; there is no all-inclusive "package".

Core product rules (PLAN §2): email+password auth with immutable email; Egyptian phone required; account disable/soft-delete with Trash and restore; per-unit pricing (`unit_pricing`) with permanent purchases (`unit_purchases`); single-use activation codes (`unit_codes`) with atomic redemption (`redeem_unit_code`); live access enforcement (`can_access_lesson`) — trial lesson **or** active purchase; deterministic progress with 90% completion; Bunny-hosted private video with signed playback; private storage-backed PDFs with signed access; admin-only immutable audit log; centrally configured WhatsApp button.

### 1.2 Users

| Role | Capability summary | Notes |
|---|---|---|
| `student` | Browse curriculum, watch videos, read PDFs, track progress, manage own profile/password, read own notifications, redeem one unit code, view own purchases | Cannot change grade/role/email, cannot modify purchase state, cannot touch other users' data |
| `mr_walid` | Manage students (disable/enable, soft-delete/restore via Trash), grades, curriculum (units/lessons/videos/PDFs), unit codes (generate/revoke), pricing (base price per unit), WhatsApp setting, progress analytics | Cannot read audit logs, cannot escalate role, cannot manage platform fee |
| `admin` | Everything Mr. Walid can do, **plus**: per-unit pricing/platform fee management, role/permission management, audit logs (read + export), system settings, operational statistics | Highest privilege |
| `teacher` | Curriculum/lesson management, trial flagging, student grade assignment, progress analytics (added 0023) | Cannot manage pricing, roles, audit logs, or WhatsApp settings |

### 1.3 Scope boundaries (MVP)

- No OTP, no forgot-password (future phase; documented admin/SQL recovery path — A13/A14).
- Email change forbidden everywhere (app UI + DB trigger on `auth.users`); direct SQL/dashboard is the documented escape hatch.
- Exactly four fixed roles; no granular permission tables (A15).
- No hard deletes in any UI; hard delete only via direct SQL with documented runbook (A31).
- No manual purchase grants and no electronic payment: purchase happens **only** through code redemption.

---

## 2. Layered Architecture

### 2.1 Layer diagram

```
┌────────────────────────────────────────────────────────────────────┐
│ Presentation — React SPA (Vite + React + TypeScript, RTL, Tailwind)│
│   src/app, src/components, src/features/{auth,student,walid,admin} │
└────────────────────────────────────────────────────────────────────┘
                          │  supabase-js (publishable key, user JWT)
                          ▼
┌────────────────────────────────────────────────────────────────────┐
│ Application / Feature Services — React hooks + feature modules     │
│   data/ (typed RPC wrappers), lib/ (guards, formats)               │
└────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────────────┐
│ Supabase Data Access — supabase-js v2 client, RPC-first mutations  │
└────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────────────┐
│ Supabase PostgreSQL / Auth / Storage  ← AUTHORITATIVE (RLS)        │
│   RLS on all application tables, SECURITY DEFINER RPCs, sign-in    │
│   gate, private storage buckets, pg_cron/pg_net (scheduling        │
│   fallback)                                                        │
└────────────────────────────────────────────────────────────────────┘
                          ▲
                          │ service-role client ONLY
┌────────────────────────────────────────────────────────────────────┐
│ Supabase Edge Functions (Deno/TypeScript) — all privileged ops     │
│   create-video-upload-session, bunny-video-webhook,                │
│   get-video-playback-url, get-video-thumbnail-url,                 │
│   get-pdf-signed-url, upload-pdf, generate-unit-codes,             │
│   export-audit-log, recheck-video-states (scheduled)               │
└────────────────────────────────────────────────────────────────────┘
                          ▼
┌────────────────────────────────────────────────────────────────────┐
│ External privileged APIs — Bunny Video API, Bunny Storage,         │
│   Supabase Storage signed URLs, CSV export                         │
└────────────────────────────────────────────────────────────────────┘
```

### 2.2 Layer responsibilities

| Layer | Responsibility |
|---|---|
| Presentation | RTL UI, forms, states (loading/empty/error/success), navigation, informational guards |
| Application/Features | Business-feature modules (auth, student, walid, admin); typed RPC wrappers; client-side validation |
| Supabase Data Access | `@supabase/supabase-js` (v2) with publishable key; no direct table DML except where RLS covers; notification mark-read is RPC-only (direct UPDATE REVOKEd — [BINDING B2]) |
| PostgreSQL/Auth/Storage | **Authoritative authorization (RLS)**, triggers, RPCs, scheduled jobs, storage policies |
| Edge Functions | All privileged operations; JWT verification + role + active-profile checks; secret holders |
| External APIs | Bunny Video/Storage (upload, processing, tokenized playback), Supabase Storage signed URLs, CSV export |

**Where Edge Functions sit:** between the browser and any privileged external service. The browser **never** holds service-role keys, Bunny API keys or signing secrets. The Edge Function layer receives the user's JWT (`Authorization: Bearer`), verifies it (`supabase.auth.getUser()`), re-checks role + business rules **server-side**, performs the privileged call, and returns only what the caller may see.

### 2.3 Trust boundaries

1. **Browser is untrusted.** localStorage is session persistence only, never authorization (PLAN §8, §18).
2. **Client-supplied values are validated server-side.** Progress clamps, code normalization to uppercase, phone format checks.
3. **RLS is the last word for data access.** Hidden UI is never a security control (PLAN §3).
4. **Privileged operations never run in the browser** (PLAN §3): Bunny, signed URLs, code generation, audit export, service-role calls.
5. **Edge Functions re-derive access from the database** — never trust client IDs blindly; `can_access_lesson()` is the single access gate; every privileged Edge Function additionally verifies the caller profile is `status='active'` and `deleted_at IS NULL` (A34, defense-in-depth).

### 2.4 Privileged operations (Edge Functions only — never browser) (BP §1.4)

1. Bunny: create upload session (direct upload to Bunny Storage), webhook handling of processing states, tokenized/signed playback URL generation, video replacement.
2. Supabase Storage: signed PDF URLs (access-aware), PDF upload authorization.
3. Unit code generation (`generate-unit-codes`, staff-only).
4. Audit log CSV export.
5. Any operation requiring the service-role key or a third-party secret.

---

## 3. Module Architecture (features)

### 3.1 Feature map

| Module | Route prefix | Key responsibilities | Primary services |
|---|---|---|---|
| **auth** | `/login`, `/register` | Email+password signUp/signIn (grade picker via `list_active_grades` at sign-up), profile creation via trigger, password change, session persistence, login error mapping (`account_inactive_or_deleted` → friendly Arabic) | `supabase.auth.*`, `handle_new_user()` trigger, sign-in gate trigger |
| **student** | `/student/*` | Dashboard, curriculum tree, lesson page (video player + PDF viewer), progress (resume/completion), units (per-unit prices + purchase history), redeem code, notifications, profile | `redeem_unit_code`, `get_my_unit_purchases`, `get_my_lesson_access`, `upsert_progress`, `can_access_lesson` (via RLS/EFs), `get-video-playback-url`, `get-pdf-signed-url`, `mark_*_read` |
| **walid** | `/walid/*` | Students (disable/enable/trash/restore, profile edits via `update_student_profile` — 4-column whitelist, audited [BINDING B3]), grades, curriculum manager, codes, pricing (base price via `set_unit_price`), video/PDF management, analytics, WhatsApp settings | Staff RPCs (`disable_student`, `set_student_grade`, `update_student_profile`, CRUD RPCs, `set_lesson_trial`), `create-video-upload-session`, `upload-pdf`, `generate-unit-codes`, `list_trash`, `v_lesson_stats` |
| **admin** | `/admin/*` + all `/walid/*` | Audit log (filter/export), pricing management (global platform fee `set_platform_fee`), roles (`set_user_role`), app settings, operational stats | `v_audit_log`, `v_dashboard_metrics`, `export-audit-log`, `set_platform_fee`, `set_app_setting`, `set_user_role` |

### 3.2 Frontend project layout (BP §13.1)

```
src/
  app/            (router, providers, layout shell, RTL bootstrap)
  components/     (shared UI: buttons, modals, tables, states, Arabic formatters)
  features/
    auth/         (login, register, password change)
    student/      (dashboard, curriculum, lesson player, pdf viewer, units + purchases, notifications, profile)
    walid/        (dashboard, students, trash, grades, pricing(read), codes, curriculum manager, video/pdf manager, analytics, settings)
    admin/        (dashboard, audit log, pricing, users/roles, settings, stats)
  data/           (supabase client factory + typed RPC wrappers + feature queries)
  lib/            (guards, constants, formats, date helpers)
  types/          (DB row types mirroring schema)
```

### 3.3 Guards (BP §13.3)

- **AuthGuard:** subscribes to `onAuthStateChange`; redirects unauthenticated users to `/login`.
- **RoleGuard:** maps `profiles.role` (fetched once, cached in context) → allowed path prefixes. **[BINDING B10]** Residual documented: the client cache may be stale for a session in which a role changed server-side; authorization is never based on this cache — RLS and Edge Functions remain authoritative. The cache refreshes on next sign-in.
- **AccessGuard (student):** shows a lock state when `get_my_lesson_access(lesson_id)` reports `has_access = false` (no purchase, not a trial lesson) — **informational only**; RLS + Edge Functions remain authoritative.
- **Data access:** all mutations go through typed RPC wrappers; SELECTs through RLS-scoped queries; no direct table `UPDATE` in the app (notification mark-read uses RPCs — [BINDING B2]).

---

## 4. Route Map (BP §13.2)

| Path | Access | Notes |
|---|---|---|
| `/` | public | Landing with WhatsApp CTA — reads **only `get_public_settings()`** (whatsapp fields + platform_name, granted to anon); never raw `app_settings` |
| `/login` | public (redirects if authed) | email+password |
| `/register` | public | full form (name, email, phone, guardian, address, **grade picker** via anon-safe `list_active_grades()` — grade required for students, 0027) |
| `/student/dashboard` | student | purchased units, progress summary, notifications, WhatsApp CTA |
| `/student/curriculum` | student, content gated | grades→units tree; locked units/lessons show lock state + purchase CTA |
| `/student/lessons/:lessonId` | student, `can_access_lesson` enforced | video player + PDF viewer + progress save |
| `/student/units` | student | per-unit prices (`get_public_unit_prices`) + own purchase history (`get_my_unit_purchases`) + redeem-code form |
| `/student/notifications` | student | read/unread |
| `/student/profile` | student | view info, change password (no email edit UI) |
| `/walid/dashboard` | mr_walid/admin | stats: students/grade, purchases/revenue, most-viewed lessons, content state |
| `/walid/students` | mr_walid/admin | list, search, disable/enable, soft delete |
| `/walid/students/:id` | mr_walid/admin | profile, purchases, progress analytics |
| `/walid/students/trash` | mr_walid/admin | restore (soft-delete list) |
| `/walid/grades` | mr_walid/admin | CRUD + ordering |
| `/walid/pricing` | admin (mr_walid/teacher read-only) | per-unit prices (base, fee, total) |
| `/walid/codes` | mr_walid/admin | generate (Edge Function), revoke, list usage |
| `/walid/curriculum` | mr_walid/admin | grades→units→lessons management, statuses, reorder, trial flagging |
| `/walid/lessons/:lessonId` | mr_walid/admin | assets: upload video (session), upload PDF, replace, statuses |
| `/walid/analytics` | mr_walid/admin | progress/viewing analytics |
| `/walid/settings` | mr_walid/admin | WhatsApp config (mr_walid) |
| `/admin/dashboard` | admin | operational metrics (`v_dashboard_metrics`) |
| `/admin/audit` | admin | filterable audit log + CSV export |
| `/admin/settings` | admin | pricing/platform fees, app settings |
| `/admin/roles` | admin | role management: list users + `set_user_role(user_id, role)` (admin-only, SECURITY DEFINER, audited) |
| `*` | authed | 404 |

Admin can also reach all `/walid/*` routes (permission check allows `admin`).

---

## 5. Role Matrix

### 5.1 Capability matrix

| Capability | student | mr_walid | admin | teacher |
|---|---|---|---|---|
| Login (active account) | ✓ | ✓ | ✓ | ✓ |
| Browse own curriculum (published, own grade) | ✓ | — | — | — |
| Watch/read protected assets (trial lesson or purchased unit) | ✓ | QA preview only [BINDING B5] | QA preview only [BINDING B5] | QA preview only [BINDING B5] |
| Track own progress | ✓ | view analytics | view analytics | view analytics |
| Manage own profile (4 columns) / password | ✓ | — | — | — |
| Redeem unit code | ✓ | — | — | — |
| Read own purchases/notifications | ✓ | — | — | — |
| Mark own notifications read (RPC) | ✓ | — | — | — |
| Manage students (disable/enable/trash/restore) | — | ✓ | ✓ | — |
| Manage grades / units / lessons / assets / trial flag | — | ✓ | ✓ | ✓ |
| Generate/revoke unit codes | — | ✓ | ✓ | — |
| Read pricing | — | ✓ | ✓ | ✓ |
| Set per-unit base price (`set_unit_price`) | — | ✓ | ✓ | ✓ |
| Set global platform fee (`set_platform_fee`) | — | — | ✓ | — |
| Manage WhatsApp settings | — | ✓ (`whatsapp%` keys only) | ✓ (all settings) | — |
| Manage roles (`set_user_role`) | — | — | ✓ | — |
| Read audit logs / export | — | — | ✓ | — |
| Read `v_lesson_access` | ✓ (student-facing view) | ✗ (returns empty; staff use `v_lesson_stats`/`v_dashboard_metrics` — LOW-14) | ✗ (same) | ✗ (same) |

### 5.2 Role helper functions (BP §5.1)

```sql
is_admin()    := (SELECT role = 'admin'    FROM profiles WHERE id = auth.uid());
is_mr_walid() := (SELECT role = 'mr_walid' FROM profiles WHERE id = auth.uid());
is_teacher()  := (SELECT role = 'teacher'  FROM profiles WHERE id = auth.uid());
is_student()  := (SELECT role = 'student'  FROM profiles
                  WHERE id = auth.uid() AND status = 'active' AND deleted_at IS NULL);
```

All are STABLE, SECURITY DEFINER, `SET search_path = public`. `is_student()` returns **false** for disabled/deleted accounts → blocked everywhere content/progress/purchase logic is concerned.

### 5.3 Escalation prevention

- Role column writeable only via `set_user_role` / `set_role_by_email` (admin-only SECURITY DEFINER, audited) — the only path that mutates role.
- RLS WITH CHECK pins role/grade/status on student self-update.
- `is_student()`/`is_mr_walid()`/`is_admin()`/`is_teacher()` are not client-callable (REVOKEd; used inside RLS/EFs only).

---

## 6. Entity Map

### 6.1 Application tables (13 after Phase 5; 18 after Phases 6–7, BP §3.3)

| # | Table | Purpose | Key relations |
|---|---|---|---|
| 1 | `profiles` | One row per `auth.users`; role/status/grade/contact | id = auth.users.id (CASCADE); grade_id → grades (SET NULL) |
| 2 | `grades` | Curriculum top level; is_active + deleted_at | children: units, profiles |
| 3 | `unit_pricing` | Permanent per-unit pricing (base/fee/total) | unit_id → units (CASCADE); referenced by unit_codes (RESTRICT) |
| 4 | `unit_codes` | Single-use activation codes for a unit | unit_pricing_id → unit_pricing (RESTRICT); created_by/used_by/revoked_by → profiles/auth.users |
| 5 | `unit_purchases` | Permanent purchase history with price snapshot; UNIQUE (student_id, unit_id) | student_id → profiles (CASCADE); unit_id → units (RESTRICT); code_id → unit_codes (SET NULL) |
| 6 | `units` | Grade children | grade_id → grades (CASCADE) |
| 7 | `lessons` | Unit children; status lifecycle; is_trial | unit_id → units (CASCADE) |
| 8 | `lesson_videos` | Bunny-backed assets | lesson_id → lessons (CASCADE); referenced by progress.video_id (SET NULL) |
| 9 | `lesson_pdfs` | Storage-backed PDFs | lesson_id → lessons (CASCADE) |
| 10 | `progress` | Per student+lesson learning state | student_id → profiles (CASCADE); lesson_id → lessons (CASCADE); video_id → lesson_videos (SET NULL, nullable) |
| 11 | `notifications` | In-platform notifications with dedup | user_id → profiles (CASCADE) |
| 12 | `audit_logs` | Insert-only admin audit trail | actor_id → profiles (SET NULL; NULL = system job) |
| 13 | `app_settings` | Key/value settings (whatsapp, platform_name) | updated_by → profiles |
| 14 | `exams` (0029) | One exam per lesson | lesson_id → lessons (CASCADE) |
| 15 | `exam_questions` (0029) | MCQ/essay questions per exam | exam_id → exams (CASCADE) |
| 16 | `exam_attempts` (0029) | One attempt per student per exam | exam_id → exams (CASCADE); student_id → profiles (CASCADE) |
| 17 | `exam_answers` (0029) | Per-question answers | attempt_id → exam_attempts (CASCADE); question_id → exam_questions (CASCADE) |
| 18 | `lesson_comments` (0030) | Lesson discussions with replies | lesson_id → lessons (CASCADE); author_id → profiles (CASCADE); parent_id → lesson_comments (CASCADE) |

Plus `auth.users` (managed by Supabase; never written by application code).

### 6.2 Relationship diagram

```
auth.users ───1:1─── profiles ──N:1── grades ──1:N── units ──1:N── lessons ──1:N── lesson_videos
                       │  │  │                │           │                    │
                       │  │  │                │           │                    └──1:N── lesson_pdfs
                       │  │  │                │           │
                       │  │  │                │           └──1:N── unit_pricing ──1:N── unit_codes
                       │  │  │                │           │                        ▲
                       │  │  │                │           └──1:N── unit_purchases ──┘ (code_id, SET NULL)
                       │  │  │
                       │  │  └──1:N── notifications
                       │  │
                       │  └──1:N── audit_logs (actor, SET NULL)
                       │
                       └──1:N── progress (0..1 video pin)
app_settings (standalone; updated_by → profiles)
lessons ──1:N── exams ──1:N── exam_questions
                └──1:N── exam_attempts ──1:N── exam_answers
lessons ──1:N── lesson_comments (parent_id self-reference for replies)
```

### 6.3 Lifecycle states

| Entity | States | Transitions |
|---|---|---|
| Student (`profiles.status`) | `active` ↔ `disabled`; `deleted_at` NULL ↔ set (Trash) | `disable_student` / `enable_student` / `soft_delete_student` / `restore_student` (staff RPCs, audited) |
| Content (`status`) | `draft` → `published` → `hidden` ↔ `published` (re-publish); soft-delete any state | staff CRUD RPCs; publish sets `published_at` + `notify_new_content` |
| Video (`video_status`) | `pending_upload` → `uploading` → `processing` → `ready`; `processing` → `failed`; `ready` → `replaced` | webhook-driven via `set_video_status` (internal) |
| Purchase (`unit_purchases.status`) | `active` (never lapses) ↔ `void` (admin-voided, audited) | created only by `redeem_unit_code`; `unit_purchases_insert_via_rpc` policy blocks direct DML |
| Code (`code_status`) | `available` → `used` / `revoked` | redemption; `revoke_unit_code` (revoking a used code does NOT cancel the purchase) |
| Grade | active/deactivated (`is_active`) + soft-delete | `delete_grade` (soft) / `restore_grade`; deactivation = soft-delete equivalent [BINDING B8] |

---

## 7. Data Flows

### 7.1 Authentication flow

```
1. Register:  supabase.auth.signUp({ email, password, options: { data: { full_name, phone,
              guardian_phone, address, grade_id } } })
              -- grade_id REQUIRED for students (0027), chosen from anon-safe list_active_grades()
2. Trigger handle_new_user() on auth.users INSERT (SECURITY DEFINER, owner postgres [BINDING B1]):
      reads full_name, phone, guardian_phone, address, grade_id from raw_user_meta_data;
      FAILS CLOSED (raises) if any required meta field is missing (LOW-12); students without a
      valid, active grade_id get grade_required / grade_not_available / invalid_grade_id.
      → profiles row (role 'student', status 'active', deleted_at NULL) created atomically.
3. Login:  supabase.auth.signInWithPassword(email, password)
      → sign-in gate: block_sign_in_for_inactive_accounts() BEFORE UPDATE OF last_sign_in_at
        raises account_inactive_or_deleted if profiles.deleted_at IS NOT NULL OR status <> 'active'
        → disabled/deleted accounts cannot log in (A32/A34).
4. Session persistence: supabase-js persistSession (localStorage) + onAuthStateChange (AuthGuard).
5. Password change (authenticated): supabase.auth.updateUser({ password }).
6. Email change: blocked everywhere (no UI + block_email_change() trigger on auth.users UPDATE).
7. Staff lifecycle: disable_student()/soft_delete_student() revoke auth.sessions via service role
      where feasible (feasibility spiked in Phase 1 — LOW-18); fallback = sign-in gate + RLS + EF
      active-profile checks [BINDING B10].
8. Staff profile edits: update_student_profile(p_student_id, full_name, phone, guardian_phone,
      address) — mr_walid/admin, SECURITY DEFINER, audited, strict 4-column whitelist
      (role/grade/status/deleted_at/email untouched) [BINDING B3].
```

### 7.2 Unit code redemption flow

```
student (authenticated, active)                          RPC layer
─────────────────────────────────                        ──────────
redeem_unit_code(p_code)
   │  normalize to upper (L1)
   ▼
[SECURITY DEFINER RPC — single transaction, atomic (BP §6.3)]
  1. pg_advisory_xact_lock(hashtext('wldn_redeem_unit:' || COALESCE(p_code,'')))
                                                       -- serializes per code
  2. SELECT * FROM unit_codes WHERE code = v_code FOR UPDATE   -- row lock (belt & braces)
  3. Re-validate INSIDE transaction (error order):
       - code exists                                    → else 'code_not_found'
       - its unit exists (not deleted)                  → else 'unit_not_found'
       - unit is active ('published')                   → else 'unit_inactive'
       - code not revoked                               → else 'code_revoked'
       - code still available                           → else 'code_already_used'
       - caller is a student with an active grade       → else 'no_grade_assigned'
       - unit belongs to the student's grade            → else 'unit_not_in_student_grade'
       - no existing purchase of this unit              → else 'unit_already_purchased'
  4. UPDATE unit_codes SET status='used', used_at=now(), used_by=auth.uid()
  5. INSERT unit_purchases (student_id, unit_id, price snapshot copied from unit_pricing:
       base/fee/total — MED-5)                          -- UNIQUE (student_id, unit_id) = backstop
  6. INSERT notification unit_activated (dedup unit_activated:{purchase_id})
  7. INSERT audit_logs (unit_purchase.create)
  COMMIT
Result: exactly one success per code; second concurrent redemption sees status='used' →
        raise 'code_already_used'. Double purchase of a unit is impossible.
Manual purchase grants: NOT allowed (P12) — the ONLY path to a purchase is redeem_unit_code.
Code revocation: revoke_unit_code(code_id) flips any available/used code to 'revoked'; it does
        NOT cancel purchases already created from it.
Pricing lifecycle (staff sets the base via set_unit_price; admin sets the single global fee via
        set_platform_fee) upserts the per-unit price row (total = base + fee, generated);
        direct DML on unit_pricing is blocked by FORCE RLS.
```

### 7.3 Video lifecycle flow (Bunny)

```
Create/Select Lesson
   ↓
create-video-upload-session (POST, JWT + is_mr_walid() OR is_admin(), profile active/not-deleted)
   mode=create  → Bunny create direct upload; INSERT lesson_videos (pending_upload, is_primary=false
                  unless it is the lesson's FIRST video — MED-10)
   mode=replace → new row (pending_upload, is_primary=false) + old_video_id kept for finalize
   returns uploadUrl + videoId (scoped, safe for browser)
   ↓
Browser uploads bytes directly to Bunny Storage upload URL
   ↓
Bunny processing → webhook events (uploading → processing → ready/failed)
bunny-video-webhook (POST, public + shared webhook token — ?token= or x-webhook-token header, constant-time compare; NO Bunny-side signature secret)
   → set_video_status(video_id, new_status, ...) [internal SECURITY DEFINER, NO client grants]
     validates legal transitions; on ready: pulls duration/thumbnail; promotes is_primary=true,
     demotes old to status='replaced' (is_primary=false); finalizes replacement:
     UPDATE progress SET position=0, percent=0, is_completed=false, video_id=new
     WHERE lesson_id=:id AND video_id=:old        -- atomic with primary flip (A11)
     -- at most one primary per lesson: partial unique UNIQUE (lesson_id) WHERE is_primary
        AND deleted_at IS NULL; soft-delete clears is_primary in the same transaction [BINDING B9]
     → notify_new_content if lesson published (deduped)
   ↓
Protected playback
get-video-playback-url (GET/HEAD, JWT)
   student:  can_access_lesson(lesson_id) — trial lesson OR active purchase — profile active/not-deleted
   staff QA preview: is_mr_walid() OR is_admin() OR is_teacher() — content-visible check, NO purchase
              requirement [BINDING B5]
   server resolves the lesson's primary ready video (client never passes video_id)
   → Bunny tokenized signed URL (IP-locked HS256 DIRECTORY token, query form, TTL 20 min — S3;
     verified against the production pull zone; the docs' bcdn_token path form returns 403)
   ↓
Thumbnails (signed; the lesson_videos thumbnail_url column is NEVER sent to clients)
get-video-thumbnail-url (GET/HEAD, JWT, same gates as playback)
   → short-lived IP-locked signed thumbnail.jpg URL (same directory token as the HLS chain)
   ↓
Failure handling (R1): hourly recheck-video-states job → candidate query + live Bunny API status → `set_video_status` chains to reconcile stuck videos
   (missing/irrecoverable → failed; finished → ready with metadata); transient API errors are skipped for the next run;
   retry = new upload session.
```

### 7.4 PDF access flow

```
Upload (staff):
   upload-pdf (POST, JWT + is_mr_walid() OR is_admin(), profile active/not-deleted)
     → validate MIME/size → createSignedUploadUrl (I4 — upload-capable, not createSignedUrl)
       on private bucket pdfs, path {lesson_id}/{uuid}.pdf
     → browser uploads bytes to signed URL
     → finalize_pdf_upload(p_pdf_id) RPC: is_ready=true, promote is_primary, audit (pdf.upload)
   Replacement: upload new PDF → promote is_primary, retire old (deleted_at) — audited.

Read (student):
   get-pdf-signed-url (POST, JWT)
     → require role student, status='active', deleted_at IS NULL (non-student roles rejected — S7)
     → accept lesson_id ONLY; server resolves primary ready PDF (is_primary AND is_ready AND
       deleted_at IS NULL) — non-primary requests rejected (MED-7)
     → can_access_lesson(lesson_id) — trial-or-purchase access LIVE at every request
     → createSignedUrl (service role) TTL 10–15 min → URL + metadata
   Access re-check: every issuance re-runs can_access_lesson(); stale URLs die with TTL (R10).
   Note: blocking already-issued URLs immediately is inherent to Supabase signed URLs — documented
   limitation, mitigated by short TTL + client session expiry.

Progress on PDF-only lessons: lessons with no primary video (PDF-only) can still record progress —
   upsert_progress stores video_id = NULL, pinned to the lesson; the video-replacement guard applies
   only when a primary video exists [BINDING B4].
```

### 7.5 Notification flow

| Type | Producer | Dedup key | Once-only mechanism |
|---|---|---|---|
| `unit_activated` | `redeem_unit_code` | `unit_activated:{purchase_id}` | UNIQUE(dedup_key) + ON CONFLICT DO NOTHING |
| `new_content` | lesson → published trigger → `notify_new_content()` targeting **active purchasers of the lesson's grade only** | `new_content:{lesson_id}:{student_id}` | UNIQUE(dedup_key) |
| `system` | staff RPCs (disable, restore, …) | app-supplied key | app-managed |
| `exam_submitted` / `exam_graded` (0029) | exam attempt submit / grading completes | `exam_submitted:{attempt_id}` / `exam_graded:{attempt_id}` | UNIQUE(dedup_key) |
| `lesson_comment` / `comment_reply` (0030) | comment added | `lesson_comment:{comment_id}` / `comment_reply:{comment_id}` | UNIQUE(dedup_key) |

Read state: `is_read`/`read_at` flipped **only** via `mark_notification_read` / `mark_all_notifications_read` (SECURITY DEFINER, own rows only). Direct UPDATE on notifications is REVOKEd from authenticated (table- and column-level) — mark-read is RPC-only [BINDING B2]; the own-row RLS UPDATE policy remains as belt-and-braces (PostgreSQL has no column-scoped policies).

### 7.6 Audit flow

```
Capture paths:
  1. Trigger-based: audit_trigger() on fixed table inventory (MED-8):
       profiles, grades, units, lessons, lesson_videos, lesson_pdfs, unit_pricing,
       unit_codes, unit_purchases, app_settings  (INSERT/UPDATE/DELETE)
       (exams/exam_attempts and lesson_comments are added by Phases 6–7)
       EXCLUDED: progress, notifications (high-volume, no admin insight value)
     Fills: actor_id=auth.uid(), actor_role=get_current_role(), action=table.action,
            entity_type, entity_id=NEW/OLD.id, metadata=to_jsonb(NEW) (deltas for UPDATE),
            ip_address (best-effort from request.jwt.claims, may be NULL — L3)
     PII handling: profile metadata excludes sensitive column VALUES;
       update_own_profile logs only changed column NAMES (e.g. {"changed":["phone"]}) — MED-8.
  2. RPC-based: explicit audit_log(action, entity_type, entity_id, metadata) inside SECURITY
       DEFINER functions for events triggers can't see (e.g. failed attempts, redemptions).
  3. Real audit action values in use: unit_purchase.create (redemption), unit_code.revoke,
       unit_pricing.set, unit.trial_set, plus the table.action values from the trigger inventory.
Storage: audit_logs insert-only; no UPDATE/DELETE policies for any role; SELECT admin-only.
Export: export-audit-log (admin-only): filters (date range, action, entity, actor) → CSV
        (UTF-8 BOM for Excel/Arabic) → audit-exports bucket → 10-minute signed URL (A23).
Query: v_audit_log joins actor name/role.
```

---

## 8. Integration Plan

### 8.1 Supabase

| Service | Usage | Notes |
|---|---|---|
| Auth | Email+password; JWT sessions; password change | Sign-in gate + email-immutability triggers on `auth.users`; no OTP/forgot-password |
| Postgres | All business data; RLS; RPCs; triggers; views | Extensions: `pgcrypto`, `pg_cron`, `pg_net`; migrations in `supabase/migrations/` + consolidated `supabase/supabase-full-schema.sql` |
| Storage | Private buckets `pdfs` + `audit-exports` | No public/anon policies; all object ops via Edge Function signed URLs (service role) |
| Edge Functions | 8 request functions (incl. `get-video-thumbnail-url`) + 1 scheduled job function | Deno + TypeScript; JWT verification; secrets via `supabase secrets set` |
| Scheduling | `supabase functions schedule` (preferred) → pg_cron → pg_net → internal Edge Function → external cron (fallbacks) | One unified execution chain for `recheck_video_states` (MED-4); availability verified in Phase 1 (A19) |

### 8.2 Bunny

| Item | Value |
|---|---|
| Video hosting | One Bunny video library + pull zone with **token auth enabled** (A18) |
| Upload | Direct upload via create-upload-session (server-side API call) |
| Secrets (Edge Function env, never browser) | `BUNNY_API_KEY`, `BUNNY_LIBRARY_ID`, `BUNNY_PULL_ZONE_HOSTNAME`, `BUNNY_SIGNING_KEY` (token auth signing key) |
| Playback | IP-locked HS256 directory token (query form), TTL 20 min (S3) |
| Webhook | Shared webhook token (?token= or x-webhook-token, constant-time compare); Bunny-side signature capability unavailable on this account (R17) |
| Status reconciliation | `recheck-video-states` scheduled job re-queries Bunny API for stuck videos (R1) |
| Metadata | duration + thumbnail pulled after processing, stored on `lesson_videos` (A25) |
| Stability | `bunny_video_id` stored UNIQUE — never regenerated per playback (§8.5) |

### 8.3 Supabase Storage

| Bucket | Visibility | Access model |
|---|---|---|
| `pdfs` | private | Upload: staff via `upload-pdf` EF signed upload URL. Read: student via `get-pdf-signed-url` EF after `can_access_lesson`. No direct object policies |
| `audit-exports` | private | Admin-only; CSV written by EF, returned via short-lived signed URL |

Storage RLS enabled on both buckets; **no anonymous policies**; authenticated users have **no direct object policies** — every object operation is authorized inside Edge Functions via signed URLs (service role).

### 8.4 Edge Functions inventory

Deployment: one `supabase/functions/<name>/index.ts` per function; `supabase functions deploy`. `--no-verify-jwt` **only** for `bunny-video-webhook` (shared webhook token, verified in-function) and the scheduled job function; all others rely on default JWT verification plus in-function role checks. **All privileged functions additionally require the caller profile `status='active'` and `deleted_at IS NULL`** (A34/§5.4).

| # | Function | Method/Auth | Purpose |
|---|---|---|---|
| 1 | `create-video-upload-session` | POST, JWT + `is_mr_walid() OR is_admin()` | Bunny create upload session; inserts `lesson_videos` (pending_upload); `mode=create/replace`; `action=cancel` releases an abandoned session (0017, best-effort Bunny delete) |
| 2 | `bunny-video-webhook` | POST, **public + shared webhook token** (`?token=` or `x-webhook-token`, constant-time; no Bunny-side signature secret) | Map events → `set_video_status()` transitions; ready → duration/thumbnail; finalize replacement; `notify_new_content`; rejects unauthenticated requests |
| 3 | `get-video-playback-url` | GET/HEAD, JWT; **student** (`can_access_lesson`, active/not-deleted) **or mr_walid/admin/teacher QA preview** [BINDING B5] | Server resolves primary `ready` video; IP-locked HS256 directory token, query form (TTL 20 min); non-privileged roles rejected |
| 3b | `get-video-thumbnail-url` | GET/HEAD, JWT; same gates as row 3 | Short-lived IP-locked signed `thumbnail.jpg` (same directory token); the raw `thumbnail_url` column is never sent to clients |
| 4 | `get-pdf-signed-url` | POST, JWT; **student role only** + active/not-deleted | Server resolves primary `ready` PDF (MED-7); `can_access_lesson()`; service-role `createSignedUrl` (TTL 10–15 min) |
| 5 | `upload-pdf` | POST, JWT + `is_mr_walid() OR is_admin()` | MIME/size validation → `createSignedUploadUrl` (I4) on `pdfs`; `finalize_pdf_upload` RPC afterwards |
| 6 | `generate-unit-codes` | POST, JWT + `is_admin() OR is_mr_walid()` | Validate `unit_pricing` + count cap (≤500) → `create_unit_codes_for_staff()` (staff-guarded wrapper) → `create_unit_codes_internal()` (pgcrypto, unambiguous charset, uppercase — A22); internal function is REVOKEd from PUBLIC and has no client grants |
| 7 | `export-audit-log` | POST, JWT + `is_admin()` | Filters → CSV (UTF-8 BOM) → `audit-exports` → signed URL |
| J2 | `recheck-video-states` (scheduled) | internal endpoint (service role) | Selects stuck pre-ready videos (`pending_upload/uploading/processing`, older than threshold, not deleted) → live Bunny API status query → `set_video_status()` transition chains (missing → failed, dead statuses → failed, finished → ready with metadata); transient API errors skipped for the next run |

CORS: internal job/webhook functions (`recheck-video-states`, `bunny-video-webhook`) set no CORS headers; the deploy-time `verify_jwt` flag is `false` only for these internal endpoints, and the shared webhook token / service role is verified in-function.

### 8.5 Scheduling chain (MED-4, R4)

Jobs (`recheck_video_states`) run via **one unified execution chain — three links**:
1. **Managed schedule** — scheduled Edge Function (`supabase functions schedule`, service role).
2. **Fallback** — pg_cron job → `pg_net.http_post()` → internal job Edge Function.
3. **Final fallback** — external cron (GitHub Actions scheduled workflow) invoking the same internal job Edge Function.

The DB function is always invoked over HTTP; it is **never** driven by SELECT-side triggers (impossible — R4). Link availability verified in Phase 1 (A19).

---

## 9. Deployment Strategy (BP §2)

| Component | Deployment | Notes |
|---|---|---|
| Frontend | Static hosting (Netlify/Vercel/Cloudflare Pages) from `vite build` output | `VITE_*` envs only; never secrets |
| Edge Functions | `supabase functions deploy <name>`; secrets via `supabase secrets set` / CI | `--no-verify-jwt` only for webhook; JWT verifier pinned by project |
| Database | `supabase db push` / `supabase db migrations up` in CI with migration linting | **`supabase db reset` never runs against production (R-C)**; local only |
| Scheduling | `supabase functions schedule` | pg_cron/pg_net/external cron as fallback links |
| CI | GitHub Actions: lint → typecheck → db test → vitest → build → deploy EFs → (scheduled) smoke | R13: `supabase db diff`/dump drift check on PR |

Release controls: DB triggers version-pinned (digest recorded + unit-tested in CI — R-A); reversible migrations or verified snapshot; **production schema snapshot taken before each release (R-F)**.

---

## 10. Phase Dependency Graph (BP §15)

```
1 ─▶ 2 ─▶ 3 ─▶ 4 ─▶ 5 ─▶ 6 ──▶ 7 ──┐
                          │   │      ├─▶ 9 ─▶ 10 ─▶ 11
                          8 ─┴───────┘
```

- **8 depends on 3** (unit purchase events) **and 4/5** (content events).
- **7 depends on 2–5** (student lifecycle, unit purchases, curriculum, videos).
- 7 and 8 run in parallel after 6 (7 ‖ 8).
- Phase 0 (this phase): documentation only; acceptance = internally consistent, no open contradictions, assumptions recorded (BP §15).

| Phase | Deliverables | Acceptance (summary) |
|---|---|---|
| 0 | ARCHITECTURE.md, DATABASE.md, SECURITY.md, TESTING.md, route map, role matrix, entity map, risk list | Internally consistent; no contradictions; assumptions recorded |
| 1 | Migrations, full schema, RLS, RPCs, triggers, seeds, storage, spikes | `supabase db reset` (local) applies cleanly; roles cannot escalate; sign-in gate present; session-deletion spike recorded |
| 2 | Auth + account lifecycle | Every lifecycle transition works; disabled/deleted cannot log in |
| 3 | Grades, per-unit pricing, unit codes, redemption | Full activation lifecycle; double redemption impossible |
| 4 | Curriculum + content management | Drafts hidden; restore works; audit rows exist |
| 5 | Bunny video | End-to-end session→upload→webhook→ready→playback; replacement deterministic; forged webhooks rejected |
| 6 | Student learning experience (+ exams, 0029) | Progress persists/resumes; 90% deterministic; trial/purchase gating locks content |
| 7 | Dashboards + analytics (+ comments, 0030) | Real data; no mocks; responsive |
| 8 | Notifications + audit | Activation notification exactly once; CSV correct; `set_user_role` escalation tests |
| 9 | Security hardening | RLS review, IDOR, secret scan, race tests all pass/fixed |
| 10 | QA/Verification | All suites green; no known blockers |
| 11 | Production readiness | All PLAN §19 questions answered YES; no `db reset` vs prod; snapshots |

---

## 11. Risk List

Full register: BLUEPRINT.md §18 (R1–R18). Top architecture-level risks and their architectural mitigations:

| # | Risk | Architectural mitigation |
|---|---|---|
| R1 | Bunny webhook lost → stuck processing | Shared webhook token check + hourly reconciliation job + retry UI |
| R2 | Redemption race | Advisory lock + FOR UPDATE + UNIQUE(student_id, unit_id) backstop + race tests |
| R4 | Scheduler/pg_cron/pg_net unavailability | Unified 3-link execution chain; verified in Phase 1 |
| R6 | RLS subquery performance | STABLE SECURITY DEFINER helpers, targeted indexes, pooling |
| R9/R10 | Signed URL sharing beyond expiry | Short TTLs + live checks at issuance; documented residual |
| R13 | Migration drift | CI `supabase db diff` / dump compare |
| R18 | Broken prod migration | Version-pinned triggers + tests; no db reset vs prod; pre-release snapshots |
| LOW-11 | Hard-delete CASCADE destroys history | Soft-delete-first runbook; explicit archival decision required |
| LOW-13 | Account-status enumeration | Accepted tradeoff for clear Arabic error message; UUID-keyed accounts |
| LOW-18 | `DELETE FROM auth.sessions` feasibility | Phase 1 spike; fallback = sign-in gate + RLS + EF checks |

---

## 12. Assumptions

All assumptions are registered in BLUEPRINT.md §19 as A1–A34 and referenced inline above (e.g. A4 no time limits — purchases are permanent, A5 one purchase per unit per student, A11 replacement policy, A12 completion irreversibility, A13 email immutability, A22 code format, A33 grade-binding, A34 sign-in gate). Phase 0 introduces no new assumptions; where behavior was refined at the architecture gate, the binding requirement is flagged **[BINDING]** and recorded in PLAN.md §22.2.
