-- =====================================================================
-- REMOTE DEPLOY - "أزمة الصفوف" fix (grades crisis)
-- Apply to the remote project (https://nfusbrktrqfrnaetetmr.supabase.co)
-- via Dashboard > SQL Editor in ONE block, or run the whole file.
--
-- Contents:
--   1. Seed the three default grades (idempotent: grades.name UNIQUE)
--   2. list_active_grades() - anon-safe grade listing for /register
--   3. handle_new_user() v3 - grade_id becomes REQUIRED + validated
--      (fail closed: grade_required / invalid_grade_id / grade_not_available)
--   4. Mark the 0011 bootstrap accounts as seed accounts so staff
--      bootstrap stays grade-free (re-runs of the 0011 seed are safe)
--
-- Safe to re-run (all DDL is CREATE OR REPLACE / idempotent upserts).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Seed the three default grades (idempotent)
-- ---------------------------------------------------------------------
INSERT INTO public.grades (name, sort_order)
VALUES
    ('الصف الأول الثانوي', 1),
    ('الصف الثاني الثانوي', 2),
    ('الصف الثالث الثانوي', 3)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2) list_active_grades() - anon-safe grade listing for registration
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
-- 3) handle_new_user() v3 - grade-aware profile creation
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

-- ---------------------------------------------------------------------
-- 4) Mark 0011 bootstrap staff accounts as seed accounts (idempotent)
-- ---------------------------------------------------------------------
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
                        || jsonb_build_object('seed_account', 'true')
WHERE email IN ('admin@walid-platform.local', 'mrwalid@walid-platform.local');

-- ---------------------------------------------------------------------
-- Verification (runs as postgres; SELECT output appears in the editor)
-- ---------------------------------------------------------------------
SELECT id, name, sort_order, is_active
FROM public.grades
WHERE deleted_at IS NULL
ORDER BY sort_order;

SELECT public.list_active_grades();