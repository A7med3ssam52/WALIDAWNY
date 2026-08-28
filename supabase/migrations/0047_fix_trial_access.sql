-- =====================================================================
-- 0047_fix_trial_access (revised: multi-trial)
-- Fix trial lesson visibility for students without purchase + ALLOW
-- MULTIPLE free (trial) lessons per unit (previous partial unique index
-- limited to one per unit — now removed). Teacher can mark any number of
-- lessons is_trial=true and each opens without a purchase for any active
-- student (published lesson+unit+active grade), regardless of grade or
-- purchase state. Reference: can_access_lesson + RLS policies below.
-- =====================================================================

-- Allow unlimited trial lessons per unit (remove the "one per unit" cap).
DROP INDEX IF EXISTS public.lessons_trial_unique;

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
    );

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
    );

CREATE OR REPLACE FUNCTION public.can_access_lesson(p_lesson_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_grade_id uuid;
BEGIN
    IF v_uid IS NULL THEN
        RETURN false;
    END IF;
    IF public.is_admin() OR public.is_mr_walid() OR public.is_teacher() THEN
        RETURN EXISTS (SELECT 1 FROM public.lessons WHERE id = p_lesson_id AND deleted_at IS NULL);
    END IF;
    
    SELECT grade_id INTO v_grade_id
    FROM public.profiles
    WHERE id = v_uid
    LIMIT 1;
    
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
                  AND u.grade_id = COALESCE(v_grade_id, u.grade_id)
              )
          )
    );
END $$;

COMMENT ON FUNCTION public.can_access_lesson(uuid) IS 'Lesson access: staff see any live lesson; students need published lesson+unit+active grade; trial lessons (any number per unit) are open to any active student, non-trial require active purchase in own grade.';

-- Simplified trial toggle: with multiple trials per unit there is no need to
-- clear sibling trials — just flip the target lesson's flag.
CREATE OR REPLACE FUNCTION public.set_lesson_trial(p_lesson_id uuid, p_is_trial boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.lessons WHERE id = p_lesson_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    UPDATE public.lessons SET is_trial = p_is_trial
    WHERE id = p_lesson_id AND deleted_at IS NULL;

    PERFORM public.audit_log('unit.trial_set', 'lesson', p_lesson_id,
        jsonb_build_object('is_trial', p_is_trial));
END $$;

COMMENT ON FUNCTION public.set_lesson_trial(uuid, boolean) IS 'Staff-guarded trial toggle; any number of trial lessons per unit is allowed (no unique index).';

DROP FUNCTION IF EXISTS public.get_trial_lessons();
CREATE OR REPLACE FUNCTION public.get_trial_lessons()
RETURNS TABLE (
    lesson_id uuid,
    lesson_title text,
    lesson_description text,
    lesson_sort_order integer,
    unit_id uuid,
    unit_name text,
    grade_id uuid,
    grade_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT l.id, l.title, l.description, l.sort_order,
           u.id, u.name, g.id, g.name
    FROM public.lessons l
    JOIN public.units u ON u.id = l.unit_id
    JOIN public.grades g ON g.id = u.grade_id
    WHERE l.is_trial = true
      AND l.status = 'published' AND l.deleted_at IS NULL
      AND u.status = 'published' AND u.deleted_at IS NULL
      AND g.is_active AND g.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status='active' AND p.deleted_at IS NULL LIMIT 1)
    ORDER BY g.sort_order, u.sort_order, l.sort_order;
$$;

REVOKE EXECUTE ON FUNCTION public.get_trial_lessons() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trial_lessons() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_lesson(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_lesson_trial(uuid, boolean) TO authenticated;

COMMENT ON COLUMN public.lessons.is_trial IS 'Free trial lesson (any number per unit, teacher-chosen; each opens without purchase).';