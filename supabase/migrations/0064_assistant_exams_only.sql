-- =====================================================================
-- 0063_assistant_exams_only
-- Restricts assistant to: exams (full CRUD) + curriculum READ-ONLY.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.can_access_lesson(p_lesson_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_grade_id uuid;
BEGIN
    IF v_uid IS NULL THEN RETURN false; END IF;
    IF public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() THEN
        RETURN EXISTS (SELECT 1 FROM public.lessons WHERE id = p_lesson_id AND deleted_at IS NULL);
    END IF;
    SELECT grade_id INTO v_grade_id FROM public.profiles WHERE id = v_uid LIMIT 1;
    RETURN EXISTS (
        SELECT 1 FROM public.lessons l JOIN public.units u ON u.id = l.unit_id JOIN public.grades g ON g.id = u.grade_id
        WHERE l.id = p_lesson_id AND l.deleted_at IS NULL AND l.status = 'published' AND u.deleted_at IS NULL AND u.status = 'published' AND g.is_active AND g.deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.deleted_at IS NULL AND p.status = 'active') AND (l.is_trial OR (EXISTS (SELECT 1 FROM public.unit_purchases up WHERE up.student_id = v_uid AND up.unit_id = u.id AND up.status = 'active') AND u.grade_id = COALESCE(v_grade_id, u.grade_id)))
    );
END $$;

DROP POLICY IF EXISTS profiles_select_own_or_staff ON public.profiles;
CREATE POLICY profiles_select_own_or_staff ON public.profiles FOR SELECT USING ((id = auth.uid()) OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS grades_select_staff_or_active_students ON public.grades;
CREATE POLICY grades_select_staff_or_active_students ON public.grades FOR SELECT USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() OR (public.is_student() AND deleted_at IS NULL AND is_active));
DROP POLICY IF EXISTS grades_insert_staff ON public.grades; CREATE POLICY grades_insert_staff ON public.grades FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS grades_update_staff ON public.grades; CREATE POLICY grades_update_staff ON public.grades FOR UPDATE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS grades_delete_staff ON public.grades; CREATE POLICY grades_delete_staff ON public.grades FOR DELETE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS units_select_staff_or_published_own_grade ON public.units;
CREATE POLICY units_select_staff_or_published_own_grade ON public.units FOR SELECT USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() OR (public.is_student() AND grade_id IN (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid())) AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL) AND status = 'published' AND deleted_at IS NULL));
DROP POLICY IF EXISTS units_insert_staff ON public.units; CREATE POLICY units_insert_staff ON public.units FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS units_update_staff ON public.units; CREATE POLICY units_update_staff ON public.units FOR UPDATE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS units_delete_staff ON public.units; CREATE POLICY units_delete_staff ON public.units FOR DELETE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS lessons_select_staff_or_published_own_grade ON public.lessons;
CREATE POLICY lessons_select_staff_or_published_own_grade ON public.lessons FOR SELECT USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() OR (public.is_student() AND status = 'published' AND deleted_at IS NULL AND unit_id IN (SELECT id FROM public.units WHERE grade_id = (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid())) AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL) AND status = 'published' AND deleted_at IS NULL)));
DROP POLICY IF EXISTS lessons_insert_staff ON public.lessons; CREATE POLICY lessons_insert_staff ON public.lessons FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS lessons_update_staff ON public.lessons; CREATE POLICY lessons_update_staff ON public.lessons FOR UPDATE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS lessons_delete_staff ON public.lessons; CREATE POLICY lessons_delete_staff ON public.lessons FOR DELETE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS lesson_videos_select_gated ON public.lesson_videos; CREATE POLICY lesson_videos_select_gated ON public.lesson_videos FOR SELECT USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() OR (public.is_student() AND public.can_access_lesson(lesson_id) AND status = 'ready' AND deleted_at IS NULL));
DROP POLICY IF EXISTS lesson_pdfs_select_gated ON public.lesson_pdfs; CREATE POLICY lesson_pdfs_select_gated ON public.lesson_pdfs FOR SELECT USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() OR (public.is_student() AND public.can_access_lesson(lesson_id) AND is_ready AND is_primary));
DROP POLICY IF EXISTS lesson_boards_select_gated ON public.lesson_boards; CREATE POLICY lesson_boards_select_gated ON public.lesson_boards FOR SELECT USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() OR (public.is_student() AND public.can_access_lesson(lesson_id) AND is_ready AND deleted_at IS NULL));

DROP POLICY IF EXISTS unit_pricing_select_staff_or_active_students ON public.unit_pricing; CREATE POLICY unit_pricing_select_staff_or_active_students ON public.unit_pricing FOR SELECT USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR (public.is_student() AND is_active AND unit_id IN (SELECT u.id FROM public.units u WHERE u.status = 'published' AND u.deleted_at IS NULL AND u.grade_id = (SELECT p.grade_id FROM public.profiles p WHERE p.id = auth.uid()) AND u.grade_id IN (SELECT g.id FROM public.grades g WHERE g.is_active AND g.deleted_at IS NULL))));
DROP POLICY IF EXISTS unit_codes_select_staff ON public.unit_codes; CREATE POLICY unit_codes_select_staff ON public.unit_codes FOR SELECT USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS unit_purchases_select_own_or_staff ON public.unit_purchases; CREATE POLICY unit_purchases_select_own_or_staff ON public.unit_purchases FOR SELECT USING (student_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS progress_select_own_or_staff ON public.progress; CREATE POLICY progress_select_own_or_staff ON public.progress FOR SELECT USING ((student_id = (select auth.uid()) AND public.is_student()) OR public.is_mr_walid() OR public.is_admin() OR public.is_teacher());
DROP POLICY IF EXISTS app_settings_select_staff ON public.app_settings; CREATE POLICY app_settings_select_staff ON public.app_settings FOR SELECT USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS announcements_teacher_select ON public.announcements; CREATE POLICY announcements_teacher_select ON public.announcements FOR SELECT USING (public.get_current_role() IN ('teacher','mr_walid'));
DROP POLICY IF EXISTS announcements_teacher_write ON public.announcements; CREATE POLICY announcements_teacher_write ON public.announcements FOR INSERT WITH CHECK (public.get_current_role() IN ('teacher','mr_walid','admin'));
DROP POLICY IF EXISTS announcements_teacher_update ON public.announcements; CREATE POLICY announcements_teacher_update ON public.announcements FOR UPDATE USING (public.get_current_role() IN ('teacher','mr_walid','admin')) WITH CHECK (public.get_current_role() IN ('teacher','mr_walid','admin'));
DROP POLICY IF EXISTS announcements_teacher_delete ON public.announcements; CREATE POLICY announcements_teacher_delete ON public.announcements FOR DELETE USING (public.get_current_role() IN ('teacher','mr_walid','admin'));
ALTER TABLE public.announcements ALTER COLUMN target_roles SET DEFAULT '{"student","teacher","mr_walid","admin"}';

DROP POLICY IF EXISTS lesson_comments_select_gated ON public.lesson_comments; CREATE POLICY lesson_comments_select_gated ON public.lesson_comments FOR SELECT USING ((public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR author_id = auth.uid() OR public.can_access_lesson(lesson_id)) AND (status = 'visible' OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR author_id = auth.uid()));
DROP POLICY IF EXISTS lesson_comments_insert_gated ON public.lesson_comments; CREATE POLICY lesson_comments_insert_gated ON public.lesson_comments FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.can_access_lesson(lesson_id));
DROP POLICY IF EXISTS lesson_comments_update_own_or_staff ON public.lesson_comments; CREATE POLICY lesson_comments_update_own_or_staff ON public.lesson_comments FOR UPDATE USING (author_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) WITH CHECK (author_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS lesson_comments_delete_own_or_staff ON public.lesson_comments; CREATE POLICY lesson_comments_delete_own_or_staff ON public.lesson_comments FOR DELETE USING (author_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
