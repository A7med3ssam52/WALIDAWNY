-- =====================================================================
-- 0041_boards_storage_rls_fix
-- Phase 8/9 | Lesson Boards (السبورات) + PDF storage posture | Database
-- Storage-policy + finalize hardening for the lesson-boards release
-- (follow-up to 0036; runtime findings from the boards EF/DB review):
--
--   C1: boards_select_row_backed (NEW) - the Storage API performs
--       INSERT ... RETURNING * on upload, so the 0036 boards INSERT
--       policy alone aborts every boards upload with 42501 unless a
--       SELECT policy covers the inserted row (the exact 0021 H1
--       lesson for the pdfs bucket). Add the row-backed SELECT mirror
--       of the boards INSERT check - same bucket, same
--       '{uuid}/{uuid}.{jpg|jpeg|png|webp}' path shape (the 0036:394
--       regex verbatim), same existing non-deleted lesson_boards row,
--       and, exactly like boards_insert_row_backed, NO is_ready filter
--       (pending rows are already invisible to students under the
--       lesson_boards SELECT policy, so the INSERT scope is inherited;
--       ready paths already hold their object on the real platform ->
--       409 on a direct re-upload, 0015 pattern). Object reads stay
--       locked behind the get-board-signed-urls Edge Function (service
--       key) as before.
--
--   H1: boards_delete_row_backed + pdfs_delete_row_backed (NEW) - the
--       delete-board / delete-pdf Edge Functions remove the Storage
--       object over the CALLER token (client.storage.from(...).remove),
--       which requires a DELETE policy on storage.objects the caller
--       can satisfy. Without it every object removal is a silent no-op
--       (0 rows) and the orphaned object leaks forever. Both policies
--       are staff-only - (public.is_admin() OR public.is_mr_walid()
--       OR public.is_teacher()), the same STAFF_ROLES set the two EFs
--       check (delete-pdf/index.ts and delete-board/index.ts) - and
--       row-backed: the object must still be referenced by a
--       non-deleted lesson_boards / lesson_pdfs row, so staff can only
--       remove objects that belong to the schema's own upload
--       bookkeeping, never arbitrary bucket content.
--
--   Decision (generalized DELETE posture): boards and PDFs share one
--       storage layer, so the DELETE surface is added for BOTH buckets
--       in one migration; the storage.objects policy inventory lock in
--       tests/local/sql/08_security.sql moves from 3 to 6 policies.
--
--   M2: finalize_board_upload now refuses to mark a board ready when
--       its Storage object does not exist (new error board_storage_missing)
--       - a pending row without bytes must never become student-visible.
--
-- Decisions owned by OTHER agents (referenced here, NOT touched):
--   * expires_in removal from the upload EFs' success envelopes is
--     Agent B's scope (upload-pdf/index.ts:407 +
--     create-video-upload-session/index.ts:735); this migration does
--     not change any EF or response shape.
--   * pending board cards staying visible in the staff UI is Agent C's
--     scope (UI rendering of is_ready=false rows); the DB surface
--     (rows, RPCs, policies) already supports it unchanged.
--
-- All statements are guarded on to_regclass('storage.objects') so this
-- migration also runs unchanged on the local harness shim (which has
-- the same storage.objects surface) and on hosted (which always has
-- it) - 0021 pattern. No old migrations are modified.
-- =====================================================================

-- ---------------------------------------------------------------------
-- C1: boards SELECT policy - row-backed mirror of the 0036 INSERT
-- check. Required by the Storage API's INSERT ... RETURNING * upload
-- path (42501 without it); NO is_ready filter (same scope as
-- boards_insert_row_backed, 0036:389-399).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
        DROP POLICY IF EXISTS boards_select_row_backed ON storage.objects;
        CREATE POLICY boards_select_row_backed ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'boards'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
                AND EXISTS (
                    SELECT 1 FROM public.lesson_boards
                    WHERE storage_path = name AND deleted_at IS NULL
                )
            );
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- H1: boards DELETE policy - staff-only, row-backed. Required by the
-- delete-board Edge Function's caller-token object removal
-- (client.storage.from('boards').remove([storage_path])); the role
-- check mirrors the EF's STAFF_ROLES and the row-backing keeps the
-- DELETE confined to schema-managed objects.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
        DROP POLICY IF EXISTS boards_delete_row_backed ON storage.objects;
        CREATE POLICY boards_delete_row_backed ON storage.objects
            FOR DELETE TO authenticated
            USING (
                bucket_id = 'boards'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
                AND (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
                AND EXISTS (
                    SELECT 1 FROM public.lesson_boards
                    WHERE storage_path = name AND deleted_at IS NULL
                )
            );
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- H1: pdfs DELETE policy - staff-only, row-backed. Same rationale as
-- the boards DELETE above for the delete-pdf Edge Function's
-- caller-token object removal; the row-backing references the actual
-- lesson_pdfs table (0021 SELECT-mirror posture, same storage_path
-- column).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
        DROP POLICY IF EXISTS pdfs_delete_row_backed ON storage.objects;
        CREATE POLICY pdfs_delete_row_backed ON storage.objects
            FOR DELETE TO authenticated
            USING (
                bucket_id = 'pdfs'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
                AND (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
                AND EXISTS (
                    SELECT 1 FROM public.lesson_pdfs
                    WHERE storage_path = name AND deleted_at IS NULL
                )
            );
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- M2: finalize_board_upload - the pending row must have reached
-- Storage before it can be marked ready (board_storage_missing).
-- CREATE OR REPLACE of the 0036 wrapper: the storage.objects probe
-- runs inside the SECURITY DEFINER body, where the function owner is
-- exempt from storage.objects RLS (ENABLE-without-FORCE, 0021 H2), so
-- the check is authoritative for every caller regardless of policies.
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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

    -- M2 (0041): no Storage object -> the upload never happened; a
    -- pending row without bytes must never become student-visible.
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
'Phase 8 staff wrapper: marks a pending lesson_boards row ready after the upload (is_ready=true). Staff-guarded; board_not_found when absent/deleted; board_already_ready on repeat; board_storage_missing when the Storage object does not exist yet (0041 M2). Authenticated-only grant (client RPC #67).';