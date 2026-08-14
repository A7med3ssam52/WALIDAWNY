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
