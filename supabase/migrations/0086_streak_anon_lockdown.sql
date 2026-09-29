-- =====================================================================
-- 0086_streak_anon_lockdown.sql — explicit anon revoke for 0085 RPCs
-- ---------------------------------------------------------------------
-- The Management API migrations path grants EXECUTE to anon on newly
-- created functions (role default privileges); REVOKE FROM PUBLIC alone
-- does NOT remove it. The repo grant-drift anchors (05_grants /
-- 08_security: anon locked everywhere except the allowlist) require an
-- explicit REVOKE FROM anon per function — same treatment as the 0010
-- blanket revoke for pre-existing functions.
-- Idempotent: revoking an absent grant succeeds with a mere notice.
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.get_my_streak() FROM anon;
REVOKE EXECUTE ON FUNCTION public.use_streak_freeze() FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_student_streaks() FROM anon;
REVOKE EXECUTE ON FUNCTION public.streak_active_days(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.streak_state(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.redeem_unit_code(text, boolean) FROM anon;

-- Re-assert the intended authenticated surface (no-op if already granted).
GRANT EXECUTE ON FUNCTION public.get_my_streak() TO authenticated;
GRANT EXECUTE ON FUNCTION public.use_streak_freeze() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_student_streaks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_unit_code(text, boolean) TO authenticated;
