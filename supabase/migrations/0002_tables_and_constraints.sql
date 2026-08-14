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
