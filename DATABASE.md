# منصة وليد عونى التعليمية — Database Reference

**Phase 0 deliverable.** Extracted from BLUEPRINT.md §3 (database architecture), §4 (auth), §5 (RLS), §6 (redemption/purchase), §12 (audit). Binding architecture-gate requirements are flagged **[BINDING]** and are authoritative over blueprint wording where they refine it.

All schema lives in `supabase/migrations/*.sql` (ordered) + consolidated `supabase/supabase-full-schema.sql`. SQL statements below are reference definitions for implementation; the migration files are produced in Phase 1 and extended by Phases 6–7 (exams, comments).

---

## 1. Design Principles (BP §3.1)

- UUID PKs; `timestamptz`; explicit FKs with declared `ON DELETE` behavior; unique + check constraints; targeted indexes.
- Enums **only** where the domain value set is stable (roles, statuses).
- No duplicated data; history preserved (purchases, redemptions) — never overwritten.
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
CREATE TYPE public.user_role         AS ENUM ('student','mr_walid','admin','teacher');
CREATE TYPE public.account_status    AS ENUM ('active','disabled');
CREATE TYPE public.code_status       AS ENUM ('available','used','revoked');
CREATE TYPE public.content_status    AS ENUM ('draft','published','hidden');
CREATE TYPE public.video_status      AS ENUM ('pending_upload','uploading','processing','ready','failed','replaced');
CREATE TYPE public.unit_purchase_status AS ENUM ('active','void');
CREATE TYPE public.notification_type AS ENUM ('new_content','unit_activated','system');
-- Phase 6/7 extend notification_type via ALTER TYPE ... ADD VALUE:
--   'exam_submitted', 'exam_graded' (0029); 'lesson_comment', 'comment_reply' (0030)
-- Phase 6 adds: CREATE TYPE public.exam_question_type AS ENUM ('mcq','essay');
```

The time-based status enum used by the legacy access model was dropped by 0028 — nothing in the current model lapses over time.

---

## 4. Tables (application tables)

### 4.1 `profiles` — one row per `auth.users` (role: student default)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, FK → `auth.users(id)` ON DELETE CASCADE |
| `full_name` | text | NOT NULL |
| `phone` | text | NOT NULL, UNIQUE, CHECK Egyptian format `^(\+20|0)1[0-9]{9}$` (A17) |
| `guardian_phone` | text | NOT NULL, CHECK Egyptian format (may repeat across students, A3) |
| `address` | text | NOT NULL |
| `grade_id` | uuid | NOT NULL for students (required at sign-up, 0027), FK → `grades(id)` ON DELETE SET NULL (A1) |
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
- Seeded with three default grades (idempotent, 0027); students pick their grade at sign-up via `list_active_grades()` (anon-safe).

### 4.3 `unit_pricing` — permanent per-unit pricing

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `unit_id` | uuid | NOT NULL, UNIQUE, FK → `units(id)` ON DELETE CASCADE |
| `base_price` | numeric(10,2) | NOT NULL, CHECK (`base_price >= 0`) |
| `platform_fee` | numeric(10,2) | NOT NULL DEFAULT 0, CHECK (`platform_fee >= 0`) |
| `total_price` | numeric(10,2) | GENERATED ALWAYS AS (base_price + platform_fee) STORED (A6) |
| `is_active` | boolean | NOT NULL DEFAULT true |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |

- Upserted exclusively via `set_unit_price` (staff — base price only) and `set_platform_fee` (owner mr_walid or admin — global fixed fee), both audited. FORCE RLS; no direct DML policies.

### 4.4 `unit_codes` — one-time activation codes for a unit

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `code` | text | NOT NULL, UNIQUE, stored uppercase, CHECK `code ~ '^WLDN-[A-Z0-9]{8,12}$'` and `code = upper(code)` (unambiguous charset, A22) |
| `unit_pricing_id` | uuid | NOT NULL, FK → `unit_pricing(id)` ON DELETE RESTRICT |
| `status` | code_status | NOT NULL DEFAULT 'available' |
| `created_by` | uuid | NOT NULL, FK → `auth.users(id)` |
| `used_at` | timestamptz | NULL |
| `used_by` | uuid | NULL, FK → `profiles(id)` |
| `revoked_at` / `revoked_by` | timestamptz / uuid | NULL / FK → `auth.users(id)` |
| `note` | text | NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |

- Indexes: `(unit_pricing_id)`, `(status)`. Students never see raw codes (RLS).

### 4.5 `unit_purchases` — permanent purchases (no time limit)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `student_id` | uuid | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE (profiles only soft-deleted → history preserved) |
| `unit_id` | uuid | NOT NULL, FK → `units(id)` ON DELETE RESTRICT |
| `base_price` | numeric(10,2) | NOT NULL, CHECK (`base_price >= 0`) — **price snapshot copied from `unit_pricing` at redemption** (P12) |
| `platform_fee` | numeric(10,2) | NOT NULL DEFAULT 0, CHECK (`platform_fee >= 0`) — snapshot |
| `total_price` | numeric(10,2) | GENERATED ALWAYS AS (base_price + platform_fee) STORED — snapshot |
| `code_id` | uuid | NULL, FK → `unit_codes(id)` ON DELETE SET NULL |
| `status` | unit_purchase_status | NOT NULL DEFAULT 'active' |
| `purchased_at` | timestamptz | NOT NULL DEFAULT now() |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |

- UNIQUE `(student_id, unit_id)` — double purchase of the same unit impossible.
- Indexes: `(student_id)`, `(unit_id)`, `(student_id, unit_id)`.
- Access is **permanent**: a purchase row with `status='active'` never lapses; no time-limit column exists on any table.
- Writes exclusively via SECURITY DEFINER `redeem_unit_code`; direct INSERT blocked by the `unit_purchases_insert_via_rpc` policy (`WITH CHECK (false)`).

### 4.6 `units`

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

### 4.7 `lessons`

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

- Index `(unit_id, sort_order)`.
- Partial UNIQUE `(unit_id) WHERE is_trial AND deleted_at IS NULL` — at most one trial lesson per unit (decision D).
- Trigger: on status → `published`, calls `notify_new_content()` (deduped, A28; targets **active purchasers of the lesson's grade** only).

### 4.8 `lesson_videos` — Bunny-backed assets (A2: one primary per lesson, multiple allowed)

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

### 4.9 `lesson_pdfs` — Supabase Storage-backed files

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

### 4.10 `progress` — one row per student+lesson

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

### 4.11 `notifications`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `type` | notification_type | NOT NULL |
| `title` | text | NOT NULL |
| `body` | text | NULL |
| `dedup_key` | text | NULL, UNIQUE (per-user unique events; see §4.12) |
| `is_read` | boolean | NOT NULL DEFAULT false |
| `read_at` | timestamptz | NULL |
| `entity_type` | text | NULL (e.g. 'lesson','unit_purchases','exam_attempts','lesson_comments') |
| `entity_id` | uuid | NULL |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |

- Index `(user_id, is_read, created_at desc)`.
- **[BINDING B2]** Direct UPDATE is REVOKEd from `authenticated` (mark-read only via RPCs); the own-row RLS UPDATE policy stays as belt-and-braces (PostgreSQL has no column-scoped policies — column immutability of `title`/`body`/`type`/`dedup_key`/`entity_type`/`entity_id` is enforced purely by the REVOKE, re-asserted in 0020; pgTAP asserts no table- or column-level UPDATE privilege for `anon`/`authenticated`).

### 4.12 Notification dedup keys (A28)

| Event | dedup_key pattern |
|---|---|
| Unit activated | `unit_activated:{purchase_id}` |
| New content | `new_content:{lesson_id}:{student_id}` |
| Exam submitted (0029) | `exam_submitted:{attempt_id}` |
| Exam graded (0029) | `exam_graded:{attempt_id}` |
| Lesson comment / reply (0030) | `lesson_comment:{comment_id}` / `comment_reply:{comment_id}` |

### 4.13 `audit_logs` — admin-only, insert-only

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
- Populated by `audit_trigger()` on the fixed inventory (MED-8): `profiles`, `grades`, `units`, `lessons`, `lesson_videos`, `lesson_pdfs`, `unit_pricing`, `unit_codes`, `unit_purchases`, `app_settings` (plus `exams`/`exam_attempts` and `lesson_comments` added by Phases 6–7) — INSERT/UPDATE/DELETE + explicit `audit_log()` calls inside SECURITY DEFINER RPCs. `progress` and `notifications` are **explicitly excluded** (high-volume, student-owned, no admin insight value).

### 4.14 `app_settings`

| Column | Type | Constraints |
|---|---|---|
| `key` | text | PK (e.g. `whatsapp_number`, `whatsapp_default_message`, `platform_name`) |
| `value` | jsonb | NOT NULL |
| `description` | text | NULL |
| `updated_by` | uuid | NULL, FK → `profiles(id)` |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() |

### 4.15 `exams` (Phase 6, 0029) — one exam per lesson

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `lesson_id` | uuid | NOT NULL, FK → `lessons(id)` ON DELETE CASCADE |
| `title` | text | NOT NULL |
| `sort_order` | int | NOT NULL DEFAULT 0 |
| `passing_score` | int | NOT NULL DEFAULT 50, CHECK (0–100) |
| `deleted_at` | timestamptz | NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |

### 4.16 `exam_questions` (Phase 6, 0029)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `exam_id` | uuid | NOT NULL, FK → `exams(id)` ON DELETE CASCADE |
| `type` | exam_question_type | NOT NULL DEFAULT 'mcq' |
| `prompt` | text | NOT NULL |
| `choices` | jsonb | NULL (MCQ: array of options) |
| `correct_index` | int | NULL (MCQ: 0-based index of the correct choice) |
| `max_score` | numeric(5,2) | NOT NULL DEFAULT 1, CHECK (`max_score > 0`) |
| `sort_order` | int | NOT NULL DEFAULT 0 |

### 4.17 `exam_attempts` (Phase 6, 0029)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `exam_id` | uuid | NOT NULL, FK → `exams(id)` ON DELETE CASCADE |
| `student_id` | uuid | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `status` | text | NOT NULL DEFAULT 'submitted', CHECK IN ('submitted','graded') |
| `auto_score` | numeric(5,2) | NULL (MCQ total, auto-graded) |
| `manual_score` | numeric(5,2) | NULL (essay grading) |
| `final_score` | numeric(5,2) | NULL (after grading completes) |
| `graded_by` | uuid | NULL, FK → `profiles(id)` |
| `graded_at` | timestamptz | NULL |
| `submitted_at` | timestamptz | NOT NULL DEFAULT now() |

- UNIQUE `(exam_id, student_id)` — one attempt per exam per student.
- MCQ is auto-graded immediately; essays are graded via `grade_exam_attempt` (staff); when complete, `final_score` is set and `exam_graded` is notified.

### 4.18 `exam_answers` (Phase 6, 0029)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `attempt_id` | uuid | NOT NULL, FK → `exam_attempts(id)` ON DELETE CASCADE |
| `question_id` | uuid | NOT NULL, FK → `exam_questions(id)` ON DELETE CASCADE |
| `choice_index` | int | NULL (MCQ) |
| `answer_text` | text | NULL (essay) |
| `score` | numeric(5,2) | NULL (after grading) |

### 4.19 `lesson_comments` (Phase 7, 0030)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `lesson_id` | uuid | NOT NULL, FK → `lessons(id)` ON DELETE CASCADE |
| `author_id` | uuid | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `parent_id` | uuid | NULL, FK → `lesson_comments(id)` ON DELETE CASCADE (replies) |
| `body` | text | NOT NULL, CHECK (`length(btrim(body)) > 0 AND length(btrim(body)) <= 1000`) |
| `status` | text | NOT NULL DEFAULT 'visible', CHECK IN ('visible','removed') |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |

- Index `(lesson_id)`.

### 4.20 `auth.users` — managed by Supabase (email + password); never written by application code.

---

## 5. Views (BP §3.5)

All views use default **SECURITY INVOKER** semantics (no `SECURITY DEFINER`/`security_barrier`), so per-row RLS of the underlying tables still applies to the invoking user (L5).

| View | Purpose |
|---|---|
| `v_lesson_access` | published, non-deleted lessons with per-user `can_access` (uses `can_access_lesson()`) |
| `v_student_progress_summary` | per student: percent per grade/unit, completion counts |
| `v_lesson_stats` | views/plays/completions per lesson (from progress) for analytics |
| `v_dashboard_metrics` | staff stats: totals (students active/disabled, purchasers, published lessons, codes available/used) |
| `v_audit_log` | audit_logs + actor name/role joined |

Reference definitions:

```sql
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

-- v_dashboard_metrics: staff operational metrics (aggregates over live tables)
CREATE VIEW v_dashboard_metrics AS
SELECT
  (SELECT COUNT(*) FROM profiles WHERE deleted_at IS NULL)                        AS total_students,
  (SELECT COUNT(*) FROM profiles WHERE deleted_at IS NULL AND status = 'active')  AS active_students,
  (SELECT COUNT(*) FROM profiles WHERE deleted_at IS NULL AND status = 'disabled') AS disabled_students,
  (SELECT COUNT(*) FROM unit_purchases WHERE status = 'active')                    AS total_purchases,
  (SELECT COUNT(*) FROM lessons WHERE deleted_at IS NULL AND status = 'published') AS published_lessons,
  (SELECT COUNT(*) FROM lessons WHERE deleted_at IS NULL AND status <> 'published') AS hidden_or_draft_lessons,
  (SELECT COUNT(*) FROM unit_codes WHERE status = 'available')                     AS available_codes,
  (SELECT COUNT(*) FROM unit_codes WHERE status = 'used')                          AS used_codes;

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
| `handle_new_user()` | trigger on `auth.users` INSERT | SECURITY DEFINER. Reads `full_name`, `phone`, `guardian_phone`, `address`, and for students **`grade_id` (required, 0027)** from `raw_user_meta_data`; **fails closed (raises)** if any required meta field is missing (`grade_required` for students; `grade_not_available` for inactive/deleted grades; `invalid_grade_id` for malformed uuid) — admin-created staff users must include the fields; documented runbook, **[BINDING B10]** |
| `block_email_change()` | trigger on `auth.users` BEFORE UPDATE | SECURITY DEFINER. Raises if `OLD.email IS DISTINCT FROM NEW.email`; no-op otherwise; WHEN clause — never fires on INSERT (S6/A13) |
| `block_sign_in_for_inactive_accounts()` | trigger on `auth.users` BEFORE UPDATE OF `last_sign_in_at` | SECURITY DEFINER. Raises `account_inactive_or_deleted` when `profiles.status <> 'active'` OR `deleted_at IS NOT NULL` (A34) |
| `set_updated_at()` | trigger (BEFORE UPDATE on all tables with `updated_at`) | Sets `updated_at = now()` |
| `get_current_role()` | RETURNS `user_role` | From `auth.uid()` |
| `is_student()` / `is_mr_walid()` / `is_admin()` / `is_teacher()` | RETURNS boolean | STABLE SECURITY DEFINER; `is_student()` requires `status='active' AND deleted_at IS NULL` |
| `get_public_settings()` | RETURNS jsonb | SECURITY DEFINER, `SET search_path = public` (LOW-15); GRANT EXECUTE TO `anon`+`authenticated`; returns ONLY `whatsapp_number`, `whatsapp_default_message`, `platform_name` |
| `list_active_grades()` | RETURNS SETOF grades | SECURITY DEFINER, pinned search_path; returns ONLY id/name/sort_order of active, non-deleted grades; granted to `anon` + `authenticated` (the ONLY anon surface for grade data) |

### 6.3 Student self-service (client-callable)

| Function | Signature | Security notes |
|---|---|---|
| `update_own_profile` | `(p_full_name text, p_phone text, p_guardian_phone text, p_address text)` | SECURITY DEFINER; whitelisted to the 4 editable columns only; audited (PII deltas only — MED-8) |
| `redeem_unit_code` | `(p_code text) RETURNS unit_purchases` | SECURITY DEFINER; atomic (advisory lock `wldn_redeem_unit:<code>` + FOR UPDATE + re-validation + UNIQUE backstop); error order: `code_not_found` → `unit_not_found` → `unit_inactive` → `code_revoked` → `code_already_used` → `no_grade_assigned` → `unit_not_in_student_grade` → `unit_already_purchased`; `access_denied` if not a student; audits `unit_purchase.create` |
| `get_my_unit_purchases` | `RETURNS SETOF unit_purchases` | SECURITY INVOKER; own rows only (`student_id = auth.uid()`), newest first |
| `get_my_lesson_access` | `(p_lesson_id uuid) RETURNS jsonb` | SECURITY DEFINER, STABLE; lesson-player gate payload: `has_access`, `has_purchase`, `is_trial`, `unit_id`, `unit_name`, `price` |
| `upsert_progress` | `(p_lesson_id uuid, p_position_seconds int, p_percent numeric) RETURNS progress` | SECURITY DEFINER. Guard `is_student()` + `can_access_lesson()`. Clamps values. **[BINDING B4]** Resolves the lesson's primary `ready` video: if one exists → video-pinning guard applies (stale `video_id` → `progress_stale_video`; writes from an old version rejected); if **none exists** (PDF-only lesson) → write is recorded with `video_id = NULL`, pinned to the lesson. Monotonic percent (GREATEST), irreversible completion at ≥90 (A12), last-write-wins position (A26) |
| `mark_notification_read` | `(p_notification_id uuid)` | SECURITY DEFINER; own rows only |
| `mark_all_notifications_read` | `()` | SECURITY DEFINER; own rows only |

### 6.4 Staff (admin/mr_walid/teacher — client-callable, SECURITY DEFINER + audit unless noted)

| Function | Signature | Notes |
|---|---|---|
| `set_user_role` | `(p_user_id uuid, p_role user_role)` | admin-only; THE ONLY path that mutates role; audit `user.role_change` |
| `set_role_by_email` | `(p_email text, p_role user_role)` | admin-only (0023); audit |
| `set_student_grade` | `(p_student_id uuid, p_grade_id uuid)` | staff (admin/mr_walid/teacher); audit |
| `disable_student` / `enable_student` | `(p_student_id uuid)` | disable also revokes `auth.sessions` via service role where feasible (spike-verified Phase 1 — LOW-18); fallback = sign-in gate + RLS + EF checks **[BINDING B10]**; audit |
| `soft_delete_student` / `restore_student` | `(p_student_id uuid)` | delete also revokes sessions (as above); restore sets `status='active'`, `deleted_at=NULL` (A10); audit |
| `update_student_profile` | `(p_student_id uuid, p_full_name text, p_phone text, p_guardian_phone text, p_address text)` | **[BINDING B3 — new]** mr_walid/admin; SECURITY DEFINER; audited; strict 4-column whitelist (cannot touch role/grade/status/deleted_at/email) |
| `list_trash` | `RETURNS SETOF profiles` | `deleted_at IS NOT NULL`; mr_walid/admin |
| `set_unit_price` | `(p_unit_id uuid, p_base_price numeric)` | staff (admin/mr_walid/teacher) sets the BASE price only + audit (`unit_pricing.upsert`); platform fee is read from `app_settings`; upserts the per-unit pricing row |
| `set_platform_fee` | `(p_fee numeric)` | **owner (mr_walid) or admin** (0031/0033); sets ONE global fixed fee in `app_settings` and rewrites `platform_fee` on every `unit_pricing` row + audit |
| `get_platform_fee` | `RETURNS numeric` | public read (anon + authenticated, 0031); landing page shows base + fee + total without auth |
| `list_unit_pricing` | `RETURNS SETOF unit_pricing` | read-only, no audit; staff surface for per-unit prices |
| `create_unit_codes_internal` | `(p_unit_pricing_id uuid, p_count int, p_note text) RETURNS SETOF unit_codes` | SECURITY DEFINER; called by Edge Function only — **no client grants** (EF entry point: `create_unit_codes_for_staff`; internal stays locked); validates count cap (≤500) + format (A22) |
| `create_unit_codes_for_staff` | `(p_unit_pricing_id uuid, p_count int, p_note text) RETURNS SETOF unit_codes` | SECURITY DEFINER; staff-guarded EF entry point (`is_admin() OR is_mr_walid()` → `permission_denied`); delegates to `create_unit_codes_internal`; granted to `authenticated` |
| `list_codes_by_unit` | `(p_unit_id uuid) RETURNS SETOF unit_codes` | read-only; staff (admin/mr_walid) |
| `revoke_unit_code` | `(p_code_id uuid)` | available/used → `revoked`; audit; does not cancel the created purchase |
| `list_all_unit_purchases` | `(p_student_id uuid) RETURNS SETOF unit_purchases` | read-only; staff view of a student's purchase history |
| `unit_purchase_stats` | `RETURNS jsonb` | read-only, no audit; staff purchase aggregates |
| `set_lesson_trial` | `(p_lesson_id uuid, p_is_trial boolean)` | staff (admin/mr_walid/teacher); atomically clears any prior trial in the unit then sets the target; audited (`unit.trial_set`); `lesson_not_found` if missing |
| `create_unit` / `update_unit` / `delete_unit` (soft) / `restore_unit` | `(...)` | SECURITY DEFINER + audit |
| `create_lesson` / `update_lesson` / `publish_lesson` / `hide_lesson` / `soft_delete_lesson` / `restore_lesson` | `(...)` | SECURITY DEFINER + audit; publish sets `published_at` + `notify_new_content` (LOW-17) |
| `create_grade` / `update_grade` / `delete_grade` (soft) / `restore_grade` | `(p_grade_id uuid)` | SECURITY DEFINER + audit; set/clear `grades.deleted_at`; units/lessons remain intact, unreachable to students (deactivated or soft-deleted grades block access — [BINDING B8]) |
| `set_app_setting` | `(p_key text, p_value jsonb)` | mr_walid: `whatsapp%` keys only; admin: all |
| `finalize_pdf_upload` | `(p_pdf_id uuid)` | marks `is_ready`, promotes primary, audits; client-callable (staff only via RLS guards) |
| `get_dashboard_stats` | `() RETURNS jsonb` | **read-only, no audit**; `is_admin() OR is_mr_walid() OR is_teacher()` → `permission_denied`; single-round-trip JSON: students (total/active/disabled/deleted/new-this-month), purchases (total/total_revenue/revenue_this_month), content (grades/units/lessons/published/videos(+ready)/pdfs(+ready)), engagement (students-with-progress/completed/avg%), by_grade array (students/purchases/revenue), top_units (LIMIT 5 by revenue), recent_purchases (5); aggregates read through `v_dashboard_metrics` where applicable (0018/0028) |
| `list_audit_logs` | `(p_from timestamptz, p_to timestamptz, p_action text, p_entity_type text, p_actor_id uuid, p_limit integer, p_offset integer) RETURNS SETOF v_audit_log` | **read-only, no audit**; admin-only (`is_admin()` → `permission_denied`); newest-first; action/entity filtered via ILIKE substring (case-insensitive); date range + optional actor filter; limit clamped 1–200, default 50 (0019) |
| `count_audit_logs` | `(p_from timestamptz, p_to timestamptz, p_action text, p_entity_type text, p_actor_id uuid) RETURNS bigint` | **read-only, no audit**; admin-only; same filters as `list_audit_logs` for pagination totals (0019) |

Phase 6/7 add: `grade_exam_attempt` (staff, essay grading → `final_score` + `exam_graded`), exam/attempt read helpers (access-gated by `can_access_lesson(exam.lesson_id)`); `add_lesson_comment`, `delete_lesson_comment`, `list_lesson_comments` (comment CRUD, own-or-staff delete, `lesson_comment`/`comment_reply` notifications).

### 6.5 System (internal — NO client grants)

| Function | Signature | Notes |
|---|---|---|
| `recheck_video_states` | `()` | reconcile stuck Bunny videos; SECURITY DEFINER |
| `set_video_status` | `(video_id uuid, new_status video_status, ...)` | internal, **no client grants** (MED-6); validates legal transitions, audits, performs `is_primary` promotion/demotion (MED-10); there is no separate public variant |
| `audit_log` | `(action text, entity_type text, entity_id uuid, metadata jsonb)` | internal, **no client grants**; called by RPCs/triggers |
| `notify_new_content` | `(p_lesson_id uuid)` | SECURITY DEFINER; deduped; targets **active purchasers of the lesson's grade only**; bulk fan-out acceptable at current scale (LOW-19) |
| `can_access_lesson` | `(p_lesson_id uuid) RETURNS boolean` | SECURITY DEFINER STABLE (see SECURITY.md §4): staff see any live lesson; students need published lesson+unit in own **active** grade + active profile + (trial lesson OR active `unit_purchases`) + **[BINDING B8]** `AND g.is_active` |

---

## 7. Triggers

| Trigger | Table | Timing | Function (SECURITY DEFINER where noted) |
|---|---|---|---|
| `handle_new_user` | `auth.users` | AFTER INSERT | `handle_new_user()` — profile creation from `raw_user_meta_data` (fail-closed; grade required for students, 0027) |
| `block_email_change` | `auth.users` | BEFORE UPDATE (WHEN email differs) | `block_email_change()` — email immutability |
| `block_sign_in_for_inactive_accounts` | `auth.users` | BEFORE UPDATE OF `last_sign_in_at` | `block_sign_in_for_inactive_accounts()` — sign-in gate |
| `set_updated_at` | profiles, grades, unit_pricing, unit_codes, units, lessons, lesson_videos, lesson_pdfs, progress, app_settings | BEFORE UPDATE | `set_updated_at()` |
| `audit_trigger` | profiles, grades, units, lessons, lesson_videos, lesson_pdfs, unit_pricing, unit_codes, unit_purchases, app_settings (+ exams/lesson_comments in Phases 6–7) | AFTER INSERT/UPDATE/DELETE | `audit_trigger()` — audit capture (MED-8); `progress`/`notifications` excluded |
| `notify_new_content` | lessons | AFTER UPDATE (status → published) | `notify_new_content(lesson_id)` — deduped grade-scoped fan-out to purchasers |
| `clear_primary_on_soft_delete` | lesson_videos | BEFORE UPDATE (status → replaced / deleted_at set) | clears `is_primary` in the same transaction **[BINDING B9]** |

**Trigger hygiene (R-A):** all `auth.users` triggers are version-pinned (digest recorded) and unit-tested in CI so silent Supabase changes cannot break or weaken them.

---

## 8. Storage (BP §3.7)

| Bucket | Visibility | Policy |
|---|---|---|
| `pdfs` | **private** | No public SELECT. Uploads: mr_walid/admin only via Edge Function-signed upload URL. Reads: signed URL from `get-pdf-signed-url` after `can_access_lesson` |
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

- `app_settings`: `platform_name`, `whatsapp_number`, `whatsapp_default_message` (the legacy warning-key of the old access model was removed in 0028).
- `grades`: three default grades seeded idempotently (0027); registration reads them via `list_active_grades()`.
- Seed `admin` and `mr_walid` profiles + users via migration with password injected from CI secret (A21); rotate-on-first-login recommended (R12).

---

## 10. Migration Strategy

### 10.1 Layout

```
supabase/
  migrations/            -- ordered, versioned SQL files (Phase 1+, append-only)
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
