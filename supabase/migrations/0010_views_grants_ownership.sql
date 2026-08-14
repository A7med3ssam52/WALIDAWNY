-- =====================================================================
-- 0010_views_grants_ownership
-- Phase 1 | Supabase Foundation | Database
-- SECURITY INVOKER views, the RPC grant matrix (MED-6), table-level
-- revocations (binding B2), and SECURITY DEFINER ownership (B1).
-- Reference: DATABASE.md section 5, section 6.1; SECURITY.md section 8.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Views (all SECURITY INVOKER by default - per-row RLS of the
-- underlying tables still applies to the invoking user, L5).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_active_subscriptions AS
SELECT s.*
FROM public.subscriptions s
JOIN public.profiles p ON p.id = s.student_id
WHERE s.status = 'active'
  AND s.expires_at > now()
  AND p.status = 'active'
  AND p.deleted_at IS NULL;

COMMENT ON VIEW public.v_active_subscriptions IS 'Live-valid subscriptions for eligible students.';

CREATE OR REPLACE VIEW public.v_lesson_access AS
SELECT l.*, public.can_access_lesson(l.id) AS can_access
FROM public.lessons l
JOIN public.units u ON u.id = l.unit_id
WHERE l.status = 'published' AND l.deleted_at IS NULL
  AND u.status = 'published' AND u.deleted_at IS NULL;

COMMENT ON VIEW public.v_lesson_access IS 'Lesson list with live access flag. Staff can read all published rows (is_admin/is_mr_walid are not part of the view filter); students see published lessons of their own live grade only via RLS on lessons.';

CREATE OR REPLACE VIEW public.v_student_progress_summary AS
SELECT p.student_id, g.id AS grade_id, u.id AS unit_id,
       ROUND(AVG(p.percent_completed), 2) AS percent,
       COUNT(*) FILTER (WHERE p.is_completed) AS completed_lessons,
       COUNT(*) AS total_lessons
FROM public.progress p
JOIN public.lessons l ON l.id = p.lesson_id AND l.deleted_at IS NULL
JOIN public.units u ON u.id = l.unit_id AND u.deleted_at IS NULL
JOIN public.grades g ON g.id = u.grade_id AND g.deleted_at IS NULL
GROUP BY p.student_id, g.id, u.id;

COMMENT ON VIEW public.v_student_progress_summary IS 'Per-student percent + completion counts per grade/unit (unweighted mean, A30).';

CREATE OR REPLACE VIEW public.v_lesson_stats AS
SELECT lesson_id,
       COUNT(*) AS play_touches,
       COUNT(*) FILTER (WHERE is_completed) AS completions
FROM public.progress
GROUP BY lesson_id;

COMMENT ON VIEW public.v_lesson_stats IS 'Analytics per lesson from progress.';

CREATE OR REPLACE VIEW public.v_dashboard_metrics AS
SELECT
  (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL)                         AS total_students,
  (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'active')   AS active_students,
  (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'disabled') AS disabled_students,
  (SELECT COUNT(*) FROM public.v_active_subscriptions)                                    AS active_subscribers,
  (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'expired')                    AS expired_subscriptions,
  (SELECT COUNT(*) FROM public.lessons WHERE deleted_at IS NULL AND status = 'published') AS published_lessons,
  (SELECT COUNT(*) FROM public.lessons WHERE deleted_at IS NULL AND status <> 'published') AS hidden_or_draft_lessons,
  (SELECT COUNT(*) FROM public.subscription_codes WHERE status = 'available')             AS available_codes,
  (SELECT COUNT(*) FROM public.subscription_codes WHERE status = 'used')                  AS used_codes;

COMMENT ON VIEW public.v_dashboard_metrics IS 'Admin operational metrics.';

CREATE OR REPLACE VIEW public.v_audit_log AS
SELECT a.*, p.full_name AS actor_name
FROM public.audit_logs a
LEFT JOIN public.profiles p ON p.id = a.actor_id;

COMMENT ON VIEW public.v_audit_log IS 'Audit rows with actor display info (admin-only read via RLS).';

-- ---------------------------------------------------------------------
-- RPC grant matrix (MED-6 / SECURITY.md section 8)
-- Default posture: everything REVOKEd; explicit allowlist granted.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Client-callable allowlist (SECURITY.md section 8.2):
GRANT EXECUTE ON FUNCTION public.update_own_profile(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_student_profile(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_subscription_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_current_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_progress(uuid, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_grade(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enable_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_trash() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_subscription(uuid, uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_subscription_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_unit(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_unit(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_unit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_unit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_lesson(uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_lesson(uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_lesson(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hide_lesson(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_lesson(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_lesson(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_grade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_grade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_app_setting(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_pricing_plan(uuid, integer, numeric, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pricing_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, public.user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pdf_upload(uuid) TO authenticated;

-- anon additionally for the public settings surface (LOW-15):
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated;

-- RLS policy helpers: is_admin, is_mr_walid, is_student and
-- can_access_lesson are invoked INSIDE RLS policy expressions (SECURITY.md
-- section 6). PostgreSQL requires EXECUTE on the function at the point the
-- policy is evaluated, so these four MUST stay executable by authenticated
-- (empirically verified; see tests/local README). They are NOT reachable
-- through the PostgREST RPC surface for any client role: only functions
-- exposed by Supabase's RPC auto-exposure (granted here above) are
-- callable via RPC. anon keeps no access to them.
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mr_walid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_student() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_lesson(uuid) TO authenticated;

-- Everything else stays REVOKEd: generate_codes_internal, set_video_status,
-- expire_subscriptions, recheck_video_states, notify_new_content,
-- audit_log, handle_new_user, block_email_change,
-- block_sign_in_for_inactive_accounts, set_updated_at,
-- clear_primary_on_soft_delete, revoke_sessions_if_possible,
-- get_current_role.
-- NOTE: is_admin / is_mr_walid / is_student / can_access_lesson are
-- NOT revoked - they are granted above for use inside RLS policy
-- expressions (required by PostgreSQL; not reachable via RPC).

-- ---------------------------------------------------------------------
-- Binding B2: direct DML on notifications revoked from clients;
-- mark-read RPCs (SECURITY DEFINER) remain the only mutation path.
-- ---------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- Binding B1: every SECURITY DEFINER function (incl. trigger functions)
-- must be owned by postgres (or a BYPASSRLS role). The harness runs
-- migrations as postgres, so this is a no-op there; it hardens hosted
-- migrations regardless of the executing role.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS proc
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef
    LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', r.proc);
    END LOOP;
END$$;
