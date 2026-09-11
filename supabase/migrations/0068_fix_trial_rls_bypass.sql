-- =====================================================================
-- 0068_fix_trial_rls_bypass
-- Fix trial lesson visibility for cross-grade students.
-- 0066/0067 introduced trial branch but it queried units which is
-- RLS-protected, so grade1 student cannot see grade3 unit -> trial
-- lesson remains hidden (RLS evaluates subquery through units RLS).
-- Use SECURITY DEFINER helper to bypass RLS for the unit check.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_unit_published_active(p_unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.units u
        WHERE u.id = p_unit_id
          AND u.status = 'published'
          AND u.deleted_at IS NULL
          AND u.grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_unit_published_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_unit_published_active(uuid) TO authenticated, anon;

DROP POLICY IF EXISTS lessons_select_staff_or_published_own_grade ON public.lessons;
CREATE POLICY lessons_select_staff_or_published_own_grade ON public.lessons
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
        OR (
            public.is_student()
            AND status = 'published'
            AND deleted_at IS NULL
            AND unit_id IN (
                SELECT u.id FROM public.units u
                WHERE u.grade_id = (SELECT grade_id FROM public.profiles WHERE id = auth.uid())
                  AND u.grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
                  AND u.status = 'published'
                  AND u.deleted_at IS NULL
            )
        )
        OR (
            public.is_student()
            AND is_trial = true
            AND status = 'published'
            AND deleted_at IS NULL
            AND public.is_unit_published_active(unit_id)
            AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.status = 'active' AND p.deleted_at IS NULL
            )
        )
    );
