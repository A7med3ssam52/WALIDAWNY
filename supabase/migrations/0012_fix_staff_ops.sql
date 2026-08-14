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
