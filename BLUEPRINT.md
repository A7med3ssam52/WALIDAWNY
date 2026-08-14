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
An Arabic-first, RTL educational platform for "Mr. Walid". Students buy **time-limited subscription access** to a video+PDF curriculum organized as **Grade → Unit → Lesson → (Video, PDF)**. Mr. Walid manages curriculum, students, subscriptions and content; an Admin additionally manages system configuration, pricing, roles and audit logs.

### 1.2 Users
| Role | Capability summary | Notes |
|---|---|---|
| `student` | Browse curriculum, watch videos, read PDFs, track progress, manage own profile/password, read own notifications, redeem one activation code | Cannot change grade/role/email, cannot modify subscription state, cannot touch other users' data |
| `mr_walid` | Manage students (disable/enable, soft-delete/restore via Trash), grades, curriculum (units/lessons/videos/PDFs), subscription codes, pricing is read-only, WhatsApp setting, progress analytics | Cannot read audit logs, cannot escalate role, cannot manage pricing |
| `admin` | Everything Mr. Walid can do, **plus**: pricing/platform fee management, role/permission management, audit logs (read + export), system settings, operational statistics | Highest privilege |

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
2. Supabase Storage: signed PDF URLs (subscription-aware), PDF upload authorization.
3. Subscription code generation.
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
- No duplicated data; history preserved (subscriptions, redemptions) — never overwritten.
- Soft-delete via `deleted_at timestamptz NULL` on business entities (students, content); hard deletes are never performed in normal application flows.
- All schema in `supabase/migrations/*.sql` (ordered) + consolidated `supabase/supabase-full-schema.sql`, idempotent (`CREATE OR REPLACE`, `DO $$ ... IF NOT EXISTS` where practical).
- Extensions: `pgcrypto` (code generation), `pg_cron` (scheduling fallback), `pg_net` (pg_cron→internal HTTP calls) — all three declared in the migration extension list.
- Storage inventory included in migrations per PLAN §5: `INSERT INTO storage.buckets` for `pdfs` and `audit-exports`, storage-level RLS enabled, **no anonymous policies** (Section 3.7).
- `updated_at` maintenance via a single `set_updated_at()` BEFORE UPDATE trigger attached to every table with an `updated_at` column.

### 3.2 Enums
```sql
CREATE TYPE public.user_role         AS ENUM ('student','mr_walid','admin');
CREATE TYPE public.account_status    AS ENUM ('active','disabled');
CREATE TYPE public.subscription_status AS ENUM ('active','expired');  -- 'revoked' removed: unused; revocation applies to codes only (A29)
CREATE TYPE public.code_status       AS ENUM ('available','used','revoked');
CREATE TYPE public.content_status    AS ENUM ('draft','published','hidden');
CREATE TYPE public.video_status      AS ENUM ('pending_upload','uploading','processing','ready','failed','replaced');
CREATE TYPE public.notification_type AS ENUM ('subscription_activated','subscription_expiring','subscription_expired','new_content','system');
```

### 3.3 Tables (14 application tables)

**`profiles`** — one row per `auth.users` (role: student default).
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, FK → `auth.users(id)` ON DELETE CASCADE |
| `full_name` | text | NOT NULL |
| `phone` | text | NOT NULL, UNIQUE, CHECK Egyptian format (A17) |
| `guardian_phone` | text | NOT NULL, CHECK Egyptian format (may repeat across students) |
| `address` | text | NOT NULL |
| `grade_id` | uuid | NULL, FK → `grades(id)` ON DELETE SET NULL (A1) |
| `role` | user_role | NOT NULL DEFAULT 'student' |
| `status` | account_status | NOT NULL DEFAULT 'active' |
| `deleted_at` | timestamptz | NULL (soft-delete/Trash) |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |
- Indexes: `idx_profiles_grade` ON `(grade_id)`, `idx_profiles_role` ON `(role)`, partial index `idx_profiles_trash ON (id) WHERE deleted_at IS NOT NULL`.
- Triggers: `handle_new_user()` on `auth.users` INSERT (creates profile from `raw_user_meta_data`), `block_email_change()` on `auth.users` UPDATE (A13), `block_sign_in_for_inactive_accounts()` on `auth.users` BEFORE UPDATE OF `last_sign_in_at` (A34), `set_updated_at()` BEFORE UPDATE (all tables with `updated_at`, §3.1).

**`grades`**
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | NOT NULL, UNIQUE |
| `sort_order` | int | NOT NULL DEFAULT 0 |
| `is_active` | boolean | NOT NULL DEFAULT true |
| `deleted_at` | timestamptz | NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |

**`pricing_plans`** — duration-based offers per grade.
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `grade_id` | uuid | NOT NULL, FK → `grades(id)` ON DELETE CASCADE |
| `duration_days` | int | NOT NULL, CHECK (`duration_days > 0`) |
| `base_price` | numeric(10,2) | NOT NULL, CHECK (`base_price >= 0`) |
| `platform_fee` | numeric(10,2) | NOT NULL, CHECK (`platform_fee >= 0`) |
| `total_price` | numeric(10,2) | NOT NULL, CHECK (`total_price = base_price + platform_fee`) (A6) |
| `is_active` | boolean | NOT NULL DEFAULT true |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |
- UNIQUE `(grade_id, duration_days)`. Index on `(grade_id)`.

**`subscriptions`** — immutable-ish history; status changes only by job/revocation.
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `student_id` | uuid | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE (profiles are only soft-deleted → history preserved) |
| `pricing_plan_id` | uuid | NOT NULL, FK → `pricing_plans(id)` ON DELETE RESTRICT (preserves historical pricing) |
| `base_price` | numeric(10,2) | NOT NULL, CHECK (`base_price >= 0`) — **price snapshot copied from the pricing plan at activation** (MED-5) |
| `platform_fee` | numeric(10,2) | NOT NULL, CHECK (`platform_fee >= 0`) — price snapshot copied at activation |
| `total_price` | numeric(10,2) | NOT NULL, CHECK (`total_price = base_price + platform_fee`) — price snapshot copied at activation |
| `code_id` | uuid | NULL, FK → `subscription_codes(id)` ON DELETE SET NULL |
| `source` | text | NOT NULL DEFAULT 'code', CHECK (`source IN ('code','manual')`) |
| `started_at` | timestamptz | NOT NULL DEFAULT now() |
| `expires_at` | timestamptz | NOT NULL, CHECK (`expires_at > started_at`) |
| `status` | subscription_status | NOT NULL DEFAULT 'active' (no `revoked` status — revocation applies to codes only, A29) |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |
- Indexes: `idx_subs_student` ON `(student_id, status)`, `idx_subs_expires` ON `(expires_at)`.
- Validity is **derived live**: `status = 'active' AND expires_at > now()` (view `v_active_subscriptions`); expiry job flips rows to `expired` daily (A8).

**`subscription_codes`**
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `code` | text | NOT NULL, UNIQUE, stored uppercase, CHECK `code = upper(code)` AND format `^WLDN-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$` (unambiguous charset: no 0/O, 1/I — A22) |
| `pricing_plan_id` | uuid | NOT NULL, FK → `pricing_plans(id)` ON DELETE RESTRICT |
| `status` | code_status | NOT NULL DEFAULT 'available' |
| `created_by` | uuid | NOT NULL, FK → `profiles(id)` |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |
| `used_at` | timestamptz | NULL |
| `used_by` | uuid | NULL, FK → `profiles(id)` |
| `revoked_at` / `revoked_by` | timestamptz / uuid | NULL / FK → `profiles(id)` |
| `note` | text | NULL |

**`code_redemptions`** — authoritative redemption history.
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `code_id` | uuid | NOT NULL, FK → `subscription_codes(id)` ON DELETE RESTRICT |
| `student_id` | uuid | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `subscription_id` | uuid | NOT NULL, FK → `subscriptions(id)` ON DELETE RESTRICT (redemption history must survive any subscription cleanup — L6) |
| `redeemed_at` | timestamptz | NOT NULL DEFAULT now() |
- UNIQUE `(code_id)` — physically prevents double redemption.

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
| `published_at` | timestamptz | NULL |
| `deleted_at` | timestamptz | NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |
- Index `(unit_id, sort_order)`. Trigger: on status→published, calls `notify_new_content()` (deduped, A28).

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
| `entity_type` | text | NULL (e.g. 'lesson','subscription') |
| `entity_id` | uuid | NULL |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |
- Index `(user_id, is_read, created_at desc)`.

**`audit_logs`** — admin-only.
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `actor_id` | uuid | NULL (NULL = system job), FK → `profiles(id)` ON DELETE SET NULL |
| `actor_role` | user_role | NULL |
| `action` | text | NOT NULL (e.g. 'student.disable', 'lesson.publish', 'code.redeem') |
| `entity_type` | text | NOT NULL |
| `entity_id` | uuid | NULL |
| `metadata` | jsonb | NULL |
| `ip_address` | text | NULL (best-effort, may be NULL — L3) |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |
- Indexes: `(created_at)`, `(action)`, `(entity_type, entity_id)`, `(actor_id)`.
- Populated by a **trigger** (`audit_trigger()`) on a fixed table inventory (MED-8): `profiles`, `grades`, `units`, `lessons`, `lesson_videos`, `lesson_pdfs`, `pricing_plans`, `subscriptions`, `subscription_codes`, `app_settings` — for INSERT/UPDATE/DELETE + explicit `audit_log()` calls inside SECURITY DEFINER RPCs (Section 12). `progress` and `notifications` are **explicitly excluded** (high-volume, student-owned, no admin insight value).

**`app_settings`**
| Column | Type | Constraints |
|---|---|---|
| `key` | text | PK (e.g. `whatsapp_number`, `whatsapp_default_message`, `platform_name`, `expiry_warning_days`) |
| `value` | jsonb | NOT NULL |
| `description` | text | NULL |
| `updated_by` | uuid | NULL, FK → `profiles(id)` |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() |

**`auth.users`** — managed by Supabase (email + password). Never written by application code.

### 3.4 Deduplication keys for notifications (A28)
| Event | dedup_key pattern |
|---|---|
| 7-day warning | `sub_expiring:{subscription_id}` |
| Expiry | `sub_expired:{subscription_id}` |
| Activation | `sub_activated:{subscription_id}` |
| New content | `new_content:{lesson_id}:{student_id}` |

### 3.5 Views
| View | Purpose |
|---|---|
| `v_active_subscriptions` | `status='active' AND expires_at > now()` joined to non-deleted, non-disabled students |
| `v_lesson_access` | published, non-deleted lessons with per-user `can_access` (uses `can_access_lesson()`) |
| `v_student_progress_summary` | per student: percent per grade/unit, completion counts |
| `v_lesson_stats` | views/plays/completions per lesson (from progress) for analytics |
| `v_dashboard_metrics` | admin stats: totals (students active/disabled, subscribers, expired, published/hidden lessons, codes available/used) |
| `v_audit_log` | audit_logs + actor name/role joined |

All views use default **SECURITY INVOKER** semantics (no `SECURITY DEFINER`/`security_barrier`), so per-row RLS of the underlying tables still applies to the invoking user (L5).

**Note (LOW-14):** `v_lesson_access` is student-facing (returns empty for staff because `can_access_lesson()` requires `is_student()`). Staff dashboards must use the dedicated staff views/queries (`v_lesson_stats`, `v_dashboard_metrics`, direct staff-scoped queries), never `v_lesson_access`.

### 3.6 RPC Functions (signatures)
```sql
-- auth/roles
handle_new_user()                TRIGGER (auth.users INSERT) SECURITY DEFINER   -- reads ONLY full_name, phone, guardian_phone, address from raw_user_meta_data; IGNORES any student-supplied grade_id (grade_id forced NULL — HIGH-1); FAILS CLOSED (raises) if any required meta field is missing (admin-created users must include them; intended behavior — LOW-12)
block_email_change()             TRIGGER (auth.users BEFORE UPDATE) SECURITY DEFINER  -- raises if OLD.email IS DISTINCT FROM NEW.email; no-op otherwise; WHEN clause, never fires on INSERT (S6/A13)
block_sign_in_for_inactive_accounts() TRIGGER (auth.users BEFORE UPDATE OF last_sign_in_at) SECURITY DEFINER  -- raises when profiles.status <> 'active' OR deleted_at IS NOT NULL (A34)
set_updated_at()                 TRIGGER (BEFORE UPDATE on all tables with updated_at)  -- sets updated_at = now()
get_current_role()          RETURNS user_role                                    -- from auth.uid()
is_student() / is_mr_walid() / is_admin()  RETURNS boolean  STABLE SECURITY DEFINER
get_public_settings()       RETURNS jsonb   SECURITY DEFINER (SET search_path = public — LOW-15), GRANT EXECUTE TO anon+authenticated  -- returns ONLY whatsapp_number, whatsapp_default_message, platform_name; nothing else leaks

-- student self-service
update_own_profile(p_full_name text, p_phone text, p_guardian_phone text, p_address text)   -- SECURITY DEFINER; whitelisted to the 4 editable columns only
redeem_subscription_code(p_code text) RETURNS uuid  -- SECURITY DEFINER; atomic (Section 6); normalizes input code to upper() (L1)
get_my_subscriptions() RETURNS SETOF subscriptions
get_my_current_subscription() RETURNS subscriptions
upsert_progress(p_lesson_id uuid, p_position_seconds int, p_percent numeric) RETURNS progress -- SECURITY DEFINER (Section 11; video-pinning guard M4)
mark_notification_read(p_notification_id uuid)        -- SECURITY DEFINER; own rows only
mark_all_notifications_read()                         -- SECURITY DEFINER; own rows only

-- admin
set_user_role(p_user_id uuid, p_role user_role)       -- SECURITY DEFINER + audit (user.role_change); admin-only; the ONLY path that mutates role
set_student_grade(p_student_id uuid, p_grade_id uuid) -- SECURITY DEFINER + audit
update_student_profile(p_student_id uuid, p_full_name text, p_phone text, p_guardian_phone text, p_address text) -- SECURITY DEFINER + audit (mr_walid/admin; 4-column whitelist — architecture-gate binding B3)
disable_student(p_student_id uuid) / enable_student(p_student_id uuid)   -- SECURITY DEFINER + audit; disable also revokes auth.sessions via service role (A34)
soft_delete_student(p_student_id uuid) / restore_student(p_student_id uuid) -- SECURITY DEFINER + audit; delete also revokes auth.sessions via service role (A34)
list_trash() RETURNS SETOF profiles   SECURITY DEFINER  -- deleted_at IS NOT NULL; mr_walid/admin
create_manual_subscription(p_student_id uuid, p_plan_id uuid, p_started_at timestamptz, p_notes text) -- SECURITY DEFINER + audit; p_notes stored in audit metadata (binding B6)
generate_codes_internal(p_plan_id uuid, p_count int, p_note text) RETURNS SETOF subscription_codes  -- SECURITY DEFINER (called by Edge Function)
revoke_subscription_code(p_code_id uuid)                              -- SECURITY DEFINER + audit
create_unit / update_unit / delete_unit(soft) / restore_unit / create_lesson / update_lesson / publish_lesson / hide_lesson / soft_delete_lesson / restore_lesson / delete_grade(soft) / restore_grade ... -- SECURITY DEFINER + audit + notify_new_content on publish (LOW-17)
set_app_setting(p_key text, p_value jsonb)                            -- mr_walid: whatsapp only; admin: all
set_pricing_plan(...) / delete_pricing_plan(...)                      -- admin only + audit; delete: hard-delete only unreferenced plans, else is_active=false (binding B7)

-- system (execution: scheduled Edge Functions preferred; pg_cron → pg_net → internal Edge Function fallback — §6.4/R4)
expire_subscriptions()  -- flip expired, emit expiry/warning notifications (dedup), audit; SECURITY DEFINER
recheck_video_states()  -- reconcile stuck Bunny videos; SECURITY DEFINER
set_video_status(video_id uuid, new_status video_status, ...)  -- internal, NO client grants (MED-6/§8.2); promotes/demotes is_primary, audits
finalize_pdf_upload(p_pdf_id uuid)  -- marks is_ready, audits; SECURITY DEFINER (client-callable, staff only via RLS guards)
audit_log(action text, entity_type text, entity_id uuid, metadata jsonb)  -- internal, NO client grants; called by RPCs/triggers
notify_new_content(p_lesson_id uuid)  -- SECURITY DEFINER; deduped; targets ACTIVE SUBSCRIBERS of the lesson's grade only (M1/§13); bulk fan-out acceptable at current scale — consider Edge-Function fan-out later (LOW-19)
can_access_lesson(p_lesson_id uuid) RETURNS boolean  -- SECURITY DEFINER STABLE (Section 5.3; grade-binding rule A33)
```

### 3.7 Storage Buckets
| Bucket | Visibility | Policy |
|---|---|---|
| `pdfs` | **private** | No public SELECT. Uploads: mr_walid/admin only via Edge Function-signed upload URL. Reads: signed URL from `get-pdf-signed-url` Edge Function after subscription check. |
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
- `app_settings`: `platform_name`, `whatsapp_number`, `whatsapp_default_message`, `expiry_warning_days=7`.
- `grades`: empty (created via UI) or one placeholder grade if needed for first login — decision: seeded empty; dashboard requires grade creation first.
- Seed `admin` and `mr_walid` profiles+users via migration with password injected from CI secret (A21).

---

## 4. AUTH ARCHITECTURE

### 4.1 Rules (from PLAN §2)
- Email + password registration; email required + unique (auth.enforce).
- No OTP, no forgot-password in MVP (A14).
- Password change allowed while authenticated (`supabase.auth.updateUser({password})`).
- **Email change: forbidden everywhere** — no UI, and a DB trigger on `auth.users` blocks UPDATE of email (A13; direct SQL dashboard is the documented escape hatch for exceptional fixes).
- Registration collects: full name, Egyptian phone, guardian phone (may repeat across students), address. **No grade field — the registration form never collects grade** (grade is staff-assigned only, A1/HIGH-1).
- No password-complexity rule beyond non-empty (Supabase default minimum 6 applies).

### 4.2 Flow
1. `supabase.auth.signUp({ email, password, options: { data: { full_name, phone, guardian_phone, address } } })` → `handle_new_user()` trigger creates the `profiles` row **from `raw_user_meta_data`** (role `student`, status `active`, `grade_id` **NULL — any client-supplied grade is ignored**) immediately, satisfying all NOT NULL columns — no OTP wait, no second-step profile insert.
2. `update_own_profile()` remains available post-registration for correcting the four editable fields; the registration form collects everything before signUp, so UX is a single form.
3. Session persistence via Supabase client (`persistSession`, default localStorage) + `onAuthStateChange` to drive the auth guard.
4. Password change: authenticated `auth.updateUser`.
5. No email change UI anywhere; no OTP/reset endpoints.

### 4.3 Integrity guarantees
- No orphan profiles: trigger on `auth.users` INSERT (and a cleanup trigger on DELETE removes profile row, CASCADE).
- No duplicate profiles: `profiles.id` = `auth.users.id` (1:1), PK-enforced.
- No client-controlled roles: `role` only settable by SECURITY DEFINER functions (admin), never via direct INSERT/UPDATE (RLS blocks + CHECK).
- No insecure profile creation: `insert_profile` allowed only by the auth trigger.
- **Fail-closed profile creation (LOW-12):** `handle_new_user()` raises if any required meta field (`full_name`, `phone`, `guardian_phone`, `address`) is missing — e.g. admin-created users via the Supabase dashboard must include them. Documented as intended: no partial/orphan profile rows are ever created.

---

## 5. AUTHORIZATION + RLS STRATEGY

### 5.1 Role helper functions (STABLE, SECURITY DEFINER, `SET search_path = public`)
```sql
is_admin()    := (SELECT role = 'admin'    FROM profiles WHERE id = auth.uid());
is_mr_walid() := (SELECT role = 'mr_walid' FROM profiles WHERE id = auth.uid());
is_student()  := (SELECT role = 'student'  FROM profiles
                  WHERE id = auth.uid() AND status = 'active' AND deleted_at IS NULL);
```
`is_student()` returns **false** for disabled/deleted accounts → blocked everywhere content/progress/subscription logic is concerned.

### 5.2 RLS policy matrix
Every table has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` plus `FORCE ROW LEVEL SECURITY` on all tables (belt & braces). All expressions below are the exact WHERE clauses.

**profiles**
- SELECT: `id = auth.uid()` (own) OR `is_admin() OR is_mr_walid()`
- INSERT: `is_admin()` (with CHECK role-whitelist: new role in enum, never student-created rows)
- UPDATE (student self-service): `USING (id = auth.uid() AND is_student()) WITH CHECK (id = auth.uid() AND role = (SELECT p.role FROM profiles p WHERE p.id = profiles.id) AND grade_id = (SELECT p.grade_id FROM profiles p WHERE p.id = profiles.id) AND status = (SELECT p.status FROM profiles p WHERE p.id = profiles.id) AND deleted_at IS NULL)` — only the **four editable columns** (`full_name`, `phone`, `guardian_phone`, `address`) can change: role/grade/status/deleted_at are pinned immutable in WITH CHECK, and the app only ever performs self-edits through the `update_own_profile()` RPC (SECURITY DEFINER column whitelist); direct table UPDATE is never issued by the app (M5).
- UPDATE (staff): **no broad staff UPDATE policy** — all staff profile mutations are RPC-only (`set_student_grade`, `update_student_profile`, `disable_student`, `enable_student`, `soft_delete_student`, `restore_student`, `set_user_role`), all SECURITY DEFINER + audited. Admin retains only the DELETE policy below.
- DELETE: `is_admin()` only (hard-delete escape hatch; app uses soft delete).

**grades** — SELECT: `is_admin() OR is_mr_walid() OR (is_student() AND deleted_at IS NULL AND is_active)` (students read active, non-deleted grades only — architecture-gate binding B8). INSERT/UPDATE/DELETE: `is_admin() OR is_mr_walid()`; WITH CHECK prevents `role` escalation (none present). (Admin-only hard delete; app soft-deletes.)

**pricing_plans** — SELECT: `is_admin() OR is_mr_walid() OR (is_student() AND is_active)` (student sees active plans for their grade). INSERT/UPDATE/DELETE: `is_admin()` only.

**subscriptions** — SELECT: `student_id = auth.uid()` (own history) OR `is_admin() OR is_mr_walid()`. INSERT/UPDATE/DELETE: RPC-only (`redeem_subscription_code`, `create_manual_subscription`, `expire_subscriptions`, `revoke_subscription_code`) — **no direct DML policies** (`WITH (NO POLICY)`).

**subscription_codes** — SELECT: `is_admin() OR is_mr_walid()` (students never see raw codes). INSERT/UPDATE/DELETE: RPC/Edge-Function-only. Row level: `WITH (NO POLICY)`.

**code_redemptions** — SELECT: `student_id = auth.uid() OR is_admin() OR is_mr_walid()`. INSERT: RPC-only. UPDATE/DELETE: none.

**units** — SELECT: `is_admin() OR is_mr_walid() OR (is_student() AND grade access: grade_id IN (SELECT grade_id FROM profiles WHERE id = auth.uid()) AND status='published' AND deleted_at IS NULL)`. INSERT/UPDATE/DELETE: `is_mr_walid() OR is_admin()`.

**lessons** — SELECT: `is_admin() OR is_mr_walid() OR (is_student() AND status='published' AND deleted_at IS NULL AND unit_id IN (SELECT id FROM units WHERE grade_id = (SELECT grade_id FROM profiles WHERE id = auth.uid()) AND status='published' AND deleted_at IS NULL))`. INSERT/UPDATE/DELETE: `is_mr_walid() OR is_admin()`.

**lesson_videos** — SELECT: `is_admin() OR is_mr_walid() OR (is_student() AND can_access_lesson(lesson_id) AND status='ready' AND is_primary)` — students see **only the primary `ready` video** of accessible lessons; processing/pending/replaced videos are invisible (PLAN: do not expose before ready). INSERT/UPDATE/DELETE: RPC/Edge-Function-only.

**lesson_pdfs** — SELECT: `is_admin() OR is_mr_walid() OR (is_student() AND can_access_lesson(lesson_id) AND is_ready AND is_primary)` — students see **only the primary ready PDF** of accessible lessons (MED-7). Direct SELECT by students returns **metadata only**; content bytes require signed URL (Section 9). INSERT/UPDATE/DELETE: RPC/Edge-Function-only.

**progress** — SELECT: `student_id = auth.uid() OR is_mr_walid() OR is_admin()`. INSERT/UPDATE/DELETE: RPC-only (`upsert_progress`) — students cannot write arbitrary rows; `WITH (NO POLICY)`.

**notifications** — SELECT: `user_id = auth.uid()`. UPDATE: direct UPDATE is **REVOKEd from `authenticated`** — mark-read happens **only via RPCs** (`mark_notification_read` / `mark_all_notifications_read`); the own-row RLS UPDATE policy (`USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`) **remains as belt-and-braces** (PostgreSQL has no column-scoped policies — `FOR UPDATE OF` is a SELECT row-lock clause, not a policy); `title`, `body`, `type`, `dedup_key`, `entity_type`, `entity_id` are **immutable** (pgTAP asserts no UPDATE privilege, table- or column-level, for `anon`/`authenticated` — architecture-gate binding B2/MED-3). INSERT: RPC/system-only.

**audit_logs** — SELECT: `is_admin()` ONLY. INSERT: trigger/system-only (no user policy). UPDATE/DELETE: none.

**app_settings** — SELECT: `is_admin() OR is_mr_walid()` (frontend staff reads WhatsApp number via this; the public landing page uses `get_public_settings()` instead — anon-safe, no direct access to app_settings). UPDATE/INSERT: `is_admin() OR (is_mr_walid() AND key LIKE 'whatsapp%')`.

### 5.3 Access gate for protected content
```sql
can_access_lesson(p_lesson_id uuid) RETURNS boolean  -- SECURITY DEFINER, STABLE
-- returns true IFF (deterministic grade-binding rule, A33):
--   is_student()  (active, not deleted, role student)
--   AND lesson exists AND lesson.status = 'published' AND lesson.deleted_at IS NULL
--   AND its unit is 'published' AND unit.deleted_at IS NULL
--   AND unit.grade_id = (SELECT grade_id FROM profiles WHERE id = auth.uid())   -- CURRENT profile grade, evaluated live (H5)
--   AND the grade is active (grades.is_active = true)                            -- architecture-gate binding B8
--   AND EXISTS an active subscription for auth.uid() (status='active' AND expires_at > now())
--       -- any active subscription satisfies this clause; the subscription itself is NOT grade-bound (A33)
```
**Consequence of the live grade check (H5):** a staff grade change mid-subscription changes the student's accessible grade set **immediately** — the very next request re-evaluates against the new current grade. Historical subscriptions are unaffected; only the accessible content set changes.

Used by: lesson_videos/lesson_pdfs SELECT policies, `get-pdf-signed-url` Edge Function, `get-video-playback-url` Edge Function, `upsert_progress` guard, frontend subscription guard (informational only). **All Edge Functions additionally verify the caller profile is `status='active'` and `deleted_at IS NULL` (defense-in-depth, §5.4/§14).**

### 5.4 Disabled/deleted blocking (sign-in gate, A34)
- **Sign-in is blocked at the source:** `block_sign_in_for_inactive_accounts()` trigger on `auth.users`, `BEFORE UPDATE OF last_sign_in_at` (the column Supabase Auth touches on every sign-in), raises `account_inactive_or_deleted` when `profiles.deleted_at IS NOT NULL OR profiles.status <> 'active'`. Disabled/deleted accounts **cannot log in** and cannot obtain new sessions.
- **Session hardening:** `disable_student()` / `soft_delete_student()` additionally revoke the student's `auth.sessions` (service role) **where feasible per the Phase 1 spike (LOW-18)** so existing **refresh tokens die immediately**; fallback = sign-in gate + RLS + Edge Function active-profile checks (architecture-gate binding B10). Already-issued **access JWTs remain valid up to their expiry (~1h)** — that residual window is closed by RLS (`is_student()`) and the Edge Function active-profile checks (MED-9). Feasibility of `DELETE FROM auth.sessions` from Postgres is verified in a **Phase 1 spike** (LOW-18).
- **Defense-in-depth:** `is_student()` returns false when `status='disabled' OR deleted_at IS NOT NULL` → all protected RLS paths close instantly even if a stale session somehow persists. **All Edge Functions** also verify the caller profile is `status='active'` and `deleted_at IS NULL` alongside role checks (Section 14).
- Trash listing/restore: `list_trash()`, `restore_student()` (mr_walid/admin), audit-logged.

---

## 6. SUBSCRIPTION ARCHITECTURE

### 6.1 Pricing model
- Per grade, multiple plans: `(grade_id, duration_days)` unique; `base_price`, `platform_fee`, `total_price = base + fee` enforced by CHECK (A6).
- **Price snapshot at activation (MED-5):** every subscription copies `base_price`/`platform_fee`/`total_price` from the pricing plan at redemption/manual creation. Later plan edits never rewrite subscription history; the subscription rows are the authoritative price record (the FK to `pricing_plans` RESTRICT is a second line of defense, not the source of truth).

### 6.2 Activation
- Codes redeem against a plan. Redemption rules (business):
  1. Student active, not disabled, not deleted.
  2. Code exists, `status='available'`, not revoked.
  3. Student has no **active** subscription (`status='active' AND expires_at > now()`). Extension while active is **not** allowed (A5) — only mr_walid/admin can create a manual follow-on subscription.
  4. Student must have a grade, and plan must belong to that grade and be `is_active`.
- On success: `started_at = now()`, `expires_at = started_at + duration_days * interval '1 day'` (A4); **price snapshot copied from the pricing plan into the subscription row** (MED-5); code → `used` (used_at/used_by); `code_redemptions` row; subscription `active`; notification `subscription_activated`; audit `code.redeem`. If `expires_at - now() <= expiry_warning_days * interval '1 day'` already (very short plan), the `subscription_expiring` notification is emitted **in the same transaction** (M7). The same snapshot logic applies in `create_manual_subscription`.

### 6.3 Atomicity (the race requirement)
`redeem_subscription_code` (SECURITY DEFINER):
```sql
BEGIN;
  PERFORM pg_advisory_xact_lock(hashtext('wldn_redeem:' || lower(p_code)));  -- serializes per-code
  SELECT ... FROM subscription_codes WHERE code = p_code FOR UPDATE;         -- row lock (belt & braces)
  -- re-validate all rules (status still 'available', student still eligible) INSIDE the transaction
  UPDATE subscription_codes SET status='used', used_at=now(), used_by=auth.uid() WHERE id = ...;
  INSERT INTO subscriptions (student_id, pricing_plan_id, base_price, platform_fee, total_price, code_id, source, started_at, expires_at)
    SELECT p_student, plan.id, plan.base_price, plan.platform_fee, plan.total_price, p_code_id, 'code', now(), now() + plan.duration_days * interval '1 day'
    FROM pricing_plans plan WHERE plan.id = p_plan_id;   -- price snapshot copied here (MED-5)
  INSERT INTO code_redemptions (...);
  INSERT INTO notifications (...) ON CONFLICT (dedup_key) DO NOTHING;
  INSERT INTO audit_logs (...);
COMMIT;
```
Two simultaneous redemptions of the same code: exactly one commits the `UPDATE ... status='used'`; the second's re-validation sees `status='used'` and raises `raise exception 'code_already_used'`. `UNIQUE (code_id)` on `code_redemptions` is the final physical backstop.

### 6.4 Expiry handling
- **Live authority:** access always checks `expires_at > now()` at request time (no reliance on a job).
- **Scheduled `expire_subscriptions()` (daily):** flips `active → expired`, emits `subscription_expiring` (M7/A7) and `subscription_expired` notifications via `ON CONFLICT (dedup_key) DO NOTHING` (once-only), writes audit rows. Status flips are idempotent. **Single execution chain (MED-4 — one chain, three links):** ① managed schedule — scheduled Edge Function (`supabase functions schedule expire-subscriptions "0 3 * * *"`, service role); ② if unavailable — pg_cron job → `pg_net.http_post()` → internal Edge Function endpoint; ③ final fallback — external cron (GitHub Actions scheduled workflow) invoking the same internal job Edge Function. The DB function is always invoked over HTTP; it is **never** driven by SELECT-side triggers (impossible — R4).
- **No pause during disable (A9):** disable does not extend `expires_at`; expiry continues.
- **History:** subscriptions/code_redemptions are never deleted; expired rows remain visible to student (own) and staff.

### 6.5 Revocation/extension
- `revoke_subscription_code(p_code_id)`: available/used → `revoked` (audited). Revoking a used code does not cancel the created subscription (history preserved; documented rule).
- Extension: `create_manual_subscription(...)` (mr_walid/admin) — new `subscription` row with chosen start/plan; overlapping actives not automatically merged (documented; admin is expected to manage timing).

---

## 7. CONTENT ARCHITECTURE

### 7.1 Hierarchy & ordering
`grades → units → lessons → (lesson_videos, lesson_pdfs)`. Each level carries `sort_order`; UI reorder updates `sort_order` via SECURITY DEFINER RPCs. Display order: `sort_order ASC, created_at ASC`.

### 7.2 Statuses
- `draft` — invisible to students everywhere.
- `published` — visible to eligible students; sets `published_at`; triggers `notify_new_content()` which targets **active subscribers of the lesson's grade only** (students with an active subscription, profile `status='active'`, not deleted; dedup `new_content:{lesson_id}:{student_id}`) — M1. Non-subscribed or disabled students receive nothing.
- `hidden` — temporarily removed from student views without deletion (e.g. mistake), retains assets.

### 7.3 Soft delete / restore
- `deleted_at` on grades, units, lessons, videos, PDFs, students. Restore clears `deleted_at` (content) or resets `status='active'` for students (A10). All audited.
- **Grades follow the same soft-delete path (LOW-17):** `delete_grade(soft)` / `restore_grade` RPCs (SECURITY DEFINER + audit) set/clear `grades.deleted_at`; units/lessons under a soft-deleted grade remain intact and become unreachable to students (grade-level RLS + `can_access_lesson`). Hard-deleting a grade is never performed by the app.
- Deleting a published lesson with progress rows: progress is **preserved** (FK keeps row; `lesson_id` → lessons CASCADE only on hard delete, which the app never performs). Deleting an asset (video/PDF) removes it from `is_primary`; if it was primary, an alternate `is_primary` may be promoted or the lesson shows "asset missing" until replaced (handled state in UI).

### 7.4 Video replacement policy (deterministic, A11)
1. Mr. Walid uploads a new video via `create-video-upload-session` with `mode=replace` + `old_video_id`.
2. New video row created (`status=pending_upload`, `is_primary=false`). **Create-path rule (MED-10):** for `mode=create`, `is_primary=true` is set explicitly **only when the lesson has no other video yet** (it is the lesson's first video); otherwise it stays `false` until a webhook `ready` promotes it.
3. On webhook `ready`: `set_video_status()` promotes the new video (`is_primary=true, status=ready`) and demotes the old one (`status='replaced'`, `is_primary=false`) — explicit promotion logic lives in `set_video_status`, never in INSERT defaults.
4. **Progress reset (deterministic):** `UPDATE progress SET position_seconds=0, percent_completed=0, is_completed=false, video_id=new_id WHERE lesson_id = :lesson_id AND video_id = :old_video_id;` — single atomic statement, no ambiguity, audited (`video.replace`). Only rows pointing at the replaced video are touched (rows already pointing at the new version are untouched).

### 7.5 Content lifecycle audit
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
| `create-video-upload-session` | POST | JWT + `is_mr_walid() OR is_admin()` | Calls Bunny *create direct upload* (returns `uploadUrl`, `videoId`); inserts `lesson_videos` row (`pending_upload`); supports `mode=create/replace` and `action=cancel` (releases an abandoned session — 0017 wrapper, best-effort Bunny delete) (Section 7.4). |
| `bunny-video-webhook` | POST | **Public + token check** | Constant-time compare of `x-webhook-token` (or `?token=` URL) against `BUNNY_WEBHOOK_TOKEN`; parses payload (numeric `Status`); updates video status/duration/thumbnail via `set_video_status`; triggers replacement finalization (7.4); on `ready` (with fresh metadata fetch) → `notify_new_content` if lesson published. |
| `get-video-playback-url` | GET | JWT; **student role** (S7) + active/not-deleted profile, **or `is_mr_walid() OR is_admin()`** (architecture-gate binding B5) | Takes `lesson_id` only — the client **never passes a chosen `video_id`**. Student path: verifies `can_access_lesson()` (subscription validity **live**) + active/not-deleted. Staff path: `is_mr_walid() OR is_admin()` + active/not-deleted — content-visible check (lesson exists, not soft-deleted), **no subscription requirement** (QA preview). Both paths: the **server resolves the lesson's primary `ready` video**; generates an **IP-locked HS256 directory token URL (query form, TTL 20 min — S3)** for that video; returns URL + expiry. Other roles rejected explicitly. |
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
  3. Check `can_access_lesson(lesson_id)` — **subscription validity evaluated live at every request**.
  4. If OK → `createSignedUrl` (service role) with **short TTL** (10–15 min) for that PDF's `storage_path`, return URL + metadata.
- **Revocation on expiry:** because TTL is short and every URL issuance re-checks `expires_at > now()`, expired subscribers cannot obtain new URLs, and stale URLs die with the TTL (R10). Blocking immediate invalidation of already-issued URLs is inherent to Supabase signed URLs — documented limitation, mitigated by short TTL + client session expiry.
- Replacement: upload new PDF → promote `is_primary`, retire old (`deleted_at`); deletion same soft semantics; all audited.

---

## 10. NOTIFICATION ARCHITECTURE

### 10.1 Types & producers
| Type | Trigger | Producer | Dedup |
|---|---|---|---|
| `subscription_activated` | redemption / manual creation | `redeem_subscription_code`, `create_manual_subscription` | `sub_activated:{sub_id}` |
| `subscription_expiring` | `expires_at - now() <= expiry_warning_days * interval '1 day'` (M7) | same transaction as subscription creation when already ≤ threshold; otherwise scheduled `expire_subscriptions()` | `sub_expiring:{sub_id}` |
| `subscription_expired` | expiry | scheduled `expire_subscriptions()` | `sub_expired:{sub_id}` |
| `new_content` | lesson → published | publish trigger → `notify_new_content()` (active subscribers of the grade only — M1) | `new_content:{lesson_id}:{student_id}` |
| `system` | account disabled, restore, etc. | RPCs | app-supplied key |

### 10.2 Once-only 7-day warning
- Rule (exact comparison, M7): when `expires_at - now() <= (expiry_warning_days) * interval '1 day'` (threshold read from `app_settings`, default 7) and the subscription is still `active` → insert with `dedup_key = 'sub_expiring:{id}'`. Fired (a) **in the same transaction** as subscription creation if already ≤ threshold, or (b) by the scheduled `expire_subscriptions()` run otherwise. `UNIQUE(dedup_key)` + `ON CONFLICT DO NOTHING` guarantees it fires **exactly once per subscription**, even if the job runs repeatedly (A7).

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
   - `is_completed = progress.is_completed OR EXCLUDED.percent_completed >= 90` — **completion is irreversible** (A12) with the single deterministic exception of video replacement (§7.4) and strictly server-computed from percent ≥ 90; client can never set `is_completed` directly.
   - `video_id` = current primary id (set/repaired on the first successful write after a replacement).
5. `last_watched_at = now()`. Return the row.
- Debounce on client (e.g. 5s) to limit writes; server remains correct under bursts (idempotent upsert).
- **Documented residual:** a client mid-playback at the exact moment of replacement may submit one last write for the old video — the guard rejects it deterministically (M4); no inconsistent state is persisted. PDF-only lessons (no primary video) are exempt from the guard — writes are pinned to the lesson with `video_id = NULL` (binding B4).

### 11.2 Concurrency
Single upsert per (student, lesson) — no multi-row transactions needed; PostgreSQL row locks serialize concurrent writes; monotonic GREATEST keeps state consistent.

### 11.3 Aggregates (views/RPCs)
- Unit/grade percent = weighted average of lesson percents (equal weight per lesson, documented); completion counts from `is_completed`.
- `v_student_progress_summary`, `v_lesson_stats` feed student dashboard + mr_walid analytics (most-viewed lessons, students per grade).

### 11.4 Replacement policy
Deterministic reset per Section 7.4: only rows pinned to the replaced `video_id` are zeroed, in the same transaction as the primary flip.

---

## 12. AUDIT ARCHITECTURE

### 12.1 What is logged
| Action | Entity | Notes |
|---|---|---|
| `student.create/update/disable/enable/soft_delete/restore` | profiles | update_own_profile self-edits also logged (non-PII deltas) |
| `subscription.create(code/manual)/expire` | subscriptions | redemption logged with code id (no subscription-level `revoke` status — A29) |
| `code.generate/revoke/use` | subscription_codes | |
| `user.role_change` | profiles | actor + target user + old/new role (from `set_user_role`, admin-only) |
| `content.create/update/publish/hide/soft_delete/restore` | units/lessons/videos/pdfs | |
| `grade.create/update/soft_delete/restore` | grades | (LOW-16) |
| `video.upload/processing/ready/failed/replace` | lesson_videos | |
| `pdf.upload/finalize/replace/delete` | lesson_pdfs | |
| `settings.change` | app_settings | |
| `auth.*` (register, login, password change) | — | via trigger on auth events if feasible; otherwise best-effort from RPCs |

### 12.2 Capture
- **Trigger-based** `audit_trigger()` attached to the **fixed table inventory (MED-8):** `profiles`, `grades`, `units`, `lessons`, `lesson_videos`, `lesson_pdfs`, `pricing_plans`, `subscriptions`, `subscription_codes`, `app_settings`. **`progress` and `notifications` are explicitly excluded** (high-volume student data; the trigger would be pure overhead and noise). Filling: `actor_id=auth.uid()`, `actor_role=get_current_role()`, `action = table.action` (mapped), `entity_type`, `entity_id=NEW/OLD.id`, `metadata=to_jsonb(NEW)` (deltas for UPDATE), `ip_address` (**best-effort** from `request.jwt.claims`, **may be NULL** — L3), `created_at=now()`.
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
    student/      (dashboard, curriculum, lesson player, pdf viewer, notifications, subscription history, profile)
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
| `/register` | public | full form (name, phone, guardian, address) — **no grade field** (grade is staff-assigned, A1/HIGH-1) |
| `/student/dashboard` | student + subscription info (content locked if expired) | current subscription, remaining time, expiry, progress summary, notifications |
| `/student/curriculum` | student, content gated | grades→units tree; locked lessons show lock state |
| `/student/lessons/:lessonId` | student, `can_access_lesson` enforced | video player + PDF viewer + progress save |
| `/student/subscriptions` | student | own history |
| `/student/notifications` | student | read/unread |
| `/student/profile` | student | view info, change password (no email edit UI) |
| `/walid/dashboard` | mr_walid/admin | stats: students/grade, most-viewed lessons, content state |
| `/walid/students` | mr_walid/admin | list, search, disable/enable, soft delete |
| `/walid/students/:id` | mr_walid/admin | profile, subscription, progress analytics |
| `/walid/students/trash` | mr_walid/admin | restore (soft-delete list) |
| `/walid/grades` | mr_walid/admin | CRUD + ordering |
| `/walid/pricing` | admin (mr_walid read-only) | plans per grade (duration, base, fee, total) |
| `/walid/codes` | mr_walid/admin | generate (Edge Function), revoke, list usage |
| `/walid/curriculum` | mr_walid/admin | grades→units→lessons management, statuses, reorder |
| `/walid/lessons/:lessonId` | mr_walid/admin | assets: upload video (session), upload PDF, replace, statuses |
| `/walid/analytics` | mr_walid/admin | progress/viewing analytics |
| `/walid/settings` | mr_walid/admin | WhatsApp config (mr_walid) |
| `/admin/dashboard` | admin | operational metrics (`v_dashboard_metrics`) |
| `/admin/audit` | admin | filterable audit log + CSV export |
| `/admin/settings` | admin | pricing/platform fee, subscription config, app settings |
| `/admin/roles` | admin | role management: list users + `set_user_role(user_id, role)` (admin-only, SECURITY DEFINER, audited) |
| `*` | authed | 404 |

Admin can also reach all `/walid/*` routes (permission check allows `admin`).

### 13.3 Guards & data access
- **AuthGuard:** subscribes to `onAuthStateChange`; redirects unauthenticated to `/login`.
- **RoleGuard:** maps `profiles.role` (fetched once, cached in context) → allowed path prefixes.
- **SubscriptionGuard (student):** shows lock screen if `get_my_current_subscription()` empty/expired — **informational only**; RLS + Edge Functions remain authoritative.
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
| 1 | `create-video-upload-session` | JWT; then `is_mr_walid() OR is_admin()` | `mode=create`: Bunny create upload → insert `lesson_videos` (pending_upload) via `create_video_upload_record()` (SECURITY DEFINER wrapper). `mode=replace`: creates replacement row + keeps `old_video_id` for finalize (7.4). `action=cancel`: releases an abandoned session via `delete_video_upload_record()` (0017, pending-only, hard delete + audit) then best-effort Bunny delete of the orphan object. Returns TUS upload session (`upload_url`, `tus_headers` incl. `AuthorizationSignature`/`AuthorizationExpire` + `metadata`) to browser — safe (upload URL is scoped). |
| 2 | `bunny-video-webhook` | **public** + shared webhook token (constant-time compare of `x-webhook-token`, `?token=` URL; no Bunny-side signature capability, R17) | Parse payload (numeric `Status`); map events → `set_video_status()` transition chains (uploading→processing→ready/failed); on ready fetch fresh metadata from Bunny API (duration, thumbnail) before the final transition; finalize replacement (primary flip + progress reset, 7.4); `notify_new_content` if published (failure not fatal). Rejects unauthenticated requests. |
| 3 | `get-video-playback-url` | GET/HEAD; JWT; **student role** (S7) + active/not-deleted profile, **or `is_mr_walid() OR is_admin()`** (binding B5) | Takes `lesson_id`; the **server resolves the primary `ready` video** (client never passes `video_id`). Student path: `can_access_lesson()` (live subscription check, replicated via RLS-scoped queries — no widening of RPC grants). Staff path: content-visible check (lesson exists, not soft-deleted), **no subscription requirement** — QA preview. Both: Bunny **tokenized signed URL** (IP-locked HS256 directory token over `/{videoId}/`, query form, TTL 20 min — S3). Never returns raw Bunny video URLs to unauthorized users; other roles rejected explicitly. |
| 3b | `get-video-thumbnail-url` | GET/HEAD; JWT; same gates as row 3 | Returns a short-lived IP-locked signed `thumbnail.jpg` URL (same directory token as the HLS chain). The raw `thumbnail_url` column is never sent to clients — all thumbnails render through this EF. |
| 4 | `get-pdf-signed-url` | JWT; **student role only** (S7) + active/not-deleted profile | Accepts `lesson_id` only; **server resolves the primary `ready` PDF** (rejects non-primary requests — MED-7); `can_access_lesson()` → Supabase service-role `createSignedUrl` (TTL 10–15 min) on `pdfs` bucket; returns URL + metadata. Subscription checked at request time (Section 9); non-students rejected. |
| 5 | `upload-pdf` | JWT; `is_mr_walid() OR is_admin()` | Validates MIME/size → service-role **signed upload URL via `createSignedUploadUrl` (I4)** on `pdfs` bucket → caller uploads bytes; `finalize_pdf_upload` RPC marks `is_ready`, audits. |
| 6 | `generate-subscription-codes` | JWT; `is_admin() OR is_mr_walid()` | Validate plan (active, exists) + count cap (e.g. ≤500, A-flagged) → `generate_codes_internal()` (pgcrypto `gen_random_bytes`, unambiguous charset, stored uppercase — A22) → returns codes to caller (only party that sees them). |
| 7 | `export-audit-log` | JWT; `is_admin()` | Filters (date range, action, entity, actor) → CSV (UTF-8 BOM for Excel/Arabic) → `audit-exports` bucket → short-lived signed URL. |
| 8 | `expire-subscriptions` | **scheduled internal job function — not a request function** (no JWT route; invoked by the scheduling chain, MED-4) | Invokes the DB function `expire_subscriptions()` over HTTP with the service-role client (flips expired, emits once-only notifications, audits). Entry point for links ①②③ of the unified chain. |
| 9 | `recheck-video-states` | **scheduled internal job function — not a request function** (no JWT route; invoked by the scheduling chain, MED-4) | Selects stuck pre-ready videos (`pending_upload/uploading/processing`, older than threshold, not deleted) → live Bunny API status per video → `set_video_status()` chains (missing → `failed`; dead statuses → `failed`; finished → `ready` with metadata); transient API errors skipped for the next run; hourly. Entry point for the same chain. |

**Inventory note (aligns with ARCHITECTURE.md §8.4):** functions 1–7 plus 3b `get-video-thumbnail-url` (added at the Phase 5 review round 2 alongside the signed-thumbnail fix) are the 8 request functions; 8 and 9 are the two **scheduled job functions** (scheduled Edge Functions preferred → pg_cron→pg_net→external cron), total **10 functions (8 request + 2 scheduled)**. `export-audit-log` (row 7) was implemented at Phase 8.

**Secret handling:** all secrets via `supabase secrets set` / CI; read from `Deno.env`. Never in `VITE_*`. Service role only inside functions. JWT verification: default `verify_jwt` for 1, 3, 3b, 4, 5, 6, 7; function 2 uses the `BUNNY_WEBHOOK_TOKEN` token check; functions 8–9 are internal endpoints (service-role client + `x-internal-token`/`INTERNAL_JOB_TOKEN`, not exposed as JWT routes).

---

## 15. PHASE DEPENDENCIES & EXECUTION PLAN

Dependency chain: **1 → 2 → 3 → 4 → 5 → 6 → (7 ‖ 8) → 9 → 10 → 11** (8 depends on 3 for subscription events and 4/5 for content events; 7 depends on 2–5).

| Phase | Deliverables | Acceptance criteria | Test strategy |
|---|---|---|---|
| **0 Discovery/Architecture** | ARCHITECTURE.md, DATABASE.md, SECURITY.md, TESTING.md, route map, role matrix, entity map, risk list (extracted from this blueprint) | Internally consistent; no open contradictions; assumptions recorded | Review checklist (PLAN §0) |
| **1 Supabase Foundation** | migrations (all tables/enums/RLS/views/RPCs/triggers incl. **sign-in gate** + `set_updated_at`), extensions (`pgcrypto`, `pg_cron`, `pg_net`), `supabase-full-schema.sql`, seed (admin/mr_walid, app_settings), storage buckets + storage RLS (no anon policies); **spike: feasibility of `DELETE FROM auth.sessions` from Postgres (LOW-18)** | `supabase db reset` applies cleanly; no missing FKs; no policy contradictions; roles cannot escalate (tests); core auth flow works; sign-in gate trigger present and version-pinned; session-deletion spike result recorded | pgTAP: schema integrity, constraint checks; RLS role-simulation tests |
| **2 Auth & Account Lifecycle** | register/login/logout/session, profile creation, password change, disable/enable, soft delete, trash, restore (RPCs + UI); login error mapping for `account_inactive_or_deleted` (I6) | Every lifecycle transition works against real Supabase; **disabled/deleted accounts cannot log in nor access protected data** (sign-in gate + session revocation + RLS); login shows friendly Arabic copy for inactive accounts | pgTAP RLS matrix + **sign-in gate test** (register → disable → login fails → enable → login succeeds); Vitest guard tests; Playwright lifecycle flow |
| **3 Grades, Pricing & Subscriptions** | grades CRUD, pricing plans, codes (generation EF + RPC), atomic redemption, expiry job, history UI | Full activation lifecycle; **double-redemption impossible** (concurrency test); expiry blocks access | pgTAP rules tests; **race harness** (Section 16, Race-Condition Harness row; see TESTING.md §8); Vitest UI |
| **4 Curriculum & Content Mgmt** | units/lessons CRUD, ordering, statuses, soft delete/restore, PDF metadata/upload, content audit | Publishing hides drafts from students; restore works; audit rows exist | pgTAP; RLS tests; Playwright walid flow |
| **5 Bunny Video** | create-video-upload-session (create/replace/cancel), webhook (shared token — `?token=`/`x-webhook-token`, constant-time compare, R17; no Bunny-side signature capability), status machine, signed playback (IP-locked HS256 directory token, query form, TTL **20 min**), signed thumbnails, replacement, cancel/abandon release, failure handling (scheduled recheck) | End-to-end: session → upload → webhook → ready → signed playback (real Bunny); replacement resets progress deterministically; failures recover; **forged webhooks rejected** | Deno tests (mocked webhook/token + **webhook forgery rejection test**); integration with staging Bunny; state-machine unit tests |
| **6 Student Learning Experience** | curriculum browsing, lesson page, player, PDF viewer, progress RPC, resume, completion, notifications view | Progress persists/resumes; 90% deterministic completion; expired → content locked | Vitest RPC wrapper tests; Playwright student flow with seeded data |
| **7 Dashboards** | staff dashboard (students, active/expiring subscriptions + revenue, content readiness, codes, engagement, students-by-grade, recent subscriptions, upcoming expirations via one `get_dashboard_stats` RPC — 0018), StaffNav across all walid pages, student dashboard unread badge + curriculum/notifications links | Real data rendered; no mock; responsive | Vitest UI; DB harness 06_dashboard_stats.sql |
| **8 Notifications & Audit** | notification engine, 7-day warning once, expiry events, read/unread, audit UI, filters, export EF; `set_user_role` + `/admin/roles` role-management UI | 7-day fires exactly once per subscription; audit export CSV correct with Arabic/BOM; **`set_user_role` works and escalates only via admin** (role-escalation tests); **webhook forgery rejection test passes** | pgTAP dedup test + role-escalation tests; EF integration test; Playwright |
| **9 Security Hardening** | RLS review, IDOR tests, secret scan, storage access tests, subscription bypass tests, role escalation tests, race test | All hardening checks pass; findings fixed or documented | Dedicated security test suite (SQL + E2E attempts) |
| **10 QA/Verification** | Full test suites (DB, auth, RLS, integration, business rules, UI, responsive, regression) | All green; no known blockers | CI runs everything || **11 Production Readiness** | build, env verification, migrations, deployment (frontend + EFs + secrets), storage, Bunny, security, error handling, monitoring (Supabase logs + uptime), README, final PLAN.md answers (§19 of PLAN); **regression controls (R-A/R-C/R-F):** DB triggers version-pinned (digest recorded + unit-tested in CI), **`supabase db reset` never runs against production** (only `db push` / `db migrations up`), migration rollback/snapshot strategy documented (reversible migrations or verified snapshot; production schema snapshot taken before each release) | All PLAN §19 verification questions answered YES | Final smoke + manual verification script |

**Per-phase operating loop (PLAN §17):** plan → implement → validate → test → fix → re-test → update PLAN.md → next phase.

---

## 16. TESTING STRATEGY

| Layer | Tool | Approach |
|---|---|---|
| DB schema/constraints | pgTAP (`supabase test db`) | Table/enum/column/constraint presence; FK integrity; CHECK rules (total=base+fee); unique codes; partial unique primary video |
| RLS | pgTAP role simulation | `SET ROLE` + `auth.uid()`-style injection (via `supabase test` helper or custom `set_auth` wrapper) asserting allowed/denied per policy row for student/mr_walid/admin; disabled & deleted student matrix; **notification immutability (MED-3 + binding B2):** direct UPDATE revoked from `authenticated` (mark-read RPC-only; no table- or column-level UPDATE privilege — PostgreSQL has no column-scoped policies, `FOR UPDATE OF` is a SELECT row-lock clause); own-row RLS UPDATE policy retained as belt-and-braces; **direct UPDATE of any kind must fail**; **signup cannot self-assign grade (HIGH-1):** signUp with `options.data.grade_id` yields `grade_id NULL` |
| Business rules | pgTAP + RPC-level tests | Redemption validations; expiry job idempotency; 90% completion determinism; once-only 7-day; replacement reset; monotonic percent; **grade-change-mid-subscription case (A33/H5):** student with an active subscription has grade changed by staff → the accessible grade set changes immediately (RLS re-evaluates) and stale-grade lesson access is denied while new-grade lessons open |
| Edge Functions | Deno `deno test` + integration | Unit: webhook token verification, JWT handling, signed-URL generation, CSV build. Integration: `supabase functions serve` against local/CI Supabase + stubbed Bunny HTTP; webhook happy/error paths; **webhook forgery rejection** — unsigned/forged payloads with wrong or missing secret must be rejected (401/403) |
| **Sign-in gate** | pgTAP + Playwright | Register → admin disables → login fails (Arabic `account_inactive_or_deleted` copy) → enable → login succeeds; same for soft-deleted → restore |
| **Code redemption race** | Concurrent harness (JS/PowerShell script or Playwright API calls) | Fire 10–50 simultaneous redemptions of one code against real backend; assert **exactly one success**, all others rejected with `code_already_used`; repeat N times |
| Frontend unit/component | Vitest + RTL | Guards, form validation, state components, RPC wrapper mocks |
| E2E | Playwright (Chrome mobile+desktop viewports) | Registration→login→redeem→watch→progress→expiry lock; walid CRUD; admin audit export; RTL assertions; sign-in gate flow (see dedicated row above) |
| CI | GitHub Actions | Lint → typecheck → db test → vitest → build → deploy EFs → (scheduled) smoke |

Test data: seeded via migrations (fixture grade, plans, codes) — never mock backend calls in E2E for business flows.

---

## 17. SECURITY STRATEGY

1. **Secrets:** service-role key, Bunny API key, signing key, webhook secret live only in Edge Function env / CI; `VITE_*` carries only URL + anon publishable key. `.env.example` documents names without values. Secret scan in CI.
2. **JWT:** all client→DB traffic uses anon key + user JWT; RLS evaluates per-row; Edge Functions verify via `supabase.auth.getUser()`; `bunny-video-webhook` authenticates via a shared token (`?token=` URL or `x-webhook-token` header, constant-time compare — Bunny signature headers are not available, R17).
3. **RLS:** mandatory on all 14 tables + force RLS; SECURITY DEFINER functions have `SET search_path` and explicit grants (`REVOKE ALL ... GRANT EXECUTE TO authenticated`); no direct DML policies on money-critical tables. All SECURITY DEFINER functions (incl. trigger functions) MUST be owned by `postgres` (superuser) or a BYPASSRLS role — enforced by a pgTAP ownership test (binding B1).
4. **Storage:** private buckets; no public policies; signed URLs with short TTLs; upload URLs role-gated.
5. **IDOR:** RLS-scoped SELECTs (`id = auth.uid()`), UUID PKs, and entity ownership checks in every RPC; Edge Functions re-derive access from DB (never trust client IDs blindly — `can_access_lesson` is the single gate).
6. **Rate limiting:** Supabase Auth built-in limits (register/login); redemption serialized by advisory lock; Edge Functions add simple per-user caps (e.g. signed-URL issuance) via DB counters or Supabase platform limits (documented).
7. **Client-side trust:** never for authz — localStorage only for session persistence; all locks enforced server-side.
8. **Email immutability:** trigger blocks `auth.users` email UPDATE (A13).
9. **Escalation prevention:** role column writeable only via admin SECURITY DEFINER path; RLS WITH CHECK guards.
10. **Disposal:** soft-delete everywhere; hard delete only via direct SQL (documented, never UI). **WARNING (LOW-11):** direct SQL hard deletes **CASCADE away dependent history** — deleting a `profiles` row destroys its `subscriptions`, `code_redemptions`, `notifications`; deleting a `grades` row cascades into `units` → `lessons` → `lesson_videos`/`lesson_pdfs`/`progress`. History is permanently lost. The runbook mandates **soft delete first**; hard delete only after an explicit data-archival decision.
11. **Sign-in gate (A34):** `block_sign_in_for_inactive_accounts()` trigger blocks disabled/deleted accounts at `auth.users`; disable/soft-delete revoke `auth.sessions` (service role); RLS + Edge Function profile checks are defense-in-depth.
12. **Trigger hygiene (R-A):** all `auth.users` triggers (`block_email_change`, `block_sign_in_for_inactive_accounts`, `handle_new_user`) are version-pinned (digest recorded) and unit-tested in CI so silent Supabase changes can't break or weaken them.
13. **Account-status enumeration tradeoff (LOW-13):** the `account_inactive_or_deleted` sign-in error reveals that an account exists but is inactive (vs. generic "invalid credentials" for unknown emails). **Accepted tradeoff** — the error is required for a clear Arabic user message (I6) and the accounts are UUID-keyed/unguessable; documented in SECURITY.md, not treated as a defect.
14. **RPC grant hygiene (MED-6) — explicit matrix.** All SECURITY DEFINER functions are created with `SET search_path = public`. Default posture: `REVOKE EXECUTE ON FUNCTION ... FROM anon, authenticated` for **all internal functions**: `generate_codes_internal`, `set_video_status` (internal; no public variant exists — see §8.2 naming note), `set_video_status_ef` (if ever introduced, same treatment), `expire_subscriptions`, `recheck_video_states`, `notify_new_content`, `audit_log`, `handle_new_user`, `block_email_change`, `block_sign_in_for_inactive_accounts`, `set_updated_at`, `is_student`, `is_mr_walid`, `is_admin`, `get_current_role`, `can_access_lesson` (used inside RLS/EFs, not callable by clients).
    **Client-callable allowlist** (GRANT EXECUTE TO authenticated, plus `anon` only for `get_public_settings`):
    `update_own_profile`, `update_student_profile` (binding B3), `redeem_subscription_code`, `get_my_subscriptions`, `get_my_current_subscription`, `upsert_progress`, `mark_notification_read`, `mark_all_notifications_read`, `set_student_grade`, `disable_student`, `enable_student`, `soft_delete_student`, `restore_student`, `list_trash`, `create_manual_subscription`, `revoke_subscription_code`, `create_unit`, `update_unit`, `delete_unit`, `restore_unit`, `create_lesson`, `update_lesson`, `publish_lesson`, `hide_lesson`, `soft_delete_lesson`, `restore_lesson`, `delete_grade`, `restore_grade`, `set_app_setting`, `set_pricing_plan`, `delete_pricing_plan`, `set_user_role`, `finalize_pdf_upload`, `get_public_settings`.
    Everything else is REVOKEd; the allowlist is enforced by a pgTAP grant test.

---

## 18. RISK LIST & MITIGATIONS

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Bunny webhook missed/lost → video stuck in processing | Content unavailable | Webhook token check + hourly `recheck_video_states()` reconciliation job; manual retry UI |
| R2 | Redemption race under load | Double redemption | Advisory lock + FOR UPDATE + UNIQUE(code_id) backstop; race tests |
| R3 | No forgot-password (MVP) → lockouts | Support load | Documented admin/SQL recovery path (A13/A14); password change only for logged-in users |
| R4 | Managed scheduler / `pg_cron` / `pg_net` unavailability | Expiry/notification/video-recheck jobs fail | **One unified execution chain (MED-4):** ① `supabase functions schedule` (managed scheduler) → ② pg_cron → `pg_net.http_post()` → internal Edge Function → ③ external cron (GitHub Actions scheduled workflow) invoking the same internal job Edge Function. **No SELECT-side trigger fallback (impossible).** Verify each link's availability in Phase 1 (A19) |
| R5 | Subscription time continues during disable → student complaints | Support/UX | Rule per PLAN (explicit); communicated in disable confirmation UI |
| R6 | RLS subquery performance (per-row role checks on hot tables) | Slow progress/notifications | STABLE SECURITY DEFINER helpers, targeted indexes, connection pooling; measure in Phase 9/10 |
| R7 | "≈7 days" warning nondeterminism | Duplicate/spam notifications | Fixed deterministic rule (`<= expiry_warning_days`) + UNIQUE dedup key |
| R8 | Secret leakage into frontend | Full compromise | CI secret scan; code review rule; no `VITE_*` for secrets; Edge Functions only |
| R9 | Video URL sharing beyond expiry | Revenue leakage | Signed URL TTL **20 min** (S3) + live `can_access_lesson` at issuance; documented residual risk |
| R10 | PDF URL validity after expiry | Revenue leakage | Short TTL (10–15 min) + live check per issuance; documented residual risk |
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

1. **A1 — Grade is staff-assigned only (rewritten per review):** the registration form **never collects grade** (§4.2/§13.2), and `handle_new_user()` **ignores any student-supplied `grade_id`** from `raw_user_meta_data` (grade_id forced NULL; HIGH-1). Grade is set exclusively by `set_student_grade` (mr_walid/admin) before subscription redemption; redemption requires a grade. pgTAP asserts signup cannot self-assign a grade.
2. **A2 — Primary assets:** a lesson may hold multiple videos/PDFs but only one **primary** of each is exposed to students (partial-unique index). Student-facing SELECT policies **and** signed-URL Edge Functions (video + PDF) resolve the primary asset server-side only; non-primary assets are never reachable by students (MED-7); replacement promotes a new primary.
3. **A3 — Phone uniqueness:** student phone is UNIQUE (lookup/contact aid); guardian phone may be shared by multiple students.
4. **A4 — Subscription timing:** `started_at = redemption time`, `expires_at = started_at + duration_days` (exact days, no time-of-day rules).
5. **A5 — No extension while active:** a student with an active subscription cannot redeem another code; extension only via manual subscription created by mr_walid/admin (overlap management is manual).
6. **A6 — Total price:** `total_price = base_price + platform_fee`, enforced by CHECK; all three stored.
7. **A7 — 7-day warning rule:** deterministic `remaining_days <= app_settings.expiry_warning_days` (default 7), fired once per subscription via `UNIQUE(dedup_key)`.
8. **A8 — Expiry authority:** access validity always computed live (`expires_at > now()`); the scheduled job only updates status labels/notifications; a brief window where label ≠ live check is acceptable and harmless.
9. **A9 — Disable continues subscription:** disable never pauses or extends subscription time (per PLAN).
10. **A10 — Restore semantics:** restore sets `status='active'`, `deleted_at=NULL`; access then governed solely by subscription validity.
11. **A11 — Video replacement policy:** on replacement, progress rows pinned to the replaced video are reset (position=0, percent=0, is_completed=false) atomically with the primary flip; rows referencing the new video are untouched.
12. **A12 — Completion irreversibility:** once `percent_completed >= 90`, `is_completed` stays true forever (no un-complete flow); percent is monotonic (GREATEST). **Single deterministic exception:** video replacement (A11/§7.4) resets the affected progress rows atomically to a zero state (position=0, percent=0, is_completed=false).
13. **A13 — Email immutability:** email change blocked for all roles in the app UI *and* by DB trigger on `auth.users`; exceptional fixes only via direct SQL/Supabase dashboard (documented runbook). No OTP, no forgot-password in MVP.
14. **A14 — MVP auth scope:** registration immediate (no OTP/email confirmation toggled on); forgot-password intentionally absent (future phase per PLAN).
15. **A15 — Roles:** exactly three fixed roles; no granular permission tables (PLAN allows this).
16. **A16 — Audit writes:** trigger-based for table DML + explicit calls in SECURITY DEFINER RPCs; audit table insert-only, admin-select-only.
17. **A17 — Egyptian phone format:** `^(\+20|0)1[0-9]{9}$` validated client- and server-side for both phone fields.
18. **A18 — Bunny setup:** a single Bunny video library + pull zone with token auth enabled; signing key + hostname provisioned as secrets before Phase 5.
19. **A19 — Job scheduling chain (rewritten per review, MED-4):** jobs (`expire_subscriptions`, `recheck_video_states`) run via one unified chain — ① `supabase functions schedule` (preferred) → ② pg_cron → pg_net → internal Edge Function → ③ external cron (GitHub Actions scheduled workflow). Link availability verified in Phase 1; never SELECT-side triggers (R4).
20. **A20 — Hosting:** frontend on Netlify/Vercel/Cloudflare Pages; Edge Functions on Supabase Edge Runtime; CI on GitHub Actions.
21. **A21 — Seed users:** one `admin` and one `mr_walid` seeded via migration with password from CI secret; rotate-on-first-login recommended.
22. **A22 — Code format:** `WLDN-XXXX-XXXX-XXXX` from the **unambiguous charset** `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O, 1/I), stored uppercase and CHECK-constrained (`code = upper(code)` + regex, L1), generated with `pgcrypto gen_random_bytes`; all lookups normalize to uppercase.
23. **A23 — Audit export:** CSV generated server-side, stored in private `audit-exports` bucket, returned via 10-minute signed URL; UTF-8 with BOM for Excel/Arabic.
24. **A24 — Progress trust:** client sends position/percent; server clamps and derives completion; client cannot force completion below 90%.
25. **A25 — Bunny metadata:** duration + thumbnail pulled from Bunny API/webhook after processing and stored on `lesson_videos`.
26. **A26 — Multi-device:** concurrent playback allowed; resume = last write wins; percent monotonic.
27. **A27 — WhatsApp scope:** `mr_walid` may edit `whatsapp%` settings; `admin` may edit all app settings; WhatsApp number displayed on landing + student contact button.
28. **A28 — Notification dedup keys:** system-generated deterministic keys (Section 3.4); `ON CONFLICT (dedup_key) DO NOTHING` enforces uniqueness of unique events.
29. **A29 — Revoked-code rule:** revoking a used code does not cancel the subscription it created (history preserved); revocation is for administrative/corrective use.
30. **A30 — Analytics definition:** unit/grade progress = unweighted mean of lesson percentages; "most-viewed" = sum of `last_watched_at` touches (progress writes) per lesson.
31. **A31 — No hard deletes in UI:** all deletes are soft; hard delete only via direct SQL with documented runbook.
32. **A32 — Login blocked for inactive accounts (rewritten per architecture review):** deleted AND disabled accounts are **blocked at sign-in** by `block_sign_in_for_inactive_accounts()` on `auth.users` (BEFORE UPDATE OF `last_sign_in_at`; raises `account_inactive_or_deleted` when `profiles.deleted_at IS NOT NULL OR status <> 'active'`); RLS (`is_student()`) remains defense-in-depth; ALL Edge Functions add an active/not-deleted profile check alongside role checks; `disable_student`/`soft_delete_student` optionally revoke `auth.sessions` (service role). The previous "disabled accounts may still log in" claim is **removed**.
33. **A33 — Subscription↔grade binding (H5):** `can_access_lesson()` requires the student's **current** profile grade to equal the lesson's grade AND **any** active subscription (subscriptions are not themselves grade-bound). Accepted consequence: a staff grade change mid-subscription changes the accessible grade set **immediately** on the next request; pgTAP covers the case.
34. **A34 — Sign-in gate trigger:** `block_sign_in_for_inactive_accounts()` is the authoritative sign-in gate (see A32); it is version-pinned and unit-tested (R-A), and `disable_student`/`soft_delete_student` revoke `auth.sessions` (service role) — refresh tokens die immediately; already-issued access JWTs remain valid ≤1h and are closed by RLS + EF profile checks (MED-9). Feasibility of `DELETE FROM auth.sessions` from Postgres is spiked in Phase 1 (LOW-18).
