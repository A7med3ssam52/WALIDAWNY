-- =====================================================================
-- 0080_general_exams
-- Standalone (grade-level) exams, separate from per-lesson exams.
--
-- Design: EXTENDS the 0029 exam system instead of duplicating it.
--   exams.lesson_id becomes NULLABLE; a new exams.grade_id marks a
--   "general" exam. Exactly one of (lesson_id, grade_id) must be set:
--     lesson exam  -> lesson_id NOT NULL, grade_id NULL  (unchanged flow)
--     general exam -> lesson_id NULL,     grade_id NOT NULL (new flow)
--   Questions / attempts / answers / images / essay grading
--   (grade_exam_attempt) are shared unchanged.
--
-- Append-only + data-safe:
--   * every new column is NULLABLE or has a DEFAULT -> zero impact on
--     existing rows (no UPDATE/DELETE of existing data, except a
--     backfill of the new status column to 'published' for old rows so
--     the new column is self-describing; lesson-exam reads ignore it).
--   * all DDL uses IF NOT EXISTS / OR REPLACE -> re-runnable.
--   * lesson-exam RPCs (list_exams, submit_exam_attempt, ...) are NOT
--     modified; general-exam RPCs are new `general_*` functions.
--   * get_exam_questions + get_my_exam_attempt are re-created ONLY to
--     add an OR branch for general-exam access (lesson branch untouched).
--   * delete_exam is re-created to (a) tolerate lesson_id NULL and
--     (b) include is_assistant in the staff guard, matching the RLS
--     posture of 0060 (assistant already holds exams DML via RLS) and
--     the ExamsPage "FULL WRITE for assistant" contract.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) exams: new columns (all nullable/defaulted -> safe for old rows)
-- ---------------------------------------------------------------------
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS grade_id uuid
    REFERENCES public.grades(id) ON DELETE CASCADE;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived'));
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS duration_minutes integer
    CHECK (duration_minutes IS NULL OR (duration_minutes BETWEEN 5 AND 480));
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS show_leaderboard boolean NOT NULL DEFAULT true;

-- lesson_id: relax NOT NULL so general exams can exist (old rows keep values)
ALTER TABLE public.exams ALTER COLUMN lesson_id DROP NOT NULL;

-- scope guard: exactly one of lesson_id / grade_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'exams_scope_check'
    ) THEN
        ALTER TABLE public.exams
        ADD CONSTRAINT exams_scope_check
        CHECK ((lesson_id IS NULL) != (grade_id IS NULL));
    END IF;
END $$;

-- window sanity (only when both bounds are set)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'exams_window_check'
    ) THEN
        ALTER TABLE public.exams
        ADD CONSTRAINT exams_window_check
        CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS exams_grade_idx ON public.exams(grade_id);
CREATE INDEX IF NOT EXISTS exams_status_idx ON public.exams(status);

-- old lesson rows predate the status column -> mark published (reads ignore it)
UPDATE public.exams SET status = 'published'
WHERE lesson_id IS NOT NULL AND status = 'draft';

COMMENT ON COLUMN public.exams.grade_id IS 'General (standalone) exam owner grade. NULL for per-lesson exams; NOT NULL for general exams (see exams_scope_check).';
COMMENT ON COLUMN public.exams.status IS 'Draft/published/archived. Gates general exams only; lesson-exam reads ignore it.';
COMMENT ON COLUMN public.exams.starts_at IS 'General exam visibility start (null = no lower bound).';
COMMENT ON COLUMN public.exams.ends_at IS 'General exam visibility end + answer-key release moment (null = open-ended).';
COMMENT ON COLUMN public.exams.duration_minutes IS 'Per-attempt time budget in minutes, counted server-side from exam_attempts.started_at (null = window-only).';

-- ---------------------------------------------------------------------
-- 2) exam_attempts: server-side timer anchor
-- ---------------------------------------------------------------------
ALTER TABLE public.exam_attempts ADD COLUMN IF NOT EXISTS started_at timestamptz;
CREATE INDEX IF NOT EXISTS exam_attempts_started_idx ON public.exam_attempts(started_at);

COMMENT ON COLUMN public.exam_attempts.started_at IS 'General-exam attempt start (set by start_general_exam_attempt). Submit deadline = started_at + exams.duration_minutes. NULL for legacy lesson attempts.';

-- ---------------------------------------------------------------------
-- 3) Access helper: can the caller see/take this general exam?
--    Staff (admin/mr_walid/teacher/assistant): any live general exam.
--    Student: active + own grade + published. The time window gates
--    START/SUBMIT (RPC level), not listing, so "upcoming/ended" states
--    stay visible to students.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_general_exam(p_exam_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exam public.exams%ROWTYPE;
    v_grade uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id;
    IF v_exam.id IS NULL OR v_exam.deleted_at IS NOT NULL THEN
        RETURN false;
    END IF;
    -- lesson exams are NOT general exams
    IF v_exam.lesson_id IS NOT NULL OR v_exam.grade_id IS NULL THEN
        RETURN false;
    END IF;

    IF public.is_admin() OR public.is_mr_walid()
       OR public.is_teacher() OR public.is_assistant() THEN
        RETURN true;
    END IF;

    IF NOT public.is_student() THEN
        RETURN false;
    END IF;

    SELECT grade_id INTO v_grade FROM public.profiles
    WHERE id = auth.uid() AND deleted_at IS NULL AND status = 'active';
    IF v_grade IS NULL OR v_grade <> v_exam.grade_id THEN
        RETURN false;
    END IF;

    IF v_exam.status <> 'published' THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.grades g
        WHERE g.id = v_exam.grade_id AND g.is_active AND g.deleted_at IS NULL
    );
END $$;

COMMENT ON FUNCTION public.can_access_general_exam(uuid) IS 'Visibility gate for standalone exams: staff see any live general exam; students see published exams of their own active grade (time window enforced at start/submit, not here).';

REVOKE EXECUTE ON FUNCTION public.can_access_general_exam(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.can_access_general_exam(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) RLS: extend the 0060-gated policies with a general-exam branch.
--    Lesson-exam semantics are preserved verbatim; general exams add
--    can_access_general_exam. Attempts/answers policies (own-or-staff)
--    already cover both flows -> untouched.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS exams_select_gated ON public.exams;
CREATE POLICY exams_select_gated ON public.exams
    FOR SELECT
    USING (
        deleted_at IS NULL
        AND (
            public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
            OR (lesson_id IS NOT NULL AND public.can_access_lesson(lesson_id))
            OR (lesson_id IS NULL AND grade_id IS NOT NULL AND public.can_access_general_exam(id))
        )
    );

DROP POLICY IF EXISTS exam_questions_select_gated ON public.exam_questions;
CREATE POLICY exam_questions_select_gated ON public.exam_questions
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
        OR EXISTS (
            SELECT 1 FROM public.exams e
            WHERE e.id = exam_id
              AND e.deleted_at IS NULL
              AND e.lesson_id IS NOT NULL
              AND public.can_access_lesson(e.lesson_id)
        )
        OR EXISTS (
            SELECT 1 FROM public.exams e
            WHERE e.id = exam_id
              AND e.deleted_at IS NULL
              AND e.lesson_id IS NULL
              AND e.grade_id IS NOT NULL
              AND public.can_access_general_exam(e.id)
        )
    );

-- question/attempt/answer DML stays staff-gated incl. assistant (0060) -> untouched.

-- ---------------------------------------------------------------------
-- 5) Shared readers: re-created to add the general-exam OR branch.
--    Lesson-exam behavior is identical to 0061.
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
          OR (e.lesson_id IS NULL AND e.grade_id IS NOT NULL AND public.can_access_general_exam(e.id))
      )
    ORDER BY q.sort_order;
$$;

COMMENT ON FUNCTION public.get_exam_questions(uuid) IS 'Questions of an exam (lesson or general); correct_index masked for non-staff.';

CREATE OR REPLACE FUNCTION public.get_my_exam_attempt(p_exam_id uuid)
RETURNS SETOF public.exam_attempts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT a.* FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id AND e.deleted_at IS NULL
    WHERE a.exam_id = p_exam_id
      AND a.student_id = auth.uid()
      AND (
          public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
          OR (e.lesson_id IS NOT NULL AND public.can_access_lesson(e.lesson_id))
          OR (e.lesson_id IS NULL AND e.grade_id IS NOT NULL AND public.can_access_general_exam(e.id))
      );
$$;

-- ---------------------------------------------------------------------
-- 6) delete_exam: tolerate general exams + include assistant in guard
--    (aligns the RPC with the 0060 RLS posture + ExamsPage contract).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_exam(p_exam_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
    v_grade uuid;
    v_deleted timestamptz;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lesson_id, grade_id, deleted_at INTO v_lesson, v_grade, v_deleted
    FROM public.exams
    WHERE id = p_exam_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;

    IF v_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;

    UPDATE public.exams
    SET deleted_at = now(), updated_at = now()
    WHERE id = p_exam_id;

    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
            DELETE FROM storage.objects
            WHERE bucket_id = 'exam-images'
              AND name LIKE p_exam_id::text || '/%';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    PERFORM public.audit_log('exam.deleted', 'exams', p_exam_id,
        jsonb_build_object('lesson_id', v_lesson, 'grade_id', v_grade));
END $$;

COMMENT ON FUNCTION public.delete_exam(uuid) IS 'Staff-only (incl. assistant) soft-delete for lesson AND general exams. Raises exam_not_found when absent/already deleted. Audited.';

REVOKE EXECUTE ON FUNCTION public.delete_exam(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_exam(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 7) Staff: create / update / publish general exams
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_general_exam(
    p_grade_id uuid,
    p_title text,
    p_starts_at timestamptz DEFAULT NULL,
    p_ends_at timestamptz DEFAULT NULL,
    p_duration_minutes integer DEFAULT NULL,
    p_passing_score integer DEFAULT 50,
    p_show_leaderboard boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;
    IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN
        RAISE EXCEPTION 'invalid_title';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.grades g
        WHERE g.id = p_grade_id AND g.deleted_at IS NULL AND g.is_active
    ) THEN
        RAISE EXCEPTION 'invalid_grade';
    END IF;
    IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'invalid_window';
    END IF;
    IF p_duration_minutes IS NOT NULL AND (p_duration_minutes < 5 OR p_duration_minutes > 480) THEN
        RAISE EXCEPTION 'invalid_duration';
    END IF;
    IF p_passing_score IS NULL OR p_passing_score < 0 OR p_passing_score > 100 THEN
        RAISE EXCEPTION 'invalid_passing_score';
    END IF;

    INSERT INTO public.exams (lesson_id, grade_id, title, status, starts_at, ends_at, duration_minutes, passing_score, show_leaderboard)
    VALUES (NULL, p_grade_id, btrim(p_title), 'draft', p_starts_at, p_ends_at, p_duration_minutes, p_passing_score, COALESCE(p_show_leaderboard, true))
    RETURNING id INTO v_id;

    PERFORM public.audit_log('general_exam.created', 'exams', v_id,
        jsonb_build_object('grade_id', p_grade_id, 'title', p_title));
    RETURN v_id;
END $$;

COMMENT ON FUNCTION public.create_general_exam(uuid, text, timestamptz, timestamptz, integer, integer, boolean) IS 'Staff-only: create a draft standalone exam for one grade. Publish separately via publish_general_exam.';

REVOKE EXECUTE ON FUNCTION public.create_general_exam(uuid, text, timestamptz, timestamptz, integer, integer, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_general_exam(uuid, text, timestamptz, timestamptz, integer, integer, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_general_exam(
    p_exam_id uuid,
    p_title text DEFAULT NULL,
    p_starts_at timestamptz DEFAULT NULL,
    p_ends_at timestamptz DEFAULT NULL,
    p_duration_minutes integer DEFAULT NULL,
    p_passing_score integer DEFAULT NULL,
    p_show_leaderboard boolean DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_clear_window boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exam public.exams%ROWTYPE;
    v_starts timestamptz;
    v_ends timestamptz;
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

    v_starts := CASE WHEN p_clear_window THEN NULL ELSE COALESCE(p_starts_at, v_exam.starts_at) END;
    v_ends := CASE WHEN p_clear_window THEN NULL ELSE COALESCE(p_ends_at, v_exam.ends_at) END;
    IF v_starts IS NOT NULL AND v_ends IS NOT NULL AND v_ends <= v_starts THEN
        RAISE EXCEPTION 'invalid_window';
    END IF;

    UPDATE public.exams SET
        title = CASE WHEN p_title IS NOT NULL THEN btrim(p_title) ELSE title END,
        starts_at = CASE WHEN p_clear_window THEN NULL WHEN p_starts_at IS NOT NULL THEN p_starts_at ELSE starts_at END,
        ends_at = CASE WHEN p_clear_window THEN NULL WHEN p_ends_at IS NOT NULL THEN p_ends_at ELSE ends_at END,
        duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
        passing_score = COALESCE(p_passing_score, passing_score),
        show_leaderboard = COALESCE(p_show_leaderboard, show_leaderboard),
        status = COALESCE(p_status, status),
        updated_at = now()
    WHERE id = p_exam_id;

    PERFORM public.audit_log('general_exam.updated', 'exams', p_exam_id,
        jsonb_build_object('title', p_title, 'status', p_status));
END $$;

COMMENT ON FUNCTION public.update_general_exam(uuid, text, timestamptz, timestamptz, integer, integer, boolean, text, boolean) IS 'Staff-only: edit a general exam draft (title/window/duration/passing/leaderboard, or archive). Publishing is publish_general_exam only.';

REVOKE EXECUTE ON FUNCTION public.update_general_exam(uuid, text, timestamptz, timestamptz, integer, integer, boolean, text, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_general_exam(uuid, text, timestamptz, timestamptz, integer, integer, boolean, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_general_exam(p_exam_id uuid)
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
    IF NOT EXISTS (SELECT 1 FROM public.exam_questions WHERE exam_id = p_exam_id) THEN
        RAISE EXCEPTION 'exam_empty';
    END IF;

    UPDATE public.exams SET status = 'published', updated_at = now()
    WHERE id = p_exam_id;

    -- fan-out: notify every active student of the grade (one row each)
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT u.id, 'new_content', 'امتحان جديد متاح', v_exam.title,
           'general_exam_published:' || u.id || ':' || p_exam_id, 'exams', p_exam_id
    FROM public.profiles u
    WHERE u.role = 'student'
      AND u.status = 'active' AND u.deleted_at IS NULL
      AND u.grade_id = v_exam.grade_id
    ON CONFLICT (dedup_key) DO NOTHING;

    PERFORM public.audit_log('general_exam.published', 'exams', p_exam_id,
        jsonb_build_object('grade_id', v_exam.grade_id));
END $$;

COMMENT ON FUNCTION public.publish_general_exam(uuid) IS 'Staff-only: publish a general exam (requires >=1 question) + notify all active students of the grade (new_content).';

REVOKE EXECUTE ON FUNCTION public.publish_general_exam(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.publish_general_exam(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 8) Listing: staff see all live general exams (+grade filter);
--    students see published exams of their own grade (any window state).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_general_exams(p_grade_id uuid DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    grade_id uuid,
    grade_name text,
    title text,
    sort_order integer,
    passing_score integer,
    status text,
    starts_at timestamptz,
    ends_at timestamptz,
    duration_minutes integer,
    show_leaderboard boolean,
    question_count bigint,
    attempt_count bigint,
    my_attempt_id uuid,
    my_status text,
    created_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_staff boolean := public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant();
    v_grade uuid;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;

    IF NOT v_staff THEN
        IF NOT public.is_student() THEN
            RAISE EXCEPTION 'permission_denied';
        END IF;
        SELECT p.grade_id INTO v_grade FROM public.profiles p
        WHERE p.id = v_uid AND p.deleted_at IS NULL AND p.status = 'active';
        IF v_grade IS NULL THEN
            RETURN;
        END IF;
    END IF;

    RETURN QUERY
    SELECT e.id, e.grade_id, g.name AS grade_name, e.title, e.sort_order,
           e.passing_score, e.status, e.starts_at, e.ends_at,
           e.duration_minutes, e.show_leaderboard,
           (SELECT count(*) FROM public.exam_questions q WHERE q.exam_id = e.id) AS question_count,
           (SELECT count(*) FROM public.exam_attempts a WHERE a.exam_id = e.id) AS attempt_count,
           mine.id AS my_attempt_id, mine.status AS my_status,
           e.created_at, e.updated_at
    FROM public.exams e
    JOIN public.grades g ON g.id = e.grade_id
    LEFT JOIN public.exam_attempts mine
           ON mine.exam_id = e.id AND mine.student_id = v_uid
    WHERE e.deleted_at IS NULL
      AND e.lesson_id IS NULL AND e.grade_id IS NOT NULL
      AND (p_grade_id IS NULL OR e.grade_id = p_grade_id)
      AND (
          v_staff
          OR (e.status = 'published' AND e.grade_id = v_grade
              AND g.is_active AND g.deleted_at IS NULL)
      )
    ORDER BY e.starts_at NULLS LAST, e.created_at DESC;
END $$;

COMMENT ON FUNCTION public.list_general_exams(uuid) IS 'General-exam inbox: staff see all live (+optional grade filter); students see published exams of their own grade with their attempt pointer.';

REVOKE EXECUTE ON FUNCTION public.list_general_exams(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_general_exams(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 9) start_general_exam_attempt: student pins started_at (server clock).
--    Idempotent: resuming returns the existing attempt.
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
        -- resume: backfill started_at for rows predating 0080
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

COMMENT ON FUNCTION public.start_general_exam_attempt(uuid) IS 'Student pins the server-side attempt clock (idempotent resume). Rejects outside the exam window.';

REVOKE EXECUTE ON FUNCTION public.start_general_exam_attempt(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.start_general_exam_attempt(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 10) submit_general_exam_attempt: graded submit, mirror of 0029 logic
--     + server-side deadline enforcement (window + duration).
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

    -- deadline: window end AND/OR duration budget (server clock)
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

COMMENT ON FUNCTION public.submit_general_exam_attempt(uuid, jsonb) IS 'Student submit for general exams: server-side deadline (window + duration), MCQ auto-grade, essay pending grade_exam_attempt, staff fan-out. One attempt enforced.';

REVOKE EXECUTE ON FUNCTION public.submit_general_exam_attempt(uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_general_exam_attempt(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- 11) Leaderboard: ranked attempts of a general exam.
--     Visible to staff + students of the exam grade (names included).
--     Honors show_leaderboard for students (staff bypass).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_general_exam_leaderboard(p_exam_id uuid)
RETURNS TABLE (
    rank bigint,
    student_id uuid,
    student_name text,
    status text,
    auto_score numeric,
    manual_score numeric,
    final_score numeric,
    submitted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exam public.exams%ROWTYPE;
    v_staff boolean := public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant();
BEGIN
    SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id AND deleted_at IS NULL;
    IF v_exam.id IS NULL THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;
    IF v_exam.lesson_id IS NOT NULL OR v_exam.grade_id IS NULL THEN
        RAISE EXCEPTION 'not_general_exam';
    END IF;
    IF NOT (v_staff OR public.can_access_general_exam(p_exam_id)) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;
    IF NOT v_staff AND COALESCE(v_exam.show_leaderboard, true) = false THEN
        RAISE EXCEPTION 'leaderboard_hidden';
    END IF;

    RETURN QUERY
    SELECT ROW_NUMBER() OVER (
               ORDER BY a.final_score DESC NULLS LAST, a.submitted_at ASC
           ) AS rank,
           a.student_id, COALESCE(p.full_name, '') AS student_name,
           a.status, a.auto_score, a.manual_score, a.final_score, a.submitted_at
    FROM public.exam_attempts a
    JOIN public.profiles p ON p.id = a.student_id
    WHERE a.exam_id = p_exam_id
    ORDER BY a.final_score DESC NULLS LAST, a.submitted_at ASC;
END $$;

COMMENT ON FUNCTION public.get_general_exam_leaderboard(uuid) IS 'Ranked attempts (ROW_NUMBER over final_score DESC, submitted first wins ties). Staff + same-grade students; students gated on show_leaderboard.';

REVOKE EXECUTE ON FUNCTION public.get_general_exam_leaderboard(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_general_exam_leaderboard(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 12) Answer-key review: questions WITH correct_index + my answers.
--     Released only AFTER ends_at (anti-cheat). Exams without ends_at
--     release after the caller is graded. Requires own attempt.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_general_exam_review(p_exam_id uuid)
RETURNS TABLE (
    question_id uuid,
    q_type text,
    prompt text,
    choices jsonb,
    correct_index integer,
    max_score numeric,
    sort_order integer,
    prompt_image_path text,
    choice_image_paths jsonb,
    my_choice_index integer,
    my_answer_text text,
    my_score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_exam public.exams%ROWTYPE;
    v_attempt public.exam_attempts;
    v_released boolean := false;
BEGIN
    SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id AND deleted_at IS NULL;
    IF v_exam.id IS NULL THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;
    IF v_exam.lesson_id IS NOT NULL OR v_exam.grade_id IS NULL THEN
        RAISE EXCEPTION 'not_general_exam';
    END IF;
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
            OR public.can_access_general_exam(p_exam_id)) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT * INTO v_attempt FROM public.exam_attempts
    WHERE exam_id = p_exam_id AND student_id = v_uid;
    -- staff may preview the key without attempting
    IF v_attempt.id IS NULL
       AND NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'no_attempt';
    END IF;

    IF v_exam.ends_at IS NOT NULL THEN
        v_released := now() > v_exam.ends_at;
    ELSE
        v_released := v_attempt.id IS NOT NULL AND v_attempt.status = 'graded';
    END IF;

    IF NOT v_released
       AND NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'answers_not_released';
    END IF;

    RETURN QUERY
    SELECT q.id, q.type::text, q.prompt, q.choices, q.correct_index,
           q.max_score, q.sort_order, q.prompt_image_path,
           to_jsonb(q.choice_image_paths),
           ans.choice_index, ans.answer_text, ans.score
    FROM public.exam_questions q
    LEFT JOIN public.exam_answers ans
           ON ans.question_id = q.id
          AND ans.attempt_id = v_attempt.id
    WHERE q.exam_id = p_exam_id
    ORDER BY q.sort_order;
END $$;

COMMENT ON FUNCTION public.get_general_exam_review(uuid) IS 'Post-deadline answer key + own answers (anti-cheat: answers_not_released before ends_at). Staff bypass.';

REVOKE EXECUTE ON FUNCTION public.get_general_exam_review(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_general_exam_review(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 13) Staff reset: delete one student's attempt (e.g. timer incident).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_general_exam_attempt(p_exam_id uuid, p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempt_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.exams
        WHERE id = p_exam_id AND deleted_at IS NULL
          AND lesson_id IS NULL AND grade_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;

    SELECT id INTO v_attempt_id FROM public.exam_attempts
    WHERE exam_id = p_exam_id AND student_id = p_student_id;
    IF v_attempt_id IS NULL THEN
        RAISE EXCEPTION 'attempt_not_found';
    END IF;

    DELETE FROM public.exam_answers WHERE attempt_id = v_attempt_id;
    DELETE FROM public.exam_attempts WHERE id = v_attempt_id;

    PERFORM public.audit_log('general_exam.attempt_reset', 'exam_attempts', v_attempt_id,
        jsonb_build_object('exam_id', p_exam_id, 'student_id', p_student_id));
END $$;

COMMENT ON FUNCTION public.reset_general_exam_attempt(uuid, uuid) IS 'Staff-only: wipe one student attempt (answers + attempt) so they can retake, e.g. after a timer incident. Audited.';

REVOKE EXECUTE ON FUNCTION public.reset_general_exam_attempt(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reset_general_exam_attempt(uuid, uuid) TO authenticated;
