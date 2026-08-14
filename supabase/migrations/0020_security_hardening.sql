-- =====================================================================
-- 0020_security_hardening
-- Phase 9 | Security Hardening | Database
-- Closing gaps found by the Phase 9 security review (read-only review
-- agent) WITHOUT changing any behavior tests rely on:
--
--   HARD-1 (MED): the intended "column-scoped" notifications UPDATE
--   policy (UPDATE OF is_read, read_at - documented as binding B2
--   "belt-and-braces") is invalid PostgreSQL: RLS policies cannot scope
--   columns, and FOR UPDATE OF is a SELECT row-lock clause that takes
--   table names only (SQLSTATE 42601 syntax error). The real B2
--   enforcement is the REVOKE in 0010: anon/authenticated hold no
--   direct UPDATE on notifications, so read-state writes exist only via
--   the security-definer mark_notification_read /
--   mark_all_notifications_read RPCs. This migration re-asserts the
--   row-level policy (0009 shape) and re-asserts the REVOKE so the
--   read-state-only surface cannot silently reappear through drift.
--
--   HARD-2 (LOW): pdfs_insert_row_backed (0015) treated ANY row-backed
--   path visible to the caller as insertable, including the ready
--   primary PDF of an accessible lesson. A student satisfying the
--   policy could plant bytes at a primary path if that object was ever
--   left dangling on the bucket. Tighten: only a NOT-ready, NOT-primary
--   (pending) row-backed path satisfies the INSERT policy. This still
--   permits the real upload-pdf EF flow (0015: create a pending row ->
--   issue the I4 signed upload URL -> PUT bytes -> finalize), and
--   prevents INSERT at ready/primary paths entirely.
--
-- HARD-2 does not disturb storage semantics: the pending row exists at
-- signed-URL issuance time, which is when storage checks the INSERT
-- policy; finalize (0007) flips is_ready/is_primary afterwards.
-- =====================================================================

-- ---------------------------------------------------------------------
-- HARD-1: notifications UPDATE policy - row-level only (column-scoping
-- is a privilege-layer concern, not an RLS one: FOR UPDATE OF is a
-- SELECT row-lock clause accepting table names only).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS notifications_update_read_state ON public.notifications;
CREATE POLICY notifications_update_read_state ON public.notifications
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Belt-and-braces (binding B2): re-assert the 0010 REVOKE idempotently.
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- HARD-2: pdfs INSERT policy only at pending (not ready, not primary)
-- row-backed paths - no planting at visible primary PDF objects.
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
                      AND is_ready = false AND is_primary = false
                )
            );
    END IF;
END$$;
