-- =====================================================================
-- 0067_fix_trial_rls_recursion
-- Fixes infinite recursion introduced in 0066: lessons and units
-- policies were querying each other (lessons trial -> units, units trial -> lessons).
-- Remove trial branch from units policy; keep it only in lessons.
-- Trial lessons are fetched via SECURITY DEFINER getTrialLessons(), not via units RLS.
-- Keep lessons trial branch but make it SECURITY DEFINER-safe via direct check
-- without joining profiles to units (avoid recursion).
-- =====================================================================

DROP POLICY IF EXISTS units_select_staff_or_published_own_grade ON public.units;
CREATE POLICY units_select_staff_or_published_own_grade ON public.units
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
        OR (
            public.is_student()
            AND grade_id IN (SELECT p.grade_id FROM public.profiles p WHERE p.id = auth.uid())
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            AND status = 'published'
            AND deleted_at IS NULL
        )
    );

-- Keep lessons trial branch but ensure it does not cause recursion via profiles join
-- Use direct subquery without joining profiles to units (simpler)
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
            AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.status = 'active' AND p.deleted_at IS NULL
            )
            AND unit_id IN (
                SELECT id FROM public.units
                WHERE status = 'published' AND deleted_at IS NULL
                  AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            )
        )
    );
