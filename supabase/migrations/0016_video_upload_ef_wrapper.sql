-- =====================================================================
-- 0016_video_upload_ef_wrapper.sql
-- Phase 5 (Bunny video): reservation wrapper for the
-- create-video-upload-session Edge Function.
--
-- Why a SECURITY DEFINER wrapper (same shape as 0015, pdfs):
--   0009 gives lesson_videos a SELECT-only policy
--   (lesson_videos_select_gated) and FORCE RLS, so a caller-token INSERT
--   is blocked by row-level security. This wrapper is the ONLY insert
--   surface for lesson_videos rows and re-validates every Phase 1/5 rule
--   server-side (authoritative backstop; the Edge Function pre-checks
--   the same rules over the caller token for UX).
--
-- Rules enforced (documented in ARCHITECTURE.md §8.2 / §7.2):
--   * staff only: is_admin() OR is_mr_walid() (request-scoped claims)
--   * p_mode is 'create' or 'replace'
--   * bunny_video_id / bunny_library_id non-empty (constraint-checked
--     by 0002 as well)
--   * lesson exists and is NOT soft-deleted (lesson_not_found /
--     lesson_deleted)
--   * Phase 1 orphan rule: at most ONE pending_upload row per lesson
--     (lesson_has_pending_upload) — an abandoned session must never be
--     hidden behind a stale one; expired sessions are reconciled by the
--     recheck-video-states Edge Function (Phase 5, J2)
--   * replace mode: old video must exist, belong to the SAME lesson,
--     and be 'ready' (old_video_not_found / wrong_lesson /
--     old_video_not_ready)
--   * primary rule (B9/MED-10): a CREATE row becomes primary ONLY when
--     the lesson has no live primary; a REPLACE row never takes the
--     primary slot here — promotion happens on 'ready' via
--     set_video_status (0008, UNCHANGED)
--
-- Error surface (same convention as 0015: P0001 + detail message):
--   permission_denied | invalid_mode | invalid_bunny_video_id |
--   lesson_not_found | lesson_deleted | lesson_has_pending_upload |
--   old_video_required | old_video_not_found | wrong_lesson |
--   old_video_not_ready
--
-- Grant surface: authenticated ONLY (client RPC #38, count asserted in
-- tests/local/sql/05_grants.sql). anon stays fully locked.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_video_upload_record(
    p_lesson_id uuid,
    p_bunny_video_id text,
    p_bunny_library_id text,
    p_title text,
    p_mode text,
    p_old_video_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, is_primary boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_primary boolean;
    v_old_status public.video_status;
    v_old_lesson uuid;
BEGIN
    -- staff guard reads the request-scoped claims (is_admin/is_mr_walid
    -- are RLS policy helpers granted to authenticated; see 0010)
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_mode NOT IN ('create', 'replace') THEN
        RAISE EXCEPTION 'invalid_mode';
    END IF;

    IF p_bunny_video_id IS NULL OR btrim(p_bunny_video_id) = ''
       OR p_bunny_library_id IS NULL OR btrim(p_bunny_library_id) = '' THEN
        RAISE EXCEPTION 'invalid_bunny_video_id';
    END IF;

    -- NOTE: unqualified column refs must be avoided: the RETURNS TABLE
    -- OUT parameters (id, is_primary) shadow table columns in SQL
    -- statements (same rule as 0015 §85).
    IF NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id) THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id AND l.deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'lesson_deleted';
    END IF;

    -- orphan-session guard (Phase 1 rule): at most one pending upload
    IF EXISTS (
        SELECT 1 FROM public.lesson_videos lv
        WHERE lv.lesson_id = p_lesson_id
          AND lv.status = 'pending_upload'
          AND lv.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'lesson_has_pending_upload';
    END IF;

    IF p_mode = 'replace' THEN
        IF p_old_video_id IS NULL THEN
            RAISE EXCEPTION 'old_video_required';
        END IF;
        SELECT lv.status, lv.lesson_id INTO v_old_status, v_old_lesson
        FROM public.lesson_videos lv
        WHERE lv.id = p_old_video_id AND lv.deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'old_video_not_found';
        END IF;
        IF v_old_lesson <> p_lesson_id THEN
            RAISE EXCEPTION 'wrong_lesson';
        END IF;
        IF v_old_status <> 'ready' THEN
            RAISE EXCEPTION 'old_video_not_ready';
        END IF;
        v_primary := false;
    ELSE
        v_primary := NOT EXISTS (
            SELECT 1 FROM public.lesson_videos lv
            WHERE lv.lesson_id = p_lesson_id AND lv.is_primary AND lv.deleted_at IS NULL
        );
    END IF;

    INSERT INTO public.lesson_videos
        (lesson_id, bunny_video_id, bunny_library_id, title, status, is_primary, sort_order)
    VALUES
        (p_lesson_id, btrim(p_bunny_video_id), btrim(p_bunny_library_id),
         btrim(p_title), 'pending_upload', v_primary, 0)
    RETURNING lesson_videos.id INTO v_id;

    PERFORM public.audit_log('video.upload_session_created', 'lesson_video', v_id,
        jsonb_build_object('lesson_id', p_lesson_id, 'mode', p_mode,
                           'bunny_video_id', p_bunny_video_id,
                           'old_video_id', p_old_video_id,
                           'is_primary', v_primary));

    RETURN QUERY SELECT v_id, v_primary;
END $$;

COMMENT ON FUNCTION public.create_video_upload_record(uuid, text, text, text, text, uuid) IS
'Phase 5 staff wrapper: reserves the pending lesson_videos row for a Bunny upload session (create/replace). Staff-guarded, enforces the one-pending-row-per-lesson rule and the replace target rules. ONLY lesson_videos insert surface (0009 FORCE RLS has no INSERT policy). Authenticated-only grant (client RPC #38).';

-- only authenticated may call it (client RPC surface)
REVOKE EXECUTE ON FUNCTION public.create_video_upload_record(uuid, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_video_upload_record(uuid, text, text, text, text, uuid) TO authenticated;
