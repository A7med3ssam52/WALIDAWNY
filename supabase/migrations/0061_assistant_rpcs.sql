-- =====================================================================
-- 0061_assistant_rpcs
-- Patch RPC guards to include assistant where teacher was allowed.
-- Keeps signatures/return types identical to current definitions (post-0045).
-- =====================================================================

-- Announcements RPCs
CREATE OR REPLACE FUNCTION public.list_announcements(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS SETOF public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.get_current_role() IN ('teacher','mr_walid','assistant')) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;
    RETURN QUERY SELECT a.* FROM public.announcements a ORDER BY a.created_at DESC LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100)) OFFSET GREATEST(0, COALESCE(p_offset, 0));
END $$;

CREATE OR REPLACE FUNCTION public.get_announcement_by_id(p_id uuid)
RETURNS public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_announcement public.announcements;
BEGIN
    IF NOT (public.is_admin() OR public.get_current_role() IN ('teacher','mr_walid','assistant')) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;
    SELECT * INTO v_announcement FROM public.announcements WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
    RETURN v_announcement;
END $$;

CREATE OR REPLACE FUNCTION public.create_announcement(p_title text, p_body text, p_link_url text DEFAULT NULL, p_link_label text DEFAULT NULL, p_variant text DEFAULT 'info', p_target_roles text[] DEFAULT '{"student","teacher","mr_walid","admin","assistant"}', p_hide_on_paths text[] DEFAULT '{}', p_starts_at timestamptz DEFAULT now(), p_ends_at timestamptz DEFAULT NULL, p_is_active boolean DEFAULT true, p_dismissible boolean DEFAULT true)
RETURNS public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_announcement public.announcements; v_user_id uuid := auth.uid();
BEGIN
    IF NOT (public.is_admin() OR public.get_current_role() IN ('teacher','mr_walid','assistant')) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    IF p_link_url IS NOT NULL AND p_link_url !~ '^https://' THEN RAISE EXCEPTION 'invalid_link_url'; END IF;
    INSERT INTO public.announcements (title, body, link_url, link_label, variant, target_roles, hide_on_paths, starts_at, ends_at, is_active, dismissible, created_by) VALUES (p_title, p_body, p_link_url, p_link_label, p_variant, p_target_roles, p_hide_on_paths, p_starts_at, p_ends_at, p_is_active, p_dismissible, v_user_id) RETURNING * INTO v_announcement;
    PERFORM public.audit_log('announcement.create', 'announcements', v_announcement.id, jsonb_build_object('title', p_title, 'variant', p_variant));
    RETURN v_announcement;
END $$;

CREATE OR REPLACE FUNCTION public.update_announcement(p_id uuid, p_title text DEFAULT NULL, p_body text DEFAULT NULL, p_link_url text DEFAULT NULL, p_link_label text DEFAULT NULL, p_variant text DEFAULT NULL, p_target_roles text[] DEFAULT NULL, p_hide_on_paths text[] DEFAULT NULL, p_starts_at timestamptz DEFAULT NULL, p_ends_at timestamptz DEFAULT NULL, p_is_active boolean DEFAULT NULL, p_dismissible boolean DEFAULT NULL)
RETURNS public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_announcement public.announcements; v_user_id uuid := auth.uid(); v_old jsonb;
BEGIN
    IF NOT (public.is_admin() OR public.get_current_role() IN ('teacher','mr_walid','assistant')) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    SELECT to_jsonb(a) INTO v_old FROM public.announcements a WHERE a.id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
    IF p_link_url IS NOT NULL AND p_link_url !~ '^https://' THEN RAISE EXCEPTION 'invalid_link_url'; END IF;
    UPDATE public.announcements SET title = COALESCE(p_title, title), body = COALESCE(p_body, body), link_url = p_link_url, link_label = p_link_label, variant = COALESCE(p_variant, variant), target_roles = COALESCE(p_target_roles, target_roles), hide_on_paths = COALESCE(p_hide_on_paths, hide_on_paths), starts_at = COALESCE(p_starts_at, starts_at), ends_at = p_ends_at, is_active = COALESCE(p_is_active, is_active), dismissible = COALESCE(p_dismissible, dismissible), updated_at = now() WHERE id = p_id RETURNING * INTO v_announcement;
    PERFORM public.audit_log('announcement.update', 'announcements', v_announcement.id, jsonb_build_object('old', v_old, 'new', to_jsonb(v_announcement)));
    RETURN v_announcement;
END $$;

CREATE OR REPLACE FUNCTION public.delete_announcement(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user_id uuid := auth.uid(); v_title text;
BEGIN
    IF NOT (public.is_admin() OR public.get_current_role() IN ('teacher','mr_walid','assistant')) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    SELECT title INTO v_title FROM public.announcements WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
    DELETE FROM public.announcements WHERE id = p_id;
    PERFORM public.audit_log('announcement.delete', 'announcements', p_id, jsonb_build_object('title', v_title));
END $$;

-- get_dashboard_stats: include assistant
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_stats jsonb;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    SELECT jsonb_build_object(
        'students', jsonb_build_object(
            'total',        (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND role = 'student'),
            'active',       (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'active' AND role = 'student'),
            'disabled',     (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'disabled' AND role = 'student'),
            'deleted',      (SELECT count(*) FROM public.profiles WHERE deleted_at IS NOT NULL AND role = 'student'),
            'new_this_month', (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND role = 'student' AND created_at >= date_trunc('month', now()))
        ),
        'purchases', jsonb_build_object(
            'total',               (SELECT count(*) FROM public.unit_purchases WHERE status = 'active'),
            'total_revenue',       (SELECT COALESCE(sum(total_price), 0) FROM public.unit_purchases WHERE status = 'active'),
            'revenue_this_month',  (SELECT COALESCE(sum(total_price), 0) FROM public.unit_purchases WHERE status = 'active' AND purchased_at >= date_trunc('month', now()))
        ),
        'content', jsonb_build_object(
            'grades',           (SELECT count(*) FROM public.grades WHERE deleted_at IS NULL),
            'units',            (SELECT count(*) FROM public.units WHERE deleted_at IS NULL),
            'lessons',          (SELECT count(*) FROM public.lessons WHERE deleted_at IS NULL),
            'published_lessons',(SELECT count(*) FROM public.lessons WHERE deleted_at IS NULL AND status = 'published'),
            'videos',           (SELECT count(*) FROM public.lesson_videos WHERE deleted_at IS NULL),
            'videos_ready',     (SELECT count(*) FROM public.lesson_videos WHERE deleted_at IS NULL AND status = 'ready'),
            'pdfs',             (SELECT count(*) FROM public.lesson_pdfs WHERE deleted_at IS NULL),
            'pdfs_ready',       (SELECT count(*) FROM public.lesson_pdfs WHERE deleted_at IS NULL AND is_ready)
        ),
        'engagement', jsonb_build_object(
            'students_with_progress', (SELECT count(DISTINCT student_id) FROM public.progress),
            'completed_lessons',      (SELECT count(*) FROM public.progress WHERE is_completed),
            'avg_percent',            (SELECT COALESCE(round(avg(percent_completed), 2), 0) FROM public.progress)
        ),
        'by_grade', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'grade_name', r.grade_name,
                'students', r.students,
                'purchases', r.purchases,
                'revenue', r.revenue
            ) ORDER BY r.sort_order)
            FROM (
                SELECT g.name AS grade_name, g.sort_order,
                       count(DISTINCT p.id) AS students,
                       count(DISTINCT up.id) AS purchases,
                       COALESCE(sum(up.total_price), 0) AS revenue
                FROM public.grades g
                LEFT JOIN public.profiles p ON p.grade_id = g.id AND p.deleted_at IS NULL AND p.role = 'student'
                LEFT JOIN public.unit_purchases up ON up.student_id = p.id AND up.status = 'active'
                WHERE g.deleted_at IS NULL
                GROUP BY g.id, g.name, g.sort_order
            ) r
        ), '[]'::jsonb),
        'top_units', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'unit_name', r.unit_name,
                'purchases', r.purchases,
                'revenue', r.revenue
            ) ORDER BY r.revenue DESC)
            FROM (
                SELECT u.name AS unit_name, count(DISTINCT up.id) AS purchases, COALESCE(sum(up.total_price), 0) AS revenue
                FROM public.unit_purchases up JOIN public.units u ON u.id = up.unit_id WHERE up.status = 'active' GROUP BY u.id, u.name ORDER BY revenue DESC LIMIT 5
            ) r
        ), '[]'::jsonb),
        'recent_purchases', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', p.full_name, 'grade_name', g.name, 'unit_name', u.name, 'total_price', up.total_price, 'purchased_at', up.purchased_at
            ) ORDER BY up.purchased_at DESC)
            FROM public.unit_purchases up JOIN public.profiles p ON p.id = up.student_id JOIN public.units u ON u.id = up.unit_id JOIN public.grades g ON g.id = u.grade_id WHERE up.status = 'active' LIMIT 5
        ), '[]'::jsonb)
    ) INTO v_stats;
    RETURN v_stats;
END $$;

-- Exams: include assistant (0029 canonical, now with assistant)
CREATE OR REPLACE FUNCTION public.list_exams(p_lesson_id uuid)
RETURNS SETOF public.exams
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT e.* FROM public.exams e WHERE e.deleted_at IS NULL AND e.lesson_id = p_lesson_id AND (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() OR public.can_access_lesson(e.lesson_id)) ORDER BY e.sort_order, e.created_at;
$$;

CREATE OR REPLACE FUNCTION public.get_exam_questions(p_exam_id uuid)
RETURNS SETOF public.exam_questions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT q.id, q.exam_id, q.type, q.prompt, q.choices,
           CASE WHEN (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN q.correct_index ELSE NULL END AS correct_index,
           q.max_score, q.sort_order, q.prompt_image_path, q.choice_image_paths
    FROM public.exam_questions q
    JOIN public.exams e ON e.id = q.exam_id AND e.deleted_at IS NULL
    WHERE q.exam_id = p_exam_id AND (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() OR public.can_access_lesson(e.lesson_id))
    ORDER BY q.sort_order;
$$;

CREATE OR REPLACE FUNCTION public.get_my_exam_attempt(p_exam_id uuid)
RETURNS SETOF public.exam_attempts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT a.* FROM public.exam_attempts a JOIN public.exams e ON e.id = a.exam_id AND e.deleted_at IS NULL WHERE a.exam_id = p_exam_id AND a.student_id = auth.uid() AND (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() OR public.can_access_lesson(e.lesson_id));
$$;

CREATE OR REPLACE FUNCTION public.grade_exam_attempt(p_attempt_id uuid, p_scores jsonb)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_attempt public.exam_attempts%ROWTYPE; v_manual numeric(5, 2) := 0;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = p_attempt_id;
    IF v_attempt.id IS NULL THEN RAISE EXCEPTION 'attempt_not_found'; END IF;
    IF v_attempt.status = 'graded' THEN RAISE EXCEPTION 'already_graded'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(COALESCE(p_scores, '[]'::jsonb)) AS r(question_id uuid, score numeric) LEFT JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = v_attempt.exam_id AND q.type = 'essay' WHERE q.id IS NULL OR r.score IS NULL OR r.score < 0) THEN RAISE EXCEPTION 'invalid_scores'; END IF;
    UPDATE public.exam_answers a SET score = r.score FROM jsonb_to_recordset(COALESCE(p_scores, '[]'::jsonb)) AS r(question_id uuid, score numeric) WHERE a.attempt_id = v_attempt.id AND a.question_id = r.question_id;
    SELECT COALESCE(sum(a.score), 0) INTO v_manual FROM public.exam_answers a JOIN public.exam_questions q ON q.id = a.question_id WHERE a.attempt_id = v_attempt.id AND q.type = 'essay';
    UPDATE public.exam_attempts SET status = 'graded', manual_score = v_manual, final_score = COALESCE(auto_score, 0) + v_manual, graded_by = auth.uid(), graded_at = now() WHERE id = v_attempt.id RETURNING * INTO v_attempt;
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id) SELECT v_attempt.student_id, 'exam_graded', 'تم تصحيح الاختبار', e.title, 'exam_graded:' || v_attempt.id, 'exam_attempts', v_attempt.id FROM public.exams e WHERE e.id = v_attempt.exam_id ON CONFLICT (dedup_key) DO NOTHING;
    PERFORM public.audit_log('exam.graded', 'exam_attempts', p_attempt_id, jsonb_build_object('final_score', v_attempt.final_score, 'graded_by', auth.uid()));
    RETURN v_attempt;
END $$;

CREATE OR REPLACE FUNCTION public.delete_exam(p_exam_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lesson uuid; v_deleted timestamptz;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    SELECT lesson_id, deleted_at INTO v_lesson, v_deleted FROM public.exams WHERE id = p_exam_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'exam_not_found'; END IF;
    IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'exam_not_found'; END IF;
    UPDATE public.exams SET deleted_at = now(), updated_at = now() WHERE id = p_exam_id;
    BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN DELETE FROM storage.objects WHERE bucket_id = 'exam-images' AND name LIKE p_exam_id::text || '/%'; END IF; EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM public.audit_log('exam.deleted', 'exams', p_exam_id, jsonb_build_object('lesson_id', v_lesson));
END $$;

CREATE OR REPLACE FUNCTION public.delete_exam_question(p_question_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_exam uuid; v_prompt text; v_choices jsonb; v_elem text; v_idx int;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    SELECT exam_id, prompt_image_path, choice_image_paths INTO v_exam, v_prompt, v_choices FROM public.exam_questions WHERE id = p_question_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'question_not_found'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = v_exam AND deleted_at IS NULL) THEN RAISE EXCEPTION 'exam_not_found'; END IF;
    DELETE FROM public.exam_questions WHERE id = p_question_id;
    BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN IF v_prompt IS NOT NULL AND v_prompt <> '' THEN DELETE FROM storage.objects WHERE bucket_id = 'exam-images' AND name = v_prompt; END IF; IF v_choices IS NOT NULL AND jsonb_typeof(v_choices) = 'array' THEN FOR v_idx IN 0..jsonb_array_length(v_choices) - 1 LOOP v_elem := v_choices->>v_idx; IF v_elem IS NOT NULL AND v_elem <> '' THEN DELETE FROM storage.objects WHERE bucket_id = 'exam-images' AND name = v_elem; END IF; END LOOP; END IF; END IF; EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM public.audit_log('exam_question.deleted', 'exam_questions', p_question_id, jsonb_build_object('exam_id', v_exam));
END $$;

-- Submit fan-out includes assistant
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(p_exam_id uuid, p_answers jsonb)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_exam public.exams%ROWTYPE; v_attempt public.exam_attempts; v_auto numeric(5,2):=0; v_has_essays boolean;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
    IF NOT public.is_student() THEN RAISE EXCEPTION 'permission_denied'; END IF;
    SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id AND deleted_at IS NULL;
    IF v_exam.id IS NULL THEN RAISE EXCEPTION 'exam_not_found'; END IF;
    IF NOT public.can_access_lesson(v_exam.lesson_id) THEN RAISE EXCEPTION 'access_denied'; END IF;
    IF EXISTS (SELECT 1 FROM public.exam_attempts WHERE exam_id = p_exam_id AND student_id = v_uid) THEN RAISE EXCEPTION 'attempt_already_exists'; END IF;
    IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_answers'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_answers) AS r(question_id uuid, choice_index integer, answer_text text) LEFT JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = p_exam_id WHERE q.id IS NULL) THEN RAISE EXCEPTION 'invalid_answers'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_answers) AS r(question_id uuid, choice_index integer, answer_text text) JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = p_exam_id WHERE (q.type = 'mcq' AND (r.choice_index IS NULL OR r.choice_index < 0 OR r.choice_index > jsonb_array_length(q.choices) -1)) OR (q.type = 'essay' AND length(btrim(COALESCE(r.answer_text, ''))) = 0)) THEN RAISE EXCEPTION 'invalid_answers'; END IF;
    INSERT INTO public.exam_attempts (exam_id, student_id, status) VALUES (p_exam_id, v_uid, 'submitted') RETURNING * INTO v_attempt;
    INSERT INTO public.exam_answers (attempt_id, question_id, choice_index, answer_text, score) SELECT v_attempt.id, q.id, r.choice_index, r.answer_text, CASE WHEN q.type='mcq' AND r.choice_index = q.correct_index THEN q.max_score ELSE NULL END FROM jsonb_to_recordset(p_answers) AS r(question_id uuid, choice_index integer, answer_text text) JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = p_exam_id;
    SELECT COALESCE(sum(score),0) INTO v_auto FROM public.exam_answers WHERE attempt_id = v_attempt.id;
    SELECT EXISTS (SELECT 1 FROM public.exam_questions WHERE exam_id = p_exam_id AND type='essay') INTO v_has_essays;
    UPDATE public.exam_attempts SET auto_score = v_auto WHERE id = v_attempt.id RETURNING * INTO v_attempt;
    IF NOT v_has_essays THEN UPDATE public.exam_attempts SET status='graded', manual_score=0, final_score=v_auto, graded_at=now() WHERE id = v_attempt.id RETURNING * INTO v_attempt; INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id) VALUES (v_uid, 'exam_graded', 'تم تصحيح الاختبار', v_exam.title, 'exam_graded:' || v_attempt.id, 'exam_attempts', v_attempt.id) ON CONFLICT (dedup_key) DO NOTHING; END IF;
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id) SELECT u.id, 'exam_submitted', 'اختبار بانتظار المراجعة', v_exam.title, 'exam_submitted:' || u.id || ':' || v_attempt.id, 'exam_attempts', v_attempt.id FROM public.profiles u WHERE u.role IN ('admin', 'mr_walid', 'teacher', 'assistant') AND u.status='active' AND u.deleted_at IS NULL ON CONFLICT (dedup_key) DO NOTHING;
    PERFORM public.audit_log('exam.submitted', 'exam_attempts', v_attempt.id, jsonb_build_object('exam_id', p_exam_id, 'auto_score', v_auto));
    RETURN v_attempt;
END $$;

-- Comments: include assistant
CREATE OR REPLACE FUNCTION public.add_lesson_comment(p_lesson_id uuid, p_body text, p_parent_id uuid DEFAULT NULL)
RETURNS public.lesson_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_comment public.lesson_comments%ROWTYPE; v_lesson text; v_parent public.lesson_comments%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'permission_denied'; END IF;
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() OR public.can_access_lesson(p_lesson_id)) THEN RAISE EXCEPTION 'access_denied'; END IF;
    IF length(btrim(COALESCE(p_body, ''))) = 0 OR length(btrim(COALESCE(p_body, ''))) > 1000 THEN RAISE EXCEPTION 'invalid_body'; END IF;
    IF p_parent_id IS NOT NULL THEN SELECT * INTO v_parent FROM public.lesson_comments WHERE id = p_parent_id; IF v_parent.id IS NULL OR v_parent.status <> 'visible' OR v_parent.lesson_id <> p_lesson_id THEN RAISE EXCEPTION 'invalid_parent'; END IF; END IF;
    SELECT title INTO v_lesson FROM public.lessons WHERE id = p_lesson_id;
    INSERT INTO public.lesson_comments (lesson_id, author_id, parent_id, body) VALUES (p_lesson_id, v_uid, p_parent_id, btrim(p_body)) RETURNING * INTO v_comment;
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id) SELECT u.id, 'comment_reply', 'تعليق جديد على الدرس', v_lesson, 'comment_reply:' || u.id || ':' || v_comment.id, 'lesson_comments', v_comment.id FROM public.profiles u WHERE u.role IN ('admin', 'mr_walid', 'teacher', 'assistant') AND u.status = 'active' AND u.deleted_at IS NULL AND u.id <> v_uid ON CONFLICT (dedup_key) DO NOTHING;
    IF v_parent.id IS NOT NULL AND v_parent.author_id <> v_uid THEN INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id) VALUES (v_parent.author_id, 'lesson_comment', 'تم الرد على تعليقك', v_lesson, 'lesson_comment:' || v_comment.id, 'lesson_comments', v_comment.id) ON CONFLICT (dedup_key) DO NOTHING; END IF;
    RETURN v_comment;
END $$;

CREATE OR REPLACE FUNCTION public.delete_lesson_comment(p_comment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.lesson_comments%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'permission_denied'; END IF;
    SELECT * INTO v_row FROM public.lesson_comments WHERE id = p_comment_id;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'comment_not_found'; END IF;
    IF v_row.author_id <> auth.uid() AND NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    DELETE FROM public.lesson_comments WHERE id = p_comment_id;
END $$;

CREATE OR REPLACE FUNCTION public.list_lesson_comments(p_lesson_id uuid)
RETURNS TABLE (id uuid, lesson_id uuid, author_id uuid, author_name text, parent_id uuid, body text, status text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() OR public.can_access_lesson(p_lesson_id)) THEN RAISE EXCEPTION 'access_denied'; END IF;
    RETURN QUERY SELECT c.id, c.lesson_id, c.author_id, COALESCE(p.full_name, ''), c.parent_id, c.body, c.status, c.created_at FROM public.lesson_comments c JOIN public.lessons l ON l.id = c.lesson_id LEFT JOIN public.profiles p ON p.id = c.author_id WHERE c.lesson_id = p_lesson_id AND (c.status = 'visible' OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) ORDER BY c.created_at, c.id;
END $$;

-- Boards/Videos/Youtube: include assistant
CREATE OR REPLACE FUNCTION public.create_board_upload_record(p_lesson_id uuid, p_original_name text, p_size_bytes bigint DEFAULT NULL)
RETURNS TABLE (id uuid, storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_path text; v_name text; v_ext text; v_mime text; v_sort integer;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    IF p_size_bytes IS NOT NULL AND (p_size_bytes < 0 OR p_size_bytes > 10485760) THEN RAISE EXCEPTION 'invalid_board_size'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id) THEN RAISE EXCEPTION 'lesson_not_found'; END IF;
    IF EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id AND l.deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'lesson_deleted'; END IF;
    v_name := btrim(p_original_name); v_name := substring(v_name from '([^/\\]*)$'); v_ext := lower(substring(v_name from '\.([^.]+)$'));
    IF v_name IS NULL OR v_name = '' OR length(v_name) > 255 OR v_ext IS NULL OR v_ext NOT IN ('jpg', 'jpeg', 'png', 'webp') THEN RAISE EXCEPTION 'invalid_file_extension'; END IF;
    v_mime := CASE v_ext WHEN 'jpg' THEN 'image/jpeg' WHEN 'jpeg' THEN 'image/jpeg' WHEN 'png' THEN 'image/png' WHEN 'webp' THEN 'image/webp' END;
    SELECT COALESCE(MAX(lb.sort_order), 0) + 1 INTO v_sort FROM public.lesson_boards lb WHERE lb.lesson_id = p_lesson_id AND lb.deleted_at IS NULL;
    v_path := p_lesson_id::text || '/' || gen_random_uuid()::text || '.' || v_ext;
    INSERT INTO public.lesson_boards (lesson_id, storage_path, original_name, size_bytes, mime_type, sort_order, is_ready) VALUES (p_lesson_id, v_path, v_name, p_size_bytes, v_mime, v_sort, false) RETURNING lesson_boards.id INTO v_id;
    PERFORM public.audit_log('board.upload_started', 'lesson_board', v_id, jsonb_build_object('lesson_id', p_lesson_id, 'original_name', v_name, 'storage_path', v_path, 'size_bytes', p_size_bytes, 'mime_type', v_mime));
    RETURN QUERY SELECT v_id, v_path;
END $$;

CREATE OR REPLACE FUNCTION public.finalize_board_upload(p_board_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lesson uuid; v_ready boolean;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    SELECT lb.lesson_id, lb.is_ready INTO v_lesson, v_ready FROM public.lesson_boards lb WHERE lb.id = p_board_id AND lb.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'board_not_found'; END IF;
    IF v_ready THEN RAISE EXCEPTION 'board_already_ready'; END IF;
    UPDATE public.lesson_boards SET is_ready = true WHERE id = p_board_id;
    PERFORM public.audit_log('board.finalized', 'lesson_board', p_board_id, jsonb_build_object('lesson_id', v_lesson));
END $$;

CREATE OR REPLACE FUNCTION public.delete_board_upload_record(p_lesson_id uuid, p_board_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lesson uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    SELECT lb.lesson_id INTO v_lesson FROM public.lesson_boards lb WHERE lb.id = p_board_id AND lb.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'board_not_found'; END IF;
    IF v_lesson <> p_lesson_id THEN RAISE EXCEPTION 'wrong_lesson'; END IF;
    UPDATE public.lesson_boards SET deleted_at = now(), updated_at = now() WHERE id = p_board_id;
    PERFORM public.audit_log('board.deleted', 'lesson_board', p_board_id, jsonb_build_object('lesson_id', p_lesson_id));
END $$;

CREATE OR REPLACE FUNCTION public.reorder_boards(p_lesson_id uuid, p_board_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_expected integer; v_lesson uuid; v_ready boolean; v_i integer;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    IF p_board_ids IS NULL OR cardinality(p_board_ids) = 0 OR cardinality(p_board_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(p_board_ids))) THEN RAISE EXCEPTION 'validation_error'; END IF;
    SELECT count(*) INTO v_expected FROM public.lesson_boards lb WHERE lb.lesson_id = p_lesson_id AND lb.deleted_at IS NULL AND lb.is_ready;
    IF cardinality(p_board_ids) <> v_expected THEN RAISE EXCEPTION 'validation_error'; END IF;
    FOR v_i IN 1..cardinality(p_board_ids) LOOP
        SELECT lb.lesson_id, lb.is_ready INTO v_lesson, v_ready FROM public.lesson_boards lb WHERE lb.id = p_board_ids[v_i] AND lb.deleted_at IS NULL;
        IF NOT FOUND THEN RAISE EXCEPTION 'board_not_found'; END IF;
        IF v_lesson <> p_lesson_id THEN RAISE EXCEPTION 'wrong_lesson'; END IF;
        IF NOT v_ready THEN RAISE EXCEPTION 'validation_error'; END IF;
        UPDATE public.lesson_boards SET sort_order = v_i WHERE id = p_board_ids[v_i];
    END LOOP;
    PERFORM public.audit_log('board.reordered', 'lesson_board', NULL, jsonb_build_object('lesson_id', p_lesson_id, 'board_ids', to_jsonb(p_board_ids)));
END $$;

CREATE OR REPLACE FUNCTION public.add_youtube_video(p_lesson_id uuid, p_youtube_url text, p_title text DEFAULT NULL)
RETURNS TABLE (id uuid, is_primary boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_primary boolean; v_youtube_id text; v_title text;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id) THEN RAISE EXCEPTION 'lesson_not_found'; END IF;
    IF EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id AND l.deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'lesson_deleted'; END IF;
    v_youtube_id := public.youtube_video_id_from_url(btrim(p_youtube_url));
    IF v_youtube_id IS NULL THEN RAISE EXCEPTION 'invalid_youtube_url'; END IF;
    IF EXISTS (SELECT 1 FROM public.lesson_videos lv WHERE lv.youtube_video_id = v_youtube_id) THEN RAISE EXCEPTION 'youtube_video_duplicate'; END IF;
    v_title := NULLIF(btrim(COALESCE(p_title, '')), ''); IF v_title IS NULL THEN v_title := 'فيديو يوتيوب'; END IF; v_title := left(v_title, 255);
    v_primary := NOT EXISTS (SELECT 1 FROM public.lesson_videos lv WHERE lv.lesson_id = p_lesson_id AND lv.is_primary AND lv.deleted_at IS NULL);
    BEGIN INSERT INTO public.lesson_videos (lesson_id, bunny_library_id, title, status, is_primary, sort_order, source, youtube_video_id) VALUES (p_lesson_id, 'youtube', v_title, 'ready', v_primary, 0, 'youtube', v_youtube_id) RETURNING lesson_videos.id INTO v_id; EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'youtube_video_duplicate'; END;
    PERFORM public.audit_log('video.youtube_added', 'lesson_video', v_id, jsonb_build_object('lesson_id', p_lesson_id, 'youtube_video_id', v_youtube_id, 'is_primary', v_primary));
    RETURN QUERY SELECT v_id, v_primary;
END $$;

CREATE OR REPLACE FUNCTION public.delete_lesson_video(p_lesson_id uuid, p_video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lesson uuid; v_was_primary boolean;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    SELECT lv.lesson_id, lv.is_primary INTO v_lesson, v_was_primary FROM public.lesson_videos lv WHERE lv.id = p_video_id AND lv.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'video_not_found'; END IF;
    IF v_lesson <> p_lesson_id THEN RAISE EXCEPTION 'wrong_lesson'; END IF;
    UPDATE public.lesson_videos SET deleted_at = now() WHERE id = p_video_id;
    IF v_was_primary THEN UPDATE public.lesson_videos SET is_primary = true WHERE id = (SELECT lv.id FROM public.lesson_videos lv WHERE lv.lesson_id = p_lesson_id AND lv.status = 'ready' AND lv.deleted_at IS NULL ORDER BY lv.created_at, lv.id LIMIT 1); END IF;
    PERFORM public.audit_log('video.deleted', 'lesson_video', p_video_id, jsonb_build_object('lesson_id', p_lesson_id));
END $$;
