-- =====================================================================
-- 0060_assistant_full_access
-- Completes the 'assistant' role (0059) — grants staff parity for assistant.
-- Minimal RLS fix: every staff branch (`is_admin OR is_mr_walid OR is_teacher`)
-- now also includes `OR is_assistant`. Announcements defaults updated.
-- This file only touches RLS policies and can_access_lesson; RPC guards
-- that are critical for assistant (announcements, exams, dashboard, boards,
-- videos) are patched separately in small, targeted replacements to avoid
-- return-type churn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- is_assistant() already exists from 0059 — ensure grant
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.is_assistant() TO authenticated;

-- ---------------------------------------------------------------------
-- can_access_lesson: staff shortcut now includes assistant
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
    IF public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() THEN
        RETURN EXISTS (SELECT 1 FROM public.lessons WHERE id = p_lesson_id AND deleted_at IS NULL);
    END IF;
    RETURN EXISTS (
        SELECT 1
        FROM public.lessons l
        JOIN public.units u      ON u.id = l.unit_id
        JOIN public.profiles p   ON p.id = v_uid
        JOIN public.grades g     ON g.id = p.grade_id
        WHERE l.id = p_lesson_id
          AND l.deleted_at IS NULL AND l.status = 'published'
          AND u.deleted_at IS NULL AND u.status = 'published'
          AND g.is_active AND g.deleted_at IS NULL
          AND p.deleted_at IS NULL AND p.status = 'active'
          AND (l.is_trial OR EXISTS (
              SELECT 1 FROM public.unit_purchases up
              WHERE up.student_id = v_uid
                AND up.unit_id = u.id
                AND up.status = 'active'
          ))
    );
END $$;

-- ---------------------------------------------------------------------
-- RLS: profiles
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_own_or_staff ON public.profiles;
CREATE POLICY profiles_select_own_or_staff ON public.profiles
    FOR SELECT
    USING ((id = auth.uid() AND public.is_student()) OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

-- ---------------------------------------------------------------------
-- RLS: grades
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS grades_select_staff_or_active_students ON public.grades;
CREATE POLICY grades_select_staff_or_active_students ON public.grades
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
           OR (public.is_student() AND deleted_at IS NULL AND is_active));

DROP POLICY IF EXISTS grades_insert_staff ON public.grades;
CREATE POLICY grades_insert_staff ON public.grades
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());
DROP POLICY IF EXISTS grades_update_staff ON public.grades;
CREATE POLICY grades_update_staff ON public.grades
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());
DROP POLICY IF EXISTS grades_delete_staff ON public.grades;
CREATE POLICY grades_delete_staff ON public.grades
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

-- ---------------------------------------------------------------------
-- RLS: unit_pricing / unit_codes / unit_purchases (0028)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS unit_pricing_select_staff_or_active_students ON public.unit_pricing;
CREATE POLICY unit_pricing_select_staff_or_active_students ON public.unit_pricing
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
        OR (
            public.is_student()
            AND is_active
            AND unit_id IN (
                SELECT u.id FROM public.units u
                WHERE u.status = 'published' AND u.deleted_at IS NULL
                  AND u.grade_id = (SELECT p.grade_id FROM public.profiles p WHERE p.id = auth.uid())
                  AND u.grade_id IN (SELECT g.id FROM public.grades g WHERE g.is_active AND g.deleted_at IS NULL)
            )
        )
    );

DROP POLICY IF EXISTS unit_codes_select_staff ON public.unit_codes;
CREATE POLICY unit_codes_select_staff ON public.unit_codes
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

DROP POLICY IF EXISTS unit_purchases_select_own_or_staff ON public.unit_purchases;
CREATE POLICY unit_purchases_select_own_or_staff ON public.unit_purchases
    FOR SELECT
    USING (student_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

-- ---------------------------------------------------------------------
-- RLS: units
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS units_select_staff_or_published_own_grade ON public.units;
CREATE POLICY units_select_staff_or_published_own_grade ON public.units
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
        OR (
            public.is_student()
            AND grade_id IN (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid()))
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            AND status = 'published'
            AND deleted_at IS NULL
        )
    );

DROP POLICY IF EXISTS units_insert_staff ON public.units;
CREATE POLICY units_insert_staff ON public.units
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());
DROP POLICY IF EXISTS units_update_staff ON public.units;
CREATE POLICY units_update_staff ON public.units
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());
DROP POLICY IF EXISTS units_delete_staff ON public.units;
CREATE POLICY units_delete_staff ON public.units
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

-- ---------------------------------------------------------------------
-- RLS: lessons
-- ---------------------------------------------------------------------
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
                SELECT id FROM public.units
                WHERE grade_id = (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid()))
                  AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
                  AND status = 'published'
                  AND deleted_at IS NULL
            )
        )
    );

DROP POLICY IF EXISTS lessons_insert_staff ON public.lessons;
CREATE POLICY lessons_insert_staff ON public.lessons
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());
DROP POLICY IF EXISTS lessons_update_staff ON public.lessons;
CREATE POLICY lessons_update_staff ON public.lessons
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());
DROP POLICY IF EXISTS lessons_delete_staff ON public.lessons;
CREATE POLICY lessons_delete_staff ON public.lessons
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

-- ---------------------------------------------------------------------
-- RLS: lesson_videos (0042 includes deleted_at filter + is_assistant)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_videos_select_gated ON public.lesson_videos;
CREATE POLICY lesson_videos_select_gated ON public.lesson_videos
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND status = 'ready' AND deleted_at IS NULL)
    );

-- ---------------------------------------------------------------------
-- RLS: lesson_pdfs
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_pdfs_select_gated ON public.lesson_pdfs;
CREATE POLICY lesson_pdfs_select_gated ON public.lesson_pdfs
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND is_ready AND is_primary)
    );

-- ---------------------------------------------------------------------
-- RLS: lesson_boards (0036)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_boards_select_gated ON public.lesson_boards;
CREATE POLICY lesson_boards_select_gated ON public.lesson_boards
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND is_ready AND deleted_at IS NULL)
    );

-- ---------------------------------------------------------------------
-- RLS: progress
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS progress_select_own_or_staff ON public.progress;
CREATE POLICY progress_select_own_or_staff ON public.progress
    FOR SELECT
    USING ((student_id = (select auth.uid()) AND public.is_student()) OR public.is_mr_walid() OR public.is_admin() OR public.is_teacher() OR public.is_assistant());

-- ---------------------------------------------------------------------
-- RLS: app_settings
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS app_settings_select_staff ON public.app_settings;
CREATE POLICY app_settings_select_staff ON public.app_settings
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

-- ---------------------------------------------------------------------
-- RLS: exams / exam_questions / exam_attempts / exam_answers (0029)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS exams_select_gated ON public.exams;
CREATE POLICY exams_select_gated ON public.exams
    FOR SELECT
    USING (
        deleted_at IS NULL
        AND (
            public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
            OR public.can_access_lesson(lesson_id)
        )
    );

DROP POLICY IF EXISTS exams_insert_staff ON public.exams;
CREATE POLICY exams_insert_staff ON public.exams
    FOR INSERT
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

DROP POLICY IF EXISTS exams_update_staff ON public.exams;
CREATE POLICY exams_update_staff ON public.exams
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

DROP POLICY IF EXISTS exams_delete_staff ON public.exams;
CREATE POLICY exams_delete_staff ON public.exams
    FOR DELETE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

DROP POLICY IF EXISTS exam_questions_select_gated ON public.exam_questions;
CREATE POLICY exam_questions_select_gated ON public.exam_questions
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
        OR EXISTS (
            SELECT 1 FROM public.exams e
            WHERE e.id = exam_id
              AND e.deleted_at IS NULL
              AND public.can_access_lesson(e.lesson_id)
        )
    );

DROP POLICY IF EXISTS exam_questions_insert_staff ON public.exam_questions;
CREATE POLICY exam_questions_insert_staff ON public.exam_questions
    FOR INSERT
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

DROP POLICY IF EXISTS exam_questions_update_staff ON public.exam_questions;
CREATE POLICY exam_questions_update_staff ON public.exam_questions
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

DROP POLICY IF EXISTS exam_questions_delete_staff ON public.exam_questions;
CREATE POLICY exam_questions_delete_staff ON public.exam_questions
    FOR DELETE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

DROP POLICY IF EXISTS exam_attempts_select_own_or_staff ON public.exam_attempts;
CREATE POLICY exam_attempts_select_own_or_staff ON public.exam_attempts
    FOR SELECT
    USING (
        student_id = auth.uid()
        OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
    );

DROP POLICY IF EXISTS exam_attempts_dml_staff ON public.exam_attempts;
CREATE POLICY exam_attempts_dml_staff ON public.exam_attempts
    FOR INSERT
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

DROP POLICY IF EXISTS exam_attempts_update_staff ON public.exam_attempts;
CREATE POLICY exam_attempts_update_staff ON public.exam_attempts
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

DROP POLICY IF EXISTS exam_attempts_delete_staff ON public.exam_attempts;
CREATE POLICY exam_attempts_delete_staff ON public.exam_attempts
    FOR DELETE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

DROP POLICY IF EXISTS exam_answers_select_own_or_staff ON public.exam_answers;
CREATE POLICY exam_answers_select_own_or_staff ON public.exam_answers
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
        OR attempt_id IN (
            SELECT a.id FROM public.exam_attempts a
            WHERE a.student_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS exam_answers_dml_staff ON public.exam_answers;
CREATE POLICY exam_answers_dml_staff ON public.exam_answers
    FOR INSERT
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

DROP POLICY IF EXISTS exam_answers_update_staff ON public.exam_answers;
CREATE POLICY exam_answers_update_staff ON public.exam_answers
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

DROP POLICY IF EXISTS exam_answers_delete_staff ON public.exam_answers;
CREATE POLICY exam_answers_delete_staff ON public.exam_answers
    FOR DELETE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

-- ---------------------------------------------------------------------
-- RLS: lesson_comments (0030)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_comments_select_gated ON public.lesson_comments;
CREATE POLICY lesson_comments_select_gated ON public.lesson_comments
    FOR SELECT
    USING (
        (
            public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
            OR author_id = auth.uid()
            OR public.can_access_lesson(lesson_id)
        )
        AND (
            status = 'visible'
            OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
            OR author_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS lesson_comments_insert_gated ON public.lesson_comments;
CREATE POLICY lesson_comments_insert_gated ON public.lesson_comments
    FOR INSERT
    WITH CHECK (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
        OR public.can_access_lesson(lesson_id)
    );

DROP POLICY IF EXISTS lesson_comments_update_own_or_staff ON public.lesson_comments;
CREATE POLICY lesson_comments_update_own_or_staff ON public.lesson_comments
    FOR UPDATE
    USING (author_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant())
    WITH CHECK (author_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

DROP POLICY IF EXISTS lesson_comments_delete_own_or_staff ON public.lesson_comments;
CREATE POLICY lesson_comments_delete_own_or_staff ON public.lesson_comments
    FOR DELETE
    USING (author_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant());

-- ---------------------------------------------------------------------
-- RLS: announcements (0049) — include assistant in every staff branch
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS announcements_teacher_select ON public.announcements;
CREATE POLICY announcements_teacher_select ON public.announcements
    FOR SELECT USING (public.get_current_role() IN ('teacher','mr_walid','assistant'));

DROP POLICY IF EXISTS announcements_teacher_write ON public.announcements;
CREATE POLICY announcements_teacher_write ON public.announcements
    FOR INSERT WITH CHECK (public.get_current_role() IN ('teacher','mr_walid','admin','assistant'));

DROP POLICY IF EXISTS announcements_teacher_update ON public.announcements;
CREATE POLICY announcements_teacher_update ON public.announcements
    FOR UPDATE USING (public.get_current_role() IN ('teacher','mr_walid','admin','assistant'))
    WITH CHECK (public.get_current_role() IN ('teacher','mr_walid','admin','assistant'));

DROP POLICY IF EXISTS announcements_teacher_delete ON public.announcements;
CREATE POLICY announcements_teacher_delete ON public.announcements
    FOR DELETE USING (public.get_current_role() IN ('teacher','mr_walid','admin','assistant'));

-- Update table default for target_roles to include assistant
ALTER TABLE public.announcements ALTER COLUMN target_roles SET DEFAULT '{"student","teacher","mr_walid","admin","assistant"}';
