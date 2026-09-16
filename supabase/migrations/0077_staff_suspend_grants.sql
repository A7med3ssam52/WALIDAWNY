-- =====================================================================
-- 0077_staff_suspend_grants
-- Restores the executable surface that 0074 unintentionally removed:
-- 0074 revoked the PUBLIC default grant on disable_student(uuid, text)
-- (0069) and update_suspension_reason(uuid, text) (0070) as anon
-- hygiene, but neither function ever received an explicit GRANT, so
-- after 0074 NO client role could execute them. The staff UI calls
-- both on every suspend / reason-edit
-- (StudentListPage / StudentDetailPage via disableStudent /
-- updateSuspensionReason), so without this fix those buttons fail in
-- production with 42501 "permission denied for function".
--
-- This migration re-grants EXECUTE to authenticated only (NOT anon -
-- the 05/08 anon anchors stay green). Row-level safety is unchanged:
-- both functions enforce their staff-only guard internally
-- (is_admin/is_mr_walid/is_teacher), the same posture as every other
-- staff RPC (0030 pattern). Append-only: 0069/0070/0074 untouched.
-- =====================================================================

GRANT EXECUTE ON FUNCTION public.disable_student(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_suspension_reason(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.disable_student(uuid, text) IS
'0077: EXECUTE granted to authenticated (0074 had revoked the PUBLIC default with no replacement, breaking the staff suspend buttons). Staff-only guard inside; anon stays locked.';
COMMENT ON FUNCTION public.update_suspension_reason(uuid, text) IS
'0077: EXECUTE granted to authenticated (0074 had revoked the PUBLIC default with no replacement, breaking the staff reason-edit flow). Staff-only guard inside; anon stays locked.';
