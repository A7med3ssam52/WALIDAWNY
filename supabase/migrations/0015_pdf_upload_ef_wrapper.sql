-- =====================================================================
-- 0015_pdf_upload_ef_wrapper
-- Phase 4 | Curriculum & Content Management | Database
-- Edge-Function support for the upload-pdf function (ARCHITECTURE.md
-- §8.4 row 5, §8.3), following the Phase 3 caller-token pattern (0014).
--
-- Problem 1 (lesson_pdfs INSERT): 0009 gives lesson_pdfs a SELECT-only
-- policy (staff branch / gated student branch) and FORCE RLS is on
-- (0009:201-208), so a PostgREST caller-token client CANNOT insert the
-- pending PDF row. Fix: a staff-guarded SECURITY DEFINER wrapper
-- create_pdf_upload_record() that creates the row (is_ready=false,
-- is_primary=false), resolves the storage_path as '{lesson_id}/{uuid}.pdf'
-- server-side (gen_random_uuid -- the client NEVER supplies a path), and
-- audits the start of the upload. The lesson_pdfs table has no
-- created_by column (0002:200-212); the actor is carried by the audit
-- row only.
--
-- Problem 2 (signed upload URL issuance): the storage API's
-- createSignedUploadUrl endpoint (I4) requires the caller to satisfy an
-- INSERT policy on storage.objects at issuance time ("RLS policy
-- permissions required: objects -> insert"; Supabase Storage docs). With
-- FORCE RLS and zero object policies (0011), a caller-token issuance
-- fails with 403. Fix: one narrowly-scoped INSERT policy on the pdfs
-- bucket whose WITH CHECK requires BOTH:
--   * the exact '{uuid}/{uuid}.pdf' path shape, AND
--   * an existing, non-deleted lesson_pdfs row with that storage_path
--     VISIBLE TO THE CALLER.
-- The row-visibility half is the security boundary: pending rows
-- (is_ready=false) are invisible to students under the 0009 SELECT
-- policy, so only staff can reserve paths, and a student can never mint
-- one; every row-backed path already holds its object (created by the
-- real upload flow) so a student's direct upload to a visible primary
-- path conflicts (409) and upsert paths need an UPDATE policy (none).
-- NO SELECT/UPDATE/DELETE object policies are added: object reads stay
-- locked behind the Phase 6 get-pdf-signed-url Edge Function (0009
-- comment, SECURITY.md section 9).
--
-- This is the ONLY storage object policy in the project; it is the
-- minimal exception to "no direct object policies" required to keep
-- issuance caller-token-driven (no service-role key in Edge Functions,
-- Phase 3 pattern). Documented in ARCHITECTURE.md §8.3 as the delivery
-- mechanism for signed upload URLs.
--
-- finalize_pdf_upload (0007:800) needs NO change: it is already
-- SECURITY DEFINER, granted to authenticated (0010:116), and its
-- is_admin()/is_mr_walid() guard reads the request-scoped claims
-- (auth.uid()) exactly like create_codes_for_staff (0014) -- verified
-- over a caller token in the Phase 4 harness tests below.
-- Append-only migration; nothing in 0002/0007/0009/0010/0011 is
-- rewritten.
-- Reference: DATABASE.md section 6.4 (staff RPCs), section 8 (storage).
-- =====================================================================

-- ---------------------------------------------------------------------
-- create_pdf_upload_record(p_lesson_id, p_original_name, p_size_bytes)
-- Staff-guarded EF entry point: reserves the storage path and creates
-- the pending lesson_pdfs row. Validation of the file name characters,
-- the .pdf extension and the size cap happens in the Edge Function;
-- the wrapper enforces the DB-visible invariants (lesson exists, lesson
-- not soft-deleted, size bounds) and never interprets client-supplied
-- path components (the path is generated here).
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
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
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

-- ---------------------------------------------------------------------
-- Grant matrix: authenticated only, staff enforced in-function (same
-- posture as create_codes_for_staff, 0014; explicit REVOKE FROM PUBLIC
-- first because new functions otherwise inherit the PUBLIC default
-- grant). anon: nothing.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_pdf_upload_record(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pdf_upload_record(uuid, text, bigint) TO authenticated;

-- ---------------------------------------------------------------------
-- Storage: pdfs INSERT policy (see header for the security analysis).
-- Signed-upload-URL issuance over the caller-token path requires the
-- caller to satisfy an INSERT policy on storage.objects; the WITH CHECK
-- binds the path to an existing lesson_pdfs row visible to the caller.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        DROP POLICY IF EXISTS pdfs_insert_row_backed ON storage.objects;
        CREATE POLICY pdfs_insert_row_backed ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'pdfs'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
                AND EXISTS (
                    SELECT 1 FROM public.lesson_pdfs
                    WHERE storage_path = name AND deleted_at IS NULL
                )
            );
    END IF;
END$$;