-- =====================================================================
-- 0056_presence_daily
-- Daily/period presence reporting — students active during a day/period
-- Fixes get_most_active_students to use overlapping interval (not just
-- started_at) and adds daily RPCs for admin سجل الحضور اليومي.
-- RPCs:
--   get_daily_active_students(p_date, p_limit, p_offset)
--   get_presence_daily_counts(p_from, p_to)
-- Reference: presence daily history — اليوم + الأيام السابقة
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fix get_most_active_students — use overlapping interval
-- Previously filtered only by s.started_at BETWEEN p_from AND p_to,
-- which missed sessions that started before p_from but were still active
-- during the period.
-- Now counts any session that OVERLAPS [p_from, p_to].
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
           COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at))::bigint), 0)::bigint AS total_seconds,
           COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at)))/3600, 2), 0) AS total_hours,
           MAX(s.last_seen_at) AS last_seen_at
    FROM public.profiles p
    LEFT JOIN public.student_sessions s
           ON s.student_id = p.id
          AND (p_from IS NULL OR COALESCE(s.ended_at, s.last_seen_at) >= p_from)
          AND (p_to IS NULL OR s.started_at <= p_to)
    LEFT JOIN public.grades g ON g.id = p.grade_id
    WHERE p.role = 'student' AND p.deleted_at IS NULL
    GROUP BY p.id, p.full_name, p.phone, g.name
    HAVING COUNT(s.id) > 0
    ORDER BY total_seconds DESC, total_sessions DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
END $$;

COMMENT ON FUNCTION public.get_most_active_students(timestamptz, timestamptz, integer) IS 'Admin-only: ranking by total online time in period (overlapping sessions). Fixed in 0056 from started_at-only filter.';

REVOKE EXECUTE ON FUNCTION public.get_most_active_students(timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_most_active_students(timestamptz, timestamptz, integer) TO authenticated;

-- ---------------------------------------------------------------------
-- Function: get_daily_active_students — students active on a single date
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_daily_active_students(
    p_date date,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    student_id uuid,
    full_name text,
    phone text,
    grade_name text,
    total_sessions bigint,
    total_seconds bigint,
    total_hours numeric,
    first_seen_at timestamptz,
    last_seen_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_from timestamptz := p_date::timestamptz;
    v_to   timestamptz := (p_date + 1)::timestamptz;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_date IS NULL THEN
        RAISE EXCEPTION 'invalid_date';
    END IF;

    RETURN QUERY
    SELECT p.id AS student_id,
           p.full_name,
           p.phone,
           g.name AS grade_name,
           COUNT(s.id)::bigint AS total_sessions,
           COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at))::bigint), 0)::bigint AS total_seconds,
           COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at)))/3600, 2), 0) AS total_hours,
           MIN(s.started_at) AS first_seen_at,
           MAX(s.last_seen_at) AS last_seen_at
    FROM public.profiles p
    JOIN public.student_sessions s
          ON s.student_id = p.id
         AND s.started_at < v_to
         AND COALESCE(s.ended_at, s.last_seen_at) >= v_from
    LEFT JOIN public.grades g ON g.id = p.grade_id
    WHERE p.role = 'student' AND p.deleted_at IS NULL
    GROUP BY p.id, p.full_name, p.phone, g.name
    HAVING COUNT(s.id) > 0
    ORDER BY total_seconds DESC, last_seen_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END $$;

COMMENT ON FUNCTION public.get_daily_active_students(date, integer, integer) IS 'Admin-only: students active on a given calendar date (overlapping sessions).';

REVOKE EXECUTE ON FUNCTION public.get_daily_active_students(date, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_active_students(date, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------
-- Function: get_presence_daily_counts — per-day aggregates for chart
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_presence_daily_counts(
    p_from date DEFAULT CURRENT_DATE - 6,
    p_to   date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    day date,
    active_students bigint,
    total_sessions bigint,
    total_seconds bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
        RAISE EXCEPTION 'invalid_range';
    END IF;

    RETURN QUERY
    WITH days AS (
        SELECT generate_series(p_from, p_to, '1 day'::interval)::date AS d
    ),
    per_day AS (
        SELECT (s.started_at::date) AS d,
               s.student_id,
               COUNT(*) AS sessions,
               SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at))::bigint) AS secs
        FROM public.student_sessions s
        WHERE s.started_at::date BETWEEN p_from AND p_to
        GROUP BY (s.started_at::date), s.student_id
    )
    SELECT days.d AS day,
           COUNT(DISTINCT per_day.student_id)::bigint AS active_students,
           COALESCE(SUM(per_day.sessions), 0)::bigint AS total_sessions,
           COALESCE(SUM(per_day.secs), 0)::bigint AS total_seconds
    FROM days
    LEFT JOIN per_day ON per_day.d = days.d
    GROUP BY days.d
    ORDER BY days.d ASC;
END $$;

COMMENT ON FUNCTION public.get_presence_daily_counts(date, date) IS 'Admin-only: per-day active students / sessions / seconds for chart (last N days).';

REVOKE EXECUTE ON FUNCTION public.get_presence_daily_counts(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_presence_daily_counts(date, date) TO authenticated;

-- ---------------------------------------------------------------------
-- Index helper for daily queries — rely on existing idx on started_at
-- (functional ::date index not IMMUTABLE for timestamptz, skipped)
-- ---------------------------------------------------------------------
-- no additional index needed (idx_student_sessions_student_time covers it)
