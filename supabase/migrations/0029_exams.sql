-- =====================================================================
-- 0029_exams
-- Phase 6 | Exams | Database
-- Adds the exam system on top of the unit-purchase model
-- (IMPLEMENTATION-PLAN.md section 8):
--   exams / exam_questions / exam_attempts / exam_answers
-- MCQ is auto-graded at submit time; essays are graded by staff via
-- grade_exam_attempt. notification_type gains exam_submitted (staff) and
-- exam_graded (student) via ALTER TYPE ... ADD VALUE (PG 12+).
--
-- Append-only migration: nothing in 0001..0028 is modified.
-- Access: reads gated on can_access_lesson(exam.lesson_id); staff DML via
-- RLS; student writes only through the SECURITY DEFINER submit RPC.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) notification_type: exam_submitted (staff) / exam_graded (student).
--    ADD VALUE is idempotent and safe on PG 12+; the new values are only
--    referenced inside function bodies below (runtime casts), so no
--    in-file enum usage exists.
-- ---------------------------------------------------------------------
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'exam_submitted';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'exam_graded';

-- ---------------------------------------------------------------------
-- 2) New enum: exam_question_type (additive - no conflict).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regtype('public.exam_question_type') IS NULL THEN
        CREATE TYPE public.exam_question_type AS ENUM ('mcq', 'essay');
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) New tables. exams carries created_at/updated_at (set_updated_at);
--    attempts/answers are high-volume student-owned rows and are EXCLUDED
--    from the audit_trigger inventory (DATABASE.md section 7 MED-8).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exams (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id     uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    title         text NOT NULL CHECK (length(btrim(title)) > 0),
    sort_order    integer NOT NULL DEFAULT 0,
    passing_score integer NOT NULL DEFAULT 50 CHECK (passing_score BETWEEN 0 AND 100),
    deleted_at    timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exams_lesson_idx ON public.exams(lesson_id);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.exams IS 'Per-lesson exam (one exam per lesson is the UI contract; UNIQUE(lesson_id) is NOT enforced to allow future variants). Soft-deletable; student reads gated on can_access_lesson(lesson_id).';

CREATE TABLE IF NOT EXISTS public.exam_questions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id       uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    type          public.exam_question_type NOT NULL DEFAULT 'mcq',
    prompt        text NOT NULL CHECK (length(btrim(prompt)) > 0),
    choices       jsonb,
    correct_index integer,
    max_score     numeric(5, 2) NOT NULL DEFAULT 1 CHECK (max_score > 0),
    sort_order    integer NOT NULL DEFAULT 0,
    CONSTRAINT exam_questions_mcq_shape CHECK (
        type <> 'mcq'
        OR (
            choices IS NOT NULL
            AND jsonb_typeof(choices) = 'array'
            AND jsonb_array_length(choices) >= 2
            AND correct_index IS NOT NULL
            AND correct_index BETWEEN 0 AND jsonb_array_length(choices) - 1
        )
    )
);
CREATE INDEX IF NOT EXISTS exam_questions_exam_idx ON public.exam_questions(exam_id);

ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.exam_questions IS 'Exam questions (mcq with choices/correct_index, or essay). correct_index is exposed to staff only (sanitized by get_exam_questions for students).';

CREATE TABLE IF NOT EXISTS public.exam_attempts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id       uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status        text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded')),
    auto_score    numeric(5, 2),
    manual_score  numeric(5, 2),
    final_score   numeric(5, 2),
    graded_by     uuid REFERENCES public.profiles(id),
    graded_at     timestamptz,
    submitted_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (exam_id, student_id)
);
CREATE INDEX IF NOT EXISTS exam_attempts_exam_idx ON public.exam_attempts(exam_id);

ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.exam_attempts IS 'One attempt per (exam, student) - UNIQUE enforced. MCQ auto-graded on submit; essays via grade_exam_attempt; final_score set when fully graded.';

CREATE TABLE IF NOT EXISTS public.exam_answers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id   uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    question_id  uuid NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
    choice_index integer,
    answer_text  text,
    score        numeric(5, 2),
    UNIQUE (attempt_id, question_id)
);
CREATE INDEX IF NOT EXISTS exam_answers_attempt_idx ON public.exam_answers(attempt_id);

ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_answers FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.exam_answers IS 'Per-question answers of an attempt. choice_index for mcq, answer_text for essay; score set at submit (mcq) or grading (essay).';

-- ---------------------------------------------------------------------
-- 4) Triggers: set_updated_at + audit_trigger on exams only (attempts and
--    answers are student-owned, excluded from the audit inventory; exam
--    questions are pure content but not part of the documented inventory).
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON public.exams;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.exams
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_trigger ON public.exams;
CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.exams
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ---------------------------------------------------------------------
-- 5) RLS policies (named style of 0009/0025/0028). Student reads are
--    gated on can_access_lesson(lesson_id); student writes happen only
--    through SECURITY DEFINER RPCs; staff hold full DML.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS exams_select_gated ON public.exams;
CREATE POLICY exams_select_gated ON public.exams
    FOR SELECT
    USING (
        deleted_at IS NULL
        AND (
            public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
            OR public.can_access_lesson(lesson_id)
        )
    );

DROP POLICY IF EXISTS exams_insert_staff ON public.exams;
CREATE POLICY exams_insert_staff ON public.exams
    FOR INSERT
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exams_update_staff ON public.exams;
CREATE POLICY exams_update_staff ON public.exams
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exams_delete_staff ON public.exams;
CREATE POLICY exams_delete_staff ON public.exams
    FOR DELETE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_questions_select_gated ON public.exam_questions;
CREATE POLICY exam_questions_select_gated ON public.exam_questions
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
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
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_questions_update_staff ON public.exam_questions;
CREATE POLICY exam_questions_update_staff ON public.exam_questions
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_questions_delete_staff ON public.exam_questions;
CREATE POLICY exam_questions_delete_staff ON public.exam_questions
    FOR DELETE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_attempts_select_own_or_staff ON public.exam_attempts;
CREATE POLICY exam_attempts_select_own_or_staff ON public.exam_attempts
    FOR SELECT
    USING (
        student_id = auth.uid()
        OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
    );

DROP POLICY IF EXISTS exam_attempts_dml_staff ON public.exam_attempts;
CREATE POLICY exam_attempts_dml_staff ON public.exam_attempts
    FOR INSERT
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_attempts_update_staff ON public.exam_attempts;
CREATE POLICY exam_attempts_update_staff ON public.exam_attempts
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_attempts_delete_staff ON public.exam_attempts;
CREATE POLICY exam_attempts_delete_staff ON public.exam_attempts
    FOR DELETE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_answers_select_own_or_staff ON public.exam_answers;
CREATE POLICY exam_answers_select_own_or_staff ON public.exam_answers
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR attempt_id IN (
            SELECT a.id FROM public.exam_attempts a
            WHERE a.student_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS exam_answers_dml_staff ON public.exam_answers;
CREATE POLICY exam_answers_dml_staff ON public.exam_answers
    FOR INSERT
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_answers_update_staff ON public.exam_answers;
CREATE POLICY exam_answers_update_staff ON public.exam_answers
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS exam_answers_delete_staff ON public.exam_answers;
CREATE POLICY exam_answers_delete_staff ON public.exam_answers
    FOR DELETE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- 6) Read helpers (SECURITY DEFINER; access-gated on the exam's lesson).
--    get_exam_questions sanitizes correct_index for students so the
--    answer key can never leak through the student surface.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_exams(p_lesson_id uuid)
RETURNS SETOF public.exams
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT e.*
    FROM public.exams e
    WHERE e.deleted_at IS NULL
      AND e.lesson_id = p_lesson_id
      AND (
          public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
          OR public.can_access_lesson(e.lesson_id)
      )
    ORDER BY e.sort_order, e.created_at;
$$;

COMMENT ON FUNCTION public.list_exams(uuid) IS 'Exams of a lesson visible to the caller (staff: all live; students: only lessons they can access).';

CREATE OR REPLACE FUNCTION public.get_exam_questions(p_exam_id uuid)
RETURNS SETOF public.exam_questions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT q.id, q.exam_id, q.type, q.prompt, q.choices,
           CASE WHEN (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
                THEN q.correct_index ELSE NULL END AS correct_index,
           q.max_score, q.sort_order
    FROM public.exam_questions q
    JOIN public.exams e ON e.id = q.exam_id AND e.deleted_at IS NULL
    WHERE q.exam_id = p_exam_id
      AND (
          public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
          OR public.can_access_lesson(e.lesson_id)
      )
    ORDER BY q.sort_order;
$$;

COMMENT ON FUNCTION public.get_exam_questions(uuid) IS 'Questions of an exam; correct_index is masked for non-staff callers (answer key never leaks).';

CREATE OR REPLACE FUNCTION public.get_my_exam_attempt(p_exam_id uuid)
RETURNS SETOF public.exam_attempts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT a.*
    FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id AND e.deleted_at IS NULL
    WHERE a.exam_id = p_exam_id
      AND a.student_id = auth.uid()
      AND (
          public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
          OR public.can_access_lesson(e.lesson_id)
      );
$$;

COMMENT ON FUNCTION public.get_my_exam_attempt(uuid) IS 'The caller''s own attempt for an exam (at most one row due to UNIQUE(exam_id, student_id)).';

-- ---------------------------------------------------------------------
-- 7) submit_exam_attempt: student-only SECURITY DEFINER write path.
--    Validates the answer payload, stores the answers, auto-grades MCQ,
--    sends exam_submitted to staff, and - when no essay question exists -
--    grades the attempt immediately (exam_graded to the student).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(p_exam_id uuid, p_answers jsonb)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid         uuid := auth.uid();
    v_exam        public.exams%ROWTYPE;
    v_attempt     public.exam_attempts;
    v_auto        numeric(5, 2) := 0;
    v_has_essays  boolean;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;
    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT * INTO v_exam
    FROM public.exams
    WHERE id = p_exam_id AND deleted_at IS NULL;
    IF v_exam.id IS NULL THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;

    IF NOT public.can_access_lesson(v_exam.lesson_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.exam_attempts
        WHERE exam_id = p_exam_id AND student_id = v_uid
    ) THEN
        RAISE EXCEPTION 'attempt_already_exists';
    END IF;

    IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'invalid_answers';
    END IF;

    -- every supplied answer must reference a question of this exam
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

    -- every answer must be well-formed for its question type
    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_answers)
             AS r(question_id uuid, choice_index integer, answer_text text)
        JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = p_exam_id
        WHERE (q.type = 'mcq'
               AND (r.choice_index IS NULL
                    OR r.choice_index < 0
                    OR r.choice_index > jsonb_array_length(q.choices) - 1))
           OR (q.type = 'essay'
               AND length(btrim(COALESCE(r.answer_text, ''))) = 0)
    ) THEN
        RAISE EXCEPTION 'invalid_answers';
    END IF;

    INSERT INTO public.exam_attempts (exam_id, student_id, status)
    VALUES (p_exam_id, v_uid, 'submitted')
    RETURNING * INTO v_attempt;

    INSERT INTO public.exam_answers (attempt_id, question_id, choice_index, answer_text, score)
    SELECT v_attempt.id, q.id, r.choice_index, r.answer_text,
           CASE WHEN q.type = 'mcq' AND r.choice_index = q.correct_index
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

    -- supervising staff are notified of every submission (one notification
    -- per recipient; dedup_key scoped by user so the fan-out never collapses)
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT u.id, 'exam_submitted', 'اختبار بانتظار المراجعة', v_exam.title,
           'exam_submitted:' || u.id || ':' || v_attempt.id, 'exam_attempts', v_attempt.id
    FROM public.profiles u
    WHERE u.role IN ('admin', 'mr_walid', 'teacher')
      AND u.status = 'active' AND u.deleted_at IS NULL
    ON CONFLICT (dedup_key) DO NOTHING;

    PERFORM public.audit_log('exam.submitted', 'exam_attempts', v_attempt.id,
        jsonb_build_object('exam_id', p_exam_id, 'auto_score', v_auto));

    RETURN v_attempt;
END $$;

COMMENT ON FUNCTION public.submit_exam_attempt(uuid, jsonb) IS 'Student submit path: one attempt per (exam, student); MCQ auto-graded, essays pending grade_exam_attempt; notifies staff (exam_submitted) and, when fully auto-graded, the student (exam_graded).';

-- ---------------------------------------------------------------------
-- 8) grade_exam_attempt: staff-only SECURITY DEFINER essay grading.
--    Applies per-essay scores, sets manual_score/final_score and the
--    graded status, and notifies the student (exam_graded).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grade_exam_attempt(p_attempt_id uuid, p_scores jsonb)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempt public.exam_attempts%ROWTYPE;
    v_manual  numeric(5, 2) := 0;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE id = p_attempt_id;
    IF v_attempt.id IS NULL THEN
        RAISE EXCEPTION 'attempt_not_found';
    END IF;
    IF v_attempt.status = 'graded' THEN
        RAISE EXCEPTION 'already_graded';
    END IF;

    -- every score must target an essay question of the attempt's exam
    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(COALESCE(p_scores, '[]'::jsonb))
             AS r(question_id uuid, score numeric)
        LEFT JOIN public.exam_questions q
               ON q.id = r.question_id
              AND q.exam_id = v_attempt.exam_id
              AND q.type = 'essay'
        WHERE q.id IS NULL OR r.score IS NULL OR r.score < 0
    ) THEN
        RAISE EXCEPTION 'invalid_scores';
    END IF;

    UPDATE public.exam_answers a
    SET score = r.score
    FROM jsonb_to_recordset(COALESCE(p_scores, '[]'::jsonb))
         AS r(question_id uuid, score numeric)
    WHERE a.attempt_id = v_attempt.id AND a.question_id = r.question_id;

    SELECT COALESCE(sum(a.score), 0) INTO v_manual
    FROM public.exam_answers a
    JOIN public.exam_questions q ON q.id = a.question_id
    WHERE a.attempt_id = v_attempt.id AND q.type = 'essay';

    UPDATE public.exam_attempts
    SET status = 'graded',
        manual_score = v_manual,
        final_score = COALESCE(auto_score, 0) + v_manual,
        graded_by = auth.uid(),
        graded_at = now()
    WHERE id = v_attempt.id
    RETURNING * INTO v_attempt;

    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT v_attempt.student_id, 'exam_graded', 'تم تصحيح الاختبار', e.title,
           'exam_graded:' || v_attempt.id, 'exam_attempts', v_attempt.id
    FROM public.exams e
    WHERE e.id = v_attempt.exam_id
    ON CONFLICT (dedup_key) DO NOTHING;

    PERFORM public.audit_log('exam.graded', 'exam_attempts', p_attempt_id,
        jsonb_build_object('final_score', v_attempt.final_score, 'graded_by', auth.uid()));

    RETURN v_attempt;
END $$;

COMMENT ON FUNCTION public.grade_exam_attempt(uuid, jsonb) IS 'Staff essay grading: applies per-essay scores, finalizes the attempt and notifies the student (exam_graded).';

-- ---------------------------------------------------------------------
-- 9) Grants (SECURITY.md 8.2 pattern): every new function is revoked from
--    PUBLIC and granted to authenticated. No anon surface is added.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.list_exams(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_exams(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_exam_questions(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_exam_questions(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_exam_attempt(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_exam_attempt(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.grade_exam_attempt(uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.grade_exam_attempt(uuid, jsonb) TO authenticated;
