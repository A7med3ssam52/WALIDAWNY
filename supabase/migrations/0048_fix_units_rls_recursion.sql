-- =====================================================================
-- 0048_fix_units_rls_recursion
-- Fixes infinite recursion between units and lessons RLS policies
-- introduced in 0047_fix_trial_access. The 0047 units trial branch did
--   EXISTS (SELECT 1 FROM lessons WHERE unit_id = units.id AND is_trial ...)
-- while the lessons policy queries units - PostgreSQL detects recursion
-- and aborts every student SELECT on units/lessons with:
--   "infinite recursion detected in policy for relation units"
-- which surfaces in the app as "tathar tahmil wahdat safak".
--
-- Fix: two SECURITY DEFINER helpers that bypass RLS (owner postgres
-- bypasses RLS) and are GRANTed to authenticated for policy evaluation.
-- Policies are recreated to call the helpers instead of direct
-- cross-table EXISTS / IN subqueries that would re-enter RLS.
-- =====================================================================

-- Helper: does the unit have at least one published, non-deleted trial
-- lesson? Bypass RLS (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.unit_has_published_trial(p_unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.unit_id = p_unit_id
      AND l.is_trial = true
      AND l.status = 'published'
      AND l.deleted_at IS NULL
  );
$$;

-- Helper: is the unit published, non-deleted and on an active,
-- non-deleted grade? Bypass RLS.
CREATE OR REPLACE FUNCTION public.unit_is_published_active(p_unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.units u
    JOIN public.grades g ON g.id = u.grade_id
    WHERE u.id = p_unit_id
      AND u.status = 'published'
      AND u.deleted_at IS NULL
      AND g.is_active
      AND g.deleted_at IS NULL
  );
$$;

REVOKE EXECUTE ON FUNCTION public.unit_has_published_trial(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unit_has_published_trial(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.unit_is_published_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unit_is_published_active(uuid) TO authenticated;

-- Also grant to anon for completeness (policy OR branch is student-only
-- so anon never reaches the helper, but keeps privilege model uniform).
GRANT EXECUTE ON FUNCTION public.unit_has_published_trial(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.unit_is_published_active(uuid) TO anon;

-- ---------------------------------------------------------------------
-- lessons policy: replace the trial branch's direct units subquery with
-- the helper to avoid re-entering units RLS.
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
            AND public.unit_is_published_active(unit_id)
        )
    );

-- ---------------------------------------------------------------------
-- units policy: replace the trial branch's direct lessons EXISTS with
-- the helper to avoid re-entering lessons RLS.
-- ---------------------------------------------------------------------
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
            AND status = 'published'
            AND deleted_at IS NULL
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            AND public.unit_has_published_trial(units.id)
        )
    );

COMMENT ON FUNCTION public.unit_has_published_trial(uuid) IS 'RLS helper (SECURITY DEFINER, bypasses RLS): true if the unit has a published, non-deleted trial lesson. Used by units trial branch to break 0047 recursion.';
COMMENT ON FUNCTION public.unit_is_published_active(uuid) IS 'RLS helper (SECURITY DEFINER, bypasses RLS): true if the unit is published, non-deleted and its grade is active/non-deleted. Used by lessons trial branch to break 0047 recursion.';
