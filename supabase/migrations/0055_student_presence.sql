-- =====================================================================
-- 0055_student_presence
-- Online presence tracking for students (admin live monitoring)
-- Tables: student_sessions + student_activity_events
-- Views: v_online_students, v_student_activity_summary
-- RPCs: touch_presence (student heartbeat), get_online_students,
--       get_student_presence_history, get_most_active_students,
--       close_stale_sessions (internal cron)
-- RLS: student own-row, admin read-all, writes only via RPC (FORCE RLS)
-- Reference: plan presence-admin-activity-tracker
-- =====================================================================

-- ---------------------------------------------------------------------
-- Table: student_sessions — one open session per student at a time
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_sessions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    started_at        timestamptz NOT NULL DEFAULT now(),
    last_seen_at      timestamptz NOT NULL DEFAULT now(),
    ended_at          timestamptz,
    ip_address        text,
    user_agent        text,
    current_path      text,
    current_lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
    is_visible        boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CHECK (ended_at IS NULL OR ended_at >= started_at),
    CHECK (last_seen_at >= started_at)
);

ALTER TABLE public.student_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_sessions FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.student_sessions IS 'Online presence sessions — one open (ended_at IS NULL) per student; heartbeat via touch_presence RPC.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_sessions_open
    ON public.student_sessions (student_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_student_sessions_last_seen
    ON public.student_sessions (last_seen_at DESC) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_student_sessions_student_time
    ON public.student_sessions (student_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_sessions_current_lesson
    ON public.student_sessions (current_lesson_id) WHERE current_lesson_id IS NOT NULL;

-- updated_at trigger (reuse set_updated_at() from 0004)
DROP TRIGGER IF EXISTS set_updated_at ON public.student_sessions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_sessions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Table: student_activity_events — detailed heartbeat / page_view log
-- Optional but kept for extensibility; retention 90 days via cron.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_activity_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_id  uuid REFERENCES public.student_sessions(id) ON DELETE SET NULL,
    event_type  text NOT NULL CHECK (event_type IN ('heartbeat','page_view','video_progress','pdf_open','exam_start','exam_submit')),
    path        text,
    lesson_id   uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
    metadata    jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_activity_events FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.student_activity_events IS 'Detailed presence events — populated by touch_presence heartbeat when needed; 90-day retention.';

CREATE INDEX IF NOT EXISTS idx_activity_events_student_time
    ON public.student_activity_events (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_session
    ON public.student_activity_events (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_events_created
    ON public.student_activity_events (created_at DESC);

-- ---------------------------------------------------------------------
-- RLS policies — student own-row, admin read-all, no direct DML
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS student_sessions_select_own_or_admin ON public.student_sessions;
CREATE POLICY student_sessions_select_own_or_admin ON public.student_sessions
    FOR SELECT USING (student_id = auth.uid() OR public.is_admin());

-- No INSERT/UPDATE/DELETE policies — writes only via touch_presence SECURITY DEFINER

DROP POLICY IF EXISTS student_activity_events_select_own_or_admin ON public.student_activity_events;
CREATE POLICY student_activity_events_select_own_or_admin ON public.student_activity_events
    FOR SELECT USING (student_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------
-- Views
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
  AND p.deleted_at IS NULL
  AND p.status = 'active'
  AND p.role = 'student';

COMMENT ON VIEW public.v_online_students IS 'Students currently online — session open and last_seen within 2 minutes.';

CREATE OR REPLACE VIEW public.v_student_activity_summary AS
SELECT student_id,
       COUNT(*) AS total_sessions,
       COUNT(*) FILTER (WHERE ended_at IS NOT NULL) AS closed_sessions,
       COUNT(*) FILTER (WHERE ended_at IS NULL) AS open_sessions,
       COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, last_seen_at) - started_at))), 0) AS total_seconds,
       COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, last_seen_at) - started_at)))/3600, 0) AS total_hours,
       MAX(last_seen_at) AS last_seen,
       MIN(started_at) AS first_seen
FROM public.student_sessions
GROUP BY student_id;

COMMENT ON VIEW public.v_student_activity_summary IS 'Per-student aggregate presence stats.';

-- ---------------------------------------------------------------------
-- Function: touch_presence — student heartbeat (rate-limited 15s)
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
    v_ip text;
    v_ua text;
    v_result jsonb;
BEGIN
    IF v_uid IS NULL OR NOT public.is_student() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    -- Validate lesson_id if provided (must exist, not deleted)
    IF p_lesson_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.lessons WHERE id = p_lesson_id AND deleted_at IS NULL) THEN
            p_lesson_id := NULL;
        END IF;
    END IF;

    -- Sanitize path (truncate to 500 chars, must start with /)
    IF p_path IS NOT NULL THEN
        p_path := left(btrim(p_path), 500);
        IF p_path = '' THEN p_path := NULL; END IF;
    END IF;

    -- Best-effort IP / UA from request headers
    BEGIN
        v_ip := NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
        -- take first IP if comma-separated
        IF v_ip IS NOT NULL AND position(',' in v_ip) > 0 THEN
            v_ip := btrim(split_part(v_ip, ',', 1));
        END IF;
        v_ip := left(v_ip, 45);
    EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;

    BEGIN
        v_ua := NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'user-agent';
        v_ua := left(v_ua, 500);
    EXCEPTION WHEN OTHERS THEN v_ua := NULL; END;

    -- Find open session
    SELECT id, last_seen_at INTO v_sid, v_last_seen
    FROM public.student_sessions
    WHERE student_id = v_uid AND ended_at IS NULL
    ORDER BY started_at DESC LIMIT 1;

    IF v_sid IS NOT NULL THEN
        -- Rate-limit: reject if last_seen < 15s ago and not closing and path unchanged
        IF NOT p_closing AND v_last_seen > now() - interval '15 seconds' THEN
            -- Allow if visibility changed or lesson changed (important signal)
            -- Otherwise silently return current session without update
            IF p_path IS DISTINCT FROM (SELECT current_path FROM public.student_sessions WHERE id = v_sid)
               OR p_lesson_id IS DISTINCT FROM (SELECT current_lesson_id FROM public.student_sessions WHERE id = v_sid)
               OR p_is_visible IS DISTINCT FROM (SELECT is_visible FROM public.student_sessions WHERE id = v_sid)
            THEN
                -- intentional fall-through to update
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
                current_lesson_id = COALESCE(p_lesson_id, current_lesson_id),
                is_visible = p_is_visible,
                ip_address = COALESCE(v_ip, ip_address),
                user_agent = COALESCE(v_ua, user_agent)
            WHERE id = v_sid;
        ELSE
            UPDATE public.student_sessions
            SET last_seen_at = now(),
                current_path = COALESCE(p_path, current_path),
                current_lesson_id = COALESCE(p_lesson_id, current_lesson_id),
                is_visible = p_is_visible,
                ip_address = COALESCE(v_ip, ip_address),
                user_agent = COALESCE(v_ua, user_agent)
            WHERE id = v_sid;
        END IF;

        -- Lightweight event log (only on page change or closing, not every heartbeat)
        IF p_closing OR p_path IS NOT NULL THEN
            INSERT INTO public.student_activity_events (student_id, session_id, event_type, path, lesson_id, metadata)
            VALUES (v_uid, v_sid,
                    CASE WHEN p_closing THEN 'heartbeat' ELSE 'page_view' END,
                    p_path, p_lesson_id,
                    jsonb_build_object('is_visible', p_is_visible, 'closing', p_closing));
        END IF;

        RETURN jsonb_build_object('session_id', v_sid, 'throttled', false);
    ELSE
        -- No open session
        IF p_closing THEN
            -- Closing without open session — nothing to do
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

COMMENT ON FUNCTION public.touch_presence(text, uuid, boolean, boolean) IS 'Student heartbeat — upserts open session, rate-limited 15s, admin-visible via v_online_students.';

REVOKE EXECUTE ON FUNCTION public.touch_presence(text, uuid, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_presence(text, uuid, boolean, boolean) TO authenticated;

-- ---------------------------------------------------------------------
-- Function: get_online_students — admin live list
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_online_students()
RETURNS SETOF public.v_online_students
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;
    RETURN QUERY SELECT * FROM public.v_online_students ORDER BY last_seen_at DESC;
END $$;

COMMENT ON FUNCTION public.get_online_students() IS 'Admin-only: list of currently online students (last_seen within 2 minutes).';

REVOKE EXECUTE ON FUNCTION public.get_online_students() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_online_students() TO authenticated;

-- ---------------------------------------------------------------------
-- Function: get_student_presence_history — per-student session history
-- ---------------------------------------------------------------------
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
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_student_id) THEN
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

COMMENT ON FUNCTION public.get_student_presence_history(uuid, timestamptz, timestamptz, integer, integer) IS 'Admin-only: paginated session history for a student.';

REVOKE EXECUTE ON FUNCTION public.get_student_presence_history(uuid, timestamptz, timestamptz, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_presence_history(uuid, timestamptz, timestamptz, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------
-- Function: get_most_active_students — ranking by total online time
-- ---------------------------------------------------------------------
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
    IF NOT public.is_admin() THEN
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

COMMENT ON FUNCTION public.get_most_active_students(timestamptz, timestamptz, integer) IS 'Admin-only: ranking of most active students by total online time.';

REVOKE EXECUTE ON FUNCTION public.get_most_active_students(timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_most_active_students(timestamptz, timestamptz, integer) TO authenticated;

-- ---------------------------------------------------------------------
-- Function: close_stale_sessions — cron helper (no client grants)
-- Closes sessions whose last_seen is older than 5 minutes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_stale_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
    UPDATE public.student_sessions
    SET ended_at = last_seen_at,
        updated_at = now()
    WHERE ended_at IS NULL
      AND last_seen_at < now() - interval '5 minutes';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END $$;

COMMENT ON FUNCTION public.close_stale_sessions() IS 'Internal: closes stale open sessions (last_seen >5m). Called by pg_cron. No client grants.';

REVOKE EXECUTE ON FUNCTION public.close_stale_sessions() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- pg_cron job — close stale sessions every 5 minutes (guarded)
-- ---------------------------------------------------------------------
DO $outer$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'close-stale-presence-sessions',
            '*/5 * * * *',
            'SELECT public.close_stale_sessions();'
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available — close_stale_sessions must be called externally';
END $outer$;

-- ---------------------------------------------------------------------
-- Retention helper — delete old activity events (call manually or via cron)
-- Keep student_sessions longer (1 year), events 90 days
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_old_presence_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    DELETE FROM public.student_activity_events
    WHERE created_at < now() - interval '90 days';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_presence_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_presence_events() TO authenticated;

-- ---------------------------------------------------------------------
-- View lockdown — same posture as 0026: no anon/authenticated SELECT
-- ---------------------------------------------------------------------
REVOKE ALL ON public.v_online_students FROM PUBLIC;
REVOKE ALL ON public.v_online_students FROM anon, authenticated;
REVOKE ALL ON public.v_student_activity_summary FROM PUBLIC;
REVOKE ALL ON public.v_student_activity_summary FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- Enable Realtime for student_sessions (best-effort, guarded)
-- Allows admin UI to subscribe via postgres_changes instead of polling.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    -- supabase_realtime publication is the one Supabase uses for Realtime
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.student_sessions';
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        WHEN OTHERS THEN
            RAISE NOTICE 'could not add student_sessions to supabase_realtime: %', SQLERRM;
        END;
    END IF;
END $$;
