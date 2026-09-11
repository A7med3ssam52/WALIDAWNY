-- =====================================================================
-- 0062_fix_handle_new_user_grade
-- Fixes regression where handle_new_user() on remote still forced NULL
-- grade_id (0004 definition) instead of the grade-aware v3 (0027).
-- Re-applies the correct v3 definition and backfills any existing
-- grade-less student profiles from auth.users raw_user_meta_data.
--
-- Root cause: remote DB showed 0004 version (INSERT ..., NULL) despite
-- migration history marking 0027 as applied. This migration is
-- idempotent and ensures the correct trigger is active for all future
-- sign-ups, plus repairs the 2 affected 2026-09-10 accounts (and any
-- other null-grade students) if their metadata contains a valid grade.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Re-seed default grades (idempotent) — ensures list_active_grades has data
-- ---------------------------------------------------------------------
INSERT INTO public.grades (name, sort_order)
VALUES
    ('الصف الأول الثانوي', 1),
    ('الصف الثاني الثانوي', 2),
    ('الصف الثالث الثانوي', 3)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- list_active_grades() — re-ensure (identical to 0027, idempotent)
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
-- handle_new_user() v3 — grade-aware (0027 canonical)
-- Replaces the 0004 forced-NULL version that was still on remote.
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

-- Ensure trigger attachment (idempotent)
DROP TRIGGER IF EXISTS handle_new_user ON auth.users;
CREATE TRIGGER handle_new_user
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------
-- Backfill: fix any existing student profiles where grade_id IS NULL
-- but auth.users metadata has a valid, active grade.
-- Uses SECURITY DEFINER context via direct UPDATE (service_role / postgres).
-- ---------------------------------------------------------------------
DO $$
DECLARE
    r record;
    v_grade uuid;
BEGIN
    FOR r IN
        SELECT p.id as profile_id, (u.raw_user_meta_data ->> 'grade_id') as meta_grade_text
        FROM public.profiles p
        JOIN auth.users u ON u.id = p.id
        WHERE p.role = 'student'
          AND p.grade_id IS NULL
          AND NULLIF(btrim(u.raw_user_meta_data ->> 'grade_id'), '') IS NOT NULL
    LOOP
        BEGIN
            v_grade := r.meta_grade_text::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            CONTINUE;
        END;
        IF EXISTS (SELECT 1 FROM public.grades g WHERE g.id = v_grade AND g.is_active AND g.deleted_at IS NULL) THEN
            UPDATE public.profiles SET grade_id = v_grade, updated_at = now() WHERE id = r.profile_id AND grade_id IS NULL;
            PERFORM public.audit_log('profile.backfill_grade', 'profiles', r.profile_id, jsonb_build_object('grade_id', v_grade, 'source', '0062_backfill'));
        END IF;
    END LOOP;
END $$;
