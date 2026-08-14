-- =====================================================================
-- 0017_delete_video_upload_record.sql
-- Phase 5 (Bunny video): release RPC for the create-video-upload-session
-- Edge Function (cancel/abandon action).
--
-- Why a SECURITY DEFINER wrapper (same shape as 0015/0016): 0009 gives
-- lesson_videos a SELECT-only policy + FORCE RLS, so a caller-token
-- DELETE is silently a no-op (0 rows). This wrapper is the ONLY delete
-- surface for lesson_videos rows and re-validates every rule
-- server-side (authoritative backstop; the Edge Function pre-checks the
-- same rules over the caller token for UX).
--
-- Purpose: an upload session that is cancelled or abandoned before any
-- byte is committed must release the reservation — otherwise the Phase 1
-- orphan rule (one pending_upload row per lesson, enforced by 0016)
-- permanently locks the lesson out of future upload sessions. The
-- bunny-video-webhook status machine never fires for an aborted TUS
-- upload and recheck-video-states treats Bunny status 0 (queued) as a
-- no-op, so the row has no other escape hatch.
--
-- Rules enforced:
--   * staff only: is_admin() OR is_mr_walid() (request-scoped claims)
--   * the row must exist and must NOT be soft-deleted
--     (video_not_found)
--   * the row must belong to the given lesson (wrong_lesson)
--   * the row must still be 'pending_upload' (video_not_pending) —
--     a row that a webhook already advanced (uploading/processing/
--     ready/failed) must never be silently removed by a cancel
--   * hard DELETE (no content was ever committed) + audit
--     (video.upload_session_cancelled)
--
-- Error surface (P0001 + detail message):
--   permission_denied | video_not_found | wrong_lesson | video_not_pending
--
-- Grant surface: authenticated ONLY (client RPC #39, count asserted in
-- tests/local/sql/05_grants.sql). anon stays fully locked.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.delete_video_upload_record(
    p_lesson_id uuid,
    p_video_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
    v_status public.video_status;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lv.lesson_id, lv.status INTO v_lesson, v_status
    FROM public.lesson_videos lv
    WHERE lv.id = p_video_id AND lv.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'video_not_found';
    END IF;
    IF v_lesson <> p_lesson_id THEN
        RAISE EXCEPTION 'wrong_lesson';
    END IF;
    IF v_status <> 'pending_upload' THEN
        RAISE EXCEPTION 'video_not_pending';
    END IF;

    DELETE FROM public.lesson_videos WHERE id = p_video_id;

    PERFORM public.audit_log('video.upload_session_cancelled', 'lesson_video', p_video_id,
        jsonb_build_object('lesson_id', p_lesson_id));
END $$;

COMMENT ON FUNCTION public.delete_video_upload_record(uuid, uuid) IS
'Phase 5 staff wrapper: releases a pending_upload lesson_videos row (cancel/abandon of a Bunny upload session) so the lesson can start a new session. Staff-guarded; only pending_upload rows of the given lesson; hard delete + audit. ONLY lesson_videos delete surface (0009 FORCE RLS has no DELETE policy). Authenticated-only grant (client RPC #39).';

-- only authenticated may call it (client RPC surface)
REVOKE EXECUTE ON FUNCTION public.delete_video_upload_record(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_video_upload_record(uuid, uuid) TO authenticated;
