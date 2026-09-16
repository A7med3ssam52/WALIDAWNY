-- =====================================================================
-- 0072_lesson17_progress_fixes
-- Lesson-17 progress hardening: unified completion definition + presence fixes.
--
-- سياسة الإكمال الموحدة (documented, enforced here + frontend):
--   مكتمل = progress.is_completed = true.
--   - تلقائي (auto): upsert_progress يضع is_completed عند percent >= 90.
--   - يدوي (manual): toggle_lesson_completed(p_completed=true) يضع 100%.
--   - امتحان (exam): toggle_lesson_completed(..., 'exam') بعد تسليم ناجح.
--   - PDF/سبورة: engagement فقط (upsert بحد أدنى 10%) ولا يُكمل تلقائياً.
--   - الفك (p_completed=false): يخفض percent إلى LEAST(percent, 89) ويمسح
--     completed_at حتى لا يعيد upsert التلقائي الإكمال فوراً (GREATEST).
--   - completed_at هو الطابع الحقيقي للإكمال (وليس last_watched_at)،
--     وcompleted_by in ('auto','manual','exam').
--
-- Fixes covered:
--  (5) uncomplete lowers percent + real completed_at
--  (7) position uses GREATEST(old,new)
--  (8) touch_presence: page_view only on real change + clear lesson on leave
--  (9) presence permissions include mr_walid/teacher/assistant
--  (11) unified completed + completed_at in counters
--  (12) v_online_students excludes is_visible=false (idle)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) progress.completed_at / completed_by
-- ---------------------------------------------------------------------
ALTER TABLE public.progress
    ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;
ALTER TABLE public.progress
    ADD COLUMN IF NOT EXISTS completed_by text NULL
    CHECK (completed_by IS NULL OR completed_by IN ('auto', 'manual', 'exam'));

-- Backfill: completed rows get completed_at from last_watched_at/updated_at.
UPDATE public.progress
SET completed_at = COALESCE(last_watched_at, updated_at, now()),
    completed_by = COALESCE(completed_by, 'auto')
WHERE is_completed = true AND completed_at IS NULL;

COMMENT ON COLUMN public.progress.completed_at IS 'Real completion timestamp (unified definition). Set when is_completed flips false->true, cleared on uncomplete. Counters use this, never last_watched_at.';
COMMENT ON COLUMN public.progress.completed_by IS 'Completion source: auto (>=90% via upsert), manual (toggle button), exam (successful submit).';

CREATE INDEX IF NOT EXISTS idx_progress_completed_at
    ON public.progress (completed_at DESC) WHERE is_completed = true;

-- ---------------------------------------------------------------------
-- 2) upsert_progress: GREATEST position + completed_at/completed_by,
--    respects manual uncomplete (percent was lowered < 90 on unmark).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_progress(
    p_lesson_id uuid,
    p_position_seconds integer DEFAULT 0,
    p_percent numeric DEFAULT 0
)
RETURNS public.progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student uuid := auth.uid();
    v_video uuid;
    v_pos int := GREATEST(0, COALESCE(p_position_seconds, 0));
    v_pct numeric(5,2) := LEAST(100, GREATEST(0, COALESCE(p_percent, 0)));
    v_result public.progress%ROWTYPE;
    v_was_completed boolean;
BEGIN
    IF NOT public.is_student() OR NOT public.can_access_lesson(p_lesson_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT id INTO v_video
    FROM public.lesson_videos
    WHERE lesson_id = p_lesson_id
      AND is_primary AND deleted_at IS NULL AND status = 'ready'
    ORDER BY sort_order, id
    LIMIT 1;

    IF v_video IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.progress
            WHERE student_id = v_student
              AND lesson_id = p_lesson_id
              AND video_id IS NOT NULL
              AND video_id <> v_video
        ) THEN
            RAISE EXCEPTION 'progress_stale_video';
        END IF;
    END IF;

    SELECT is_completed INTO v_was_completed
    FROM public.progress
    WHERE student_id = v_student AND lesson_id = p_lesson_id;

    INSERT INTO public.progress AS p (
        student_id, lesson_id, video_id, position_seconds,
        percent_completed, is_completed, last_watched_at,
        completed_at, completed_by
    )
    VALUES (
        v_student, p_lesson_id, v_video, v_pos, v_pct,
        v_pct >= 90, now(),
        CASE WHEN v_pct >= 90 THEN now() ELSE NULL END,
        CASE WHEN v_pct >= 90 THEN 'auto' ELSE NULL END
    )
    ON CONFLICT (student_id, lesson_id) DO UPDATE
    SET position_seconds = GREATEST(p.position_seconds, v_pos),
        percent_completed = GREATEST(p.percent_completed, v_pct),
        is_completed = p.is_completed OR GREATEST(p.percent_completed, v_pct) >= 90,
        video_id = CASE
                       WHEN v_video IS NULL THEN p.video_id
                       ELSE v_video
                   END,
        last_watched_at = now(),
        completed_at = CASE
            WHEN (p.is_completed OR GREATEST(p.percent_completed, v_pct) >= 90)
                 AND p.completed_at IS NULL THEN now()
            ELSE p.completed_at
        END,
        completed_by = CASE
            WHEN (p.is_completed OR GREATEST(p.percent_completed, v_pct) >= 90)
                 AND p.completed_by IS NULL THEN 'auto'
            ELSE p.completed_by
        END
    RETURNING * INTO v_result;

    RETURN v_result;
END $$;

COMMENT ON FUNCTION public.upsert_progress(uuid, integer, numeric) IS '072: position GREATEST(old,new); auto-complete at >=90 sets completed_at/completed_by=auto; respects manual uncomplete (percent lowered <90 on toggle false).';

-- ---------------------------------------------------------------------
-- 3) toggle_lesson_completed: optional p_source ('manual'|'exam'),
--    unmark lowers percent below 90 + clears completed_at.
--    Keep 2-arg signature working via default.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.toggle_lesson_completed(uuid, boolean);

CREATE OR REPLACE FUNCTION public.toggle_lesson_completed(
    p_lesson_id uuid,
    p_completed boolean,
    p_source text DEFAULT 'manual'
)
RETURNS public.progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student uuid := auth.uid();
    v_video uuid;
    v_existing public.progress%ROWTYPE;
    v_result public.progress%ROWTYPE;
    v_pos int := 0;
    v_pct numeric(5,2) := 0;
    v_src text := 'manual';
BEGIN
    IF NOT public.is_student() OR NOT public.can_access_lesson(p_lesson_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF p_source IS NOT NULL AND p_source IN ('manual', 'exam') THEN
        v_src := p_source;
    END IF;
    -- auto is reserved for upsert_progress only
    IF v_src = 'auto' THEN
        v_src := 'manual';
    END IF;

    SELECT id INTO v_video
    FROM public.lesson_videos
    WHERE lesson_id = p_lesson_id
      AND is_primary AND deleted_at IS NULL AND status = 'ready'
    ORDER BY sort_order, id
    LIMIT 1;

    IF v_video IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.progress
            WHERE student_id = v_student
              AND lesson_id = p_lesson_id
              AND video_id IS NOT NULL
              AND video_id <> v_video
        ) THEN
            RAISE EXCEPTION 'progress_stale_video';
        END IF;
    END IF;

    SELECT * INTO v_existing
    FROM public.progress
    WHERE student_id = v_student AND lesson_id = p_lesson_id;

    IF p_completed THEN
        v_pct := 100;
        v_pos := COALESCE(v_existing.position_seconds, 0);

        INSERT INTO public.progress AS p (
            student_id, lesson_id, video_id, position_seconds,
            percent_completed, is_completed, last_watched_at,
            completed_at, completed_by
        )
        VALUES (
            v_student, p_lesson_id, COALESCE(v_video, v_existing.video_id), v_pos, v_pct,
            true, now(), now(), v_src
        )
        ON CONFLICT (student_id, lesson_id) DO UPDATE
        SET percent_completed = 100,
            is_completed = true,
            position_seconds = GREATEST(p.position_seconds, EXCLUDED.position_seconds),
            video_id = COALESCE(EXCLUDED.video_id, p.video_id, v_video),
            last_watched_at = now(),
            completed_at = COALESCE(p.completed_at, now()),
            completed_by = v_src
        RETURNING * INTO v_result;

        PERFORM public.audit_log('progress.manual_complete', 'progress', v_result.id,
            jsonb_build_object('lesson_id', p_lesson_id, 'completed', true, 'source', v_src));
    ELSE
        IF v_existing.id IS NULL THEN
            INSERT INTO public.progress (
                student_id, lesson_id, video_id, position_seconds,
                percent_completed, is_completed, last_watched_at,
                completed_at, completed_by
            )
            VALUES (
                v_student, p_lesson_id, v_video, 0, 0, false, now(), NULL, NULL
            )
            RETURNING * INTO v_result;
        ELSE
            -- Unmark: is_completed=false + percent lowered below 90 so the
            -- monotonic auto path does NOT instantly re-complete, +
            -- completed_at/completed_by cleared. Position is kept.
            UPDATE public.progress
            SET is_completed = false,
                percent_completed = LEAST(percent_completed, 89),
                completed_at = NULL,
                completed_by = NULL,
                last_watched_at = now()
            WHERE student_id = v_student AND lesson_id = p_lesson_id
            RETURNING * INTO v_result;
        END IF;

        PERFORM public.audit_log('progress.manual_uncomplete', 'progress', v_result.id,
            jsonb_build_object('lesson_id', p_lesson_id, 'completed', false));
    END IF;

    RETURN v_result;
END $$;

COMMENT ON FUNCTION public.toggle_lesson_completed(uuid, boolean, text) IS '072: manual/exam completion toggle. Complete sets 100% + completed_at/now + source. Unmark lowers percent to <=89 + clears completed_at so auto upsert does not instantly re-complete.';

REVOKE EXECUTE ON FUNCTION public.toggle_lesson_completed(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_lesson_completed(uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) v_online_students: exclude hidden tabs (is_visible=false = idle).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_online_students AS
SELECT s.id AS session_id,
       s.student_id,
       s.started_at,
       s.last_seen_at,
       s.current_path,
       s.current_lesson_id,
       s.is_visible,
       s.ip_address,
       p.full_name,
       p.phone,
       p.grade_id,
       g.name AS grade_name,
       l.title AS lesson_title,
       EXTRACT(EPOCH FROM (now() - s.started_at))/60 AS minutes_online,
       EXTRACT(EPOCH FROM (now() - s.last_seen_at)) AS seconds_since_seen
FROM public.student_sessions s
JOIN public.profiles p ON p.id = s.student_id
LEFT JOIN public.grades g ON g.id = p.grade_id
LEFT JOIN public.lessons l ON l.id = s.current_lesson_id
WHERE s.ended_at IS NULL
  AND s.last_seen_at > now() - interval '2 minutes'
  AND s.is_visible = true
  AND p.deleted_at IS NULL
  AND p.status = 'active'
  AND p.role = 'student';

COMMENT ON VIEW public.v_online_students IS '072: online = open session + seen <2m + is_visible=true (hidden tabs are idle, excluded).';

REVOKE ALL ON public.v_online_students FROM PUBLIC;
REVOKE ALL ON public.v_online_students FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) touch_presence: page_view only on real change + clear lesson on leave.
--    - Rate-limit unchanged (15s) but event log now fires ONLY when
--      path/lesson/visibility actually changed or on closing.
--    - When p_path is supplied AND differs from current_path, overwrite
--      current_lesson_id with p_lesson_id (NULL clears it = left lesson).
--      When path is unchanged, keep COALESCE (interval heartbeat).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_presence(
    p_path text DEFAULT NULL,
    p_lesson_id uuid DEFAULT NULL,
    p_is_visible boolean DEFAULT true,
    p_closing boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_sid uuid;
    v_last_seen timestamptz;
    v_cur_path text;
    v_cur_lesson uuid;
    v_cur_visible boolean;
    v_ip text;
    v_ua text;
    v_path_changed boolean := false;
    v_lesson_changed boolean := false;
    v_vis_changed boolean := false;
BEGIN
    IF v_uid IS NULL OR NOT public.is_student() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF p_lesson_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.lessons WHERE id = p_lesson_id AND deleted_at IS NULL) THEN
            p_lesson_id := NULL;
        END IF;
    END IF;

    IF p_path IS NOT NULL THEN
        p_path := left(btrim(p_path), 500);
        IF p_path = '' THEN p_path := NULL; END IF;
    END IF;

    BEGIN
        v_ip := NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
        IF v_ip IS NOT NULL AND position(',' in v_ip) > 0 THEN
            v_ip := btrim(split_part(v_ip, ',', 1));
        END IF;
        v_ip := left(v_ip, 45);
    EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;

    BEGIN
        v_ua := NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'user-agent';
        v_ua := left(v_ua, 500);
    EXCEPTION WHEN OTHERS THEN v_ua := NULL; END;

    SELECT id, last_seen_at, current_path, current_lesson_id, is_visible
      INTO v_sid, v_last_seen, v_cur_path, v_cur_lesson, v_cur_visible
    FROM public.student_sessions
    WHERE student_id = v_uid AND ended_at IS NULL
    ORDER BY started_at DESC LIMIT 1;

    IF v_sid IS NOT NULL THEN
        v_path_changed := p_path IS DISTINCT FROM v_cur_path;
        v_lesson_changed := p_lesson_id IS DISTINCT FROM v_cur_lesson;
        v_vis_changed := p_is_visible IS DISTINCT FROM v_cur_visible;

        IF NOT p_closing AND v_last_seen > now() - interval '15 seconds' THEN
            IF v_path_changed OR v_lesson_changed OR v_vis_changed THEN
                NULL;
            ELSE
                RETURN jsonb_build_object('session_id', v_sid, 'throttled', true);
            END IF;
        END IF;

        IF p_closing THEN
            UPDATE public.student_sessions
            SET last_seen_at = now(),
                ended_at = now(),
                current_path = COALESCE(p_path, current_path),
                -- on close with explicit path, allow clearing stale lesson
                current_lesson_id = CASE
                    WHEN p_path IS NOT NULL THEN p_lesson_id
                    ELSE COALESCE(p_lesson_id, current_lesson_id)
                END,
                is_visible = p_is_visible,
                ip_address = COALESCE(v_ip, ip_address),
                user_agent = COALESCE(v_ua, user_agent)
            WHERE id = v_sid;
        ELSE
            UPDATE public.student_sessions
            SET last_seen_at = now(),
                current_path = COALESCE(p_path, current_path),
                -- path changed => authoritative lesson (NULL clears when
                -- the student navigated away from the lesson page);
                -- same path => keep existing unless a lesson was given.
                current_lesson_id = CASE
                    WHEN p_path IS NOT NULL AND p_path IS DISTINCT FROM current_path THEN p_lesson_id
                    ELSE COALESCE(p_lesson_id, current_lesson_id)
                END,
                is_visible = p_is_visible,
                ip_address = COALESCE(v_ip, ip_address),
                user_agent = COALESCE(v_ua, user_agent)
            WHERE id = v_sid;
        END IF;

        -- Event log ONLY on real change or closing (no per-heartbeat spam).
        IF p_closing OR v_path_changed OR v_lesson_changed OR v_vis_changed THEN
            INSERT INTO public.student_activity_events (student_id, session_id, event_type, path, lesson_id, metadata)
            VALUES (v_uid, v_sid,
                    CASE WHEN p_closing THEN 'heartbeat' ELSE 'page_view' END,
                    COALESCE(p_path, v_cur_path), COALESCE(p_lesson_id, v_cur_lesson),
                    jsonb_build_object('is_visible', p_is_visible, 'closing', p_closing));
        END IF;

        RETURN jsonb_build_object('session_id', v_sid, 'throttled', false);
    ELSE
        IF p_closing THEN
            RETURN jsonb_build_object('session_id', NULL, 'throttled', false);
        END IF;

        INSERT INTO public.student_sessions (student_id, current_path, current_lesson_id, is_visible, ip_address, user_agent)
        VALUES (v_uid, p_path, p_lesson_id, p_is_visible, v_ip, v_ua)
        RETURNING id INTO v_sid;

        INSERT INTO public.student_activity_events (student_id, session_id, event_type, path, lesson_id, metadata)
        VALUES (v_uid, v_sid, 'page_view', p_path, p_lesson_id, jsonb_build_object('is_visible', p_is_visible));

        RETURN jsonb_build_object('session_id', v_sid, 'throttled', false);
    END IF;
END $$;

COMMENT ON FUNCTION public.touch_presence(text, uuid, boolean, boolean) IS '072: page_view logged only on real path/lesson/visibility change; navigating away (path change + NULL lesson) clears current_lesson_id.';

-- ---------------------------------------------------------------------
-- 6) Presence read permissions: admin + mr_walid + teacher + assistant.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_online_students()
RETURNS SETOF public.v_online_students
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;
    RETURN QUERY SELECT * FROM public.v_online_students ORDER BY last_seen_at DESC;
END $$;

COMMENT ON FUNCTION public.get_online_students() IS '072: staff-visible (admin/mr_walid/teacher/assistant): currently online students.';

CREATE OR REPLACE FUNCTION public.get_student_presence_history(
    p_student_id uuid,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    student_id uuid,
    started_at timestamptz,
    last_seen_at timestamptz,
    ended_at timestamptz,
    duration_seconds integer,
    current_path text,
    current_lesson_id uuid,
    is_visible boolean,
    ip_address text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = p_student_id) THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    RETURN QUERY
    SELECT s.id, s.student_id, s.started_at, s.last_seen_at, s.ended_at,
           (EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at)))::integer AS duration_seconds,
           s.current_path, s.current_lesson_id, s.is_visible, s.ip_address
    FROM public.student_sessions s
    WHERE s.student_id = p_student_id
      AND (p_from IS NULL OR s.started_at >= p_from)
      AND (p_to IS NULL OR s.started_at <= p_to)
    ORDER BY s.started_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END $$;

CREATE OR REPLACE FUNCTION public.get_most_active_students(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_limit integer DEFAULT 20
)
RETURNS TABLE (
    student_id uuid,
    full_name text,
    phone text,
    grade_name text,
    total_sessions bigint,
    total_seconds bigint,
    total_hours numeric,
    last_seen_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    RETURN QUERY
    SELECT p.id AS student_id,
           p.full_name,
           p.phone,
           g.name AS grade_name,
           COUNT(s.id)::bigint AS total_sessions,
           COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at)))::bigint, 0) AS total_seconds,
           COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at)))/3600, 2), 0) AS total_hours,
           MAX(s.last_seen_at) AS last_seen_at
    FROM public.profiles p
    LEFT JOIN public.student_sessions s
           ON s.student_id = p.id
          AND (p_from IS NULL OR s.started_at >= p_from)
          AND (p_to IS NULL OR s.started_at <= p_to)
    LEFT JOIN public.grades g ON g.id = p.grade_id
    WHERE p.role = 'student' AND p.deleted_at IS NULL
    GROUP BY p.id, p.full_name, p.phone, g.name
    HAVING COUNT(s.id) > 0
    ORDER BY total_seconds DESC, total_sessions DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
END $$;

-- RLS: let staff roles read sessions/events directly too (defense in depth;
-- primary access stays via RPCs above).
DROP POLICY IF EXISTS student_sessions_select_own_or_admin ON public.student_sessions;
CREATE POLICY student_sessions_select_own_or_admin ON public.student_sessions
    FOR SELECT USING (
        student_id = auth.uid()
        OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
    );

DROP POLICY IF EXISTS student_activity_events_select_own_or_admin ON public.student_activity_events;
CREATE POLICY student_activity_events_select_own_or_admin ON public.student_activity_events
    FOR SELECT USING (
        student_id = auth.uid()
        OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()
    );

-- ---------------------------------------------------------------------
-- 7) Unified completion counters: use completed_at (never last_watched_at).
--    recent_completions + daily_completions rebuilt on completed_at.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stats jsonb;
    v_total_students int;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT count(*) INTO v_total_students FROM public.profiles WHERE deleted_at IS NULL AND role = 'student';

    SELECT jsonb_build_object(
        'students', jsonb_build_object(
            'total',        (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND role = 'student'),
            'active',       (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'active' AND role = 'student'),
            'disabled',     (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'disabled' AND role = 'student'),
            'deleted',      (SELECT count(*) FROM public.profiles WHERE deleted_at IS NOT NULL AND role = 'student'),
            'new_this_month', (SELECT count(*) FROM public.profiles
                               WHERE deleted_at IS NULL AND role = 'student' AND created_at >= date_trunc('month', now()))
        ),
        'purchases', jsonb_build_object(
            'total',                    (SELECT count(*) FROM public.unit_purchases WHERE status = 'active'),
            'staff_revenue_this_month', (SELECT COALESCE(sum(base_price), 0) FROM public.unit_purchases
                                         WHERE status = 'active' AND purchased_at >= date_trunc('month', now())),
            'platform_fee_total',       (SELECT COALESCE(sum(platform_fee), 0) FROM public.unit_purchases
                                         WHERE status = 'active')
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
            'avg_percent',            (SELECT COALESCE(round(avg(percent_completed), 2), 0) FROM public.progress),
            'participation_rate',     (SELECT CASE WHEN v_total_students = 0 THEN 0 ELSE round((count(DISTINCT student_id)::numeric / v_total_students * 100), 1) END FROM public.progress),
            'completion_rate',        (SELECT CASE WHEN count(*) = 0 THEN 0 ELSE round((count(*) FILTER (WHERE is_completed)::numeric / count(*) * 100), 1) END FROM public.progress),
            'active_last_7d',         (SELECT count(DISTINCT student_id) FROM public.progress WHERE last_watched_at >= now() - interval '7 days'),
            'inactive_students',      (SELECT count(*) FROM public.profiles p WHERE p.role='student' AND p.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM public.progress pr WHERE pr.student_id=p.id)),
            'distribution', jsonb_build_object(
                'q1', (SELECT count(*) FROM public.progress WHERE percent_completed >= 0 AND percent_completed < 25),
                'q2', (SELECT count(*) FROM public.progress WHERE percent_completed >= 25 AND percent_completed < 50),
                'q3', (SELECT count(*) FROM public.progress WHERE percent_completed >= 50 AND percent_completed < 75),
                'q4', (SELECT count(*) FROM public.progress WHERE percent_completed >= 75 AND percent_completed <= 100)
            )
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
                LEFT JOIN public.profiles p
                       ON p.grade_id = g.id AND p.deleted_at IS NULL AND p.role = 'student'
                LEFT JOIN public.unit_purchases up
                       ON up.student_id = p.id AND up.status = 'active'
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
                SELECT u.name AS unit_name,
                       count(DISTINCT up.id) AS purchases,
                       COALESCE(sum(up.total_price), 0) AS revenue
                FROM public.unit_purchases up
                JOIN public.units u ON u.id = up.unit_id
                WHERE up.status = 'active'
                GROUP BY u.id, u.name
                ORDER BY revenue DESC
                LIMIT 5
            ) r
        ), '[]'::jsonb),
        'recent_purchases', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', p.full_name,
                'grade_name', g.name,
                'unit_name', u.name,
                'total_price', up.total_price,
                'purchased_at', up.purchased_at
            ) ORDER BY up.purchased_at DESC)
            FROM public.unit_purchases up
            JOIN public.profiles p ON p.id = up.student_id
            JOIN public.units u ON u.id = up.unit_id
            JOIN public.grades g ON g.id = u.grade_id
            WHERE up.status = 'active'
            LIMIT 5
        ), '[]'::jsonb),
        -- 072: unified definition - is_completed is the flag, completed_at
        -- (COALESCE to last_watched_at for pre-072 rows) is the timestamp.
        'recent_completions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', r.student_name,
                'lesson_title', r.lesson_title,
                'unit_name', r.unit_name,
                'completed_at', r.completed_at
            ) ORDER BY r.completed_at DESC)
            FROM (
                SELECT p.full_name AS student_name,
                       l.title AS lesson_title,
                       u.name AS unit_name,
                       COALESCE(pr.completed_at, pr.last_watched_at) AS completed_at
                FROM public.progress pr
                JOIN public.profiles p ON p.id = pr.student_id
                JOIN public.lessons l ON l.id = pr.lesson_id
                JOIN public.units u ON u.id = l.unit_id
                WHERE pr.is_completed = true
                ORDER BY 4 DESC
                LIMIT 5
            ) r
        ), '[]'::jsonb),
        'top_active', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_id', r.student_id,
                'full_name', r.full_name,
                'grade_name', r.grade_name,
                'completed_lessons', r.completed_lessons,
                'avg_percent', r.avg_percent,
                'total_lessons', r.total_lessons
            ) ORDER BY r.completed_lessons DESC, r.avg_percent DESC)
            FROM (
                SELECT pr.student_id,
                       p.full_name,
                       g.name AS grade_name,
                       count(*) FILTER (WHERE pr.is_completed) AS completed_lessons,
                       round(avg(pr.percent_completed), 1) AS avg_percent,
                       count(*) AS total_lessons
                FROM public.progress pr
                JOIN public.profiles p ON p.id = pr.student_id
                LEFT JOIN public.grades g ON g.id = p.grade_id
                WHERE p.deleted_at IS NULL AND p.role='student'
                GROUP BY pr.student_id, p.full_name, g.name
                ORDER BY count(*) FILTER (WHERE pr.is_completed) DESC, avg(pr.percent_completed) DESC
                LIMIT 5
            ) r
        ), '[]'::jsonb),
        'daily_completions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'day', r.day,
                'count', r.count
            ) ORDER BY r.day ASC)
            FROM (
                SELECT (COALESCE(pr.completed_at, pr.last_watched_at)::date)::text AS day,
                       count(*) AS count
                FROM public.progress pr
                WHERE pr.is_completed = true
                  AND COALESCE(pr.completed_at, pr.last_watched_at) >= CURRENT_DATE - 6
                GROUP BY 1
                ORDER BY day ASC
            ) r
        ), '[]'::jsonb)
    ) INTO v_stats;

    RETURN v_stats;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

COMMENT ON FUNCTION public.get_dashboard_stats() IS '072: completion counters unified on is_completed + completed_at (COALESCE last_watched_at pre-072); staff includes assistant.';
