-- =====================================================================
-- 0018_dashboard_stats
-- Phase 7 | Dashboards | Database
-- get_dashboard_stats(): single-round-trip operational/analytics JSON
-- for the Walid Awny / admin dashboards. Staff-guarded exactly like the
-- other client RPCs (is_admin() OR is_mr_walid()); students get
-- permission_denied. Aggregates read through the existing SECURITY
-- INVOKER views where they already exist (v_active_subscriptions) and
-- plain public tables otherwise (all of which staff can read under
-- RLS). Read-only: no audit row (nothing is mutated).
-- Reference: DATABASE.md section 6.4 (staff RPCs); SECURITY.md 8.2.
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
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT jsonb_build_object(
        'students', jsonb_build_object(
            'total',        (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL),
            'active',       (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'active'),
            'disabled',     (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'disabled'),
            'deleted',      (SELECT count(*) FROM public.profiles WHERE deleted_at IS NOT NULL),
            'new_this_month', (SELECT count(*) FROM public.profiles
                               WHERE deleted_at IS NULL AND created_at >= date_trunc('month', now()))
        ),
        'subscriptions', jsonb_build_object(
            'active',               (SELECT count(*) FROM public.v_active_subscriptions),
            'expiring_7d',          (SELECT count(*) FROM public.v_active_subscriptions
                                     WHERE expires_at <= now() + interval '7 days'),
            'expired',              (SELECT count(*) FROM public.subscriptions WHERE status = 'expired'),
            'revenue_total',        (SELECT COALESCE(sum(total_price), 0) FROM public.v_active_subscriptions),
            'revenue_this_month',   (SELECT COALESCE(sum(total_price), 0) FROM public.subscriptions
                                     WHERE status = 'active' AND started_at >= date_trunc('month', now()))
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
        'codes', jsonb_build_object(
            'available', (SELECT count(*) FROM public.subscription_codes WHERE status = 'available'),
            'used',      (SELECT count(*) FROM public.subscription_codes WHERE status = 'used'),
            'revoked',   (SELECT count(*) FROM public.subscription_codes WHERE status = 'revoked')
        ),
        'by_grade', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'grade_name', r.grade_name,
                'students', r.students,
                'active_subscribers', r.active_subscribers
            ) ORDER BY r.sort_order)
            FROM (
                SELECT g.name AS grade_name, g.sort_order,
                       count(DISTINCT p.id) AS students,
                       count(DISTINCT s.student_id) AS active_subscribers
                FROM public.grades g
                LEFT JOIN public.profiles p
                       ON p.grade_id = g.id AND p.deleted_at IS NULL
                LEFT JOIN public.v_active_subscriptions s ON s.student_id = p.id
                WHERE g.deleted_at IS NULL
                GROUP BY g.id, g.name, g.sort_order
            ) r
        ), '[]'::jsonb),
        'recent_subscriptions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', p.full_name,
                'grade_name', g.name,
                'duration_days', pl.duration_days,
                'total_price', s.total_price,
                'status', s.status,
                'started_at', s.started_at,
                'expires_at', s.expires_at
            ) ORDER BY s.created_at DESC)
            FROM public.subscriptions s
            JOIN public.profiles p ON p.id = s.student_id
            JOIN public.pricing_plans pl ON pl.id = s.pricing_plan_id
            LEFT JOIN public.grades g ON g.id = pl.grade_id
            LIMIT 5
        ), '[]'::jsonb),
        'upcoming_expirations', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', p.full_name,
                'expires_at', s.expires_at
            ) ORDER BY s.expires_at)
            FROM public.v_active_subscriptions s
            JOIN public.profiles p ON p.id = s.student_id
            WHERE s.expires_at <= now() + interval '7 days'
            LIMIT 5
        ), '[]'::jsonb)
    ) INTO v_stats;

    RETURN v_stats;
END $$;

-- Grant matrix: authenticated only, staff enforced in-function (same
-- posture as 0013/0014/0015/0016/0017). Explicit REVOKE FROM PUBLIC
-- first: new functions otherwise inherit the PUBLIC default grant,
-- which would break the "anon: exactly one executable function"
-- assertion in tests/local/sql/05_grants.sql.
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;
