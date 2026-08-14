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
