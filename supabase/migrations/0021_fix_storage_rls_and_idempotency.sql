-- =====================================================================
-- 0021_fix_storage_rls_and_idempotency
-- Phase 9 | Security Hardening | Database
-- Runtime fixes from the full-schema review (schema-analysis report):
--
--   H1: storage.objects had ONLY an INSERT policy (pdfs_insert_row_backed,
--   0015/0020). The Supabase Storage API performs INSERT ... RETURNING *,
--   so every upload aborts with 42501 ("new row violates row-level security
--   policy") unless a SELECT policy covers the inserted row. Fix: add the
--   row-backed SELECT mirror of the INSERT check - same bucket, same
--   {uuid}/{uuid}.pdf path shape, same existing non-deleted lesson_pdfs
--   row, same pending-only (is_ready=false AND is_primary=false, 0020
--   HARD-2) scope. Object reads of READY assets stay locked behind the
--   get-pdf-signed-url Edge Function (service key) as before.
--
--   H2: 0011 set FORCE ROW LEVEL SECURITY on storage.objects. The storage
--   service connects as supabase_storage_admin (rolbypassrls=false), so
--   under FORCE every storage-internal statement must satisfy a policy -
--   including operations the schema's single INSERT policy cannot cover
--   (finalize bookkeeping, moves, deletes, ownership updates), which fail
--   with 42501. Fix: NO FORCE (keep ENABLE), restoring the hosted default
--   where the table owner / storage service is exempt from RLS.
--
-- Both statements are guarded on to_regclass('storage.objects') so this
-- migration also runs unchanged on the local harness shim (which has the
-- same storage.objects surface) and on hosted (which always has it).
-- =====================================================================

-- ---------------------------------------------------------------------
-- H2: storage.objects - keep RLS enabled, drop FORCE.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
        BEGIN
            ALTER TABLE storage.objects NO FORCE ROW LEVEL SECURITY;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'storage.objects is platform-owned (supabase_storage_admin): skipping NO FORCE - hosted default is already not forced';
        END;
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- H1: pdfs SELECT policy - row-backed mirror of the INSERT check.
-- Required by the Storage API's INSERT ... RETURNING * upload path
-- (42501 without it); pending-only like the INSERT policy (0020 HARD-2).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
        DROP POLICY IF EXISTS pdfs_select_row_backed ON storage.objects;
        CREATE POLICY pdfs_select_row_backed ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'pdfs'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
                AND EXISTS (
                    SELECT 1 FROM public.lesson_pdfs
                    WHERE storage_path = name AND deleted_at IS NULL
                      AND is_ready = false AND is_primary = false
                )
            );
    END IF;
END$$;
