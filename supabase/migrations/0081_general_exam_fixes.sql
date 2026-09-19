-- =====================================================================
-- 0081_general_exam_fixes
-- QA follow-ups to 0080 (all fixes are CREATE OR REPLACE / DROP+CREATE;
-- no data touched, fully re-runnable):
--
--  F1 get_exam_questions: students could read general-exam PROMPTS before
--     the start (upcoming exams) via direct RPC — question leak pre-exam.
--     Students are now blocked pre-starts_at (staff bypass; post-end stays
--     open for review flows). Lesson-exam branch untouched.
--  F2 submit_general_exam_attempt: payload was only shape-checked —
--     empty / partial / duplicated answer sets were accepted (or blew up
--     with raw 23505). Now: answer count must equal question count, ids
--     distinct, all belonging to the exam.
--  F3 submit_general_exam_attempt: blank MCQ (NULL choice) was rejected,
--     so a timeout auto-submit with one blank MCQ failed and stranded the
--     student. NULL choice / empty essay text are now accepted and stored
--     unscored (NULL score, same as a wrong MCQ). Manual UI validation
--     stays strict; this leniency only affects timeouts/savvy callers who
--     gain no advantage (blank can never outscore a guess).
--  F4 update_general_exam: COALESCE semantics made it impossible to clear
--     a single window bound or the duration (NULL = "keep"). New
--     direct-set semantics: NULL clears starts_at/ends_at/duration;
--     passing_score/show_leaderboard NULL keeps old; title NULL keeps old
--     (empty title rejected). p_clear_window is dropped (DROP+CREATE).
--  F5 start_general_exam_attempt: starting a question-less exam is now
--     rejected with exam_empty (publish requires >=1 question, but
--     questions can be deleted afterwards).
-- =====================================================================

-- ---------------------------------------------------------------------
-- F1: gate student reads of general-exam prompts on the start boundary
-- ---------------------------------------------------------------------
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
    WHERE q.exam_id = p_exam_id
      AND (
          public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
          OR (e.lesson_id IS NOT NULL AND public.can_access_lesson(e.lesson_id))
          OR (e.lesson_id IS NULL AND e.grade_id IS NOT NULL
              AND public.can_access_general_exam(e.id)
              AND (e.starts_at IS NULL OR now() >= e.starts_at))
      )
    ORDER BY q.sort_order;
$$;

COMMENT ON FUNCTION public.get_exam_questions(uuid) IS 'Questions of an exam (lesson or general); correct_index masked for non-staff; general-exam prompts hidden from students before starts_at (anti-cheat F1).';

-- ---------------------------------------------------------------------
-- F5: refuse to start a question-less general exam
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_general_exam_attempt(p_exam_id uuid)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_exam public.exams%ROWTYPE;
    v_attempt public.exam_attempts;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;
    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id AND deleted_at IS NULL;
    IF v_exam.id IS NULL THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;
    IF v_exam.lesson_id IS NOT NULL OR v_exam.grade_id IS NULL THEN
        RAISE EXCEPTION 'not_general_exam';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.exam_questions WHERE exam_id = p_exam_id) THEN
        RAISE EXCEPTION 'exam_empty';
    END IF;
    IF NOT public.can_access_general_exam(p_exam_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;
    IF v_exam.starts_at IS NOT NULL AND now() < v_exam.starts_at THEN
        RAISE EXCEPTION 'exam_not_started';
    END IF;
    IF v_exam.ends_at IS NOT NULL AND now() > v_exam.ends_at THEN
        RAISE EXCEPTION 'exam_ended';
    END IF;

    SELECT * INTO v_attempt FROM public.exam_attempts
    WHERE exam_id = p_exam_id AND student_id = v_uid;
    IF v_attempt.id IS NOT NULL THEN
        IF v_attempt.started_at IS NULL THEN
            UPDATE public.exam_attempts SET started_at = submitted_at
            WHERE id = v_attempt.id RETURNING * INTO v_attempt;
        END IF;
        RETURN v_attempt;
    END IF;

    INSERT INTO public.exam_attempts (exam_id, student_id, status, started_at)
    VALUES (p_exam_id, v_uid, 'submitted', now())
    RETURNING * INTO v_attempt;
    RETURN v_attempt;
END $$;

COMMENT ON FUNCTION public.start_general_exam_attempt(uuid) IS 'Student pins the server-side attempt clock (idempotent resume). Rejects outside the window and on question-less exams (F5).';

REVOKE EXECUTE ON FUNCTION public.start_general_exam_attempt(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.start_general_exam_attempt(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- F2+F3: strict answer-set validation + blank-tolerant scoring
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_general_exam_attempt(p_exam_id uuid, p_answers jsonb)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_exam public.exams%ROWTYPE;
    v_attempt public.exam_attempts;
    v_auto numeric(5, 2) := 0;
    v_has_essays boolean;
    v_deadline timestamptz;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;
    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id AND deleted_at IS NULL;
    IF v_exam.id IS NULL THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;
    IF v_exam.lesson_id IS NOT NULL OR v_exam.grade_id IS NULL THEN
        RAISE EXCEPTION 'not_general_exam';
    END IF;
    IF NOT public.can_access_general_exam(p_exam_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT * INTO v_attempt FROM public.exam_attempts
    WHERE exam_id = p_exam_id AND student_id = v_uid;
    IF v_attempt.id IS NULL OR v_attempt.started_at IS NULL THEN
        RAISE EXCEPTION 'not_started';
    END IF;
    IF EXISTS (SELECT 1 FROM public.exam_answers WHERE attempt_id = v_attempt.id) THEN
        RAISE EXCEPTION 'attempt_already_exists';
    END IF;

    IF v_exam.ends_at IS NOT NULL AND now() > v_exam.ends_at THEN
        RAISE EXCEPTION 'time_expired';
    END IF;
    IF v_exam.duration_minutes IS NOT NULL THEN
        v_deadline := v_attempt.started_at + (v_exam.duration_minutes || ' minutes')::interval;
        IF now() > v_deadline THEN
            RAISE EXCEPTION 'time_expired';
        END IF;
    END IF;

    IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'invalid_answers';
    END IF;

    -- F2: exactly one answer per question of this exam (no blanks dupes)
    IF (SELECT count(*)
        FROM jsonb_to_recordset(p_answers)
             AS r(question_id uuid, choice_index integer, answer_text text))
       IS DISTINCT FROM
       (SELECT count(*) FROM public.exam_questions WHERE exam_id = p_exam_id) THEN
        RAISE EXCEPTION 'invalid_answers';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_answers)
             AS r(question_id uuid, choice_index integer, answer_text text)
        GROUP BY r.question_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'invalid_answers';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_answers)
             AS r(question_id uuid, choice_index integer, answer_text text)
        LEFT JOIN public.exam_questions q
               ON q.id = r.question_id AND q.exam_id = p_exam_id
        WHERE q.id IS NULL
    ) THEN
        RAISE EXCEPTION 'invalid_answers';
    END IF;

    -- F3: MCQ choice NULL (unanswered) or in range; essay text free-form
    -- (empty allowed — stored unscored for manual grading).
    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_answers)
             AS r(question_id uuid, choice_index integer, answer_text text)
        JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = p_exam_id
        WHERE q.type = 'mcq'
          AND r.choice_index IS NOT NULL
          AND (r.choice_index < 0
               OR r.choice_index > jsonb_array_length(q.choices) - 1)
    ) THEN
        RAISE EXCEPTION 'invalid_answers';
    END IF;

    INSERT INTO public.exam_answers (attempt_id, question_id, choice_index, answer_text, score)
    SELECT v_attempt.id, q.id, r.choice_index, r.answer_text,
           CASE WHEN q.type = 'mcq' AND r.choice_index IS NOT NULL
                     AND r.choice_index = q.correct_index
                THEN q.max_score ELSE NULL END
    FROM jsonb_to_recordset(p_answers)
         AS r(question_id uuid, choice_index integer, answer_text text)
    JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = p_exam_id;

    SELECT COALESCE(sum(score), 0) INTO v_auto
    FROM public.exam_answers
    WHERE attempt_id = v_attempt.id;

    SELECT EXISTS (
        SELECT 1 FROM public.exam_questions
        WHERE exam_id = p_exam_id AND type = 'essay'
    ) INTO v_has_essays;

    UPDATE public.exam_attempts SET auto_score = v_auto
    WHERE id = v_attempt.id
    RETURNING * INTO v_attempt;

    IF NOT v_has_essays THEN
        UPDATE public.exam_attempts
        SET status = 'graded', manual_score = 0,
            final_score = v_auto, graded_at = now()
        WHERE id = v_attempt.id
        RETURNING * INTO v_attempt;

        INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
        VALUES (v_uid, 'exam_graded', 'تم تصحيح الاختبار', v_exam.title,
                'exam_graded:' || v_attempt.id, 'exam_attempts', v_attempt.id)
        ON CONFLICT (dedup_key) DO NOTHING;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT u.id, 'exam_submitted', 'اختبار بانتظار المراجعة', v_exam.title,
           'exam_submitted:' || u.id || ':' || v_attempt.id, 'exam_attempts', v_attempt.id
    FROM public.profiles u
    WHERE u.role IN ('admin', 'mr_walid', 'teacher', 'assistant')
      AND u.status = 'active' AND u.deleted_at IS NULL
    ON CONFLICT (dedup_key) DO NOTHING;

    PERFORM public.audit_log('general_exam.submitted', 'exam_attempts', v_attempt.id,
        jsonb_build_object('exam_id', p_exam_id, 'auto_score', v_auto));

    RETURN v_attempt;
END $$;

COMMENT ON FUNCTION public.submit_general_exam_attempt(uuid, jsonb) IS 'Student submit for general exams: server deadline, exact answer-set validation (F2), blank-tolerant scoring (F3), MCQ auto-grade, staff fan-out. One attempt enforced.';

REVOKE EXECUTE ON FUNCTION public.submit_general_exam_attempt(uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_general_exam_attempt(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- F4: direct-set update semantics (NULL clears window/duration).
-- Signature change -> DROP + CREATE (only caller is the staff UI).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_general_exam(uuid, text, timestamptz, timestamptz, integer, integer, boolean, text, boolean);

CREATE OR REPLACE FUNCTION public.update_general_exam(
    p_exam_id uuid,
    p_title text DEFAULT NULL,
    p_starts_at timestamptz DEFAULT NULL,
    p_ends_at timestamptz DEFAULT NULL,
    p_duration_minutes integer DEFAULT NULL,
    p_passing_score integer DEFAULT NULL,
    p_show_leaderboard boolean DEFAULT NULL,
    p_status text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exam public.exams%ROWTYPE;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id AND deleted_at IS NULL;
    IF v_exam.id IS NULL THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;
    IF v_exam.lesson_id IS NOT NULL OR v_exam.grade_id IS NULL THEN
        RAISE EXCEPTION 'not_general_exam';
    END IF;

    IF p_title IS NOT NULL AND length(btrim(p_title)) = 0 THEN
        RAISE EXCEPTION 'invalid_title';
    END IF;
    IF p_status IS NOT NULL AND p_status NOT IN ('draft', 'archived') THEN
        -- publishing goes through publish_general_exam (validates questions + fan-out)
        RAISE EXCEPTION 'invalid_status';
    END IF;
    IF p_passing_score IS NOT NULL AND (p_passing_score < 0 OR p_passing_score > 100) THEN
        RAISE EXCEPTION 'invalid_passing_score';
    END IF;
    IF p_duration_minutes IS NOT NULL AND (p_duration_minutes < 5 OR p_duration_minutes > 480) THEN
        RAISE EXCEPTION 'invalid_duration';
    END IF;
    IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'invalid_window';
    END IF;

    UPDATE public.exams SET
        title = CASE WHEN p_title IS NOT NULL THEN btrim(p_title) ELSE title END,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        duration_minutes = p_duration_minutes,
        passing_score = COALESCE(p_passing_score, passing_score),
        show_leaderboard = COALESCE(p_show_leaderboard, show_leaderboard),
        status = COALESCE(p_status, status),
        updated_at = now()
    WHERE id = p_exam_id;

    PERFORM public.audit_log('general_exam.updated', 'exams', p_exam_id,
        jsonb_build_object('title', p_title, 'status', p_status));
END $$;

COMMENT ON FUNCTION public.update_general_exam(uuid, text, timestamptz, timestamptz, integer, integer, boolean, text) IS 'Staff-only direct-set edit of a general exam (F4): NULL starts/ends/duration clears the field; publishing is publish_general_exam only.';

REVOKE EXECUTE ON FUNCTION public.update_general_exam(uuid, text, timestamptz, timestamptz, integer, integer, boolean, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_general_exam(uuid, text, timestamptz, timestamptz, integer, integer, boolean, text) TO authenticated;
