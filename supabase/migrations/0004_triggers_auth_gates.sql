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
