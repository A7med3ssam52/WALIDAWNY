-- =====================================================================
-- 0026_view_lockdown
-- Phase 2 | Hardening | Security
-- The 6 public views (0010) are internal-only: consumed exclusively by
-- SECURITY DEFINER functions (owner postgres -> permission checks pass
-- even with zero client grants on the views). Hosted Supabase grants
-- ALL on every public view to anon/authenticated at project creation,
-- which would otherwise expose the admin analytics surface
-- (v_dashboard_metrics, v_audit_log, v_lesson_stats, per-student
-- aggregates, live subscriptions incl. financial columns) as raw
-- PostgREST endpoints for any role holding an API key.
-- REVOKE ALL closes that surface (L5 + SECURITY.md section 8 posture:
-- tables/views get per-role grants, RLS does the row filtering).
-- service_role intentionally keeps its grants (trusted backend/admin
-- tooling; it bypasses RLS anyway).
-- =====================================================================

REVOKE ALL ON PUBLIC.v_active_subscriptions FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_active_subscriptions FROM anon, authenticated;

REVOKE ALL ON PUBLIC.v_lesson_access FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_lesson_access FROM anon, authenticated;

REVOKE ALL ON PUBLIC.v_student_progress_summary FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_student_progress_summary FROM anon, authenticated;

REVOKE ALL ON PUBLIC.v_lesson_stats FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_lesson_stats FROM anon, authenticated;

REVOKE ALL ON PUBLIC.v_dashboard_metrics FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_dashboard_metrics FROM anon, authenticated;

REVOKE ALL ON PUBLIC.v_audit_log FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_audit_log FROM anon, authenticated;