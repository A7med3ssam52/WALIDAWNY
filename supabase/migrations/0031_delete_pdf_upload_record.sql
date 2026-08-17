-- =====================================================================
-- 0031_delete_pdf_upload_record.sql
-- Phase 4 (PDF upload): delete/release RPC for the delete-pdf Edge
-- Function (cleanup of ghost rows after a failed PUT/finalize).
--
-- Why a SECURITY DEFINER wrapper (same shape as 0015/0017): 0009 gives
-- lesson_pdfs a SELECT-only policy + FORCE RLS, so a caller-token
-- DELETE is silently a no-op (0 rows). This wrapper is the ONLY delete
-- surface for lesson_pdfs rows and re-validates every rule
-- server-side (authoritative backstop; the Edge Function pre-checks the
-- same rules over the caller token for UX).
--
-- Purpose: a PDF upload row that failed before finalize (is_ready=false)
-- would otherwise accumulate forever: handleUpload resets the UI and
-- clears the file on failure, and no orphan rule exists for lesson_pdfs.
-- The wrapper hard-deletes the non-ready row (no content was ever
-- committed) and audits the cancellation; the Edge Function removes the
-- Storage object best-effort.
--
-- Rules enforced:
--   * staff only: is_admin() OR is_mr_walid() (request-scoped claims)
--   * the row must exist and must NOT be soft-deleted (pdf_not_found)
--   * the row must belong to the given lesson (wrong_lesson)
--   * the row must NOT be ready (pdf_not_pending) — a finalized row
--     must never be silently removed
--   * hard DELETE + audit (pdf.upload_cancelled)
--
-- Error surface (P0001 + detail message):
--   permission_denied | pdf_not_found | wrong_lesson | pdf_not_pending
--
-- Grant surface: authenticated ONLY (client RPC #65, count asserted in
-- tests/local/sql/05_grants.sql). anon stays fully locked.
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
    IF v_ready THEN
        RAISE EXCEPTION 'pdf_not_pending';
    END IF;

    DELETE FROM public.lesson_pdfs WHERE id = p_pdf_id;

    PERFORM public.audit_log('pdf.upload_cancelled', 'lesson_pdf', p_pdf_id,
        jsonb_build_object('lesson_id', p_lesson_id));
END $$;

COMMENT ON FUNCTION public.delete_pdf_upload_record(uuid, uuid) IS
'Phase 4 staff wrapper: hard-deletes a non-ready lesson_pdfs row (failed/abandoned PDF upload) so ghost rows can be cleaned from the UI. Staff-guarded; only non-ready rows of the given lesson; hard delete + audit. Authenticated-only grant (client RPC #65).';

-- only authenticated may call it (client RPC surface)
REVOKE EXECUTE ON FUNCTION public.delete_pdf_upload_record(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_pdf_upload_record(uuid, uuid) TO authenticated;