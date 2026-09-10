-- =====================================================================
-- 0058_fix_dashboard_stats
-- Fix 0057 bug: recent_purchases / recent_completions used
-- jsonb_agg(... ORDER BY ...) + outer ORDER BY + LIMIT without subquery,
-- which caused "column must appear in GROUP BY" on empty / small DB.
-- Wrap them in subquery like top_units does.
-- =====================================================================

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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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
                'student_name', r.student_name,
                'grade_name', r.grade_name,
                'unit_name', r.unit_name,
                'total_price', r.total_price,
                'purchased_at', r.purchased_at
            ) ORDER BY r.purchased_at DESC)
            FROM (
                SELECT p.full_name AS student_name,
                       g.name AS grade_name,
                       u.name AS unit_name,
                       up.total_price,
                       up.purchased_at
                FROM public.unit_purchases up
                JOIN public.profiles p ON p.id = up.student_id
                JOIN public.units u ON u.id = up.unit_id
                LEFT JOIN public.grades g ON g.id = u.grade_id
                WHERE up.status = 'active'
                ORDER BY up.purchased_at DESC
                LIMIT 5
            ) r
        ), '[]'::jsonb),
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
                       pr.last_watched_at AS completed_at
                FROM public.progress pr
                JOIN public.profiles p ON p.id = pr.student_id
                JOIN public.lessons l ON l.id = pr.lesson_id
                JOIN public.units u ON u.id = l.unit_id
                WHERE pr.is_completed = true
                ORDER BY pr.last_watched_at DESC
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
                SELECT (pr.last_watched_at::date)::text AS day,
                       count(*) AS count
                FROM public.progress pr
                WHERE pr.is_completed = true
                  AND pr.last_watched_at >= CURRENT_DATE - 6
                GROUP BY pr.last_watched_at::date
                ORDER BY day ASC
            ) r
        ), '[]'::jsonb)
    ) INTO v_stats;

    RETURN v_stats;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

COMMENT ON FUNCTION public.get_dashboard_stats() IS 'Fixed in 0058: recent_purchases/recent_completions now use subquery to avoid GROUP BY error.';
