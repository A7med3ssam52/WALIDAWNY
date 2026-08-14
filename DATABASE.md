# منصة مستر وليد عونى التعليمية — Database Reference

**Phase 0 deliverable.** Extracted from BLUEPRINT.md §3 (database architecture), §4 (auth), §5 (RLS), §6 (subscriptions), §12 (audit). Binding architecture-gate requirements are flagged **[BINDING]** and are authoritative over blueprint wording where they refine it.

All schema lives in `supabase/migrations/*.sql` (ordered) + consolidated `supabase/supabase-full-schema.sql`. SQL statements below are reference definitions for implementation; the migration files are produced in Phase 1.

---

## 1. Design Principles (BP §3.1)

- UUID PKs; `timestamptz`; explicit FKs with declared `ON DELETE` behavior; unique + check constraints; targeted indexes.
- Enums **only** where the domain value set is stable (roles, statuses).
- No duplicated data; history preserved (subscriptions, redemptions) — never overwritten.
- Soft-delete via `deleted_at timestamptz NULL` on business entities; hard deletes never performed in normal application flows.
- Migrations idempotent where practical (`CREATE OR REPLACE`, `DO $$ ... IF NOT EXISTS`).
- Extensions: `pgcrypto` (code generation), `pg_cron` (scheduling fallback), `pg_net` (pg_cron→internal HTTP).
- Storage inventory included in migrations (buckets `pdfs`, `audit-exports`; storage RLS; **no anonymous policies**).
- `updated_at` maintenance via a single `set_updated_at()` BEFORE UPDATE trigger on every table with an `updated_at` column.
- **[BINDING B1]** Every SECURITY DEFINER function (including trigger functions) MUST be owned by `postgres` (superuser) or a BYPASSRLS role. A pgTAP ownership test asserts this.

---

## 2. Extensions

| Extension | Purpose |
|---|---|
| `pgcrypto` | Secure code generation (`gen_random_bytes`) |
| `pg_cron` | Scheduled job fallback link (execution chain MED-4) |
| `pg_net` | pg_cron → internal HTTP calls to job Edge Functions |

---

## 3. Enums (BP §3.2)

```sql
CREATE TYPE public.user_role         AS ENUM ('student','mr_walid','admin');
CREATE TYPE public.account_status    AS ENUM ('active','disabled');
CREATE TYPE public.subscription_status AS ENUM ('active','expired');  -- 'revoked' removed: revocation applies to codes only (A29)
CREATE TYPE public.code_status       AS ENUM ('available','used','revoked');
CREATE TYPE public.content_status    AS ENUM ('draft','published','hidden');
CREATE TYPE public.video_status      AS ENUM ('pending_upload','uploading','processing','ready','failed','replaced');
CREATE TYPE public.notification_type AS ENUM ('subscription_activated','subscription_expiring','subscription_expired','new_content','system');
```

---

## 4. Tables (14 application tables)

### 4.1 `profiles` — one row per `auth.users` (role: student default)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, FK → `auth.users(id)` ON DELETE CASCADE |
| `full_name` | text | NOT NULL |
| `phone` | text | NOT NULL, UNIQUE, CHECK Egyptian format `^(\+20|0)1[0-9]{9}$` (A17) |
| `guardian_phone` | text | NOT NULL, CHECK Egyptian format (may repeat across students, A3) |
| `address` | text | NOT NULL |
| `grade_id` | uuid | NULL, FK → `grades(id)` ON DELETE SET NULL (A1) |
| `role` | user_role | NOT NULL DEFAULT 'student' |
| `status` | account_status | NOT NULL DEFAULT 'active' |
| `deleted_at` | timestamptz | NULL (soft-delete/Trash) |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |

- Indexes: `idx_profiles_grade (grade_id)`, `idx_profiles_role (role)`, partial `idx_profiles_trash (id) WHERE deleted_at IS NOT NULL`.
- Triggers: `handle_new_user()` (auth.users INSERT), `block_email_change()` (auth.users BEFORE UPDATE), `block_sign_in_for_inactive_accounts()` (auth.users BEFORE UPDATE OF `last_sign_in_at`), `set_updated_at()` (BEFORE UPDATE), `audit_trigger()` (insert-only inventory — §7).

### 4.2 `grades`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | NOT NULL, UNIQUE |
| `sort_order` | int | NOT NULL DEFAULT 0 |
| `is_active` | boolean | NOT NULL DEFAULT true |
| `deleted_at` | timestamptz | NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |

- **[BINDING B8]** Deactivation (`is_active = false`) is documented as the soft-delete equivalent: students lose access immediately; the SELECT policy includes `AND is_active`; `can_access_lesson()` includes `AND g.is_active`; `delete_grade` (soft) sets `deleted_at` with identical access effect; both paths audited.

### 4.3 `pricing_plans` — duration-based offers per grade

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

- UNIQUE `(grade_id, duration_days)`; index on `(grade_id)`.

### 4.4 `subscriptions` — immutable-ish history; status changes only by job

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `student_id` | uuid | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE (profiles only soft-deleted → history preserved) |
| `pricing_plan_id` | uuid | NOT NULL, FK → `pricing_plans(id)` ON DELETE RESTRICT (preserves historical pricing) |
| `base_price` | numeric(10,2) | NOT NULL, CHECK (`base_price >= 0`) — **price snapshot copied from the pricing plan at activation** (MED-5) |
| `platform_fee` | numeric(10,2) | NOT NULL, CHECK (`platform_fee >= 0`) — snapshot |
| `total_price` | numeric(10,2) | NOT NULL, CHECK (`total_price = base_price + platform_fee`) — snapshot |
| `code_id` | uuid | NULL, FK → `subscription_codes(id)` ON DELETE SET NULL |
| `source` | text | NOT NULL DEFAULT 'code', CHECK (`source IN ('code','manual')`) |
| `started_at` | timestamptz | NOT NULL DEFAULT now() |
| `expires_at` | timestamptz | NOT NULL, CHECK (`expires_at > started_at`) |
| `status` | subscription_status | NOT NULL DEFAULT 'active' (no `revoked` status — A29) |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |

- Indexes: `idx_subs_student (student_id, status)`, `idx_subs_expires (expires_at)`.
- Validity is **derived live**: `status = 'active' AND expires_at > now()` (view `v_active_subscriptions`); expiry job flips rows to `expired` daily (A8).

### 4.5 `subscription_codes`

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

### 4.6 `code_redemptions` — authoritative redemption history

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `code_id` | uuid | NOT NULL, FK → `subscription_codes(id)` ON DELETE RESTRICT |
| `student_id` | uuid | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `subscription_id` | uuid | NOT NULL, FK → `subscriptions(id)` ON DELETE RESTRICT (history must survive any subscription cleanup — L6) |
| `redeemed_at` | timestamptz | NOT NULL DEFAULT now() |

- UNIQUE `(code_id)` — physically prevents double redemption.

### 4.7 `units`

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

### 4.8 `lessons`

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

- Index `(unit_id, sort_order)`.
- Trigger: on status → `published`, calls `notify_new_content()` (deduped, A28; targets active subscribers of the lesson's grade only).

### 4.9 `lesson_videos` — Bunny-backed assets (A2: one primary per lesson, multiple allowed)

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

- **[BINDING B9]** Partial UNIQUE: `UNIQUE (lesson_id) WHERE is_primary AND deleted_at IS NULL` → exactly one primary per lesson; soft-delete of a video clears `is_primary` in the **same transaction** (a soft-deleted primary releases the primary slot). Index `(lesson_id)`.
- Progress rows referencing a video survive soft-delete (no cascade).

### 4.10 `lesson_pdfs` — Supabase Storage-backed files

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `lesson_id` | uuid | NOT NULL, FK → `lessons(id)` ON DELETE CASCADE |
| `storage_path` | text | NOT NULL UNIQUE (path inside `pdfs` bucket) |
| `original_name` | text | NOT NULL |
| `size_bytes` | bigint | NULL |
| `mime_type` | text | NOT NULL DEFAULT 'application/pdf' |
| `is_primary` | boolean | NOT NULL DEFAULT true (only the primary PDF is exposed; promote explicitly on replacement) |
| `is_ready` | boolean | NOT NULL DEFAULT false (set true after upload completes) |
| `deleted_at` | timestamptz | NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |

- Partial UNIQUE `(lesson_id) WHERE is_primary AND deleted_at IS NULL`.

### 4.11 `progress` — one row per student+lesson

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `student_id` | uuid | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `lesson_id` | uuid | NOT NULL, FK → `lessons(id)` ON DELETE CASCADE |
| `video_id` | uuid | NULL, FK → `lesson_videos(id)` ON DELETE SET NULL (the video version this progress refers to — A11). NULL is valid: PDF-only lessons pin progress to the lesson **[BINDING B4]** |
| `position_seconds` | int | NOT NULL DEFAULT 0, CHECK (`>= 0`) |
| `percent_completed` | numeric(5,2) | NOT NULL DEFAULT 0, CHECK (`0 <= percent_completed <= 100`) |
| `is_completed` | boolean | NOT NULL DEFAULT false |
| `last_watched_at` | timestamptz | NULL |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() |

- UNIQUE `(student_id, lesson_id)`; index `(lesson_id)` for analytics.

### 4.12 `notifications`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `type` | notification_type | NOT NULL |
| `title` | text | NOT NULL |
| `body` | text | NULL |
| `dedup_key` | text | NULL, UNIQUE (per-user unique events; see §4.13) |
| `is_read` | boolean | NOT NULL DEFAULT false |
| `read_at` | timestamptz | NULL |
| `entity_type` | text | NULL (e.g. 'lesson','subscription') |
| `entity_id` | uuid | NULL |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |

- Index `(user_id, is_read, created_at desc)`.
- **[BINDING B2]** Direct UPDATE is REVOKEd from `authenticated` (mark-read only via RPCs); the own-row RLS UPDATE policy stays as belt-and-braces (PostgreSQL has no column-scoped policies — column immutability of `title`/`body`/`type`/`dedup_key`/`entity_type`/`entity_id` is enforced purely by the REVOKE, re-asserted in 0020; pgTAP asserts no table- or column-level UPDATE privilege for `anon`/`authenticated`).

### 4.13 Notification dedup keys (A28)

| Event | dedup_key pattern |
|---|---|
| 7-day warning | `sub_expiring:{subscription_id}` |
| Expiry | `sub_expired:{subscription_id}` |
| Activation | `sub_activated:{subscription_id}` |
| New content | `new_content:{lesson_id}:{student_id}` |

### 4.14 `audit_logs` — admin-only, insert-only

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
- Populated by `audit_trigger()` on the fixed inventory (MED-8): `profiles`, `grades`, `units`, `lessons`, `lesson_videos`, `lesson_pdfs`, `pricing_plans`, `subscriptions`, `subscription_codes`, `app_settings` — INSERT/UPDATE/DELETE + explicit `audit_log()` calls inside SECURITY DEFINER RPCs. `progress` and `notifications` are **explicitly excluded** (high-volume, student-owned, no admin insight value).

### 4.15 `app_settings`

| Column | Type | Constraints |
|---|---|---|
| `key` | text | PK (e.g. `whatsapp_number`, `whatsapp_default_message`, `platform_name`, `expiry_warning_days`) |
| `value` | jsonb | NOT NULL |
| `description` | text | NULL |
| `updated_by` | uuid | NULL, FK → `profiles(id)` |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() |

### 4.16 `auth.users` — managed by Supabase (email + password); never written by application code.

---

## 5. Views (BP §3.5)

All views use default **SECURITY INVOKER** semantics (no `SECURITY DEFINER`/`security_barrier`), so per-row RLS of the underlying tables still applies to the invoking user (L5).

| View | Purpose |
|---|---|
| `v_active_subscriptions` | `status='active' AND expires_at > now()` joined to non-deleted, non-disabled students |
| `v_lesson_access` | published, non-deleted lessons with per-user `can_access` (uses `can_access_lesson()`) |
| `v_student_progress_summary` | per student: percent per grade/unit, completion counts |
| `v_lesson_stats` | views/plays/completions per lesson (from progress) for analytics |
| `v_dashboard_metrics` | admin stats: totals (students active/disabled, subscribers, expired, published/hidden lessons, codes available/used) |
| `v_audit_log` | audit_logs + actor name/role joined |

Reference definitions:

```sql
-- v_active_subscriptions: live-valid subscriptions for eligible students
CREATE VIEW v_active_subscriptions AS
SELECT s.*
FROM subscriptions s
JOIN profiles p ON p.id = s.student_id
WHERE s.status = 'active'
  AND s.expires_at > now()
  AND p.status = 'active'
  AND p.deleted_at IS NULL;

-- v_lesson_access: student-facing lesson list with live access flag
CREATE VIEW v_lesson_access AS
SELECT l.*, can_access_lesson(l.id) AS can_access
FROM lessons l
JOIN units u ON u.id = l.unit_id
WHERE l.status = 'published' AND l.deleted_at IS NULL
  AND u.status = 'published' AND u.deleted_at IS NULL;

-- v_student_progress_summary: per-student percent + completion counts per grade/unit.
-- Weighted average: unit/grade percent = unweighted mean of lesson percents (A30).
CREATE VIEW v_student_progress_summary AS
SELECT p.student_id, g.id AS grade_id, u.id AS unit_id,
       ROUND(AVG(p.percent_completed), 2) AS percent,
       COUNT(*) FILTER (WHERE p.is_completed) AS completed_lessons,
       COUNT(*) AS total_lessons
FROM progress p
JOIN lessons l ON l.id = p.lesson_id AND l.deleted_at IS NULL
JOIN units u ON u.id = l.unit_id AND u.deleted_at IS NULL
JOIN grades g ON g.id = u.grade_id AND g.deleted_at IS NULL
GROUP BY p.student_id, g.id, u.id;

-- v_lesson_stats: analytics per lesson (touches = plays, completions)
CREATE VIEW v_lesson_stats AS
SELECT lesson_id,
       COUNT(*) AS play_touches,
       COUNT(*) FILTER (WHERE is_completed) AS completions
FROM progress
GROUP BY lesson_id;

-- v_dashboard_metrics: admin operational metrics (aggregates over live tables)
CREATE VIEW v_dashboard_metrics AS
SELECT
  (SELECT COUNT(*) FROM profiles WHERE deleted_at IS NULL)                       AS total_students,
  (SELECT COUNT(*) FROM profiles WHERE deleted_at IS NULL AND status = 'active') AS active_students,
  (SELECT COUNT(*) FROM profiles WHERE deleted_at IS NULL AND status = 'disabled') AS disabled_students,
  (SELECT COUNT(*) FROM v_active_subscriptions)                                  AS active_subscribers,
  (SELECT COUNT(*) FROM subscriptions WHERE status = 'expired')                  AS expired_subscriptions,
  (SELECT COUNT(*) FROM lessons WHERE deleted_at IS NULL AND status = 'published') AS published_lessons,
  (SELECT COUNT(*) FROM lessons WHERE deleted_at IS NULL AND status <> 'published') AS hidden_or_draft_lessons,
  (SELECT COUNT(*) FROM subscription_codes WHERE status = 'available')            AS available_codes,
  (SELECT COUNT(*) FROM subscription_codes WHERE status = 'used')                 AS used_codes;

-- v_audit_log: audit rows with actor display info (admin-only read)
CREATE VIEW v_audit_log AS
SELECT a.*, p.full_name AS actor_name
FROM audit_logs a
LEFT JOIN profiles p ON p.id = a.actor_id;
```

**Note (LOW-14):** `v_lesson_access` is student-facing (returns empty for staff because `can_access_lesson()` requires `is_student()`). Staff dashboards must use the dedicated staff views/queries (`v_lesson_stats`, `v_dashboard_metrics`, direct staff-scoped queries), never `v_lesson_access`.

---

## 6. RPC Function Catalog

### 6.1 Conventions

- All SECURITY DEFINER functions: `SET search_path = public`; **[BINDING B1]** owned by `postgres` (superuser) or a BYPASSRLS role (pgTAP-tested).
- Default posture: `REVOKE EXECUTE ... FROM anon, authenticated` for all internal functions; explicit `GRANT EXECUTE TO authenticated` only for the client-callable allowlist (SECURITY.md §8).
- Staff/admin functions are `SECURITY DEFINER` + audit-logging.

### 6.2 Auth / roles

| Function | Signature | Security notes |
|---|---|---|
| `handle_new_user()` | trigger on `auth.users` INSERT | SECURITY DEFINER. Reads **only** `full_name`, `phone`, `guardian_phone`, `address` from `raw_user_meta_data`; **ignores any student-supplied `grade_id`** (forced NULL — HIGH-1); **fails closed (raises)** if any required meta field is missing (LOW-12 — admin-created users via dashboard must include them; documented runbook, **[BINDING B10]**) |
| `block_email_change()` | trigger on `auth.users` BEFORE UPDATE | SECURITY DEFINER. Raises if `OLD.email IS DISTINCT FROM NEW.email`; no-op otherwise; WHEN clause — never fires on INSERT (S6/A13) |
| `block_sign_in_for_inactive_accounts()` | trigger on `auth.users` BEFORE UPDATE OF `last_sign_in_at` | SECURITY DEFINER. Raises `account_inactive_or_deleted` when `profiles.status <> 'active'` OR `deleted_at IS NOT NULL` (A34) |
| `set_updated_at()` | trigger (BEFORE UPDATE on all tables with `updated_at`) | Sets `updated_at = now()` |
| `get_current_role()` | RETURNS `user_role` | From `auth.uid()` |
| `is_student()` / `is_mr_walid()` / `is_admin()` | RETURNS boolean | STABLE SECURITY DEFINER; `is_student()` requires `status='active' AND deleted_at IS NULL` |
| `get_public_settings()` | RETURNS jsonb | SECURITY DEFINER, `SET search_path = public` (LOW-15); GRANT EXECUTE TO `anon`+`authenticated`; returns ONLY `whatsapp_number`, `whatsapp_default_message`, `platform_name` |

### 6.3 Student self-service (client-callable)

| Function | Signature | Security notes |
|---|---|---|
| `update_own_profile` | `(p_full_name text, p_phone text, p_guardian_phone text, p_address text)` | SECURITY DEFINER; whitelisted to the 4 editable columns only; audited (PII deltas only — MED-8) |
| `redeem_subscription_code` | `(p_code text) RETURNS uuid` | SECURITY DEFINER; atomic (advisory lock + FOR UPDATE + re-validation + UNIQUE backstop); normalizes input to upper() (L1); audits `code.redeem` |
| `get_my_subscriptions` | `RETURNS SETOF subscriptions` | Own rows only (RLS-scoped) |
| `get_my_current_subscription` | `RETURNS subscriptions` | Own current subscription (live validity) |
| `upsert_progress` | `(p_lesson_id uuid, p_position_seconds int, p_percent numeric) RETURNS progress` | SECURITY DEFINER. Guard `is_student()` + `can_access_lesson()`. Clamps values. **[BINDING B4]** Resolves the lesson's primary `ready` video: if one exists → video-pinning guard applies (stale `video_id` → `progress_stale_video`; writes from an old version rejected); if **none exists** (PDF-only lesson) → write is recorded with `video_id = NULL`, pinned to the lesson. Monotonic percent (GREATEST), irreversible completion at ≥90 (A12), last-write-wins position (A26) |
| `mark_notification_read` | `(p_notification_id uuid)` | SECURITY DEFINER; own rows only |
| `mark_all_notifications_read` | `()` | SECURITY DEFINER; own rows only |

### 6.4 Staff (mr_walid/admin — client-callable, SECURITY DEFINER + audit unless noted)

| Function | Signature | Notes |
|---|---|---|
| `set_user_role` | `(p_user_id uuid, p_role user_role)` | admin-only; THE ONLY path that mutates role; audit `user.role_change` |
| `set_student_grade` | `(p_student_id uuid, p_grade_id uuid)` | audit |
| `disable_student` / `enable_student` | `(p_student_id uuid)` | disable also revokes `auth.sessions` via service role where feasible (spike-verified Phase 1 — LOW-18); fallback = sign-in gate + RLS + EF checks **[BINDING B10]**; audit |
| `soft_delete_student` / `restore_student` | `(p_student_id uuid)` | delete also revokes sessions (as above); restore sets `status='active'`, `deleted_at=NULL` (A10); audit |
| `update_student_profile` | `(p_student_id uuid, p_full_name text, p_phone text, p_guardian_phone text, p_address text)` | **[BINDING B3 — new]** mr_walid/admin; SECURITY DEFINER; audited; strict 4-column whitelist (cannot touch role/grade/status/deleted_at/email) |
| `list_trash` | `RETURNS SETOF profiles` | `deleted_at IS NOT NULL`; mr_walid/admin |
| `create_manual_subscription` | `(p_student_id uuid, p_plan_id uuid, p_started_at timestamptz, p_notes text)` | SECURITY DEFINER + audit; **[BINDING B6]** `p_notes` stored in audit metadata (subscriptions has no notes column); **[BINDING B10]** does NOT require the student to have a grade; price snapshot copied from plan (MED-5) |
| `generate_codes_internal` | `(p_plan_id uuid, p_count int, p_note text) RETURNS SETOF subscription_codes` | SECURITY DEFINER; called by Edge Function only — **no client grants** (EF entry point: create_codes_for_staff; internal stays locked) |
| `create_codes_for_staff` | `(p_plan_id uuid, p_count int, p_note text) RETURNS SETOF subscription_codes` | SECURITY DEFINER; staff-guarded EF entry point (`is_admin() OR is_mr_walid()` → `permission_denied`); delegates to `generate_codes_internal` (plan/count validation stays there); granted to `authenticated` |
| `revoke_subscription_code` | `(p_code_id uuid)` | available/used → `revoked`; audit; does not cancel the created subscription (A29) |
| `create_unit` / `update_unit` / `delete_unit` (soft) / `restore_unit` | `(...)` | SECURITY DEFINER + audit |
| `create_lesson` / `update_lesson` / `publish_lesson` / `hide_lesson` / `soft_delete_lesson` / `restore_lesson` | `(...)` | SECURITY DEFINER + audit; publish sets `published_at` + `notify_new_content` (LOW-17) |
| `create_grade` / `update_grade` / `delete_grade` (soft) / `restore_grade` | `(p_grade_id uuid)` | SECURITY DEFINER + audit; set/clear `grades.deleted_at`; units/lessons remain intact, unreachable to students (deactivated or soft-deleted grades block access — [BINDING B8]) |
| `set_app_setting` | `(p_key text, p_value jsonb)` | mr_walid: `whatsapp%` keys only; admin: all |
| `set_pricing_plan` | `(...)` | admin only + audit |
| `delete_pricing_plan` | `(p_plan_id uuid)` | admin only + audit. **[BINDING B7]** Semantics: hard-delete only unreferenced plans; the FK RESTRICT guards referenced plans (by `subscriptions`/`subscription_codes`); when deletion is blocked, the plan is deactivated instead (`is_active = false`); action audited as `pricing.delete` |
| `finalize_pdf_upload` | `(p_pdf_id uuid)` | marks `is_ready`, promotes primary, audits; client-callable (staff only via RLS guards) |
| `get_dashboard_stats` | `() RETURNS jsonb` | **read-only, no audit**; `is_admin() OR is_mr_walid()` → `permission_denied`; single-round-trip JSON: students (total/active/disabled/deleted/new-this-month), subscriptions (active/expiring-7d/expired/revenue total+month), content (grades/units/lessons/published/videos(+ready)/pdfs(+ready)), engagement (students-with-progress/completed/avg%), codes (available/used/revoked), by_grade array, recent_subscriptions (5), upcoming_expirations (5, ≤7d); aggregates read through `v_active_subscriptions` where applicable (0018) |
| `list_audit_logs` | `(p_from timestamptz, p_to timestamptz, p_action text, p_entity_type text, p_actor_id uuid, p_limit integer, p_offset integer) RETURNS SETOF v_audit_log` | **read-only, no audit**; admin-only (`is_admin()` → `permission_denied`); newest-first; action/entity filtered via ILIKE substring (case-insensitive); date range + optional actor filter; limit clamped 1–200, default 50 (0019) |
| `count_audit_logs` | `(p_from timestamptz, p_to timestamptz, p_action text, p_entity_type text, p_actor_id uuid) RETURNS bigint` | **read-only, no audit**; admin-only; same filters as `list_audit_logs` for pagination totals (0019) |

### 6.5 System (internal — NO client grants)

| Function | Signature | Notes |
|---|---|---|
| `expire_subscriptions` | `()` | flip expired, emit expiry/warning notifications (dedup, once-only — A7), audit; idempotent; invoked over HTTP by the unified scheduling chain (MED-4) — never SELECT-side triggers |
| `recheck_video_states` | `()` | reconcile stuck Bunny videos; SECURITY DEFINER |
| `set_video_status` | `(video_id uuid, new_status video_status, ...)` | internal, **no client grants** (MED-6); validates legal transitions, audits, performs `is_primary` promotion/demotion (MED-10); there is no separate public variant |
| `audit_log` | `(action text, entity_type text, entity_id uuid, metadata jsonb)` | internal, **no client grants**; called by RPCs/triggers |
| `notify_new_content` | `(p_lesson_id uuid)` | SECURITY DEFINER; deduped; targets **active subscribers of the lesson's grade only**; bulk fan-out acceptable at current scale (LOW-19) |
| `can_access_lesson` | `(p_lesson_id uuid) RETURNS boolean` | SECURITY DEFINER STABLE (see SECURITY.md §4; grade-binding rule A33 + **[BINDING B8]** `AND g.is_active`) |

---

## 7. Triggers

| Trigger | Table | Timing | Function (SECURITY DEFINER where noted) |
|---|---|---|---|
| `handle_new_user` | `auth.users` | AFTER INSERT | `handle_new_user()` — profile creation from `raw_user_meta_data` (fail-closed) |
| `block_email_change` | `auth.users` | BEFORE UPDATE (WHEN email differs) | `block_email_change()` — email immutability |
| `block_sign_in_for_inactive_accounts` | `auth.users` | BEFORE UPDATE OF `last_sign_in_at` | `block_sign_in_for_inactive_accounts()` — sign-in gate |
| `set_updated_at` | profiles, grades, pricing_plans, units, lessons, lesson_videos, lesson_pdfs, progress, app_settings | BEFORE UPDATE | `set_updated_at()` |
| `audit_trigger` | profiles, grades, units, lessons, lesson_videos, lesson_pdfs, pricing_plans, subscriptions, subscription_codes, app_settings | AFTER INSERT/UPDATE/DELETE | `audit_trigger()` — audit capture (MED-8); `progress`/`notifications` excluded |
| `notify_new_content` | lessons | AFTER UPDATE (status → published) | `notify_new_content(lesson_id)` — deduped grade-scoped fan-out |

**Trigger hygiene (R-A):** all `auth.users` triggers are version-pinned (digest recorded) and unit-tested in CI so silent Supabase changes cannot break or weaken them.

---

## 8. Storage (BP §3.7)

| Bucket | Visibility | Policy |
|---|---|---|
| `pdfs` | **private** | No public SELECT. Uploads: mr_walid/admin only via Edge Function-signed upload URL. Reads: signed URL from `get-pdf-signed-url` after subscription check |
| `audit-exports` | **private** | Admin-only; CSV exports written by Edge Function, returned via short-lived signed URL |

Storage RLS: no anonymous policies; all object access goes through signed URLs issued by Edge Functions (SECURITY.md §9).

Migration inventory:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdfs','pdfs', false), ('audit-exports','audit-exports', false)
ON CONFLICT (id) DO NOTHING;
-- Storage RLS enabled on both buckets; NO anonymous (anon) policies;
-- authenticated users have NO direct object policies — every object operation
-- (upload/read/delete) is authorized inside Edge Functions via signed URLs (service role).
```

---

## 9. Seed / Configuration Data (BP §3.8, in migrations)

- `app_settings`: `platform_name`, `whatsapp_number`, `whatsapp_default_message`, `expiry_warning_days = 7`.
- `grades`: seeded **empty** (created via UI; dashboard requires grade creation first).
- Seed `admin` and `mr_walid` profiles + users via migration with password injected from CI secret (A21); rotate-on-first-login recommended (R12).

---

## 10. Migration Strategy

### 10.1 Layout

```
supabase/
  migrations/            -- ordered, versioned SQL files (Phase 1+)
  supabase-full-schema.sql  -- consolidated complete database state (single source of truth)
```

The final `supabase-full-schema.sql` must represent the complete database state: extensions, enums, tables, columns, defaults, constraints, indexes, FKs, functions, triggers, RLS enablement + policies, views, RPC functions, storage policies, safe/intentional seed data (PLAN §5). No manually-created dashboard-only database objects without documenting/reproducing them in SQL.

### 10.2 Idempotency & safety

- Idempotent where practical: `CREATE OR REPLACE`, `DO $$ ... IF NOT EXISTS` blocks, `ON CONFLICT DO NOTHING` for seeds/buckets.
- Migration-safe ordering; every phase's migrations apply cleanly on a fresh `supabase db reset` **locally only**.

### 10.3 Rollback / snapshot policy (R-F) and production rules (R-C)

- **`supabase db reset` NEVER runs against production** (R-C) — only `supabase db push` / `supabase db migrations up`.
- Rollback: reversible migrations or a verified schema snapshot; **production schema snapshot taken before each release** (R-F).
- Trigger digest pinning (R-A): `auth.users` triggers version-pinned + CI unit tests.
- Drift check (R13): CI `supabase db diff` / dump compare between `migrations/` and `supabase-full-schema.sql` on PR.

### 10.4 Phase 1 verification items

- Extensions availability: `pg_cron`, `pg_net` (A19).
- Spike: feasibility of `DELETE FROM auth.sessions` from Postgres (LOW-18) — result recorded; wording of session revocation in `disable_student`/`soft_delete_student` reconciled to the spike outcome **[BINDING B10]**.
- Apply `supabase db reset` (local) cleanly; no missing FKs; no policy contradictions; sign-in gate trigger present and version-pinned.
