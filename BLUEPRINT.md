# منصة مستر وليد عونى التعليمية — Execution Blueprint

**Source of truth:** `PLAN.md` (Master Technical Implementation Plan)
**Status:** Contract document for all implementation phases (0–11).
**Project root:** `C:\Users\admin\Desktop\WALIDAWNY` (greenfield project; see PLAN.md §22 for live implementation status).
**Frontend env (existing):**
- `VITE_SUPABASE_URL=https://nfusbrktrqfrnaetetmr.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<provided separately>`

All assumptions are collected in **Section 19 (Assumptions Register)** and referenced as `A#` throughout.

---

## 1. SYSTEM OVERVIEW

### 1.1 Product
An Arabic-first, RTL educational platform for "Mr. Walid". Students buy **per-unit permanent (lifetime) access**: one activation code opens **one unit forever** (`unit_purchases` with no time limit) in a video+PDF curriculum organized as **Grade → Unit → Lesson → (Video, PDF)**. Trial lessons (`lessons.is_trial`) open without any purchase; there is no all-inclusive package. Mr. Walid manages curriculum, students, unit purchases and content; an Admin additionally manages system configuration, per-unit pricing, roles and audit logs.

### 1.2 Users
| Role | Capability summary | Notes |
|---|---|---|
| `student` | Browse curriculum, watch videos, read PDFs, track progress, manage own profile/password, read own notifications, redeem one unit code, view own purchases | Cannot change grade/role/email, cannot modify purchase state, cannot touch other users' data |
| `mr_walid` | Manage students (disable/enable, soft-delete/restore via Trash), grades, curriculum (units/lessons/videos/PDFs), unit codes, pricing is read-only, WhatsApp setting, progress analytics | Cannot read audit logs, cannot escalate role, cannot manage pricing |
| `admin` | Everything Mr. Walid can do, **plus**: per-unit pricing/platform fee management, role/permission management, audit logs (read + export), system settings, operational statistics | Highest privilege |
| `teacher` | Curriculum/lesson management, trial flagging (`set_lesson_trial`), student grade assignment, progress analytics | Cannot manage pricing, roles, audit logs, or WhatsApp settings |

### 1.3 Layered Architecture
```
Presentation (React SPA, RTL)
    ↓
Application / Feature Services (React hooks + feature modules)
    ↓
Supabase Data Access (supabase-js client with PUBLISHABLE key; typed RPC wrappers)
    ↓
Supabase PostgreSQL / Auth / Storage            ← authoritative authorization (RLS)
        ↑
Supabase Edge Functions (Deno/TypeScript)       ← all privileged operations
        ↓
External privileged APIs (Bunny Video API, Bunny Storage, Supabase Storage signed URLs, CSV export)
```

**Where Edge Functions sit:** between the browser and any privileged external service. The browser **never** holds service-role keys, Bunny API keys or signing secrets. The Edge Function layer receives the user's JWT (`Authorization: Bearer`), verifies it (`supabase.auth.getUser()`), re-checks role + business rules **server-side**, performs the privileged call, and returns only what the caller may see.

### 1.4 Privileged Operations (Edge Functions only — never browser)
1. Bunny: create upload session (direct upload to Bunny Storage), webhook handling of processing states, tokenized/signed playback URL generation, video replacement.
2. Supabase Storage: signed PDF URLs (access-aware), PDF upload authorization.
3. Unit code generation (`generate-unit-codes`, staff-only).
4. Audit log CSV export.
5. Any operation requiring the service-role key or a third-party secret.

---

## 2. TECH STACK

| Layer | Choice | Justification |
|---|---|---|
| Frontend framework | **Vite + React + TypeScript** | Existing env vars are `VITE_*` → Vite is already implied. React 18/19, TS strict. Fast DX, standard Supabase ecosystem support. |
| Styling | **Tailwind CSS** with **RTL** (`dir="rtl"` on `<html>`, logical properties, `rtl` variant config) | Rapid consistent UI; logical properties handle RTL natively; Arabic typography via system font stack + `font-family` for Arabic. |
| Routing | **React Router v6/v7** | Declarative routing with guards; role-based route maps (Section 13). |
| Data access | **@supabase/supabase-js** (v2) | Single typed client; RLS enforced server-side; RPC calls for mutations. |
| Edge Functions | **Deno + TypeScript** via `supabase/functions/*`, deployed with **Supabase CLI** (`supabase functions deploy`) | Native Supabase Edge Runtime; `createClient` with service-role key server-side only; `Authorization` JWT verified per request. |
| Database | **Supabase Postgres** (migrations in `supabase/migrations/`, final consolidated `supabase/supabase-full-schema.sql`) | PLAN §5 mandates `supabase/migrations/` + `supabase-full-schema.sql`. |
| Testing | **Vitest + React Testing Library** (unit/component), **Playwright** (E2E), **pgTAP** via `supabase test db` (SQL/RLS), **Deno test** for Edge Functions, custom concurrent race harness for code redemption | Covers all four layers; pgTAP is the Supabase-sanctioned DB test tool. |
| CI | **GitHub Actions** (lint → typecheck → `supabase test db` → vitest → build → deploy edge functions → optional Playwright smoke) | Greenfield repo; free, ubiquitous. |
| Package manager | **pnpm** | Fast, deterministic lockfile. |
| Env handling | `VITE_*` for public values; `.env.example` committed; Edge Function secrets via `supabase secrets set` | PLAN §16 requires `.env.example`. |
| Lint/format | **ESLint + Prettier** (flat config), `deno lint` for functions | Consistency across TS/Deno. |

**Deployment decision:** Frontend → static hosting (Netlify/Vercel/Cloudflare Pages, output from `vite build`). Edge Functions → `supabase functions deploy` with secrets injected from CI secrets; JWT verifier pinned (supabase-js uses project JWT secret automatically). Database → `supabase db push` / `supabase db reset` in CI with migration linting. No Docker needed for local dev beyond Supabase CLI.

---

## 3. DATABASE ARCHITECTURE

### 3.1 Design Principles
- UUID PKs, `timestamptz`, explicit FKs with declared `ON DELETE` behavior, unique + check constraints, targeted indexes.
- Enums **only** where the domain value set is stable (roles, statuses).
- No duplicated data; history preserved (purchases, redemptions) — never overwritten.
- Soft-delete via `deleted_at timestamptz NULL` on business entities (students, content); hard deletes are never performed in normal application flows.
- All schema in `supabase/migrations/*.sql` (ordered) + consolidated `supabase/supabase-full-schema.sql`, idempotent (`CREATE OR REPLACE`, `DO $$ ... IF NOT EXISTS` where practical).
- Extensions: `pgcrypto` (code generation), `pg_cron` (scheduling fallback), `pg_net` (pg_cron→internal HTTP calls) — all three declared in the migration extension list.
- Storage inventory included in migrations per PLAN §5: `INSERT INTO storage.buckets` for `pdfs` and `audit-exports`, storage-level RLS enabled, **no anonymous policies** (Section 3.7).
- `updated_at` maintenance via a single `set_updated_at()` BEFORE UPDATE trigger attached to every table with an `updated_at` column.
- **No time limits anywhere:** no time-limit columns, no `duration_days`, no scheduled expiry job. Access is granted permanently by code redemption (`unit_purchases.status='active'` never lapses) or opened free via trial lessons.

### 3.2 Enums
```sql
CREATE TYPE public.user_role         AS ENUM ('student','mr_walid','admin','teacher');
CREATE TYPE public.account_status    AS ENUM ('active','disabled');
CREATE TYPE public.unit_purchase_status AS ENUM ('active','void');
CREATE TYPE public.code_status       AS ENUM ('available','used','revoked');
CREATE TYPE public.content_status    AS ENUM ('draft','published','hidden');
CREATE TYPE public.video_status      AS ENUM ('pending_upload','uploading','processing','ready','failed','replaced');
CREATE TYPE public.notification_type AS ENUM ('new_content','unit_activated','system');
-- Phase 6 (0029): ALTER TYPE notification_type ADD VALUE 'exam_submitted'; ADD VALUE 'exam_graded';
--   CREATE TYPE public.exam_question_type AS ENUM ('mcq','essay');
-- Phase 7 (0030): ALTER TYPE notification_type ADD VALUE 'lesson_comment'; ADD VALUE 'comment_reply';
```

### 3.3 Tables (13 application tables after Phase 5; 18 after Phases 6–7)

**`profiles`** — one row per `auth.users` (role: student default).
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, FK → `auth.users(id)` ON DELETE CASCADE |
| `full_name` | text | NOT NULL |
| `phone` | text | NOT NULL, UNIQUE, CHECK Egyptian format (A17) |
| `guardian_phone` | text | NOT NULL, CHECK Egyptian format (may repeat across students) |
| `address` | text | NOT NULL |
| `grade_id` | uuid | NOT NULL for students (required at sign-up, 0027), FK → `grades(id)` ON DELETE SET NULL |
| `role` | user_role | NOT NULL DEFAULT 'student' |
| `status` | account_status | NOT NULL DEFAULT 'active' |
| `deleted_at` | timestamptz | NULL (soft-delete/Trash) |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |
- Indexes: `idx_profiles_grade` ON `(grade_id)`, `idx_profiles_role` ON `(role)`, partial index `idx_profiles_trash ON (id) WHERE deleted_at IS NOT NULL`.
- Triggers: `handle_new_user()` on `auth.users` INSERT (creates profile from `raw_user_meta_data`; **grade_id required for students**), `block_email_change()` on `auth.users` UPDATE (A13), `block_sign_in_for_inactive_accounts()` on `auth.users` BEFORE UPDATE OF `last_sign_in_at` (A34), `set_updated_at()` BEFORE UPDATE (all tables with `updated_at`, §3.1).

**`grades`**
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | NOT NULL, UNIQUE |
| `sort_order` | int | NOT NULL DEFAULT 0 |
| `is_active` | boolean | NOT NULL DEFAULT true |
| `deleted_at` | timestamptz | NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |

- Seeded with three default grades (idempotent, 0027); registration lists them via anon-safe `list_active_grades()`.
- **[BINDING B8]** Deactivation (`is_active=false`) is the soft-delete equivalent: students lose access immediately; `can_access_lesson()` and student RLS include `AND is_active`.

**`unit_pricing`** — permanent per-unit pricing.
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `unit_id` | uuid | NOT NULL, UNIQUE, FK → `units(id)` ON DELETE CASCADE |
| `base_price` | numeric(10,2) | NOT NULL, CHECK (`base_price >= 0`) |
| `platform_fee` | numeric(10,2) | NOT NULL DEFAULT 0, CHECK (`platform_fee >= 0`) |
| `total_price` | numeric(10,2) | GENERATED ALWAYS AS (base_price + platform_fee) STORED (A6) |
| `is_active` | boolean | NOT NULL DEFAULT true |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |

- Upserted exclusively via `set_unit_price` (staff — base price only) and `set_platform_fee` (admin — global fixed fee), both audited. FORCE RLS; no direct DML policies.

**`unit_codes`** — one-time activation codes for a unit.
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `code` | text | NOT NULL, UNIQUE, stored uppercase, CHECK `code = upper(code)` AND format `^WLDN-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$` (unambiguous charset: no 0/O, 1/I — A22) |
| `unit_pricing_id` | uuid | NOT NULL, FK → `unit_pricing(id)` ON DELETE RESTRICT |
| `status` | code_status | NOT NULL DEFAULT 'available' |
| `created_by` | uuid | NOT NULL, FK → `auth.users(id)` |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |
| `used_at` | timestamptz | NULL |
| `used_by` | uuid | NULL, FK → `profiles(id)` |
| `revoked_at` / `revoked_by` | timestamptz / uuid | NULL / FK → `auth.users(id)` |
| `note` | text | NULL |

- Students never see raw codes (RLS: admin/mr_walid only).

**`unit_purchases`** — permanent purchase history with price snapshot.
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `student_id` | uuid | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE (profiles are only soft-deleted → history preserved) |
| `unit_id` | uuid | NOT NULL, FK → `units(id)` ON DELETE RESTRICT |
| `base_price` | numeric(10,2) | NOT NULL, CHECK (`base_price >= 0`) — **price snapshot copied from `unit_pricing` at redemption** (MED-5) |
| `platform_fee` | numeric(10,2) | NOT NULL DEFAULT 0, CHECK (`platform_fee >= 0`) — price snapshot copied at redemption |
| `total_price` | numeric(10,2) | GENERATED ALWAYS AS (base_price + platform_fee) STORED — price snapshot copied at redemption |
| `code_id` | uuid | NULL, FK → `unit_codes(id)` ON DELETE SET NULL |
| `status` | unit_purchase_status | NOT NULL DEFAULT 'active' |
| `purchased_at` | timestamptz | NOT NULL DEFAULT now() |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |
- UNIQUE `(student_id, unit_id)` — physically prevents double purchase of a unit.
- Indexes: `idx_purchases_student` ON `(student_id)`, `idx_purchases_unit` ON `(unit_id)`.
- Access is **permanent** — `status='active'` never lapses; no time-limit column exists on any table.

**`units`**
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `grade_id` | uuid | NOT NULL, FK → `grades(id)` ON DELETE CASCADE |
| `name` | text | NOT NULL, UNIQUE `(grade_id, name)` |
| `sort_order` | int | NOT NULL DEFAULT 0 |
| `status` | content_status | NOT NULL DEFAULT 'draft' |
| `deleted_at` | timestamptz | NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |
- Index `(grade_id, sort_order)`.

**`lessons`**
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `unit_id` | uuid | NOT NULL, FK → `units(id)` ON DELETE CASCADE |
| `title` | text | NOT NULL |
| `description` | text | NULL |
| `sort_order` | int | NOT NULL DEFAULT 0 |
| `status` | content_status | NOT NULL DEFAULT 'draft' |
| `is_trial` | boolean | NOT NULL DEFAULT false (free trial lesson; max one per unit among live lessons) |
| `published_at` | timestamptz | NULL |
| `deleted_at` | timestamptz | NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |
- Index `(unit_id, sort_order)`. Partial UNIQUE `(unit_id) WHERE is_trial AND deleted_at IS NULL` — at most one trial lesson per unit. Trigger: on status→published, calls `notify_new_content()` (deduped, A28).

**`lesson_videos`** — Bunny-backed assets (A2: one primary per lesson, multiple allowed).
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `lesson_id` | uuid | NOT NULL, FK → `lessons(id)` ON DELETE CASCADE |
| `bunny_video_id` | text | NOT NULL UNIQUE (stable Bunny identifier) |
| `bunny_library_id` | text | NOT NULL |
| `title` | text | NULL |
| `status` | video_status | NOT NULL DEFAULT 'pending_upload' |
| `duration_seconds` | int | NULL |
| `thumbnail_url` | text | NULL |
| `is_primary` | boolean | NOT NULL DEFAULT false (never auto-true on insert; promoted explicitly by `set_video_status`/webhook finalize — MED-10) |
| `error_message` | text | NULL |
| `sort_order` | int | NOT NULL DEFAULT 0 |
| `deleted_at` | timestamptz | NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |
- Partial UNIQUE: `UNIQUE (lesson_id) WHERE is_primary AND deleted_at IS NULL` → exactly one primary per lesson; soft-delete of a video clears `is_primary` in the same transaction (architecture-gate binding B9). Index `(lesson_id)`.

**`lesson_pdfs`** — Supabase Storage-backed files.
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `lesson_id` | uuid | NOT NULL, FK → `lessons(id)` ON DELETE CASCADE |
| `storage_path` | text | NOT NULL UNIQUE (path inside `pdfs` bucket) |
| `original_name` | text | NOT NULL |
| `size_bytes` | bigint | NULL |
| `mime_type` | text | NOT NULL DEFAULT 'application/pdf' |
| `is_primary` | boolean | NOT NULL DEFAULT true (only the primary PDF is exposed to students; promote explicitly on replacement) |
| `is_ready` | boolean | NOT NULL DEFAULT false (set true after upload completes) |
| `deleted_at` | timestamptz | NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |
- Partial UNIQUE `(lesson_id) WHERE is_primary AND deleted_at IS NULL`.

**`progress`** — one row per student+lesson.
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `student_id` | uuid | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `lesson_id` | uuid | NOT NULL, FK → `lessons(id)` ON DELETE CASCADE |
| `video_id` | uuid | NULL, FK → `lesson_videos(id)` ON DELETE SET NULL (the video version this progress refers to — replacement policy A11) |
| `position_seconds` | int | NOT NULL DEFAULT 0, CHECK (`>= 0`) |
| `percent_completed` | numeric(5,2) | NOT NULL DEFAULT 0, CHECK (`0 <= percent_completed <= 100`) |
| `is_completed` | boolean | NOT NULL DEFAULT false |
| `last_watched_at` | timestamptz | NULL |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() |
- UNIQUE `(student_id, lesson_id)`. Index `(lesson_id)` for analytics.

**`notifications`**
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `type` | notification_type | NOT NULL |
| `title` | text | NOT NULL |
| `body` | text | NULL |
| `dedup_key` | text | NULL, UNIQUE (per-user unique events; see 3.4) |
| `is_read` | boolean | NOT NULL DEFAULT false |
| `read_at` | timestamptz | NULL |
| `entity_type` | text | NULL (e.g. 'lesson','unit_purchases','exam_attempts','lesson_comments') |
| `entity_id` | uuid | NULL |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |
- Index `(user_id, is_read, created_at desc)`.

**`audit_logs`** — admin-only.
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `actor_id` | uuid | NULL (NULL = system job), FK → `profiles(id)` ON DELETE SET NULL |
| `actor_role` | user_role | NULL |
| `action` | text | NOT NULL (e.g. 'student.disable', 'lesson.publish', 'unit_purchase.create') |
| `entity_type` | text | NOT NULL |
| `entity_id` | uuid | NULL |
| `metadata` | jsonb | NULL |
| `ip_address` | text | NULL (best-effort, may be NULL — L3) |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |
- Indexes: `(created_at)`, `(action)`, `(entity_type, entity_id)`, `(actor_id)`.
- Populated by a **trigger** (`audit_trigger()`) on a fixed table inventory (MED-8): `profiles`, `grades`, `units`, `lessons`, `lesson_videos`, `lesson_pdfs`, `unit_pricing`, `unit_codes`, `unit_purchases`, `app_settings` — for INSERT/UPDATE/DELETE + explicit `audit_log()` calls inside SECURITY DEFINER RPCs (Section 12). `progress` and `notifications` are **explicitly excluded** (high-volume, student-owned, no admin insight value). `exams`/`exam_attempts` (0029) and `lesson_comments` (0030) are added to the inventory.

**`app_settings`**
| Column | Type | Constraints |
|---|---|---|
| `key` | text | PK (e.g. `whatsapp_number`, `whatsapp_default_message`, `platform_name`) |
| `value` | jsonb | NOT NULL |
| `description` | text | NULL |
| `updated_by` | uuid | NULL, FK → `profiles(id)` |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() |

**`auth.users`** — managed by Supabase (email + password). Never written by application code.

**Phase 6 additions (0029):**
- **`exams`** — one exam per lesson: `id` PK; `lesson_id` NOT NULL FK → `lessons(id)` ON DELETE CASCADE; `title` text NOT NULL; `sort_order` int NOT NULL DEFAULT 0; `passing_score` int NOT NULL DEFAULT 50 CHECK (0–100); `deleted_at` NULL; `created_at`/`updated_at`.
- **`exam_questions`** — `id` PK; `exam_id` NOT NULL FK → `exams(id)` ON DELETE CASCADE; `type` exam_question_type NOT NULL DEFAULT 'mcq'; `prompt` text NOT NULL; `choices` jsonb NULL (MCQ); `correct_index` int NULL (MCQ); `max_score` numeric(5,2) NOT NULL DEFAULT 1 CHECK (`max_score > 0`); `sort_order` int NOT NULL DEFAULT 0.
- **`exam_attempts`** — `id` PK; `exam_id` NOT NULL FK → `exams(id)` ON DELETE CASCADE; `student_id` NOT NULL FK → `profiles(id)` ON DELETE CASCADE; `status` text NOT NULL DEFAULT 'submitted' CHECK IN ('submitted','graded'); `auto_score`/`manual_score`/`final_score` numeric(5,2) NULL; `graded_by` uuid NULL FK → `profiles(id)`; `graded_at` timestamptz NULL; `submitted_at` timestamptz NOT NULL DEFAULT now(). UNIQUE `(exam_id, student_id)` — one attempt per exam per student.
- **`exam_answers`** — `id` PK; `attempt_id` NOT NULL FK → `exam_attempts(id)` ON DELETE CASCADE; `question_id` NOT NULL FK → `exam_questions(id)` ON DELETE CASCADE; `choice_index` int NULL (MCQ); `answer_text` text NULL (essay); `score` numeric(5,2) NULL (after grading).

**Phase 7 additions (0030):**
- **`lesson_comments`** — `id` PK; `lesson_id` NOT NULL FK → `lessons(id)` ON DELETE CASCADE; `author_id` NOT NULL FK → `profiles(id)` ON DELETE CASCADE; `parent_id` uuid NULL FK → `lesson_comments(id)` ON DELETE CASCADE (replies); `body` text NOT NULL CHECK (`length(btrim(body)) > 0 AND length(btrim(body)) <= 1000`); `status` text NOT NULL DEFAULT 'visible' CHECK IN ('visible','removed'); `created_at` timestamptz NOT NULL DEFAULT now(). Index `(lesson_id)`.

### 3.4 Deduplication keys for notifications (A28)
| Event | dedup_key pattern |
|---|---|
| Unit activated | `unit_activated:{purchase_id}` |
| New content | `new_content:{lesson_id}:{student_id}` |
| Exam submitted (0029) | `exam_submitted:{attempt_id}` |
| Exam graded (0029) | `exam_graded:{attempt_id}` |
| Lesson comment / reply (0030) | `lesson_comment:{comment_id}` / `comment_reply:{comment_id}` |

### 3.5 Views
| View | Purpose |
|---|---|
| `v_lesson_access` | published, non-deleted lessons with per-user `can_access` (uses `can_access_lesson()`) |
| `v_student_progress_summary` | per student: percent per grade/unit, completion counts |
| `v_lesson_stats` | views/plays/completions per lesson (from progress) for analytics |
| `v_dashboard_metrics` | staff stats: totals (students active/disabled, purchasers, published/hidden lessons, codes available/used) |
| `v_audit_log` | audit_logs + actor name/role joined |

All views use default **SECURITY INVOKER** semantics (no `SECURITY DEFINER`/`security_barrier`), so per-row RLS of the underlying tables still applies to the invoking user (L5).

**Note (LOW-14):** `v_lesson_access` is student-facing (returns empty for staff because `can_access_lesson()` requires `is_student()`). Staff dashboards must use the dedicated staff views/queries (`v_lesson_stats`, `v_dashboard_metrics`, direct staff-scoped queries), never `v_lesson_access`.

### 3.6 RPC Functions (signatures)
```sql
-- auth/roles
handle_new_user()                TRIGGER (auth.users INSERT) SECURITY DEFINER   -- reads full_name, phone, guardian_phone, address AND grade_id from raw_user_meta_data (0027); grade_id REQUIRED for students; FAILS CLOSED (raises grade_required / grade_not_available / invalid_grade_id for missing/invalid grade) and if any required meta field is missing (admin-created users must include them; intended behavior — LOW-12)
block_email_change()             TRIGGER (auth.users BEFORE UPDATE) SECURITY DEFINER  -- raises if OLD.email IS DISTINCT FROM NEW.email; no-op otherwise; WHEN clause, never fires on INSERT (S6/A13)
block_sign_in_for_inactive_accounts() TRIGGER (auth.users BEFORE UPDATE OF last_sign_in_at) SECURITY DEFINER  -- raises when profiles.status <> 'active' OR deleted_at IS NOT NULL (A34)
set_updated_at()                 TRIGGER (BEFORE UPDATE on all tables with updated_at)  -- sets updated_at = now()
get_current_role()          RETURNS user_role                                    -- from auth.uid()
is_student() / is_mr_walid() / is_admin() / is_teacher()  RETURNS boolean  STABLE SECURITY DEFINER
get_public_settings()       RETURNS jsonb   SECURITY DEFINER (SET search_path = public — LOW-15), GRANT EXECUTE TO anon+authenticated  -- returns ONLY whatsapp_number, whatsapp_default_message, platform_name; nothing else leaks
list_active_grades()        RETURNS SETOF grades  SECURITY DEFINER, pinned search_path, GRANT EXECUTE TO anon+authenticated  -- returns ONLY id/name/sort_order of active, non-deleted grades (0027; the only anon surface for grade data)

-- student self-service
update_own_profile(p_full_name text, p_phone text, p_guardian_phone text, p_address text)   -- SECURITY DEFINER; whitelisted to the 4 editable columns only
redeem_unit_code(p_code text) RETURNS unit_purchases  -- SECURITY DEFINER; atomic (Section 6); normalizes input code to upper() (L1); error order: code_not_found → unit_not_found → unit_inactive → code_revoked → code_already_used → no_grade_assigned → unit_not_in_student_grade → unit_already_purchased; access_denied if not a student
get_my_unit_purchases() RETURNS SETOF unit_purchases  -- own rows only, newest first
get_my_lesson_access(p_lesson_id uuid) RETURNS jsonb  -- SECURITY DEFINER STABLE; player gate payload: has_access, has_purchase, is_trial, unit_id, unit_name, price
upsert_progress(p_lesson_id uuid, p_position_seconds int, p_percent numeric) RETURNS progress -- SECURITY DEFINER (Section 11; video-pinning guard M4)
mark_notification_read(p_notification_id uuid)        -- SECURITY DEFINER; own rows only
mark_all_notifications_read()                         -- SECURITY DEFINER; own rows only

-- staff
set_user_role(p_user_id uuid, p_role user_role)       -- SECURITY DEFINER + audit (user.role_change); admin-only; the ONLY path that mutates role
set_role_by_email(p_email text, p_role user_role)      -- SECURITY DEFINER + audit; admin-only (0023)
set_student_grade(p_student_id uuid, p_grade_id uuid) -- SECURITY DEFINER + audit
update_student_profile(p_student_id uuid, p_full_name text, p_phone text, p_guardian_phone text, p_address text) -- SECURITY DEFINER + audit (mr_walid/admin; 4-column whitelist — architecture-gate binding B3)
disable_student(p_student_id uuid) / enable_student(p_student_id uuid)   -- SECURITY DEFINER + audit; disable also revokes auth.sessions via service role (A34)
soft_delete_student(p_student_id uuid) / restore_student(p_student_id uuid) -- SECURITY DEFINER + audit; delete also revokes auth.sessions via service role (A34)
list_trash() RETURNS SETOF profiles   SECURITY DEFINER  -- deleted_at IS NOT NULL; mr_walid/admin
set_unit_price(p_unit_id uuid, p_base_price numeric) -- SECURITY DEFINER + audit (unit_pricing.upsert); staff (admin/mr_walid/teacher); fee read from app_settings
set_platform_fee(p_fee numeric)               -- SECURITY DEFINER + audit; ADMIN ONLY; global fixed fee -> app_settings + every unit_pricing row
get_platform_fee() RETURNS numeric            -- public read (anon + authenticated); base + fee + total for the landing page
list_unit_pricing() RETURNS SETOF unit_pricing        -- read-only, no audit; staff surface
create_unit_codes_internal(p_unit_pricing_id uuid, p_count int, p_note text) RETURNS SETOF unit_codes  -- SECURITY DEFINER; Edge-Function-only — NO client grants (REVOKEd from PUBLIC)
create_unit_codes_for_staff(p_unit_pricing_id uuid, p_count int, p_note text) RETURNS SETOF unit_codes  -- SECURITY DEFINER + audit; staff-guarded EF entry point (is_admin() OR is_mr_walid() → permission_denied); delegates to create_unit_codes_internal; granted to authenticated
list_codes_by_unit(p_unit_id uuid) RETURNS SETOF unit_codes  -- read-only; admin/mr_walid
revoke_unit_code(p_code_id uuid)                      -- SECURITY DEFINER + audit; available/used → revoked; does NOT cancel the purchase created from the code
list_all_unit_purchases(p_student_id uuid) RETURNS SETOF unit_purchases  -- read-only; staff view of a student's purchases
unit_purchase_stats() RETURNS jsonb                    -- read-only, no audit; staff aggregates
set_lesson_trial(p_lesson_id uuid, p_is_trial boolean) -- SECURITY DEFINER + audit (unit.trial_set); staff; atomically clears any prior trial in the unit then sets target; lesson_not_found if missing
create_unit / update_unit / delete_unit(soft) / restore_unit / create_lesson / update_lesson / publish_lesson / hide_lesson / soft_delete_lesson / restore_lesson / delete_grade(soft) / restore_grade ... -- SECURITY DEFINER + audit + notify_new_content on publish (LOW-17)
set_app_setting(p_key text, p_value jsonb)                            -- mr_walid: whatsapp only; admin: all
get_dashboard_stats() RETURNS jsonb                   -- read-only, no audit; is_admin() OR is_mr_walid() OR is_teacher() → permission_denied; keys: students, purchases, content, engagement, by_grade, top_units, recent_purchases
list_audit_logs(...) / count_audit_logs(...)           -- read-only, no audit; admin-only; filtered newest-first + totals (0019)

-- system (execution: scheduled Edge Functions preferred; pg_cron → pg_net → internal Edge Function fallback — §8.5/R4)
recheck_video_states()  -- reconcile stuck Bunny videos; SECURITY DEFINER
set_video_status(video_id uuid, new_status video_status, ...)  -- internal, NO client grants (MED-6/§8.2); promotes/demotes is_primary, audits
finalize_pdf_upload(p_pdf_id uuid)  -- marks is_ready, audits; SECURITY DEFINER (client-callable, staff only via RLS guards)
audit_log(action text, entity_type text, entity_id uuid, metadata jsonb)  -- internal, NO client grants; called by RPCs/triggers
notify_new_content(p_lesson_id uuid)  -- SECURITY DEFINER; deduped; targets ACTIVE PURCHASERS of the lesson's grade only (M1/§10); bulk fan-out acceptable at current scale — consider Edge-Function fan-out later (LOW-19)
can_access_lesson(p_lesson_id uuid) RETURNS boolean  -- SECURITY DEFINER STABLE (Section 5.3): staff see any live lesson; students need published lesson+unit in own ACTIVE grade + active profile + (lessons.is_trial OR active unit_purchases)
```

Phase 6 (0029) adds: exam CRUD (staff), `grade_exam_attempt` (staff essay grading → `final_score` + `exam_graded`), attempt submit + access-gated read helpers (guard via `can_access_lesson(exam.lesson_id)`). Phase 7 (0030) adds: `add_lesson_comment`, `delete_lesson_comment`, `list_lesson_comments` (own-or-staff delete; `lesson_comment`/`comment_reply` notifications).

### 3.7 Storage Buckets
| Bucket | Visibility | Policy |
|---|---|---|
| `pdfs` | **private** | No public SELECT. Uploads: mr_walid/admin only via Edge Function-signed upload URL. Reads: signed URL from `get-pdf-signed-url` Edge Function after `can_access_lesson` (trial or purchase). |
| `audit-exports` | **private** | Admin-only; CSV exports written by Edge Function, returned via short-lived signed URL. |

Storage RLS: no anonymous policies; all object access goes through signed URLs issued by Edge Functions (Section 9).

**Storage migration inventory (PLAN §5 — created in migrations, reproduced in `supabase-full-schema.sql`):**
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdfs','pdfs', false), ('audit-exports','audit-exports', false)
ON CONFLICT (id) DO NOTHING;
-- Storage RLS enabled on both buckets; NO anonymous (anon) policies;
-- authenticated users have NO direct object policies — every object operation
-- (upload/read/delete) is authorized inside Edge Functions via signed URLs (service role).
```

### 3.8 Seed/Config Data (in migrations)
- `app_settings`: `platform_name`, `whatsapp_number`, `whatsapp_default_message`.
- `grades`: three default grades seeded idempotently (0027); registration reads them via `list_active_grades()`.
- Seed `admin` and `mr_walid` profiles+users via migration with password injected from CI secret (A21).

---

## 4. AUTH ARCHITECTURE

### 4.1 Rules (from PLAN §2)
- Email + password registration; email required + unique (auth.enforce).
- No OTP, no forgot-password in MVP (A14).
- Password change allowed while authenticated (`supabase.auth.updateUser({password})`).
- **Email change: forbidden everywhere** — no UI, and a DB trigger on `auth.users` blocks UPDATE of email (A13; direct SQL dashboard is the documented escape hatch for exceptional fixes).
- Registration collects: full name, Egyptian phone, guardian phone (may repeat across students), address, **and grade** (0027). The grade picker reads anon-safe `list_active_grades()`; students MUST pick a grade at sign-up (fail-closed).
- No password-complexity rule beyond non-empty (Supabase default minimum 6 applies).

### 4.2 Flow
1. `supabase.auth.signUp({ email, password, options: { data: { full_name, phone, guardian_phone, address, grade_id } } })` → `handle_new_user()` trigger creates the `profiles` row **from `raw_user_meta_data`** (role `student`, status `active`, grade from `grade_id` **validated**: exists, active, not soft-deleted — `grade_required`/`grade_not_available`/`invalid_grade_id`) immediately, satisfying all NOT NULL columns — no OTP wait, no second-step profile insert.
2. `update_own_profile()` remains available post-registration for correcting the four editable fields; the registration form collects everything before signUp, so UX is a single form.
3. Session persistence via Supabase client (`persistSession`, default localStorage) + `onAuthStateChange` to drive the auth guard.
4. Password change: authenticated `auth.updateUser`.
5. No email change UI anywhere; no OTP/reset endpoints.

### 4.3 Integrity guarantees
- No orphan profiles: trigger on `auth.users` INSERT (and a cleanup trigger on DELETE removes profile row, CASCADE).
- No duplicate profiles: `profiles.id` = `auth.users.id` (1:1), PK-enforced.
- No client-controlled roles: `role` only settable by SECURITY DEFINER functions (admin), never via direct INSERT/UPDATE (RLS blocks + CHECK).
- No insecure profile creation: `insert_profile` allowed only by the auth trigger.
- **Fail-closed profile creation (LOW-12):** `handle_new_user()` raises if any required meta field (`full_name`, `phone`, `guardian_phone`, `address`) or the student `grade_id` is missing/invalid — e.g. admin-created users via the Supabase dashboard must include them. Documented as intended: no partial/orphan profile rows are ever created.

---

## 5. AUTHORIZATION + RLS STRATEGY

### 5.1 Role helper functions (STABLE, SECURITY DEFINER, `SET search_path = public`)
```sql
is_admin()    := (SELECT role = 'admin'    FROM profiles WHERE id = auth.uid());
is_mr_walid() := (SELECT role = 'mr_walid' FROM profiles WHERE id = auth.uid());
is_teacher()  := (SELECT role = 'teacher'  FROM profiles WHERE id = auth.uid());
is_student()  := (SELECT role = 'student'  FROM profiles
                  WHERE id = auth.uid() AND status = 'active' AND deleted_at IS NULL);
```
`is_student()` returns **false** for disabled/deleted accounts → blocked everywhere content/progress/purchase logic is concerned.

### 5.2 RLS policy matrix
Every table has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` plus `FORCE ROW LEVEL SECURITY` on all tables (belt & braces). All expressions below are the exact WHERE clauses.

**profiles**
- SELECT: `id = auth.uid()` (own) OR `is_admin() OR is_mr_walid()`
- INSERT: `is_admin()` (with CHECK role-whitelist: new role in enum, never student-created rows)
- UPDATE (student self-service): `USING (id = auth.uid() AND is_student()) WITH CHECK (id = auth.uid() AND role = (SELECT p.role FROM profiles p WHERE p.id = profiles.id) AND grade_id = (SELECT p.grade_id FROM profiles p WHERE p.id = profiles.id) AND status = (SELECT p.status FROM profiles p WHERE p.id = profiles.id) AND deleted_at IS NULL)` — only the **four editable columns** (`full_name`, `phone`, `guardian_phone`, `address`) can change: role/grade/status/deleted_at are pinned immutable in WITH CHECK, and the app only ever performs self-edits through the `update_own_profile()` RPC (SECURITY DEFINER column whitelist); direct table UPDATE is never issued by the app (M5).
- UPDATE (staff): **no broad staff UPDATE policy** — all staff profile mutations are RPC-only (`set_student_grade`, `update_student_profile`, `disable_student`, `enable_student`, `soft_delete_student`, `restore_student`, `set_user_role`), all SECURITY DEFINER + audited. Admin retains only the DELETE policy below.
- DELETE: `is_admin()` only (hard-delete escape hatch; app uses soft delete).

**grades** — SELECT: `is_admin() OR is_mr_walid() OR (is_student() AND deleted_at IS NULL AND is_active)` (students read active, non-deleted grades only — architecture-gate binding B8). INSERT/UPDATE/DELETE: `is_admin() OR is_mr_walid()`; WITH CHECK prevents `role` escalation (none present). (Admin-only hard delete; app soft-deletes.)

**unit_pricing** — SELECT: `is_admin() OR is_mr_walid() OR is_teacher() OR (is_student() AND is_active AND unit's grade = student's grade)`. INSERT/UPDATE/DELETE: **FORCE RLS + no direct DML policies** — pricing is managed only via `set_unit_price` (staff base price) and `set_platform_fee` (admin global fee), both SECURITY DEFINER.

**unit_codes** — SELECT: `is_admin() OR is_mr_walid()` (students never see raw codes). INSERT/UPDATE/DELETE: RPC/Edge-Function-only; `WITH (NO POLICY)`.

**unit_purchases** — SELECT: `student_id = auth.uid()` (own) OR `is_admin() OR is_mr_walid()`. INSERT: **RPC-only** — explicit `unit_purchases_insert_via_rpc` policy with `WITH CHECK (false)` rejects any direct INSERT (redemption goes through `redeem_unit_code`); the UNIQUE `(student_id, unit_id)` constraint is the physical backstop. UPDATE/DELETE: none.

**units** — SELECT: `is_admin() OR is_mr_walid() OR is_teacher() OR (is_student() AND grade access: grade_id IN (SELECT grade_id FROM profiles WHERE id = auth.uid()) AND status='published' AND deleted_at IS NULL)`. INSERT/UPDATE/DELETE: `is_mr_walid() OR is_admin()`.

**lessons** — SELECT: `is_admin() OR is_mr_walid() OR is_teacher() OR (is_student() AND status='published' AND deleted_at IS NULL AND unit_id IN (SELECT id FROM units WHERE grade_id = (SELECT grade_id FROM profiles WHERE id = auth.uid()) AND status='published' AND deleted_at IS NULL))`. INSERT/UPDATE/DELETE: `is_mr_walid() OR is_admin()`.

**lesson_videos** — SELECT: `is_admin() OR is_mr_walid() OR is_teacher() OR (is_student() AND can_access_lesson(lesson_id) AND status='ready' AND is_primary)` — students see **only the primary `ready` video** of accessible lessons; processing/pending/replaced videos are invisible (PLAN: do not expose before ready). INSERT/UPDATE/DELETE: RPC/Edge-Function-only.

**lesson_pdfs** — SELECT: `is_admin() OR is_mr_walid() OR is_teacher() OR (is_student() AND can_access_lesson(lesson_id) AND is_ready AND is_primary)` — students see **only the primary ready PDF** of accessible lessons (MED-7). Direct SELECT by students returns **metadata only**; content bytes require signed URL (Section 9). INSERT/UPDATE/DELETE: RPC/Edge-Function-only.

**progress** — SELECT: `student_id = auth.uid() OR is_mr_walid() OR is_admin() OR is_teacher()`. INSERT/UPDATE/DELETE: RPC-only (`upsert_progress`) — students cannot write arbitrary rows; `WITH (NO POLICY)`.

**notifications** — SELECT: `user_id = auth.uid()`. UPDATE: direct UPDATE is **REVOKEd from `authenticated`** — mark-read happens **only via RPCs** (`mark_notification_read` / `mark_all_notifications_read`); the own-row RLS UPDATE policy (`USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`) **remains as belt-and-braces** (PostgreSQL has no column-scoped policies — `FOR UPDATE OF` is a SELECT row-lock clause, not a policy); `title`, `body`, `type`, `dedup_key`, `entity_type`, `entity_id` are **immutable** (pgTAP asserts no UPDATE privilege, table- or column-level, for `anon`/`authenticated` — architecture-gate binding B2/MED-3). INSERT: RPC/system-only.

**audit_logs** — SELECT: `is_admin()` ONLY. INSERT: trigger/system-only (no user policy). UPDATE/DELETE: none.

**app_settings** — SELECT: `is_admin() OR is_mr_walid()` (frontend staff reads WhatsApp number via this; the public landing page uses `get_public_settings()` instead — anon-safe, no direct access to app_settings). UPDATE/INSERT: `is_admin() OR (is_mr_walid() AND key LIKE 'whatsapp%')`.

### 5.3 Access gate for protected content
```sql
can_access_lesson(p_lesson_id uuid) RETURNS boolean  -- SECURITY DEFINER, STABLE
-- returns true IFF:
--   staff (is_admin() OR is_mr_walid() OR is_teacher()) → any live (non-deleted) lesson  [QA preview, B5]
--   OR student:
--     is_student()  (active, not deleted, role student)
--     AND lesson exists AND lesson.status = 'published' AND lesson.deleted_at IS NULL
--     AND its unit is 'published' AND unit.deleted_at IS NULL
--     AND unit.grade_id = (SELECT grade_id FROM profiles WHERE id = auth.uid())   -- CURRENT profile grade, evaluated live (H5)
--     AND the grade is active (grades.is_active = true)                            -- architecture-gate binding B8
--     AND ( lessons.is_trial  OR EXISTS active unit_purchases for auth.uid() AND this unit )
```
**Consequence of the live grade check (H5):** a staff grade change mid-session changes the student's accessible grade set **immediately** — the very next request re-evaluates against the new current grade. Historical purchases are unaffected; only the accessible content set changes.

**Consequence of permanence:** once a unit is purchased it stays open forever; no time-based re-evaluation exists. The only revocation path is voiding (admin, audited) — outside the app's normal flow.

Used by: lesson_videos/lesson_pdfs SELECT policies, `get-pdf-signed-url` Edge Function, `get-video-playback-url` Edge Function, `upsert_progress` guard, frontend access guard (informational only). **All Edge Functions additionally verify the caller profile is `status='active'` and `deleted_at IS NULL` (defense-in-depth, §5.4/§14).**

### 5.4 Disabled/deleted blocking (sign-in gate, A34)
- **Sign-in is blocked at the source:** `block_sign_in_for_inactive_accounts()` trigger on `auth.users`, `BEFORE UPDATE OF last_sign_in_at` (the column Supabase Auth touches on every sign-in), raises `account_inactive_or_deleted` when `profiles.deleted_at IS NOT NULL OR profiles.status <> 'active'`. Disabled/deleted accounts **cannot log in** and cannot obtain new sessions.
- **Session hardening:** `disable_student()` / `soft_delete_student()` additionally revoke the student's `auth.sessions` (service role) **where feasible per the Phase 1 spike (LOW-18)** so existing **refresh tokens die immediately**; fallback = sign-in gate + RLS + Edge Function active-profile checks (architecture-gate binding B10). Already-issued **access JWTs remain valid up to their expiry (~1h)** — that residual window is closed by RLS (`is_student()`) and the Edge Function active-profile checks (MED-9). Feasibility of `DELETE FROM auth.sessions` from Postgres is verified in a **Phase 1 spike** (LOW-18).
- **Defense-in-depth:** `is_student()` returns false when `status='disabled' OR deleted_at IS NOT NULL` → all protected RLS paths close instantly even if a stale session somehow persists. **All Edge Functions** also verify the caller profile is `status='active'` and `deleted_at IS NULL` alongside role checks (Section 14).
- Trash listing/restore: `list_trash()`, `restore_student()` (mr_walid/admin), audit-logged.

---

## 6. UNIT PURCHASE ARCHITECTURE

### 6.1 Pricing model
- Per unit, exactly one price row: `unit_pricing (unit_id UNIQUE)`; `base_price`, `platform_fee`, `total_price = base + fee` (GENERATED column, A6). No durations, no tiers.
- **Price snapshot at redemption (MED-5):** every purchase copies `base_price`/`platform_fee`/`total_price` from `unit_pricing` into `unit_purchases`. Later price edits never rewrite purchase history; the purchase row is the authoritative price record (the FK to `unit_pricing` RESTRICT is a second line of defense, not the source of truth).

### 6.2 Activation
- Codes redeem against a unit's pricing row. Redemption rules (business, evaluated in `redeem_unit_code` in this order):
  1. Code exists → else `code_not_found`.
  2. Its unit exists (not deleted) → else `unit_not_found`.
  3. Unit is active (`published`) → else `unit_inactive`.
  4. Code not revoked → else `code_revoked`.
  5. Code still available → else `code_already_used`.
  6. Caller is a student with an active grade → else `no_grade_assigned`.
  7. Unit belongs to the student's grade → else `unit_not_in_student_grade`.
  8. No existing purchase of this unit → else `unit_already_purchased`.
- On success: code → `used` (used_at/used_by); `unit_purchases` row with **price snapshot copied from `unit_pricing`** (MED-5); notification `unit_activated` (dedup `unit_activated:{purchase_id}`); audit `unit_purchase.create`.
- **Permanent (A4):** the purchase never lapses. There is no manual-purchase path (P12) — redemption is the only way in. No "package" unlocks multiple units.

### 6.3 Atomicity (the race requirement)
`redeem_unit_code` (SECURITY DEFINER):
```sql
BEGIN;
  PERFORM pg_advisory_xact_lock(hashtext('wldn_redeem_unit:' || COALESCE(p_code, '')));  -- serializes per-code
  SELECT * FROM unit_codes WHERE code = v_code FOR UPDATE;         -- row lock (belt & braces)
  -- re-validate all rules in the order above INSIDE the transaction
  UPDATE unit_codes SET status='used', used_at=now(), used_by=auth.uid() WHERE id = ...;
  INSERT INTO unit_purchases (student_id, unit_id, base_price, platform_fee, code_id)
    SELECT p_student, up.unit_id, up.base_price, up.platform_fee, p_code_id
    FROM unit_pricing up WHERE up.id = p_code.unit_pricing_id;   -- price snapshot copied here (MED-5)
  INSERT INTO notifications (...) ON CONFLICT (dedup_key) DO NOTHING;
  INSERT INTO audit_logs (...);
COMMIT;
```
Two simultaneous redemptions of the same code: exactly one commits the `UPDATE ... status='used'`; the second's re-validation sees `status='used'` and raises `raise exception 'code_already_used'`. `UNIQUE (student_id, unit_id)` on `unit_purchases` is the final physical backstop (also prevents two different codes buying the same unit twice).

### 6.4 Revocation
- `revoke_unit_code(p_code_id)`: available/used → `revoked` (audited). Revoking a used code **does not** cancel the purchase created from it (history preserved; documented rule — A29).
- Voiding a purchase (admin, audited) is the only way to remove access; not exposed in the normal student flow.

---

## 7. CONTENT ARCHITECTURE

### 7.1 Hierarchy & ordering
`grades → units → lessons → (lesson_videos, lesson_pdfs)`. Each level carries `sort_order`; UI reorder updates `sort_order` via SECURITY DEFINER RPCs. Display order: `sort_order ASC, created_at ASC`.

### 7.2 Statuses
- `draft` — invisible to students everywhere.
- `published` — visible to eligible students; sets `published_at`; triggers `notify_new_content()` which targets **active purchasers of the lesson's grade only** (students with an active purchase for any unit of that grade, profile `status='active'`, not deleted; dedup `new_content:{lesson_id}:{student_id}`) — M1. Non-purchasers or disabled students receive nothing.
- `hidden` — temporarily removed from student views without deletion (e.g. mistake), retains assets.

### 7.3 Trial lessons
- `lessons.is_trial` marks up to one lesson per unit as **free to open without a purchase** (`can_access_lesson` short-circuits `true` for trial lessons; partial UNIQUE `(unit_id) WHERE is_trial AND deleted_at IS NULL`).
- Set/cleared only via `set_lesson_trial` (staff, audited `unit.trial_set`); atomically clears any prior trial in the unit before setting a new one.

### 7.4 Soft delete / restore
- `deleted_at` on grades, units, lessons, videos, PDFs, students. Restore clears `deleted_at` (content) or resets `status='active'` for students (A10). All audited.
- **Grades follow the same soft-delete path (LOW-17):** `delete_grade(soft)` / `restore_grade` RPCs (SECURITY DEFINER + audit) set/clear `grades.deleted_at`; units/lessons under a soft-deleted grade remain intact and become unreachable to students (grade-level RLS + `can_access_lesson`). Hard-deleting a grade is never performed by the app.
- Deleting a published lesson with progress rows: progress is **preserved** (FK keeps row; `lesson_id` → lessons CASCADE only on hard delete, which the app never performs). Deleting an asset (video/PDF) removes it from `is_primary`; if it was primary, an alternate `is_primary` may be promoted or the lesson shows "asset missing" until replaced (handled state in UI).

### 7.5 Video replacement policy (deterministic, A11)
1. Mr. Walid uploads a new video via `create-video-upload-session` with `mode=replace` + `old_video_id`.
2. New video row created (`status=pending_upload`, `is_primary=false`). **Create-path rule (MED-10):** for `mode=create`, `is_primary=true` is set explicitly **only when the lesson has no other video yet** (it is the lesson's first video); otherwise it stays `false` until a webhook `ready` promotes it.
3. On webhook `ready`: `set_video_status()` promotes the new video (`is_primary=true, status=ready`) and demotes the old one (`status='replaced'`, `is_primary=false`) — explicit promotion logic lives in `set_video_status`, never in INSERT defaults.
4. **Progress reset (deterministic):** `UPDATE progress SET position_seconds=0, percent_completed=0, is_completed=false, video_id=new_id WHERE lesson_id = :lesson_id AND video_id = :old_video_id;` — single atomic statement, no ambiguity, audited (`video.replace`). Only rows pointing at the replaced video are touched (rows already pointing at the new version are untouched).

### 7.6 Content lifecycle audit
Every create/update/publish/hide/soft-delete/restore is captured by the audit trigger or explicit RPC audit call.

---

## 8. BUNNY ARCHITECTURE

### 8.1 Configuration (Edge Function secrets, never in browser)
`BUNNY_API_KEY`, `BUNNY_LIBRARY_ID` (storage zone + video library pair), `BUNNY_PULL_ZONE_HOSTNAME`, `BUNNY_SIGNING_KEY` (token auth), `BUNNY_TOKEN_AUTH_SECURITY_KEY` = signing key. Optional: separate `BUNNY_LIBRARY_ID` per grade (out of scope; single library assumed, A-flagged).

### 8.2 Lifecycle & state machine
```
pending_upload ──(create session)──▶ uploading
uploading ──(webhook: started/initial)──▶ processing
processing ──(webhook: finished + duration/thumbnail)──▶ ready
processing ──(webhook: error/timeout ×N)──▶ failed  (error_message stored; retry = new session)
ready ──(replacement)──▶ replaced
pending_upload/uploading/processing ──(delete session)──▶ (row soft-deleted)
```
`video_status` transitions enforced by the Edge Function + DB function `set_video_status(video_id, new_status, ...)` (SECURITY DEFINER, validates legal transitions, audits, and performs the `is_primary` promotion/demotion — MED-10). **Naming clarification (MED-6):** `set_video_status()` is the internal SECURITY DEFINER function with **no client grants**; the webhook/recheck Edge Functions invoke it with the service-role client — there is no separate public `set_video_status_ef` variant (its role in the grant matrix is the internal one).

### 8.3 Edge Functions
| Function | Method | Auth | Purpose |
|---|---|---|---|
| `create-video-upload-session` | POST | JWT + `is_mr_walid() OR is_admin()` | Calls Bunny *create direct upload* (returns `uploadUrl`, `videoId`); inserts `lesson_videos` row (`pending_upload`); supports `mode=create/replace` and `action=cancel` (releases an abandoned session — 0017 wrapper, best-effort Bunny delete) (Section 7.5). |
| `bunny-video-webhook` | POST | **Public + token check** | Constant-time compare of `x-webhook-token` (or `?token=` URL) against `BUNNY_WEBHOOK_TOKEN`; parses payload (numeric `Status`); updates video status/duration/thumbnail via `set_video_status`; triggers replacement finalization (7.5); on `ready` (with fresh metadata fetch) → `notify_new_content` if lesson published. |
| `get-video-playback-url` | GET | JWT; **student role** (S7) + active/not-deleted profile, **or `is_mr_walid() OR is_admin() OR is_teacher()`** (architecture-gate binding B5) | Takes `lesson_id` only — the client **never passes a chosen `video_id`**. Student path: verifies `can_access_lesson()` (trial-or-purchase access **live**) + active/not-deleted. Staff path: `is_mr_walid() OR is_admin() OR is_teacher()` + active/not-deleted — content-visible check (lesson exists, not soft-deleted), **no purchase requirement** (QA preview). Both paths: the **server resolves the lesson's primary `ready` video**; generates an **IP-locked HS256 directory token URL (query form, TTL 20 min — S3)** for that video; returns URL + expiry. Other roles rejected explicitly. |
| `get-video-thumbnail-url` | GET | JWT; same gates as `get-video-playback-url` | Short-lived IP-locked signed `thumbnail.jpg` URL for a video (same directory token); the raw `thumbnail_url` column is **never** sent to clients (all thumbnails render through this EF). |

### 8.4 Failure handling
- Webhook missed or processing stuck → **hourly `recheck-video-states` job** using the unified execution chain (MED-4): scheduled Edge Function (preferred) → pg_cron→pg_net→internal Edge Function → external cron: selects videos stuck `>N` minutes in `pending_upload/uploading/processing`, re-queries Bunny API (server-side) per video and reconciles via `set_video_status` chains (missing → `failed`; dead statuses → `failed` with `error_message`; finished → `ready` with duration/thumbnail).
- Upload interrupted (`uploading` older than threshold, no webhook) → marked `failed`, Mr. Walid sees retry button (new session).
- Signed URL generation never in browser; TTL **20 min** to limit sharing (S3/R9).

### 8.5 Stability
`bunny_video_id` stored (UNIQUE) — stable identity across sessions; Bunny IDs never regenerated per playback.

### 8.6 Phase 5 pre-check: webhook authentication (R17)
Bunny's signed-webhook/security-token feature is **not available on this account** — pre-checked at Phase 5. The implemented design is the **documented fallback**: a **secret token embedded in the webhook URL** (`https://<project-ref>.functions.supabase.co/bunny-video-webhook?token=<secret>`), enforced with a constant-time compare inside the Edge Function (`x-webhook-token` header is accepted as an alias), plus strict payload validation (required fields/types, size limits). No payload is processed without a valid token.
- Either way, the webhook never trusts the payload alone — state transitions are additionally validated in `set_video_status()` (Section 8.2), and the forgery-rejection test (§16) must pass.

---

## 9. PDF ARCHITECTURE

- Storage bucket `pdfs` = **private**, no public policies (Section 3.7).
- Upload: mr_walid/admin → `upload-pdf` Edge Function (JWT + role check) returns a short-lived **signed upload URL** via `createSignedUploadUrl` (**I4** — not `createSignedUrl`, which is download-only) for the target path; client uploads bytes directly to that URL; `is_ready=true` set via `finalize_pdf_upload()` RPC + audit on completion. Original filenames sanitized; path convention `{lesson_id}/{uuid}.pdf`.
- Access: student → `get-pdf-signed-url` Edge Function:
  1. Verify JWT (`getUser`) and require role `student` with `status='active'` and `deleted_at IS NULL` — non-student roles are rejected explicitly (S7).
  2. Accept `lesson_id` only; the **server resolves the lesson's primary `ready` PDF** (`is_primary AND is_ready AND deleted_at IS NULL`) — requests naming a non-primary PDF id are rejected (MED-7).
  3. Check `can_access_lesson(lesson_id)` — **trial-or-purchase access evaluated live at every request**.
  4. If OK → `createSignedUrl` (service role) with **short TTL** (10–15 min) for that PDF's `storage_path`, return URL + metadata.
- **Access invalidation:** because TTL is short and every URL issuance re-runs `can_access_lesson()`, students who lose access (account disabled, grade/unit removed) cannot obtain new URLs, and stale URLs die with the TTL (R10). Blocking immediate invalidation of already-issued URLs is inherent to Supabase signed URLs — documented limitation, mitigated by short TTL + client session expiry.
- Replacement: upload new PDF → promote `is_primary`, retire old (`deleted_at`); deletion same soft semantics; all audited.

---

## 10. NOTIFICATION ARCHITECTURE

### 10.1 Types & producers
| Type | Trigger | Producer | Dedup |
|---|---|---|---|
| `unit_activated` | code redemption | `redeem_unit_code` | `unit_activated:{purchase_id}` |
| `new_content` | lesson → published | publish trigger → `notify_new_content()` (active purchasers of the grade only — M1) | `new_content:{lesson_id}:{student_id}` |
| `system` | account disabled, restore, etc. | RPCs | app-supplied key |
| `exam_submitted` / `exam_graded` (0029) | exam attempt | attempt submit / grading completes | `exam_submitted:{attempt_id}` / `exam_graded:{attempt_id}` |
| `lesson_comment` / `comment_reply` (0030) | comment added | comment RPCs | `lesson_comment:{comment_id}` / `comment_reply:{comment_id}` |

### 10.2 Once-only guarantee
Every deterministic event carries a unique `dedup_key`; `UNIQUE(dedup_key)` + `ON CONFLICT DO NOTHING` guarantees it fires **exactly once per entity** (purchase, lesson, attempt, comment) even if the producer runs repeatedly (A7).

### 10.3 Read state
- `is_read` / `read_at`, marked only via `mark_notification_read` / `mark_all_notifications_read` (own rows only). Unread badge on student UI.

---

## 11. PROGRESS ARCHITECTURE

### 11.1 RPC `upsert_progress(p_lesson_id, p_position_seconds, p_percent)`
SECURITY DEFINER. Behavior (deterministic):
1. Guard: `is_student()` and `can_access_lesson(p_lesson_id)`.
2. Clamp `p_percent` to `[0,100]`; clamp `p_position_seconds >= 0` (client value never trusted blindly, A24).
3. **Video-pinning guard (M4):** resolve the lesson's current primary `ready` video. If one **exists** → the guard applies: if the existing progress row's `video_id` differs from the current primary (stale client from before a replacement) → the write is **rejected** (`raise progress_stale_video`); the client refreshes and resumes from zero on the new primary. If **none exists** (PDF-only lesson) → the write is **recorded with `video_id = NULL`, pinned to the lesson** (architecture-gate binding B4); the replacement guard applies only when a primary video exists. This keeps progress writes deterministic across replacements.
4. `INSERT ... ON CONFLICT (student_id, lesson_id) DO UPDATE`:
   - `position_seconds = EXCLUDED.position_seconds` (last-write-wins resume point, A26)
   - `percent_completed = GREATEST(progress.percent_completed, EXCLUDED.percent_completed)` (monotonic, seek-safe)
   - `is_completed = progress.is_completed OR EXCLUDED.percent_completed >= 90` — **completion is irreversible** (A12) with the single deterministic exception of video replacement (§7.5) and strictly server-computed from percent ≥ 90; client can never set `is_completed` directly.
   - `video_id` = current primary id (set/repaired on the first successful write after a replacement).
5. `last_watched_at = now()`. Return the row.
- Debounce on client (e.g. 5s) to limit writes; server remains correct under bursts (idempotent upsert).
- **Documented residual:** a client mid-playback at the exact moment of replacement may submit one last write for the old video — the guard rejects it deterministically (M4); no inconsistent state is persisted. PDF-only lessons (no primary video) are exempt from the guard — writes are pinned to the lesson with `video_id = NULL` (binding B4).

### 11.2 Concurrency
Single upsert per (student, lesson) — no multi-row transactions needed; PostgreSQL row locks serialize concurrent writes; monotonic GREATEST keeps state consistent.

### 11.3 Aggregates (views/RPCs)
- Unit/grade percent = unweighted mean of lesson percentages (equal weight per lesson, documented); completion counts from `is_completed`.
- `v_student_progress_summary`, `v_lesson_stats` feed student dashboard + mr_walid/teacher analytics (most-viewed lessons, students per grade).

### 11.4 Replacement policy
Deterministic reset per Section 7.5: only rows pinned to the replaced `video_id` are zeroed, in the same transaction as the primary flip.

---

## 12. AUDIT ARCHITECTURE

### 12.1 What is logged
| Action | Entity | Notes |
|---|---|---|
| `student.create/update/disable/enable/soft_delete/restore` | profiles | update_own_profile self-edits also logged (non-PII deltas) |
| `unit_purchase.create` | unit_purchases | redemption logged with code id |
| `code.generate/revoke/use` | unit_codes | |
| `unit_pricing.set` | unit_pricing | price upserts |
| `unit.trial_set` | lessons | trial flag changes |
| `user.role_change` | profiles | actor + target user + old/new role (from `set_user_role`, admin-only) |
| `content.create/update/publish/hide/soft_delete/restore` | units/lessons/videos/pdfs | |
| `grade.create/update/soft_delete/restore` | grades | (LOW-16) |
| `video.upload/processing/ready/failed/replace` | lesson_videos | |
| `pdf.upload/finalize/replace/delete` | lesson_pdfs | |
| `settings.change` | app_settings | |
| `auth.*` (register, login, password change) | — | via trigger on auth events if feasible; otherwise best-effort from RPCs |

### 12.2 Capture
- **Trigger-based** `audit_trigger()` attached to the **fixed table inventory (MED-8):** `profiles`, `grades`, `units`, `lessons`, `lesson_videos`, `lesson_pdfs`, `unit_pricing`, `unit_codes`, `unit_purchases`, `app_settings` (+ `exams`/`exam_attempts` and `lesson_comments` added by Phases 6–7). **`progress` and `notifications` are explicitly excluded** (high-volume student data; the trigger would be pure overhead and noise). Filling: `actor_id=auth.uid()`, `actor_role=get_current_role()`, `action = table.action` (mapped), `entity_type`, `entity_id=NEW/OLD.id`, `metadata=to_jsonb(NEW)` (deltas for UPDATE), `ip_address` (**best-effort** from `request.jwt.claims`, **may be NULL** — L3), `created_at=now()`.
- **PII-delta handling (MED-8):** `update_own_profile` logs **only the changed column names** (e.g. `{"changed": ["phone"]}`), never raw phone/address values; the trigger excludes sensitive column values from `metadata` for `profiles`.
- **RPC-based** explicit `audit_log(action, entity_type, entity_id, metadata)` calls inside SECURITY DEFINER functions for actions the trigger can't see (e.g. failed attempts).
- `audit_logs` is **insert-only**; no UPDATE/DELETE policies for any role; SELECT admin-only.

### 12.3 Querying & export
- `v_audit_log` (joined actor names). Filters: date range, action, entity_type, actor.
- `export-audit-log` Edge Function (admin-only): accepts filters → service-role query → CSV → write to `audit-exports` bucket → return short-lived signed URL (A23). CSV columns: created_at, actor, actor_role, action, entity_type, entity_id, metadata, ip.

---

## 13. FRONTEND ARCHITECTURE

### 13.1 Project layout
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
pages/ (route map below)
```

### 13.2 Route map
| Path | Access | Notes |
|---|---|---|
| `/` | public | Landing with WhatsApp CTA — reads **only `get_public_settings()`** (whatsapp fields + platform_name, granted to anon); never raw app_settings |
| `/login` | public (redirects if authed) | email+password |
| `/register` | public | full form (name, email, phone, guardian, address, **grade** via anon-safe `list_active_grades()`) — grade required for students (0027) |
| `/student/dashboard` | student | purchased units, progress summary, notifications, WhatsApp CTA |
| `/student/curriculum` | student, content gated | grades→units tree; locked units show lock state + purchase CTA; trial lessons marked |
| `/student/lessons/:lessonId` | student, `can_access_lesson` enforced | video player + PDF viewer + progress save |
| `/student/units` | student | per-unit prices (`get_public_unit_prices`), own purchase history (`get_my_unit_purchases`), redeem-code form (`redeem_unit_code`) |
| `/student/notifications` | student | read/unread |
| `/student/profile` | student | view info, change password (no email edit UI) |
| `/walid/dashboard` | mr_walid/admin | stats: students/grade, purchases + revenue, most-viewed lessons, content state |
| `/walid/students` | mr_walid/admin | list, search, disable/enable, soft delete |
| `/walid/students/:id` | mr_walid/admin | profile, purchases, progress analytics |
| `/walid/students/trash` | mr_walid/admin | restore (soft-delete list) |
| `/walid/grades` | mr_walid/admin | CRUD + ordering |
| `/walid/pricing` | admin (mr_walid/teacher read-only) | per-unit prices (base, fee, total) via `list_unit_pricing` |
| `/walid/codes` | mr_walid/admin | generate (Edge Function), revoke, list usage |
| `/walid/curriculum` | mr_walid/admin | grades→units→lessons management, statuses, reorder, trial flagging |
| `/walid/lessons/:lessonId` | mr_walid/admin | assets: upload video (session), upload PDF, replace, statuses |
| `/walid/analytics` | mr_walid/admin | progress/viewing analytics |
| `/walid/settings` | mr_walid/admin | WhatsApp config (mr_walid) |
| `/admin/dashboard` | admin | operational metrics (`v_dashboard_metrics`) |
| `/admin/audit` | admin | filterable audit log + CSV export |
| `/admin/settings` | admin | per-unit pricing/platform fees, app settings |
| `/admin/roles` | admin | role management: list users + `set_user_role(user_id, role)` (admin-only, SECURITY DEFINER, audited) |
| `*` | authed | 404 |

Admin can also reach all `/walid/*` routes (permission check allows `admin`).

### 13.3 Guards & data access
- **AuthGuard:** subscribes to `onAuthStateChange`; redirects unauthenticated to `/login`.
- **RoleGuard:** maps `profiles.role` (fetched once, cached in context) → allowed path prefixes.
- **AccessGuard (student):** shows lock state when `get_my_lesson_access(lesson_id)` reports `has_access=false` (no purchase and not a trial lesson) — **informational only**; RLS + Edge Functions remain authoritative.
- **Data access layer:** all mutations go through typed RPC wrappers; SELECTs through RLS-scoped queries; direct table `update` is **never** issued in the app — notification mark-read goes through `mark_notification_read` / `mark_all_notifications_read` RPCs (direct UPDATE revoked from `authenticated` — binding B2).

### 13.4 UX (PLAN §13)
- RTL: `<html dir="rtl" lang="ar">`, Tailwind logical properties, Arabic-safe font stack.
- Every important screen: loading skeleton/spinner, empty state (Arabic copy + CTA), error state (retry), success toast, inline validation (Egyptian phone regex, required fields, email format).
- Destructive ops → confirmation modal; soft deletes clearly labeled ("سيتم نقل الطالب إلى سلة المهملات").
- **Login error mapping (I6):** the sign-in gate's `account_inactive_or_deleted` error is mapped to friendly Arabic copy on the login form (e.g. "الحساب غير نشط أو تم حذفه — يرجى التواصل مع الإدارة") — never shown raw (Phase 2).
- Responsive: desktop ≥1024, tablet 768–1023, mobile <768; bottom-nav for student on mobile; video player responsive; PDF viewer full-width.

---

## 14. EDGE FUNCTIONS LIST

Deployment: one `supabase/functions/<name>/index.ts` per function; deploy via `supabase functions deploy <name> --no-verify-jwt` only for `bunny-video-webhook` (shared webhook token, verified in-function), all others rely on default JWT verification plus in-function role checks. **All privileged functions additionally require the caller profile to be `status='active'` and `deleted_at IS NULL` (defense-in-depth beyond role checks, A34/§5.4).**

| # | Function | Auth | Purpose & key logic |
|---|---|---|---|
| 1 | `create-video-upload-session` | JWT; then `is_mr_walid() OR is_admin()` | `mode=create`: Bunny create upload → insert `lesson_videos` (pending_upload) via `create_video_upload_record()` (SECURITY DEFINER wrapper). `mode=replace`: creates replacement row + keeps `old_video_id` for finalize (7.5). `action=cancel`: releases an abandoned session via `delete_video_upload_record()` (0017, pending-only, hard delete + audit) then best-effort Bunny delete of the orphan object. Returns TUS upload session (`upload_url`, `tus_headers` incl. `AuthorizationSignature`/`AuthorizationExpire` + `metadata`) to browser — safe (upload URL is scoped). |
| 2 | `bunny-video-webhook` | **public** + shared webhook token (constant-time compare of `x-webhook-token`, `?token=` URL; no Bunny-side signature capability, R17) | Parse payload (numeric `Status`); map events → `set_video_status()` transition chains (uploading→processing→ready/failed); on ready fetch fresh metadata from Bunny API (duration, thumbnail) before the final transition; finalize replacement (primary flip + progress reset, 7.5); `notify_new_content` if published (failure not fatal). Rejects unauthenticated requests. |
| 3 | `get-video-playback-url` | GET/HEAD; JWT; **student role** (S7) + active/not-deleted profile, **or `is_mr_walid() OR is_admin() OR is_teacher()`** (binding B5) | Takes `lesson_id`; the **server resolves the primary `ready` video** (client never passes `video_id`). Student path: `can_access_lesson()` (live trial-or-purchase check, replicated via RLS-scoped queries — no widening of RPC grants). Staff path: content-visible check (lesson exists, not soft-deleted), **no purchase requirement** — QA preview. Both: Bunny **tokenized signed URL** (IP-locked HS256 directory token over `/{videoId}/`, query form, TTL 20 min — S3). Never returns raw Bunny video URLs to unauthorized users; other roles rejected explicitly. |
| 3b | `get-video-thumbnail-url` | GET/HEAD; JWT; same gates as row 3 | Returns a short-lived IP-locked signed `thumbnail.jpg` URL (same directory token as the HLS chain). The raw `thumbnail_url` column is never sent to clients — all thumbnails render through this EF. |
| 4 | `get-pdf-signed-url` | JWT; **student role only** (S7) + active/not-deleted profile | Accepts `lesson_id` only; **server resolves the primary `ready` PDF** (rejects non-primary requests — MED-7); `can_access_lesson()` → Supabase service-role `createSignedUrl` (TTL 10–15 min) on `pdfs` bucket; returns URL + metadata. Access checked at request time (Section 9); non-students rejected. |
| 5 | `upload-pdf` | JWT; `is_mr_walid() OR is_admin()` | Validates MIME/size → service-role **signed upload URL via `createSignedUploadUrl` (I4)** on `pdfs` bucket → caller uploads bytes; `finalize_pdf_upload` RPC marks `is_ready`, audits. |
| 6 | `generate-unit-codes` | JWT; `is_admin() OR is_mr_walid()` | Validate unit pricing row (active, exists) + count cap (e.g. ≤500) → `create_unit_codes_for_staff()` (staff-guarded wrapper, `permission_denied` otherwise) → `create_unit_codes_internal()` (pgcrypto `gen_random_bytes`, unambiguous charset, stored uppercase — A22) → returns codes to caller (only party that sees them). |
| 7 | `export-audit-log` | JWT; `is_admin()` | Filters (date range, action, entity, actor) → CSV (UTF-8 BOM for Excel/Arabic) → `audit-exports` bucket → short-lived signed URL. |
| 8 | `recheck-video-states` | **scheduled internal job function — not a request function** (no JWT route; invoked by the scheduling chain, MED-4) | Selects stuck pre-ready videos (`pending_upload/uploading/processing`, older than threshold, not deleted) → live Bunny API status per video → `set_video_status()` chains (missing → `failed`; dead statuses → `failed`; finished → `ready` with metadata); transient API errors skipped for the next run; hourly. Entry point for links ①②③ of the unified chain. |

**Inventory note (aligns with ARCHITECTURE.md §8.4):** functions 1–7 plus 3b `get-video-thumbnail-url` (added at the Phase 5 review round 2 alongside the signed-thumbnail fix) are the 8 request functions; row 8 is the single **scheduled job function** (scheduled Edge Function preferred → pg_cron→pg_net→external cron), total **9 functions (8 request + 1 scheduled)**. `export-audit-log` (row 7) was implemented at Phase 8. There is no expiry job — access is permanent; the only scheduled work is video-state reconciliation.

**Secret handling:** all secrets via `supabase secrets set` / CI; read from `Deno.env`. Never in `VITE_*`. Service role only inside functions. JWT verification: default `verify_jwt` for 1, 3, 3b, 4, 5, 6, 7; function 2 uses the `BUNNY_WEBHOOK_TOKEN` token check; function 8 is an internal endpoint (service-role client + `x-internal-token`/`INTERNAL_JOB_TOKEN`, not exposed as a JWT route).

---

## 15. PHASE DEPENDENCIES & EXECUTION PLAN

Dependency chain: **1 → 2 → 3 → 4 → 5 → 6 → (7 ‖ 8) → 9 → 10 → 11** (8 depends on 3 for unit purchase events and 4/5 for content events; 7 depends on 2–5).

| Phase | Deliverables | Acceptance criteria | Test strategy |
|---|---|---|---|
| **0 Discovery/Architecture** | ARCHITECTURE.md, DATABASE.md, SECURITY.md, TESTING.md, route map, role matrix, entity map, risk list (extracted from this blueprint) | Internally consistent; no open contradictions; assumptions recorded | Review checklist (PLAN §0) |
| **1 Supabase Foundation** | migrations (all tables/enums/RLS/views/RPCs/triggers incl. **sign-in gate** + `set_updated_at`), extensions (`pgcrypto`, `pg_cron`, `pg_net`), `supabase-full-schema.sql`, seed (admin/mr_walid, app_settings), storage buckets + storage RLS (no anon policies); **spike: feasibility of `DELETE FROM auth.sessions` from Postgres (LOW-18)** | `supabase db reset` applies cleanly; no missing FKs; no policy contradictions; roles cannot escalate (tests); core auth flow works; sign-in gate trigger present and version-pinned; session-deletion spike result recorded | pgTAP: schema integrity, constraint checks; RLS role-simulation tests |
| **2 Auth & Account Lifecycle** | register/login/logout/session (incl. grade picker at sign-up), profile creation, password change, disable/enable, soft delete, trash, restore (RPCs + UI); login error mapping for `account_inactive_or_deleted` (I6) | Every lifecycle transition works against real Supabase; **disabled/deleted accounts cannot log in nor access protected data** (sign-in gate + session revocation + RLS); login shows friendly Arabic copy for inactive accounts | pgTAP RLS matrix + **sign-in gate test** (register → disable → login fails → enable → login succeeds); Vitest guard tests; Playwright lifecycle flow |
| **3 Grades, Pricing & Unit Purchases** | grades CRUD + seed, per-unit pricing (`set_unit_price`), unit codes (generation EF + RPC), atomic redemption (`redeem_unit_code`), purchase history UI | Full activation lifecycle; **double redemption / double purchase impossible** (concurrency test); purchase is permanent | pgTAP rules tests; **race harness** (Section 16, Race-Condition Harness row; see TESTING.md §8); Vitest UI |
| **4 Curriculum & Content Mgmt** | units/lessons CRUD, ordering, statuses, trial lessons (`set_lesson_trial`), soft delete/restore, PDF metadata/upload, content audit | Publishing hides drafts from students; restore works; trial lesson opens without purchase; audit rows exist | pgTAP; RLS tests; Playwright walid flow |
| **5 Bunny Video** | create-video-upload-session (create/replace/cancel), webhook (shared token — `?token=`/`x-webhook-token`, constant-time compare, R17; no Bunny-side signature capability), status machine, signed playback (IP-locked HS256 directory token, query form, TTL **20 min**), signed thumbnails, replacement, cancel/abandon release, failure handling (scheduled recheck) | End-to-end: session → upload → webhook → ready → signed playback (real Bunny); replacement resets progress deterministically; failures recover; **forged webhooks rejected** | Deno tests (mocked webhook/token + **webhook forgery rejection test**); integration with staging Bunny; state-machine unit tests |
| **6 Student Learning Experience (+ Exams, 0029)** | curriculum browsing, lesson page, player, PDF viewer, progress RPC, resume, completion, notifications view, per-unit exams (MCQ auto-graded, essay graded) | Progress persists/resumes; 90% deterministic completion; locked content gated by trial/purchase; exam attempt graded once | Vitest RPC wrapper tests; Playwright student flow with seeded data; DB harness 09_exams.sql |
| **7 Dashboards (+ Comments, 0030)** | staff dashboard (students, purchases + revenue, content readiness, codes, engagement, students-by-grade, top units, recent purchases via one `get_dashboard_stats` RPC — 0018), StaffNav across all walid pages, student dashboard unread badge + curriculum/notifications links, lesson comments | Real data rendered; no mock; responsive; comments post + reply + delete | Vitest UI; DB harness 06_dashboard_stats.sql + 10_comments.sql |
| **8 Notifications & Audit** | notification engine (unit_activated once, new_content, exam/comments events), read/unread, audit UI, filters, export EF; `set_user_role` + `/admin/roles` role-management UI | Activation notification fires exactly once per purchase; audit export CSV correct with Arabic/BOM; **`set_user_role` works and escalates only via admin** (role-escalation tests); **webhook forgery rejection test passes** | pgTAP dedup test + role-escalation tests; EF integration test; Playwright |
| **9 Security Hardening** | RLS review, IDOR tests, secret scan, storage access tests, purchase-bypass tests, role escalation tests, race test | All hardening checks pass; findings fixed or documented | Dedicated security test suite (SQL + E2E attempts) |
| **10 QA/Verification** | Full test suites (DB, auth, RLS, integration, business rules, UI, responsive, regression) | All green; no known blockers | CI runs everything |
| **11 Production Readiness** | build, env verification, migrations, deployment (frontend + EFs + secrets), storage, Bunny, security, error handling, monitoring (Supabase logs + uptime), README, final PLAN.md answers (§19 of PLAN); **regression controls (R-A/R-C/R-F):** DB triggers version-pinned (digest recorded + unit-tested in CI), **`supabase db reset` never runs against production** (only `db push` / `db migrations up`), migration rollback/snapshot strategy documented (reversible migrations or verified snapshot; production schema snapshot taken before each release) | All PLAN §19 verification questions answered YES | Final smoke + manual verification script |

**Per-phase operating loop (PLAN §17):** plan → implement → validate → test → fix → re-test → update PLAN.md → next phase.

---

## 16. TESTING STRATEGY

| Layer | Tool | Approach |
|---|---|---|
| DB schema/constraints | pgTAP (`supabase test db`) | Table/enum/column/constraint presence; FK integrity; CHECK rules (prices ≥ 0); unique codes; partial unique primary video; UNIQUE (student_id, unit_id) |
| RLS | pgTAP role simulation | `SET ROLE` + `auth.uid()`-style injection (via `supabase test` helper or custom `set_auth` wrapper) asserting allowed/denied per policy row for student/mr_walid/admin/teacher; disabled & deleted student matrix; **notification immutability (MED-3 + binding B2):** direct UPDATE revoked from `authenticated` (mark-read RPC-only; no table- or column-level UPDATE privilege — PostgreSQL has no column-scoped policies, `FOR UPDATE OF` is a SELECT row-lock clause); own-row RLS UPDATE policy retained as belt-and-braces; **direct UPDATE of any kind must fail**; **unit_purchases direct INSERT must fail** (RPC-only, `unit_purchases_insert_via_rpc` with CHECK false) |
| Business rules | pgTAP + RPC-level tests | Redemption validations (error order); 90% completion determinism; once-only activation notification; replacement reset; monotonic percent; **grade-change-mid-session case (H5):** staff changes a student's grade → the accessible grade set changes immediately (RLS re-evaluates) and stale-grade lesson access is denied while new-grade lessons open; **trial lesson opens without purchase** |
| Edge Functions | Deno `deno test` + integration | Unit: webhook token verification, JWT handling, signed-URL generation, CSV build. Integration: `supabase functions serve` against local/CI Supabase + stubbed Bunny HTTP; webhook happy/error paths; **webhook forgery rejection** — unsigned/forged payloads with wrong or missing secret must be rejected (401/403) |
| **Sign-in gate** | pgTAP + Playwright | Register → admin disables → login fails (Arabic `account_inactive_or_deleted` copy) → enable → login succeeds; same for soft-deleted → restore |
| **Code redemption race** | Concurrent harness (JS/PowerShell script or Playwright API calls) | Fire 10–50 simultaneous redemptions of one code against real backend; assert **exactly one success**, all others rejected with `code_already_used`; repeat N times |
| Frontend unit/component | Vitest + RTL | Guards, form validation, state components, RPC wrapper mocks |
| E2E | Playwright (Chrome mobile+desktop viewports) | Registration→login→redeem→watch→progress; locked content without purchase; trial lesson open; walid CRUD; admin audit export; RTL assertions; sign-in gate flow (see dedicated row above) |
| CI | GitHub Actions | Lint → typecheck → db test → vitest → build → deploy EFs → (scheduled) smoke |

Test data: seeded via migrations (fixture grades, units, pricing, codes) — never mock backend calls in E2E for business flows.

---

## 17. SECURITY STRATEGY

1. **Secrets:** service-role key, Bunny API key, signing key, webhook secret live only in Edge Function env / CI; `VITE_*` carries only URL + anon publishable key. `.env.example` documents names without values. Secret scan in CI.
2. **JWT:** all client→DB traffic uses anon key + user JWT; RLS evaluates per-row; Edge Functions verify via `supabase.auth.getUser()`; `bunny-video-webhook` authenticates via a shared token (`?token=` URL or `x-webhook-token` header, constant-time compare — Bunny signature headers are not available, R17).
3. **RLS:** mandatory on all application tables + force RLS; SECURITY DEFINER functions have `SET search_path` and explicit grants (`REVOKE ALL ... GRANT EXECUTE TO authenticated`); no direct DML policies on money-critical tables (`unit_pricing`, `unit_codes`, `unit_purchases`). All SECURITY DEFINER functions (incl. trigger functions) MUST be owned by `postgres` (superuser) or a BYPASSRLS role — enforced by a pgTAP ownership test (binding B1).
4. **Storage:** private buckets; no public policies; signed URLs with short TTLs; upload URLs role-gated.
5. **IDOR:** RLS-scoped SELECTs (`id = auth.uid()`), UUID PKs, and entity ownership checks in every RPC; Edge Functions re-derive access from DB (never trust client IDs blindly — `can_access_lesson` is the single gate).
6. **Rate limiting:** Supabase Auth built-in limits (register/login); redemption serialized by advisory lock; Edge Functions add simple per-user caps (e.g. signed-URL issuance) via DB counters or Supabase platform limits (documented).
7. **Client-side trust:** never for authz — localStorage only for session persistence; all locks enforced server-side.
8. **Email immutability:** trigger blocks `auth.users` email UPDATE (A13).
9. **Escalation prevention:** role column writeable only via admin SECURITY DEFINER path; RLS WITH CHECK guards.
10. **Disposal:** soft-delete everywhere; hard delete only via direct SQL (documented, never UI). **WARNING (LOW-11):** direct SQL hard deletes **CASCADE away dependent history** — deleting a `profiles` row destroys its `unit_purchases`, `progress`, `notifications`; deleting a `grades` row cascades into `units` → `lessons` → `lesson_videos`/`lesson_pdfs`/`progress`. History is permanently lost. The runbook mandates **soft delete first**; hard delete only after an explicit data-archival decision.
11. **Sign-in gate (A34):** `block_sign_in_for_inactive_accounts()` trigger blocks disabled/deleted accounts at `auth.users`; disable/soft-delete revoke `auth.sessions` (service role); RLS + Edge Function profile checks are defense-in-depth.
12. **Trigger hygiene (R-A):** all `auth.users` triggers (`block_email_change`, `block_sign_in_for_inactive_accounts`, `handle_new_user`) are version-pinned (digest recorded) and unit-tested in CI so silent Supabase changes can't break or weaken them.
13. **Account-status enumeration tradeoff (LOW-13):** the `account_inactive_or_deleted` sign-in error reveals that an account exists but is inactive (vs. generic "invalid credentials" for unknown emails). **Accepted tradeoff** — the error is required for a clear Arabic user message (I6) and the accounts are UUID-keyed/unguessable; documented in SECURITY.md, not treated as a defect.
14. **RPC grant hygiene (MED-6) — explicit matrix.** All SECURITY DEFINER functions are created with `SET search_path = public`. Default posture: `REVOKE EXECUTE ON FUNCTION ... FROM anon, authenticated` for **all internal functions**: `create_unit_codes_internal`, `set_video_status` (internal; no public variant exists — see §8.2 naming note), `set_video_status_ef` (if ever introduced, same treatment), `recheck_video_states`, `notify_new_content`, `audit_log`, `handle_new_user`, `block_email_change`, `block_sign_in_for_inactive_accounts`, `set_updated_at`, `is_student`, `is_mr_walid`, `is_admin`, `is_teacher`, `get_current_role`, `can_access_lesson` (used inside RLS/EFs, not callable by clients).
    **Client-callable allowlist** (GRANT EXECUTE TO authenticated; plus `anon` for `get_public_settings`, `list_active_grades` and `get_platform_fee`; `get_public_unit_prices` is granted to anon + authenticated):
    `update_own_profile`, `update_student_profile` (binding B3), `redeem_unit_code`, `get_my_unit_purchases`, `get_my_lesson_access`, `upsert_progress`, `mark_notification_read`, `mark_all_notifications_read`, `set_student_grade`, `disable_student`, `enable_student`, `soft_delete_student`, `restore_student`, `list_trash`, `set_unit_price`, `set_platform_fee`, `get_platform_fee`, `list_unit_pricing`, `create_unit_codes_for_staff`, `list_codes_by_unit`, `revoke_unit_code`, `list_all_unit_purchases`, `unit_purchase_stats`, `set_lesson_trial`, `create_unit`, `update_unit`, `delete_unit`, `restore_unit`, `create_lesson`, `update_lesson`, `publish_lesson`, `hide_lesson`, `soft_delete_lesson`, `restore_lesson`, `delete_grade`, `restore_grade`, `set_app_setting`, `set_user_role`, `set_role_by_email`, `finalize_pdf_upload`, `get_public_settings`, `list_active_grades`, `get_public_unit_prices`, `get_dashboard_stats`, `list_audit_logs`, `count_audit_logs`.
    Everything else is REVOKEd; the allowlist is enforced by a pgTAP grant test.

---

## 18. RISK LIST & MITIGATIONS

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Bunny webhook missed/lost → video stuck in processing | Content unavailable | Webhook token check + hourly `recheck_video_states()` reconciliation job; manual retry UI |
| R2 | Redemption race under load | Double redemption / double purchase | Advisory lock + FOR UPDATE + UNIQUE(student_id, unit_id) backstop; race tests |
| R3 | No forgot-password (MVP) → lockouts | Support load | Documented admin/SQL recovery path (A13/A14); password change only for logged-in users |
| R4 | Managed scheduler / `pg_cron` / `pg_net` unavailability | Video-recheck job fails | **One unified execution chain (MED-4):** ① `supabase functions schedule` (managed scheduler) → ② pg_cron → `pg_net.http_post()` → internal Edge Function → ③ external cron (GitHub Actions scheduled workflow) invoking the same internal job Edge Function. **No SELECT-side trigger fallback (impossible).** Verify each link's availability in Phase 1 (A19). Only `recheck_video_states` needs scheduling — there is no expiry job |
| R5 | Permanent access means no natural "expiry" revenue lever | Business model | Deliberate product decision (per-unit lifetime purchase); pricing covers it; no mitigation needed |
| R6 | RLS subquery performance (per-row role checks on hot tables) | Slow progress/notifications | STABLE SECURITY DEFINER helpers, targeted indexes, connection pooling; measure in Phase 9/10 |
| R7 | N/A — no time-based warnings exist | — | Removed from this design (no expiry concept) |
| R8 | Secret leakage into frontend | Full compromise | CI secret scan; code review rule; no `VITE_*` for secrets; Edge Functions only |
| R9 | Video URL sharing beyond TTL | Revenue leakage | Signed URL TTL **20 min** (S3) + live `can_access_lesson` at issuance; documented residual risk |
| R10 | PDF URL sharing beyond TTL | Revenue leakage | Short TTL (10–15 min) + live check per issuance; documented residual risk |
| R11 | Bunny library/secrets not provisioned at Phase 5 start | Phase 5 stalls | Provision in Phase 1 checklist; staging library for tests |
| R12 | Seed admin password exposure | Account takeover | Password from CI secret; force rotate after first login (documented) |
| R13 | Migration drift between `migrations/` and `supabase-full-schema.sql` | Schema inconsistency | CI check: `supabase db diff` / dump compare on PR |
| R14 | Replacement racing with in-flight playback | Broken sessions | Replacement finalized transactionally (primary flip + reset atomically); old signed URLs expire by TTL |
| R15 | `auth.users` trigger blocking future Supabase features (e.g. email change via dashboard) | Operational friction | Trigger scoped to app path; documented SQL escape hatch (A13) |
| R16 | Admin cannot change email "from normal UI" but support may need it | Operational | Assumption A13: direct SQL; documented runbook |
| R17 | Bunny webhook signature feature unavailable on account | Webhook forgery | Phase 5 pre-check (§8.6): secret token in webhook URL + constant-time compare + strict payload validation fallback |
| R18 | Broken migration on production (no rollback path) | Downtime/data loss | Version-pinned triggers + tests (R-A); **no `db reset` against production** (R-C); reversible migrations or verified snapshot; pre-release schema snapshot (R-F, Phase 11) |

---

## 19. ASSUMPTIONS REGISTER

1. **A1 — Grade required at sign-up (rewritten per 0027):** students pick their grade during registration from the anon-safe `list_active_grades()` list; `handle_new_user()` **requires** a valid `grade_id` (exists, active, not soft-deleted) in `raw_user_meta_data` and fails closed (`grade_required` / `grade_not_available` / `invalid_grade_id`). Grade can be changed later only by `set_student_grade` (mr_walid/admin). Redemption and `can_access_lesson()` use the current profile grade, evaluated live.
2. **A2 — Primary assets:** a lesson may hold multiple videos/PDFs but only one **primary** of each is exposed to students (partial-unique index). Student-facing SELECT policies **and** signed-URL Edge Functions (video + PDF) resolve the primary asset server-side only; non-primary assets are never reachable by students (MED-7); replacement promotes a new primary.
3. **A3 — Phone uniqueness:** student phone is UNIQUE (lookup/contact aid); guardian phone may be shared by multiple students.
4. **A4 — Permanent purchase (rewritten):** a unit purchase never lapses — no time limit, no duration, no expiry job. Access to a purchased unit is lifetime unless the student is disabled/deleted (RLS + sign-in gate) or a unit is removed from their grade.
5. **A5 — One purchase per unit per student:** UNIQUE `(student_id, unit_id)`; redeeming a second code for an already-purchased unit raises `unit_already_purchased`. There is no extension concept.
6. **A6 — Total price:** `total_price = base_price + platform_fee` computed as a GENERATED column in both `unit_pricing` and `unit_purchases`; the purchase snapshot is copied at redemption (MED-5).
7. **A7 — Once-only notifications:** every deterministic event carries a unique `dedup_key` (`unit_activated:{purchase_id}`, `new_content:{lesson_id}:{student_id}`, etc.); `UNIQUE(dedup_key)` + `ON CONFLICT DO NOTHING` guarantees exactly-once delivery even if the producer runs repeatedly.
8. **A8 — (removed)** — no expiry authority exists; access is permanent and checked live via `can_access_lesson()`.
9. **A9 — (removed)** — no time continues during disable; purchases simply become unreachable while disabled and return when re-enabled/restored (A10).
10. **A10 — Restore semantics:** restore sets `status='active'`, `deleted_at=NULL`; access to purchased units is then governed solely by `can_access_lesson()`.
11. **A11 — Video replacement policy:** on replacement, progress rows pinned to the replaced video are reset (position=0, percent=0, is_completed=false) atomically with the primary flip; rows referencing the new video are untouched.
12. **A12 — Completion irreversibility:** once `percent_completed >= 90`, `is_completed` stays true forever (no un-complete flow); percent is monotonic (GREATEST). **Single deterministic exception:** video replacement (A11/§7.5) resets the affected progress rows atomically to a zero state (position=0, percent=0, is_completed=false).
13. **A13 — Email immutability:** email change blocked for all roles in the app UI *and* by DB trigger on `auth.users`; exceptional fixes only via direct SQL/Supabase dashboard (documented runbook). No OTP, no forgot-password in MVP.
14. **A14 — MVP auth scope:** registration immediate (no OTP/email confirmation toggled on); forgot-password intentionally absent (future phase per PLAN).
15. **A15 — Roles:** exactly four fixed roles (`student`, `mr_walid`, `admin`, `teacher`); no granular permission tables (PLAN allows this).
16. **A16 — Audit writes:** trigger-based for table DML + explicit calls in SECURITY DEFINER RPCs; audit table insert-only, admin-select-only.
17. **A17 — Egyptian phone format:** `^(\+20|0)1[0-9]{9}$` validated client- and server-side for both phone fields.
18. **A18 — Bunny setup:** a single Bunny video library + pull zone with token auth enabled; signing key + hostname provisioned as secrets before Phase 5.
19. **A19 — Job scheduling chain (MED-4):** the only scheduled job (`recheck_video_states`) runs via one unified chain — ① `supabase functions schedule` (preferred) → ② pg_cron → pg_net → internal Edge Function → ③ external cron (GitHub Actions scheduled workflow). Link availability verified in Phase 1; never SELECT-side triggers (R4).
20. **A20 — Hosting:** frontend on Netlify/Vercel/Cloudflare Pages; Edge Functions on Supabase Edge Runtime; CI on GitHub Actions.
21. **A21 — Seed users:** one `admin` and one `mr_walid` seeded via migration with password from CI secret; rotate-on-first-login recommended.
22. **A22 — Code format:** `WLDN-XXXX-XXXX-XXXX` from the **unambiguous charset** `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O, 1/I), stored uppercase and CHECK-constrained (`code = upper(code)` + regex, L1), generated with `pgcrypto gen_random_bytes`; all lookups normalize to uppercase.
23. **A23 — Audit export:** CSV generated server-side, stored in private `audit-exports` bucket, returned via 10-minute signed URL; UTF-8 with BOM for Excel/Arabic.
24. **A24 — Progress trust:** client sends position/percent; server clamps and derives completion; client cannot force completion below 90%.
25. **A25 — Bunny metadata:** duration + thumbnail pulled from Bunny API/webhook after processing and stored on `lesson_videos`.
26. **A26 — Multi-device:** concurrent playback allowed; resume = last write wins; percent monotonic.
27. **A27 — WhatsApp scope:** `mr_walid` may edit `whatsapp%` settings; `admin` may edit all app settings; WhatsApp number displayed on landing + student contact button.
28. **A28 — Notification dedup keys:** system-generated deterministic keys (Section 3.4); `ON CONFLICT (dedup_key) DO NOTHING` enforces uniqueness of unique events.
29. **A29 — Revoked-code rule:** revoking a used code does not cancel the purchase it created (history preserved); revocation is for administrative/corrective use. Purchase voiding (admin, audited) is separate and outside the normal flow.
30. **A30 — Analytics definition:** unit/grade progress = unweighted mean of lesson percentages; "most-viewed" = sum of `last_watched_at` touches (progress writes) per lesson.
31. **A31 — No hard deletes in UI:** all deletes are soft; hard delete only via direct SQL with documented runbook.
32. **A32 — Login blocked for inactive accounts (rewritten per architecture review):** deleted AND disabled accounts are **blocked at sign-in** by `block_sign_in_for_inactive_accounts()` on `auth.users` (BEFORE UPDATE OF `last_sign_in_at`; raises `account_inactive_or_deleted` when `profiles.deleted_at IS NOT NULL OR status <> 'active'`); RLS (`is_student()`) remains defense-in-depth; ALL Edge Functions add an active/not-deleted profile check alongside role checks; `disable_student`/`soft_delete_student` optionally revoke `auth.sessions` (service role). The previous "disabled accounts may still log in" claim is **removed**.
33. **A33 — Grade-binding (H5):** `can_access_lesson()` requires the student's **current** profile grade to equal the lesson's grade AND (trial lesson **or** an active purchase of the lesson's unit). Accepted consequence: a staff grade change mid-session changes the accessible grade set **immediately** on the next request; pgTAP covers the case. Purchases themselves are not grade-bound after creation — a grade change simply makes the old grade's units unreachable while the purchases remain in history.
34. **A34 — Sign-in gate trigger:** `block_sign_in_for_inactive_accounts()` is the authoritative sign-in gate (see A32); it is version-pinned and unit-tested (R-A), and `disable_student`/`soft_delete_student` revoke `auth.sessions` (service role) — refresh tokens die immediately; already-issued access JWTs remain valid ≤1h and are closed by RLS + EF profile checks (MED-9). Feasibility of `DELETE FROM auth.sessions` from Postgres is spiked in Phase 1 (LOW-18).
