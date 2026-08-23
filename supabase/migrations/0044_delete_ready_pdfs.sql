-- =====================================================================
-- 0043_delete_ready_pdfs.sql
-- Extends delete_pdf_upload_record (0037) so staff can also delete
-- READY (finalized) lesson PDFs, not only failed-upload ghost rows.
--
-- 0037 intentionally refused ready rows (pdf_not_pending) because the
-- wrapper was scoped to upload-cleanup. With the new staff UI request,
-- finalized PDFs must be removable too (e.g. replacing outdated course
-- material), so the refusal is dropped:
--   * staff-only guard unchanged: is_admin() OR is_mr_walid()
--   * row must exist, belong to the given lesson, not soft-deleted
--   * hard DELETE + audit; action distinguishes intent:
--       - non-ready row -> 'pdf.upload_cancelled' (as before)
--       - ready row     -> 'pdf.deleted'
--   * deleting a primary PDF leaves the lesson without a primary;
--     students simply see no PDF until staff finalize another one.
--
-- The delete-pdf Edge Function removes the Storage object best-effort
-- before calling this wrapper (unchanged contract).
--
-- Error surface (P0001 + detail message):
--   permission_denied | pdf_not_found | wrong_lesson
-- ('pdf_not_pending' is no longer raised.)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.delete_pdf_upload_record(
    p_lesson_id uuid,
    p_pdf_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
    v_ready boolean;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lp.lesson_id, lp.is_ready INTO v_lesson, v_ready
    FROM public.lesson_pdfs lp
    WHERE lp.id = p_pdf_id AND lp.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'pdf_not_found';
    END IF;
    IF v_lesson <> p_lesson_id THEN
        RAISE EXCEPTION 'wrong_lesson';
    END IF;

    DELETE FROM public.lesson_pdfs WHERE id = p_pdf_id;

    PERFORM public.audit_log(
        CASE WHEN v_ready THEN 'pdf.deleted' ELSE 'pdf.upload_cancelled' END,
        'lesson_pdf', p_pdf_id,
        jsonb_build_object('lesson_id', p_lesson_id));
END $$;

COMMENT ON FUNCTION public.delete_pdf_upload_record(uuid, uuid) IS
'Phase 4 staff wrapper (extended by 0043): hard-deletes a lesson_pdfs row of the given lesson — failed/abandoned uploads AND finalized PDFs. Staff-guarded; hard delete + audit (pdf.upload_cancelled for ghost rows, pdf.deleted for ready ones). Authenticated-only grant.';

-- only authenticated may call it (client RPC surface)
REVOKE EXECUTE ON FUNCTION public.delete_pdf_upload_record(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_pdf_upload_record(uuid, uuid) TO authenticated;
