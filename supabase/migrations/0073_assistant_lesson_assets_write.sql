-- =====================================================================
-- 0073_assistant_lesson_assets_write
-- Grants the assistant role lesson-assets WRITE parity with teacher.
--
-- Context:
--   * 0060 gave assistant full RLS parity, then 0064 restricted assistant
--     to exams (full CRUD) + curriculum READ-ONLY (RLS write revoked for
--     grades/units/lessons, announcements, codes, pricing).
--   * 0061 already granted assistant boards (create/finalize/delete/reorder)
--     + youtube (add/delete) RPCs. Those are NOT redefined here.
--   * MISSING: pdf/video-upload RPCs + Edge Function STAFF_ROLES still
--     reject assistant, so the LessonAssetsPage write UI (approved hybrid
--     decision: curriculum read-only, exams + lesson assets full write)
--     fails for assistants with permission_denied.
--
-- This migration mirrors TEACHER exactly for lesson assets:
--   * ALLOWED (teacher parity): create_pdf_upload_record,
--     finalize_pdf_upload, create_video_upload_record,
--     delete_video_upload_record.
--   * KEPT RESTRICTED (teacher parity): delete_pdf_upload_record stays
--     admin/mr_walid-only per 0044 (even teacher cannot delete PDFs).
--   * NOT TOUCHED: generate-unit-codes / pricing / grades / units /
--     lessons CRUD / announcements (0064 restrictions stand).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) finalize_pdf_upload(p_pdf_id) - 0025 canonical + assistant
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_pdf_upload(p_pdf_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT lesson_id INTO v_lesson FROM public.lesson_pdfs WHERE id = p_pdf_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'pdf_not_found';
    END IF;

    UPDATE public.lesson_pdfs
    SET is_primary = false
    WHERE lesson_id = v_lesson AND id <> p_pdf_id AND is_primary AND deleted_at IS NULL;

    UPDATE public.lesson_pdfs SET is_ready = true, is_primary = true WHERE id = p_pdf_id;

    PERFORM public.audit_log('pdf.finalize', 'lesson_pdf', p_pdf_id,
        jsonb_build_object('lesson_id', v_lesson));
END $$;

COMMENT ON FUNCTION public.finalize_pdf_upload(uuid) IS
'Extended by 0073: staff guard now includes assistant (teacher parity for lesson assets).';

-- ---------------------------------------------------------------------
-- 2) create_pdf_upload_record(p_lesson_id, p_original_name, p_size_bytes)
--    - 0025 canonical + assistant
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_pdf_upload_record(
    p_lesson_id uuid,
    p_original_name text,
    p_size_bytes bigint DEFAULT NULL
)
RETURNS TABLE (id uuid, storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_path text;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_size_bytes IS NOT NULL AND (p_size_bytes < 0 OR p_size_bytes > 52428800) THEN
        RAISE EXCEPTION 'invalid_pdf_size';
    END IF;

    -- NOTE: unqualified column refs must be avoided: the RETURNS TABLE
    -- OUT parameter `id` shadows table columns in SQL statements.
    IF NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id) THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id AND l.deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'lesson_deleted';
    END IF;

    v_path := p_lesson_id::text || '/' || gen_random_uuid()::text || '.pdf';

    INSERT INTO public.lesson_pdfs (lesson_id, storage_path, original_name, size_bytes, is_ready, is_primary)
    VALUES (p_lesson_id, v_path, btrim(p_original_name), p_size_bytes, false, false)
    RETURNING lesson_pdfs.id INTO v_id;

    PERFORM public.audit_log('pdf.upload_started', 'lesson_pdf', v_id,
        jsonb_build_object('lesson_id', p_lesson_id, 'original_name', p_original_name,
                           'storage_path', v_path, 'size_bytes', p_size_bytes));

    RETURN QUERY SELECT v_id, v_path;
END $$;

COMMENT ON FUNCTION public.create_pdf_upload_record(uuid, text, bigint) IS
'Extended by 0073: staff guard now includes assistant (teacher parity for lesson assets).';

-- ---------------------------------------------------------------------
-- 3) create_video_upload_record(...) - 0042 canonical + assistant
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
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
    -- statements (same rule as 0015 :85).
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
'Extended by 0073: staff guard now includes assistant (teacher parity for lesson assets). 0042 parallel-sessions shape kept.';

-- ---------------------------------------------------------------------
-- 4) delete_video_upload_record(p_lesson_id, p_video_id)
--    - 0025 canonical + assistant
-- ---------------------------------------------------------------------
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
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
'Extended by 0073: staff guard now includes assistant (teacher parity for lesson assets).';

-- ---------------------------------------------------------------------
-- NOTE: delete_pdf_upload_record (0044) INTENTIONALLY UNCHANGED:
-- admin/mr_walid-only (even teacher excluded). Assistant parity with
-- teacher means no delete-PDF grant. The delete-pdf Edge Function edge
-- check mirrors teacher; the RPC remains the authoritative gate.
-- ---------------------------------------------------------------------
