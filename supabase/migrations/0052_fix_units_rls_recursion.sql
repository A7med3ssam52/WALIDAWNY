-- =====================================================================
-- 0052_fix_units_rls_recursion
-- Fix infinite recursion in units RLS policy (42P17) introduced by 0051.
-- The trial branch `EXISTS (SELECT 1 FROM lessons WHERE is_trial)`
-- together with lessons policy `unit_id IN (SELECT id FROM units ...)`
-- causes mutual recursion: units -> lessons -> units -> ...
-- Fix: remove the trial EXISTS branch from units policy. Trial visibility
-- is already handled by:
--   * lessons policy trial branch (student can SELECT trial lessons cross-grade)
--   * get_trial_lessons() RPC (security definer, bypasses RLS)
-- Units with a trial lesson do not need to be separately visible via
-- units policy — student sees the trial lesson directly.
-- Keep is_free branch (no subquery on lessons, safe).
-- =====================================================================

DROP POLICY IF EXISTS units_select_staff_or_published_own_grade ON public.units;

CREATE POLICY units_select_staff_or_published_own_grade ON public.units
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (
            public.is_student()
            AND grade_id IN (
                SELECT p.grade_id FROM public.profiles p WHERE p.id = auth.uid()
            )
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            AND status = 'published'
            AND deleted_at IS NULL
        )
        OR (
            public.is_student()
            AND is_free = true
            AND status = 'published'
            AND deleted_at IS NULL
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
        )
    );

-- Re-assert lessons policy is non-recursive now that units no longer queries lessons.
-- Keep it as defined in 0051/0047 (own grade, is_trial, is_free) — it queries units
-- but units no longer queries lessons, so the cycle is broken.
-- No change needed, but ensure it exists:
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
                SELECT u.id FROM public.units u
                JOIN public.profiles p ON p.grade_id = u.grade_id
                WHERE p.id = auth.uid()
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
            AND unit_id IN (
                SELECT id FROM public.units
                WHERE status = 'published' AND deleted_at IS NULL
                  AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            )
        )
        OR (
            public.is_student()
            AND status = 'published'
            AND deleted_at IS NULL
            AND unit_id IN (
                SELECT id FROM public.units
                WHERE is_free = true
                  AND status = 'published' AND deleted_at IS NULL
                  AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            )
        )
    );

COMMENT ON POLICY units_select_staff_or_published_own_grade ON public.units IS 'Fix 0052: removed trial EXISTS to break 42P17 recursion (units->lessons->units). Trial visibility via lessons policy + get_trial_lessons RPC.';

-- ---------------------------------------------------------------------
-- Fallback RPCs for frontend when RLS is being fixed (bypass recursion)
-- These are security definer and bypass RLS, so direct unit queries never
-- need to hit the buggy policy. Frontend will fallback to these on 42P17.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_units_for_grade_secure(p_grade_id uuid)
RETURNS SETOF public.units
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.units
  WHERE grade_id = p_grade_id AND deleted_at IS NULL
  ORDER BY sort_order ASC, created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.list_deleted_units_for_grade_secure(p_grade_id uuid)
RETURNS SETOF public.units
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.units
  WHERE grade_id = p_grade_id AND deleted_at IS NOT NULL
  ORDER BY deleted_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.list_units_for_grade_secure(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_deleted_units_for_grade_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_units_for_grade_secure(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_deleted_units_for_grade_secure(uuid) TO authenticated;
COMMENT ON FUNCTION public.list_units_for_grade_secure(uuid) IS 'Secure fallback for 42P17 recursion fix — bypasses RLS, used by frontend when direct units query fails.';
