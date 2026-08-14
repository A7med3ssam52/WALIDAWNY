-- =====================================================================
-- supabase-full-schema.sql - consolidated Phase 1 schema
-- ---------------------------------------------------------------------
-- Single-file snapshot of supabase/migrations/0001..0027, concatenated
-- in filename order. Apply ONCE to a fresh project; incremental changes
-- always go into new numbered migration files (never edit this file).
-- Verified by the embedded-PostgreSQL harness (tests/local).
-- =====================================================================

-- =====================================================================
-- >>> included from migrations\0001_extensions_and_enums.sql
-- =====================================================================

-- =====================================================================
-- 0001_extensions_and_enums
-- Phase 1 | Supabase Foundation | Database
-- Extensions and all enumerated types used across the schema.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_cron / pg_net are provided by the hosted Supabase platform.
-- On the local embedded-PostgreSQL harness they do not exist, so they
-- are intentionally guarded. Do NOT create stubs for them; all schema
-- objects that depend on them are gated behind IF EXISTS.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron;
    END IF;
END$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
        CREATE EXTENSION IF NOT EXISTS pg_net;
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- Enumerated types (exact member sets per DATABASE.md section 3).
-- Idempotent: CREATE TYPE has no IF NOT EXISTS in PostgreSQL, so each
-- enum is guarded on to_regtype (a re-run of the full schema in the
-- SQL editor is a no-op for already-created types).
-- ---------------------------------------------------------------------

DO $$
BEGIN
    IF to_regtype('public.user_role') IS NULL THEN
        CREATE TYPE public.user_role AS ENUM (
            'student',
            'mr_walid',
            'admin'
        );
    END IF;
END$$;

DO $$
BEGIN
    IF to_regtype('public.account_status') IS NULL THEN
        CREATE TYPE public.account_status AS ENUM (
            'active',
            'disabled'
        );
    END IF;
END$$;

DO $$
BEGIN
    IF to_regtype('public.subscription_status') IS NULL THEN
        CREATE TYPE public.subscription_status AS ENUM (
            'active',
            'expired'
        );
    END IF;
END$$;

DO $$
BEGIN
    IF to_regtype('public.code_status') IS NULL THEN
        CREATE TYPE public.code_status AS ENUM (
            'available',
            'used',
            'revoked'
        );
    END IF;
END$$;

DO $$
BEGIN
    IF to_regtype('public.content_status') IS NULL THEN
        CREATE TYPE public.content_status AS ENUM (
            'draft',
            'published',
            'hidden'
        );
    END IF;
END$$;

DO $$
BEGIN
    IF to_regtype('public.video_status') IS NULL THEN
        CREATE TYPE public.video_status AS ENUM (
            'pending_upload',
            'uploading',
            'processing',
            'ready',
            'failed',
            'replaced'
        );
    END IF;
END$$;

DO $$
BEGIN
    IF to_regtype('public.notification_type') IS NULL THEN
        CREATE TYPE public.notification_type AS ENUM (
            'subscription_activated',
            'subscription_expiring',
            'subscription_expired',
            'new_content',
            'system'
        );
    END IF;
END$$;

-- =====================================================================
-- >>> included from migrations\0002_tables_and_constraints.sql
-- =====================================================================

-- =====================================================================
-- 0002_tables_and_constraints
-- Phase 1 | Supabase Foundation | Database
-- Core tables, constraints, indexes and object comments.
-- Reference: DATABASE.md section 4 (columns/types/constraints) and
-- section 3 (enums). Table creation order follows the FK graph.
-- =====================================================================

-- =====================================================================
-- grades
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.grades (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
    sort_order  integer NOT NULL DEFAULT 0,
    is_active   boolean NOT NULL DEFAULT true,
    deleted_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.grades IS 'Student grades (school years). is_active is part of every student-facing query (binding B8); delete_grade soft-sets deleted_at.';

CREATE INDEX IF NOT EXISTS idx_grades_sort_order ON public.grades (sort_order);

-- =====================================================================
-- profiles
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id             uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    full_name      text NOT NULL CHECK (length(btrim(full_name)) > 0),
    phone          text NOT NULL UNIQUE CHECK (phone ~ '^(\+20|0)1[0-9]{9}$'),
    guardian_phone text NOT NULL CHECK (guardian_phone ~ '^(\+20|0)1[0-9]{9}$'),
    address        text NOT NULL CHECK (length(btrim(address)) > 0),
    grade_id       uuid REFERENCES public.grades (id) ON DELETE SET NULL,
    role           public.user_role NOT NULL DEFAULT 'student',
    status         public.account_status NOT NULL DEFAULT 'active',
    deleted_at     timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.profiles IS 'User profiles. One row per auth.users entry; created by handle_new_user from raw_user_meta_data (grade forced NULL - HIGH-1). Only the 4 editable columns (full_name, phone, guardian_phone, address) are student-mutable.';

CREATE INDEX IF NOT EXISTS idx_profiles_grade     ON public.profiles (grade_id) WHERE grade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_role      ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_trash     ON public.profiles (id) WHERE deleted_at IS NOT NULL;

-- =====================================================================
-- pricing_plans
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.pricing_plans (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grade_id     uuid NOT NULL REFERENCES public.grades (id) ON DELETE CASCADE,
    duration_days integer NOT NULL CHECK (duration_days > 0),
    base_price   numeric(10, 2) NOT NULL CHECK (base_price >= 0),
    platform_fee numeric(10, 2) NOT NULL CHECK (platform_fee >= 0),
    total_price  numeric(10, 2) NOT NULL CHECK (total_price = base_price + platform_fee),
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (grade_id, duration_days)
);

ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pricing_plans IS 'Duration-based pricing offers per grade. Referenced plans cannot be deleted (RESTRICT, binding B7); delete_pricing_plan deactivates instead.';

CREATE INDEX IF NOT EXISTS idx_pricing_plans_grade ON public.pricing_plans (grade_id);

-- =====================================================================
-- subscription_codes
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.subscription_codes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code            text NOT NULL UNIQUE,
    pricing_plan_id uuid NOT NULL REFERENCES public.pricing_plans (id) ON DELETE RESTRICT,
    status          public.code_status NOT NULL DEFAULT 'available',
    created_by      uuid NOT NULL REFERENCES public.profiles (id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    used_at         timestamptz,
    used_by         uuid REFERENCES public.profiles (id),
    revoked_at      timestamptz,
    revoked_by      uuid REFERENCES public.profiles (id),
    note            text,
    CHECK (code = upper(code)),
    CHECK (code ~ '^WLDN-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$')
);

ALTER TABLE public.subscription_codes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.subscription_codes IS 'Redeemable subscription codes: stored uppercase, unambiguous charset (no 0/O, 1/I), format-enforced by CHECK (A22). Students never see raw codes.';

CREATE INDEX IF NOT EXISTS idx_subscription_codes_status ON public.subscription_codes (status);

-- =====================================================================
-- subscriptions
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id       uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    pricing_plan_id  uuid NOT NULL REFERENCES public.pricing_plans (id) ON DELETE RESTRICT,
    base_price       numeric(10, 2) NOT NULL CHECK (base_price >= 0),
    platform_fee     numeric(10, 2) NOT NULL CHECK (platform_fee >= 0),
    total_price      numeric(10, 2) NOT NULL CHECK (total_price = base_price + platform_fee),
    code_id          uuid REFERENCES public.subscription_codes (id) ON DELETE SET NULL,
    source           text NOT NULL DEFAULT 'code' CHECK (source IN ('code', 'manual')),
    started_at       timestamptz NOT NULL DEFAULT now(),
    expires_at       timestamptz NOT NULL CHECK (expires_at > started_at),
    status           public.subscription_status NOT NULL DEFAULT 'active',
    created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.subscriptions IS 'Subscriptions. Prices are snapshots copied from the pricing plan at activation (MED-5); validity is derived live: status = active AND expires_at > now(). Direct DML is RPC-only.';

CREATE INDEX IF NOT EXISTS idx_subs_student ON public.subscriptions (student_id, status);
CREATE INDEX IF NOT EXISTS idx_subs_expires ON public.subscriptions (expires_at);

-- =====================================================================
-- code_redemptions
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.code_redemptions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code_id         uuid NOT NULL REFERENCES public.subscription_codes (id) ON DELETE RESTRICT,
    student_id      uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    subscription_id uuid NOT NULL REFERENCES public.subscriptions (id) ON DELETE RESTRICT,
    redeemed_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (code_id)
);

ALTER TABLE public.code_redemptions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.code_redemptions IS 'Immutable redemption history; UNIQUE (code_id) physically prevents double redemption.';

CREATE INDEX IF NOT EXISTS idx_code_redemptions_student ON public.code_redemptions (student_id);

-- =====================================================================
-- units
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.units (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grade_id    uuid NOT NULL REFERENCES public.grades (id) ON DELETE CASCADE,
    name        text NOT NULL CHECK (length(btrim(name)) > 0),
    sort_order  integer NOT NULL DEFAULT 0,
    status      public.content_status NOT NULL DEFAULT 'draft',
    deleted_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (grade_id, name)
);

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.units IS 'Curriculum units, children of a grade. Students see published, non-deleted units of their own grade only.';

CREATE INDEX IF NOT EXISTS idx_units_grade_sort ON public.units (grade_id, sort_order);

-- =====================================================================
-- lessons
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.lessons (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id      uuid NOT NULL REFERENCES public.units (id) ON DELETE CASCADE,
    title        text NOT NULL CHECK (length(btrim(title)) > 0),
    description  text,
    sort_order   integer NOT NULL DEFAULT 0,
    status       public.content_status NOT NULL DEFAULT 'draft',
    published_at timestamptz,
    deleted_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.lessons IS 'Lessons inside units. publish_lesson sets published_at and fires notify_new_content.';

CREATE INDEX IF NOT EXISTS idx_lessons_unit_sort ON public.lessons (unit_id, sort_order);

-- =====================================================================
-- lesson_videos
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.lesson_videos (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id        uuid NOT NULL REFERENCES public.lessons (id) ON DELETE CASCADE,
    bunny_video_id   text NOT NULL UNIQUE CHECK (length(btrim(bunny_video_id)) > 0),
    bunny_library_id text NOT NULL CHECK (length(btrim(bunny_library_id)) > 0),
    title            text,
    status           public.video_status NOT NULL DEFAULT 'pending_upload',
    duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    thumbnail_url    text,
    is_primary       boolean NOT NULL DEFAULT false,
    error_message    text,
    sort_order       integer NOT NULL DEFAULT 0,
    deleted_at       timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_videos ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.lesson_videos IS 'Videos attached to lessons (Bunny-backed). Exactly one non-deleted primary per lesson (partial unique, binding B9); soft-delete clears is_primary in the same transaction.';

CREATE INDEX IF NOT EXISTS idx_lesson_videos_lesson ON public.lesson_videos (lesson_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_videos_primary
    ON public.lesson_videos (lesson_id)
    WHERE is_primary AND deleted_at IS NULL;

-- =====================================================================
-- lesson_pdfs
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.lesson_pdfs (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id      uuid NOT NULL REFERENCES public.lessons (id) ON DELETE CASCADE,
    storage_path   text NOT NULL UNIQUE CHECK (length(btrim(storage_path)) > 0),
    original_name  text NOT NULL CHECK (length(btrim(original_name)) > 0),
    size_bytes     bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
    mime_type      text NOT NULL DEFAULT 'application/pdf',
    is_primary     boolean NOT NULL DEFAULT true,
    is_ready       boolean NOT NULL DEFAULT false,
    deleted_at     timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_pdfs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.lesson_pdfs IS 'PDFs attached to lessons (Supabase Storage-backed). Exactly one non-deleted primary per lesson. Direct SELECT by students returns metadata only; content requires a signed URL.';

CREATE INDEX IF NOT EXISTS idx_lesson_pdfs_lesson ON public.lesson_pdfs (lesson_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_pdfs_primary
    ON public.lesson_pdfs (lesson_id)
    WHERE is_primary AND deleted_at IS NULL;

-- =====================================================================
-- progress
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.progress (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id        uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    lesson_id         uuid NOT NULL REFERENCES public.lessons (id) ON DELETE CASCADE,
    video_id          uuid REFERENCES public.lesson_videos (id) ON DELETE SET NULL,
    position_seconds  integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
    percent_completed numeric(5, 2) NOT NULL DEFAULT 0 CHECK (percent_completed BETWEEN 0 AND 100),
    is_completed      boolean NOT NULL DEFAULT false,
    last_watched_at   timestamptz,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (student_id, lesson_id)
);

ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.progress IS 'Per-student per-lesson progress. video_id NULL is valid: PDF-only lessons pin progress to the lesson (binding B4). Writes only via upsert_progress.';

CREATE INDEX IF NOT EXISTS idx_progress_lesson ON public.progress (lesson_id);

-- =====================================================================
-- notifications
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    type        public.notification_type NOT NULL,
    title       text NOT NULL CHECK (length(btrim(title)) > 0),
    body        text,
    dedup_key   text UNIQUE,
    is_read     boolean NOT NULL DEFAULT false,
    read_at     timestamptz,
    entity_type text,
    entity_id   uuid,
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.notifications IS 'In-app notifications. Immutable except read state; mark-read only via mark_notification_read / mark_all_notifications_read (binding B2).';

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, is_read, created_at DESC);

-- =====================================================================
-- audit_logs
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
    actor_role  public.user_role,
    action      text NOT NULL CHECK (length(btrim(action)) > 0),
    entity_type text NOT NULL CHECK (length(btrim(entity_type)) > 0),
    entity_id   uuid,
    metadata    jsonb,
    ip_address  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.audit_logs IS 'Immutable audit trail: insert-only (trigger/system), admin-only SELECT, no UPDATE/DELETE. Metadata never contains phone or address values.';

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action  ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity  ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor   ON public.audit_logs (actor_id);

-- =====================================================================
-- app_settings
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    description text,
    updated_by  uuid REFERENCES public.profiles (id),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.app_settings IS 'Key/value application settings (platform_name, whatsapp_number, whatsapp_default_message, expiry_warning_days, ...).';

-- ---------------------------------------------------------------------
-- set_updated_at is created in 0004 and attached to every table with an
-- updated_at column: profiles, grades, pricing_plans, units, lessons,
-- lesson_videos, lesson_pdfs, progress, app_settings (per DATABASE.md
-- section 7 - subscriptions/notifications/code_redemptions/audit_logs
-- carry no updated_at).
-- ---------------------------------------------------------------------

-- =====================================================================
-- >>> included from migrations\0003_functions_role_helpers.sql
-- =====================================================================

-- =====================================================================
-- 0003_functions_role_helpers
-- Phase 1 | Supabase Foundation | Database
-- Role helper functions, the can_access_lesson gate, and the public
-- settings surface. Reference: SECURITY.md sections 3-4, 6; DATABASE.md
-- section 6.2.
-- =====================================================================

-- ---------------------------------------------------------------------
-- get_current_role()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.role
    FROM public.profiles p
    WHERE p.id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_current_role() IS 'Current role of the authenticated caller (NULL when unauthenticated/unknown). Internal helper - no client grants.';

-- ---------------------------------------------------------------------
-- is_admin() / is_mr_walid() / is_student()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.is_mr_walid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT role = 'mr_walid' FROM public.profiles WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.is_student()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((
        SELECT role = 'student'
        FROM public.profiles
        WHERE id = auth.uid()
          AND status = 'active'
          AND deleted_at IS NULL
    ), false);
$$;

COMMENT ON FUNCTION public.is_student() IS 'Student + status active + not deleted. Returns false for disabled/deleted accounts -> every student-scoped gate closes instantly (A34/MED-9). Internal helper - no client grants.';

-- ---------------------------------------------------------------------
-- can_access_lesson(p_lesson_id)
-- The single content-access gate (SECURITY.md section 4).
-- Returns true IFF:
--   is_student() (active, not deleted, role student)
--   AND lesson exists AND lesson.status = 'published' AND lesson.deleted_at IS NULL
--   AND its unit is 'published' AND unit.deleted_at IS NULL
--   AND unit.grade_id = (current profile grade, evaluated live - H5)
--   AND grades.is_active AND grades.deleted_at IS NULL  [BINDING B8:
--       grade deactivation and soft-delete are equivalent - both fully
--       close the content gate for every lesson of that grade]
--   AND EXISTS an active subscription (status='active' AND expires_at > now())
--       -- subscriptions are NOT grade-bound (A33)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_lesson(p_lesson_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN false;
    END IF;
    RETURN
        is_student()
        AND EXISTS (
            SELECT 1
            FROM public.lessons l
            JOIN public.units u ON u.id = l.unit_id
            JOIN public.grades g ON g.id = u.grade_id
            WHERE l.id = p_lesson_id
              AND l.status = 'published'
              AND l.deleted_at IS NULL
              AND u.status = 'published'
              AND u.deleted_at IS NULL
              AND u.grade_id = (SELECT p.grade_id FROM public.profiles p WHERE p.id = v_uid)
              AND g.is_active
              AND g.deleted_at IS NULL
        )
        AND EXISTS (
            SELECT 1
            FROM public.subscriptions s
            WHERE s.student_id = v_uid
              AND s.status = 'active'
              AND s.expires_at > now()
        );
END $$;

COMMENT ON FUNCTION public.can_access_lesson(uuid) IS 'Single access gate: student + published lesson/unit + live grade match + active & non-deleted grade (B8) + any active subscription (A33). Internal - no client grants.';

-- ---------------------------------------------------------------------
-- get_public_settings()
-- Public surface for the landing page: whatsapp_number,
-- whatsapp_default_message, platform_name ONLY (LOW-15).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_object_agg(s.key, s.value)
    FROM public.app_settings s
    WHERE s.key IN ('whatsapp_number', 'whatsapp_default_message', 'platform_name');
$$;

COMMENT ON FUNCTION public.get_public_settings() IS 'Anon-safe settings surface; returns only whatsapp_number, whatsapp_default_message, platform_name.';

-- =====================================================================
-- >>> included from migrations\0004_triggers_auth_gates.sql
-- =====================================================================

-- =====================================================================
-- 0004_triggers_auth_gates
-- Phase 1 | Supabase Foundation | Database
-- Trigger functions + triggers for auth gates, updated_at maintenance,
-- and primary-asset guards. Reference: DATABASE.md sections 4, 6.2, 7.
-- =====================================================================

-- ---------------------------------------------------------------------
-- handle_new_user()
-- AFTER INSERT on auth.users. Creates the profiles row from
-- raw_user_meta_data. Reads ONLY full_name, phone, guardian_phone,
-- address; IGNORES any student-supplied grade_id (forced NULL - HIGH-1);
-- fails closed (raises) when a required meta field is missing (LOW-12,
-- binding B10).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
    v_full_name text;
    v_phone text;
    v_guardian_phone text;
    v_address text;
BEGIN
    v_full_name      := NULLIF(btrim(v_meta ->> 'full_name'), '');
    v_phone          := NULLIF(btrim(v_meta ->> 'phone'), '');
    v_guardian_phone := NULLIF(btrim(v_meta ->> 'guardian_phone'), '');
    v_address        := NULLIF(btrim(v_meta ->> 'address'), '');

    IF v_full_name IS NULL OR v_phone IS NULL
       OR v_guardian_phone IS NULL OR v_address IS NULL THEN
        RAISE EXCEPTION 'profile_meta_required'
            USING HINT = 'raw_user_meta_data must contain full_name, phone, guardian_phone and address';
    END IF;

    INSERT INTO public.profiles (id, full_name, phone, guardian_phone, address, grade_id)
    VALUES (NEW.id, v_full_name, v_phone, v_guardian_phone, v_address, NULL);

    RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- block_email_change()
-- BEFORE UPDATE on auth.users (WHEN email differs). Email is immutable;
-- raises otherwise. Never fires on INSERT (S6/A13).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'email_change_forbidden';
END $$;

-- ---------------------------------------------------------------------
-- block_sign_in_for_inactive_accounts()
-- BEFORE UPDATE OF last_sign_in_at on auth.users. Authoritative sign-in
-- gate (A32/A34): disabled or soft-deleted accounts cannot sign in.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_sign_in_for_inactive_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = NEW.id
          AND (deleted_at IS NOT NULL OR status <> 'active')
    ) THEN
        RAISE EXCEPTION 'account_inactive_or_deleted';
    END IF;
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- set_updated_at()
-- BEFORE UPDATE on every table carrying updated_at.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- primary-asset guards (binding B9)
-- A soft-deleted primary video/PDF releases the primary slot in the
-- SAME transaction: the BEFORE UPDATE trigger clears is_primary so the
-- partial unique index (lesson_id) WHERE is_primary AND deleted_at IS
-- NULL never blocks soft-deletion of a primary asset.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_primary_on_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        NEW.is_primary := false;
    END IF;
    RETURN NEW;
END $$;

-- =====================================================================
-- Trigger attachments
-- =====================================================================

DROP TRIGGER IF EXISTS handle_new_user ON auth.users;
CREATE TRIGGER handle_new_user
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS block_email_change ON auth.users;
CREATE TRIGGER block_email_change
    BEFORE UPDATE ON auth.users
    FOR EACH ROW
    WHEN (OLD.email IS DISTINCT FROM NEW.email)
    EXECUTE FUNCTION public.block_email_change();

DROP TRIGGER IF EXISTS block_sign_in_for_inactive_accounts ON auth.users;
CREATE TRIGGER block_sign_in_for_inactive_accounts
    BEFORE UPDATE OF last_sign_in_at ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.block_sign_in_for_inactive_accounts();

-- set_updated_at on the 9 tables that carry updated_at
DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'profiles', 'grades', 'pricing_plans', 'units', 'lessons',
        'lesson_videos', 'lesson_pdfs', 'progress', 'app_settings'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', v_table);
        EXECUTE format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
            v_table
        );
    END LOOP;
END$$;

-- primary-asset guards
DROP TRIGGER IF EXISTS clear_primary_on_soft_delete ON public.lesson_videos;
CREATE TRIGGER clear_primary_on_soft_delete
    BEFORE UPDATE ON public.lesson_videos
    FOR EACH ROW EXECUTE FUNCTION public.clear_primary_on_soft_delete();

DROP TRIGGER IF EXISTS clear_primary_on_soft_delete ON public.lesson_pdfs;
CREATE TRIGGER clear_primary_on_soft_delete
    BEFORE UPDATE ON public.lesson_pdfs
    FOR EACH ROW EXECUTE FUNCTION public.clear_primary_on_soft_delete();

-- =====================================================================
-- >>> included from migrations\0005_audit_trigger_and_internal_functions.sql
-- =====================================================================

-- =====================================================================
-- 0005_audit_trigger_and_internal_functions
-- Phase 1 | Supabase Foundation | Database
-- audit_log() internal function + generic audit_trigger() attached to
-- the fixed 10-table inventory (MED-8). progress and notifications are
-- explicitly excluded. PII values (phone, guardian_phone, address) are
-- never written into audit metadata.
-- =====================================================================

-- ---------------------------------------------------------------------
-- audit_log(action, entity_type, entity_id, metadata)
-- Internal function - no client grants. Called by SECURITY DEFINER RPCs
-- and by audit_trigger(). actor_id NULL = system job.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_log(
    p_action text,
    p_entity_type text,
    p_entity_id uuid DEFAULT NULL,
    p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_role public.user_role := public.get_current_role();
    v_ip text;
BEGIN
    v_ip := NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';

    INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata, ip_address)
    VALUES (v_actor, v_role, p_action, p_entity_type, p_entity_id, p_metadata, v_ip);
END $$;

COMMENT ON FUNCTION public.audit_log(text, text, uuid, jsonb) IS 'Internal audit writer; no client grants. Never records PII values.';

-- ---------------------------------------------------------------------
-- audit_trigger()
-- AFTER INSERT/UPDATE/DELETE on the fixed inventory. Records the
-- actor, the action (table.operation), changed column names only for
-- UPDATEs, and old/new snapshots minus sensitive columns.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_changed text[];
    v_old jsonb;
    v_new jsonb;
    v_action text;
    v_entity_id uuid;
    v_metadata jsonb;
    v_sensitive text[] := '{}'::text[];
    v_ip text;
BEGIN
    IF TG_TABLE_NAME = 'profiles' THEN
        v_sensitive := ARRAY['phone', 'guardian_phone', 'address'];
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old := to_jsonb(OLD) - v_sensitive;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new := to_jsonb(NEW) - v_sensitive;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        SELECT COALESCE(array_agg(key), '{}'::text[]) INTO v_changed
        FROM (
            SELECT key
            FROM jsonb_each(to_jsonb(OLD)) o
            FULL OUTER JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
            WHERE o.value IS DISTINCT FROM n.value
        ) d;
    END IF;

    v_action := TG_TABLE_NAME || '.' || lower(TG_OP);
    -- app_settings is a key/value table without an id column.
    IF TG_TABLE_NAME = 'app_settings' THEN
        v_entity_id := NULL;
    ELSE
        v_entity_id := COALESCE(NEW.id, OLD.id);
    END IF;

    v_metadata := '{}'::jsonb;
    IF TG_OP = 'INSERT' THEN
        v_metadata := jsonb_build_object('new', v_new);
    ELSIF TG_OP = 'UPDATE' THEN
        v_metadata := jsonb_build_object('old', v_old, 'new', v_new, 'changed_fields', to_jsonb(v_changed));
    ELSE
        v_metadata := jsonb_build_object('old', v_old);
    END IF;

    v_ip := NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';

    INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata, ip_address)
    VALUES (auth.uid(), public.get_current_role(), v_action, TG_TABLE_NAME, v_entity_id, v_metadata, v_ip);

    RETURN COALESCE(NEW, OLD);
END $$;

-- ---------------------------------------------------------------------
-- Attach audit_trigger to the fixed 10-table inventory (MED-8).
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'profiles', 'grades', 'units', 'lessons', 'lesson_videos',
        'lesson_pdfs', 'pricing_plans', 'subscriptions',
        'subscription_codes', 'app_settings'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON public.%I', v_table);
        EXECUTE format(
            'CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()',
            v_table
        );
    END LOOP;
END$$;

-- =====================================================================
-- >>> included from migrations\0006_rpc_student_self_service.sql
-- =====================================================================

-- =====================================================================
-- 0006_rpc_student_self_service
-- Phase 1 | Supabase Foundation | Database
-- Client-callable student self-service RPCs (allowlist entries).
-- Reference: DATABASE.md section 6.3; SECURITY.md sections 10-11.
-- =====================================================================

-- ---------------------------------------------------------------------
-- update_own_profile(p_full_name, p_phone, p_guardian_phone, p_address)
-- SECURITY DEFINER; whitelisted to the 4 editable columns only; audit
-- logs PII deltas as changed column NAMES only (never values - MED-8).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_own_profile(
    p_full_name text,
    p_phone text,
    p_guardian_phone text,
    p_address text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_changed text[] := '{}'::text[];
    v_full_name text;
    v_phone text;
    v_guardian_phone text;
    v_address text;
BEGIN
    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT full_name, phone, guardian_phone, address
    INTO v_full_name, v_phone, v_guardian_phone, v_address
    FROM public.profiles WHERE id = v_uid;

    IF btrim(COALESCE(p_full_name, '')) IS DISTINCT FROM v_full_name THEN
        v_changed := array_append(v_changed, 'full_name');
    END IF;
    IF btrim(COALESCE(p_phone, '')) IS DISTINCT FROM v_phone THEN
        v_changed := array_append(v_changed, 'phone');
    END IF;
    IF btrim(COALESCE(p_guardian_phone, '')) IS DISTINCT FROM v_guardian_phone THEN
        v_changed := array_append(v_changed, 'guardian_phone');
    END IF;
    IF btrim(COALESCE(p_address, '')) IS DISTINCT FROM v_address THEN
        v_changed := array_append(v_changed, 'address');
    END IF;

    UPDATE public.profiles
    SET full_name = btrim(p_full_name),
        phone = btrim(p_phone),
        guardian_phone = btrim(p_guardian_phone),
        address = btrim(p_address)
    WHERE id = v_uid;

    IF array_length(v_changed, 1) > 0 THEN
        PERFORM public.audit_log('profile.update_own', 'profile', v_uid,
            jsonb_build_object('changed_fields', to_jsonb(v_changed)));
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- redeem_subscription_code(p_code) RETURNS uuid
-- Atomic redemption (SECURITY.md section 10.1): advisory lock per code
-- + FOR UPDATE + in-transaction re-validation + UNIQUE backstop.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_subscription_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code text := upper(btrim(p_code));
    v_student uuid := auth.uid();
    v_code_row public.subscription_codes%ROWTYPE;
    v_plan public.pricing_plans%ROWTYPE;
    v_grade_id uuid;
    v_sub_id uuid;
    v_expires timestamptz;
    v_warning_days int;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('wldn_redeem:' || lower(v_code)));

    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT * INTO v_code_row
    FROM public.subscription_codes
    WHERE code = v_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'code_not_found';
    END IF;

    IF v_code_row.status = 'used' THEN
        RAISE EXCEPTION 'code_already_used';
    END IF;
    IF v_code_row.status = 'revoked' THEN
        RAISE EXCEPTION 'code_revoked';
    END IF;

    SELECT grade_id INTO v_grade_id FROM public.profiles WHERE id = v_student;
    IF v_grade_id IS NULL THEN
        RAISE EXCEPTION 'no_grade_assigned';
    END IF;

    SELECT * INTO v_plan FROM public.pricing_plans WHERE id = v_code_row.pricing_plan_id;
    IF NOT FOUND OR NOT v_plan.is_active THEN
        RAISE EXCEPTION 'plan_not_available';
    END IF;
    -- BINDING B8: a plan on a grade that is inactive or soft-deleted is
    -- not purchasable (grade deactivation = soft-delete equivalent).
    IF NOT EXISTS (
        SELECT 1 FROM public.grades
        WHERE id = v_plan.grade_id AND is_active AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'plan_not_available';
    END IF;
    IF v_plan.grade_id <> v_grade_id THEN
        RAISE EXCEPTION 'plan_grade_mismatch';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE student_id = v_student AND status = 'active' AND expires_at > now()
    ) THEN
        RAISE EXCEPTION 'student_has_active_subscription';
    END IF;

    v_expires := now() + (v_plan.duration_days || ' days')::interval;

    UPDATE public.subscription_codes
    SET status = 'used', used_at = now(), used_by = v_student
    WHERE id = v_code_row.id;

    INSERT INTO public.subscriptions (
        student_id, pricing_plan_id, base_price, platform_fee, total_price,
        code_id, source, started_at, expires_at, status
    )
    VALUES (
        v_student, v_plan.id, v_plan.base_price, v_plan.platform_fee, v_plan.total_price,
        v_code_row.id, 'code', now(), v_expires, 'active'
    )
    RETURNING id INTO v_sub_id;

    INSERT INTO public.code_redemptions (code_id, student_id, subscription_id)
    VALUES (v_code_row.id, v_student, v_sub_id);

    -- Activation notification (deduped).
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    VALUES (v_student, 'subscription_activated', 'تم تفعيل اشتراكك', NULL,
            'sub_activated:' || v_sub_id, 'subscription', v_sub_id)
    ON CONFLICT (dedup_key) DO NOTHING;

    -- 7-day warning in the same transaction when the plan already fits
    -- inside the warning window (BLUEPRINT M7).
    v_warning_days := COALESCE(
        (SELECT (value #>> '{}')::int FROM public.app_settings WHERE key = 'expiry_warning_days'),
        7
    );
    IF v_expires <= now() + (v_warning_days || ' days')::interval THEN
        INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
        VALUES (v_student, 'subscription_expiring', 'اشتراكك يقترب من الانتهاء', NULL,
                'sub_expiring:' || v_sub_id, 'subscription', v_sub_id)
        ON CONFLICT (dedup_key) DO NOTHING;
    END IF;

    PERFORM public.audit_log('code.redeem', 'subscription', v_sub_id,
        jsonb_build_object('code', v_code, 'plan_id', v_plan.id, 'code_id', v_code_row.id));

    RETURN v_sub_id;
END $$;

-- ---------------------------------------------------------------------
-- get_my_subscriptions() / get_my_current_subscription()
-- Own rows only; RLS (student_id = auth.uid()) scopes them.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_subscriptions()
RETURNS SETOF public.subscriptions
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT * FROM public.subscriptions
    WHERE student_id = auth.uid()
    ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_my_current_subscription()
RETURNS public.subscriptions
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT * FROM public.subscriptions
    WHERE student_id = auth.uid()
      AND status = 'active'
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- upsert_progress(p_lesson_id, p_position_seconds, p_percent)
-- SECURITY DEFINER. Guard: is_student() + can_access_lesson().
-- Single atomic INSERT ... ON CONFLICT (student_id, lesson_id) DO UPDATE
-- (HIGH-3: no SELECT ... FOR UPDATE, so two concurrent first-writes for
-- the same (student, lesson) both succeed - whichever commits last wins
-- the position, and both arrive at the same merged state because the
-- update is a pure function of the previous row):
--   * percent_completed monotonic (GREATEST, clamped 0..100)   - A24/A12
--   * is_completed irreversible (OR with percent >= 90)        - A12
--   * position_seconds last-write-wins, clamped >= 0           - A26
--   * video_id = live primary (ready, not deleted); EXCLUDED.video_id
--     can never overwrite a valid pinned video (B4). If no primary
--     exists, the existing video_id is preserved (keeps any previously
--     pinned replacement video); a NULL video_id is only ever written
--     on a first insert.
-- Stale-video rejection happens BEFORE the write, against the CURRENT
-- primary video, so a concurrent replacement is always seen (HIGH-2).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_progress(
    p_lesson_id uuid,
    p_position_seconds integer DEFAULT 0,
    p_percent numeric DEFAULT 0
)
RETURNS public.progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student uuid := auth.uid();
    v_video uuid;
    v_pos int := GREATEST(0, COALESCE(p_position_seconds, 0));
    v_pct numeric(5,2) := LEAST(100, GREATEST(0, COALESCE(p_percent, 0)));
    v_result public.progress%ROWTYPE;
BEGIN
    IF NOT public.is_student() OR NOT public.can_access_lesson(p_lesson_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT id INTO v_video
    FROM public.lesson_videos
    WHERE lesson_id = p_lesson_id
      AND is_primary AND deleted_at IS NULL AND status = 'ready'
    ORDER BY sort_order, id
    LIMIT 1;

    -- BINDING B4 (HIGH-2): reject stale-video writes against the current
    -- primary BEFORE mutating anything.
    IF v_video IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.progress
            WHERE student_id = v_student
              AND lesson_id = p_lesson_id
              AND video_id IS NOT NULL
              AND video_id <> v_video
        ) THEN
            RAISE EXCEPTION 'progress_stale_video';
        END IF;
    END IF;

    INSERT INTO public.progress AS p (
        student_id, lesson_id, video_id, position_seconds,
        percent_completed, is_completed, last_watched_at
    )
    VALUES (
        v_student, p_lesson_id, v_video, v_pos, v_pct,
        v_pct >= 90, now()
    )
    ON CONFLICT (student_id, lesson_id) DO UPDATE
    SET position_seconds = v_pos,
        percent_completed = GREATEST(p.percent_completed, v_pct),
        is_completed = p.is_completed OR GREATEST(p.percent_completed, v_pct) >= 90,
        video_id = CASE
                       WHEN v_video IS NULL THEN p.video_id
                       ELSE v_video
                   END,
        last_watched_at = now()
    RETURNING * INTO v_result;

    RETURN v_result;
END $$;

-- ---------------------------------------------------------------------
-- mark_notification_read / mark_all_notifications_read
-- The ONLY paths that mutate notification read state (binding B2).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.notifications
    SET is_read = true, read_at = COALESCE(read_at, now())
    WHERE id = p_notification_id AND user_id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.notifications
    SET is_read = true, read_at = now()
    WHERE user_id = auth.uid() AND NOT is_read;
END $$;

-- =====================================================================
-- >>> included from migrations\0007_rpc_staff.sql
-- =====================================================================

-- =====================================================================
-- 0007_rpc_staff
-- Phase 1 | Supabase Foundation | Database
-- Client-callable staff RPCs (mr_walid/admin), all SECURITY DEFINER +
-- audited unless noted. Reference: DATABASE.md section 6.4.
-- =====================================================================

-- ---------------------------------------------------------------------
-- set_user_role(p_user_id, p_role)
-- admin-only; THE ONLY path that mutates role.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role public.user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old public.user_role;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT role INTO v_old FROM public.profiles WHERE id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;

    UPDATE public.profiles SET role = p_role WHERE id = p_user_id;

    PERFORM public.audit_log('user.role_change', 'profile', p_user_id,
        jsonb_build_object('old_role', v_old, 'new_role', p_role));
END $$;

-- ---------------------------------------------------------------------
-- set_student_grade(p_student_id, p_grade_id)
-- Staff-only grade assignment; grade must exist, be active and not
-- soft-deleted; target must be a student profile.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_student_grade(p_student_id uuid, p_grade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old uuid;
    v_role public.user_role;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT role, grade_id INTO v_role, v_old FROM public.profiles WHERE id = p_student_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;
    IF v_role <> 'student' THEN
        RAISE EXCEPTION 'not_a_student';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.grades WHERE id = p_grade_id AND is_active AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'grade_not_available';
    END IF;

    UPDATE public.profiles SET grade_id = p_grade_id WHERE id = p_student_id;

    PERFORM public.audit_log('student.grade_change', 'profile', p_student_id,
        jsonb_build_object('old_grade_id', v_old, 'new_grade_id', p_grade_id));
END $$;

-- ---------------------------------------------------------------------
-- Session revocation (LOW-18 spike outcome): DELETE FROM auth.sessions is
-- attempted only when the table exists (hosted Supabase). On the local
-- harness (no sessions table) the call is skipped; the fallback remains
-- the sign-in gate + RLS + Edge Function checks (binding B10).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_sessions_if_possible(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'auth' AND table_name = 'sessions'
    ) THEN
        DELETE FROM auth.sessions WHERE user_id = p_user_id;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- disable_student / enable_student
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disable_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.profiles
    SET status = 'disabled'
    WHERE id = p_student_id AND role = 'student' AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.revoke_sessions_if_possible(p_student_id);
    PERFORM public.audit_log('student.disable', 'profile', p_student_id);
END $$;

CREATE OR REPLACE FUNCTION public.enable_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.profiles
    SET status = 'active'
    WHERE id = p_student_id AND role = 'student' AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.audit_log('student.enable', 'profile', p_student_id);
END $$;

-- ---------------------------------------------------------------------
-- soft_delete_student / restore_student
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.profiles
    SET deleted_at = now(), status = 'disabled'
    WHERE id = p_student_id AND role = 'student';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.revoke_sessions_if_possible(p_student_id);
    PERFORM public.audit_log('student.soft_delete', 'profile', p_student_id);
END $$;

CREATE OR REPLACE FUNCTION public.restore_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.profiles
    SET deleted_at = NULL, status = 'active'
    WHERE id = p_student_id AND role = 'student';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.audit_log('student.restore', 'profile', p_student_id);
END $$;

-- ---------------------------------------------------------------------
-- update_student_profile (binding B3)
-- mr_walid/admin; strict 4-column whitelist; role/grade/status/deleted_at
-- can never be touched; audited. Target must be a STUDENT profile
-- (MEDIUM-4: mirrors disable_student/set_student_grade - an admin's or
-- mr_walid's own profile is out of scope and raises target_not_student).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_student_profile(
    p_student_id uuid,
    p_full_name text,
    p_phone text,
    p_guardian_phone text,
    p_address text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_changed text[] := '{}'::text[];
    v_full_name text;
    v_phone text;
    v_guardian_phone text;
    v_address text;
    v_role text;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT full_name, phone, guardian_phone, address, role
    INTO v_full_name, v_phone, v_guardian_phone, v_address, v_role
    FROM public.profiles WHERE id = p_student_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    IF v_role <> 'student' THEN
        RAISE EXCEPTION 'target_not_student';
    END IF;

    IF btrim(COALESCE(p_full_name, '')) IS DISTINCT FROM v_full_name THEN
        v_changed := array_append(v_changed, 'full_name');
    END IF;
    IF btrim(COALESCE(p_phone, '')) IS DISTINCT FROM v_phone THEN
        v_changed := array_append(v_changed, 'phone');
    END IF;
    IF btrim(COALESCE(p_guardian_phone, '')) IS DISTINCT FROM v_guardian_phone THEN
        v_changed := array_append(v_changed, 'guardian_phone');
    END IF;
    IF btrim(COALESCE(p_address, '')) IS DISTINCT FROM v_address THEN
        v_changed := array_append(v_changed, 'address');
    END IF;

    UPDATE public.profiles
    SET full_name = btrim(p_full_name),
        phone = btrim(p_phone),
        guardian_phone = btrim(p_guardian_phone),
        address = btrim(p_address)
    WHERE id = p_student_id;

    PERFORM public.audit_log('student.profile_update', 'profile', p_student_id,
        jsonb_build_object('changed_fields', to_jsonb(v_changed)));
END $$;

-- ---------------------------------------------------------------------
-- list_trash() -- soft-deleted students, staff only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_trash()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT * FROM public.profiles
    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC;
$$;

-- ---------------------------------------------------------------------
-- create_manual_subscription (bindings B6, B10)
-- Staff-created subscription with a price snapshot copied from the plan;
-- p_notes lands in audit metadata; no grade requirement.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_manual_subscription(
    p_student_id uuid,
    p_plan_id uuid,
    p_started_at timestamptz,
    p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan public.pricing_plans%ROWTYPE;
    v_sub_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_student_id AND role = 'student') THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    SELECT * INTO v_plan FROM public.pricing_plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'plan_not_found';
    END IF;

    INSERT INTO public.subscriptions (
        student_id, pricing_plan_id, base_price, platform_fee, total_price,
        source, started_at, expires_at, status
    )
    VALUES (
        p_student_id, v_plan.id, v_plan.base_price, v_plan.platform_fee,
        v_plan.total_price, 'manual', p_started_at,
        p_started_at + (v_plan.duration_days || ' days')::interval, 'active'
    )
    RETURNING id INTO v_sub_id;

    PERFORM public.audit_log('subscription.create_manual', 'subscription', v_sub_id,
        jsonb_build_object('plan_id', v_plan.id, 'notes', p_notes));

    RETURN v_sub_id;
END $$;

-- ---------------------------------------------------------------------
-- generate_codes_internal(p_plan_id, p_count, p_note)
-- SECURITY DEFINER; called by Edge Function only - NO client grants.
-- Secure random codes via gen_random_bytes, unambiguous charset (A22).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_codes_internal(
    p_plan_id uuid,
    p_count integer,
    p_note text DEFAULT NULL
)
RETURNS SETOF public.subscription_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_actor uuid := COALESCE(auth.uid(), NULLIF(current_setting('app.system_actor_id', true), '')::uuid);
    v_plan_exists boolean;
    v_code text;
    v_attempt int;
    v_inserted int := 0;
    v_byte bytea;
    v_row public.subscription_codes%ROWTYPE;
BEGIN
    IF p_count < 1 OR p_count > 500 THEN
        RAISE EXCEPTION 'invalid_count';
    END IF;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'system_actor_required';
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.pricing_plans WHERE id = p_plan_id) INTO v_plan_exists;
    IF NOT v_plan_exists THEN
        RAISE EXCEPTION 'plan_not_found';
    END IF;

    v_attempt := 0;
    WHILE v_inserted < p_count AND v_attempt < p_count * 5 LOOP
        v_attempt := v_attempt + 1;
        v_byte := gen_random_bytes(12);
        v_code := 'WLDN-'
            || substr(v_chars, get_byte(v_byte, 0) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 1) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 2) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 3) % 32 + 1, 1)
            || '-'
            || substr(v_chars, get_byte(v_byte, 4) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 5) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 6) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 7) % 32 + 1, 1)
            || '-'
            || substr(v_chars, get_byte(v_byte, 8) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 9) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 10) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 11) % 32 + 1, 1);

        BEGIN
            INSERT INTO public.subscription_codes (code, pricing_plan_id, created_by, note)
            VALUES (v_code, p_plan_id, v_actor, p_note)
            RETURNING * INTO v_row;
            v_inserted := v_inserted + 1;
            RETURN NEXT v_row;
        EXCEPTION WHEN unique_violation THEN
            NULL;
        END;
    END LOOP;

    IF v_inserted < p_count THEN
        RAISE EXCEPTION 'generation_failed';
    END IF;

    RETURN;
END $$;

-- ---------------------------------------------------------------------
-- revoke_subscription_code(p_code_id)
-- available/used -> revoked; does NOT cancel the created subscription
-- (A29).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_subscription_code(p_code_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prev public.code_status;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT status INTO v_prev FROM public.subscription_codes WHERE id = p_code_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'code_not_found';
    END IF;

    UPDATE public.subscription_codes
    SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
    WHERE id = p_code_id AND status IN ('available', 'used');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'code_not_revocable';
    END IF;

    PERFORM public.audit_log('code.revoke', 'subscription_code', p_code_id,
        jsonb_build_object('previous_status', v_prev));
END $$;

-- ---------------------------------------------------------------------
-- Grade lifecycle (soft delete; binding B8 semantics)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_grade(p_grade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.grades SET deleted_at = now() WHERE id = p_grade_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'grade_not_found';
    END IF;

    PERFORM public.audit_log('grade.delete', 'grade', p_grade_id);
END $$;

CREATE OR REPLACE FUNCTION public.restore_grade(p_grade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.grades SET deleted_at = NULL WHERE id = p_grade_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'grade_not_found';
    END IF;

    PERFORM public.audit_log('grade.restore', 'grade', p_grade_id);
END $$;

-- ---------------------------------------------------------------------
-- Unit lifecycle
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_unit(p_grade_id uuid, p_name text, p_sort_order integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    INSERT INTO public.units (grade_id, name, sort_order) VALUES (p_grade_id, btrim(p_name), p_sort_order)
    RETURNING id INTO v_id;

    PERFORM public.audit_log('unit.create', 'unit', v_id, jsonb_build_object('grade_id', p_grade_id));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_unit(p_unit_id uuid, p_name text, p_sort_order integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.units
    SET name = COALESCE(btrim(NULLIF(p_name, '')), name),
        sort_order = COALESCE(p_sort_order, sort_order)
    WHERE id = p_unit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    PERFORM public.audit_log('unit.update', 'unit', p_unit_id);
END $$;

CREATE OR REPLACE FUNCTION public.delete_unit(p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.units SET deleted_at = now() WHERE id = p_unit_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    PERFORM public.audit_log('unit.delete', 'unit', p_unit_id);
END $$;

CREATE OR REPLACE FUNCTION public.restore_unit(p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.units SET deleted_at = NULL WHERE id = p_unit_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    PERFORM public.audit_log('unit.restore', 'unit', p_unit_id);
END $$;

-- ---------------------------------------------------------------------
-- Lesson lifecycle
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_lesson(p_unit_id uuid, p_title text, p_description text DEFAULT NULL, p_sort_order integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    INSERT INTO public.lessons (unit_id, title, description, sort_order)
    VALUES (p_unit_id, btrim(p_title), p_description, p_sort_order)
    RETURNING id INTO v_id;

    PERFORM public.audit_log('lesson.create', 'lesson', v_id, jsonb_build_object('unit_id', p_unit_id));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_lesson(p_lesson_id uuid, p_title text, p_description text DEFAULT NULL, p_sort_order integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons
    SET title = COALESCE(btrim(NULLIF(p_title, '')), title),
        description = COALESCE(p_description, description),
        sort_order = COALESCE(p_sort_order, sort_order)
    WHERE id = p_lesson_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.update', 'lesson', p_lesson_id);
END $$;

CREATE OR REPLACE FUNCTION public.publish_lesson(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons
    SET status = 'published', published_at = now()
    WHERE id = p_lesson_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.publish', 'lesson', p_lesson_id);
    PERFORM public.notify_new_content(p_lesson_id);
END $$;

CREATE OR REPLACE FUNCTION public.hide_lesson(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons SET status = 'hidden' WHERE id = p_lesson_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.hide', 'lesson', p_lesson_id);
END $$;

CREATE OR REPLACE FUNCTION public.soft_delete_lesson(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons SET deleted_at = now() WHERE id = p_lesson_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.soft_delete', 'lesson', p_lesson_id);
END $$;

CREATE OR REPLACE FUNCTION public.restore_lesson(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons SET deleted_at = NULL WHERE id = p_lesson_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.restore', 'lesson', p_lesson_id);
END $$;

-- ---------------------------------------------------------------------
-- set_app_setting(p_key, p_value)
-- mr_walid: whatsapp% keys only; admin: all.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_app_setting(p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.is_admin() THEN
        NULL;
    ELSIF public.is_mr_walid() AND p_key LIKE 'whatsapp%' THEN
        NULL;
    ELSE
        RAISE EXCEPTION 'access_denied';
    END IF;

    INSERT INTO public.app_settings (key, value, updated_by, updated_at)
    VALUES (p_key, p_value, auth.uid(), now())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

    PERFORM public.audit_log('app_setting.update', 'app_setting', NULL,
        jsonb_build_object('key', p_key));
END $$;

-- ---------------------------------------------------------------------
-- set_pricing_plan (admin only + audit)
-- Upsert on (grade_id, duration_days).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_pricing_plan(
    p_grade_id uuid,
    p_duration_days integer,
    p_base_price numeric,
    p_platform_fee numeric,
    p_is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF p_base_price < 0 OR p_platform_fee < 0 OR p_duration_days <= 0 THEN
        RAISE EXCEPTION 'invalid_plan_values';
    END IF;

    INSERT INTO public.pricing_plans (grade_id, duration_days, base_price, platform_fee, total_price, is_active)
    VALUES (p_grade_id, p_duration_days, p_base_price, p_platform_fee, p_base_price + p_platform_fee, p_is_active)
    ON CONFLICT (grade_id, duration_days) DO UPDATE
    SET base_price = EXCLUDED.base_price,
        platform_fee = EXCLUDED.platform_fee,
        total_price = EXCLUDED.total_price,
        is_active = EXCLUDED.is_active
    RETURNING id INTO v_id;

    PERFORM public.audit_log('pricing.upsert', 'pricing_plan', v_id,
        jsonb_build_object('grade_id', p_grade_id, 'duration_days', p_duration_days));
    RETURN v_id;
END $$;

-- ---------------------------------------------------------------------
-- delete_pricing_plan(p_plan_id) (binding B7)
-- Hard-deletes ONLY unreferenced plans; referenced plans are deactivated
-- (is_active = false) instead; every attempt is audited.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_pricing_plan(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_referenced boolean;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions WHERE pricing_plan_id = p_plan_id
        UNION ALL
        SELECT 1 FROM public.subscription_codes WHERE pricing_plan_id = p_plan_id
    ) INTO v_referenced;

    IF v_referenced THEN
        UPDATE public.pricing_plans SET is_active = false WHERE id = p_plan_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'plan_not_found';
        END IF;
        PERFORM public.audit_log('pricing.delete', 'pricing_plan', p_plan_id,
            jsonb_build_object('deleted', false, 'deactivated', true));
    ELSE
        DELETE FROM public.pricing_plans WHERE id = p_plan_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'plan_not_found';
        END IF;
        PERFORM public.audit_log('pricing.delete', 'pricing_plan', p_plan_id,
            jsonb_build_object('deleted', true));
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- finalize_pdf_upload(p_pdf_id)
-- Marks the PDF ready and PROMOTES it to primary (demoting peers first
-- so the partial unique index is never violated mid-statement).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_pdf_upload(p_pdf_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT lesson_id INTO v_lesson FROM public.lesson_pdfs WHERE id = p_pdf_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'pdf_not_found';
    END IF;

    UPDATE public.lesson_pdfs
    SET is_primary = false
    WHERE lesson_id = v_lesson AND id <> p_pdf_id AND is_primary AND deleted_at IS NULL;

    UPDATE public.lesson_pdfs SET is_ready = true, is_primary = true WHERE id = p_pdf_id;

    PERFORM public.audit_log('pdf.finalize', 'lesson_pdf', p_pdf_id,
        jsonb_build_object('lesson_id', v_lesson));
END $$;

-- =====================================================================
-- >>> included from migrations\0008_rpc_system.sql
-- =====================================================================

-- =====================================================================
-- 0008_rpc_system
-- Phase 1 | Supabase Foundation | Database
-- System functions (internal - NO client grants, MED-6):
-- notify_new_content, expire_subscriptions, set_video_status,
-- recheck_video_states. Reference: DATABASE.md section 6.5.
-- =====================================================================

-- ---------------------------------------------------------------------
-- notify_new_content(p_lesson_id)
-- Deduped fan-out (dedup_key new_content:{lesson_id}:{student_id}, A28);
-- targets ACTIVE subscribers of the lesson's grade only (LOW-19).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_new_content(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_grade uuid;
    v_published boolean;
BEGIN
    SELECT u.grade_id, l.status = 'published'
    INTO v_grade, v_published
    FROM public.lessons l
    JOIN public.units u ON u.id = l.unit_id
    WHERE l.id = p_lesson_id;

    IF NOT FOUND OR NOT v_published THEN
        RETURN;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT p.id, 'new_content', 'محتوى جديد', NULL,
           'new_content:' || p_lesson_id || ':' || p.id,
           'lesson', p_lesson_id
    FROM public.profiles p
    WHERE p.role = 'student'
      AND p.status = 'active'
      AND p.deleted_at IS NULL
      AND p.grade_id = v_grade
      AND EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE s.student_id = p.id
            AND s.status = 'active'
            AND s.expires_at > now()
      )
    ON CONFLICT (dedup_key) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------
-- expire_subscriptions()
-- Idempotent (A7): flips expired labels, emits once-only expiring and
-- expired notifications (dedup ON CONFLICT), audits. Live authority is
-- expires_at > now() regardless of label (A8). Never invoked by
-- SELECT-side triggers (MED-4/R4).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub record;
    v_warning_days int;
BEGIN
    v_warning_days := COALESCE(
        (SELECT (value #>> '{}')::int FROM public.app_settings WHERE key = 'expiry_warning_days'),
        7
    );

    -- 1) Flip expired subscriptions; emit once-only expired notification.
    FOR v_sub IN
        SELECT id, student_id FROM public.subscriptions
        WHERE status = 'active' AND expires_at <= now()
        FOR UPDATE
    LOOP
        UPDATE public.subscriptions SET status = 'expired' WHERE id = v_sub.id;

        INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
        VALUES (v_sub.student_id, 'subscription_expired', 'انتهى اشتراكك', NULL,
                'sub_expired:' || v_sub.id, 'subscription', v_sub.id)
        ON CONFLICT (dedup_key) DO NOTHING;

        PERFORM public.audit_log('subscription.expire', 'subscription', v_sub.id);
    END LOOP;

    -- 2) Emit the 7-day warning for subscriptions inside the window
    --    (once-only via UNIQUE(dedup_key)). Only ACTIVE, non-deleted
    --    students are warned (LOW: disabled/soft-deleted students are
    --    skipped here - the expiry flip above still applies to all).
    FOR v_sub IN
        SELECT s.id, s.student_id
        FROM public.subscriptions s
        JOIN public.profiles p ON p.id = s.student_id
        WHERE s.status = 'active'
          AND s.expires_at > now()
          AND s.expires_at <= now() + (v_warning_days || ' days')::interval
          AND p.status = 'active'
          AND p.deleted_at IS NULL
    LOOP
        INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
        VALUES (v_sub.student_id, 'subscription_expiring', 'اشتراكك يقترب من الانتهاء', NULL,
                'sub_expiring:' || v_sub.id, 'subscription', v_sub.id)
        ON CONFLICT (dedup_key) DO NOTHING;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- set_video_status(p_video_id, p_new_status, ...)
-- Internal - NO client grants. Validates legal transitions (per
-- ARCHITECTURE.md): pending_upload -> uploading|failed,
-- uploading -> processing|failed, processing -> ready|failed,
-- ready -> replaced, failed -> pending_upload|uploading, replaced
-- terminal. Performs is_primary promotion/demotion (MED-10) and the
-- replacement progress reset (A11).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_video_status(
    p_video_id uuid,
    p_new_status public.video_status,
    p_duration_seconds integer DEFAULT NULL,
    p_thumbnail_url text DEFAULT NULL,
    p_error_message text DEFAULT NULL,
    p_replacement_video_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old public.video_status;
    v_lesson uuid;
    v_legal boolean;
BEGIN
    SELECT status, lesson_id INTO v_old, v_lesson
    FROM public.lesson_videos WHERE id = p_video_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'video_not_found';
    END IF;

    v_legal := (v_old = 'pending_upload' AND p_new_status IN ('uploading', 'failed'))
            OR (v_old = 'uploading' AND p_new_status IN ('processing', 'failed'))
            OR (v_old = 'processing' AND p_new_status IN ('ready', 'failed'))
            OR (v_old = 'ready' AND p_new_status = 'replaced')
            OR (v_old = 'failed' AND p_new_status IN ('pending_upload', 'uploading'));

    IF NOT v_legal THEN
        RAISE EXCEPTION 'invalid_video_transition'
            USING DETAIL = v_old || ' -> ' || p_new_status;
    END IF;

    UPDATE public.lesson_videos
    SET status = p_new_status,
        duration_seconds = COALESCE(p_duration_seconds, duration_seconds),
        thumbnail_url = COALESCE(p_thumbnail_url, thumbnail_url),
        error_message = CASE WHEN p_new_status = 'failed' THEN COALESCE(p_error_message, error_message)
                             ELSE NULL END
    WHERE id = p_video_id;

    -- Promotion (MED-10): a video becoming ready is promoted to primary
    -- when the lesson has no non-deleted primary yet.
    IF p_new_status = 'ready' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.lesson_videos
            WHERE lesson_id = v_lesson AND is_primary AND deleted_at IS NULL
        ) THEN
            UPDATE public.lesson_videos SET is_primary = true WHERE id = p_video_id;
        END IF;
    END IF;

    -- Demotion + replacement progress reset (A11).
    -- HIGH-2: the replacement video must belong to the SAME lesson as the
    -- replaced one (raise otherwise), and progress rows are re-pointed
    -- only when they belong to this lesson - never across lessons.
    -- MEDIUM-2: a replacement that is ALREADY ready is promoted to
    -- primary in the same transaction (demote old primary first, then
    -- promote - the partial unique (lesson_id) WHERE is_primary forbids
    -- two primaries at once). A still-processing replacement leaves the
    -- lesson temporarily without a primary; the regular 'ready' promotion
    -- branch above promotes it when the Phase 5/EF webhook later flips it.
    IF p_new_status = 'replaced' THEN
        IF p_replacement_video_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.lesson_videos
            WHERE id = p_replacement_video_id
              AND lesson_id = v_lesson
              AND deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'replacement_video_mismatch';
        END IF;

        UPDATE public.lesson_videos SET is_primary = false WHERE id = p_video_id;

        IF p_replacement_video_id IS NOT NULL THEN

            -- MEDIUM-2: promote the replacement only when it is already
            -- ready AND the lesson currently has no primary (i.e. the
            -- replaced video WAS the primary). Replacing a non-primary
            -- video must never steal the primary slot.
            IF (SELECT status FROM public.lesson_videos WHERE id = p_replacement_video_id) = 'ready'
               AND NOT EXISTS (
                   SELECT 1 FROM public.lesson_videos
                   WHERE lesson_id = v_lesson AND is_primary AND deleted_at IS NULL
               ) THEN
                UPDATE public.lesson_videos SET is_primary = true WHERE id = p_replacement_video_id;
            END IF;

            UPDATE public.progress
            SET video_id = p_replacement_video_id
            WHERE video_id = p_video_id
              AND lesson_id = v_lesson;
        ELSE
            UPDATE public.progress
            SET position_seconds = 0,
                percent_completed = 0,
                is_completed = false,
                video_id = NULL
            WHERE video_id = p_video_id
              AND lesson_id = v_lesson;
        END IF;
    END IF;

    PERFORM public.audit_log('video.status_change', 'lesson_video', p_video_id,
        jsonb_build_object('old_status', v_old, 'new_status', p_new_status));
END $$;

-- ---------------------------------------------------------------------
-- recheck_video_states()
-- Phase 5 stub: will reconcile stuck Bunny videos (e.g. processing too
-- long). Exists so the scheduling chain and grant matrix are complete.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recheck_video_states()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NULL;
END $$;

-- ---------------------------------------------------------------------
-- notify_new_content trigger (DATABASE.md section 7)
-- AFTER UPDATE on lessons when status becomes 'published'. The fan-out
-- is deduped (new_content:{lesson_id}:{student_id}) so double-firing
-- with publish_lesson() is harmless. publish_lesson() calls the function
-- explicitly so audit ordering is deterministic; the trigger is the
-- documented safety net for any other status flip path.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_new_content_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.notify_new_content(NEW.id);
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_new_content ON public.lessons;
CREATE TRIGGER notify_new_content
    AFTER UPDATE OF status ON public.lessons
    FOR EACH ROW
    WHEN (NEW.status = 'published' AND OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.notify_new_content_trigger();

-- =====================================================================
-- >>> included from migrations\0009_rls_policies.sql
-- =====================================================================

-- =====================================================================
-- 0009_rls_policies
-- Phase 1 | Supabase Foundation | Database
-- ROW LEVEL SECURITY on all 14 application tables, FORCEd on all,
-- plus the full policy matrix. Reference: SECURITY.md section 6;
-- TESTING.md section 4.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enable + FORCE RLS on all 14 tables (belt & braces).
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.grades              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_plans       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_codes  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.code_redemptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_redemptions    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.units               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units               FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lessons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons             FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_videos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_videos       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_pdfs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_pdfs         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.progress            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings        FORCE ROW LEVEL SECURITY;
-- ---------------------------------------------------------------------
-- profiles
-- Own-row SELECT additionally requires is_student() so disabled and
-- soft-deleted students are denied entirely (TESTING.md section 4
-- matrix: SELECT/UPDATE denied for disabled/deleted).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_own_or_staff ON public.profiles;
CREATE POLICY profiles_select_own_or_staff ON public.profiles
    FOR SELECT
    USING ((id = auth.uid() AND public.is_student()) OR public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS profiles_insert_admin ON public.profiles;
CREATE POLICY profiles_insert_admin ON public.profiles
    FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS profiles_update_own_self_service ON public.profiles;
CREATE POLICY profiles_update_own_self_service ON public.profiles
    FOR UPDATE
    USING (id = auth.uid() AND public.is_student())
    WITH CHECK (
        id = auth.uid()
        AND role = (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id)
        AND grade_id = (SELECT p.grade_id FROM public.profiles p WHERE p.id = profiles.id)
        AND status = (SELECT p.status FROM public.profiles p WHERE p.id = profiles.id)
        AND deleted_at IS NULL
    );

DROP POLICY IF EXISTS profiles_delete_admin ON public.profiles;
CREATE POLICY profiles_delete_admin ON public.profiles
    FOR DELETE USING (public.is_admin());

-- ---------------------------------------------------------------------
-- grades
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS grades_select_staff_or_active_students ON public.grades;
CREATE POLICY grades_select_staff_or_active_students ON public.grades
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid()
           OR (public.is_student() AND deleted_at IS NULL AND is_active));

DROP POLICY IF EXISTS grades_dml_staff ON public.grades;
CREATE POLICY grades_dml_staff ON public.grades
    FOR ALL
    USING (public.is_admin() OR public.is_mr_walid())
    WITH CHECK (public.is_admin() OR public.is_mr_walid());

-- ---------------------------------------------------------------------
-- pricing_plans
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS pricing_plans_select_staff_or_active_students ON public.pricing_plans;
CREATE POLICY pricing_plans_select_staff_or_active_students ON public.pricing_plans
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid()
           OR (public.is_student() AND is_active));

DROP POLICY IF EXISTS pricing_plans_dml_admin ON public.pricing_plans;
CREATE POLICY pricing_plans_dml_admin ON public.pricing_plans
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- subscriptions -- SELECT own/staff; DML RPC-only (WITH (NO POLICY)).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS subscriptions_select_own_or_staff ON public.subscriptions;
CREATE POLICY subscriptions_select_own_or_staff ON public.subscriptions
    FOR SELECT
    USING (student_id = auth.uid() OR public.is_admin() OR public.is_mr_walid());

ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- subscription_codes -- staff SELECT only; DML RPC/EF-only.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS subscription_codes_select_staff ON public.subscription_codes;
CREATE POLICY subscription_codes_select_staff ON public.subscription_codes
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid());

-- ---------------------------------------------------------------------
-- code_redemptions -- SELECT own/staff; INSERT RPC-only.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS code_redemptions_select_own_or_staff ON public.code_redemptions;
CREATE POLICY code_redemptions_select_own_or_staff ON public.code_redemptions
    FOR SELECT
    USING (student_id = auth.uid() OR public.is_admin() OR public.is_mr_walid());

-- ---------------------------------------------------------------------
-- units
-- Student branch additionally requires the OWN grade (live from the
-- profile) and that the grade itself is active AND not soft-deleted
-- (BINDING B8: grade deactivation = soft-delete equivalent).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS units_select_staff_or_published_own_grade ON public.units;
CREATE POLICY units_select_staff_or_published_own_grade ON public.units
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid()
        OR (
            public.is_student()
            AND grade_id IN (SELECT grade_id FROM public.profiles WHERE id = auth.uid())
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            AND status = 'published'
            AND deleted_at IS NULL
        )
    );

DROP POLICY IF EXISTS units_dml_staff ON public.units;
CREATE POLICY units_dml_staff ON public.units
    FOR ALL
    USING (public.is_admin() OR public.is_mr_walid())
    WITH CHECK (public.is_admin() OR public.is_mr_walid());

-- ---------------------------------------------------------------------
-- lessons
-- Student branch follows the same rules as units: published, not
-- deleted, unit published & not deleted, own live grade, and the grade
-- active AND not soft-deleted (BINDING B8).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lessons_select_staff_or_published_own_grade ON public.lessons;
CREATE POLICY lessons_select_staff_or_published_own_grade ON public.lessons
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid()
        OR (
            public.is_student()
            AND status = 'published'
            AND deleted_at IS NULL
            AND unit_id IN (
                SELECT id FROM public.units
                WHERE grade_id = (SELECT grade_id FROM public.profiles WHERE id = auth.uid())
                  AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
                  AND status = 'published'
                  AND deleted_at IS NULL
            )
        )
    );

DROP POLICY IF EXISTS lessons_dml_staff ON public.lessons;
CREATE POLICY lessons_dml_staff ON public.lessons
    FOR ALL
    USING (public.is_admin() OR public.is_mr_walid())
    WITH CHECK (public.is_admin() OR public.is_mr_walid());

-- ---------------------------------------------------------------------
-- lesson_videos -- student SELECT gated by can_access_lesson + primary
-- ready; DML RPC/Edge-Function-only.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_videos_select_gated ON public.lesson_videos;
CREATE POLICY lesson_videos_select_gated ON public.lesson_videos
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND status = 'ready' AND is_primary)
    );

-- ---------------------------------------------------------------------
-- lesson_pdfs -- student SELECT gated by can_access_lesson + primary
-- ready (metadata only); DML RPC/Edge-Function-only.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_pdfs_select_gated ON public.lesson_pdfs;
CREATE POLICY lesson_pdfs_select_gated ON public.lesson_pdfs
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND is_ready AND is_primary)
    );

-- ---------------------------------------------------------------------
-- progress -- SELECT own/staff; DML RPC-only (WITH (NO POLICY)).
-- The own-rows branch additionally requires is_student() so disabled and
-- soft-deleted students lose even their progress view (TESTING.md section
-- 4 matrix: progress denied for disabled/deleted).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS progress_select_own_or_staff ON public.progress;
CREATE POLICY progress_select_own_or_staff ON public.progress
    FOR SELECT
    USING ((student_id = auth.uid() AND public.is_student()) OR public.is_mr_walid() OR public.is_admin());

-- ---------------------------------------------------------------------
-- notifications -- own SELECT; column-scoped UPDATE belt-and-braces
-- (binding B2; the real enforcement is REVOKE, applied in 0010).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
    FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_read_state ON public.notifications;
CREATE POLICY notifications_update_read_state ON public.notifications
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- audit_logs -- admin SELECT only; INSERT trigger/system-only.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS audit_logs_select_admin ON public.audit_logs;
CREATE POLICY audit_logs_select_admin ON public.audit_logs
    FOR SELECT
    USING (public.is_admin());

-- ---------------------------------------------------------------------
-- app_settings -- staff SELECT; UPDATE/INSERT staff with mr_walid
-- restricted to whatsapp% keys.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS app_settings_select_staff ON public.app_settings;
CREATE POLICY app_settings_select_staff ON public.app_settings
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS app_settings_write_staff ON public.app_settings;
CREATE POLICY app_settings_write_staff ON public.app_settings
    FOR ALL
    USING (public.is_admin() OR (public.is_mr_walid() AND key LIKE 'whatsapp%'))
    WITH CHECK (public.is_admin() OR (public.is_mr_walid() AND key LIKE 'whatsapp%'));

-- =====================================================================
-- >>> included from migrations\0010_views_grants_ownership.sql
-- =====================================================================

-- =====================================================================
-- 0010_views_grants_ownership
-- Phase 1 | Supabase Foundation | Database
-- SECURITY INVOKER views, the RPC grant matrix (MED-6), table-level
-- revocations (binding B2), and SECURITY DEFINER ownership (B1).
-- Reference: DATABASE.md section 5, section 6.1; SECURITY.md section 8.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Views (all SECURITY INVOKER by default - per-row RLS of the
-- underlying tables still applies to the invoking user, L5).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_active_subscriptions AS
SELECT s.*
FROM public.subscriptions s
JOIN public.profiles p ON p.id = s.student_id
WHERE s.status = 'active'
  AND s.expires_at > now()
  AND p.status = 'active'
  AND p.deleted_at IS NULL;

COMMENT ON VIEW public.v_active_subscriptions IS 'Live-valid subscriptions for eligible students.';

CREATE OR REPLACE VIEW public.v_lesson_access AS
SELECT l.*, public.can_access_lesson(l.id) AS can_access
FROM public.lessons l
JOIN public.units u ON u.id = l.unit_id
WHERE l.status = 'published' AND l.deleted_at IS NULL
  AND u.status = 'published' AND u.deleted_at IS NULL;

COMMENT ON VIEW public.v_lesson_access IS 'Lesson list with live access flag. Staff can read all published rows (is_admin/is_mr_walid are not part of the view filter); students see published lessons of their own live grade only via RLS on lessons.';

CREATE OR REPLACE VIEW public.v_student_progress_summary AS
SELECT p.student_id, g.id AS grade_id, u.id AS unit_id,
       ROUND(AVG(p.percent_completed), 2) AS percent,
       COUNT(*) FILTER (WHERE p.is_completed) AS completed_lessons,
       COUNT(*) AS total_lessons
FROM public.progress p
JOIN public.lessons l ON l.id = p.lesson_id AND l.deleted_at IS NULL
JOIN public.units u ON u.id = l.unit_id AND u.deleted_at IS NULL
JOIN public.grades g ON g.id = u.grade_id AND g.deleted_at IS NULL
GROUP BY p.student_id, g.id, u.id;

COMMENT ON VIEW public.v_student_progress_summary IS 'Per-student percent + completion counts per grade/unit (unweighted mean, A30).';

CREATE OR REPLACE VIEW public.v_lesson_stats AS
SELECT lesson_id,
       COUNT(*) AS play_touches,
       COUNT(*) FILTER (WHERE is_completed) AS completions
FROM public.progress
GROUP BY lesson_id;

COMMENT ON VIEW public.v_lesson_stats IS 'Analytics per lesson from progress.';

CREATE OR REPLACE VIEW public.v_dashboard_metrics AS
SELECT
  (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL)                         AS total_students,
  (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'active')   AS active_students,
  (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'disabled') AS disabled_students,
  (SELECT COUNT(*) FROM public.v_active_subscriptions)                                    AS active_subscribers,
  (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'expired')                    AS expired_subscriptions,
  (SELECT COUNT(*) FROM public.lessons WHERE deleted_at IS NULL AND status = 'published') AS published_lessons,
  (SELECT COUNT(*) FROM public.lessons WHERE deleted_at IS NULL AND status <> 'published') AS hidden_or_draft_lessons,
  (SELECT COUNT(*) FROM public.subscription_codes WHERE status = 'available')             AS available_codes,
  (SELECT COUNT(*) FROM public.subscription_codes WHERE status = 'used')                  AS used_codes;

COMMENT ON VIEW public.v_dashboard_metrics IS 'Admin operational metrics.';

CREATE OR REPLACE VIEW public.v_audit_log AS
SELECT a.*, p.full_name AS actor_name
FROM public.audit_logs a
LEFT JOIN public.profiles p ON p.id = a.actor_id;

COMMENT ON VIEW public.v_audit_log IS 'Audit rows with actor display info (admin-only read via RLS).';

-- ---------------------------------------------------------------------
-- RPC grant matrix (MED-6 / SECURITY.md section 8)
-- Default posture: everything REVOKEd; explicit allowlist granted.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Client-callable allowlist (SECURITY.md section 8.2):
GRANT EXECUTE ON FUNCTION public.update_own_profile(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_student_profile(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_subscription_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_current_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_progress(uuid, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_grade(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enable_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_trash() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_subscription(uuid, uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_subscription_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_unit(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_unit(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_unit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_unit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_lesson(uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_lesson(uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_lesson(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hide_lesson(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_lesson(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_lesson(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_grade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_grade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_app_setting(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_pricing_plan(uuid, integer, numeric, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pricing_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, public.user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pdf_upload(uuid) TO authenticated;

-- anon additionally for the public settings surface (LOW-15):
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated;

-- RLS policy helpers: is_admin, is_mr_walid, is_student and
-- can_access_lesson are invoked INSIDE RLS policy expressions (SECURITY.md
-- section 6). PostgreSQL requires EXECUTE on the function at the point the
-- policy is evaluated, so these four MUST stay executable by authenticated
-- (empirically verified; see tests/local README). They are NOT reachable
-- through the PostgREST RPC surface for any client role: only functions
-- exposed by Supabase's RPC auto-exposure (granted here above) are
-- callable via RPC. anon keeps no access to them.
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mr_walid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_student() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_lesson(uuid) TO authenticated;

-- Everything else stays REVOKEd: generate_codes_internal, set_video_status,
-- expire_subscriptions, recheck_video_states, notify_new_content,
-- audit_log, handle_new_user, block_email_change,
-- block_sign_in_for_inactive_accounts, set_updated_at,
-- clear_primary_on_soft_delete, revoke_sessions_if_possible,
-- get_current_role.
-- NOTE: is_admin / is_mr_walid / is_student / can_access_lesson are
-- NOT revoked - they are granted above for use inside RLS policy
-- expressions (required by PostgreSQL; not reachable via RPC).

-- ---------------------------------------------------------------------
-- Binding B2: direct DML on notifications revoked from clients;
-- mark-read RPCs (SECURITY DEFINER) remain the only mutation path.
-- ---------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- Binding B1: every SECURITY DEFINER function (incl. trigger functions)
-- must be owned by postgres (or a BYPASSRLS role). The harness runs
-- migrations as postgres, so this is a no-op there; it hardens hosted
-- migrations regardless of the executing role.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS proc
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef
    LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', r.proc);
    END LOOP;
END$$;

-- =====================================================================
-- >>> included from migrations\0011_storage_and_seeds.sql
-- =====================================================================

-- =====================================================================
-- 0011_storage_and_seeds
-- Phase 1 | Supabase Foundation | Database
-- Private storage buckets + storage RLS, and safe seed data
-- (app_settings, admin/mr_walid accounts, empty grades).
-- Reference: DATABASE.md sections 8-9.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Storage: private buckets, RLS enabled, NO anonymous policies and NO
-- direct object policies - every object operation goes through signed
-- URLs issued by Edge Functions (SECURITY.md section 9).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('pdfs', 'pdfs', false), ('audit-exports', 'audit-exports', false)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        BEGIN
            ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
            ALTER TABLE storage.objects FORCE ROW LEVEL SECURITY;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'storage.objects is platform-owned (supabase_storage_admin): skipping ENABLE/FORCE RLS - hosted default is RLS-enabled and not forced';
        END;
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- app_settings seeds (idempotent).
-- ---------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, description)
VALUES
    ('platform_name', '"منصة مستر وليد عونى التعليمية"', 'Platform display name'),
    ('whatsapp_number', '"+201000000000"', 'Support WhatsApp number'),
    ('whatsapp_default_message', '"مرحباً، أريد الاستفسار عن الاشتراك"', 'Default WhatsApp message'),
    ('expiry_warning_days', '7', 'Days before expiry to warn subscribers')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- Grades: seeded EMPTY (created via UI; dashboard requires grade
-- creation first).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Seed admin + mr_walid accounts (A21).
-- Password is injected via the app.seed_admin_password session setting
-- (CI secret); the explicit default is dev-only. Profile rows are
-- created by handle_new_user from raw_user_meta_data, then roles are
-- promoted. Idempotent.
-- DEPLOY GUARD (LOW): in production (app.is_production = 'true') the
-- default dev password is a hard failure - the migration aborts until a
-- real secret is injected via app.seed_admin_password.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_password text := COALESCE(NULLIF(current_setting('app.seed_admin_password', true), ''), 'ChangeMe-Dev-Only-123!');
    v_is_production boolean := COALESCE(current_setting('app.is_production', true) = 'true', false);
    v_admin uuid;
    v_walid uuid;
BEGIN
    IF v_is_production AND v_password = 'ChangeMe-Dev-Only-123!' THEN
        RAISE EXCEPTION 'seed_admin_password_missing';
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE role IN ('admin', 'mr_walid')) THEN
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@walid-platform.local') THEN
        INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
        VALUES (
            gen_random_uuid(), 'admin@walid-platform.local',
            crypt(v_password, gen_salt('bf')),
            jsonb_build_object('full_name', 'Platform Admin', 'phone', '+201000000001',
                               'guardian_phone', '+201000000001', 'address', 'Cairo',
                               'seed_account', 'true'),
            now(), now()
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'mrwalid@walid-platform.local') THEN
        INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
        VALUES (
            gen_random_uuid(), 'mrwalid@walid-platform.local',
            crypt(v_password, gen_salt('bf')),
            jsonb_build_object('full_name', 'Mr. Walid', 'phone', '+201000000002',
                               'guardian_phone', '+201000000002', 'address', 'Cairo',
                               'seed_account', 'true'),
            now(), now()
        );
    END IF;

    SELECT id INTO v_admin FROM auth.users WHERE email = 'admin@walid-platform.local';
    SELECT id INTO v_walid FROM auth.users WHERE email = 'mrwalid@walid-platform.local';

    UPDATE public.profiles SET role = 'admin'    WHERE id = v_admin;
    UPDATE public.profiles SET role = 'mr_walid' WHERE id = v_walid;

    PERFORM public.audit_log('seed.admin_provisioned', 'profile', v_admin,
        jsonb_build_object('role', 'admin'));
    PERFORM public.audit_log('seed.admin_provisioned', 'profile', v_walid,
        jsonb_build_object('role', 'mr_walid'));
END$$;

-- =====================================================================
-- >>> included from migrations\0012_fix_staff_ops.sql
-- =====================================================================

-- =====================================================================
-- 0012_fix_staff_ops
-- Phase 1 | Supabase Foundation | Database
-- Fast Review (round 2) DATABASE-side fixes:
--   1. CRITICAL: list_trash() was SECURITY DEFINER with NO staff guard,
--      so ANY authenticated student could rpc('list_trash') and enumerate
--      every soft-deleted student's full_name/phone/guardian_phone/
--      address. The grant on the function (0010, authenticated) is kept
--      as the grant matrix intends staff-only client-callability; the
--      in-function guard is the enforcement.
--   2. HIGH: set_student_grade() could not clear a student's grade
--      (p_grade_id IS NULL raised grade_not_available) although the
--      product allows grade-less students (A1: grade nullable). NULL now
--      clears the grade (audited as {'old_grade_id':..,'new_grade_id':
--      null}); non-NULL ids are still validated (exists + active +
--      not soft-deleted) and raise grade_not_available otherwise.
-- Append-only migration: the originals in 0007 are NOT rewritten.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fix 1: list_trash() staff guard (CRITICAL - PII enumeration)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_trash()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    RETURN QUERY
    SELECT * FROM public.profiles
    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC;
END $$;

-- ---------------------------------------------------------------------
-- Fix 2: set_student_grade() NULL support (grade clearing)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_student_grade(p_student_id uuid, p_grade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old uuid;
    v_role public.user_role;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT role, grade_id INTO v_role, v_old FROM public.profiles WHERE id = p_student_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;
    IF v_role <> 'student' THEN
        RAISE EXCEPTION 'not_a_student';
    END IF;

    -- NULL clears the grade (A1: grade is nullable); only non-NULL ids
    -- must exist, be active and not soft-deleted.
    IF p_grade_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.grades WHERE id = p_grade_id AND is_active AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'grade_not_available';
    END IF;

    UPDATE public.profiles SET grade_id = p_grade_id WHERE id = p_student_id;

    PERFORM public.audit_log('student.grade_change', 'profile', p_student_id,
        jsonb_build_object('old_grade_id', v_old, 'new_grade_id', p_grade_id));
END $$;

-- =====================================================================
-- >>> included from migrations\0013_grade_crud.sql
-- =====================================================================

-- =====================================================================
-- 0013_grade_crud
-- Phase 3 | Grades, Pricing & Subscriptions | Database
-- create_grade / update_grade: client-callable grade CRUD for staff
-- (mr_walid/admin), SECURITY DEFINER + audited. Guards mirror 0007's
-- delete_grade and 0012's list_trash patterns:
--   * permission_denied  unless is_admin() OR is_mr_walid()
--   * grade_not_found    update target does not exist
--   * grade_deleted      update target soft-deleted (deleted_at set,
--                        binding B8)
--   * grade_inactive     update target deactivated (is_active = false,
--                        binding B8)
--   * grade_name_required empty/whitespace name
--   * duplicate grade    case-sensitive name collision (grades.name is
--                        UNIQUE; same rejection style as
--                        generate_codes_internal's unique_violation catch)
-- update_grade returns early without auditing when no field actually
-- changes, and only ever updates the provided fields.
-- Append-only migration; nothing in 0002/0007 is rewritten.
-- Reference: DATABASE.md section 6.4 (staff RPCs).
-- =====================================================================

-- ---------------------------------------------------------------------
-- create_grade(p_name text, p_sort_order integer DEFAULT 0) RETURNS uuid
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_grade(p_name text, p_sort_order integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF btrim(COALESCE(p_name, '')) = '' THEN
        RAISE EXCEPTION 'grade_name_required';
    END IF;

    IF EXISTS (SELECT 1 FROM public.grades WHERE name = btrim(p_name)) THEN
        RAISE EXCEPTION 'duplicate grade';
    END IF;

    BEGIN
        INSERT INTO public.grades (name, sort_order)
        VALUES (btrim(p_name), p_sort_order)
        RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
        -- race backstop for the concurrent create path
        RAISE EXCEPTION 'duplicate grade';
    END;

    PERFORM public.audit_log('grade.create', 'grade', v_id,
        jsonb_build_object('name', btrim(p_name), 'sort_order', p_sort_order));

    RETURN v_id;
END $$;

-- ---------------------------------------------------------------------
-- update_grade(p_grade_id uuid, p_name text DEFAULT NULL,
--              p_sort_order integer DEFAULT NULL) RETURNS void
-- No-op (no audit) when neither provided field actually changes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_grade(
    p_grade_id uuid,
    p_name text DEFAULT NULL,
    p_sort_order integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_name text;
    v_sort_order integer;
    v_deleted_at timestamptz;
    v_is_active boolean;
    v_meta jsonb := '{}'::jsonb;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT name, sort_order, deleted_at, is_active
    INTO v_name, v_sort_order, v_deleted_at, v_is_active
    FROM public.grades WHERE id = p_grade_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'grade_not_found';
    END IF;
    IF v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'grade_deleted';
    END IF;
    IF NOT v_is_active THEN
        RAISE EXCEPTION 'grade_inactive';
    END IF;

    IF p_name IS NOT NULL AND btrim(p_name) = '' THEN
        RAISE EXCEPTION 'grade_name_required';
    END IF;

    IF p_name IS NOT NULL AND btrim(p_name) <> v_name
       AND EXISTS (SELECT 1 FROM public.grades WHERE name = btrim(p_name) AND id <> p_grade_id) THEN
        RAISE EXCEPTION 'duplicate grade';
    END IF;

    -- No-op: nothing provided, or every provided field already matches.
    IF (p_name IS NULL OR btrim(p_name) = v_name)
       AND (p_sort_order IS NULL OR p_sort_order = v_sort_order) THEN
        RETURN;
    END IF;

    BEGIN
        UPDATE public.grades
        SET name = COALESCE(NULLIF(btrim(p_name), ''), name),
            sort_order = COALESCE(p_sort_order, sort_order)
        WHERE id = p_grade_id;
    EXCEPTION WHEN unique_violation THEN
        -- race backstop for the concurrent rename path
        RAISE EXCEPTION 'duplicate grade';
    END;

    IF p_name IS NOT NULL AND btrim(p_name) <> v_name THEN
        v_meta := v_meta || jsonb_build_object('name', btrim(p_name), 'old_name', v_name);
    END IF;
    IF p_sort_order IS NOT NULL AND p_sort_order <> v_sort_order THEN
        v_meta := v_meta || jsonb_build_object('sort_order', p_sort_order);
    END IF;

    PERFORM public.audit_log('grade.update', 'grade', p_grade_id, v_meta);
END $$;

-- ---------------------------------------------------------------------
-- Grant matrix: authenticated only, staff enforced in-function (same
-- posture as list_trash, 0010/0012). An explicit REVOKE FROM PUBLIC
-- first: 0010 revoked existing functions before these were created,
-- and new functions otherwise inherit the PUBLIC default grant.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_grade(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_grade(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_grade(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_grade(uuid, text, integer) TO authenticated;

-- =====================================================================
-- >>> included from migrations\0014_codes_ef_wrapper.sql
-- =====================================================================

-- =====================================================================
-- 0014_codes_ef_wrapper
-- Phase 3 | Grades, Pricing & Subscriptions | Database
-- Staff-guarded EF entry point for generate_codes_internal (0007).
--
-- Problem fixed: generate_codes_internal attributes the actor via
-- COALESCE(auth.uid(), current_setting('app.system_actor_id', true))
-- and raises 'system_actor_required' when both are absent. A service-role
-- PostgREST client carries no sub claim and PostgREST exposes no
-- per-request GUC channel, so every Edge Function call over the service
-- role rejected. The fix: a SECURITY DEFINER wrapper that is granted to
-- authenticated and works when invoked over PostgREST with the CALLER'S
-- OWN user JWT (the EF forwards the verified caller token).
--
-- Semantics (verified in tests/local/sql/04_business.sql Section 15):
--   * The guard uses the request-scoped claims (request.jwt.claims) via
--     the is_admin()/is_mr_walid() helpers, exactly like list_trash()
--     (0012); SECURITY DEFINER does not clear session GUCs, so the
--     auth.uid()-based helpers keep working over PostgREST user-JWT
--     calls. Students calling the wrapper directly -> permission_denied.
--   * generate_codes_internal then reads the same auth.uid() (same
--     request claims) -> actor satisfied, created_by = caller uid.
--   * Called WITHOUT a JWT sub (service role / no claims): the guard
--     raises permission_denied BEFORE generate_codes_internal is ever
--     reached, so any GUC-free path stays denied.
--   * Plan validation (plan_not_found) and the count cap (1..500,
--     invalid_count) stay inside generate_codes_internal - NOT
--     duplicated here.
-- Bindings B6/B8/B9 are unaffected.
-- Append-only migration; nothing in 0007 is rewritten.
-- Reference: DATABASE.md section 6.4 (staff RPCs).
-- =====================================================================

-- ---------------------------------------------------------------------
-- create_codes_for_staff(p_plan_id, p_count, p_note)
-- RETURNS SETOF subscription_codes; staff-guarded EF entry point that
-- delegates to generate_codes_internal (0007) - validation stays there.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_codes_for_staff(
    p_plan_id uuid,
    p_count integer,
    p_note text DEFAULT NULL
)
RETURNS SETOF public.subscription_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    RETURN QUERY SELECT * FROM public.generate_codes_internal(p_plan_id, p_count, p_note);
END $$;

-- ---------------------------------------------------------------------
-- Grant matrix: authenticated only, staff enforced in-function (same
-- posture as list_trash, 0010/0012; explicit REVOKE FROM PUBLIC first
-- because new functions otherwise inherit the PUBLIC default grant).
-- generate_codes_internal keeps NO client grants (unchanged - this
-- wrapper is the only new surface). anon: nothing.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_codes_for_staff(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_codes_for_staff(uuid, integer, text) TO authenticated;

-- =====================================================================
-- >>> included from migrations\0015_pdf_upload_ef_wrapper.sql
-- =====================================================================

-- =====================================================================
-- 0015_pdf_upload_ef_wrapper
-- Phase 4 | Curriculum & Content Management | Database
-- Edge-Function support for the upload-pdf function (ARCHITECTURE.md
-- §8.4 row 5, §8.3), following the Phase 3 caller-token pattern (0014).
--
-- Problem 1 (lesson_pdfs INSERT): 0009 gives lesson_pdfs a SELECT-only
-- policy (staff branch / gated student branch) and FORCE RLS is on
-- (0009:201-208), so a PostgREST caller-token client CANNOT insert the
-- pending PDF row. Fix: a staff-guarded SECURITY DEFINER wrapper
-- create_pdf_upload_record() that creates the row (is_ready=false,
-- is_primary=false), resolves the storage_path as '{lesson_id}/{uuid}.pdf'
-- server-side (gen_random_uuid -- the client NEVER supplies a path), and
-- audits the start of the upload. The lesson_pdfs table has no
-- created_by column (0002:200-212); the actor is carried by the audit
-- row only.
--
-- Problem 2 (signed upload URL issuance): the storage API's
-- createSignedUploadUrl endpoint (I4) requires the caller to satisfy an
-- INSERT policy on storage.objects at issuance time ("RLS policy
-- permissions required: objects -> insert"; Supabase Storage docs). With
-- FORCE RLS and zero object policies (0011), a caller-token issuance
-- fails with 403. Fix: one narrowly-scoped INSERT policy on the pdfs
-- bucket whose WITH CHECK requires BOTH:
--   * the exact '{uuid}/{uuid}.pdf' path shape, AND
--   * an existing, non-deleted lesson_pdfs row with that storage_path
--     VISIBLE TO THE CALLER.
-- The row-visibility half is the security boundary: pending rows
-- (is_ready=false) are invisible to students under the 0009 SELECT
-- policy, so only staff can reserve paths, and a student can never mint
-- one; every row-backed path already holds its object (created by the
-- real upload flow) so a student's direct upload to a visible primary
-- path conflicts (409) and upsert paths need an UPDATE policy (none).
-- NO SELECT/UPDATE/DELETE object policies are added: object reads stay
-- locked behind the Phase 6 get-pdf-signed-url Edge Function (0009
-- comment, SECURITY.md section 9).
--
-- This is the ONLY storage object policy in the project; it is the
-- minimal exception to "no direct object policies" required to keep
-- issuance caller-token-driven (no service-role key in Edge Functions,
-- Phase 3 pattern). Documented in ARCHITECTURE.md §8.3 as the delivery
-- mechanism for signed upload URLs.
--
-- finalize_pdf_upload (0007:800) needs NO change: it is already
-- SECURITY DEFINER, granted to authenticated (0010:116), and its
-- is_admin()/is_mr_walid() guard reads the request-scoped claims
-- (auth.uid()) exactly like create_codes_for_staff (0014) -- verified
-- over a caller token in the Phase 4 harness tests below.
-- Append-only migration; nothing in 0002/0007/0009/0010/0011 is
-- rewritten.
-- Reference: DATABASE.md section 6.4 (staff RPCs), section 8 (storage).
-- =====================================================================

-- ---------------------------------------------------------------------
-- create_pdf_upload_record(p_lesson_id, p_original_name, p_size_bytes)
-- Staff-guarded EF entry point: reserves the storage path and creates
-- the pending lesson_pdfs row. Validation of the file name characters,
-- the .pdf extension and the size cap happens in the Edge Function;
-- the wrapper enforces the DB-visible invariants (lesson exists, lesson
-- not soft-deleted, size bounds) and never interprets client-supplied
-- path components (the path is generated here).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_pdf_upload_record(
    p_lesson_id uuid,
    p_original_name text,
    p_size_bytes bigint DEFAULT NULL
)
RETURNS TABLE (id uuid, storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_path text;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_size_bytes IS NOT NULL AND (p_size_bytes < 0 OR p_size_bytes > 52428800) THEN
        RAISE EXCEPTION 'invalid_pdf_size';
    END IF;

    -- NOTE: unqualified column refs must be avoided: the RETURNS TABLE
    -- OUT parameter `id` shadows table columns in SQL statements.
    IF NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id) THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id AND l.deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'lesson_deleted';
    END IF;

    v_path := p_lesson_id::text || '/' || gen_random_uuid()::text || '.pdf';

    INSERT INTO public.lesson_pdfs (lesson_id, storage_path, original_name, size_bytes, is_ready, is_primary)
    VALUES (p_lesson_id, v_path, btrim(p_original_name), p_size_bytes, false, false)
    RETURNING lesson_pdfs.id INTO v_id;

    PERFORM public.audit_log('pdf.upload_started', 'lesson_pdf', v_id,
        jsonb_build_object('lesson_id', p_lesson_id, 'original_name', p_original_name,
                           'storage_path', v_path, 'size_bytes', p_size_bytes));

    RETURN QUERY SELECT v_id, v_path;
END $$;

-- ---------------------------------------------------------------------
-- Grant matrix: authenticated only, staff enforced in-function (same
-- posture as create_codes_for_staff, 0014; explicit REVOKE FROM PUBLIC
-- first because new functions otherwise inherit the PUBLIC default
-- grant). anon: nothing.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_pdf_upload_record(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pdf_upload_record(uuid, text, bigint) TO authenticated;

-- ---------------------------------------------------------------------
-- Storage: pdfs INSERT policy (see header for the security analysis).
-- Signed-upload-URL issuance over the caller-token path requires the
-- caller to satisfy an INSERT policy on storage.objects; the WITH CHECK
-- binds the path to an existing lesson_pdfs row visible to the caller.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        DROP POLICY IF EXISTS pdfs_insert_row_backed ON storage.objects;
        CREATE POLICY pdfs_insert_row_backed ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'pdfs'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
                AND EXISTS (
                    SELECT 1 FROM public.lesson_pdfs
                    WHERE storage_path = name AND deleted_at IS NULL
                )
            );
    END IF;
END$$;

-- =====================================================================
-- >>> included from migrations\0016_video_upload_ef_wrapper.sql
-- =====================================================================

-- =====================================================================
-- 0016_video_upload_ef_wrapper.sql
-- Phase 5 (Bunny video): reservation wrapper for the
-- create-video-upload-session Edge Function.
--
-- Why a SECURITY DEFINER wrapper (same shape as 0015, pdfs):
--   0009 gives lesson_videos a SELECT-only policy
--   (lesson_videos_select_gated) and FORCE RLS, so a caller-token INSERT
--   is blocked by row-level security. This wrapper is the ONLY insert
--   surface for lesson_videos rows and re-validates every Phase 1/5 rule
--   server-side (authoritative backstop; the Edge Function pre-checks
--   the same rules over the caller token for UX).
--
-- Rules enforced (documented in ARCHITECTURE.md §8.2 / §7.2):
--   * staff only: is_admin() OR is_mr_walid() (request-scoped claims)
--   * p_mode is 'create' or 'replace'
--   * bunny_video_id / bunny_library_id non-empty (constraint-checked
--     by 0002 as well)
--   * lesson exists and is NOT soft-deleted (lesson_not_found /
--     lesson_deleted)
--   * Phase 1 orphan rule: at most ONE pending_upload row per lesson
--     (lesson_has_pending_upload) — an abandoned session must never be
--     hidden behind a stale one; expired sessions are reconciled by the
--     recheck-video-states Edge Function (Phase 5, J2)
--   * replace mode: old video must exist, belong to the SAME lesson,
--     and be 'ready' (old_video_not_found / wrong_lesson /
--     old_video_not_ready)
--   * primary rule (B9/MED-10): a CREATE row becomes primary ONLY when
--     the lesson has no live primary; a REPLACE row never takes the
--     primary slot here — promotion happens on 'ready' via
--     set_video_status (0008, UNCHANGED)
--
-- Error surface (same convention as 0015: P0001 + detail message):
--   permission_denied | invalid_mode | invalid_bunny_video_id |
--   lesson_not_found | lesson_deleted | lesson_has_pending_upload |
--   old_video_required | old_video_not_found | wrong_lesson |
--   old_video_not_ready
--
-- Grant surface: authenticated ONLY (client RPC #38, count asserted in
-- tests/local/sql/05_grants.sql). anon stays fully locked.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_video_upload_record(
    p_lesson_id uuid,
    p_bunny_video_id text,
    p_bunny_library_id text,
    p_title text,
    p_mode text,
    p_old_video_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, is_primary boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_primary boolean;
    v_old_status public.video_status;
    v_old_lesson uuid;
BEGIN
    -- staff guard reads the request-scoped claims (is_admin/is_mr_walid
    -- are RLS policy helpers granted to authenticated; see 0010)
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_mode NOT IN ('create', 'replace') THEN
        RAISE EXCEPTION 'invalid_mode';
    END IF;

    IF p_bunny_video_id IS NULL OR btrim(p_bunny_video_id) = ''
       OR p_bunny_library_id IS NULL OR btrim(p_bunny_library_id) = '' THEN
        RAISE EXCEPTION 'invalid_bunny_video_id';
    END IF;

    -- NOTE: unqualified column refs must be avoided: the RETURNS TABLE
    -- OUT parameters (id, is_primary) shadow table columns in SQL
    -- statements (same rule as 0015 §85).
    IF NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id) THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id AND l.deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'lesson_deleted';
    END IF;

    -- orphan-session guard (Phase 1 rule): at most one pending upload
    IF EXISTS (
        SELECT 1 FROM public.lesson_videos lv
        WHERE lv.lesson_id = p_lesson_id
          AND lv.status = 'pending_upload'
          AND lv.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'lesson_has_pending_upload';
    END IF;

    IF p_mode = 'replace' THEN
        IF p_old_video_id IS NULL THEN
            RAISE EXCEPTION 'old_video_required';
        END IF;
        SELECT lv.status, lv.lesson_id INTO v_old_status, v_old_lesson
        FROM public.lesson_videos lv
        WHERE lv.id = p_old_video_id AND lv.deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'old_video_not_found';
        END IF;
        IF v_old_lesson <> p_lesson_id THEN
            RAISE EXCEPTION 'wrong_lesson';
        END IF;
        IF v_old_status <> 'ready' THEN
            RAISE EXCEPTION 'old_video_not_ready';
        END IF;
        v_primary := false;
    ELSE
        v_primary := NOT EXISTS (
            SELECT 1 FROM public.lesson_videos lv
            WHERE lv.lesson_id = p_lesson_id AND lv.is_primary AND lv.deleted_at IS NULL
        );
    END IF;

    INSERT INTO public.lesson_videos
        (lesson_id, bunny_video_id, bunny_library_id, title, status, is_primary, sort_order)
    VALUES
        (p_lesson_id, btrim(p_bunny_video_id), btrim(p_bunny_library_id),
         btrim(p_title), 'pending_upload', v_primary, 0)
    RETURNING lesson_videos.id INTO v_id;

    PERFORM public.audit_log('video.upload_session_created', 'lesson_video', v_id,
        jsonb_build_object('lesson_id', p_lesson_id, 'mode', p_mode,
                           'bunny_video_id', p_bunny_video_id,
                           'old_video_id', p_old_video_id,
                           'is_primary', v_primary));

    RETURN QUERY SELECT v_id, v_primary;
END $$;

COMMENT ON FUNCTION public.create_video_upload_record(uuid, text, text, text, text, uuid) IS
'Phase 5 staff wrapper: reserves the pending lesson_videos row for a Bunny upload session (create/replace). Staff-guarded, enforces the one-pending-row-per-lesson rule and the replace target rules. ONLY lesson_videos insert surface (0009 FORCE RLS has no INSERT policy). Authenticated-only grant (client RPC #38).';

-- only authenticated may call it (client RPC surface)
REVOKE EXECUTE ON FUNCTION public.create_video_upload_record(uuid, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_video_upload_record(uuid, text, text, text, text, uuid) TO authenticated;

-- =====================================================================
-- >>> included from migrations\0017_delete_video_upload_record.sql
-- =====================================================================

-- =====================================================================
-- 0017_delete_video_upload_record.sql
-- Phase 5 (Bunny video): release RPC for the create-video-upload-session
-- Edge Function (cancel/abandon action).
--
-- Why a SECURITY DEFINER wrapper (same shape as 0015/0016): 0009 gives
-- lesson_videos a SELECT-only policy + FORCE RLS, so a caller-token
-- DELETE is silently a no-op (0 rows). This wrapper is the ONLY delete
-- surface for lesson_videos rows and re-validates every rule
-- server-side (authoritative backstop; the Edge Function pre-checks the
-- same rules over the caller token for UX).
--
-- Purpose: an upload session that is cancelled or abandoned before any
-- byte is committed must release the reservation — otherwise the Phase 1
-- orphan rule (one pending_upload row per lesson, enforced by 0016)
-- permanently locks the lesson out of future upload sessions. The
-- bunny-video-webhook status machine never fires for an aborted TUS
-- upload and recheck-video-states treats Bunny status 0 (queued) as a
-- no-op, so the row has no other escape hatch.
--
-- Rules enforced:
--   * staff only: is_admin() OR is_mr_walid() (request-scoped claims)
--   * the row must exist and must NOT be soft-deleted
--     (video_not_found)
--   * the row must belong to the given lesson (wrong_lesson)
--   * the row must still be 'pending_upload' (video_not_pending) —
--     a row that a webhook already advanced (uploading/processing/
--     ready/failed) must never be silently removed by a cancel
--   * hard DELETE (no content was ever committed) + audit
--     (video.upload_session_cancelled)
--
-- Error surface (P0001 + detail message):
--   permission_denied | video_not_found | wrong_lesson | video_not_pending
--
-- Grant surface: authenticated ONLY (client RPC #39, count asserted in
-- tests/local/sql/05_grants.sql). anon stays fully locked.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.delete_video_upload_record(
    p_lesson_id uuid,
    p_video_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
    v_status public.video_status;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lv.lesson_id, lv.status INTO v_lesson, v_status
    FROM public.lesson_videos lv
    WHERE lv.id = p_video_id AND lv.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'video_not_found';
    END IF;
    IF v_lesson <> p_lesson_id THEN
        RAISE EXCEPTION 'wrong_lesson';
    END IF;
    IF v_status <> 'pending_upload' THEN
        RAISE EXCEPTION 'video_not_pending';
    END IF;

    DELETE FROM public.lesson_videos WHERE id = p_video_id;

    PERFORM public.audit_log('video.upload_session_cancelled', 'lesson_video', p_video_id,
        jsonb_build_object('lesson_id', p_lesson_id));
END $$;

COMMENT ON FUNCTION public.delete_video_upload_record(uuid, uuid) IS
'Phase 5 staff wrapper: releases a pending_upload lesson_videos row (cancel/abandon of a Bunny upload session) so the lesson can start a new session. Staff-guarded; only pending_upload rows of the given lesson; hard delete + audit. ONLY lesson_videos delete surface (0009 FORCE RLS has no DELETE policy). Authenticated-only grant (client RPC #39).';

-- only authenticated may call it (client RPC surface)
REVOKE EXECUTE ON FUNCTION public.delete_video_upload_record(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_video_upload_record(uuid, uuid) TO authenticated;

-- =====================================================================
-- >>> included from migrations\0018_dashboard_stats.sql
-- =====================================================================

-- =====================================================================
-- 0018_dashboard_stats
-- Phase 7 | Dashboards | Database
-- get_dashboard_stats(): single-round-trip operational/analytics JSON
-- for the Mr. Walid / admin dashboards. Staff-guarded exactly like the
-- other client RPCs (is_admin() OR is_mr_walid()); students get
-- permission_denied. Aggregates read through the existing SECURITY
-- INVOKER views where they already exist (v_active_subscriptions) and
-- plain public tables otherwise (all of which staff can read under
-- RLS). Read-only: no audit row (nothing is mutated).
-- Reference: DATABASE.md section 6.4 (staff RPCs); SECURITY.md 8.2.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stats jsonb;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT jsonb_build_object(
        'students', jsonb_build_object(
            'total',        (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL),
            'active',       (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'active'),
            'disabled',     (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'disabled'),
            'deleted',      (SELECT count(*) FROM public.profiles WHERE deleted_at IS NOT NULL),
            'new_this_month', (SELECT count(*) FROM public.profiles
                               WHERE deleted_at IS NULL AND created_at >= date_trunc('month', now()))
        ),
        'subscriptions', jsonb_build_object(
            'active',               (SELECT count(*) FROM public.v_active_subscriptions),
            'expiring_7d',          (SELECT count(*) FROM public.v_active_subscriptions
                                     WHERE expires_at <= now() + interval '7 days'),
            'expired',              (SELECT count(*) FROM public.subscriptions WHERE status = 'expired'),
            'revenue_total',        (SELECT COALESCE(sum(total_price), 0) FROM public.v_active_subscriptions),
            'revenue_this_month',   (SELECT COALESCE(sum(total_price), 0) FROM public.subscriptions
                                     WHERE status = 'active' AND started_at >= date_trunc('month', now()))
        ),
        'content', jsonb_build_object(
            'grades',           (SELECT count(*) FROM public.grades WHERE deleted_at IS NULL),
            'units',            (SELECT count(*) FROM public.units WHERE deleted_at IS NULL),
            'lessons',          (SELECT count(*) FROM public.lessons WHERE deleted_at IS NULL),
            'published_lessons',(SELECT count(*) FROM public.lessons WHERE deleted_at IS NULL AND status = 'published'),
            'videos',           (SELECT count(*) FROM public.lesson_videos WHERE deleted_at IS NULL),
            'videos_ready',     (SELECT count(*) FROM public.lesson_videos WHERE deleted_at IS NULL AND status = 'ready'),
            'pdfs',             (SELECT count(*) FROM public.lesson_pdfs WHERE deleted_at IS NULL),
            'pdfs_ready',       (SELECT count(*) FROM public.lesson_pdfs WHERE deleted_at IS NULL AND is_ready)
        ),
        'engagement', jsonb_build_object(
            'students_with_progress', (SELECT count(DISTINCT student_id) FROM public.progress),
            'completed_lessons',      (SELECT count(*) FROM public.progress WHERE is_completed),
            'avg_percent',            (SELECT COALESCE(round(avg(percent_completed), 2), 0) FROM public.progress)
        ),
        'codes', jsonb_build_object(
            'available', (SELECT count(*) FROM public.subscription_codes WHERE status = 'available'),
            'used',      (SELECT count(*) FROM public.subscription_codes WHERE status = 'used'),
            'revoked',   (SELECT count(*) FROM public.subscription_codes WHERE status = 'revoked')
        ),
        'by_grade', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'grade_name', r.grade_name,
                'students', r.students,
                'active_subscribers', r.active_subscribers
            ) ORDER BY r.sort_order)
            FROM (
                SELECT g.name AS grade_name, g.sort_order,
                       count(DISTINCT p.id) AS students,
                       count(DISTINCT s.student_id) AS active_subscribers
                FROM public.grades g
                LEFT JOIN public.profiles p
                       ON p.grade_id = g.id AND p.deleted_at IS NULL
                LEFT JOIN public.v_active_subscriptions s ON s.student_id = p.id
                WHERE g.deleted_at IS NULL
                GROUP BY g.id, g.name, g.sort_order
            ) r
        ), '[]'::jsonb),
        'recent_subscriptions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', p.full_name,
                'grade_name', g.name,
                'duration_days', pl.duration_days,
                'total_price', s.total_price,
                'status', s.status,
                'started_at', s.started_at,
                'expires_at', s.expires_at
            ) ORDER BY s.created_at DESC)
            FROM public.subscriptions s
            JOIN public.profiles p ON p.id = s.student_id
            JOIN public.pricing_plans pl ON pl.id = s.pricing_plan_id
            LEFT JOIN public.grades g ON g.id = pl.grade_id
            LIMIT 5
        ), '[]'::jsonb),
        'upcoming_expirations', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', p.full_name,
                'expires_at', s.expires_at
            ) ORDER BY s.expires_at)
            FROM public.v_active_subscriptions s
            JOIN public.profiles p ON p.id = s.student_id
            WHERE s.expires_at <= now() + interval '7 days'
            LIMIT 5
        ), '[]'::jsonb)
    ) INTO v_stats;

    RETURN v_stats;
END $$;

-- Grant matrix: authenticated only, staff enforced in-function (same
-- posture as 0013/0014/0015/0016/0017). Explicit REVOKE FROM PUBLIC
-- first: new functions otherwise inherit the PUBLIC default grant,
-- which would break the "anon: exactly one executable function"
-- assertion in tests/local/sql/05_grants.sql.
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

-- =====================================================================
-- >>> included from migrations\0019_audit_logs.sql
-- =====================================================================

-- =====================================================================
-- 0019_audit_logs
-- Phase 8 | Notifications & Audit | Database
-- list_audit_logs / count_audit_logs: admin-only, filterable audit-log
-- reads for the /walid/audit UI (BLUEPRINT row 8). The audit trail is
-- INSERT-only by design; these two RPCs are the ONLY client read paths
-- (the audit_logs table is admin-SELECT-only via RLS, and the EF
-- export-audit-log reads via the service role with the same filters).
-- Guards mirror every other client RPC: is_admin() -> permission_denied
-- (mr_walid deliberately excluded - audit is admin-only).
-- Read-only: no audit row (nothing is mutated).
-- Reference: DATABASE.md section 6.4; SECURITY.md 8.2.
-- =====================================================================

-- ---------------------------------------------------------------------
-- list_audit_logs(...) RETURNS SETOF v_audit_log
--   p_from / p_to       created_at range (inclusive)
--   p_action            substring match on action (ILIKE)
--   p_entity_type       substring match on entity_type (ILIKE)
--   p_actor_id          exact actor filter
--   p_limit / p_offset  pagination (limit clamped to 1..200)
-- Ordered created_at DESC (newest first).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_audit_logs(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_action text DEFAULT NULL,
    p_entity_type text DEFAULT NULL,
    p_actor_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS SETOF public.v_audit_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    RETURN QUERY
    SELECT a.*
    FROM public.v_audit_log a
    WHERE (p_from IS NULL OR a.created_at >= p_from)
      AND (p_to IS NULL OR a.created_at <= p_to)
      AND (p_action IS NULL OR a.action ILIKE '%' || p_action || '%')
      AND (p_entity_type IS NULL OR a.entity_type ILIKE '%' || p_entity_type || '%')
      AND (p_actor_id IS NULL OR a.actor_id = p_actor_id)
    ORDER BY a.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END $$;

-- ---------------------------------------------------------------------
-- count_audit_logs(...) RETURNS bigint - same filters, no pagination.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_audit_logs(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_action text DEFAULT NULL,
    p_entity_type text DEFAULT NULL,
    p_actor_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count bigint;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT count(*) INTO v_count
    FROM public.v_audit_log a
    WHERE (p_from IS NULL OR a.created_at >= p_from)
      AND (p_to IS NULL OR a.created_at <= p_to)
      AND (p_action IS NULL OR a.action ILIKE '%' || p_action || '%')
      AND (p_entity_type IS NULL OR a.entity_type ILIKE '%' || p_entity_type || '%')
      AND (p_actor_id IS NULL OR a.actor_id = p_actor_id);

    RETURN v_count;
END $$;

-- Grant matrix: authenticated only, admin enforced in-function (same
-- posture as 0013/0018). Explicit REVOKE FROM PUBLIC first.
REVOKE EXECUTE ON FUNCTION public.list_audit_logs(timestamptz, timestamptz, text, text, uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_audit_logs(timestamptz, timestamptz, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_audit_logs(timestamptz, timestamptz, text, text, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_audit_logs(timestamptz, timestamptz, text, text, uuid) TO authenticated;

-- =====================================================================
-- >>> included from migrations\0020_security_hardening.sql
-- =====================================================================

-- =====================================================================
-- 0020_security_hardening
-- Phase 9 | Security Hardening | Database
-- Closing gaps found by the Phase 9 security review (read-only review
-- agent) WITHOUT changing any behavior tests rely on:
--
--   HARD-1 (MED): the intended "column-scoped" notifications UPDATE
--   policy (UPDATE OF is_read, read_at - documented as binding B2
--   "belt-and-braces") is invalid PostgreSQL: RLS policies cannot scope
--   columns, and FOR UPDATE OF is a SELECT row-lock clause that takes
--   table names only (SQLSTATE 42601 syntax error). The real B2
--   enforcement is the REVOKE in 0010: anon/authenticated hold no
--   direct UPDATE on notifications, so read-state writes exist only via
--   the security-definer mark_notification_read /
--   mark_all_notifications_read RPCs. This migration re-asserts the
--   row-level policy (0009 shape) and re-asserts the REVOKE so the
--   read-state-only surface cannot silently reappear through drift.
--
--   HARD-2 (LOW): pdfs_insert_row_backed (0015) treated ANY row-backed
--   path visible to the caller as insertable, including the ready
--   primary PDF of an accessible lesson. A student satisfying the
--   policy could plant bytes at a primary path if that object was ever
--   left dangling on the bucket. Tighten: only a NOT-ready, NOT-primary
--   (pending) row-backed path satisfies the INSERT policy. This still
--   permits the real upload-pdf EF flow (0015: create a pending row ->
--   issue the I4 signed upload URL -> PUT bytes -> finalize), and
--   prevents INSERT at ready/primary paths entirely.
--
-- HARD-2 does not disturb storage semantics: the pending row exists at
-- signed-URL issuance time, which is when storage checks the INSERT
-- policy; finalize (0007) flips is_ready/is_primary afterwards.
-- =====================================================================

-- ---------------------------------------------------------------------
-- HARD-1: notifications UPDATE policy - row-level only (column-scoping
-- is a privilege-layer concern, not an RLS one: FOR UPDATE OF is a
-- SELECT row-lock clause accepting table names only).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS notifications_update_read_state ON public.notifications;
CREATE POLICY notifications_update_read_state ON public.notifications
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Belt-and-braces (binding B2): re-assert the 0010 REVOKE idempotently.
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- HARD-2: pdfs INSERT policy only at pending (not ready, not primary)
-- row-backed paths - no planting at visible primary PDF objects.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        DROP POLICY IF EXISTS pdfs_insert_row_backed ON storage.objects;
        CREATE POLICY pdfs_insert_row_backed ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'pdfs'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
                AND EXISTS (
                    SELECT 1 FROM public.lesson_pdfs
                    WHERE storage_path = name AND deleted_at IS NULL
                      AND is_ready = false AND is_primary = false
                )
            );
    END IF;
END$$;

-- =====================================================================
-- >>> included from migrations\0021_fix_storage_rls_and_idempotency.sql
-- =====================================================================

-- =====================================================================
-- 0021_fix_storage_rls_and_idempotency
-- Phase 9 | Security Hardening | Database
-- Runtime fixes from the full-schema review (schema-analysis report):
--
--   H1: storage.objects had ONLY an INSERT policy (pdfs_insert_row_backed,
--   0015/0020). The Supabase Storage API performs INSERT ... RETURNING *,
--   so every upload aborts with 42501 ("new row violates row-level security
--   policy") unless a SELECT policy covers the inserted row. Fix: add the
--   row-backed SELECT mirror of the INSERT check - same bucket, same
--   {uuid}/{uuid}.pdf path shape, same existing non-deleted lesson_pdfs
--   row, same pending-only (is_ready=false AND is_primary=false, 0020
--   HARD-2) scope. Object reads of READY assets stay locked behind the
--   get-pdf-signed-url Edge Function (service key) as before.
--
--   H2: 0011 set FORCE ROW LEVEL SECURITY on storage.objects. The storage
--   service connects as supabase_storage_admin (rolbypassrls=false), so
--   under FORCE every storage-internal statement must satisfy a policy -
--   including operations the schema's single INSERT policy cannot cover
--   (finalize bookkeeping, moves, deletes, ownership updates), which fail
--   with 42501. Fix: NO FORCE (keep ENABLE), restoring the hosted default
--   where the table owner / storage service is exempt from RLS.
--
-- Both statements are guarded on to_regclass('storage.objects') so this
-- migration also runs unchanged on the local harness shim (which has the
-- same storage.objects surface) and on hosted (which always has it).
-- =====================================================================

-- ---------------------------------------------------------------------
-- H2: storage.objects - keep RLS enabled, drop FORCE.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
        BEGIN
            ALTER TABLE storage.objects NO FORCE ROW LEVEL SECURITY;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'storage.objects is platform-owned (supabase_storage_admin): skipping NO FORCE - hosted default is already not forced';
        END;
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- H1: pdfs SELECT policy - row-backed mirror of the INSERT check.
-- Required by the Storage API's INSERT ... RETURNING * upload path
-- (42501 without it); pending-only like the INSERT policy (0020 HARD-2).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
        DROP POLICY IF EXISTS pdfs_select_row_backed ON storage.objects;
        CREATE POLICY pdfs_select_row_backed ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'pdfs'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
                AND EXISTS (
                    SELECT 1 FROM public.lesson_pdfs
                    WHERE storage_path = name AND deleted_at IS NULL
                      AND is_ready = false AND is_primary = false
                )
            );
    END IF;
END$$;

-- =====================================================================
-- >>> included from migrations\0022_security_advisor_cleanup.sql
-- =====================================================================

-- =====================================================================
-- 0022_security_advisor_cleanup
-- Phase 10 | Security Advisor | Database
-- Dashboard Security Advisor cleanup (reproduced locally from the
-- canonical supabase/pg-meta advisor lint set, lints.ts):
--
--   S1 (WARN auth_rls_initplan): policies call auth.uid() directly in
--      the per-row expression, defeating the initplan optimization
--      (auth.uid() re-evaluated per row and per policy check). Fix:
--      wrap in (select auth.uid()) so it is evaluated once per query.
--      Behavior is identical; applies to the 9 policies flagged.
--
--      EXCEPTION (CRITICAL): the two PROFILES policies below keep the
--      direct auth.uid() form. Wrapping them in (select auth.uid())
--      makes the student self-service UPDATE
--      (profiles_update_own_self_service WITH CHECK self-references
--      profiles via SELECT p.role/grade_id/status FROM profiles p)
--      fail with "infinite recursion detected in policy for relation
--      profiles" (SQLSTATE 42P17) - verified empirically and still
--      present in 0025. Direct auth.uid() keeps the update plan
--      finite. auth.uid() is immutable per request, so per-row
--      re-evaluation is semantically identical.
--
--   S2 (WARN multiple_permissive_policies): 5 tables pair a FOR ALL
--      staff DML policy with a FOR SELECT policy, so SELECT has two
--      permissive policies OR-ed together. Fix: split the FOR ALL
--      policy into command-specific INSERT/UPDATE/DELETE policies with
--      identical expressions; each command now has exactly one policy.
--      Permissive OR semantics are provably unchanged.
--
--   S3 (INFO unindexed_foreign_keys): 9 foreign keys have no covering
--      index (FK checks + join scans are unindexed). Fix: one index per
--      FK column. IF NOT EXISTS so the file stays idempotent.
--
--   S4 (WARN function_search_path_mutable): SECURITY INVOKER functions
--      without a pinned search_path. Fix: SET search_path = public on
--      get_my_subscriptions() / get_my_current_subscription().
--
-- Left unfixed BY DESIGN (advisor suggestions, not defects):
--   * anon/authenticated_security_definer_function_executable: the app
--     is an RPC-first API - SECURITY DEFINER + in-function guards are
--     the documented enforcement layer (SECURITY.md section 8). The
--     advisor's proposed remedies (switch to INVOKER, revoke EXECUTE,
--     move out of the API schema) would break the application.
--   * is_admin/is_mr_walid/is_student/can_access_lesson EXECUTE grants:
--     PostgreSQL requires EXECUTE on functions referenced in policy
--     expressions; they are not exposed through the RPC surface.
--   * extension_in_public (pgcrypto): harness-only artifact - hosted
--     Supabase installs pgcrypto into the extensions schema, so the
--     advisor never flags it on a hosted project.
-- =====================================================================

-- ---------------------------------------------------------------------
-- S1: auth_rls_initplan - evaluate auth.uid() once via (select auth.uid()).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_own_or_staff ON public.profiles;
CREATE POLICY profiles_select_own_or_staff ON public.profiles
    FOR SELECT
    USING ((id = auth.uid() AND public.is_student()) OR public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS profiles_update_own_self_service ON public.profiles;
CREATE POLICY profiles_update_own_self_service ON public.profiles
    FOR UPDATE
    USING (id = auth.uid() AND public.is_student())
    WITH CHECK (
        id = auth.uid()
        AND role = (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id)
        AND grade_id = (SELECT p.grade_id FROM public.profiles p WHERE p.id = profiles.id)
        AND status = (SELECT p.status FROM public.profiles p WHERE p.id = profiles.id)
        AND deleted_at IS NULL
    );

DROP POLICY IF EXISTS subscriptions_select_own_or_staff ON public.subscriptions;
CREATE POLICY subscriptions_select_own_or_staff ON public.subscriptions
    FOR SELECT
    USING (student_id = (select auth.uid()) OR public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS code_redemptions_select_own_or_staff ON public.code_redemptions;
CREATE POLICY code_redemptions_select_own_or_staff ON public.code_redemptions
    FOR SELECT
    USING (student_id = (select auth.uid()) OR public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS units_select_staff_or_published_own_grade ON public.units;
CREATE POLICY units_select_staff_or_published_own_grade ON public.units
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid()
        OR (
            public.is_student()
            AND grade_id IN (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid()))
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            AND status = 'published'
            AND deleted_at IS NULL
        )
    );

DROP POLICY IF EXISTS lessons_select_staff_or_published_own_grade ON public.lessons;
CREATE POLICY lessons_select_staff_or_published_own_grade ON public.lessons
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid()
        OR (
            public.is_student()
            AND status = 'published'
            AND deleted_at IS NULL
            AND unit_id IN (
                SELECT id FROM public.units
                WHERE grade_id = (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid()))
                  AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
                  AND status = 'published'
                  AND deleted_at IS NULL
            )
        )
    );

DROP POLICY IF EXISTS progress_select_own_or_staff ON public.progress;
CREATE POLICY progress_select_own_or_staff ON public.progress
    FOR SELECT
    USING ((student_id = (select auth.uid()) AND public.is_student()) OR public.is_mr_walid() OR public.is_admin());

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
    FOR SELECT
    USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS notifications_update_read_state ON public.notifications;
CREATE POLICY notifications_update_read_state ON public.notifications
    FOR UPDATE
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- S2: multiple_permissive_policies - split FOR ALL DML policies so each
-- command has exactly one permissive policy (identical expressions).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS grades_dml_staff ON public.grades;
DROP POLICY IF EXISTS grades_insert_staff ON public.grades;
CREATE POLICY grades_insert_staff ON public.grades
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid());
DROP POLICY IF EXISTS grades_update_staff ON public.grades;
CREATE POLICY grades_update_staff ON public.grades
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid())
    WITH CHECK (public.is_admin() OR public.is_mr_walid());
DROP POLICY IF EXISTS grades_delete_staff ON public.grades;
CREATE POLICY grades_delete_staff ON public.grades
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS pricing_plans_dml_admin ON public.pricing_plans;
DROP POLICY IF EXISTS pricing_plans_insert_admin ON public.pricing_plans;
CREATE POLICY pricing_plans_insert_admin ON public.pricing_plans
    FOR INSERT WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS pricing_plans_update_admin ON public.pricing_plans;
CREATE POLICY pricing_plans_update_admin ON public.pricing_plans
    FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS pricing_plans_delete_admin ON public.pricing_plans;
CREATE POLICY pricing_plans_delete_admin ON public.pricing_plans
    FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS units_dml_staff ON public.units;
DROP POLICY IF EXISTS units_insert_staff ON public.units;
CREATE POLICY units_insert_staff ON public.units
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid());
DROP POLICY IF EXISTS units_update_staff ON public.units;
CREATE POLICY units_update_staff ON public.units
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid())
    WITH CHECK (public.is_admin() OR public.is_mr_walid());
DROP POLICY IF EXISTS units_delete_staff ON public.units;
CREATE POLICY units_delete_staff ON public.units
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS lessons_dml_staff ON public.lessons;
DROP POLICY IF EXISTS lessons_insert_staff ON public.lessons;
CREATE POLICY lessons_insert_staff ON public.lessons
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid());
DROP POLICY IF EXISTS lessons_update_staff ON public.lessons;
CREATE POLICY lessons_update_staff ON public.lessons
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid())
    WITH CHECK (public.is_admin() OR public.is_mr_walid());
DROP POLICY IF EXISTS lessons_delete_staff ON public.lessons;
CREATE POLICY lessons_delete_staff ON public.lessons
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS app_settings_write_staff ON public.app_settings;
DROP POLICY IF EXISTS app_settings_insert_staff ON public.app_settings;
CREATE POLICY app_settings_insert_staff ON public.app_settings
    FOR INSERT
    WITH CHECK (public.is_admin() OR (public.is_mr_walid() AND key LIKE 'whatsapp%'));
DROP POLICY IF EXISTS app_settings_update_staff ON public.app_settings;
CREATE POLICY app_settings_update_staff ON public.app_settings
    FOR UPDATE
    USING (public.is_admin() OR (public.is_mr_walid() AND key LIKE 'whatsapp%'))
    WITH CHECK (public.is_admin() OR (public.is_mr_walid() AND key LIKE 'whatsapp%'));
-- NOTE: no DELETE policy on app_settings - settings are upsert-only via
-- set_app_setting() / INSERT .. ON CONFLICT DO UPDATE (SECURITY.md section 6
-- documents UPDATE/INSERT only). Removing the DELETE policy removes the
-- ability to hard-delete settings such as whatsapp_number or platform_name.

-- ---------------------------------------------------------------------
-- S3: unindexed_foreign_keys - covering index per FK column.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_app_settings_updated_by        ON public.app_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_code_redemptions_subscription_id ON public.code_redemptions (subscription_id);
CREATE INDEX IF NOT EXISTS idx_progress_video_id               ON public.progress (video_id);
CREATE INDEX IF NOT EXISTS idx_subscription_codes_created_by   ON public.subscription_codes (created_by);
CREATE INDEX IF NOT EXISTS idx_subscription_codes_pricing_plan ON public.subscription_codes (pricing_plan_id);
CREATE INDEX IF NOT EXISTS idx_subscription_codes_revoked_by   ON public.subscription_codes (revoked_by);
CREATE INDEX IF NOT EXISTS idx_subscription_codes_used_by      ON public.subscription_codes (used_by);
CREATE INDEX IF NOT EXISTS idx_subscriptions_code_id           ON public.subscriptions (code_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_pricing_plan      ON public.subscriptions (pricing_plan_id);

-- ---------------------------------------------------------------------
-- S4: function_search_path_mutable - pin search_path on the two
-- SECURITY INVOKER RPCs (bodies use fully-qualified names).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_subscriptions()
RETURNS SETOF public.subscriptions
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT * FROM public.subscriptions
    WHERE student_id = auth.uid()
    ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_my_current_subscription()
RETURNS public.subscriptions
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT * FROM public.subscriptions
    WHERE student_id = auth.uid()
      AND status = 'active'
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
$$;

-- =====================================================================
-- >>> included from migrations\0023_add_teacher_role.sql
-- =====================================================================

-- =====================================================================
-- 0023_add_teacher_role
-- Adds the 'teacher' role and an admin-only RPC to promote a user to a
-- role by email (case-insensitive). Same audit path as set_user_role.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Add 'teacher' to public.user_role (idempotent)
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum
        WHERE enumtypid = 'public.user_role'::regtype
          AND enumlabel = 'teacher'
    ) THEN
        ALTER TYPE public.user_role ADD VALUE 'teacher';
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- set_role_by_email(p_email, p_role)
-- admin-only; THE ONLY path that mutates role via email lookup.
-- Usage: SELECT public.set_role_by_email('user@example.com', 'teacher');
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_role_by_email(
    p_email text,
    p_role public.user_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_old public.user_role;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = lower(btrim(p_email));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;

    SELECT role INTO v_old FROM public.profiles WHERE id = v_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'profile_not_found';
    END IF;

    UPDATE public.profiles SET role = p_role WHERE id = v_user_id;

    PERFORM public.audit_log('user.role_change', 'profile', v_user_id,
        jsonb_build_object('old_role', v_old, 'new_role', p_role));
END $$;

COMMENT ON FUNCTION public.set_role_by_email(text, public.user_role) IS 'Admin-only: sets a user''s role by auth email (case-insensitive). Audited exactly like set_user_role.';

REVOKE EXECUTE ON FUNCTION public.set_role_by_email(text, public.user_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_role_by_email(text, public.user_role) TO authenticated;

-- =====================================================================
-- >>> included from migrations\0024_rename_platform_name.sql
-- =====================================================================

-- Update the platform display name in the live database.
-- The original 0011 seed used ON CONFLICT DO NOTHING, so an existing
-- row keeps the old English value; this migration explicitly updates it.
UPDATE public.app_settings
SET value = '"منصة مستر وليد عونى التعليمية"',
    updated_at = now()
WHERE key = 'platform_name';

-- =====================================================================
-- >>> included from migrations\0025_teacher_access.sql
-- =====================================================================

-- =====================================================================
-- 0025_teacher_access
-- Grants the 'teacher' role the same staff surface as mr_walid:
--
--   1. is_teacher() role helper (mirrors 0003's is_mr_walid; STABLE +
--      SECURITY DEFINER, search_path pinned) granted to authenticated so
--      policy expressions can evaluate it (0022's S1 note).
--   2. RLS policies: every staff branch gets `OR public.is_teacher()`.
--      Each policy below is the CURRENT canonical version (0009 or the
--      S1/S2 rewrite in 0022) recreated VERBATIM with only the teacher
--      branch appended - the (select auth.uid()) initplan fix and the
--      command-specific split policies are preserved.
--   3. Staff RPC guards: `IF NOT (public.is_admin() OR public.is_mr_walid())`
--      becomes `IF NOT (public.is_admin() OR public.is_mr_walid() OR
--      public.is_teacher())` via CREATE OR REPLACE FUNCTION with
--      identical signatures and bodies (only the guard changes).
--      Grants are preserved by CREATE OR REPLACE.
--
-- Intentionally NOT opened to teachers (admin/mr_walid only, or
-- student-only as before): set_user_role, set_role_by_email,
-- set_pricing_plan, delete_pricing_plan, set_app_setting,
-- update_own_profile, profiles_update_own_self_service,
-- pricing_plans DML, app_settings write, audit_logs (select + RPCs).
-- =====================================================================

-- ---------------------------------------------------------------------
-- is_teacher() role helper (mirrors 0003:39-47 is_mr_walid)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT role = 'teacher' FROM public.profiles WHERE id = auth.uid()), false);
$$;

COMMENT ON FUNCTION public.is_teacher() IS 'Current caller is a teacher. RLS policy helper - granted to authenticated for policy evaluation only.';

REVOKE EXECUTE ON FUNCTION public.is_teacher() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_teacher() TO authenticated;

-- ---------------------------------------------------------------------
-- profiles - SELECT own/staff (0022:45-48 + teacher branch)
-- ---------------------------------------------------------------------
-- NOTE: keeps the direct auth.uid() form from 0022 (NOT the
-- (select auth.uid()) initplan fix) - the sublink wrapper makes the
-- student self-service UPDATE recurse (SQLSTATE 42P17); see 0022's S1
-- exception comment.
DROP POLICY IF EXISTS profiles_select_own_or_staff ON public.profiles;
CREATE POLICY profiles_select_own_or_staff ON public.profiles
    FOR SELECT
    USING ((id = auth.uid() AND public.is_student()) OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- grades - SELECT staff/active-students (0009:74-78) + DML (0022:125-133)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS grades_select_staff_or_active_students ON public.grades;
CREATE POLICY grades_select_staff_or_active_students ON public.grades
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
           OR (public.is_student() AND deleted_at IS NULL AND is_active));

DROP POLICY IF EXISTS grades_insert_staff ON public.grades;
CREATE POLICY grades_insert_staff ON public.grades
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS grades_update_staff ON public.grades;
CREATE POLICY grades_update_staff ON public.grades
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS grades_delete_staff ON public.grades;
CREATE POLICY grades_delete_staff ON public.grades
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- pricing_plans - SELECT staff/active-students (0009:89-93)
-- DML stays admin-only (0009:95-99 / 0022:135-143).
-- Student branch is grade-bound: active plans for the student's own grade
-- only, and the plan's grade must itself be active and non-deleted
-- (SECURITY.md section 6; same shape as units/lessons below).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS pricing_plans_select_staff_or_active_students ON public.pricing_plans;
CREATE POLICY pricing_plans_select_staff_or_active_students ON public.pricing_plans
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (
            public.is_student()
            AND is_active
            AND grade_id IN (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid()))
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
        )
    );

-- ---------------------------------------------------------------------
-- subscriptions / code_redemptions - SELECT own/staff (0022:62-65, 67-70)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS subscriptions_select_own_or_staff ON public.subscriptions;
CREATE POLICY subscriptions_select_own_or_staff ON public.subscriptions
    FOR SELECT
    USING (student_id = (select auth.uid()) OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS code_redemptions_select_own_or_staff ON public.code_redemptions;
CREATE POLICY code_redemptions_select_own_or_staff ON public.code_redemptions
    FOR SELECT
    USING (student_id = (select auth.uid()) OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- subscription_codes - SELECT staff (0009:114-117)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS subscription_codes_select_staff ON public.subscription_codes;
CREATE POLICY subscription_codes_select_staff ON public.subscription_codes
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- units - SELECT staff/published-own-grade (0022:72-84) + DML (0022:145-153)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS units_select_staff_or_published_own_grade ON public.units;
CREATE POLICY units_select_staff_or_published_own_grade ON public.units
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (
            public.is_student()
            AND grade_id IN (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid()))
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            AND status = 'published'
            AND deleted_at IS NULL
        )
    );

DROP POLICY IF EXISTS units_insert_staff ON public.units;
CREATE POLICY units_insert_staff ON public.units
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS units_update_staff ON public.units;
CREATE POLICY units_update_staff ON public.units
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS units_delete_staff ON public.units;
CREATE POLICY units_delete_staff ON public.units
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- lessons - SELECT staff/published-own-grade (0022:86-103) + DML (0022:155-163)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lessons_select_staff_or_published_own_grade ON public.lessons;
CREATE POLICY lessons_select_staff_or_published_own_grade ON public.lessons
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (
            public.is_student()
            AND status = 'published'
            AND deleted_at IS NULL
            AND unit_id IN (
                SELECT id FROM public.units
                WHERE grade_id = (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid()))
                  AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
                  AND status = 'published'
                  AND deleted_at IS NULL
            )
        )
    );

DROP POLICY IF EXISTS lessons_insert_staff ON public.lessons;
CREATE POLICY lessons_insert_staff ON public.lessons
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS lessons_update_staff ON public.lessons;
CREATE POLICY lessons_update_staff ON public.lessons
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS lessons_delete_staff ON public.lessons;
CREATE POLICY lessons_delete_staff ON public.lessons
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- lesson_videos / lesson_pdfs - SELECT gated (0009:188-195, 201-208)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_videos_select_gated ON public.lesson_videos;
CREATE POLICY lesson_videos_select_gated ON public.lesson_videos
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND status = 'ready' AND is_primary)
    );

DROP POLICY IF EXISTS lesson_pdfs_select_gated ON public.lesson_pdfs;
CREATE POLICY lesson_pdfs_select_gated ON public.lesson_pdfs
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND is_ready AND is_primary)
    );

-- ---------------------------------------------------------------------
-- progress - SELECT own/staff (0022:105-108)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS progress_select_own_or_staff ON public.progress;
CREATE POLICY progress_select_own_or_staff ON public.progress
    FOR SELECT
    USING ((student_id = (select auth.uid()) AND public.is_student()) OR public.is_mr_walid() OR public.is_admin() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- app_settings - SELECT staff (0009:248-251); write stays
-- admin / mr_walid-whatsapp% only (0009:253-257, 0022:165-175).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS app_settings_select_staff ON public.app_settings;
CREATE POLICY app_settings_select_staff ON public.app_settings
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- Staff RPC guards: append OR public.is_teacher() to every
-- `IF NOT (public.is_admin() OR public.is_mr_walid())` check.
-- Signatures and bodies are otherwise identical to the canonical
-- definitions (0007 / 0012 / 0013 / 0014 / 0015 / 0016 / 0017 / 0018).
-- ---------------------------------------------------------------------

-- --- student management ----------------------------------------------
CREATE OR REPLACE FUNCTION public.set_student_grade(p_student_id uuid, p_grade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old uuid;
    v_role public.user_role;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT role, grade_id INTO v_role, v_old FROM public.profiles WHERE id = p_student_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;
    IF v_role <> 'student' THEN
        RAISE EXCEPTION 'not_a_student';
    END IF;

    -- NULL clears the grade (A1: grade is nullable); only non-NULL ids
    -- must exist, be active and not soft-deleted.
    IF p_grade_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.grades WHERE id = p_grade_id AND is_active AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'grade_not_available';
    END IF;

    UPDATE public.profiles SET grade_id = p_grade_id WHERE id = p_student_id;

    PERFORM public.audit_log('student.grade_change', 'profile', p_student_id,
        jsonb_build_object('old_grade_id', v_old, 'new_grade_id', p_grade_id));
END $$;

CREATE OR REPLACE FUNCTION public.disable_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.profiles
    SET status = 'disabled'
    WHERE id = p_student_id AND role = 'student' AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.revoke_sessions_if_possible(p_student_id);
    PERFORM public.audit_log('student.disable', 'profile', p_student_id);
END $$;

CREATE OR REPLACE FUNCTION public.enable_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.profiles
    SET status = 'active'
    WHERE id = p_student_id AND role = 'student' AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.audit_log('student.enable', 'profile', p_student_id);
END $$;

CREATE OR REPLACE FUNCTION public.soft_delete_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.profiles
    SET deleted_at = now(), status = 'disabled'
    WHERE id = p_student_id AND role = 'student';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.revoke_sessions_if_possible(p_student_id);
    PERFORM public.audit_log('student.soft_delete', 'profile', p_student_id);
END $$;

CREATE OR REPLACE FUNCTION public.restore_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.profiles
    SET deleted_at = NULL, status = 'active'
    WHERE id = p_student_id AND role = 'student';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.audit_log('student.restore', 'profile', p_student_id);
END $$;

CREATE OR REPLACE FUNCTION public.update_student_profile(
    p_student_id uuid,
    p_full_name text,
    p_phone text,
    p_guardian_phone text,
    p_address text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_changed text[] := '{}'::text[];
    v_full_name text;
    v_phone text;
    v_guardian_phone text;
    v_address text;
    v_role text;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT full_name, phone, guardian_phone, address, role
    INTO v_full_name, v_phone, v_guardian_phone, v_address, v_role
    FROM public.profiles WHERE id = p_student_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    IF v_role <> 'student' THEN
        RAISE EXCEPTION 'target_not_student';
    END IF;

    IF btrim(COALESCE(p_full_name, '')) IS DISTINCT FROM v_full_name THEN
        v_changed := array_append(v_changed, 'full_name');
    END IF;
    IF btrim(COALESCE(p_phone, '')) IS DISTINCT FROM v_phone THEN
        v_changed := array_append(v_changed, 'phone');
    END IF;
    IF btrim(COALESCE(p_guardian_phone, '')) IS DISTINCT FROM v_guardian_phone THEN
        v_changed := array_append(v_changed, 'guardian_phone');
    END IF;
    IF btrim(COALESCE(p_address, '')) IS DISTINCT FROM v_address THEN
        v_changed := array_append(v_changed, 'address');
    END IF;

    UPDATE public.profiles
    SET full_name = btrim(p_full_name),
        phone = btrim(p_phone),
        guardian_phone = btrim(p_guardian_phone),
        address = btrim(p_address)
    WHERE id = p_student_id;

    PERFORM public.audit_log('student.profile_update', 'profile', p_student_id,
        jsonb_build_object('changed_fields', to_jsonb(v_changed)));
END $$;

CREATE OR REPLACE FUNCTION public.list_trash()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    RETURN QUERY
    SELECT * FROM public.profiles
    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC;
END $$;

-- --- subscriptions / codes -------------------------------------------
CREATE OR REPLACE FUNCTION public.create_manual_subscription(
    p_student_id uuid,
    p_plan_id uuid,
    p_started_at timestamptz,
    p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan public.pricing_plans%ROWTYPE;
    v_sub_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_student_id AND role = 'student') THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    SELECT * INTO v_plan FROM public.pricing_plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'plan_not_found';
    END IF;

    -- mirror redeem_subscription_code (0006:116,124 / binding B8): inactive
    -- plans and plans on inactive or deleted grades are not purchasable
    IF NOT v_plan.is_active THEN
        RAISE EXCEPTION 'plan_not_available';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.grades
        WHERE id = v_plan.grade_id AND is_active AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'plan_not_available';
    END IF;

    INSERT INTO public.subscriptions (
        student_id, pricing_plan_id, base_price, platform_fee, total_price,
        source, started_at, expires_at, status
    )
    VALUES (
        p_student_id, v_plan.id, v_plan.base_price, v_plan.platform_fee,
        v_plan.total_price, 'manual', p_started_at,
        p_started_at + (v_plan.duration_days || ' days')::interval, 'active'
    )
    RETURNING id INTO v_sub_id;

    PERFORM public.audit_log('subscription.create_manual', 'subscription', v_sub_id,
        jsonb_build_object('plan_id', v_plan.id, 'notes', p_notes));

    RETURN v_sub_id;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_subscription_code(p_code_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prev public.code_status;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT status INTO v_prev FROM public.subscription_codes WHERE id = p_code_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'code_not_found';
    END IF;

    UPDATE public.subscription_codes
    SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
    WHERE id = p_code_id AND status IN ('available', 'used');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'code_not_revocable';
    END IF;

    PERFORM public.audit_log('code.revoke', 'subscription_code', p_code_id,
        jsonb_build_object('previous_status', v_prev));
END $$;

-- --- grades lifecycle ------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_grade(p_grade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.grades SET deleted_at = now() WHERE id = p_grade_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'grade_not_found';
    END IF;

    PERFORM public.audit_log('grade.delete', 'grade', p_grade_id);
END $$;

CREATE OR REPLACE FUNCTION public.restore_grade(p_grade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.grades SET deleted_at = NULL WHERE id = p_grade_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'grade_not_found';
    END IF;

    PERFORM public.audit_log('grade.restore', 'grade', p_grade_id);
END $$;

CREATE OR REPLACE FUNCTION public.create_grade(p_name text, p_sort_order integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF btrim(COALESCE(p_name, '')) = '' THEN
        RAISE EXCEPTION 'grade_name_required';
    END IF;

    IF EXISTS (SELECT 1 FROM public.grades WHERE name = btrim(p_name)) THEN
        RAISE EXCEPTION 'duplicate grade';
    END IF;

    BEGIN
        INSERT INTO public.grades (name, sort_order)
        VALUES (btrim(p_name), p_sort_order)
        RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
        -- race backstop for the concurrent create path
        RAISE EXCEPTION 'duplicate grade';
    END;

    PERFORM public.audit_log('grade.create', 'grade', v_id,
        jsonb_build_object('name', btrim(p_name), 'sort_order', p_sort_order));

    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_grade(
    p_grade_id uuid,
    p_name text DEFAULT NULL,
    p_sort_order integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_name text;
    v_sort_order integer;
    v_deleted_at timestamptz;
    v_is_active boolean;
    v_meta jsonb := '{}'::jsonb;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT name, sort_order, deleted_at, is_active
    INTO v_name, v_sort_order, v_deleted_at, v_is_active
    FROM public.grades WHERE id = p_grade_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'grade_not_found';
    END IF;
    IF v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'grade_deleted';
    END IF;
    IF NOT v_is_active THEN
        RAISE EXCEPTION 'grade_inactive';
    END IF;

    IF p_name IS NOT NULL AND btrim(p_name) = '' THEN
        RAISE EXCEPTION 'grade_name_required';
    END IF;

    IF p_name IS NOT NULL AND btrim(p_name) <> v_name
       AND EXISTS (SELECT 1 FROM public.grades WHERE name = btrim(p_name) AND id <> p_grade_id) THEN
        RAISE EXCEPTION 'duplicate grade';
    END IF;

    -- No-op: nothing provided, or every provided field already matches.
    IF (p_name IS NULL OR btrim(p_name) = v_name)
       AND (p_sort_order IS NULL OR p_sort_order = v_sort_order) THEN
        RETURN;
    END IF;

    BEGIN
        UPDATE public.grades
        SET name = COALESCE(NULLIF(btrim(p_name), ''), name),
            sort_order = COALESCE(p_sort_order, sort_order)
        WHERE id = p_grade_id;
    EXCEPTION WHEN unique_violation THEN
        -- race backstop for the concurrent rename path
        RAISE EXCEPTION 'duplicate grade';
    END;

    IF p_name IS NOT NULL AND btrim(p_name) <> v_name THEN
        v_meta := v_meta || jsonb_build_object('name', btrim(p_name), 'old_name', v_name);
    END IF;
    IF p_sort_order IS NOT NULL AND p_sort_order <> v_sort_order THEN
        v_meta := v_meta || jsonb_build_object('sort_order', p_sort_order);
    END IF;

    PERFORM public.audit_log('grade.update', 'grade', p_grade_id, v_meta);
END $$;

-- --- units lifecycle -------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_unit(p_grade_id uuid, p_name text, p_sort_order integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    INSERT INTO public.units (grade_id, name, sort_order) VALUES (p_grade_id, btrim(p_name), p_sort_order)
    RETURNING id INTO v_id;

    PERFORM public.audit_log('unit.create', 'unit', v_id, jsonb_build_object('grade_id', p_grade_id));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_unit(p_unit_id uuid, p_name text, p_sort_order integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.units
    SET name = COALESCE(btrim(NULLIF(p_name, '')), name),
        sort_order = COALESCE(p_sort_order, sort_order)
    WHERE id = p_unit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    PERFORM public.audit_log('unit.update', 'unit', p_unit_id);
END $$;

CREATE OR REPLACE FUNCTION public.delete_unit(p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.units SET deleted_at = now() WHERE id = p_unit_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    PERFORM public.audit_log('unit.delete', 'unit', p_unit_id);
END $$;

CREATE OR REPLACE FUNCTION public.restore_unit(p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.units SET deleted_at = NULL WHERE id = p_unit_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    PERFORM public.audit_log('unit.restore', 'unit', p_unit_id);
END $$;

-- --- lessons lifecycle -----------------------------------------------
CREATE OR REPLACE FUNCTION public.create_lesson(p_unit_id uuid, p_title text, p_description text DEFAULT NULL, p_sort_order integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    INSERT INTO public.lessons (unit_id, title, description, sort_order)
    VALUES (p_unit_id, btrim(p_title), p_description, p_sort_order)
    RETURNING id INTO v_id;

    PERFORM public.audit_log('lesson.create', 'lesson', v_id, jsonb_build_object('unit_id', p_unit_id));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_lesson(p_lesson_id uuid, p_title text, p_description text DEFAULT NULL, p_sort_order integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons
    SET title = COALESCE(btrim(NULLIF(p_title, '')), title),
        description = COALESCE(p_description, description),
        sort_order = COALESCE(p_sort_order, sort_order)
    WHERE id = p_lesson_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.update', 'lesson', p_lesson_id);
END $$;

CREATE OR REPLACE FUNCTION public.publish_lesson(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons
    SET status = 'published', published_at = now()
    WHERE id = p_lesson_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.publish', 'lesson', p_lesson_id);
    PERFORM public.notify_new_content(p_lesson_id);
END $$;

CREATE OR REPLACE FUNCTION public.hide_lesson(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons SET status = 'hidden' WHERE id = p_lesson_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.hide', 'lesson', p_lesson_id);
END $$;

CREATE OR REPLACE FUNCTION public.soft_delete_lesson(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons SET deleted_at = now() WHERE id = p_lesson_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.soft_delete', 'lesson', p_lesson_id);
END $$;

CREATE OR REPLACE FUNCTION public.restore_lesson(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons SET deleted_at = NULL WHERE id = p_lesson_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.restore', 'lesson', p_lesson_id);
END $$;

-- --- assets ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_pdf_upload(p_pdf_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT lesson_id INTO v_lesson FROM public.lesson_pdfs WHERE id = p_pdf_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'pdf_not_found';
    END IF;

    UPDATE public.lesson_pdfs
    SET is_primary = false
    WHERE lesson_id = v_lesson AND id <> p_pdf_id AND is_primary AND deleted_at IS NULL;

    UPDATE public.lesson_pdfs SET is_ready = true, is_primary = true WHERE id = p_pdf_id;

    PERFORM public.audit_log('pdf.finalize', 'lesson_pdf', p_pdf_id,
        jsonb_build_object('lesson_id', v_lesson));
END $$;

CREATE OR REPLACE FUNCTION public.create_codes_for_staff(
    p_plan_id uuid,
    p_count integer,
    p_note text DEFAULT NULL
)
RETURNS SETOF public.subscription_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    RETURN QUERY SELECT * FROM public.generate_codes_internal(p_plan_id, p_count, p_note);
END $$;

CREATE OR REPLACE FUNCTION public.create_pdf_upload_record(
    p_lesson_id uuid,
    p_original_name text,
    p_size_bytes bigint DEFAULT NULL
)
RETURNS TABLE (id uuid, storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_path text;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_size_bytes IS NOT NULL AND (p_size_bytes < 0 OR p_size_bytes > 52428800) THEN
        RAISE EXCEPTION 'invalid_pdf_size';
    END IF;

    -- NOTE: unqualified column refs must be avoided: the RETURNS TABLE
    -- OUT parameter `id` shadows table columns in SQL statements.
    IF NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id) THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id AND l.deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'lesson_deleted';
    END IF;

    v_path := p_lesson_id::text || '/' || gen_random_uuid()::text || '.pdf';

    INSERT INTO public.lesson_pdfs (lesson_id, storage_path, original_name, size_bytes, is_ready, is_primary)
    VALUES (p_lesson_id, v_path, btrim(p_original_name), p_size_bytes, false, false)
    RETURNING lesson_pdfs.id INTO v_id;

    PERFORM public.audit_log('pdf.upload_started', 'lesson_pdf', v_id,
        jsonb_build_object('lesson_id', p_lesson_id, 'original_name', p_original_name,
                           'storage_path', v_path, 'size_bytes', p_size_bytes));

    RETURN QUERY SELECT v_id, v_path;
END $$;

CREATE OR REPLACE FUNCTION public.create_video_upload_record(
    p_lesson_id uuid,
    p_bunny_video_id text,
    p_bunny_library_id text,
    p_title text,
    p_mode text,
    p_old_video_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, is_primary boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_primary boolean;
    v_old_status public.video_status;
    v_old_lesson uuid;
BEGIN
    -- staff guard reads the request-scoped claims (is_admin/is_mr_walid
    -- are RLS policy helpers granted to authenticated; see 0010)
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_mode NOT IN ('create', 'replace') THEN
        RAISE EXCEPTION 'invalid_mode';
    END IF;

    IF p_bunny_video_id IS NULL OR btrim(p_bunny_video_id) = ''
       OR p_bunny_library_id IS NULL OR btrim(p_bunny_library_id) = '' THEN
        RAISE EXCEPTION 'invalid_bunny_video_id';
    END IF;

    -- NOTE: unqualified column refs must be avoided: the RETURNS TABLE
    -- OUT parameters (id, is_primary) shadow table columns in SQL
    -- statements (same rule as 0015 §85).
    IF NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id) THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id AND l.deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'lesson_deleted';
    END IF;

    -- orphan-session guard (Phase 1 rule): at most one pending upload
    IF EXISTS (
        SELECT 1 FROM public.lesson_videos lv
        WHERE lv.lesson_id = p_lesson_id
          AND lv.status = 'pending_upload'
          AND lv.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'lesson_has_pending_upload';
    END IF;

    IF p_mode = 'replace' THEN
        IF p_old_video_id IS NULL THEN
            RAISE EXCEPTION 'old_video_required';
        END IF;
        SELECT lv.status, lv.lesson_id INTO v_old_status, v_old_lesson
        FROM public.lesson_videos lv
        WHERE lv.id = p_old_video_id AND lv.deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'old_video_not_found';
        END IF;
        IF v_old_lesson <> p_lesson_id THEN
            RAISE EXCEPTION 'wrong_lesson';
        END IF;
        IF v_old_status <> 'ready' THEN
            RAISE EXCEPTION 'old_video_not_ready';
        END IF;
        v_primary := false;
    ELSE
        v_primary := NOT EXISTS (
            SELECT 1 FROM public.lesson_videos lv
            WHERE lv.lesson_id = p_lesson_id AND lv.is_primary AND lv.deleted_at IS NULL
        );
    END IF;

    INSERT INTO public.lesson_videos
        (lesson_id, bunny_video_id, bunny_library_id, title, status, is_primary, sort_order)
    VALUES
        (p_lesson_id, btrim(p_bunny_video_id), btrim(p_bunny_library_id),
         btrim(p_title), 'pending_upload', v_primary, 0)
    RETURNING lesson_videos.id INTO v_id;

    PERFORM public.audit_log('video.upload_session_created', 'lesson_video', v_id,
        jsonb_build_object('lesson_id', p_lesson_id, 'mode', p_mode,
                           'bunny_video_id', p_bunny_video_id,
                           'old_video_id', p_old_video_id,
                           'is_primary', v_primary));

    RETURN QUERY SELECT v_id, v_primary;
END $$;

CREATE OR REPLACE FUNCTION public.delete_video_upload_record(
    p_lesson_id uuid,
    p_video_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
    v_status public.video_status;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lv.lesson_id, lv.status INTO v_lesson, v_status
    FROM public.lesson_videos lv
    WHERE lv.id = p_video_id AND lv.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'video_not_found';
    END IF;
    IF v_lesson <> p_lesson_id THEN
        RAISE EXCEPTION 'wrong_lesson';
    END IF;
    IF v_status <> 'pending_upload' THEN
        RAISE EXCEPTION 'video_not_pending';
    END IF;

    DELETE FROM public.lesson_videos WHERE id = p_video_id;

    PERFORM public.audit_log('video.upload_session_cancelled', 'lesson_video', p_video_id,
        jsonb_build_object('lesson_id', p_lesson_id));
END $$;

-- --- dashboards ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stats jsonb;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT jsonb_build_object(
        'students', jsonb_build_object(
            'total',        (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL),
            'active',       (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'active'),
            'disabled',     (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'disabled'),
            'deleted',      (SELECT count(*) FROM public.profiles WHERE deleted_at IS NOT NULL),
            'new_this_month', (SELECT count(*) FROM public.profiles
                               WHERE deleted_at IS NULL AND created_at >= date_trunc('month', now()))
        ),
        'subscriptions', jsonb_build_object(
            'active',               (SELECT count(*) FROM public.v_active_subscriptions),
            'expiring_7d',          (SELECT count(*) FROM public.v_active_subscriptions
                                     WHERE expires_at <= now() + interval '7 days'),
            'expired',              (SELECT count(*) FROM public.subscriptions WHERE status = 'expired'),
            'revenue_total',        (SELECT COALESCE(sum(total_price), 0) FROM public.v_active_subscriptions),
            'revenue_this_month',   (SELECT COALESCE(sum(total_price), 0) FROM public.subscriptions
                                     WHERE status = 'active' AND started_at >= date_trunc('month', now()))
        ),
        'content', jsonb_build_object(
            'grades',           (SELECT count(*) FROM public.grades WHERE deleted_at IS NULL),
            'units',            (SELECT count(*) FROM public.units WHERE deleted_at IS NULL),
            'lessons',          (SELECT count(*) FROM public.lessons WHERE deleted_at IS NULL),
            'published_lessons',(SELECT count(*) FROM public.lessons WHERE deleted_at IS NULL AND status = 'published'),
            'videos',           (SELECT count(*) FROM public.lesson_videos WHERE deleted_at IS NULL),
            'videos_ready',     (SELECT count(*) FROM public.lesson_videos WHERE deleted_at IS NULL AND status = 'ready'),
            'pdfs',             (SELECT count(*) FROM public.lesson_pdfs WHERE deleted_at IS NULL),
            'pdfs_ready',       (SELECT count(*) FROM public.lesson_pdfs WHERE deleted_at IS NULL AND is_ready)
        ),
        'engagement', jsonb_build_object(
            'students_with_progress', (SELECT count(DISTINCT student_id) FROM public.progress),
            'completed_lessons',      (SELECT count(*) FROM public.progress WHERE is_completed),
            'avg_percent',            (SELECT COALESCE(round(avg(percent_completed), 2), 0) FROM public.progress)
        ),
        'codes', jsonb_build_object(
            'available', (SELECT count(*) FROM public.subscription_codes WHERE status = 'available'),
            'used',      (SELECT count(*) FROM public.subscription_codes WHERE status = 'used'),
            'revoked',   (SELECT count(*) FROM public.subscription_codes WHERE status = 'revoked')
        ),
        'by_grade', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'grade_name', r.grade_name,
                'students', r.students,
                'active_subscribers', r.active_subscribers
            ) ORDER BY r.sort_order)
            FROM (
                SELECT g.name AS grade_name, g.sort_order,
                       count(DISTINCT p.id) AS students,
                       count(DISTINCT s.student_id) AS active_subscribers
                FROM public.grades g
                LEFT JOIN public.profiles p
                       ON p.grade_id = g.id AND p.deleted_at IS NULL
                LEFT JOIN public.v_active_subscriptions s ON s.student_id = p.id
                WHERE g.deleted_at IS NULL
                GROUP BY g.id, g.name, g.sort_order
            ) r
        ), '[]'::jsonb),
        'recent_subscriptions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', p.full_name,
                'grade_name', g.name,
                'duration_days', pl.duration_days,
                'total_price', s.total_price,
                'status', s.status,
                'started_at', s.started_at,
                'expires_at', s.expires_at
            ) ORDER BY s.created_at DESC)
            FROM public.subscriptions s
            JOIN public.profiles p ON p.id = s.student_id
            JOIN public.pricing_plans pl ON pl.id = s.pricing_plan_id
            LEFT JOIN public.grades g ON g.id = pl.grade_id
            LIMIT 5
        ), '[]'::jsonb),
        'upcoming_expirations', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', p.full_name,
                'expires_at', s.expires_at
            ) ORDER BY s.expires_at)
            FROM public.v_active_subscriptions s
            JOIN public.profiles p ON p.id = s.student_id
            WHERE s.expires_at <= now() + interval '7 days'
            LIMIT 5
        ), '[]'::jsonb)
    ) INTO v_stats;

    RETURN v_stats;
END $$;

-- =====================================================================
-- >>> included from migrations\0026_view_lockdown.sql
-- =====================================================================

-- =====================================================================
-- 0026_view_lockdown
-- Phase 2 | Hardening | Security
-- The 6 public views (0010) are internal-only: consumed exclusively by
-- SECURITY DEFINER functions (owner postgres -> permission checks pass
-- even with zero client grants on the views). Hosted Supabase grants
-- ALL on every public view to anon/authenticated at project creation,
-- which would otherwise expose the admin analytics surface
-- (v_dashboard_metrics, v_audit_log, v_lesson_stats, per-student
-- aggregates, live subscriptions incl. financial columns) as raw
-- PostgREST endpoints for any role holding an API key.
-- REVOKE ALL closes that surface (L5 + SECURITY.md section 8 posture:
-- tables/views get per-role grants, RLS does the row filtering).
-- service_role intentionally keeps its grants (trusted backend/admin
-- tooling; it bypasses RLS anyway).
-- =====================================================================

REVOKE ALL ON PUBLIC.v_active_subscriptions FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_active_subscriptions FROM anon, authenticated;

REVOKE ALL ON PUBLIC.v_lesson_access FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_lesson_access FROM anon, authenticated;

REVOKE ALL ON PUBLIC.v_student_progress_summary FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_student_progress_summary FROM anon, authenticated;

REVOKE ALL ON PUBLIC.v_lesson_stats FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_lesson_stats FROM anon, authenticated;

REVOKE ALL ON PUBLIC.v_dashboard_metrics FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_dashboard_metrics FROM anon, authenticated;

REVOKE ALL ON PUBLIC.v_audit_log FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_audit_log FROM anon, authenticated;

-- =====================================================================
-- >>> included from migrations\0027_seed_grades_and_registration_grade.sql
-- =====================================================================

-- =====================================================================
-- 0027_seed_grades_and_registration_grade
-- Seeds the three default grades (أولى/تانية/تالتة ثانوي), exposes an
-- anon-safe grade listing for the registration page, and upgrades
-- handle_new_user() so students MUST pick their grade at sign-up.
--
-- * grades seed: idempotent (grades.name is UNIQUE); skips existing
--   rows so re-running / applying to a populated project is a no-op.
-- * list_active_grades(): SECURITY DEFINER + pinned search_path;
--   returns ONLY id/name/sort_order of active, non-deleted grades.
--   The ONLY anon surface for grade data (grades table itself stays
--   RLS-locked to staff/active students). Granted to anon + authenticated.
-- * handle_new_user() v3: reads grade_id from raw_user_meta_data.
--   REQUIRED for student sign-ups (fail closed: grade_required) and
--   validated (exists + active + not soft-deleted -> grade_not_available,
--   malformed uuid -> invalid_grade_id). Staff bootstrap accounts from
--   0011 carry raw_user_meta_data.seed_account = 'true' and are exempt
--   (they are promoted to admin/mr_walid right after creation).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Seed the three default grades (idempotent).
-- ---------------------------------------------------------------------
INSERT INTO public.grades (name, sort_order)
VALUES
    ('الصف الأول الثانوي', 1),
    ('الصف الثاني الثانوي', 2),
    ('الصف الثالث الثانوي', 3)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- list_active_grades() - anon-safe grade listing for registration.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_active_grades()
RETURNS TABLE (id uuid, name text, sort_order integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
        SELECT g.id, g.name, g.sort_order
        FROM public.grades g
        WHERE g.is_active
          AND g.deleted_at IS NULL
        ORDER BY g.sort_order ASC, g.name ASC;
END $$;

REVOKE EXECUTE ON FUNCTION public.list_active_grades() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_grades() TO anon, authenticated;

COMMENT ON FUNCTION public.list_active_grades() IS
'Anon-safe grade listing for the registration page: id/name/sort_order of active, non-deleted grades only.';

-- ---------------------------------------------------------------------
-- handle_new_user() v3 - grade-aware profile creation.
-- Replaces the 0004 definition: grade_id becomes a required, validated
-- meta field for student sign-ups (binding: registration flow now sends
-- it; fail-closed so a missing/invalid grade never produces a
-- grade-less student profile).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
    v_full_name text;
    v_phone text;
    v_guardian_phone text;
    v_address text;
    v_grade_id_text text;
    v_grade_id uuid;
    v_is_seed boolean := COALESCE(v_meta ->> 'seed_account', '') = 'true';
BEGIN
    v_full_name      := NULLIF(btrim(v_meta ->> 'full_name'), '');
    v_phone          := NULLIF(btrim(v_meta ->> 'phone'), '');
    v_guardian_phone := NULLIF(btrim(v_meta ->> 'guardian_phone'), '');
    v_address        := NULLIF(btrim(v_meta ->> 'address'), '');
    v_grade_id_text  := NULLIF(btrim(v_meta ->> 'grade_id'), '');

    IF v_full_name IS NULL OR v_phone IS NULL
       OR v_guardian_phone IS NULL OR v_address IS NULL THEN
        RAISE EXCEPTION 'profile_meta_required'
            USING HINT = 'raw_user_meta_data must contain full_name, phone, guardian_phone and address';
    END IF;

    -- Grade is required for normal sign-ups; the 0011 staff bootstrap is
    -- exempt (seed_account marker) because the seeded admin/mr_walid
    -- accounts are created before grades exist (0004 -> 0011 -> 0027).
    IF NOT v_is_seed THEN
        IF v_grade_id_text IS NULL THEN
            RAISE EXCEPTION 'grade_required'
                USING HINT = 'raw_user_meta_data must contain grade_id';
        END IF;
        BEGIN
            v_grade_id := v_grade_id_text::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'invalid_grade_id'
                USING HINT = 'grade_id must be a valid uuid';
        END;
        IF NOT EXISTS (
            SELECT 1 FROM public.grades
            WHERE id = v_grade_id AND is_active AND deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'grade_not_available'
                USING HINT = 'grade_id must reference an active, non-deleted grade';
        END IF;
    END IF;

    INSERT INTO public.profiles (id, full_name, phone, guardian_phone, address, grade_id)
    VALUES (NEW.id, v_full_name, v_phone, v_guardian_phone, v_address, v_grade_id);

    RETURN NEW;
END $$;
