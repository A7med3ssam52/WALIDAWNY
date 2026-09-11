-- =====================================================================
-- 0066_fix_trial_rls
-- Restores cross-grade trial lesson visibility that was lost in
-- 0060/0064 (they overwrote lessons/units RLS without the trial OR
-- branch from 0047). Trial lessons (any number per unit) must be
-- visible to ANY active student, regardless of grade, as long as
-- lesson+unit+grade are published/active.
-- Also adds is_assistant to staff branch.
-- =====================================================================

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
    );

DROP POLICY IF EXISTS units_select_staff_or_published_own_grade ON public.units;
CREATE POLICY units_select_staff_or_published_own_grade ON public.units
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
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
            AND EXISTS (
                SELECT 1 FROM public.lessons l
                WHERE l.unit_id = units.id
                  AND l.is_trial = true
                  AND l.status = 'published'
                  AND l.deleted_at IS NULL
            )
        )
    );

-- Ensure can_access_lesson still has assistant + trial bypass (0064 version is correct except COALESCE, keep it)
-- Re-apply 0047's can_access with assistant (avoid COALESCE mismatch, keep strict grade check)
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
    IF public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() THEN
        RETURN EXISTS (SELECT 1 FROM public.lessons WHERE id = p_lesson_id AND deleted_at IS NULL);
    END IF;
    RETURN EXISTS (
        SELECT 1
        FROM public.lessons l
        JOIN public.units u ON u.id = l.unit_id
        JOIN public.grades g ON g.id = u.grade_id
        WHERE l.id = p_lesson_id
          AND l.deleted_at IS NULL AND l.status = 'published'
          AND u.deleted_at IS NULL AND u.status = 'published'
          AND g.is_active AND g.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 FROM public.profiles p
              WHERE p.id = v_uid AND p.deleted_at IS NULL AND p.status = 'active'
          )
          AND (
              l.is_trial
              OR (
                  EXISTS (
                      SELECT 1 FROM public.unit_purchases up
                      WHERE up.student_id = v_uid
                        AND up.unit_id = u.id
                        AND up.status = 'active'
                  )
                  AND u.grade_id = (SELECT grade_id FROM public.profiles WHERE id = v_uid)
              )
          )
    );
END $$;

COMMENT ON FUNCTION public.can_access_lesson(uuid) IS 'Lesson access: staff see any live lesson; students need published lesson+unit+active grade; trial lessons (any number per unit) are open to any active student, non-trial require active purchase in own grade (strict grade match).';
