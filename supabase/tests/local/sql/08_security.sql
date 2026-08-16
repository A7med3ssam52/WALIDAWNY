-- =====================================================================
-- 08_security.sql -- Phase 9 Security Hardening assertions
-- ---------------------------------------------------------------------
-- Dedicated security suite (BLUEPRINT row 9 / PLAN PHASE 9):
--   1. search_path hardening lock    (every public SECURITY DEFINER pins
--                                     search_path = public -- B1, no
--                                     regression lock existed before)
--   2. storage.objects policy lock   (exactly two policies: the INSERT
--                                     pdfs_insert_row_backed + the 0021
--                                     SELECT pdfs_select_row_backed RETURNING
--                                     mirror, both authenticated-only and
--                                     pending-only; no UPDATE/DELETE/anon;
--                                     RLS ENABLE-without-FORCE per 0021)
--   3. B2 belt-and-braces scope      (column-scoped notifications UPDATE:
--                                     even with table-level UPDATE, only
--                                     is_read/read_at are writable)
--   4. cross-user IDOR negatives     (mark_read on another user's id is a
--                                     no-op; purchases own-only;
--                                     grade-mismatch progress denied)
--   5. Phase 5/8 boundary matrix     (student cannot reach staff PDF/video/
--                                     audit RPCs; mr_walid cannot reach
--                                     admin-only audit reads)
--   6. grant-drift anchors           (anon stays locked out of internal
--                                     helpers newly added since 05)
-- Self-contained fixtures (SEC-08-*), removed at the end.
-- =====================================================================

-- =====================================================================
-- Section 1: search_path hardening lock (NEW)
-- Every SECURITY DEFINER function in public MUST pin `search_path = public`
-- (binding B1). Before 08 this was only spot-checked; now it is a hard
-- regression lock so any future SECURITY DEFINER without the pin fails CI.
-- =====================================================================
SELECT tests.assert(
    (SELECT count(*) = 0 FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
       AND NOT (p.proconfig @> ARRAY['search_path=public'])),
    'sec: every public SECURITY DEFINER function pins search_path=public');

-- =====================================================================
-- Section 2: storage.objects policy inventory lock (REVISED, 0021)
-- The Storage API uploads with INSERT ... RETURNING *, so a SELECT
-- policy covering the inserted row is REQUIRED (42501 without it).
-- Exactly TWO policies may exist:
--   * pdfs_insert_row_backed FOR INSERT TO authenticated (0015/0020,
--     pending-only: is_ready=false AND is_primary=false)
--   * pdfs_select_row_backed FOR SELECT TO authenticated (0021, the
--     row-backed RETURNING mirror, same pending-only scope)
-- No UPDATE/DELETE and no anon surface may ever be reintroduced, and
-- storage.objects must stay ENABLE-without-FORCE (0021 H2: the storage
-- service role must not be subject to RLS on its own bookkeeping).
-- =====================================================================
SELECT tests.assert(
    (SELECT count(*) = 2 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'),
    'sec: exactly two storage.objects policies (INSERT + SELECT)');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'pdfs_insert_row_backed'
        AND cmd = 'INSERT' AND permissive = 'PERMISSIVE'
        AND roles::text = '{authenticated}'),
    'sec: pdfs_insert_row_backed FOR INSERT TO authenticated');

SELECT tests.assert(
    (SELECT COALESCE(with_check, qual) LIKE '%is_ready = false%'
        AND COALESCE(with_check, qual) LIKE '%is_primary = false%'
      FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'pdfs_insert_row_backed'),
    'sec: pdfs_insert_row_backed is pending-only (0020 HARD-2)');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'pdfs_select_row_backed'
        AND cmd = 'SELECT' AND permissive = 'PERMISSIVE'
        AND roles::text = '{authenticated}'),
    'sec: pdfs_select_row_backed FOR SELECT TO authenticated exists (0021 H1)');

SELECT tests.assert(
    (SELECT qual LIKE '%bucket_id = ''pdfs''%'
        AND qual LIKE '%lesson_pdfs%'
        AND qual LIKE '%is_ready = false%'
        AND qual LIKE '%is_primary = false%'
      FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'pdfs_select_row_backed'),
    'sec: pdfs_select_row_backed is the pending-only row-backed mirror (0021 H1)');

SELECT tests.assert(
    (SELECT count(*) = 0 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND (cmd = 'UPDATE' OR cmd = 'DELETE')),
    'sec: no UPDATE/DELETE policy on storage.objects');

SELECT tests.assert(
    (SELECT count(*) = 0 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND 'anon' = ANY(roles)),
    'sec: no anon policy on storage.objects');

SELECT tests.assert(
    (SELECT relrowsecurity AND NOT relforcerowsecurity
     FROM pg_class WHERE oid = 'storage.objects'::regclass),
    'sec: storage.objects is ENABLE-without-FORCE (0021 H2)');

-- live H1 proof: INSERT ... RETURNING * at a pending row-backed path
-- succeeds for a staff member (the SELECT policy covers the returned
-- row); the fixture row is cleaned up afterwards.
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.create_pdf_upload_record(''40000000-0000-0000-0000-000000000001'', ''SEC-08-RET.pdf'', 7)',
    1, 'sec: pending row reserved for RETURNING proof');
SELECT tests.expect_rows(
    'INSERT INTO storage.objects (bucket_id, name)
     VALUES (''pdfs'', (SELECT storage_path FROM public.lesson_pdfs WHERE original_name = ''SEC-08-RET.pdf''))
     RETURNING id',
    1, 'sec: INSERT ... RETURNING succeeds at a pending row-backed path (0021 H1)');
RESET ROLE;
RESET "app.current_user_id";
DELETE FROM storage.objects WHERE bucket_id = 'pdfs'
  AND name = (SELECT storage_path FROM public.lesson_pdfs WHERE original_name = 'SEC-08-RET.pdf');
DELETE FROM public.lesson_pdfs WHERE original_name = 'SEC-08-RET.pdf';
SELECT tests.assert(
    (SELECT NOT EXISTS (SELECT 1 FROM public.lesson_pdfs WHERE original_name = 'SEC-08-RET.pdf')),
    'sec: RETURNING-proof fixture cleaned up');

-- =====================================================================
-- Section 3: B2 belt-and-braces regression (REVISED)
-- The original draft asserted a "column-scoped" policy
-- (FOR UPDATE OF is_read, read_at) - invalid PostgreSQL: RLS policies
-- cannot scope columns, and FOR UPDATE OF is a SELECT row-lock clause
-- accepting table names only (SQLSTATE 42601). The real B2 enforcement
-- is the REVOKE in 0010/0020: anon/authenticated hold NO direct UPDATE
-- privilege (table- or column-level) on notifications - mark-read
-- exists only via the security-definer RPCs (mark_notification_read /
-- mark_all_notifications_read, exercised in Section 4). Prove the
-- grant side stays revoked, and that RLS row-scoping still confines
-- writes to own rows even if a future change re-grants table-level
-- UPDATE.
-- =====================================================================
SELECT tests.assert(
    NOT has_table_privilege('anon', 'public.notifications', 'UPDATE'),
    'sec: anon has no table-level UPDATE on notifications (B2)');
SELECT tests.assert(
    NOT has_table_privilege('authenticated', 'public.notifications', 'UPDATE'),
    'sec: authenticated has no table-level UPDATE on notifications (B2)');
SELECT tests.assert(
    NOT has_column_privilege('authenticated', 'public.notifications', 'is_read', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.notifications', 'title', 'UPDATE'),
    'sec: no column-level UPDATE on notifications either (B2)');

-- a probe role with direct table UPDATE (simulates a future re-grant)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sec_b2_probe') THEN
        CREATE ROLE sec_b2_probe NOLOGIN;
    END IF;
END$$;
GRANT USAGE ON SCHEMA public TO sec_b2_probe;
GRANT USAGE ON SCHEMA tests   TO sec_b2_probe;
GRANT SELECT, UPDATE ON TABLE public.notifications TO sec_b2_probe;

-- an own-row notification for A
INSERT INTO public.notifications (id, user_id, type, title, body, dedup_key, is_read)
VALUES ('a0000000-0000-0000-0000-0000000000e1', '70000000-0000-0000-0000-000000000001',
        'system', 'SEC-N1', 'x', 'SEC-08-N1', false)
ON CONFLICT (id) DO NOTHING;

-- own-row write is allowed (RLS policy applies)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE sec_b2_probe;
SELECT tests.expect_rows(
    'UPDATE public.notifications SET is_read = true WHERE id = ''a0000000-0000-0000-0000-0000000000e1''', 1,
    'sec: own-row UPDATE allowed under RLS even with a future table-level re-grant');
RESET ROLE;
RESET "app.current_user_id";

-- another user's row is unreachable even with table-level UPDATE
INSERT INTO public.notifications (id, user_id, type, title, body, dedup_key, is_read)
VALUES ('a0000000-0000-0000-0000-0000000000e3', '70000000-0000-0000-0000-000000000002',
        'system', 'SEC-N3', 'x', 'SEC-08-N3', false)
ON CONFLICT (id) DO NOTHING;
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE sec_b2_probe;
SELECT tests.expect_rows(
    'UPDATE public.notifications SET title = ''HACKED'' WHERE id = ''a0000000-0000-0000-0000-0000000000e3''', 0,
    'sec: cross-user UPDATE blocked by RLS row scope (own rows only)');
RESET ROLE;
RESET "app.current_user_id";

-- the probe writes must have confined to the intended rows
SELECT tests.assert(
    (SELECT title = 'SEC-N1' AND is_read FROM public.notifications WHERE id = 'a0000000-0000-0000-0000-0000000000e1'),
    'sec: own-row probe UPDATE applied only to own row');
SELECT tests.assert(
    (SELECT title = 'SEC-N3' AND NOT is_read FROM public.notifications WHERE id = 'a0000000-0000-0000-0000-0000000000e3'),
    'sec: cross-user probe attempt mutated nothing');

REVOKE ALL ON TABLE public.notifications FROM sec_b2_probe;
REVOKE USAGE ON SCHEMA public FROM sec_b2_probe;
REVOKE USAGE ON SCHEMA tests FROM sec_b2_probe;
DROP ROLE IF EXISTS sec_b2_probe;
DELETE FROM public.notifications
WHERE id IN ('a0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000e3');

-- =====================================================================
-- Section 4: cross-user IDOR negatives (NEW)
-- =====================================================================
-- (a) mark_notification_read on ANOTHER user's notification is a no-op
INSERT INTO public.notifications (id, user_id, type, title, body, dedup_key, is_read)
VALUES ('a0000000-0000-0000-0000-0000000000e2', '70000000-0000-0000-0000-000000000002',
        'system', 'SEC-N2', 'x', 'SEC-08-N2', false)
ON CONFLICT (id) DO NOTHING;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT public.mark_notification_read('a0000000-0000-0000-0000-0000000000e2');
SELECT tests.assert(
    (SELECT public.mark_all_notifications_read() IS NOT NULL), 'sec: mark_all returns normally');
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.assert(
    (SELECT NOT is_read FROM public.notifications WHERE id = 'a0000000-0000-0000-0000-0000000000e2'),
    'sec: mark_notification_read on another user''s id is a no-op');
DELETE FROM public.notifications WHERE id = 'a0000000-0000-0000-0000-0000000000e2';

-- (b) get_my_unit_purchases is own-only (0028). A owns u1 from the 02/04
-- fixtures; no student may ever see another student's purchase rows.
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    (SELECT EXISTS (SELECT 1 FROM public.get_my_unit_purchases()
      WHERE unit_id = '30000000-0000-0000-0000-000000000001')),
    'sec: get_my_unit_purchases returns own purchase');
SELECT tests.assert(
    (SELECT NOT EXISTS (SELECT 1 FROM public.get_my_unit_purchases()
      WHERE student_id <> '70000000-0000-0000-0000-000000000001')),
    'sec: get_my_unit_purchases never exposes another student''s purchase');
RESET ROLE;
RESET "app.current_user_id";

-- (c) upsert_progress on a lesson of another grade is denied
-- (l6 ...006 is published on grade 2; A is grade 1 with no grade-2 purchase)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000006'', 10, 50)',
    'P0001', 'access_denied');
RESET ROLE;
RESET "app.current_user_id";

-- =====================================================================
-- Section 5: Phase 5/8 boundary matrix (student / mr_walid)
-- Finalize/audit surfaces not already covered by 04/06/07:
--   student -> finalize_pdf_upload  access_denied (staff wrapper, 0007:810)
--   mr_walid -> list/count_audit_logs permission_denied (admin-only)
--   mr_walid -> get_dashboard_stats ALLOWED (0028: staff surface)
-- =====================================================================
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.finalize_pdf_upload(gen_random_uuid())',
    'P0001', 'access_denied');
RESET ROLE;
RESET "app.current_user_id";

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error('SELECT public.list_audit_logs()', 'P0001', 'permission_denied');
SELECT tests.expect_error('SELECT public.count_audit_logs()', 'P0001', 'permission_denied');
SELECT tests.assert((SELECT public.get_dashboard_stats() IS NOT NULL),
    'sec: mr_walid can call get_dashboard_stats (0028 staff surface)');
RESET ROLE;
RESET "app.current_user_id";

-- =====================================================================
-- Section 6: grant-drift negative anchors (NEW)
-- The internal helpers added after 05 stay locked for anon (mirrors the
-- authenticated checks in 05:112-125). Guards against a future system
-- function silently widening the anon executable surface.
-- =====================================================================
SELECT tests.assert(
    (SELECT count(*) = 3 FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND has_function_privilege('anon', oid, 'EXECUTE')),
    'sec: anon still has exactly three executable public functions (get_public_settings + list_active_grades + get_public_unit_prices)');

SELECT tests.assert(NOT has_function_privilege('anon', 'public.list_audit_logs(timestamptz, timestamptz, text, text, uuid, integer, integer)', 'EXECUTE'),
    'sec: anon cannot exec list_audit_logs');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.count_audit_logs(timestamptz, timestamptz, text, text, uuid)', 'EXECUTE'),
    'sec: anon cannot exec count_audit_logs');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.get_dashboard_stats()', 'EXECUTE'),
    'sec: anon cannot exec get_dashboard_stats');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.finalize_pdf_upload(uuid)', 'EXECUTE'),
    'sec: anon cannot exec finalize_pdf_upload');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.create_pdf_upload_record(uuid, text, bigint)', 'EXECUTE'),
    'sec: anon cannot exec create_pdf_upload_record');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.create_video_upload_record(uuid, text, text, text, text, uuid)', 'EXECUTE'),
    'sec: anon cannot exec create_video_upload_record');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.delete_video_upload_record(uuid, uuid)', 'EXECUTE'),
    'sec: anon cannot exec delete_video_upload_record');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.set_user_role(uuid, public.user_role)', 'EXECUTE'),
    'sec: anon cannot exec set_user_role');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.set_role_by_email(text, public.user_role)', 'EXECUTE'),
    'sec: anon cannot exec set_role_by_email');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.set_video_status(uuid, public.video_status, integer, text, text, uuid)', 'EXECUTE'),
    'sec: anon cannot exec set_video_status');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.audit_log(text, text, uuid, jsonb)', 'EXECUTE'),
    'sec: anon cannot exec audit_log');

-- 0028 internal helpers (purchase model): locked from anon even though
-- several are granted to authenticated (staff checks are in-function).
SELECT tests.assert(NOT has_function_privilege('anon', 'public.redeem_unit_code(text)', 'EXECUTE'),
    'sec: anon cannot exec redeem_unit_code');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.set_unit_price(uuid, numeric, numeric)', 'EXECUTE'),
    'sec: anon cannot exec set_unit_price');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.set_student_grade(uuid, uuid)', 'EXECUTE'),
    'sec: anon cannot exec set_student_grade');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.create_unit_codes_internal(uuid, integer, text)', 'EXECUTE'),
    'sec: anon cannot exec create_unit_codes_internal');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.create_unit_codes_for_staff(uuid, integer, text)', 'EXECUTE'),
    'sec: anon cannot exec create_unit_codes_for_staff');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.list_codes_by_unit(uuid)', 'EXECUTE'),
    'sec: anon cannot exec list_codes_by_unit');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.revoke_unit_code(uuid)', 'EXECUTE'),
    'sec: anon cannot exec revoke_unit_code');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.set_lesson_trial(uuid, boolean)', 'EXECUTE'),
    'sec: anon cannot exec set_lesson_trial');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.list_all_unit_purchases(uuid)', 'EXECUTE'),
    'sec: anon cannot exec list_all_unit_purchases');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.unit_purchase_stats()', 'EXECUTE'),
    'sec: anon cannot exec unit_purchase_stats');

-- =====================================================================
-- Cleanup
-- =====================================================================
RESET ROLE;
RESET "app.current_user_id";
