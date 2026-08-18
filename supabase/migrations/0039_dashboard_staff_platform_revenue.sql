-- =====================================================================
-- 0039_dashboard_staff_platform_revenue.sql
-- Dashboard revenue split (decision: owner request 2026-08):
--   * staff_revenue_this_month = sum(base_price) of active purchases
--     this month  -> "إيرادات مستر وليد" (excludes the platform fee)
--   * platform_fee_total      = sum(platform_fee) of active purchases
--     -> "إجمالي إيرادات المنصة" (platform fees only)
-- Replaces the old single total_price-based keys (total_revenue /
-- revenue_this_month). CREATE OR REPLACE keeps grants (REVOKE/GRAINT
-- are re-asserted here for idempotency).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stats jsonb;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

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
        ), '[]'::jsonb)
    ) INTO v_stats;

    RETURN v_stats;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;