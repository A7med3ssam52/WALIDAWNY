-- =====================================================================
-- 0074_fix_harness_gaps
-- Closes three real gaps found while greening the local SQL harness
-- (suites 01/03/04/05/08/11/12 were red since the 0061-0064 era):
--
-- 1) finalize_board_upload lost the 0041 M2 board_storage_missing check
--    when 0061 rewrote it for the assistant guard (it copied the 0036
--    body instead of 0041's). A pending row without Storage bytes could
--    be marked ready -> students see a broken image. Restored below on
--    top of the assistant guard (0061 intent kept, 0041 M2 restored).
--
-- 2) Three staff functions are anon-executable because they were created
--    without REVOKE FROM PUBLIC (new functions inherit the PUBLIC
--    default grant; 0036 documents this trap explicitly):
--      * is_assistant() (0059; siblings is_admin/is_student/... are locked)
--      * disable_student(uuid, text) (0069; new two-arg overload)
--      * update_suspension_reason(uuid, text) (0070)
--    Internal guards still deny anon, but the allowlist hygiene tests
--    (05/08: anon may execute exactly the public surface) fail.
--    Revoked below. Intentionally public anon functions are untouched:
--    get_public_settings, list_active_grades, get_public_unit_prices,
--    get_platform_fee, get_active_announcements, is_unit_published_active,
--    unit_has_published_trial, unit_is_published_active.
--
-- 3) profiles_select_own_or_staff (0064) lets soft-deleted users read
--    their own row. The suspension model (0069: disabled MAY sign in for
--    the popup, deleted are blocked at sign-in) needs disabled self-read
--    (AuthContext/SuspendedAccountGate read via RLS), but deleted
--    self-read serves nothing. Gate the self branch on deleted_at IS NULL.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) finalize_board_upload: 0041 M2 body + assistant guard (0061 intent)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_board_upload(p_board_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
    v_ready boolean;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lb.lesson_id, lb.is_ready INTO v_lesson, v_ready
    FROM public.lesson_boards lb
    WHERE lb.id = p_board_id AND lb.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'board_not_found';
    END IF;
    IF v_ready THEN
        RAISE EXCEPTION 'board_already_ready';
    END IF;

    -- M2 (0041, restored): no Storage object -> the upload never happened;
    -- a pending row without bytes must never become student-visible.
    IF NOT EXISTS (
        SELECT 1 FROM storage.objects so
        WHERE so.bucket_id = 'boards'
          AND so.name = (SELECT lb.storage_path FROM public.lesson_boards lb WHERE lb.id = p_board_id)
    ) THEN
        RAISE EXCEPTION 'board_storage_missing';
    END IF;

    UPDATE public.lesson_boards SET is_ready = true WHERE id = p_board_id;

    PERFORM public.audit_log('board.finalized', 'lesson_board', p_board_id,
        jsonb_build_object('lesson_id', v_lesson));
END $$;

COMMENT ON FUNCTION public.finalize_board_upload(uuid) IS
'0074: 0041 M2 board_storage_missing check restored on top of the 0061 assistant guard (0061 had copied the pre-0041 body).';

-- ---------------------------------------------------------------------
-- 2) Revoke anon-executable staff functions (PUBLIC default-grant trap)
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.is_assistant() FROM PUBLIC;
-- NOTE: disable_student(uuid, text) [0069] and
-- update_suspension_reason(uuid, text) [0070] were created with NO grants
-- at all, so authenticated could only reach them through the PUBLIC
-- default grant. Revoking PUBLIC without a replacement would lock staff
-- out entirely (D. student enable/disable round-trip), so re-grant
-- authenticated explicitly. (is_assistant keeps its 0059/0060 grant.)
REVOKE EXECUTE ON FUNCTION public.disable_student(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.disable_student(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_suspension_reason(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_suspension_reason(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) profiles self-read: blocked for soft-deleted, open for disabled
--    (suspension popup reads own row via RLS - 0064+0069 intent kept)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_own_or_staff ON public.profiles;
CREATE POLICY profiles_select_own_or_staff ON public.profiles
    FOR SELECT
    USING (((id = auth.uid()) AND deleted_at IS NULL) OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

COMMENT ON POLICY profiles_select_own_or_staff ON public.profiles IS
'0074: self branch gated on deleted_at IS NULL (soft-deleted see nothing); disabled users keep own-row read for the suspension popup (0069). Staff branch unchanged.';
