-- =====================================================================
-- supabase-full-schema.sql - consolidated Phase 1 schema
-- ---------------------------------------------------------------------
-- Single-file snapshot of supabase/migrations/0001..0046, concatenated
-- in filename order. Apply ONCE to a fresh project; incremental changes
-- always go into new numbered migration files (never edit this file).
-- Statements from legacy migrations 0001-0026 that reference the removed
-- subscription subsystem are dropped at regen time; mixed statements are
-- dropped too unless they self-guard table access with to_regclass (the
-- guarded trigger loops). 0028_units_purchase.sql performs the actual
-- DROP of the subscription objects.
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
        -- Legacy tables may already be gone (0028 drops the subscription
        -- subsystem); skip missing tables instead of failing with 42P01.
        IF to_regclass(format('public.%I', v_table)) IS NULL THEN
            CONTINUE;
        END IF;
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
        -- Legacy tables may already be gone (0028 drops the subscription
        -- subsystem); skip missing tables instead of failing with 42P01.
        IF to_regclass(format('public.%I', v_table)) IS NULL THEN
            CONTINUE;
        END IF;
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

-- Auth engine (GoTrue) triggers on auth.users — supabase_auth_admin must execute these
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN
  GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
  GRANT EXECUTE ON FUNCTION public.block_email_change() TO supabase_auth_admin;
  GRANT EXECUTE ON FUNCTION public.block_sign_in_for_inactive_accounts() TO supabase_auth_admin;
END IF; END $$;

-- Client-callable allowlist (SECURITY.md section 8.2):
GRANT EXECUTE ON FUNCTION public.update_own_profile(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_student_profile(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_progress(uuid, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_grade(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enable_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_trash() TO authenticated;
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

-- Everything else stays REVOKEd (except auth triggers granted to supabase_auth_admin above):
-- generate_codes_internal, set_video_status, expire_subscriptions,
-- recheck_video_states, notify_new_content, audit_log, set_updated_at,
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
    ('platform_name', '"وليد عونى"', 'Platform display name'),
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
            jsonb_build_object('full_name', 'Walid Awny', 'phone', '+201000000002',
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
CREATE INDEX IF NOT EXISTS idx_progress_video_id               ON public.progress (video_id);

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
SET value = '"وليد عونى"',
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

-- =====================================================================
-- >>> included from migrations\0026_view_lockdown.sql
-- =====================================================================

REVOKE ALL ON PUBLIC.v_lesson_access FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_lesson_access FROM anon, authenticated;

REVOKE ALL ON PUBLIC.v_student_progress_summary FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_student_progress_summary FROM anon, authenticated;

REVOKE ALL ON PUBLIC.v_lesson_stats FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_lesson_stats FROM anon, authenticated;

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

-- =====================================================================
-- >>> included from migrations\0028_units_purchase.sql
-- =====================================================================

-- =====================================================================
-- 0028_units_purchase
-- Phase 1 | Units Purchase | Database
-- Replaces the time-based subscription system (pricing_plans /
-- subscriptions / subscription_codes / code_redemptions) with PERMANENT
-- per-unit purchases via codes only:
--   unit_pricing    -> unit_codes -> unit_purchases (no expires_at)
-- plus trial lessons (lessons.is_trial). Reference:
-- IMPLEMENTATION-PLAN.md section 3.
--
-- Append-only migration: nothing in 0001..0027 is modified. All steps
-- below run in the exact order required by the plan (IMPLEMENTATION-
-- PLAN.md section 3.1).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) New enum: unit_purchase_status (additive - no conflict).
-- ---------------------------------------------------------------------
DO $$ BEGIN
    IF to_regtype('public.unit_purchase_status') IS NULL THEN
        CREATE TYPE public.unit_purchase_status AS ENUM ('active', 'void');
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- Unconditional: this legacy settings key must never survive (0028 spec).
DELETE FROM public.app_settings WHERE key = 'expiry_warning_days';

-- 2+3) Cleanup BEFORE rebuilding notification_type, then rebuild it
--      (subscription_* -> unit_activated). The pg_enum probe makes the
--      whole section a no-op once the rebuild has already been applied,
--      so re-running the file never touches enum values that no longer
--      exist (Phase 6/7 add more values via ALTER TYPE ADD VALUE).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'notification_type'
          AND e.enumlabel = 'unit_activated'
    ) THEN
        DELETE FROM public.notifications
        WHERE type::text IN ('subscription_activated', 'subscription_expiring', 'subscription_expired');

        DELETE FROM public.app_settings WHERE key = 'expiry_warning_days';

        CREATE TYPE public.notification_type_new AS ENUM ('new_content', 'unit_activated', 'system');

        ALTER TABLE public.notifications
            ALTER COLUMN type TYPE public.notification_type_new
            USING (type::text::public.notification_type_new);

        DROP TYPE public.notification_type;
        ALTER TYPE public.notification_type_new RENAME TO notification_type;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4) New tables (per-unit pricing, codes, permanent purchases).
--    Prices are snapshotted from unit_pricing at activation (P12);
--    NO expires_at / duration_days anywhere.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.unit_pricing (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id      uuid NOT NULL UNIQUE REFERENCES public.units(id) ON DELETE CASCADE,
    base_price   numeric(10, 2) NOT NULL CHECK (base_price >= 0),
    platform_fee numeric(10, 2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
    total_price  numeric(10, 2) GENERATED ALWAYS AS (base_price + platform_fee) STORED,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.unit_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_pricing FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.unit_pricing IS 'Permanent per-unit pricing (base + platform fee = generated total). Upserted via set_unit_price (admin only).';

CREATE TABLE IF NOT EXISTS public.unit_codes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code            text NOT NULL UNIQUE CHECK (code ~ '^WLDN-[A-Z0-9]{8,12}$'),
    unit_pricing_id uuid NOT NULL REFERENCES public.unit_pricing(id) ON DELETE RESTRICT,
    status          public.code_status NOT NULL DEFAULT 'available',
    created_by      uuid NOT NULL REFERENCES auth.users(id),
    used_at         timestamptz,
    used_by         uuid REFERENCES public.profiles(id),
    revoked_at      timestamptz,
    revoked_by      uuid REFERENCES auth.users(id),
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unit_codes_pricing_id_idx    ON public.unit_codes(unit_pricing_id);
CREATE INDEX IF NOT EXISTS unit_codes_status_idx        ON public.unit_codes(status);

ALTER TABLE public.unit_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_codes FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.unit_codes IS 'Redeemable per-unit codes: stored uppercase, unambiguous charset, one-time redemption (status -> used). Students never see raw codes.';

CREATE TABLE IF NOT EXISTS public.unit_purchases (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    unit_id       uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    base_price    numeric(10, 2) NOT NULL CHECK (base_price >= 0),
    platform_fee  numeric(10, 2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
    total_price   numeric(10, 2) GENERATED ALWAYS AS (base_price + platform_fee) STORED,
    code_id       uuid REFERENCES public.unit_codes(id) ON DELETE SET NULL,
    status        public.unit_purchase_status NOT NULL DEFAULT 'active',
    purchased_at  timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS unit_purchases_student_unit_uniq ON public.unit_purchases(student_id, unit_id);
CREATE INDEX IF NOT EXISTS unit_purchases_student_idx ON public.unit_purchases(student_id);
CREATE INDEX IF NOT EXISTS unit_purchases_unit_idx    ON public.unit_purchases(unit_id);

ALTER TABLE public.unit_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_purchases FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.unit_purchases IS 'PERMANENT per-unit purchases (no expiry). Writes exclusively via SECURITY DEFINER RPCs (redeem_unit_code); direct client INSERT blocked by the insert_via_rpc policy.';

-- ---------------------------------------------------------------------
-- 4b) RLS policies (named style of 0009/0025). No DML policies on any of
--     the three tables: writes go exclusively through SECURITY DEFINER
--     RPCs. anon never evaluates helper functions in a policy - its only
--     price surface is the RPC get_public_unit_prices().
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS unit_pricing_select_staff_or_active_students ON public.unit_pricing;
CREATE POLICY unit_pricing_select_staff_or_active_students ON public.unit_pricing
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (
            public.is_student()
            AND is_active
            AND unit_id IN (
                SELECT u.id FROM public.units u
                WHERE u.status = 'published' AND u.deleted_at IS NULL
                  AND u.grade_id = (SELECT p.grade_id FROM public.profiles p WHERE p.id = auth.uid())
                  AND u.grade_id IN (SELECT g.id FROM public.grades g WHERE g.is_active AND g.deleted_at IS NULL)
            )
        )
    );

DROP POLICY IF EXISTS unit_codes_select_staff ON public.unit_codes;
CREATE POLICY unit_codes_select_staff ON public.unit_codes
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS unit_purchases_select_own_or_staff ON public.unit_purchases;
CREATE POLICY unit_purchases_select_own_or_staff ON public.unit_purchases
    FOR SELECT
    USING (student_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- Extra shield: no raw INSERT from any client role; only SECURITY
-- DEFINER functions (owner postgres, superuser - RLS bypassed) write.
DROP POLICY IF EXISTS unit_purchases_insert_via_rpc ON public.unit_purchases;
CREATE POLICY unit_purchases_insert_via_rpc ON public.unit_purchases
    FOR INSERT
    WITH CHECK (false);

-- ---------------------------------------------------------------------
-- 5) lessons: trial-lesson flag + partial unique index (max one trial
--    per unit among live lessons).
-- ---------------------------------------------------------------------
ALTER TABLE public.lessons
    ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS lessons_trial_unique
    ON public.lessons(unit_id)
    WHERE is_trial AND deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 6) Extend the set_updated_at application list (0004) with the two new
--    tables that carry updated_at. unit_purchases is intentionally NOT
--    added (no updated_at column - set_updated_at() writes it blindly).
--    Extend the audit_trigger inventory (0005) with all three new tables
--    (entity_type is free text - no CHECK/CASE to update, 0005/0019 use
--    substring matching only).
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON public.unit_pricing;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.unit_pricing
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.unit_codes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.unit_codes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'unit_pricing', 'unit_codes', 'unit_purchases'
    ] LOOP
        IF to_regclass(format('public.%I', v_table)) IS NULL THEN
            CONTINUE;
        END IF;
        EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON public.%I', v_table);
        EXECUTE format(
            'CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()',
            v_table
        );
    END LOOP;
END$$;

-- ---------------------------------------------------------------------
-- 7) Rewrite can_access_lesson: staff see any live lesson; students need
--    published lesson+unit in their own active grade, plus an active unit
--    purchase OR a trial lesson. Existing grants (authenticated, 0010)
--    are preserved by CREATE OR REPLACE.
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
    IF public.is_admin() OR public.is_mr_walid() OR public.is_teacher() THEN
        RETURN EXISTS (SELECT 1 FROM public.lessons WHERE id = p_lesson_id AND deleted_at IS NULL);
    END IF;
    RETURN EXISTS (
        SELECT 1
        FROM public.lessons l
        JOIN public.units u      ON u.id = l.unit_id
        JOIN public.profiles p   ON p.id = v_uid
        JOIN public.grades g     ON g.id = p.grade_id
        WHERE l.id = p_lesson_id
          AND l.deleted_at IS NULL AND l.status = 'published'
          AND u.deleted_at IS NULL AND u.status = 'published'
          AND g.is_active AND g.deleted_at IS NULL
          AND p.deleted_at IS NULL AND p.status = 'active'
          AND (l.is_trial OR EXISTS (
              SELECT 1 FROM public.unit_purchases up
              WHERE up.student_id = v_uid
                AND up.unit_id = u.id
                AND up.status = 'active'
          ))
    );
END $$;

COMMENT ON FUNCTION public.can_access_lesson(uuid) IS
    'Lesson access: staff see any live lesson; students need published lesson+unit in their own active grade, plus an active unit purchase OR a trial lesson.';

-- set_lesson_trial: staff-guarded trial toggle with atomic clear of any
-- previous trial in the same unit (decision D).
CREATE OR REPLACE FUNCTION public.set_lesson_trial(p_lesson_id uuid, p_is_trial boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_unit uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT unit_id INTO v_unit
    FROM public.lessons WHERE id = p_lesson_id AND deleted_at IS NULL;
    IF v_unit IS NULL THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    -- Clear any previous trial in the unit first, then (optionally) set
    -- the target - guarantees the partial unique index is never violated
    -- mid-statement.
    UPDATE public.lessons SET is_trial = false
    WHERE unit_id = v_unit AND deleted_at IS NULL AND is_trial;

    IF p_is_trial THEN
        UPDATE public.lessons SET is_trial = true
        WHERE id = p_lesson_id AND deleted_at IS NULL;
    END IF;

    PERFORM public.audit_log('unit.trial_set', 'lesson', p_lesson_id,
        jsonb_build_object('is_trial', p_is_trial));
END $$;

COMMENT ON FUNCTION public.set_lesson_trial(uuid, boolean) IS 'Staff-guarded trial toggle; at most one trial lesson per unit (partial unique index).';

-- ---------------------------------------------------------------------
-- 8a) New unit functions. Created BEFORE dropping the subscription
--     functions so the migration never hangs on references.
-- ---------------------------------------------------------------------
-- Student: redeem a unit code (permanent purchase).
CREATE OR REPLACE FUNCTION public.redeem_unit_code(p_code text)
RETURNS public.unit_purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code text := upper(btrim(p_code));
    v_student uuid := auth.uid();
    v_grade uuid;
    v_code_row public.unit_codes%ROWTYPE;
    v_pricing public.unit_pricing%ROWTYPE;
    v_unit public.units%ROWTYPE;
    v_purchase public.unit_purchases%ROWTYPE;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('wldn_redeem_unit:' || COALESCE(v_code, '')));

    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF v_code IS NULL OR v_code = '' THEN
        RAISE EXCEPTION 'code_not_found';
    END IF;

    SELECT * INTO v_code_row
    FROM public.unit_codes
    WHERE code = v_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'code_not_found';
    END IF;

    SELECT * INTO v_pricing FROM public.unit_pricing WHERE id = v_code_row.unit_pricing_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;
    IF NOT v_pricing.is_active THEN
        RAISE EXCEPTION 'unit_inactive';
    END IF;

    SELECT * INTO v_unit FROM public.units WHERE id = v_pricing.unit_id;
    IF v_unit.id IS NULL OR v_unit.deleted_at IS NOT NULL OR v_unit.status <> 'published' THEN
        RAISE EXCEPTION 'unit_inactive';
    END IF;

    IF v_code_row.status = 'revoked' THEN
        RAISE EXCEPTION 'code_revoked';
    END IF;
    IF v_code_row.status = 'used' THEN
        RAISE EXCEPTION 'code_already_used';
    END IF;

    SELECT grade_id INTO v_grade
    FROM public.profiles
    WHERE id = v_student AND role = 'student' AND deleted_at IS NULL;
    IF v_grade IS NULL THEN
        RAISE EXCEPTION 'no_grade_assigned';
    END IF;

    IF v_unit.grade_id <> v_grade THEN
        RAISE EXCEPTION 'unit_not_in_student_grade';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.unit_purchases
        WHERE student_id = v_student AND unit_id = v_unit.id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'unit_already_purchased';
    END IF;

    INSERT INTO public.unit_purchases (
        student_id, unit_id, base_price, platform_fee, code_id, status
    )
    VALUES (
        v_student, v_unit.id, v_pricing.base_price, v_pricing.platform_fee,
        v_code_row.id, 'active'
    )
    RETURNING * INTO v_purchase;

    UPDATE public.unit_codes
    SET status = 'used', used_at = now(), used_by = v_student
    WHERE id = v_code_row.id;

    PERFORM public.audit_log('unit_purchase.create', 'unit_purchases', v_purchase.id,
        jsonb_build_object('unit_id', v_unit.id, 'price', v_purchase.total_price));

    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    VALUES (v_student, 'unit_activated', 'طھظ… طھظپط¹ظٹظ„ ط§ظ„ظˆط­ط¯ط©', v_unit.name,
            'unit_activated:' || v_purchase.id, 'unit_purchases', v_purchase.id)
    ON CONFLICT (dedup_key) DO NOTHING;

    RETURN v_purchase;
END $$;

-- Student: my purchases (own rows via RLS).
CREATE OR REPLACE FUNCTION public.get_my_unit_purchases()
RETURNS SETOF public.unit_purchases
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT * FROM public.unit_purchases
    WHERE student_id = auth.uid()
    ORDER BY purchased_at DESC;
$$;

-- Student/staff/EF: lesson access info for the lesson player gates.
CREATE OR REPLACE FUNCTION public.get_my_lesson_access(p_lesson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_lesson_id uuid;
    v_unit_id uuid;
    v_unit_name text;
    v_is_trial boolean;
    v_has_purchase boolean;
    v_price numeric(10, 2);
BEGIN
    SELECT l.id, l.unit_id, l.is_trial, u.name
    INTO v_lesson_id, v_unit_id, v_is_trial, v_unit_name
    FROM public.lessons l
    JOIN public.units u ON u.id = l.unit_id
    WHERE l.id = p_lesson_id AND l.deleted_at IS NULL;

    IF v_lesson_id IS NULL THEN
        RETURN jsonb_build_object(
            'has_access', false, 'has_purchase', false, 'is_trial', false,
            'unit_id', NULL::uuid, 'unit_name', NULL::text, 'price', NULL::numeric);
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.unit_purchases
        WHERE student_id = v_uid AND unit_id = v_unit_id AND status = 'active'
    ) INTO v_has_purchase;

    SELECT total_price INTO v_price
    FROM public.unit_pricing
    WHERE unit_id = v_unit_id AND is_active;

    RETURN jsonb_build_object(
        'has_access', public.can_access_lesson(p_lesson_id),
        'has_purchase', v_has_purchase,
        'is_trial', COALESCE(v_is_trial, false),
        'unit_id', v_unit_id,
        'unit_name', v_unit_name,
        'price', v_price);
END $$;

-- Staff code functions.
-- create_unit_codes_internal: no client grants; actor via auth.uid() or
-- app.system_actor_id (same posture as the 0014 wrapper fix).
CREATE OR REPLACE FUNCTION public.create_unit_codes_internal(
    p_unit_pricing_id uuid,
    p_count integer,
    p_note text DEFAULT NULL
)
RETURNS SETOF public.unit_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_actor uuid := COALESCE(auth.uid(), NULLIF(current_setting('app.system_actor_id', true), '')::uuid);
    v_pricing_active boolean;
    v_code text;
    v_attempt int;
    v_inserted int := 0;
    v_row public.unit_codes%ROWTYPE;
BEGIN
    IF p_count < 1 OR p_count > 500 THEN
        RAISE EXCEPTION 'invalid_count';
    END IF;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'system_actor_required';
    END IF;

    SELECT is_active INTO v_pricing_active FROM public.unit_pricing WHERE id = p_unit_pricing_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_pricing_not_found';
    END IF;
    IF NOT v_pricing_active THEN
        RAISE EXCEPTION 'unit_inactive';
    END IF;

    v_attempt := 0;
    WHILE v_inserted < p_count AND v_attempt < p_count * 5 LOOP
        v_attempt := v_attempt + 1;
        v_code := 'WLDN-';
        FOR i IN 1..12 LOOP
            v_code := v_code || substr(v_chars, get_byte(gen_random_bytes(1), 0) % 32 + 1, 1);
        END LOOP;

        BEGIN
            INSERT INTO public.unit_codes (code, unit_pricing_id, created_by, note)
            VALUES (v_code, p_unit_pricing_id, v_actor, p_note)
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

-- Staff-guarded wrapper over create_unit_codes_internal (replaces the
-- subscription create_codes_for_staff, 0014).
CREATE OR REPLACE FUNCTION public.create_unit_codes_for_staff(
    p_unit_id uuid,
    p_count integer,
    p_note text DEFAULT NULL
)
RETURNS SETOF public.unit_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pricing_id uuid;
    v_pricing_active boolean;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.units WHERE id = p_unit_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    SELECT id, is_active INTO v_pricing_id, v_pricing_active
    FROM public.unit_pricing WHERE unit_id = p_unit_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;
    IF NOT v_pricing_active THEN
        RAISE EXCEPTION 'unit_inactive';
    END IF;

    RETURN QUERY SELECT * FROM public.create_unit_codes_internal(v_pricing_id, p_count, p_note);
END $$;

-- Staff: codes of a unit (validation + count caps stay in the internal fn).
DROP FUNCTION IF EXISTS public.list_codes_by_unit(uuid);

CREATE OR REPLACE FUNCTION public.list_codes_by_unit(p_unit_id uuid)
RETURNS SETOF public.unit_codes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.units WHERE id = p_unit_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    RETURN QUERY
        SELECT uc.*
        FROM public.unit_codes uc
        JOIN public.unit_pricing up ON up.id = uc.unit_pricing_id
        WHERE up.unit_id = p_unit_id
        ORDER BY uc.created_at DESC;
END $$;

-- Staff: revoke an available code (used codes are NOT revocable).
CREATE OR REPLACE FUNCTION public.revoke_unit_code(p_code_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prev public.code_status;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT status INTO v_prev FROM public.unit_codes WHERE id = p_code_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'code_not_found';
    END IF;
    IF v_prev = 'used' THEN
        RAISE EXCEPTION 'code_already_used';
    END IF;
    IF v_prev = 'revoked' THEN
        RAISE EXCEPTION 'code_not_revocable';
    END IF;

    UPDATE public.unit_codes
    SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
    WHERE id = p_code_id AND status = 'available';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'code_not_revocable';
    END IF;

    PERFORM public.audit_log('unit_code.revoke', 'unit_codes', p_code_id,
        jsonb_build_object('previous_status', v_prev));
END $$;

-- Pricing functions.
-- set_unit_price: ADMIN ONLY (decision J - teachers never modify prices).
CREATE OR REPLACE FUNCTION public.set_unit_price(
    p_unit_id uuid,
    p_base_price numeric(10, 2),
    p_platform_fee numeric(10, 2) DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pricing_id uuid;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.units WHERE id = p_unit_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    IF p_base_price < 0 OR p_platform_fee < 0 THEN
        RAISE EXCEPTION 'invalid_price';
    END IF;

    INSERT INTO public.unit_pricing (unit_id, base_price, platform_fee)
    VALUES (p_unit_id, p_base_price, p_platform_fee)
    ON CONFLICT (unit_id) DO UPDATE
    SET base_price = EXCLUDED.base_price,
        platform_fee = EXCLUDED.platform_fee
    RETURNING id INTO v_pricing_id;

    PERFORM public.audit_log('unit_pricing.set', 'unit_pricing', v_pricing_id,
        jsonb_build_object('unit_id', p_unit_id, 'base_price', p_base_price,
                           'platform_fee', p_platform_fee));
END $$;

-- Staff: full pricing list with unit + grade names.
CREATE OR REPLACE FUNCTION public.list_unit_pricing()
RETURNS TABLE (
    id uuid, unit_id uuid, base_price numeric(10, 2), platform_fee numeric(10, 2),
    total_price numeric(10, 2), is_active boolean, unit_name text, grade_name text
)
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
        SELECT up.id, up.unit_id, up.base_price, up.platform_fee, up.total_price,
               up.is_active, u.name, g.name
        FROM public.unit_pricing up
        JOIN public.units u ON u.id = up.unit_id
        JOIN public.grades g ON g.id = u.grade_id
        ORDER BY g.sort_order, u.sort_order;
END $$;

-- Public (anon + authenticated): active prices of published units on live
-- grades (decision M) - the landing-page price surface.
CREATE OR REPLACE FUNCTION public.get_public_unit_prices()
RETURNS TABLE (
    unit_id uuid, unit_name text, grade_name text,
    base_price numeric(10, 2), platform_fee numeric(10, 2), total_price numeric(10, 2)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT u.id AS unit_id, u.name AS unit_name, g.name AS grade_name,
           up.base_price, up.platform_fee, up.total_price
    FROM public.unit_pricing up
    JOIN public.units u ON u.id = up.unit_id
    JOIN public.grades g ON g.id = u.grade_id
    WHERE up.is_active
      AND u.status = 'published' AND u.deleted_at IS NULL
      AND g.is_active AND g.deleted_at IS NULL;
$$;

-- Stats functions.
-- Staff: all purchases, optionally filtered by student (with names).
CREATE OR REPLACE FUNCTION public.list_all_unit_purchases(p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
    id uuid, student_id uuid, unit_id uuid, base_price numeric(10, 2),
    platform_fee numeric(10, 2), total_price numeric(10, 2), code_id uuid,
    status public.unit_purchase_status, purchased_at timestamptz,
    unit_name text, grade_name text
)
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
        SELECT up.id, up.student_id, up.unit_id, up.base_price, up.platform_fee,
               up.total_price, up.code_id, up.status, up.purchased_at,
               u.name, g.name
        FROM public.unit_purchases up
        JOIN public.units u ON u.id = up.unit_id
        JOIN public.grades g ON g.id = u.grade_id
        WHERE (p_student_id IS NULL OR up.student_id = p_student_id)
        ORDER BY up.purchased_at DESC;
END $$;

-- Staff: purchase analytics JSON.
CREATE OR REPLACE FUNCTION public.unit_purchase_stats()
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
        'total_purchases', (SELECT count(*) FROM public.unit_purchases WHERE status = 'active'),
        'total_revenue', (SELECT COALESCE(sum(total_price), 0) FROM public.unit_purchases WHERE status = 'active'),
        'revenue_this_month', (SELECT COALESCE(sum(total_price), 0) FROM public.unit_purchases
                               WHERE status = 'active' AND purchased_at >= date_trunc('month', now())),
        'by_grade', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'grade_name', r.grade_name, 'purchases', r.purchases, 'revenue', r.revenue
            ) ORDER BY r.sort_order)
            FROM (
                SELECT g.name AS grade_name, g.sort_order,
                       count(DISTINCT up.id) AS purchases,
                       COALESCE(sum(up.total_price), 0) AS revenue
                FROM public.unit_purchases up
                JOIN public.units u ON u.id = up.unit_id
                JOIN public.grades g ON g.id = u.grade_id
                WHERE up.status = 'active'
                GROUP BY g.id, g.name, g.sort_order
            ) r
        ), '[]'::jsonb),
        'top_units', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'unit_name', r.unit_name, 'purchases', r.purchases, 'revenue', r.revenue
            ) ORDER BY r.revenue DESC)
            FROM (
                SELECT u.name AS unit_name,
                       count(DISTINCT up.id) AS purchases,
                       COALESCE(sum(up.total_price), 0) AS revenue
                FROM public.unit_purchases up
                JOIN public.units u ON u.id = up.unit_id
                WHERE up.status = 'active'
                GROUP BY u.id, u.name
                ORDER BY revenue DESC
                LIMIT 5
            ) r
        ), '[]'::jsonb)
    ) INTO v_stats;

    RETURN v_stats;
END $$;

-- ---------------------------------------------------------------------
-- 8b) DROP the subscription functions (original signatures from
--     0006/0007/0014/0022/0025; verified against each source).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.redeem_subscription_code(text);
DROP FUNCTION IF EXISTS public.get_my_subscriptions();
DROP FUNCTION IF EXISTS public.get_my_current_subscription();
DROP FUNCTION IF EXISTS public.revoke_subscription_code(uuid);
DROP FUNCTION IF EXISTS public.create_manual_subscription(uuid, uuid, timestamptz, text);
DROP FUNCTION IF EXISTS public.set_pricing_plan(uuid, integer, numeric, numeric, boolean);
DROP FUNCTION IF EXISTS public.delete_pricing_plan(uuid);
DROP FUNCTION IF EXISTS public.expire_subscriptions();
DROP FUNCTION IF EXISTS public.create_codes_for_staff(uuid, integer, text);
DROP FUNCTION IF EXISTS public.generate_codes_internal(uuid, integer, text);

-- ---------------------------------------------------------------------
-- 9) Views (order is MANDATORY): redefine the student/stats views
--    without any v_active_subscriptions dependency FIRST, then drop
--    v_active_subscriptions. v_lesson_stats / v_audit_log are unchanged
--    (no references to removed columns). v_lesson_access must be
--    DROPPED+recreated (not CREATE OR REPLACE): lessons gained is_trial,
--    which shifts the l.* column expansion and would "rename" the
--    trailing can_access column.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_lesson_access;
CREATE OR REPLACE VIEW public.v_lesson_access AS
SELECT l.*, public.can_access_lesson(l.id) AS can_access
FROM public.lessons l
JOIN public.units u ON u.id = l.unit_id
WHERE l.status = 'published' AND l.deleted_at IS NULL
  AND u.status = 'published' AND u.deleted_at IS NULL;

COMMENT ON VIEW public.v_lesson_access IS 'Lesson list with live access flag (new can_access_lesson: unit purchase or trial). Staff can read all published rows; students see published lessons of their own live grade only via RLS on lessons.';

-- Decision E: progress aggregates count ONLY lessons of the student's
-- purchased units, excluding trial lessons from numerator and denominator.
CREATE OR REPLACE VIEW public.v_student_progress_summary AS
SELECT p.student_id, g.id AS grade_id, u.id AS unit_id,
       ROUND(AVG(p.percent_completed), 2) AS percent,
       COUNT(*) FILTER (WHERE p.is_completed) AS completed_lessons,
       COUNT(*) AS total_lessons
FROM public.progress p
JOIN public.lessons l ON l.id = p.lesson_id AND l.deleted_at IS NULL AND NOT l.is_trial
JOIN public.units u ON u.id = l.unit_id AND u.deleted_at IS NULL
JOIN public.grades g ON g.id = u.grade_id AND g.deleted_at IS NULL
JOIN public.unit_purchases up
      ON up.student_id = p.student_id AND up.unit_id = u.id AND up.status = 'active'
GROUP BY p.student_id, g.id, u.id;

COMMENT ON VIEW public.v_student_progress_summary IS 'Per-student percent + completion counts per grade/unit over PURCHASED units only; trial lessons excluded (decision E).';

-- v_dashboard_metrics: no subscription columns; fed from unit_purchases.
-- DROPPED+recreated (CREATE OR REPLACE cannot drop the removed
-- subscription columns).
DROP VIEW IF EXISTS public.v_dashboard_metrics;
CREATE OR REPLACE VIEW public.v_dashboard_metrics AS
SELECT
  (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL AND role = 'student')                         AS total_students,
  (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'active' AND role = 'student')   AS active_students,
  (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'disabled' AND role = 'student') AS disabled_students,
  (SELECT COUNT(*) FROM public.unit_purchases WHERE status = 'active')                    AS active_purchases,
  (SELECT COUNT(*) FROM public.lessons WHERE deleted_at IS NULL AND status = 'published') AS published_lessons,
  (SELECT COUNT(*) FROM public.lessons WHERE deleted_at IS NULL AND status <> 'published') AS hidden_or_draft_lessons;

COMMENT ON VIEW public.v_dashboard_metrics IS 'Admin operational metrics fed from unit_purchases (no subscription columns).';

DROP VIEW IF EXISTS public.v_active_subscriptions;

-- Re-assert the 0026 view lockdown for the redefined views (CREATE OR
-- REPLACE preserves ACLs, this is belt & braces for the same posture).
REVOKE ALL ON PUBLIC.v_lesson_access FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_lesson_access FROM anon, authenticated;
REVOKE ALL ON PUBLIC.v_student_progress_summary FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_student_progress_summary FROM anon, authenticated;
REVOKE ALL ON PUBLIC.v_dashboard_metrics FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_dashboard_metrics FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 10) Unified get_dashboard_stats (CREATE OR REPLACE - keeps grants).
--     No subscription keys remain: students / purchases / content /
--     engagement / by_grade / top_units / recent_purchases.
-- ---------------------------------------------------------------------
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
            'total',        (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND role = 'student'),
            'active',       (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'active' AND role = 'student'),
            'disabled',     (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'disabled' AND role = 'student'),
            'deleted',      (SELECT count(*) FROM public.profiles WHERE deleted_at IS NOT NULL AND role = 'student'),
            'new_this_month', (SELECT count(*) FROM public.profiles
                               WHERE deleted_at IS NULL AND role = 'student' AND created_at >= date_trunc('month', now()))
        ),
        'purchases', jsonb_build_object(
            'total',               (SELECT count(*) FROM public.unit_purchases WHERE status = 'active'),
            'total_revenue',       (SELECT COALESCE(sum(total_price), 0) FROM public.unit_purchases WHERE status = 'active'),
            'revenue_this_month',  (SELECT COALESCE(sum(total_price), 0) FROM public.unit_purchases
                                    WHERE status = 'active' AND purchased_at >= date_trunc('month', now()))
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
        'by_grade', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'grade_name', r.grade_name,
                'students', r.students,
                'purchases', r.purchases,
                'revenue', r.revenue
            ) ORDER BY r.sort_order)
            FROM (
                SELECT g.name AS grade_name, g.sort_order,
                       count(DISTINCT p.id) AS students,
                       count(DISTINCT up.id) AS purchases,
                       COALESCE(sum(up.total_price), 0) AS revenue
                FROM public.grades g
                LEFT JOIN public.profiles p
                       ON p.grade_id = g.id AND p.deleted_at IS NULL AND p.role = 'student'
                LEFT JOIN public.unit_purchases up
                       ON up.student_id = p.id AND up.status = 'active'
                WHERE g.deleted_at IS NULL
                GROUP BY g.id, g.name, g.sort_order
            ) r
        ), '[]'::jsonb),
        'top_units', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'unit_name', r.unit_name,
                'purchases', r.purchases,
                'revenue', r.revenue
            ) ORDER BY r.revenue DESC)
            FROM (
                SELECT u.name AS unit_name,
                       count(DISTINCT up.id) AS purchases,
                       COALESCE(sum(up.total_price), 0) AS revenue
                FROM public.unit_purchases up
                JOIN public.units u ON u.id = up.unit_id
                WHERE up.status = 'active'
                GROUP BY u.id, u.name
                ORDER BY revenue DESC
                LIMIT 5
            ) r
        ), '[]'::jsonb),
        'recent_purchases', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', p.full_name,
                'grade_name', g.name,
                'unit_name', u.name,
                'total_price', up.total_price,
                'purchased_at', up.purchased_at
            ) ORDER BY up.purchased_at DESC)
            FROM public.unit_purchases up
            JOIN public.profiles p ON p.id = up.student_id
            JOIN public.units u ON u.id = up.unit_id
            JOIN public.grades g ON g.id = u.grade_id
            WHERE up.status = 'active'
            LIMIT 5
        ), '[]'::jsonb)
    ) INTO v_stats;

    RETURN v_stats;
END $$;

-- ---------------------------------------------------------------------
-- 11) notify_new_content: audience = active purchasers of the unit.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_new_content(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_unit uuid;
BEGIN
    SELECT unit_id INTO v_unit FROM public.lessons WHERE id = p_lesson_id;
    IF v_unit IS NULL THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    INSERT INTO public.notifications (user_id, type, entity_type, entity_id, title, body, dedup_key)
    SELECT up.student_id, 'new_content', 'lesson', p_lesson_id,
           'ظ…ط­طھظˆظ‰ ط¬ط¯ظٹط¯', l.title,
           'new_content:' || p_lesson_id || ':' || up.student_id
    FROM public.unit_purchases up
    JOIN public.lessons l ON l.id = p_lesson_id
    WHERE up.unit_id = v_unit
      AND up.status = 'active'
      AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.dedup_key = 'new_content:' || p_lesson_id || ':' || up.student_id
      );
END $$;

-- ---------------------------------------------------------------------
-- 12) Drop the old subscription tables (order mandatory: referential
--     leaves first).
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS public.code_redemptions;
DROP TABLE IF EXISTS public.subscriptions;
DROP TABLE IF EXISTS public.subscription_codes;
DROP TABLE IF EXISTS public.pricing_plans;

-- ---------------------------------------------------------------------
-- 13) Drop the subscription_status enum (last - after the table is gone).
-- ---------------------------------------------------------------------
DROP TYPE IF EXISTS public.subscription_status;

-- ---------------------------------------------------------------------
-- 14) Grants for the new functions (updated matrix, plan section 3.13).
--     Every new function: REVOKE FROM PUBLIC first, then explicit grant.
--     create_unit_codes_internal stays UNGRANTED (internal only); it is
--     SECURITY DEFINER-owned so the REVOKE below does not affect the
--     staff wrapper that calls it.
--     Subscription functions were dropped in step 8b, so no subscription
--     grant survives. can_access_lesson keeps its authenticated grant
--     from 0010 (CREATE OR REPLACE preserves it).
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_unit_codes_internal(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_unit_code(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.redeem_unit_code(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_unit_purchases() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_unit_purchases() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_lesson_access(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_lesson_access(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_public_unit_prices() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_public_unit_prices() TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.set_unit_price(uuid, numeric, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_unit_price(uuid, numeric, numeric) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_unit_pricing() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_unit_pricing() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_codes_by_unit(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_codes_by_unit(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.revoke_unit_code(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revoke_unit_code(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_unit_codes_for_staff(uuid, integer, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_unit_codes_for_staff(uuid, integer, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_all_unit_purchases(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_all_unit_purchases(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.unit_purchase_stats() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.unit_purchase_stats() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_lesson_trial(uuid, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_lesson_trial(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------
-- 15) Enumeration constraints on notifications.entity_type /
--     audit_logs.entity_type: both are free TEXT columns (0002), no
--     CHECK/CASE enumeration exists anywhere in 0005/0019 to replace
--     (verified). Nothing further to do.
-- ---------------------------------------------------------------------

-- =====================================================================
-- >>> included from migrations\0029_exams.sql
-- =====================================================================

-- =====================================================================
-- 0029_exams
-- Phase 6 | Exams | Database
-- Adds the exam system on top of the unit-purchase model
-- (IMPLEMENTATION-PLAN.md section 8):
--   exams / exam_questions / exam_attempts / exam_answers
-- MCQ is auto-graded at submit time; essays are graded by staff via
-- grade_exam_attempt. notification_type gains exam_submitted (staff) and
-- exam_graded (student) via ALTER TYPE ... ADD VALUE (PG 12+).
--
-- Append-only migration: nothing in 0001..0028 is modified.
-- Access: reads gated on can_access_lesson(exam.lesson_id); staff DML via
-- RLS; student writes only through the SECURITY DEFINER submit RPC.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) notification_type: exam_submitted (staff) / exam_graded (student).
--    ADD VALUE is idempotent and safe on PG 12+; the new values are only
--    referenced inside function bodies below (runtime casts), so no
--    in-file enum usage exists.
-- ---------------------------------------------------------------------
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'exam_submitted';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'exam_graded';

-- ---------------------------------------------------------------------
-- 2) New enum: exam_question_type (additive - no conflict).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regtype('public.exam_question_type') IS NULL THEN
        CREATE TYPE public.exam_question_type AS ENUM ('mcq', 'essay');
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) New tables. exams carries created_at/updated_at (set_updated_at);
--    attempts/answers are high-volume student-owned rows and are EXCLUDED
--    from the audit_trigger inventory (DATABASE.md section 7 MED-8).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exams (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id     uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    title         text NOT NULL CHECK (length(btrim(title)) > 0),
    sort_order    integer NOT NULL DEFAULT 0,
    passing_score integer NOT NULL DEFAULT 50 CHECK (passing_score BETWEEN 0 AND 100),
    deleted_at    timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exams_lesson_idx ON public.exams(lesson_id);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.exams IS 'Per-lesson exam (one exam per lesson is the UI contract; UNIQUE(lesson_id) is NOT enforced to allow future variants). Soft-deletable; student reads gated on can_access_lesson(lesson_id).';

CREATE TABLE IF NOT EXISTS public.exam_questions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id       uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    type          public.exam_question_type NOT NULL DEFAULT 'mcq',
    prompt        text NOT NULL CHECK (length(btrim(prompt)) > 0),
    choices       jsonb,
    correct_index integer,
    max_score     numeric(5, 2) NOT NULL DEFAULT 1 CHECK (max_score > 0),
    sort_order    integer NOT NULL DEFAULT 0,
    CONSTRAINT exam_questions_mcq_shape CHECK (
        type <> 'mcq'
        OR (
            choices IS NOT NULL
            AND jsonb_typeof(choices) = 'array'
            AND jsonb_array_length(choices) >= 2
            AND correct_index IS NOT NULL
            AND correct_index BETWEEN 0 AND jsonb_array_length(choices) - 1
        )
    )
);
CREATE INDEX IF NOT EXISTS exam_questions_exam_idx ON public.exam_questions(exam_id);

ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.exam_questions IS 'Exam questions (mcq with choices/correct_index, or essay). correct_index is exposed to staff only (sanitized by get_exam_questions for students).';

CREATE TABLE IF NOT EXISTS public.exam_attempts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id       uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status        text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded')),
    auto_score    numeric(5, 2),
    manual_score  numeric(5, 2),
    final_score   numeric(5, 2),
    graded_by     uuid REFERENCES public.profiles(id),
    graded_at     timestamptz,
    submitted_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (exam_id, student_id)
);
CREATE INDEX IF NOT EXISTS exam_attempts_exam_idx ON public.exam_attempts(exam_id);

ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.exam_attempts IS 'One attempt per (exam, student) - UNIQUE enforced. MCQ auto-graded on submit; essays via grade_exam_attempt; final_score set when fully graded.';

CREATE TABLE IF NOT EXISTS public.exam_answers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id   uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    question_id  uuid NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
    choice_index integer,
    answer_text  text,
    score        numeric(5, 2),
    UNIQUE (attempt_id, question_id)
);
CREATE INDEX IF NOT EXISTS exam_answers_attempt_idx ON public.exam_answers(attempt_id);

ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_answers FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.exam_answers IS 'Per-question answers of an attempt. choice_index for mcq, answer_text for essay; score set at submit (mcq) or grading (essay).';

-- ---------------------------------------------------------------------
-- 4) Triggers: set_updated_at + audit_trigger on exams only (attempts and
--    answers are student-owned, excluded from the audit inventory; exam
--    questions are pure content but not part of the documented inventory).
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON public.exams;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.exams
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_trigger ON public.exams;
CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.exams
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ---------------------------------------------------------------------
-- 5) RLS policies (named style of 0009/0025/0028). Student reads are
--    gated on can_access_lesson(lesson_id); student writes happen only
--    through SECURITY DEFINER RPCs; staff hold full DML.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS exams_select_gated ON public.exams;
CREATE POLICY exams_select_gated ON public.exams
    FOR SELECT
    USING (
        deleted_at IS NULL
        AND (
            public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
            OR public.can_access_lesson(lesson_id)
        )
    );

DROP POLICY IF EXISTS exams_insert_staff ON public.exams;
CREATE POLICY exams_insert_staff ON public.exams
    FOR INSERT
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exams_update_staff ON public.exams;
CREATE POLICY exams_update_staff ON public.exams
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exams_delete_staff ON public.exams;
CREATE POLICY exams_delete_staff ON public.exams
    FOR DELETE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_questions_select_gated ON public.exam_questions;
CREATE POLICY exam_questions_select_gated ON public.exam_questions
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR EXISTS (
            SELECT 1 FROM public.exams e
            WHERE e.id = exam_id
              AND e.deleted_at IS NULL
              AND public.can_access_lesson(e.lesson_id)
        )
    );

DROP POLICY IF EXISTS exam_questions_insert_staff ON public.exam_questions;
CREATE POLICY exam_questions_insert_staff ON public.exam_questions
    FOR INSERT
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_questions_update_staff ON public.exam_questions;
CREATE POLICY exam_questions_update_staff ON public.exam_questions
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_questions_delete_staff ON public.exam_questions;
CREATE POLICY exam_questions_delete_staff ON public.exam_questions
    FOR DELETE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_attempts_select_own_or_staff ON public.exam_attempts;
CREATE POLICY exam_attempts_select_own_or_staff ON public.exam_attempts
    FOR SELECT
    USING (
        student_id = auth.uid()
        OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
    );

DROP POLICY IF EXISTS exam_attempts_dml_staff ON public.exam_attempts;
CREATE POLICY exam_attempts_dml_staff ON public.exam_attempts
    FOR INSERT
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_attempts_update_staff ON public.exam_attempts;
CREATE POLICY exam_attempts_update_staff ON public.exam_attempts
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_attempts_delete_staff ON public.exam_attempts;
CREATE POLICY exam_attempts_delete_staff ON public.exam_attempts
    FOR DELETE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_answers_select_own_or_staff ON public.exam_answers;
CREATE POLICY exam_answers_select_own_or_staff ON public.exam_answers
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR attempt_id IN (
            SELECT a.id FROM public.exam_attempts a
            WHERE a.student_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS exam_answers_dml_staff ON public.exam_answers;
CREATE POLICY exam_answers_dml_staff ON public.exam_answers
    FOR INSERT
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_answers_update_staff ON public.exam_answers;
CREATE POLICY exam_answers_update_staff ON public.exam_answers
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_answers_delete_staff ON public.exam_answers;
CREATE POLICY exam_answers_delete_staff ON public.exam_answers
    FOR DELETE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- 6) Read helpers (SECURITY DEFINER; access-gated on the exam's lesson).
--    get_exam_questions sanitizes correct_index for students so the
--    answer key can never leak through the student surface.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_exams(p_lesson_id uuid)
RETURNS SETOF public.exams
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT e.*
    FROM public.exams e
    WHERE e.deleted_at IS NULL
      AND e.lesson_id = p_lesson_id
      AND (
          public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
          OR public.can_access_lesson(e.lesson_id)
      )
    ORDER BY e.sort_order, e.created_at;
$$;

COMMENT ON FUNCTION public.list_exams(uuid) IS 'Exams of a lesson visible to the caller (staff: all live; students: only lessons they can access).';

CREATE OR REPLACE FUNCTION public.get_exam_questions(p_exam_id uuid)
RETURNS SETOF public.exam_questions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT q.id, q.exam_id, q.type, q.prompt, q.choices,
           CASE WHEN (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
                THEN q.correct_index ELSE NULL END AS correct_index,
           q.max_score, q.sort_order
    FROM public.exam_questions q
    JOIN public.exams e ON e.id = q.exam_id AND e.deleted_at IS NULL
    WHERE q.exam_id = p_exam_id
      AND (
          public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
          OR public.can_access_lesson(e.lesson_id)
      )
    ORDER BY q.sort_order;
$$;

COMMENT ON FUNCTION public.get_exam_questions(uuid) IS 'Questions of an exam; correct_index is masked for non-staff callers (answer key never leaks).';

CREATE OR REPLACE FUNCTION public.get_my_exam_attempt(p_exam_id uuid)
RETURNS SETOF public.exam_attempts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT a.*
    FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id AND e.deleted_at IS NULL
    WHERE a.exam_id = p_exam_id
      AND a.student_id = auth.uid()
      AND (
          public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
          OR public.can_access_lesson(e.lesson_id)
      );
$$;

COMMENT ON FUNCTION public.get_my_exam_attempt(uuid) IS 'The caller''s own attempt for an exam (at most one row due to UNIQUE(exam_id, student_id)).';

-- ---------------------------------------------------------------------
-- 7) submit_exam_attempt: student-only SECURITY DEFINER write path.
--    Validates the answer payload, stores the answers, auto-grades MCQ,
--    sends exam_submitted to staff, and - when no essay question exists -
--    grades the attempt immediately (exam_graded to the student).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(p_exam_id uuid, p_answers jsonb)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid         uuid := auth.uid();
    v_exam        public.exams%ROWTYPE;
    v_attempt     public.exam_attempts;
    v_auto        numeric(5, 2) := 0;
    v_has_essays  boolean;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;
    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT * INTO v_exam
    FROM public.exams
    WHERE id = p_exam_id AND deleted_at IS NULL;
    IF v_exam.id IS NULL THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;

    IF NOT public.can_access_lesson(v_exam.lesson_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.exam_attempts
        WHERE exam_id = p_exam_id AND student_id = v_uid
    ) THEN
        RAISE EXCEPTION 'attempt_already_exists';
    END IF;

    IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'invalid_answers';
    END IF;

    -- every supplied answer must reference a question of this exam
    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_answers)
             AS r(question_id uuid, choice_index integer, answer_text text)
        LEFT JOIN public.exam_questions q
               ON q.id = r.question_id AND q.exam_id = p_exam_id
        WHERE q.id IS NULL
    ) THEN
        RAISE EXCEPTION 'invalid_answers';
    END IF;

    -- every answer must be well-formed for its question type
    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_answers)
             AS r(question_id uuid, choice_index integer, answer_text text)
        JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = p_exam_id
        WHERE (q.type = 'mcq'
               AND (r.choice_index IS NULL
                    OR r.choice_index < 0
                    OR r.choice_index > jsonb_array_length(q.choices) - 1))
           OR (q.type = 'essay'
               AND length(btrim(COALESCE(r.answer_text, ''))) = 0)
    ) THEN
        RAISE EXCEPTION 'invalid_answers';
    END IF;

    INSERT INTO public.exam_attempts (exam_id, student_id, status)
    VALUES (p_exam_id, v_uid, 'submitted')
    RETURNING * INTO v_attempt;

    INSERT INTO public.exam_answers (attempt_id, question_id, choice_index, answer_text, score)
    SELECT v_attempt.id, q.id, r.choice_index, r.answer_text,
           CASE WHEN q.type = 'mcq' AND r.choice_index = q.correct_index
                THEN q.max_score ELSE NULL END
    FROM jsonb_to_recordset(p_answers)
         AS r(question_id uuid, choice_index integer, answer_text text)
    JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = p_exam_id;

    SELECT COALESCE(sum(score), 0) INTO v_auto
    FROM public.exam_answers
    WHERE attempt_id = v_attempt.id;

    SELECT EXISTS (
        SELECT 1 FROM public.exam_questions
        WHERE exam_id = p_exam_id AND type = 'essay'
    ) INTO v_has_essays;

    UPDATE public.exam_attempts SET auto_score = v_auto
    WHERE id = v_attempt.id
    RETURNING * INTO v_attempt;

    IF NOT v_has_essays THEN
        UPDATE public.exam_attempts
        SET status = 'graded', manual_score = 0,
            final_score = v_auto, graded_at = now()
        WHERE id = v_attempt.id
        RETURNING * INTO v_attempt;

        INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
        VALUES (v_uid, 'exam_graded', 'تم تصحيح الاختبار', v_exam.title,
                'exam_graded:' || v_attempt.id, 'exam_attempts', v_attempt.id)
        ON CONFLICT (dedup_key) DO NOTHING;
    END IF;

    -- supervising staff are notified of every submission (one notification
    -- per recipient; dedup_key scoped by user so the fan-out never collapses)
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT u.id, 'exam_submitted', 'اختبار بانتظار المراجعة', v_exam.title,
           'exam_submitted:' || u.id || ':' || v_attempt.id, 'exam_attempts', v_attempt.id
    FROM public.profiles u
    WHERE u.role IN ('admin', 'mr_walid', 'teacher')
      AND u.status = 'active' AND u.deleted_at IS NULL
    ON CONFLICT (dedup_key) DO NOTHING;

    PERFORM public.audit_log('exam.submitted', 'exam_attempts', v_attempt.id,
        jsonb_build_object('exam_id', p_exam_id, 'auto_score', v_auto));

    RETURN v_attempt;
END $$;

COMMENT ON FUNCTION public.submit_exam_attempt(uuid, jsonb) IS 'Student submit path: one attempt per (exam, student); MCQ auto-graded, essays pending grade_exam_attempt; notifies staff (exam_submitted) and, when fully auto-graded, the student (exam_graded).';

-- ---------------------------------------------------------------------
-- 8) grade_exam_attempt: staff-only SECURITY DEFINER essay grading.
--    Applies per-essay scores, sets manual_score/final_score and the
--    graded status, and notifies the student (exam_graded).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grade_exam_attempt(p_attempt_id uuid, p_scores jsonb)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempt public.exam_attempts%ROWTYPE;
    v_manual  numeric(5, 2) := 0;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE id = p_attempt_id;
    IF v_attempt.id IS NULL THEN
        RAISE EXCEPTION 'attempt_not_found';
    END IF;
    IF v_attempt.status = 'graded' THEN
        RAISE EXCEPTION 'already_graded';
    END IF;

    -- every score must target an essay question of the attempt's exam
    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(COALESCE(p_scores, '[]'::jsonb))
             AS r(question_id uuid, score numeric)
        LEFT JOIN public.exam_questions q
               ON q.id = r.question_id
              AND q.exam_id = v_attempt.exam_id
              AND q.type = 'essay'
        WHERE q.id IS NULL OR r.score IS NULL OR r.score < 0
    ) THEN
        RAISE EXCEPTION 'invalid_scores';
    END IF;

    UPDATE public.exam_answers a
    SET score = r.score
    FROM jsonb_to_recordset(COALESCE(p_scores, '[]'::jsonb))
         AS r(question_id uuid, score numeric)
    WHERE a.attempt_id = v_attempt.id AND a.question_id = r.question_id;

    SELECT COALESCE(sum(a.score), 0) INTO v_manual
    FROM public.exam_answers a
    JOIN public.exam_questions q ON q.id = a.question_id
    WHERE a.attempt_id = v_attempt.id AND q.type = 'essay';

    UPDATE public.exam_attempts
    SET status = 'graded',
        manual_score = v_manual,
        final_score = COALESCE(auto_score, 0) + v_manual,
        graded_by = auth.uid(),
        graded_at = now()
    WHERE id = v_attempt.id
    RETURNING * INTO v_attempt;

    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT v_attempt.student_id, 'exam_graded', 'تم تصحيح الاختبار', e.title,
           'exam_graded:' || v_attempt.id, 'exam_attempts', v_attempt.id
    FROM public.exams e
    WHERE e.id = v_attempt.exam_id
    ON CONFLICT (dedup_key) DO NOTHING;

    PERFORM public.audit_log('exam.graded', 'exam_attempts', p_attempt_id,
        jsonb_build_object('final_score', v_attempt.final_score, 'graded_by', auth.uid()));

    RETURN v_attempt;
END $$;

COMMENT ON FUNCTION public.grade_exam_attempt(uuid, jsonb) IS 'Staff essay grading: applies per-essay scores, finalizes the attempt and notifies the student (exam_graded).';

-- ---------------------------------------------------------------------
-- 9) Grants (SECURITY.md 8.2 pattern): every new function is revoked from
--    PUBLIC and granted to authenticated. No anon surface is added.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.list_exams(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_exams(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_exam_questions(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_exam_questions(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_exam_attempt(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_exam_attempt(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.grade_exam_attempt(uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.grade_exam_attempt(uuid, jsonb) TO authenticated;

-- =====================================================================
-- >>> included from migrations\0030_comments.sql
-- =====================================================================

-- =====================================================================
-- 0030_comments
-- Phase 7 | Comments | Database
-- Lesson discussions on top of the unit-purchase model
-- (IMPLEMENTATION-PLAN.md section 9):
--   lesson_comments: top-level comments + self-referencing replies.
-- notification_type gains lesson_comment (reply to your comment) and
-- comment_reply (staff oversight of every added comment/reply) via
-- ALTER TYPE ... ADD VALUE (PG 12+).
--
-- Append-only migration: nothing in 0001..0029 is modified.
-- Access: reads gated on can_access_lesson(lesson.lesson_id) or staff;
-- writes via the SECURITY DEFINER RPCs (add_lesson_comment /
-- delete_lesson_comment / list_lesson_comments); RLS keeps direct DML
-- to own rows (students) or any row (staff).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) notification_type: lesson_comment / comment_reply (ADD VALUE only,
--    idempotent; only referenced at runtime inside function bodies).
-- ---------------------------------------------------------------------
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'lesson_comment';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'comment_reply';

-- ---------------------------------------------------------------------
-- 2) lesson_comments table (DATABASE.md section 4.19).
--    No updated_at column, so set_updated_at is NOT attached; the table
--    joins the audit_trigger inventory (MED-8).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_comments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id  uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    parent_id  uuid REFERENCES public.lesson_comments(id) ON DELETE CASCADE,
    body       text NOT NULL CHECK (length(btrim(body)) > 0 AND length(btrim(body)) <= 1000),
    status     text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'removed')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lesson_comments_lesson_idx ON public.lesson_comments(lesson_id);
CREATE INDEX IF NOT EXISTS lesson_comments_parent_idx ON public.lesson_comments(parent_id) WHERE parent_id IS NOT NULL;

ALTER TABLE public.lesson_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_comments FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.lesson_comments IS 'Lesson comments with self-referencing replies. Students with lesson access may read visible rows and write their own; staff read everything (incl. removed) and moderate.';

-- ---------------------------------------------------------------------
-- 3) Parent/lesson consistency guard for direct DML: a reply must point
--    to a visible comment of the SAME lesson (the RPC validates too).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lesson_comments_parent_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.parent_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM public.lesson_comments p
           WHERE p.id = NEW.parent_id
             AND p.lesson_id = NEW.lesson_id
             AND p.status = 'visible'
       ) THEN
        RAISE EXCEPTION 'invalid_parent';
    END IF;
    RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.lesson_comments_parent_check() FROM PUBLIC;

DROP TRIGGER IF EXISTS lesson_comments_parent_check ON public.lesson_comments;
CREATE TRIGGER lesson_comments_parent_check BEFORE INSERT OR UPDATE ON public.lesson_comments
    FOR EACH ROW EXECUTE FUNCTION public.lesson_comments_parent_check();

-- ---------------------------------------------------------------------
-- 4) audit_trigger on lesson_comments (MED-8 inventory; progress and
--    notifications remain excluded). No set_updated_at: the table has no
--    updated_at column.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_trigger ON public.lesson_comments;
CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.lesson_comments
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ---------------------------------------------------------------------
-- 5) RLS policies (named style of 0009/0025/0028/0029). Students read
--    visible rows only when they can access the lesson (or their own);
--    writes to own rows; staff read everything and moderate.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_comments_select_gated ON public.lesson_comments;
CREATE POLICY lesson_comments_select_gated ON public.lesson_comments
    FOR SELECT
    USING (
        (
            public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
            OR author_id = auth.uid()
            OR public.can_access_lesson(lesson_id)
        )
        AND (
            status = 'visible'
            OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
            OR author_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS lesson_comments_insert_gated ON public.lesson_comments;
CREATE POLICY lesson_comments_insert_gated ON public.lesson_comments
    FOR INSERT
    WITH CHECK (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR public.can_access_lesson(lesson_id)
    );

DROP POLICY IF EXISTS lesson_comments_update_own_or_staff ON public.lesson_comments;
CREATE POLICY lesson_comments_update_own_or_staff ON public.lesson_comments
    FOR UPDATE
    USING (author_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (author_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS lesson_comments_delete_own_or_staff ON public.lesson_comments;
CREATE POLICY lesson_comments_delete_own_or_staff ON public.lesson_comments
    FOR DELETE
    USING (author_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- 6) add_lesson_comment: SECURITY DEFINER student/staff writer.
--    Validates access + body + parent, inserts, then notifies:
--      - comment_reply -> every supervising staff member (moderation
--        visibility for every new comment/reply; dedup scoped per user).
--      - lesson_comment -> the parent comment's author when a reply is
--        posted to their comment (not self).
--    The audit_trigger captures lesson_comments.insert automatically.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_lesson_comment(p_lesson_id uuid, p_body text, p_parent_id uuid DEFAULT NULL)
RETURNS public.lesson_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid     uuid := auth.uid();
    v_comment public.lesson_comments%ROWTYPE;
    v_lesson  text;
    v_parent  public.lesson_comments%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
            OR public.can_access_lesson(p_lesson_id)) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF length(btrim(COALESCE(p_body, ''))) = 0
       OR length(btrim(COALESCE(p_body, ''))) > 1000 THEN
        RAISE EXCEPTION 'invalid_body';
    END IF;

    IF p_parent_id IS NOT NULL THEN
        SELECT * INTO v_parent
        FROM public.lesson_comments
        WHERE id = p_parent_id;
        IF v_parent.id IS NULL OR v_parent.status <> 'visible'
           OR v_parent.lesson_id <> p_lesson_id THEN
            RAISE EXCEPTION 'invalid_parent';
        END IF;
    END IF;

    SELECT title INTO v_lesson FROM public.lessons WHERE id = p_lesson_id;

    INSERT INTO public.lesson_comments (lesson_id, author_id, parent_id, body)
    VALUES (p_lesson_id, v_uid, p_parent_id, btrim(p_body))
    RETURNING * INTO v_comment;

    -- staff moderation visibility (one notification per recipient)
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT u.id, 'comment_reply', 'تعليق جديد على الدرس', v_lesson,
           'comment_reply:' || u.id || ':' || v_comment.id, 'lesson_comments', v_comment.id
    FROM public.profiles u
    WHERE u.role IN ('admin', 'mr_walid', 'teacher')
      AND u.status = 'active' AND u.deleted_at IS NULL
      AND u.id <> v_uid
    ON CONFLICT (dedup_key) DO NOTHING;

    -- reply to your comment (skip self)
    IF v_parent.id IS NOT NULL AND v_parent.author_id <> v_uid THEN
        INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
        VALUES (v_parent.author_id, 'lesson_comment', 'تم الرد على تعليقك', v_lesson,
                'lesson_comment:' || v_comment.id, 'lesson_comments', v_comment.id)
        ON CONFLICT (dedup_key) DO NOTHING;
    END IF;

    RETURN v_comment;
END $$;

-- ---------------------------------------------------------------------
-- 7) delete_lesson_comment: hard delete of own comment, or any comment
--    by staff (moderation). audit_trigger captures the DELETE.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_lesson_comment(p_comment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row public.lesson_comments%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT * INTO v_row FROM public.lesson_comments WHERE id = p_comment_id;
    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'comment_not_found';
    END IF;

    IF v_row.author_id <> auth.uid()
       AND NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    DELETE FROM public.lesson_comments WHERE id = p_comment_id;
END $$;

-- ---------------------------------------------------------------------
-- 8) list_lesson_comments: access-gated reader. Staff see every status
--    (moderation); students see visible rows only. Replies are returned
--    as flat rows; the client groups by parent_id.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_lesson_comments(p_lesson_id uuid)
RETURNS TABLE (
    id          uuid,
    lesson_id   uuid,
    author_id   uuid,
    author_name text,
    parent_id   uuid,
    body        text,
    status      text,
    created_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
            OR public.can_access_lesson(p_lesson_id)) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    RETURN QUERY
    SELECT c.id, c.lesson_id, c.author_id, COALESCE(p.full_name, ''),
           c.parent_id, c.body, c.status, c.created_at
    FROM public.lesson_comments c
    JOIN public.lessons l ON l.id = c.lesson_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
    WHERE c.lesson_id = p_lesson_id
      AND (c.status = 'visible'
           OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    ORDER BY c.created_at, c.id;
END $$;

COMMENT ON FUNCTION public.add_lesson_comment(uuid, text, uuid) IS 'Student/staff comment writer: access-gated, body-validated, parent must be a visible comment of the same lesson; notifies staff (comment_reply) and the parent author on replies (lesson_comment).';
COMMENT ON FUNCTION public.delete_lesson_comment(uuid) IS 'Deletes the caller''s own comment, or any comment when staff (moderation).';
COMMENT ON FUNCTION public.list_lesson_comments(uuid) IS 'Access-gated comment list: students see visible rows, staff see all statuses (incl. removed) for moderation.';

-- ---------------------------------------------------------------------
-- 9) Grants (SECURITY.md 8.2 pattern): every new function is revoked from
--    PUBLIC and granted to authenticated. No anon surface is added.
--    lesson_comments_parent_check is internal (no client grant).
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.add_lesson_comment(uuid, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_lesson_comment(uuid, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_lesson_comment(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_lesson_comment(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_lesson_comments(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_lesson_comments(uuid) TO authenticated;

-- =====================================================================
-- >>> included from migrations\0031_pricing_staff_fee.sql
-- =====================================================================

-- =====================================================================
-- 0031_pricing_staff_fee
-- Pricing model per owner decision: the TEACHER sets the base price for
-- each unit (also at creation time), the ADMIN sets ONE fixed platform
-- fee that is added automatically on top of every unit
-- (total = base_price + platform_fee, generated column).
--   * set_unit_price(uuid, numeric)   -> staff (teacher/mr_walid/admin)
--   * set_platform_fee(numeric)       -> OWNER (mr_walid) or ADMIN only (global fixed fee)
--   * get_platform_fee()              -> public read (anon + auth)
-- Plus: create_lesson/update_lesson accept p_is_trial so the teacher can
-- mark the ONE free (trial) lesson per unit from the UI (decision: trial
-- lesson = free video; max one per unit enforced by lessons_trial_unique).
-- Reference: IMPLEMENTATION-PLAN.md section 3 (replaces decision J).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Supersede the old admin-only 3-arg set_unit_price (0028).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_unit_price(uuid, numeric, numeric);

-- ---------------------------------------------------------------------
-- 2) set_unit_price: staff sets the BASE price only; the platform fee
--    is always the admin's global fee (app_settings key 'platform_fee').
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_unit_price(
    p_unit_id uuid,
    p_base_price numeric(10, 2)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_fee numeric(10, 2) := COALESCE(
        (SELECT (value::text)::numeric
           FROM public.app_settings WHERE key = 'platform_fee'),
        0
    );
    v_pricing_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.units WHERE id = p_unit_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    IF p_base_price < 0 THEN
        RAISE EXCEPTION 'invalid_price';
    END IF;

    INSERT INTO public.unit_pricing (unit_id, base_price, platform_fee)
    VALUES (p_unit_id, p_base_price, v_fee)
    ON CONFLICT (unit_id) DO UPDATE
    SET base_price = EXCLUDED.base_price
    RETURNING id INTO v_pricing_id;

    PERFORM public.audit_log('unit_pricing.set', 'unit_pricing', v_pricing_id,
        jsonb_build_object('unit_id', p_unit_id, 'base_price', p_base_price,
                           'platform_fee', v_fee));
END $$;

-- ---------------------------------------------------------------------
-- 3) set_platform_fee: ADMIN ONLY. One fixed fee for the platform,
--    applied to every unit's price (past and future rows).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_platform_fee(p_fee numeric(10, 2))
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_fee < 0 THEN
        RAISE EXCEPTION 'invalid_fee';
    END IF;

    INSERT INTO public.app_settings (key, value, description)
    VALUES ('platform_fee', to_jsonb(p_fee),
            'Fixed platform fee added on top of every unit price (admin-only)')
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        description = EXCLUDED.description,
        updated_at = now();

    UPDATE public.unit_pricing SET platform_fee = p_fee;

    PERFORM public.audit_log('platform_fee.set', 'app_settings', NULL,
        jsonb_build_object('platform_fee', p_fee));
END $$;

-- ---------------------------------------------------------------------
-- 4) get_platform_fee: public read (anon + authenticated) so the
--    landing page can show "base + fixed platform fee".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_fee()
RETURNS numeric(10, 2)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT (value::text)::numeric
           FROM public.app_settings WHERE key = 'platform_fee'),
        0
    )
$$;

-- ---------------------------------------------------------------------
-- 5) Lessons: p_is_trial support (free video per unit, teacher-chosen).
--    Old 4-arg signatures are dropped so no stale overload survives.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_lesson(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.update_lesson(uuid, text, text, integer);

CREATE OR REPLACE FUNCTION public.create_lesson(
    p_unit_id uuid,
    p_title text,
    p_description text DEFAULT NULL,
    p_sort_order integer DEFAULT 0,
    p_is_trial boolean DEFAULT false
)
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

    INSERT INTO public.lessons (unit_id, title, description, sort_order, is_trial)
    VALUES (p_unit_id, btrim(p_title), p_description, p_sort_order, COALESCE(p_is_trial, false))
    RETURNING id INTO v_id;

    PERFORM public.audit_log('lesson.create', 'lesson', v_id,
        jsonb_build_object('unit_id', p_unit_id, 'is_trial', COALESCE(p_is_trial, false)));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_lesson(
    p_lesson_id uuid,
    p_title text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_sort_order integer DEFAULT NULL,
    p_is_trial boolean DEFAULT NULL
)
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
        sort_order = COALESCE(p_sort_order, sort_order),
        is_trial = COALESCE(p_is_trial, is_trial)
    WHERE id = p_lesson_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.update', 'lesson', p_lesson_id);
END $$;

-- ---------------------------------------------------------------------
-- 6) Grants (mirror the 0028/0010 matrix posture).
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.set_unit_price(uuid, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_unit_price(uuid, numeric) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_platform_fee(numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_platform_fee(numeric) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_platform_fee() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_fee() TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_lesson(uuid, text, text, integer, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_lesson(uuid, text, text, integer, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_lesson(uuid, text, text, integer, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_lesson(uuid, text, text, integer, boolean) TO authenticated;

-- ---------------------------------------------------------------------
-- 7) Documentation comments reflect the new model.
-- ---------------------------------------------------------------------
COMMENT ON TABLE public.unit_pricing IS 'Permanent per-unit pricing (teacher base price + fixed platform fee = generated total). Base via set_unit_price (staff); fee via set_platform_fee (admin only).';

COMMENT ON COLUMN public.lessons.is_trial IS 'Free trial lesson (one free video per unit, teacher-chosen; max one among live lessons).';

-- =====================================================================
-- >>> included from migrations\0032_fix_code_generation_randomness.sql
-- =====================================================================

-- 0032_fix_code_generation_randomness.sql
-- ---------------------------------------------------------------------------
-- HOSTED-PLATFORM FIX: code generation failed with
--    42883: function gen_random_bytes(integer) does not exist
-- on Supabase because pgcrypto lives in the `extensions` schema there, while
-- create_unit_codes_internal (0028) pinned `search_path = public` (B1).
-- On local Postgres the harness installs pgcrypto INTO public, so the bug
-- only surfaced on the hosted platform.
--
-- Fix: repin the function's search_path to `public, extensions` — the
-- canonical Supabase pattern for SECURITY DEFINER functions that call
-- extension functions. `extensions` does not exist in the local harness,
-- but Postgres skips missing schemas during resolution, so gen_random_bytes
-- still resolves from public there (same behavior on both environments).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_unit_codes_internal(
    p_unit_pricing_id uuid,
    p_count integer,
    p_note text DEFAULT NULL
)
RETURNS SETOF public.unit_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_actor uuid := COALESCE(auth.uid(), NULLIF(current_setting('app.system_actor_id', true), '')::uuid);
    v_pricing_active boolean;
    v_code text;
    v_attempt int;
    v_inserted int := 0;
    v_row public.unit_codes%ROWTYPE;
BEGIN
    IF p_count < 1 OR p_count > 500 THEN
        RAISE EXCEPTION 'invalid_count';
    END IF;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'system_actor_required';
    END IF;

    SELECT is_active INTO v_pricing_active FROM public.unit_pricing WHERE id = p_unit_pricing_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_pricing_not_found';
    END IF;
    IF NOT v_pricing_active THEN
        RAISE EXCEPTION 'unit_inactive';
    END IF;

    v_attempt := 0;
    WHILE v_inserted < p_count AND v_attempt < p_count * 5 LOOP
        v_attempt := v_attempt + 1;
        v_code := 'WLDN-';
        FOR i IN 1..12 LOOP
            v_code := v_code || substr(v_chars, get_byte(gen_random_bytes(1), 0) % 32 + 1, 1);
        END LOOP;

        BEGIN
            INSERT INTO public.unit_codes (code, unit_pricing_id, created_by, note)
            VALUES (v_code, p_unit_pricing_id, v_actor, p_note)
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

-- Internal-only: keep the client surface locked (same posture as 0028).
REVOKE EXECUTE ON FUNCTION public.create_unit_codes_internal(uuid, integer, text) FROM PUBLIC;

COMMENT ON FUNCTION public.create_unit_codes_internal(uuid, integer, text) IS
'Generates WLDN-* codes for a pricing row (unambiguous charset A22, pgcrypto randomness). search_path = public, extensions so gen_random_bytes resolves on Supabase (extensions schema) and locally (public). Edge-Function-only entry: create_unit_codes_for_staff.';

-- =====================================================================
-- >>> included from migrations\0033_platform_fee_owner_access.sql
-- =====================================================================

-- =====================================================================
-- 0033_platform_fee_owner_access
-- Pricing | Owner access
-- The fixed platform fee (set_platform_fee) was ADMIN ONLY, but the
-- platform has no real admin account: Walid Awny (mr_walid) is the
-- owner. Allow mr_walid OR admin to set the fee; teachers/students
-- stay denied (verified by the harness in 04_business.sql).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_platform_fee(p_fee numeric(10, 2))
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_fee < 0 THEN
        RAISE EXCEPTION 'invalid_fee';
    END IF;

    INSERT INTO public.app_settings (key, value, description)
    VALUES ('platform_fee', to_jsonb(p_fee),
            'Fixed platform fee added on top of every unit price (owner/admin-only)')
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        description = EXCLUDED.description,
        updated_at = now();

    UPDATE public.unit_pricing SET platform_fee = p_fee;

    PERFORM public.audit_log('platform_fee.set', 'app_settings', NULL,
        jsonb_build_object('platform_fee', p_fee));
END $$;

COMMENT ON FUNCTION public.set_platform_fee(numeric) IS
    'One fixed platform fee added on top of every unit price (owner mr_walid or admin only; 0033).';

-- =====================================================================
-- >>> included from migrations\0034_platform_fee_safe_update.sql
-- =====================================================================

-- =====================================================================
-- 0034_platform_fee_safe_update
-- Pricing | Hosted Supabase guardrails
-- Hosted projects enable "safe update" guardrails by default: any
-- UPDATE without a WHERE clause raises 21000 ("UPDATE requires a WHERE
-- clause") even inside SECURITY DEFINER functions. set_platform_fee
-- rewrites EVERY unit_pricing row, so its blanket UPDATE is now
-- expressed with an explicit predicate (unit_id IS NOT NULL == all rows).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_platform_fee(p_fee numeric(10, 2))
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_fee < 0 THEN
        RAISE EXCEPTION 'invalid_fee';
    END IF;

    INSERT INTO public.app_settings (key, value, description)
    VALUES ('platform_fee', to_jsonb(p_fee),
            'Fixed platform fee added on top of every unit price (owner/admin-only)')
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        description = EXCLUDED.description,
        updated_at = now();

    UPDATE public.unit_pricing SET platform_fee = p_fee WHERE unit_id IS NOT NULL;

    PERFORM public.audit_log('platform_fee.set', 'app_settings', NULL,
        jsonb_build_object('platform_fee', p_fee));
END $$;

COMMENT ON FUNCTION public.set_platform_fee(numeric) IS
    'One fixed platform fee added on top of every unit price (owner mr_walid or admin only; 0033; safe-update WHERE 0034).';

-- =====================================================================
-- >>> included from migrations\0035_rebrand_platform_name.sql
-- =====================================================================

-- Update the platform display name in the live database.
-- Rebrand: platform display name is now just "وليد عونى". Existing rows were seeded
-- with the old name (0011) and updated once (0024); this migration
-- applies the final rename for already-deployed environments.
UPDATE public.app_settings
SET value = '"وليد عونى"',
    updated_at = now()
WHERE key = 'platform_name';

-- =====================================================================
-- >>> included from migrations\0036_lesson_boards.sql
-- =====================================================================

-- =====================================================================
-- 0036_lesson_boards
-- Phase 8 | Lesson Boards (السبورات) | Database
-- Lesson-board photos: the teacher uploads whiteboard/board photos per
-- lesson (upload / delete / reorder / preview) and students see them as
-- an image grid inside the SAME lesson tab below the video and the PDF
-- (ARCHITECTURE.md §8.2 row 6 "get-board-signed-urls / upload-board /
-- delete-board"; SECURITY.md section 9 storage posture).
--
-- Why a SECURITY DEFINER wrapper family (same shape as 0015/0025/0031):
--   lesson_boards carries a SINGLE SELECT policy + FORCE RLS (0009-style),
--   so a caller-token client CANNOT insert/update/delete rows. Every
--   mutation goes through the four staff-guarded wrappers below which
--   re-validate all rules server-side (authoritative backstop; the Edge
--   Functions pre-check the same rules over the caller token for UX).
--
-- Why the single SELECT policy (lesson_boards_select_gated):
--   * staff (admin / mr_walid / teacher) -> every row (metadata for the
--     staff UI: pending + ready + soft-deleted rows, the UI filters);
--   * student -> ONLY is_ready=true rows of lessons they can access
--     (can_access_lesson); pending uploads and soft-deleted boards stay
--     invisible, so a student can never mint a row-backed storage path
--     (0015's issuance-time boundary).
--   NO INSERT/UPDATE/DELETE policies: DML is RPC-only (lesson_pdfs
--   pattern). The partial-unique "one primary per lesson" index does NOT
--   apply here: every board is shown, so there is no is_primary column
--   and no (lesson_id, sort_order) uniqueness — sort_order is a display
--   hint maintained exclusively by reorder_boards (same non-unique
--   posture as lessons/units sort_order).
--
-- Why soft delete (delete_board_upload_record):
--   Unlike the PDF flow (0031 hard-deletes only NON-ready rows), a
--   board may be removed at ANY time — ready or pending — because the
--   teacher deletes photos the students already see. The row is
--   soft-deleted (deleted_at = now()) so the storage object can be
--   removed best-effort by the Edge Function and the metadata stays for
--   audit/restore history.
--
-- Why reorder_boards enforces the EXACT ready set:
--   The staff UI sends the full ordered list of the lesson's ready,
--   non-deleted boards. Any deviation (missing/extra/duplicate ids, a
--   pending or deleted row, a row of another lesson) is a
--   validation_error / board_not_found / wrong_lesson — the wrapper
--   never guesses the intended order.
--
-- Storage: private `boards` bucket (config.toml [storage.buckets.boards],
-- public=false, file_size_limit=10MiB) + ONE row-backed INSERT policy on
-- storage.objects (boards_insert_row_backed) — the minimal exception to
-- "no direct object policies" required for createSignedUploadUrl
-- issuance over the caller-token path (0015's exact pattern: path shape
-- '{lesson_id}/{uuid}.{ext}' AND an existing non-deleted lesson_boards
-- row with that storage_path VISIBLE TO THE CALLER). Object reads stay
-- locked behind the get-board-signed-urls Edge Function.
--
-- Error surface (P0001 + detail message):
--   permission_denied | lesson_not_found | lesson_deleted |
--   invalid_board_size | invalid_file_extension | board_not_found |
--   wrong_lesson | board_already_ready | validation_error
--
-- Grant surface: authenticated ONLY (client RPCs #66-69, count asserted
-- in tests/local/sql/05_grants.sql). anon stays fully locked.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) lesson_boards table (lesson_pdfs shape: 0002:218-239)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_boards (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id      uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    storage_path   text NOT NULL UNIQUE CHECK (length(btrim(storage_path)) > 0),
    original_name  text NOT NULL CHECK (length(btrim(original_name)) > 0),
    size_bytes     bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
    mime_type      text NOT NULL DEFAULT 'image/jpeg',
    sort_order     integer NOT NULL DEFAULT 0,
    is_ready       boolean NOT NULL DEFAULT false,
    deleted_at     timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_boards FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.lesson_boards IS 'Board photos attached to lessons (Supabase Storage-backed, private boards bucket). is_ready gates student visibility; sort_order is the teacher-driven display order (reorder_boards); delete_board_upload_record soft-deletes. Direct SELECT by students returns metadata only; content requires a signed URL from get-board-signed-urls.';

CREATE INDEX IF NOT EXISTS idx_lesson_boards_lesson ON public.lesson_boards (lesson_id);

-- ---------------------------------------------------------------------
-- 2) Triggers: set_updated_at (the table carries updated_at, 0004
--    convention) + audit_trigger (MED-8 inventory, 0005/0029/0030 style).
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON public.lesson_boards;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.lesson_boards
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_trigger ON public.lesson_boards;
CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.lesson_boards
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ---------------------------------------------------------------------
-- 3) RLS: single SELECT policy (0025:193-200 lesson_pdfs pattern with
--    the is_primary condition dropped — every ready board is shown).
--    Student branch adds deleted_at IS NULL (spec: students see ready
--    boards only, "غير المحذوفة" — soft-deleted boards must not leak).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_boards_select_gated ON public.lesson_boards;
CREATE POLICY lesson_boards_select_gated ON public.lesson_boards
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND is_ready AND deleted_at IS NULL)
    );

-- ---------------------------------------------------------------------
-- 4) create_board_upload_record(p_lesson_id, p_original_name, p_size_bytes)
-- Staff-guarded EF entry point (upload-board): reserves the storage
-- path and creates the pending lesson_boards row. The path is generated
-- here as '{lesson_id}/{uuid}.{ext}' with gen_random_uuid() — the client
-- NEVER supplies a path component (IDOR/path-traversal impossible, 0015
-- pattern). The extension (jpg/jpeg/png/webp, case-insensitive) is the
-- only content hint available before the bytes exist; mime_type is
-- derived from it and pinned on the signed upload URL by the EF.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_board_upload_record(
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
    v_name text;
    v_ext text;
    v_mime text;
    v_sort integer;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_size_bytes IS NOT NULL AND (p_size_bytes < 0 OR p_size_bytes > 10485760) THEN
        RAISE EXCEPTION 'invalid_board_size';
    END IF;

    -- NOTE: unqualified column refs must be avoided: the RETURNS TABLE
    -- OUT parameter `id` shadows table columns in SQL statements (0015:85).
    IF NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id) THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id AND l.deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'lesson_deleted';
    END IF;

    -- basename only (strip any client path segment) + extension checks
    v_name := btrim(p_original_name);
    v_name := substring(v_name from '([^/\\]*)$');
    v_ext  := lower(substring(v_name from '\.([^.]+)$'));
    IF v_name IS NULL OR v_name = '' OR length(v_name) > 255
       OR v_ext IS NULL OR v_ext NOT IN ('jpg', 'jpeg', 'png', 'webp') THEN
        RAISE EXCEPTION 'invalid_file_extension';
    END IF;

    v_mime := CASE v_ext
        WHEN 'jpg'  THEN 'image/jpeg'
        WHEN 'jpeg' THEN 'image/jpeg'
        WHEN 'png'  THEN 'image/png'
        WHEN 'webp' THEN 'image/webp'
    END;

    SELECT COALESCE(MAX(lb.sort_order), 0) + 1 INTO v_sort
    FROM public.lesson_boards lb
    WHERE lb.lesson_id = p_lesson_id AND lb.deleted_at IS NULL;

    v_path := p_lesson_id::text || '/' || gen_random_uuid()::text || '.' || v_ext;

    INSERT INTO public.lesson_boards
        (lesson_id, storage_path, original_name, size_bytes, mime_type, sort_order, is_ready)
    VALUES
        (p_lesson_id, v_path, v_name, p_size_bytes, v_mime, v_sort, false)
    RETURNING lesson_boards.id INTO v_id;

    PERFORM public.audit_log('board.upload_started', 'lesson_board', v_id,
        jsonb_build_object('lesson_id', p_lesson_id, 'original_name', v_name,
                           'storage_path', v_path, 'size_bytes', p_size_bytes,
                           'mime_type', v_mime));

    RETURN QUERY SELECT v_id, v_path;
END $$;

COMMENT ON FUNCTION public.create_board_upload_record(uuid, text, bigint) IS
'Phase 8 staff wrapper: reserves the pending lesson_boards row + server-generated {lesson_id}/{uuid}.{ext} storage_path for the upload-board Edge Function. Staff-guarded; validates lesson, 10MiB size cap and jpg/jpeg/png/webp extension; mime_type derived from the extension; sort_order = max+1. Authenticated-only grant (client RPC #66).';

-- ---------------------------------------------------------------------
-- 5) finalize_board_upload(p_board_id)
-- Staff-guarded: marks the pending row is_ready=true after the bytes
-- were uploaded to the signed URL. No primary concept — every ready
-- board is displayed. A second finalize is a board_already_ready error.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_board_upload(p_board_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
    v_ready boolean;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lb.lesson_id, lb.is_ready INTO v_lesson, v_ready
    FROM public.lesson_boards lb
    WHERE lb.id = p_board_id AND lb.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'board_not_found';
    END IF;
    IF v_ready THEN
        RAISE EXCEPTION 'board_already_ready';
    END IF;

    UPDATE public.lesson_boards SET is_ready = true WHERE id = p_board_id;

    PERFORM public.audit_log('board.finalized', 'lesson_board', p_board_id,
        jsonb_build_object('lesson_id', v_lesson));
END $$;

COMMENT ON FUNCTION public.finalize_board_upload(uuid) IS
'Phase 8 staff wrapper: marks a pending lesson_boards row ready after the upload (is_ready=true). Staff-guarded; board_not_found when absent/deleted; board_already_ready on repeat. Authenticated-only grant (client RPC #67).';

-- ---------------------------------------------------------------------
-- 6) delete_board_upload_record(p_lesson_id, p_board_id)
-- Staff-guarded SOFT delete (deleted_at = now()) of ANY board row —
-- ready or pending — because the teacher removes photos students
-- already see (unlike the PDF release 0031 which hard-deletes only
-- non-ready rows). The Edge Function removes the Storage object
-- best-effort; this wrapper is the authoritative, audited backstop.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_board_upload_record(
    p_lesson_id uuid,
    p_board_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lb.lesson_id INTO v_lesson
    FROM public.lesson_boards lb
    WHERE lb.id = p_board_id AND lb.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'board_not_found';
    END IF;
    IF v_lesson <> p_lesson_id THEN
        RAISE EXCEPTION 'wrong_lesson';
    END IF;

    UPDATE public.lesson_boards
    SET deleted_at = now(), updated_at = now()
    WHERE id = p_board_id;

    PERFORM public.audit_log('board.deleted', 'lesson_board', p_board_id,
        jsonb_build_object('lesson_id', p_lesson_id));
END $$;

COMMENT ON FUNCTION public.delete_board_upload_record(uuid, uuid) IS
'Phase 8 staff wrapper: soft-deletes a lesson_boards row (ready OR pending) of the given lesson — the ONLY delete surface for boards. Staff-guarded; board_not_found when absent/already deleted; wrong_lesson on lesson mismatch. Authenticated-only grant (client RPC #68).';

-- ---------------------------------------------------------------------
-- 7) reorder_boards(p_lesson_id, p_board_ids)
-- Staff-guarded: the list must be EXACTLY the lesson''s ready,
-- non-deleted boards (same size + same set, no duplicates) — any
-- deviation is a validation_error; each id must exist
-- (board_not_found) and belong to the lesson (wrong_lesson). Updates
-- sort_order to 1..n in the passed order. No (lesson_id, sort_order)
-- unique constraint exists (see header), so sequential in-place
-- updates cannot transiently collide.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_boards(
    p_lesson_id uuid,
    p_board_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expected integer;
    v_lesson uuid;
    v_ready boolean;
    v_i integer;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    -- a NULL/empty array or any duplicate entry is never a valid reorder
    IF p_board_ids IS NULL OR cardinality(p_board_ids) = 0
       OR cardinality(p_board_ids) <>
          cardinality(ARRAY(SELECT DISTINCT unnest(p_board_ids))) THEN
        RAISE EXCEPTION 'validation_error';
    END IF;

    -- the list must cover EXACTLY the ready, non-deleted boards of the lesson
    SELECT count(*) INTO v_expected
    FROM public.lesson_boards lb
    WHERE lb.lesson_id = p_lesson_id AND lb.deleted_at IS NULL AND lb.is_ready;

    IF cardinality(p_board_ids) <> v_expected THEN
        RAISE EXCEPTION 'validation_error';
    END IF;

    FOR v_i IN 1..cardinality(p_board_ids) LOOP
        SELECT lb.lesson_id, lb.is_ready INTO v_lesson, v_ready
        FROM public.lesson_boards lb
        WHERE lb.id = p_board_ids[v_i] AND lb.deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'board_not_found';
        END IF;
        IF v_lesson <> p_lesson_id THEN
            RAISE EXCEPTION 'wrong_lesson';
        END IF;
        IF NOT v_ready THEN
            RAISE EXCEPTION 'validation_error';
        END IF;

        UPDATE public.lesson_boards SET sort_order = v_i WHERE id = p_board_ids[v_i];
    END LOOP;

    PERFORM public.audit_log('board.reordered', 'lesson_board', NULL,
        jsonb_build_object('lesson_id', p_lesson_id, 'board_ids', to_jsonb(p_board_ids)));
END $$;

COMMENT ON FUNCTION public.reorder_boards(uuid, uuid[]) IS
'Phase 8 staff wrapper: applies the teacher''s board order (sort_order 1..n). The list must equal EXACTLY the lesson''s ready non-deleted boards; duplicates/missing/extra ids -> validation_error, unknown -> board_not_found, other lesson -> wrong_lesson. Authenticated-only grant (client RPC #69).';

-- ---------------------------------------------------------------------
-- 8) Grants: authenticated only (SECURITY.md 8.2 pattern; explicit
--    REVOKE FROM PUBLIC first because new functions otherwise inherit
--    the PUBLIC default grant). anon: nothing.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_board_upload_record(uuid, text, bigint) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_board_upload_record(uuid, text, bigint) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.finalize_board_upload(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.finalize_board_upload(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_board_upload_record(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_board_upload_record(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reorder_boards(uuid, uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reorder_boards(uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------
-- 9) Storage: private `boards` bucket + ONE row-backed INSERT policy
--    (0011 bucket pattern + 0015:122-137 policy pattern). Signed-upload-
--    URL issuance over the caller-token path requires the caller to
--    satisfy an INSERT policy on storage.objects; the WITH CHECK binds
--    the path to an existing, non-deleted lesson_boards row visible to
--    the caller (pending rows are invisible to students under the 0009-
--    style SELECT policy, so only staff can reserve paths; every
--    row-backed path already holds its object, so a direct upload to a
--    visible ready path conflicts on the real platform).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('boards', 'boards', false)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        DROP POLICY IF EXISTS boards_insert_row_backed ON storage.objects;
        CREATE POLICY boards_insert_row_backed ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'boards'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
                AND EXISTS (
                    SELECT 1 FROM public.lesson_boards
                    WHERE storage_path = name AND deleted_at IS NULL
                )
            );
    END IF;
END$$;

-- =====================================================================
-- >>> included from migrations\0037_delete_pdf_upload_record.sql
-- =====================================================================

-- =====================================================================
-- 0037_delete_pdf_upload_record.sql
-- Phase 4 (PDF upload): delete/release RPC for the delete-pdf Edge
-- Function (cleanup of ghost rows after a failed PUT/finalize).
--
-- Why a SECURITY DEFINER wrapper (same shape as 0015/0017): 0009 gives
-- lesson_pdfs a SELECT-only policy + FORCE RLS, so a caller-token
-- DELETE is silently a no-op (0 rows). This wrapper is the ONLY delete
-- surface for lesson_pdfs rows and re-validates every rule
-- server-side (authoritative backstop; the Edge Function pre-checks the
-- same rules over the caller token for UX).
--
-- Purpose: a PDF upload row that failed before finalize (is_ready=false)
-- would otherwise accumulate forever: handleUpload resets the UI and
-- clears the file on failure, and no orphan rule exists for lesson_pdfs.
-- The wrapper hard-deletes the non-ready row (no content was ever
-- committed) and audits the cancellation; the Edge Function removes the
-- Storage object best-effort.
--
-- Rules enforced:
--   * staff only: is_admin() OR is_mr_walid() (request-scoped claims)
--   * the row must exist and must NOT be soft-deleted (pdf_not_found)
--   * the row must belong to the given lesson (wrong_lesson)
--   * the row must NOT be ready (pdf_not_pending) — a finalized row
--     must never be silently removed
--   * hard DELETE + audit (pdf.upload_cancelled)
--
-- Error surface (P0001 + detail message):
--   permission_denied | pdf_not_found | wrong_lesson | pdf_not_pending
--
-- Grant surface: authenticated ONLY (client RPC #69, count asserted in
-- tests/local/sql/05_grants.sql). anon stays fully locked.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.delete_pdf_upload_record(
    p_lesson_id uuid,
    p_pdf_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
    v_ready boolean;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lp.lesson_id, lp.is_ready INTO v_lesson, v_ready
    FROM public.lesson_pdfs lp
    WHERE lp.id = p_pdf_id AND lp.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'pdf_not_found';
    END IF;
    IF v_lesson <> p_lesson_id THEN
        RAISE EXCEPTION 'wrong_lesson';
    END IF;
    IF v_ready THEN
        RAISE EXCEPTION 'pdf_not_pending';
    END IF;

    DELETE FROM public.lesson_pdfs WHERE id = p_pdf_id;

    PERFORM public.audit_log('pdf.upload_cancelled', 'lesson_pdf', p_pdf_id,
        jsonb_build_object('lesson_id', p_lesson_id));
END $$;

COMMENT ON FUNCTION public.delete_pdf_upload_record(uuid, uuid) IS
'Phase 4 staff wrapper: hard-deletes a non-ready lesson_pdfs row (failed/abandoned PDF upload) so ghost rows can be cleaned from the UI. Staff-guarded; only non-ready rows of the given lesson; hard delete + audit. Authenticated-only grant (client RPC #65).';

-- only authenticated may call it (client RPC surface)
REVOKE EXECUTE ON FUNCTION public.delete_pdf_upload_record(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_pdf_upload_record(uuid, uuid) TO authenticated;

-- =====================================================================
-- >>> included from migrations\0038_unit_publish.sql
-- =====================================================================

-- =====================================================================
-- 0038_unit_publish
-- Unit-level publish/hide. The UNIT status is the hard availability gate
-- for everything student-facing: redeem_unit_code (0028) raises
-- 'unit_inactive' ("الوحدة غير متاحة حالياً") unless the unit is
-- published, get_public_unit_prices / listUnitsForGrade / can_access_lesson
-- all require status = 'published'. Yet no RPC could ever CHANGE
-- units.status (only lessons had publish_lesson/hide_lesson, 0007/0025,
-- and create_unit/update_unit never touch status), so every unit stayed
-- 'draft' forever and every code redemption failed with
-- 'unit_inactive' even though the unit was fully set up and its lessons
-- were published.
--
-- Fix: publish_unit / hide_unit mirroring the publish_lesson/hide_lesson
-- posture (0025): staff-guarded (admin/mr_walid/teacher), audited,
-- pinned search_path, granted to authenticated only.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.publish_unit(p_unit_id uuid)
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
    SET status = 'published'
    WHERE id = p_unit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    PERFORM public.audit_log('unit.publish', 'unit', p_unit_id);
END $$;

CREATE OR REPLACE FUNCTION public.hide_unit(p_unit_id uuid)
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
    SET status = 'hidden'
    WHERE id = p_unit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    PERFORM public.audit_log('unit.hide', 'unit', p_unit_id);
END $$;

-- ---------------------------------------------------------------------
-- Grants (same posture as every staff function: authenticated only).
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.publish_unit(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.publish_unit(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.hide_unit(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hide_unit(uuid) TO authenticated;

COMMENT ON FUNCTION public.publish_unit(uuid) IS
'Staff-guarded unit publish: makes the unit visible to students and redeemable via activation codes (the redeem_unit_code gate).';

COMMENT ON FUNCTION public.hide_unit(uuid) IS
'Staff-guarded unit hide: removes the unit from the student curriculum and blocks code redemption with unit_inactive.';

-- =====================================================================
-- >>> included from migrations\0039_dashboard_staff_platform_revenue.sql
-- =====================================================================

-- =====================================================================
-- 0039_dashboard_staff_platform_revenue.sql
-- Dashboard revenue split (decision: owner request 2026-08):
--   * staff_revenue_this_month = sum(base_price) of active purchases
--     this month  -> "إيرادات مستر وليد" (excludes the platform fee)
--   * platform_fee_total      = sum(platform_fee) of active purchases
--     -> "إجمالي إيرادات المنصة" (platform fees only)
-- Replaces the old single total_price-based keys (total_revenue /
-- revenue_this_month). CREATE OR REPLACE keeps grants (REVOKE/GRAINT
-- are re-asserted here for idempotency).
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT jsonb_build_object(
        'students', jsonb_build_object(
            'total',        (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND role = 'student'),
            'active',       (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'active' AND role = 'student'),
            'disabled',     (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'disabled' AND role = 'student'),
            'deleted',      (SELECT count(*) FROM public.profiles WHERE deleted_at IS NOT NULL AND role = 'student'),
            'new_this_month', (SELECT count(*) FROM public.profiles
                               WHERE deleted_at IS NULL AND role = 'student' AND created_at >= date_trunc('month', now()))
        ),
        'purchases', jsonb_build_object(
            'total',                    (SELECT count(*) FROM public.unit_purchases WHERE status = 'active'),
            'staff_revenue_this_month', (SELECT COALESCE(sum(base_price), 0) FROM public.unit_purchases
                                         WHERE status = 'active' AND purchased_at >= date_trunc('month', now())),
            'platform_fee_total',       (SELECT COALESCE(sum(platform_fee), 0) FROM public.unit_purchases
                                         WHERE status = 'active')
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
        'by_grade', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'grade_name', r.grade_name,
                'students', r.students,
                'purchases', r.purchases,
                'revenue', r.revenue
            ) ORDER BY r.sort_order)
            FROM (
                SELECT g.name AS grade_name, g.sort_order,
                       count(DISTINCT p.id) AS students,
                       count(DISTINCT up.id) AS purchases,
                       COALESCE(sum(up.total_price), 0) AS revenue
                FROM public.grades g
                LEFT JOIN public.profiles p
                       ON p.grade_id = g.id AND p.deleted_at IS NULL AND p.role = 'student'
                LEFT JOIN public.unit_purchases up
                       ON up.student_id = p.id AND up.status = 'active'
                WHERE g.deleted_at IS NULL
                GROUP BY g.id, g.name, g.sort_order
            ) r
        ), '[]'::jsonb),
        'top_units', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'unit_name', r.unit_name,
                'purchases', r.purchases,
                'revenue', r.revenue
            ) ORDER BY r.revenue DESC)
            FROM (
                SELECT u.name AS unit_name,
                       count(DISTINCT up.id) AS purchases,
                       COALESCE(sum(up.total_price), 0) AS revenue
                FROM public.unit_purchases up
                JOIN public.units u ON u.id = up.unit_id
                WHERE up.status = 'active'
                GROUP BY u.id, u.name
                ORDER BY revenue DESC
                LIMIT 5
            ) r
        ), '[]'::jsonb),
        'recent_purchases', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', p.full_name,
                'grade_name', g.name,
                'unit_name', u.name,
                'total_price', up.total_price,
                'purchased_at', up.purchased_at
            ) ORDER BY up.purchased_at DESC)
            FROM public.unit_purchases up
            JOIN public.profiles p ON p.id = up.student_id
            JOIN public.units u ON u.id = up.unit_id
            JOIN public.grades g ON g.id = u.grade_id
            WHERE up.status = 'active'
            LIMIT 5
        ), '[]'::jsonb)
    ) INTO v_stats;

    RETURN v_stats;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

-- =====================================================================
-- >>> included from migrations\0040_codes_used_by_name.sql
-- =====================================================================

-- 0040_codes_used_by_name.sql
-- list_codes_by_unit: include the student name who redeemed each code.
-- The function's return type changes from SETOF unit_codes to an explicit
-- TABLE that appends used_by_name (LEFT JOIN profiles on used_by).
-- PostgreSQL does not allow changing a function's return type, so the old
-- function must be dropped first (DROP FUNCTION removes its grants too;
-- the REVOKE/GRANT lines from 0028 are re-applied below).
-- NOTE: RETURNS TABLE introduces PL/pgSQL variables named like table
-- columns, so units.id MUST stay qualified inside the body (42702
-- "column reference id is ambiguous" otherwise).

DROP FUNCTION IF EXISTS public.list_codes_by_unit(uuid);

CREATE OR REPLACE FUNCTION public.list_codes_by_unit(p_unit_id uuid)
RETURNS TABLE (
    id              uuid,
    code            text,
    unit_pricing_id uuid,
    status          public.code_status,
    created_by      uuid,
    used_at         timestamptz,
    used_by         uuid,
    revoked_at      timestamptz,
    revoked_by      uuid,
    note            text,
    created_at      timestamptz,
    updated_at      timestamptz,
    used_by_name    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.units WHERE units.id = p_unit_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    RETURN QUERY
        SELECT uc.id, uc.code, uc.unit_pricing_id, uc.status, uc.created_by, uc.used_at,
               uc.used_by, uc.revoked_at, uc.revoked_by, uc.note, uc.created_at, uc.updated_at,
               p.full_name AS used_by_name
        FROM public.unit_codes uc
        JOIN public.unit_pricing up ON up.id = uc.unit_pricing_id
        LEFT JOIN public.profiles p ON p.id = uc.used_by
        WHERE up.unit_id = p_unit_id
        ORDER BY uc.created_at DESC;
END $$;

COMMENT ON FUNCTION public.list_codes_by_unit(uuid) IS
    'Staff: codes of a unit with the full name of the student who redeemed each used code (used_by_name is NULL until redeemed).';

REVOKE EXECUTE ON FUNCTION public.list_codes_by_unit(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_codes_by_unit(uuid) TO authenticated;

-- =====================================================================
-- >>> included from migrations\0041_boards_storage_rls_fix.sql
-- =====================================================================

-- =====================================================================
-- 0041_boards_storage_rls_fix
-- Phase 8/9 | Lesson Boards (السبورات) + PDF storage posture | Database
-- Storage-policy + finalize hardening for the lesson-boards release
-- (follow-up to 0036; runtime findings from the boards EF/DB review):
--
--   C1: boards_select_row_backed (NEW) - the Storage API performs
--       INSERT ... RETURNING * on upload, so the 0036 boards INSERT
--       policy alone aborts every boards upload with 42501 unless a
--       SELECT policy covers the inserted row (the exact 0021 H1
--       lesson for the pdfs bucket). Add the row-backed SELECT mirror
--       of the boards INSERT check - same bucket, same
--       '{uuid}/{uuid}.{jpg|jpeg|png|webp}' path shape (the 0036:394
--       regex verbatim), same existing non-deleted lesson_boards row,
--       and, exactly like boards_insert_row_backed, NO is_ready filter
--       (pending rows are already invisible to students under the
--       lesson_boards SELECT policy, so the INSERT scope is inherited;
--       ready paths already hold their object on the real platform ->
--       409 on a direct re-upload, 0015 pattern). Object reads stay
--       locked behind the get-board-signed-urls Edge Function (service
--       key) as before.
--
--   H1: boards_delete_row_backed + pdfs_delete_row_backed (NEW) - the
--       delete-board / delete-pdf Edge Functions remove the Storage
--       object over the CALLER token (client.storage.from(...).remove),
--       which requires a DELETE policy on storage.objects the caller
--       can satisfy. Without it every object removal is a silent no-op
--       (0 rows) and the orphaned object leaks forever. Both policies
--       are staff-only - (public.is_admin() OR public.is_mr_walid()
--       OR public.is_teacher()), the same STAFF_ROLES set the two EFs
--       check (delete-pdf/index.ts and delete-board/index.ts) - and
--       row-backed: the object must still be referenced by a
--       non-deleted lesson_boards / lesson_pdfs row, so staff can only
--       remove objects that belong to the schema's own upload
--       bookkeeping, never arbitrary bucket content.
--
--   Decision (generalized DELETE posture): boards and PDFs share one
--       storage layer, so the DELETE surface is added for BOTH buckets
--       in one migration; the storage.objects policy inventory lock in
--       tests/local/sql/08_security.sql moves from 3 to 6 policies.
--
--   M2: finalize_board_upload now refuses to mark a board ready when
--       its Storage object does not exist (new error board_storage_missing)
--       - a pending row without bytes must never become student-visible.
--
-- Decisions owned by OTHER agents (referenced here, NOT touched):
--   * expires_in removal from the upload EFs' success envelopes is
--     Agent B's scope (upload-pdf/index.ts:407 +
--     create-video-upload-session/index.ts:735); this migration does
--     not change any EF or response shape.
--   * pending board cards staying visible in the staff UI is Agent C's
--     scope (UI rendering of is_ready=false rows); the DB surface
--     (rows, RPCs, policies) already supports it unchanged.
--
-- All statements are guarded on to_regclass('storage.objects') so this
-- migration also runs unchanged on the local harness shim (which has
-- the same storage.objects surface) and on hosted (which always has
-- it) - 0021 pattern. No old migrations are modified.
-- =====================================================================

-- ---------------------------------------------------------------------
-- C1: boards SELECT policy - row-backed mirror of the 0036 INSERT
-- check. Required by the Storage API's INSERT ... RETURNING * upload
-- path (42501 without it); NO is_ready filter (same scope as
-- boards_insert_row_backed, 0036:389-399).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
        DROP POLICY IF EXISTS boards_select_row_backed ON storage.objects;
        CREATE POLICY boards_select_row_backed ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'boards'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
                AND EXISTS (
                    SELECT 1 FROM public.lesson_boards
                    WHERE storage_path = name AND deleted_at IS NULL
                )
            );
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- H1: boards DELETE policy - staff-only, row-backed. Required by the
-- delete-board Edge Function's caller-token object removal
-- (client.storage.from('boards').remove([storage_path])); the role
-- check mirrors the EF's STAFF_ROLES and the row-backing keeps the
-- DELETE confined to schema-managed objects.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
        DROP POLICY IF EXISTS boards_delete_row_backed ON storage.objects;
        CREATE POLICY boards_delete_row_backed ON storage.objects
            FOR DELETE TO authenticated
            USING (
                bucket_id = 'boards'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
                AND (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
                AND EXISTS (
                    SELECT 1 FROM public.lesson_boards
                    WHERE storage_path = name AND deleted_at IS NULL
                )
            );
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- H1: pdfs DELETE policy - staff-only, row-backed. Same rationale as
-- the boards DELETE above for the delete-pdf Edge Function's
-- caller-token object removal; the row-backing references the actual
-- lesson_pdfs table (0021 SELECT-mirror posture, same storage_path
-- column).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
        DROP POLICY IF EXISTS pdfs_delete_row_backed ON storage.objects;
        CREATE POLICY pdfs_delete_row_backed ON storage.objects
            FOR DELETE TO authenticated
            USING (
                bucket_id = 'pdfs'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
                AND (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
                AND EXISTS (
                    SELECT 1 FROM public.lesson_pdfs
                    WHERE storage_path = name AND deleted_at IS NULL
                )
            );
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- M2: finalize_board_upload - the pending row must have reached
-- Storage before it can be marked ready (board_storage_missing).
-- CREATE OR REPLACE of the 0036 wrapper: the storage.objects probe
-- runs inside the SECURITY DEFINER body, where the function owner is
-- exempt from storage.objects RLS (ENABLE-without-FORCE, 0021 H2), so
-- the check is authoritative for every caller regardless of policies.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_board_upload(p_board_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
    v_ready boolean;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lb.lesson_id, lb.is_ready INTO v_lesson, v_ready
    FROM public.lesson_boards lb
    WHERE lb.id = p_board_id AND lb.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'board_not_found';
    END IF;
    IF v_ready THEN
        RAISE EXCEPTION 'board_already_ready';
    END IF;

    -- M2 (0041): no Storage object -> the upload never happened; a
    -- pending row without bytes must never become student-visible.
    IF NOT EXISTS (
        SELECT 1 FROM storage.objects so
        WHERE so.bucket_id = 'boards'
          AND so.name = (SELECT lb.storage_path FROM public.lesson_boards lb WHERE lb.id = p_board_id)
    ) THEN
        RAISE EXCEPTION 'board_storage_missing';
    END IF;

    UPDATE public.lesson_boards SET is_ready = true WHERE id = p_board_id;

    PERFORM public.audit_log('board.finalized', 'lesson_board', p_board_id,
        jsonb_build_object('lesson_id', v_lesson));
END $$;

COMMENT ON FUNCTION public.finalize_board_upload(uuid) IS
'Phase 8 staff wrapper: marks a pending lesson_boards row ready after the upload (is_ready=true). Staff-guarded; board_not_found when absent/deleted; board_already_ready on repeat; board_storage_missing when the Storage object does not exist yet (0041 M2). Authenticated-only grant (client RPC #67).';

-- =====================================================================
-- >>> included from migrations\0042_videos_multi_youtube.sql
-- =====================================================================

-- =====================================================================
-- 0042_videos_multi_youtube
-- Phase 5 (Bunny video) | Multi-video lessons + YouTube | Database
--
-- The teacher can now attach MULTIPLE videos to one lesson (the schema
-- already supported it structurally via is_primary; the blockers were
-- the student RLS gate and the one-pending-upload-per-lesson rule) and
-- add YouTube videos by URL alongside Bunny uploads.
--
--   C1: lesson_videos gains `source` ('bunny'|'youtube') and nullable
--       `youtube_video_id`; bunny_video_id DROPs NOT NULL (youtube rows
--       have no Bunny id) while keeping its length CHECK (NULL passes).
--       A CHECK enforces the exact source/asset pairing and a partial
--       UNIQUE index guards youtube_video_id globally (soft-deleted
--       rows included - a deleted video id is never re-registered).
--       bunny_library_id stays NOT NULL (0002); youtube rows carry the
--       literal 'youtube' placeholder so the column needs no change.
--       Existing bunny rows default to source='bunny' untouched.
--
--   C2: lesson_videos_select_gated is recreated (0025 canonical shape +
--       is_teacher branch) with the `is_primary` condition REMOVED: a
--       student now sees EVERY status='ready' non-deleted video of a
--       lesson they can access (multi-video UX). `deleted_at IS NULL`
--       is added explicitly - previously soft-deleted rows were hidden
--       implicitly by the is_primary filter (0004 clears it), so the
--       new policy must state it itself. Staff policies untouched.
--
--   C3: create_video_upload_record (0025 body) is recreated with ONLY
--       the lesson_has_pending_upload orphan block removed: parallel
--       background uploads may now coexist for one lesson. Everything
--       else (staff guard, mode rules, replace target rules, primary
--       logic, audit) is UNCHANGED; the COMMENT is refreshed.
--
--   C4: add_youtube_video(lesson, url[, title]) - NEW staff RPC. The
--       YouTube id is extracted SERVER-side by the new internal helper
--       youtube_video_id_from_url (youtu.be/, watch?v=, /embed/,
--       /shorts/, m. subdomain, or a bare 11-char id) - the client can
--       never pick the id. Guards: staff three-way (is_admin OR
--       is_mr_walid OR is_teacher), lesson exists + not soft-deleted,
--       invalid_youtube_url, youtube_video_duplicate (pre-check + the
--       unique index as final guard via unique_violation handler).
--       First video of a lesson takes is_primary (B9/MED-10 shape,
--       exactly like create mode in 0016); status='ready' (no Bunny
--       processing pipeline exists for YouTube); title NULL/empty ->
--       'فيديو يوتيوب', sanitized to <=255 chars; audit
--       video.youtube_added; authenticated-only grant (0016 pattern).
--
--   C5: delete_lesson_video(lesson, video_id) - NEW staff RPC. Soft-
--       deletes (deleted_at=now(); the 0004 trigger clears is_primary
--       in the same transaction). When the deleted video WAS the
--       primary, the oldest ready non-deleted sibling (created_at, id
--       tiebreak) is promoted - the 0008 promotion pattern; a lesson
--       with no ready sibling stays primary-less (students see all
--       ready rows anyway). Guards: staff three-way, video_not_found
--       (missing or already soft-deleted), wrong_lesson; audit
--       video.deleted; authenticated-only grant (0031 pattern).
--
-- Error surface (P0001 + detail message, same convention as 0016):
--   permission_denied | lesson_not_found | lesson_deleted |
--   invalid_youtube_url | youtube_video_duplicate | video_not_found |
--   wrong_lesson
-- =====================================================================

-- ---------------------------------------------------------------------
-- C1: source / youtube_video_id columns + cross-column CHECK + global
-- youtube unique index (bunny_video_id DROPs NOT NULL; its length
-- CHECK stays and passes NULL).
-- ---------------------------------------------------------------------
ALTER TABLE public.lesson_videos
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'bunny',
    ADD COLUMN IF NOT EXISTS youtube_video_id text;

ALTER TABLE public.lesson_videos ALTER COLUMN bunny_video_id DROP NOT NULL;

ALTER TABLE public.lesson_videos DROP CONSTRAINT IF EXISTS lesson_videos_source_check;
ALTER TABLE public.lesson_videos ADD CONSTRAINT lesson_videos_source_check CHECK (
    source IN ('bunny', 'youtube')
    AND (
        (source = 'bunny' AND bunny_video_id IS NOT NULL AND youtube_video_id IS NULL)
        OR (source = 'youtube' AND youtube_video_id IS NOT NULL AND bunny_video_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_videos_youtube
    ON public.lesson_videos (youtube_video_id)
    WHERE youtube_video_id IS NOT NULL;

COMMENT ON TABLE public.lesson_videos IS 'Videos attached to lessons (Bunny-backed or YouTube, source column). Exactly one non-deleted primary per lesson (partial unique, binding B9); soft-delete clears is_primary in the same transaction. youtube_video_id is globally unique (partial unique); bunny rows keep bunny_video_id + bunny_library_id (youtube rows carry the ''youtube'' library placeholder).';

-- ---------------------------------------------------------------------
-- C2: student video gate - every ready non-deleted video of an
-- accessible lesson (is_primary condition removed; 0025 teacher branch
-- preserved; deleted_at filter now explicit).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_videos_select_gated ON public.lesson_videos;
CREATE POLICY lesson_videos_select_gated ON public.lesson_videos
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND status = 'ready' AND deleted_at IS NULL)
    );

-- ---------------------------------------------------------------------
-- C3: create_video_upload_record - the lesson_has_pending_upload block
-- is removed ONLY (multi-upload/parallel sessions); body otherwise the
-- 0025 canonical version, guard included.
-- ---------------------------------------------------------------------
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
'Phase 5 staff wrapper: reserves the pending lesson_videos row for a Bunny upload session (create/replace). Staff-guarded, enforces the replace target rules. 0042: the one-pending-row-per-lesson orphan rule was REMOVED (parallel upload sessions). ONLY lesson_videos insert surface (0009 FORCE RLS has no INSERT policy). Authenticated-only grant (client RPC #38).';

-- ---------------------------------------------------------------------
-- C4: add_youtube_video - staff RPC; server-side youtube id extraction
-- ---------------------------------------------------------------------

-- internal helper: extracts the 11-char youtube id from the known URL
-- shapes or a bare id; NULL when the input is not a valid form.
CREATE OR REPLACE FUNCTION public.youtube_video_id_from_url(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT CASE
        WHEN p_url ~ '^(?:https?://)?(?:www\.|m\.)?youtu\.be/' THEN
            (regexp_match(p_url, 'youtu\.be/([A-Za-z0-9_-]{11})(?=[&#/?]|$)'))[1]
        WHEN p_url ~ '^(?:https?://)?(?:www\.|m\.)?youtube\.com/watch' THEN
            (regexp_match(p_url, '(?:[?&]v=)([A-Za-z0-9_-]{11})(?=[&#]|$)'))[1]
        WHEN p_url ~ '^(?:https?://)?(?:www\.|m\.)?youtube\.com/embed/' THEN
            (regexp_match(p_url, 'youtube\.com/embed/([A-Za-z0-9_-]{11})(?=[&#]|$)'))[1]
        WHEN p_url ~ '^(?:https?://)?(?:www\.|m\.)?youtube\.com/shorts/' THEN
            (regexp_match(p_url, 'youtube\.com/shorts/([A-Za-z0-9_-]{11})(?=[&#]|$)'))[1]
        WHEN p_url ~ '^[A-Za-z0-9_-]{11}$' THEN p_url
        ELSE NULL
    END;
$$;

COMMENT ON FUNCTION public.youtube_video_id_from_url(text) IS
'Internal 0042 helper: extracts the 11-char YouTube video id from youtu.be/, youtube.com/watch?v=, /embed/, /shorts/, the m. subdomain or a bare id; NULL for any other input. IMMUTABLE, no client grants.';

REVOKE EXECUTE ON FUNCTION public.youtube_video_id_from_url(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.add_youtube_video(
    p_lesson_id uuid,
    p_youtube_url text,
    p_title text DEFAULT NULL
)
RETURNS TABLE (id uuid, is_primary boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_primary boolean;
    v_youtube_id text;
    v_title text;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
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

    v_youtube_id := public.youtube_video_id_from_url(btrim(p_youtube_url));
    IF v_youtube_id IS NULL THEN
        RAISE EXCEPTION 'invalid_youtube_url';
    END IF;

    -- duplicate guard (soft-deleted rows included: the partial unique
    -- index never re-registers a deleted id either)
    IF EXISTS (
        SELECT 1 FROM public.lesson_videos lv
        WHERE lv.youtube_video_id = v_youtube_id
    ) THEN
        RAISE EXCEPTION 'youtube_video_duplicate';
    END IF;

    v_title := NULLIF(btrim(COALESCE(p_title, '')), '');
    IF v_title IS NULL THEN
        v_title := 'فيديو يوتيوب';
    END IF;
    v_title := left(v_title, 255);

    v_primary := NOT EXISTS (
        SELECT 1 FROM public.lesson_videos lv
        WHERE lv.lesson_id = p_lesson_id AND lv.is_primary AND lv.deleted_at IS NULL
    );

    -- source='youtube' rows carry no Bunny id; bunny_library_id stays
    -- NOT NULL (0002) and takes the 'youtube' placeholder
    BEGIN
        INSERT INTO public.lesson_videos
            (lesson_id, bunny_library_id, title, status, is_primary, sort_order, source, youtube_video_id)
        VALUES
            (p_lesson_id, 'youtube', v_title, 'ready', v_primary, 0, 'youtube', v_youtube_id)
        RETURNING lesson_videos.id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
        -- final guard: the partial unique index caught a concurrent
        -- duplicate registration
        RAISE EXCEPTION 'youtube_video_duplicate';
    END;

    PERFORM public.audit_log('video.youtube_added', 'lesson_video', v_id,
        jsonb_build_object('lesson_id', p_lesson_id, 'youtube_video_id', v_youtube_id,
                           'is_primary', v_primary));

    RETURN QUERY SELECT v_id, v_primary;
END $$;

COMMENT ON FUNCTION public.add_youtube_video(uuid, text, text) IS
'Phase 5 staff wrapper: registers a YouTube video on a lesson (source=''youtube'', status=''ready''). Staff-guarded (is_admin/is_mr_walid/is_teacher); server-side youtube id extraction (invalid_youtube_url); youtube_video_duplicate on a registered id; first video of a lesson takes is_primary; audit video.youtube_added. Authenticated-only grant (client RPC #39).';

-- only authenticated may call it (client RPC surface, 0016 pattern)
REVOKE EXECUTE ON FUNCTION public.add_youtube_video(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_youtube_video(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- C5: delete_lesson_video - staff RPC; soft-delete + primary promotion
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_lesson_video(
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
    v_was_primary boolean;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lv.lesson_id, lv.is_primary INTO v_lesson, v_was_primary
    FROM public.lesson_videos lv
    WHERE lv.id = p_video_id AND lv.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'video_not_found';
    END IF;
    IF v_lesson <> p_lesson_id THEN
        RAISE EXCEPTION 'wrong_lesson';
    END IF;

    -- soft-delete; the 0004 BEFORE trigger clears is_primary in the
    -- same transaction (partial unique, binding B9)
    UPDATE public.lesson_videos SET deleted_at = now() WHERE id = p_video_id;

    -- promotion (0008 pattern): the deleted video WAS the primary ->
    -- the oldest ready non-deleted sibling takes the slot; a lesson
    -- with no ready sibling stays primary-less (students see every
    -- ready row anyway, C2).
    IF v_was_primary THEN
        UPDATE public.lesson_videos SET is_primary = true
        WHERE id = (
            SELECT lv.id FROM public.lesson_videos lv
            WHERE lv.lesson_id = p_lesson_id
              AND lv.status = 'ready'
              AND lv.deleted_at IS NULL
            ORDER BY lv.created_at, lv.id
            LIMIT 1
        );
    END IF;

    PERFORM public.audit_log('video.deleted', 'lesson_video', p_video_id,
        jsonb_build_object('lesson_id', p_lesson_id));
END $$;

COMMENT ON FUNCTION public.delete_lesson_video(uuid, uuid) IS
'Phase 5 staff wrapper: soft-deletes a lesson_videos row (any status/source) and, when the deleted video was the primary, promotes the oldest ready non-deleted sibling (0008 pattern). Staff-guarded; video_not_found when absent/deleted; wrong_lesson on cross-lesson ids; audit video.deleted. Authenticated-only grant (client RPC #40).';

-- only authenticated may call it (client RPC surface, 0031 pattern)
REVOKE EXECUTE ON FUNCTION public.delete_lesson_video(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_lesson_video(uuid, uuid) TO authenticated;

-- =====================================================================
-- >>> included from migrations\0043_financial_reports.sql
-- =====================================================================

-- =====================================================================
-- 0043_financial_reports
-- Financial reports for Teacher (mr_walid) vs Admin.
-- Single source of truth: unit_purchases (+ unit_codes + unit_pricing).
--   * Incoming  = active unit_purchases (base_price -> teacher,
--                 platform_fee -> platform, total = both)
--   * Outgoing  = platform_expenses (admin-registered operating costs) +
--                 platform_payouts (transfers to teacher).
--   * Pending   = available unit_codes * snapshot price (expected revenue)
--   * Void/lost = revoked codes + purchases status='void'
--
-- New objects:
--   * platform_expenses  - admin-only expense ledger
--   * platform_payouts   - admin-only payout ledger (to mr_walid)
--   * get_financial_reports(p_from, p_to, p_grade_id, p_unit_id)
--        -> jsonb with summary/by_grade/by_unit/daily/recent/code_stats
--   * add_platform_expense / list_platform_expenses
--   * add_platform_payout  / list_platform_payouts
-- All RPCs are SECURITY DEFINER with explicit role guards.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Expense ledger (outgoing - operating costs)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_expenses (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    amount      numeric(10, 2) NOT NULL CHECK (amount > 0),
    category    text NOT NULL CHECK (length(btrim(category)) > 0),
    description text,
    spent_at    timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES auth.users(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_expenses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_expenses_select_staff ON public.platform_expenses;
CREATE POLICY platform_expenses_select_staff ON public.platform_expenses
    FOR SELECT USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS platform_expenses_no_direct_insert ON public.platform_expenses;
CREATE POLICY platform_expenses_no_direct_insert ON public.platform_expenses
    FOR INSERT WITH CHECK (false);

COMMENT ON TABLE public.platform_expenses IS 'Admin-registered operating expenses (Bunny/Supabase/domain/ads). Writes via add_platform_expense only.';

-- ---------------------------------------------------------------------
-- 2) Payout ledger (outgoing - transfers to teacher)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_payouts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    amount       numeric(10, 2) NOT NULL CHECK (amount > 0),
    recipient_id uuid REFERENCES public.profiles(id),
    note         text,
    paid_at      timestamptz NOT NULL DEFAULT now(),
    created_by   uuid REFERENCES auth.users(id),
    created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_payouts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_payouts_select_staff ON public.platform_payouts;
CREATE POLICY platform_payouts_select_staff ON public.platform_payouts
    FOR SELECT USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS platform_payouts_no_direct_insert ON public.platform_payouts;
CREATE POLICY platform_payouts_no_direct_insert ON public.platform_payouts
    FOR INSERT WITH CHECK (false);

COMMENT ON TABLE public.platform_payouts IS 'Transfers from platform to teacher. Writes via add_platform_payout only.';

-- ---------------------------------------------------------------------
-- 3) Triggers: updated_at not needed (immutable ledger), audit only
-- ---------------------------------------------------------------------
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['platform_expenses', 'platform_payouts'] LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON public.%I', v_table);
    EXECUTE format('CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()', v_table);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 4) RPC: add_platform_expense (admin only)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_platform_expense(
    p_amount numeric(10,2),
    p_category text,
    p_description text DEFAULT NULL,
    p_spent_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF p_category IS NULL OR btrim(p_category) = '' THEN RAISE EXCEPTION 'category_required'; END IF;
  INSERT INTO public.platform_expenses (amount, category, description, spent_at, created_by)
  VALUES (p_amount, btrim(p_category), NULLIF(btrim(COALESCE(p_description,'')),''), COALESCE(p_spent_at, now()), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.audit_log('platform_expense.create','platform_expenses',v_id, jsonb_build_object('amount',p_amount,'category',p_category));
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.add_platform_expense(numeric,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_platform_expense(numeric,text,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_platform_expenses(
    p_from timestamptz DEFAULT NULL,
    p_to   timestamptz DEFAULT NULL
) RETURNS TABLE (id uuid, amount numeric(10,2), category text, description text, spent_at timestamptz, created_at timestamptz, created_by uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_mr_walid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  RETURN QUERY SELECT e.id, e.amount, e.category, e.description, e.spent_at, e.created_at, e.created_by
  FROM public.platform_expenses e
  WHERE (p_from IS NULL OR e.spent_at >= p_from) AND (p_to IS NULL OR e.spent_at <= p_to)
  ORDER BY e.spent_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.list_platform_expenses(timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_platform_expenses(timestamptz,timestamptz) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) RPC: add_platform_payout (admin only)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_platform_payout(
    p_amount numeric(10,2),
    p_note text DEFAULT NULL,
    p_paid_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
DECLARE v_recipient uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT id INTO v_recipient FROM public.profiles WHERE role='mr_walid' AND deleted_at IS NULL LIMIT 1;
  INSERT INTO public.platform_payouts (amount, recipient_id, note, paid_at, created_by)
  VALUES (p_amount, v_recipient, NULLIF(btrim(COALESCE(p_note,'')),''), COALESCE(p_paid_at, now()), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.audit_log('platform_payout.create','platform_payouts',v_id, jsonb_build_object('amount',p_amount));
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.add_platform_payout(numeric,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_platform_payout(numeric,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_platform_payouts(
    p_from timestamptz DEFAULT NULL,
    p_to   timestamptz DEFAULT NULL
) RETURNS TABLE (id uuid, amount numeric(10,2), note text, paid_at timestamptz, created_at timestamptz, recipient_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_mr_walid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  RETURN QUERY SELECT p.id, p.amount, p.note, p.paid_at, p.created_at, p.recipient_id
  FROM public.platform_payouts p
  WHERE (p_from IS NULL OR p.paid_at >= p_from) AND (p_to IS NULL OR p.paid_at <= p_to)
  ORDER BY p.paid_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.list_platform_payouts(timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_platform_payouts(timestamptz,timestamptz) TO authenticated;

-- ---------------------------------------------------------------------
-- 6) RPC: get_financial_reports (staff - teacher + admin share same data)
-- Filters: p_from, p_to (on purchased_at), p_grade_id, p_unit_id
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_financial_reports(
    p_from timestamptz DEFAULT NULL,
    p_to   timestamptz DEFAULT NULL,
    p_grade_id uuid DEFAULT NULL,
    p_unit_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- validate grade/unit existence when filtered
  IF p_grade_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.grades WHERE id=p_grade_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'grade_not_found';
  END IF;
  IF p_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.units WHERE id=p_unit_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'unit_not_found';
  END IF;

  SELECT jsonb_build_object(
    'filters', jsonb_build_object('from', p_from, 'to', p_to, 'grade_id', p_grade_id, 'unit_id', p_unit_id),
    'summary', jsonb_build_object(
        'total_purchases', (SELECT count(*) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'total_base',      (SELECT COALESCE(sum(up.base_price),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'total_platform_fee', (SELECT COALESCE(sum(up.platform_fee),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'total_revenue',   (SELECT COALESCE(sum(up.total_price),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'avg_ticket',      (SELECT COALESCE(round(avg(up.total_price),2),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'void_purchases',  (SELECT count(*) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='void' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'expenses_total',  (SELECT COALESCE(sum(amount),0) FROM public.platform_expenses WHERE (p_from IS NULL OR spent_at>=p_from) AND (p_to IS NULL OR spent_at<=p_to)),
        'payouts_total',   (SELECT COALESCE(sum(amount),0) FROM public.platform_payouts WHERE (p_from IS NULL OR paid_at>=p_from) AND (p_to IS NULL OR paid_at<=p_to)),
        'net_platform',    (SELECT COALESCE(sum(up.platform_fee),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)) - (SELECT COALESCE(sum(amount),0) FROM public.platform_expenses WHERE (p_from IS NULL OR spent_at>=p_from) AND (p_to IS NULL OR spent_at<=p_to)) - (SELECT COALESCE(sum(amount),0) FROM public.platform_payouts WHERE (p_from IS NULL OR paid_at>=p_from) AND (p_to IS NULL OR paid_at<=p_to))
    ),
    'by_grade', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('grade_id', r.grade_id,'grade_name',r.grade_name,'purchases',r.purchases,'base_revenue',r.base_revenue,'platform_revenue',r.platform_revenue,'total_revenue',r.total_revenue) ORDER BY r.sort_order)
        FROM (
          SELECT g.id as grade_id, g.name as grade_name, g.sort_order,
                 count(up.id) as purchases,
                 COALESCE(sum(up.base_price),0) as base_revenue,
                 COALESCE(sum(up.platform_fee),0) as platform_revenue,
                 COALESCE(sum(up.total_price),0) as total_revenue
          FROM public.grades g
          LEFT JOIN public.units u ON u.grade_id=g.id AND u.deleted_at IS NULL AND (p_unit_id IS NULL OR u.id=p_unit_id)
          LEFT JOIN public.unit_purchases up ON up.unit_id=u.id AND up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to)
          WHERE g.deleted_at IS NULL AND (p_grade_id IS NULL OR g.id=p_grade_id)
          GROUP BY g.id,g.name,g.sort_order
        ) r
    ),'[]'::jsonb),
    'by_unit', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('unit_id',r.unit_id,'unit_name',r.unit_name,'grade_name',r.grade_name,'purchases',r.purchases,'base_revenue',r.base_revenue,'platform_revenue',r.platform_revenue,'total_revenue',r.total_revenue) ORDER BY r.total_revenue DESC)
        FROM (
          SELECT u.id as unit_id, u.name as unit_name, g.name as grade_name,
                 count(up.id) as purchases,
                 COALESCE(sum(up.base_price),0) as base_revenue,
                 COALESCE(sum(up.platform_fee),0) as platform_revenue,
                 COALESCE(sum(up.total_price),0) as total_revenue
          FROM public.units u
          JOIN public.grades g ON g.id=u.grade_id
          LEFT JOIN public.unit_purchases up ON up.unit_id=u.id AND up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to)
          WHERE u.deleted_at IS NULL AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)
          GROUP BY u.id,u.name,g.name
        ) r
        WHERE r.purchases > 0
    ),'[]'::jsonb),
    'daily', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('date',r.d,'purchases',r.purchases,'base_revenue',r.base_revenue,'platform_revenue',r.platform_revenue,'total_revenue',r.total_revenue) ORDER BY r.d)
        FROM (
          SELECT date_trunc('day', up.purchased_at)::date as d,
                 count(*) as purchases,
                 COALESCE(sum(up.base_price),0) as base_revenue,
                 COALESCE(sum(up.platform_fee),0) as platform_revenue,
                 COALESCE(sum(up.total_price),0) as total_revenue
          FROM public.unit_purchases up
          JOIN public.units u ON u.id=up.unit_id
          WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)
          GROUP BY date_trunc('day', up.purchased_at)::date
          ORDER BY d DESC LIMIT 30
        ) r
    ),'[]'::jsonb),
    'code_stats', jsonb_build_object(
        'available', (SELECT count(*) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='available' AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)),
        'used',      (SELECT count(*) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='used' AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)),
        'revoked',   (SELECT count(*) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='revoked' AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)),
        'pending_base', (SELECT COALESCE(sum(up.base_price),0) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='available' AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)),
        'pending_total',(SELECT COALESCE(sum(up.total_price),0) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='available' AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id))
    ),
    'recent_purchases', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('student_name',p.full_name,'grade_name',g.name,'unit_name',u.name,'base_price',up.base_price,'platform_fee',up.platform_fee,'total_price',up.total_price,'purchased_at',up.purchased_at) ORDER BY up.purchased_at DESC)
        FROM public.unit_purchases up
        JOIN public.profiles p ON p.id=up.student_id
        JOIN public.units u ON u.id=up.unit_id
        JOIN public.grades g ON g.id=u.grade_id
        WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)
        LIMIT 10
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_financial_reports(timestamptz,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_financial_reports(timestamptz,timestamptz,uuid,uuid) TO authenticated;

-- RLS already asserted above; ensure grants on tables
GRANT SELECT ON public.platform_expenses TO authenticated;
GRANT SELECT ON public.platform_payouts TO authenticated;

-- =====================================================================
-- >>> included from migrations\0044_delete_ready_pdfs.sql
-- =====================================================================

-- =====================================================================
-- 0043_delete_ready_pdfs.sql
-- Extends delete_pdf_upload_record (0037) so staff can also delete
-- READY (finalized) lesson PDFs, not only failed-upload ghost rows.
--
-- 0037 intentionally refused ready rows (pdf_not_pending) because the
-- wrapper was scoped to upload-cleanup. With the new staff UI request,
-- finalized PDFs must be removable too (e.g. replacing outdated course
-- material), so the refusal is dropped:
--   * staff-only guard unchanged: is_admin() OR is_mr_walid()
--   * row must exist, belong to the given lesson, not soft-deleted
--   * hard DELETE + audit; action distinguishes intent:
--       - non-ready row -> 'pdf.upload_cancelled' (as before)
--       - ready row     -> 'pdf.deleted'
--   * deleting a primary PDF leaves the lesson without a primary;
--     students simply see no PDF until staff finalize another one.
--
-- The delete-pdf Edge Function removes the Storage object best-effort
-- before calling this wrapper (unchanged contract).
--
-- Error surface (P0001 + detail message):
--   permission_denied | pdf_not_found | wrong_lesson
-- ('pdf_not_pending' is no longer raised.)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.delete_pdf_upload_record(
    p_lesson_id uuid,
    p_pdf_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
    v_ready boolean;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lp.lesson_id, lp.is_ready INTO v_lesson, v_ready
    FROM public.lesson_pdfs lp
    WHERE lp.id = p_pdf_id AND lp.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'pdf_not_found';
    END IF;
    IF v_lesson <> p_lesson_id THEN
        RAISE EXCEPTION 'wrong_lesson';
    END IF;

    DELETE FROM public.lesson_pdfs WHERE id = p_pdf_id;

    PERFORM public.audit_log(
        CASE WHEN v_ready THEN 'pdf.deleted' ELSE 'pdf.upload_cancelled' END,
        'lesson_pdf', p_pdf_id,
        jsonb_build_object('lesson_id', p_lesson_id));
END $$;

COMMENT ON FUNCTION public.delete_pdf_upload_record(uuid, uuid) IS
'Phase 4 staff wrapper (extended by 0043): hard-deletes a lesson_pdfs row of the given lesson — failed/abandoned uploads AND finalized PDFs. Staff-guarded; hard delete + audit (pdf.upload_cancelled for ghost rows, pdf.deleted for ready ones). Authenticated-only grant.';

-- only authenticated may call it (client RPC surface)
REVOKE EXECUTE ON FUNCTION public.delete_pdf_upload_record(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_pdf_upload_record(uuid, uuid) TO authenticated;

-- =====================================================================
-- >>> included from migrations\0045_exam_images.sql
-- =====================================================================

-- =====================================================================
-- 0045_exam_images
-- Phase 12 | Exam Question Images (صور الامتحانات)
-- Teacher can attach images to exam questions (prompt image) and to
-- each MCQ choice (choice images). Students see images with the
-- question and answers.
--
-- Schema:
--   exam_questions.prompt_image_path text NULL  -- storage path in bucket exam-images
--   exam_questions.choice_image_paths jsonb NULL -- JSON array of storage paths or nulls, parallel to choices
--   bucket exam-images (private, 5MiB file_size_limit via config.toml)
--   No row-backed INSERT policy — uploads go through the service-role
--   Edge Function upload-exam-image (staff-only, validates exam ownership,
--   file name, size, extension, generates server-side path
--   {exam_id}/{uuid}.{ext}).
--   Reads go through get-exam-image-signed-urls (student via
--   can_access_lesson or staff preview) which signs each stored path
--   with service-role createSignedUrl (TTL 900).
--
-- Why two columns (prompt + per-choice array) instead of a separate
-- table: one image per question prompt + at most 4 per MCQ is bounded;
-- two nullable columns are simpler than a 1:N image table + ordering.
-- The array is parallel to choices: index i corresponds to choice i.
--
-- RLS: exam_questions keeps its 0029 policies (staff full, students
-- via can_access_lesson). No new policies. get_exam_questions is
-- extended to return the new columns (correct_index still masked for
-- students; image paths are never masked).
--
-- Storage: private bucket exam-images (mirrors boards/pdf buckets:
-- no public SELECT, no direct authenticated object policies — content
-- only via signed URLs). Row-backed guard is not needed: the upload
-- EF is service-role-signed, the only writer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columns on exam_questions
-- ---------------------------------------------------------------------
ALTER TABLE public.exam_questions
    ADD COLUMN IF NOT EXISTS prompt_image_path text
        CHECK (prompt_image_path IS NULL OR length(btrim(prompt_image_path)) > 0);

ALTER TABLE public.exam_questions
    ADD COLUMN IF NOT EXISTS choice_image_paths jsonb
        CHECK (choice_image_paths IS NULL OR jsonb_typeof(choice_image_paths) = 'array');

COMMENT ON COLUMN public.exam_questions.prompt_image_path IS
'Storage path in bucket exam-images for the question prompt image (NULL when no image). Set via teacher UI after upload-exam-image.';

COMMENT ON COLUMN public.exam_questions.choice_image_paths IS
'JSON array parallel to choices; each element is a storage path in bucket exam-images or null. Only for mcq questions.';

-- ---------------------------------------------------------------------
-- 2) Extend get_exam_questions to return the new columns (correct_index
--    masking preserved; image paths are always visible to allowed callers).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_exam_questions(p_exam_id uuid)
RETURNS SETOF public.exam_questions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT q.id, q.exam_id, q.type, q.prompt, q.choices,
           CASE WHEN (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
                THEN q.correct_index ELSE NULL END AS correct_index,
           q.max_score, q.sort_order,
           q.prompt_image_path, q.choice_image_paths
    FROM public.exam_questions q
    JOIN public.exams e ON e.id = q.exam_id AND e.deleted_at IS NULL
    WHERE q.exam_id = p_exam_id
      AND (
          public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
          OR public.can_access_lesson(e.lesson_id)
      )
    ORDER BY q.sort_order;
$$;

COMMENT ON FUNCTION public.get_exam_questions(uuid) IS 'Questions of an exam; correct_index is masked for non-staff callers (answer key never leaks). Includes prompt_image_path + choice_image_paths.';

-- keep grants (idempotent)
REVOKE EXECUTE ON FUNCTION public.get_exam_questions(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_exam_questions(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Storage bucket exam-images (private)
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('exam-images', 'exam-images', false)
        ON CONFLICT (id) DO NOTHING;
    END IF;
END$$;

-- No INSERT/SELECT/DELETE policies on storage.objects for exam-images:
-- the upload-exam-image and get-exam-image-signed-urls Edge Functions
-- use the service-role client to mint signed URLs, bypassing RLS.
-- Direct object access via caller tokens is intentionally blocked.

-- =====================================================================
-- >>> included from migrations\0046_delete_exam_fix.sql
-- =====================================================================

-- =====================================================================
-- 0046_delete_exam_fix
-- Fixes silent-failure delete path for exams / exam_questions.
--
-- Problem: `src/data/rpc.ts:deleteExam` did a direct
--   `UPDATE exams SET deleted_at = now() WHERE id = ?`
-- via the caller token. When RLS filtered the row (e.g. caller not
-- staff, or exam already soft-deleted) PostgREST returns 200 with
-- 0 rows — the UI showed "تم حذف الاختبار" while nothing was
-- deleted. The same silent 0-row success existed for
-- `deleteExamQuestion` (hard DELETE).
--
-- Fix: authoritative SECURITY DEFINER RPCs that:
--   * re-validate staff guard (is_admin OR is_mr_walid OR is_teacher)
--   * raise `exam_not_found` / `question_not_found` when the target
--     does not exist or is already soft-deleted
--   * soft-delete the exam (deleted_at = now()) + audit
--   * hard-delete the question + best-effort storage cleanup for
--     exam-images (prompt + choice paths) + audit
-- The wrappers are the ONLY supported delete surfaces; the direct
-- table RLS paths remain but the UI no longer relies on them.
--
-- Storage cleanup: exam-images objects are addressed as
--   {exam_id}/{uuid}.{ext}. On exam soft-delete all objects with
--   prefix {exam_id}/ are removed best-effort; on question hard-delete
--   only the paths referenced by that question are removed.
--   Failures are silent — DB state is authoritative.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) delete_exam(p_exam_id uuid) — soft-delete
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_exam(p_exam_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
    v_deleted timestamptz;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lesson_id, deleted_at INTO v_lesson, v_deleted
    FROM public.exams
    WHERE id = p_exam_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;

    IF v_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;

    UPDATE public.exams
    SET deleted_at = now(), updated_at = now()
    WHERE id = p_exam_id;

    -- best-effort storage cleanup for exam-images (service role bypasses RLS,
    -- but this definer is table owner and can delete storage rows directly;
    -- if storage schema is absent in harness, the block is skipped)
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
            DELETE FROM storage.objects
            WHERE bucket_id = 'exam-images'
              AND name LIKE p_exam_id::text || '/%';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- storage cleanup is best-effort; never fail the delete
        NULL;
    END;

    PERFORM public.audit_log('exam.deleted', 'exams', p_exam_id,
        jsonb_build_object('lesson_id', v_lesson));
END $$;

COMMENT ON FUNCTION public.delete_exam(uuid) IS 'Staff-only soft-delete for exams (deleted_at = now()). Raises exam_not_found when absent/already deleted, permission_denied otherwise. Best-effort removal of exam-images objects with prefix {exam_id}/. Audited.';

REVOKE EXECUTE ON FUNCTION public.delete_exam(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_exam(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) delete_exam_question(p_question_id uuid) — hard-delete
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_exam_question(p_question_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exam uuid;
    v_prompt text;
    v_choices jsonb;
    v_elem text;
    v_idx int;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT exam_id, prompt_image_path, choice_image_paths
    INTO v_exam, v_prompt, v_choices
    FROM public.exam_questions
    WHERE id = p_question_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'question_not_found';
    END IF;

    -- ensure parent exam is still live (prevents deleting from a soft-deleted exam)
    IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = v_exam AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;

    DELETE FROM public.exam_questions WHERE id = p_question_id;

    -- best-effort storage cleanup for this question's images
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
            IF v_prompt IS NOT NULL AND v_prompt <> '' THEN
                DELETE FROM storage.objects WHERE bucket_id = 'exam-images' AND name = v_prompt;
            END IF;
            IF v_choices IS NOT NULL AND jsonb_typeof(v_choices) = 'array' THEN
                FOR v_idx IN 0..jsonb_array_length(v_choices) - 1 LOOP
                    v_elem := v_choices->>v_idx;
                    IF v_elem IS NOT NULL AND v_elem <> '' THEN
                        DELETE FROM storage.objects WHERE bucket_id = 'exam-images' AND name = v_elem;
                    END IF;
                END LOOP;
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    PERFORM public.audit_log('exam_question.deleted', 'exam_questions', p_question_id,
        jsonb_build_object('exam_id', v_exam));
END $$;

COMMENT ON FUNCTION public.delete_exam_question(uuid) IS 'Staff-only hard-delete for exam_questions. Raises question_not_found when absent, exam_not_found when parent exam is soft-deleted. Best-effort removal of the question prompt/choice image objects. Audited.';

REVOKE EXECUTE ON FUNCTION public.delete_exam_question(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_exam_question(uuid) TO authenticated;
