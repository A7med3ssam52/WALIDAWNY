-- =====================================================================
-- 0042_videos_multi_youtube
-- Phase 5 (Bunny video) | Multi-video lessons + YouTube | Database
--
-- The teacher can now attach MULTIPLE videos to one lesson (the schema
-- already supported it structurally via is_primary; the blockers were
-- the student RLS gate and the one-pending-upload-per-lesson rule) and
-- add YouTube videos by URL alongside Bunny uploads.
--
--   C1: lesson_videos gains `source` ('bunny'|'youtube') and nullable
--       `youtube_video_id`; bunny_video_id DROPs NOT NULL (youtube rows
--       have no Bunny id) while keeping its length CHECK (NULL passes).
--       A CHECK enforces the exact source/asset pairing and a partial
--       UNIQUE index guards youtube_video_id globally (soft-deleted
--       rows included - a deleted video id is never re-registered).
--       bunny_library_id stays NOT NULL (0002); youtube rows carry the
--       literal 'youtube' placeholder so the column needs no change.
--       Existing bunny rows default to source='bunny' untouched.
--
--   C2: lesson_videos_select_gated is recreated (0025 canonical shape +
--       is_teacher branch) with the `is_primary` condition REMOVED: a
--       student now sees EVERY status='ready' non-deleted video of a
--       lesson they can access (multi-video UX). `deleted_at IS NULL`
--       is added explicitly - previously soft-deleted rows were hidden
--       implicitly by the is_primary filter (0004 clears it), so the
--       new policy must state it itself. Staff policies untouched.
--
--   C3: create_video_upload_record (0025 body) is recreated with ONLY
--       the lesson_has_pending_upload orphan block removed: parallel
--       background uploads may now coexist for one lesson. Everything
--       else (staff guard, mode rules, replace target rules, primary
--       logic, audit) is UNCHANGED; the COMMENT is refreshed.
--
--   C4: add_youtube_video(lesson, url[, title]) - NEW staff RPC. The
--       YouTube id is extracted SERVER-side by the new internal helper
--       youtube_video_id_from_url (youtu.be/, watch?v=, /embed/,
--       /shorts/, m. subdomain, or a bare 11-char id) - the client can
--       never pick the id. Guards: staff three-way (is_admin OR
--       is_mr_walid OR is_teacher), lesson exists + not soft-deleted,
--       invalid_youtube_url, youtube_video_duplicate (pre-check + the
--       unique index as final guard via unique_violation handler).
--       First video of a lesson takes is_primary (B9/MED-10 shape,
--       exactly like create mode in 0016); status='ready' (no Bunny
--       processing pipeline exists for YouTube); title NULL/empty ->
--       'فيديو يوتيوب', sanitized to <=255 chars; audit
--       video.youtube_added; authenticated-only grant (0016 pattern).
--
--   C5: delete_lesson_video(lesson, video_id) - NEW staff RPC. Soft-
--       deletes (deleted_at=now(); the 0004 trigger clears is_primary
--       in the same transaction). When the deleted video WAS the
--       primary, the oldest ready non-deleted sibling (created_at, id
--       tiebreak) is promoted - the 0008 promotion pattern; a lesson
--       with no ready sibling stays primary-less (students see all
--       ready rows anyway). Guards: staff three-way, video_not_found
--       (missing or already soft-deleted), wrong_lesson; audit
--       video.deleted; authenticated-only grant (0031 pattern).
--
-- Error surface (P0001 + detail message, same convention as 0016):
--   permission_denied | lesson_not_found | lesson_deleted |
--   invalid_youtube_url | youtube_video_duplicate | video_not_found |
--   wrong_lesson
-- =====================================================================

-- ---------------------------------------------------------------------
-- C1: source / youtube_video_id columns + cross-column CHECK + global
-- youtube unique index (bunny_video_id DROPs NOT NULL; its length
-- CHECK stays and passes NULL).
-- ---------------------------------------------------------------------
ALTER TABLE public.lesson_videos
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'bunny',
    ADD COLUMN IF NOT EXISTS youtube_video_id text;

ALTER TABLE public.lesson_videos ALTER COLUMN bunny_video_id DROP NOT NULL;

ALTER TABLE public.lesson_videos DROP CONSTRAINT IF EXISTS lesson_videos_source_check;
ALTER TABLE public.lesson_videos ADD CONSTRAINT lesson_videos_source_check CHECK (
    source IN ('bunny', 'youtube')
    AND (
        (source = 'bunny' AND bunny_video_id IS NOT NULL AND youtube_video_id IS NULL)
        OR (source = 'youtube' AND youtube_video_id IS NOT NULL AND bunny_video_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_videos_youtube
    ON public.lesson_videos (youtube_video_id)
    WHERE youtube_video_id IS NOT NULL;

COMMENT ON TABLE public.lesson_videos IS 'Videos attached to lessons (Bunny-backed or YouTube, source column). Exactly one non-deleted primary per lesson (partial unique, binding B9); soft-delete clears is_primary in the same transaction. youtube_video_id is globally unique (partial unique); bunny rows keep bunny_video_id + bunny_library_id (youtube rows carry the ''youtube'' library placeholder).';

-- ---------------------------------------------------------------------
-- C2: student video gate - every ready non-deleted video of an
-- accessible lesson (is_primary condition removed; 0025 teacher branch
-- preserved; deleted_at filter now explicit).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_videos_select_gated ON public.lesson_videos;
CREATE POLICY lesson_videos_select_gated ON public.lesson_videos
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND status = 'ready' AND deleted_at IS NULL)
    );

-- ---------------------------------------------------------------------
-- C3: create_video_upload_record - the lesson_has_pending_upload block
-- is removed ONLY (multi-upload/parallel sessions); body otherwise the
-- 0025 canonical version, guard included.
-- ---------------------------------------------------------------------
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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
'Phase 5 staff wrapper: reserves the pending lesson_videos row for a Bunny upload session (create/replace). Staff-guarded, enforces the replace target rules. 0042: the one-pending-row-per-lesson orphan rule was REMOVED (parallel upload sessions). ONLY lesson_videos insert surface (0009 FORCE RLS has no INSERT policy). Authenticated-only grant (client RPC #38).';

-- ---------------------------------------------------------------------
-- C4: add_youtube_video - staff RPC; server-side youtube id extraction
-- ---------------------------------------------------------------------

-- internal helper: extracts the 11-char youtube id from the known URL
-- shapes or a bare id; NULL when the input is not a valid form.
CREATE OR REPLACE FUNCTION public.youtube_video_id_from_url(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT CASE
        WHEN p_url ~ '^(?:https?://)?(?:www\.|m\.)?youtu\.be/' THEN
            (regexp_match(p_url, 'youtu\.be/([A-Za-z0-9_-]{11})(?=[&#/?]|$)'))[1]
        WHEN p_url ~ '^(?:https?://)?(?:www\.|m\.)?youtube\.com/watch' THEN
            (regexp_match(p_url, '(?:[?&]v=)([A-Za-z0-9_-]{11})(?=[&#]|$)'))[1]
        WHEN p_url ~ '^(?:https?://)?(?:www\.|m\.)?youtube\.com/embed/' THEN
            (regexp_match(p_url, 'youtube\.com/embed/([A-Za-z0-9_-]{11})(?=[&#]|$)'))[1]
        WHEN p_url ~ '^(?:https?://)?(?:www\.|m\.)?youtube\.com/shorts/' THEN
            (regexp_match(p_url, 'youtube\.com/shorts/([A-Za-z0-9_-]{11})(?=[&#]|$)'))[1]
        WHEN p_url ~ '^[A-Za-z0-9_-]{11}$' THEN p_url
        ELSE NULL
    END;
$$;

COMMENT ON FUNCTION public.youtube_video_id_from_url(text) IS
'Internal 0042 helper: extracts the 11-char YouTube video id from youtu.be/, youtube.com/watch?v=, /embed/, /shorts/, the m. subdomain or a bare id; NULL for any other input. IMMUTABLE, no client grants.';

REVOKE EXECUTE ON FUNCTION public.youtube_video_id_from_url(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.add_youtube_video(
    p_lesson_id uuid,
    p_youtube_url text,
    p_title text DEFAULT NULL
)
RETURNS TABLE (id uuid, is_primary boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_primary boolean;
    v_youtube_id text;
    v_title text;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
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

    v_youtube_id := public.youtube_video_id_from_url(btrim(p_youtube_url));
    IF v_youtube_id IS NULL THEN
        RAISE EXCEPTION 'invalid_youtube_url';
    END IF;

    -- duplicate guard (soft-deleted rows included: the partial unique
    -- index never re-registers a deleted id either)
    IF EXISTS (
        SELECT 1 FROM public.lesson_videos lv
        WHERE lv.youtube_video_id = v_youtube_id
    ) THEN
        RAISE EXCEPTION 'youtube_video_duplicate';
    END IF;

    v_title := NULLIF(btrim(COALESCE(p_title, '')), '');
    IF v_title IS NULL THEN
        v_title := 'فيديو يوتيوب';
    END IF;
    v_title := left(v_title, 255);

    v_primary := NOT EXISTS (
        SELECT 1 FROM public.lesson_videos lv
        WHERE lv.lesson_id = p_lesson_id AND lv.is_primary AND lv.deleted_at IS NULL
    );

    -- source='youtube' rows carry no Bunny id; bunny_library_id stays
    -- NOT NULL (0002) and takes the 'youtube' placeholder
    BEGIN
        INSERT INTO public.lesson_videos
            (lesson_id, bunny_library_id, title, status, is_primary, sort_order, source, youtube_video_id)
        VALUES
            (p_lesson_id, 'youtube', v_title, 'ready', v_primary, 0, 'youtube', v_youtube_id)
        RETURNING lesson_videos.id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
        -- final guard: the partial unique index caught a concurrent
        -- duplicate registration
        RAISE EXCEPTION 'youtube_video_duplicate';
    END;

    PERFORM public.audit_log('video.youtube_added', 'lesson_video', v_id,
        jsonb_build_object('lesson_id', p_lesson_id, 'youtube_video_id', v_youtube_id,
                           'is_primary', v_primary));

    RETURN QUERY SELECT v_id, v_primary;
END $$;

COMMENT ON FUNCTION public.add_youtube_video(uuid, text, text) IS
'Phase 5 staff wrapper: registers a YouTube video on a lesson (source=''youtube'', status=''ready''). Staff-guarded (is_admin/is_mr_walid/is_teacher); server-side youtube id extraction (invalid_youtube_url); youtube_video_duplicate on a registered id; first video of a lesson takes is_primary; audit video.youtube_added. Authenticated-only grant (client RPC #39).';

-- only authenticated may call it (client RPC surface, 0016 pattern)
REVOKE EXECUTE ON FUNCTION public.add_youtube_video(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_youtube_video(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- C5: delete_lesson_video - staff RPC; soft-delete + primary promotion
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_lesson_video(
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
    v_was_primary boolean;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lv.lesson_id, lv.is_primary INTO v_lesson, v_was_primary
    FROM public.lesson_videos lv
    WHERE lv.id = p_video_id AND lv.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'video_not_found';
    END IF;
    IF v_lesson <> p_lesson_id THEN
        RAISE EXCEPTION 'wrong_lesson';
    END IF;

    -- soft-delete; the 0004 BEFORE trigger clears is_primary in the
    -- same transaction (partial unique, binding B9)
    UPDATE public.lesson_videos SET deleted_at = now() WHERE id = p_video_id;

    -- promotion (0008 pattern): the deleted video WAS the primary ->
    -- the oldest ready non-deleted sibling takes the slot; a lesson
    -- with no ready sibling stays primary-less (students see every
    -- ready row anyway, C2).
    IF v_was_primary THEN
        UPDATE public.lesson_videos SET is_primary = true
        WHERE id = (
            SELECT lv.id FROM public.lesson_videos lv
            WHERE lv.lesson_id = p_lesson_id
              AND lv.status = 'ready'
              AND lv.deleted_at IS NULL
            ORDER BY lv.created_at, lv.id
            LIMIT 1
        );
    END IF;

    PERFORM public.audit_log('video.deleted', 'lesson_video', p_video_id,
        jsonb_build_object('lesson_id', p_lesson_id));
END $$;

COMMENT ON FUNCTION public.delete_lesson_video(uuid, uuid) IS
'Phase 5 staff wrapper: soft-deletes a lesson_videos row (any status/source) and, when the deleted video was the primary, promotes the oldest ready non-deleted sibling (0008 pattern). Staff-guarded; video_not_found when absent/deleted; wrong_lesson on cross-lesson ids; audit video.deleted. Authenticated-only grant (client RPC #40).';

-- only authenticated may call it (client RPC surface, 0031 pattern)
REVOKE EXECUTE ON FUNCTION public.delete_lesson_video(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_lesson_video(uuid, uuid) TO authenticated;