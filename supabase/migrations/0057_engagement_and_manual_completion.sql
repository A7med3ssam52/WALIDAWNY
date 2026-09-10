-- =====================================================================
-- 0057_engagement_and_manual_completion
-- Phase: Engagement enhancement + Manual lesson completion (toggle)
-- - Extends get_dashboard_stats engagement with richer metrics
-- - Adds RPC toggle_lesson_completed for student manual completion
-- Reference: plan 2026-09 - مشاركة الطلاب متطورة + الطالب يعلم الدرس مكتمل
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Reversible manual completion RPC
-- Students can mark a lesson as completed/incomplete manually.
-- Unlike upsert_progress (monotonic GREATEST, irreversible is_completed),
-- this RPC allows toggling is_completed for manual control (user request:
-- "قابل للإلغاء"). Guard: is_student() + can_access_lesson().
-- When marking complete -> percent=100, is_completed=true, position kept
-- (or 0 if no progress yet). When unmarking -> is_completed=false,
-- percent stays as-is (or reset to 0 if was 100-only manual). New row
-- is created if none exists (for PDF-only lessons).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_lesson_completed(
    p_lesson_id uuid,
    p_completed boolean
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
BEGIN
    IF NOT public.is_student() OR NOT public.can_access_lesson(p_lesson_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    -- Resolve current primary video (same as upsert_progress)
    SELECT id INTO v_video
    FROM public.lesson_videos
    WHERE lesson_id = p_lesson_id
      AND is_primary AND deleted_at IS NULL AND status = 'ready'
    ORDER BY sort_order, id
    LIMIT 1;

    -- Stale-video guard (same as upsert_progress) when a primary exists
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
        -- If progress was 0 and we have video duration, keep 0 (position not important for completion)

        INSERT INTO public.progress AS p (
            student_id, lesson_id, video_id, position_seconds,
            percent_completed, is_completed, last_watched_at
        )
        VALUES (
            v_student, p_lesson_id, COALESCE(v_video, v_existing.video_id), v_pos, v_pct,
            true, now()
        )
        ON CONFLICT (student_id, lesson_id) DO UPDATE
        SET percent_completed = 100,
            is_completed = true,
            position_seconds = EXCLUDED.position_seconds,
            video_id = COALESCE(EXCLUDED.video_id, p.video_id, v_video),
            last_watched_at = now()
        RETURNING * INTO v_result;

        PERFORM public.audit_log('progress.manual_complete', 'progress', v_result.id,
            jsonb_build_object('lesson_id', p_lesson_id, 'completed', true));
    ELSE
        -- Unmark: set is_completed=false, keep percent (but if percent was 100 from manual, reduce to 90? No, keep 100 but not completed)
        -- Decision: when unmarking, set percent to GREATEST(existing percent, 0) but is_completed=false
        -- Keep position. If no existing row, nothing to unmark -> create not-completed row
        IF v_existing.id IS NULL THEN
            -- No progress yet, create a 0% not-completed row
            INSERT INTO public.progress (
                student_id, lesson_id, video_id, position_seconds,
                percent_completed, is_completed, last_watched_at
            )
            VALUES (
                v_student, p_lesson_id, v_video, 0, 0, false, now()
            )
            RETURNING * INTO v_result;
        ELSE
            UPDATE public.progress
            SET is_completed = false,
                -- Keep percent as-is (don't reset), but ensure not 100% completed illusion
                -- If percent was 100 due to manual, keep 100 but not completed (user can re-toggle)
                last_watched_at = now()
            WHERE student_id = v_student AND lesson_id = p_lesson_id
            RETURNING * INTO v_result;
        END IF;

        PERFORM public.audit_log('progress.manual_uncomplete', 'progress', v_result.id,
            jsonb_build_object('lesson_id', p_lesson_id, 'completed', false));
    END IF;

    RETURN v_result;
END $$;

COMMENT ON FUNCTION public.toggle_lesson_completed(uuid, boolean) IS 'Student manual lesson completion toggle (reversible). Guard: is_student + can_access_lesson + stale-video check.';

REVOKE EXECUTE ON FUNCTION public.toggle_lesson_completed(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_lesson_completed(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) Extended get_dashboard_stats
-- Keeps all existing keys, adds richer engagement + new top-level arrays.
-- CREATE OR REPLACE keeps grants (REVOKE/GRANT re-asserted).
-- New structure:
--   engagement: {
--     students_with_progress, completed_lessons, avg_percent (existing)
--     participation_rate (0-100), completion_rate (0-100),
--     active_last_7d, distribution {q1,q2,q3,q4 counts},
--     inactive_students (count of students with zero progress)
--   }
--   recent_completions: [{student_name, lesson_title, unit_name, completed_at}]
--   top_active: [{student_id, full_name, grade_name, completed_lessons, avg_percent, total_lessons}]
--   daily_completions: [{day: date string YYYY-MM-DD, count}]
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
        'recent_completions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', p.full_name,
                'lesson_title', l.title,
                'unit_name', u.name,
                'completed_at', pr.last_watched_at
            ) ORDER BY pr.last_watched_at DESC)
            FROM public.progress pr
            JOIN public.profiles p ON p.id = pr.student_id
            JOIN public.lessons l ON l.id = pr.lesson_id
            JOIN public.units u ON u.id = l.unit_id
            WHERE pr.is_completed = true
            ORDER BY pr.last_watched_at DESC
            LIMIT 5
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

    -- Ensure daily_completions always has 7 entries (fill missing days with 0)
    -- Do it in plpgsql for simplicity if needed, but COALESCE above is enough for now
    -- Frontend will fill gaps.

    RETURN v_stats;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

COMMENT ON FUNCTION public.get_dashboard_stats() IS 'Extended in 0057: engagement now includes participation_rate, completion_rate, active_last_7d, inactive_students, distribution; plus recent_completions, top_active, daily_completions.';
