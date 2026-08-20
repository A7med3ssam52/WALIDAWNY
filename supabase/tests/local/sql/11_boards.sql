-- =====================================================================
-- 11_boards.sql — Phase 8 (0036) lesson_boards assertions
-- ---------------------------------------------------------------------
-- The سبورات (board photos) feature: staff upload / finalize / delete /
-- reorder board photos per lesson; students see the ready boards as an
-- image grid inside the lesson tab. Covers:
--   * schema shape (table, columns, index, RLS enabled + FORCEd, the
--     single SELECT policy, no write policies, storage INSERT policy)
--   * RLS matrix (anon / student with access / student without access /
--     disabled student / staff)
--   * RPC negatives for students (permission_denied on all four)
--   * create_board_upload_record happy path + guards (extension, size,
--     lesson, sort_order, mime, audit)
--   * finalize (ready flag, board_already_ready, board_not_found,
--     board_storage_missing when no Storage object exists - 0041 M2)
--   * delete (soft delete incl. READY rows, wrong_lesson, not_found)
--   * reorder (exact ready-set enforcement, wrong_lesson, not_found)
--   * storage.objects row-backed INSERT policy (0015 pattern) +
--     RETURNING-id proof of the 0041 C1 SELECT mirror
-- Fixtures use bb000000-... ids and are removed at the end. Lesson
-- 4000...0001 = TEST-L1 (published, student ...001 owns it via fixture
-- purchase); 4000...0002 = TEST-L2 (draft) is used for wrong_lesson.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fixtures (inserted as the harness superuser; FORCE RLS does not apply
-- to the table owner). bb4 is soft-deleted, bb3 is pending (not ready).
-- ---------------------------------------------------------------------
INSERT INTO public.lesson_boards (id, lesson_id, storage_path, original_name, size_bytes, mime_type, sort_order, is_ready, deleted_at, created_at)
VALUES ('bb000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'bb-fixtures/l1-board-1.jpg',  'board-1.jpg',  1000, 'image/jpeg', 1, true,  NULL, now()),
       ('bb000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'bb-fixtures/l1-board-2.png',  'board-2.png',  2000, 'image/png',  2, true,  NULL, now()),
       ('bb000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'bb-fixtures/l1-board-3.webp', 'board-3.webp', 3000, 'image/webp', 3, false, NULL, now()),
       ('bb000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', 'bb-fixtures/l1-board-4.jpg',  'board-4.jpg',  4000, 'image/jpeg', 4, true,  now(), now()),
       ('bb000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000002', 'bb-fixtures/l2-board-1.jpg',  'l2-board-1.jpg', 5000, 'image/jpeg', 1, true, NULL, now());

-- ---------------------------------------------------------------------
-- Section 1: schema shape
-- ---------------------------------------------------------------------
SELECT tests.assert(to_regclass('public.lesson_boards') IS NOT NULL,
    'b: lesson_boards table exists');

SELECT tests.assert(
    (SELECT array_agg(column_name ORDER BY column_name)::text[] = ARRAY[
        'created_at','deleted_at','id','is_ready','lesson_id','mime_type',
        'original_name','size_bytes','sort_order','storage_path','updated_at']::text[]
     FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lesson_boards'),
    'b: lesson_boards has exactly the documented 11 columns');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'lesson_boards' AND indexname = 'idx_lesson_boards_lesson'),
    'b: idx_lesson_boards_lesson on lesson_id');

SELECT tests.assert(
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.lesson_boards'::regclass),
    'b: lesson_boards RLS enabled AND forced');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'lesson_boards'
       AND policyname = 'lesson_boards_select_gated' AND cmd = 'SELECT'),
    'b: exactly one SELECT policy lesson_boards_select_gated');

SELECT tests.assert(
    (SELECT count(*) = 0 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'lesson_boards' AND cmd <> 'SELECT'),
    'b: NO INSERT/UPDATE/DELETE policies on lesson_boards (RPC-only DML)');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'boards_insert_row_backed'
       AND cmd = 'INSERT' AND roles::text = '{authenticated}'),
    'b: boards_insert_row_backed FOR INSERT TO authenticated exists');

-- grant posture (SECURITY.md 8.2 pattern)
SELECT tests.assert(has_function_privilege('authenticated', 'public.create_board_upload_record(uuid, text, bigint)', 'EXECUTE'), 'g: create_board_upload_record');
SELECT tests.assert(has_function_privilege('authenticated', 'public.finalize_board_upload(uuid)', 'EXECUTE'), 'g: finalize_board_upload');
SELECT tests.assert(has_function_privilege('authenticated', 'public.delete_board_upload_record(uuid, uuid)', 'EXECUTE'), 'g: delete_board_upload_record');
SELECT tests.assert(has_function_privilege('authenticated', 'public.reorder_boards(uuid, uuid[])', 'EXECUTE'), 'g: reorder_boards');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.create_board_upload_record(uuid, text, bigint)', 'EXECUTE'), 'g: create_board_upload_record NOT executable by anon');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.finalize_board_upload(uuid)', 'EXECUTE'), 'g: finalize_board_upload NOT executable by anon');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.delete_board_upload_record(uuid, uuid)', 'EXECUTE'), 'g: delete_board_upload_record NOT executable by anon');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.reorder_boards(uuid, uuid[])', 'EXECUTE'), 'g: reorder_boards NOT executable by anon');

-- ---------------------------------------------------------------------
-- Section 2: RLS matrix
-- ---------------------------------------------------------------------
-- anon cannot even evaluate the policy (helpers are not granted, 03:262)
SET LOCAL ROLE anon;
SELECT tests.expect_error('SELECT count(*) FROM public.lesson_boards',
    '42501', 'permission denied for function');
RESET ROLE;

-- A (owns l1): sees the 2 ready boards only - not the pending bb3,
-- not the soft-deleted bb4, nothing on the draft lesson l2
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_boards WHERE lesson_id = ''40000000-0000-0000-0000-000000000001''',
    2, 'rls: A sees exactly the 2 ready boards of l1');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_boards WHERE id = ''bb000000-0000-0000-0000-000000000003''',
    0, 'rls: A does NOT see the pending board (is_ready=false)');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_boards WHERE id = ''bb000000-0000-0000-0000-000000000004''',
    0, 'rls: A does NOT see the soft-deleted board');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_boards WHERE lesson_id = ''40000000-0000-0000-0000-000000000002''',
    0, 'rls: A sees nothing on the draft lesson l2');
RESET ROLE;
RESET "app.current_user_id";

-- D (grade-2 student, no access to l1): sees nothing
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000004';
SET LOCAL ROLE student;
SELECT tests.expect_count('SELECT count(*) FROM public.lesson_boards', 0,
    'rls: D (no access) sees no boards at all');
RESET ROLE;
RESET "app.current_user_id";

-- B (disabled): is_student() is false -> policy false on every row
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000002';
SET LOCAL ROLE student;
SELECT tests.expect_count('SELECT count(*) FROM public.lesson_boards', 0,
    'rls: disabled student B sees no boards');
RESET ROLE;
RESET "app.current_user_id";

-- teacher: staff branch -> every row (pending + deleted included; the
-- UI filters by is_ready/deleted_at, exactly like lesson_pdfs 0025)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT tests.expect_count('SELECT count(*) FROM public.lesson_boards', 5,
    'rls: teacher sees all 5 rows (ready + pending + deleted)');
RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Section 3: student RPC negatives (all four wrappers staff-guarded)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''x.jpg'', NULL)',
    'P0001', 'permission_denied');
SELECT tests.expect_error(
    'SELECT public.finalize_board_upload(''bb000000-0000-0000-0000-000000000003'')',
    'P0001', 'permission_denied');
SELECT tests.expect_error(
    'SELECT public.delete_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''bb000000-0000-0000-0000-000000000002'')',
    'P0001', 'permission_denied');
SELECT tests.expect_error(
    'SELECT public.reorder_boards(''40000000-0000-0000-0000-000000000001'', ARRAY[''bb000000-0000-0000-0000-000000000001'',''bb000000-0000-0000-0000-000000000002'']::uuid[])',
    'P0001', 'permission_denied');
RESET ROLE;
RESET "app.current_user_id";

-- GUC-free (plain session, no claims): permission_denied too
SELECT tests.expect_error(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''x.jpg'', NULL)',
    'P0001', 'permission_denied');

-- ---------------------------------------------------------------------
-- Section 4: create_board_upload_record happy path (as teacher)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT tests.expect_rows(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''bb-upload-1.jpg'', 8192)',
    1, 'crt: teacher reserves a pending board row');
SELECT tests.assert(
    (SELECT storage_path ~ '^40000000-0000-0000-0000-000000000001/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
       AND is_ready = false AND mime_type = 'image/jpeg'
       AND size_bytes = 8192 AND sort_order = 4 AND deleted_at IS NULL
     FROM public.lesson_boards
     WHERE original_name = 'bb-upload-1.jpg'),
    'crt: storage_path is {lesson_id}/{uuid}.jpg, pending, mime from ext, sort_order max+1');
SELECT tests.assert(
    (SELECT storage_path <> id::text
     FROM public.lesson_boards WHERE original_name = 'bb-upload-1.jpg'),
    'crt: path uuid independent from row id (gen_random_uuid)');
-- case-insensitive extension + mime mapping
SELECT tests.expect_rows(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''BB-UPLOAD-2.PNG'', NULL)',
    1, 'crt: uppercase .PNG accepted');
SELECT tests.assert(
    (SELECT mime_type = 'image/png' AND original_name = 'BB-UPLOAD-2.PNG'
            AND storage_path ~ '\.png$'
     FROM public.lesson_boards WHERE original_name = 'BB-UPLOAD-2.PNG'),
    'crt: .PNG -> image/png, basename stored as-is, path .png');
-- client path components are stripped (basename only)
SELECT tests.expect_rows(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''C:\fakepath\bb-upload-3.webp'', NULL)',
    1, 'crt: path traversal name accepted as basename');
SELECT tests.assert(
    (SELECT original_name = 'bb-upload-3.webp' AND mime_type = 'image/webp'
     FROM public.lesson_boards WHERE original_name = 'bb-upload-3.webp'),
    'crt: original_name stored as basename only, webp -> image/webp');
RESET ROLE;
RESET "app.current_user_id";

-- audit capture (audit_logs SELECT is admin-only, 0009: read as the
-- session superuser, same as 04:1654)
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs WHERE action = ''board.upload_started'' AND entity_type = ''lesson_board''',
    3, 'crt: board.upload_started audited for the 3 reservations');

-- cleanup the reservation rows (FORCE RLS: direct DELETE must run as
-- the session superuser, same as 04:1678)
DELETE FROM public.lesson_boards
WHERE original_name IN ('bb-upload-1.jpg', 'BB-UPLOAD-2.PNG', 'bb-upload-3.webp');
SELECT tests.assert(
    (SELECT count(*) = 4 FROM public.lesson_boards
     WHERE lesson_id = '40000000-0000-0000-0000-000000000001'),
    'crt: cleanup restored the 4 fixture rows of l1');

-- ---------------------------------------------------------------------
-- Section 5: create_board_upload_record guards
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''x.gif'', NULL)',
    'P0001', 'invalid_file_extension');
SELECT tests.expect_error(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''x'', NULL)',
    'P0001', 'invalid_file_extension');
SELECT tests.expect_error(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''x.'', NULL)',
    'P0001', 'invalid_file_extension');
SELECT tests.expect_error(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', NULL, NULL)',
    'P0001', 'invalid_file_extension');
SELECT tests.expect_error(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', repeat(''x'', 256) || ''.jpg'', NULL)',
    'P0001', 'invalid_file_extension');
SELECT tests.expect_error(
    'SELECT public.create_board_upload_record(gen_random_uuid(), ''x.jpg'', NULL)',
    'P0001', 'lesson_not_found');
SELECT tests.expect_error(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000004'', ''x.jpg'', NULL)',
    'P0001', 'lesson_deleted');
SELECT tests.expect_error(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''x.jpg'', -1)',
    'P0001', 'invalid_board_size');
SELECT tests.expect_error(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''x.jpg'', 10485761)',
    'P0001', 'invalid_board_size');
-- boundary size (exactly 10MiB) is accepted
SELECT tests.expect_rows(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''x.jpg'', 10485760)',
    1, 'crt: exactly 10MiB accepted (boundary)');
SELECT tests.assert(
    (SELECT count(*) = 4 FROM public.lesson_boards
     WHERE lesson_id = '40000000-0000-0000-0000-000000000001' AND original_name <> 'x.jpg'),
    'crt: denied create attempts mutated nothing');
RESET ROLE;
RESET "app.current_user_id";
-- boundary row removed again (FORCE RLS: cleanup as session superuser)
DELETE FROM public.lesson_boards WHERE original_name = 'x.jpg';

-- ---------------------------------------------------------------------
-- Section 6: finalize_board_upload
-- ---------------------------------------------------------------------
-- 0041 M2: finalize now requires the Storage object to exist. The
-- fixture object for bb3 is planted as the harness superuser (table
-- owner is exempt from storage.objects RLS, 0021 H2).
INSERT INTO storage.objects (bucket_id, name) VALUES ('boards', 'bb-fixtures/l1-board-3.webp');
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.finalize_board_upload(''bb000000-0000-0000-0000-000000000003'')',
    1, 'fin: pending board finalized');
SELECT tests.assert(
    (SELECT is_ready FROM public.lesson_boards WHERE id = 'bb000000-0000-0000-0000-000000000003'),
    'fin: bb3 is_ready = true after finalize');
SELECT tests.expect_error(
    'SELECT public.finalize_board_upload(''bb000000-0000-0000-0000-000000000003'')',
    'P0001', 'board_already_ready');
SELECT tests.expect_error(
    'SELECT public.finalize_board_upload(gen_random_uuid())',
    'P0001', 'board_not_found');
SELECT tests.expect_error(
    'SELECT public.finalize_board_upload(''bb000000-0000-0000-0000-000000000004'')',
    'P0001', 'board_not_found');
-- a pending row WITHOUT a storage object cannot be finalized (0041 M2);
-- release it through the delete wrapper (pending rows deletable, 0036)
SELECT tests.expect_rows(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''bb-no-object.jpg'', NULL)',
    1, 'fin: pending row without object created for the storage-missing guard');
SELECT tests.expect_error(
    'SELECT public.finalize_board_upload((SELECT id FROM public.lesson_boards WHERE original_name = ''bb-no-object.jpg''))',
    'P0001', 'board_storage_missing');
SELECT tests.assert(
    (SELECT NOT is_ready FROM public.lesson_boards WHERE original_name = 'bb-no-object.jpg'),
    'fin: storage-missing refusal left the row pending');
SELECT tests.expect_rows(
    'SELECT public.delete_board_upload_record(''40000000-0000-0000-0000-000000000001'', (SELECT id FROM public.lesson_boards WHERE original_name = ''bb-no-object.jpg''))',
    1, 'fin: pending row without object released');
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs WHERE action = ''board.finalized'' AND entity_id = ''bb000000-0000-0000-0000-000000000003''',
    1, 'fin: board.finalized audited');

-- ---------------------------------------------------------------------
-- Section 7: reorder_boards (ready set = bb1, bb2, bb3 after finalize)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.reorder_boards(''40000000-0000-0000-0000-000000000001'', ARRAY[''bb000000-0000-0000-0000-000000000003'',''bb000000-0000-0000-0000-000000000001'',''bb000000-0000-0000-0000-000000000002'']::uuid[])',
    1, 'ord: full reorder applied');
SELECT tests.assert(
    (SELECT sort_order = 1 FROM public.lesson_boards WHERE id = 'bb000000-0000-0000-0000-000000000003')
    AND (SELECT sort_order = 2 FROM public.lesson_boards WHERE id = 'bb000000-0000-0000-0000-000000000001')
    AND (SELECT sort_order = 3 FROM public.lesson_boards WHERE id = 'bb000000-0000-0000-0000-000000000002'),
    'ord: sort_order follows the passed order (1..n)');
-- restore the fixture order
SELECT tests.expect_rows(
    'SELECT public.reorder_boards(''40000000-0000-0000-0000-000000000001'', ARRAY[''bb000000-0000-0000-0000-000000000001'',''bb000000-0000-0000-0000-000000000002'',''bb000000-0000-0000-0000-000000000003'']::uuid[])',
    1, 'ord: restore fixture order');
SELECT tests.assert(
    (SELECT sort_order = 1 FROM public.lesson_boards WHERE id = 'bb000000-0000-0000-0000-000000000001')
    AND (SELECT sort_order = 2 FROM public.lesson_boards WHERE id = 'bb000000-0000-0000-0000-000000000002')
    AND (SELECT sort_order = 3 FROM public.lesson_boards WHERE id = 'bb000000-0000-0000-0000-000000000003'),
    'ord: fixture order restored');
-- wrong lesson / unknown board inside an otherwise valid list
SELECT tests.expect_error(
    'SELECT public.reorder_boards(''40000000-0000-0000-0000-000000000001'', ARRAY[''bb000000-0000-0000-0000-000000000005'',''bb000000-0000-0000-0000-000000000001'',''bb000000-0000-0000-0000-000000000002'']::uuid[])',
    'P0001', 'wrong_lesson');
SELECT tests.expect_error(
    'SELECT public.reorder_boards(''40000000-0000-0000-0000-000000000001'', ARRAY[''bb000000-0000-0000-0000-000000000001'',''bb000000-0000-0000-0000-000000000002'', gen_random_uuid()]::uuid[])',
    'P0001', 'board_not_found');
-- the list must be EXACTLY the ready set: missing / extra / duplicate
SELECT tests.expect_error(
    'SELECT public.reorder_boards(''40000000-0000-0000-0000-000000000001'', ARRAY[''bb000000-0000-0000-0000-000000000001'',''bb000000-0000-0000-0000-000000000002'']::uuid[])',
    'P0001', 'validation_error');
SELECT tests.expect_error(
    'SELECT public.reorder_boards(''40000000-0000-0000-0000-000000000001'', ARRAY[''bb000000-0000-0000-0000-000000000001'',''bb000000-0000-0000-0000-000000000002'',''bb000000-0000-0000-0000-000000000003'',''bb000000-0000-0000-0000-000000000004'']::uuid[])',
    'P0001', 'validation_error');
SELECT tests.expect_error(
    'SELECT public.reorder_boards(''40000000-0000-0000-0000-000000000001'', ARRAY[''bb000000-0000-0000-0000-000000000001'',''bb000000-0000-0000-0000-000000000001'',''bb000000-0000-0000-0000-000000000002'']::uuid[])',
    'P0001', 'validation_error');
-- a pending (not ready) row cannot be placed by reorder
SELECT tests.expect_rows(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''bb-pending-reorder.jpg'', NULL)',
    1, 'ord: pending row created for the not-ready guard');
SELECT tests.expect_error(
    'SELECT public.reorder_boards(''40000000-0000-0000-0000-000000000001'', ARRAY[''bb000000-0000-0000-0000-000000000003''::uuid,''bb000000-0000-0000-0000-000000000001''::uuid, (SELECT id FROM public.lesson_boards WHERE original_name = ''bb-pending-reorder.jpg'')]::uuid[])',
    'P0001', 'validation_error');
-- release the pending row through the delete wrapper (staff)
SELECT tests.expect_rows(
    'SELECT public.delete_board_upload_record(''40000000-0000-0000-0000-000000000001'', (SELECT id FROM public.lesson_boards WHERE original_name = ''bb-pending-reorder.jpg''))',
    1, 'ord: pending row released');
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs WHERE action = ''board.reordered''',
    2, 'ord: board.reordered audited only for the 2 successful reorders');

-- ---------------------------------------------------------------------
-- Section 8: delete_board_upload_record (soft delete of READY rows too)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT tests.expect_rows(
    'SELECT public.delete_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''bb000000-0000-0000-0000-000000000001'')',
    1, 'del: teacher soft-deletes a READY board');
SELECT tests.assert(
    (SELECT deleted_at IS NOT NULL AND is_ready
     FROM public.lesson_boards WHERE id = 'bb000000-0000-0000-0000-000000000001'),
    'del: row still exists, deleted_at set, is_ready untouched (soft delete)');
SELECT tests.expect_error(
    'SELECT public.delete_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''bb000000-0000-0000-0000-000000000005'')',
    'P0001', 'wrong_lesson');
SELECT tests.expect_error(
    'SELECT public.delete_board_upload_record(''40000000-0000-0000-0000-000000000001'', gen_random_uuid())',
    'P0001', 'board_not_found');
SELECT tests.expect_error(
    'SELECT public.delete_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''bb000000-0000-0000-0000-000000000004'')',
    'P0001', 'board_not_found');
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs WHERE action = ''board.deleted'' AND entity_id = ''bb000000-0000-0000-0000-000000000001''',
    1, 'del: board.deleted audited');

-- ---------------------------------------------------------------------
-- Section 9: storage.objects row-backed INSERT policy (0015 pattern)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.create_board_upload_record(''40000000-0000-0000-0000-000000000001'', ''BB-STORE-1.jpg'', 42)',
    1, 'sto: pending row reserved for the object tests');
-- row-backed path insertable (staff sees the pending row); RETURNING id
-- proves the 0041 C1 SELECT mirror covers the inserted row (the Storage
-- API's INSERT ... RETURNING * upload path, 0021 H1 pattern)
SELECT tests.expect_rows(
    'INSERT INTO storage.objects (bucket_id, name)
     SELECT ''boards'', storage_path FROM public.lesson_boards WHERE original_name = ''BB-STORE-1.jpg''
     RETURNING id',
    1, 'sto: row-backed path insertable by staff (RETURNING id, 0041 C1)');
-- shape / bucket / row-backing negatives
SELECT tests.expect_error(
    'INSERT INTO storage.objects (bucket_id, name) VALUES (''boards'', ''test/x.jpg'')',
    '42501', 'row-level security');
SELECT tests.expect_error(
    'INSERT INTO storage.objects (bucket_id, name) VALUES (''boards'', ''40000000-0000-0000-0000-000000000001/11111111-2222-3333-4444-555555555555.gif'')',
    '42501', 'row-level security');
SELECT tests.expect_error(
    'INSERT INTO storage.objects (bucket_id, name) VALUES (''boards'', ''40000000-0000-0000-0000-000000000001/11111111-2222-3333-4444-555555555555.jpg'')',
    '42501', 'row-level security');
SELECT tests.expect_error(
    'INSERT INTO storage.objects (bucket_id, name)
     SELECT ''pdfs'', storage_path FROM public.lesson_boards WHERE original_name = ''BB-STORE-1.jpg''',
    '42501', 'row-level security');
-- carry the pending path into the student context via a custom GUC
-- (temp tables are not readable under a different effective role)
SELECT pg_catalog.set_config('app.bb_path', storage_path, true)
FROM public.lesson_boards WHERE original_name = 'BB-STORE-1.jpg';
RESET ROLE;
RESET "app.current_user_id";

-- student: pending rows are INVISIBLE under the SELECT policy, so the
-- same row-backed path is denied (the issuance-time boundary, 0015)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'INSERT INTO storage.objects (bucket_id, name) VALUES (''boards'', current_setting(''app.bb_path''))',
    '42501', 'row-level security');
RESET ROLE;
RESET "app.current_user_id";
RESET "app.bb_path";
SELECT tests.assert(
    (SELECT count(*) = 2 FROM storage.objects WHERE bucket_id = 'boards'),
    'sto: exactly two test objects so far (l1-board-3.webp Section-6 fixture + BB-STORE-1.jpg; student denial inserted nothing)');

-- ---------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------
DELETE FROM storage.objects WHERE bucket_id = 'boards';
DELETE FROM public.lesson_boards
WHERE id IN ('bb000000-0000-0000-0000-000000000001',
             'bb000000-0000-0000-0000-000000000002',
             'bb000000-0000-0000-0000-000000000003',
             'bb000000-0000-0000-0000-000000000004',
             'bb000000-0000-0000-0000-000000000005')
   OR original_name IN ('BB-STORE-1.jpg', 'bb-no-object.jpg');
DELETE FROM public.audit_logs WHERE entity_type IN ('lesson_board', 'lesson_boards');
SELECT tests.assert(
    (SELECT count(*) = 0 FROM public.lesson_boards
     WHERE id IN ('bb000000-0000-0000-0000-000000000001',
                  'bb000000-0000-0000-0000-000000000002',
                  'bb000000-0000-0000-0000-000000000003',
                  'bb000000-0000-0000-0000-000000000004',
                  'bb000000-0000-0000-0000-000000000005')
        OR original_name IN ('BB-STORE-1.jpg', 'bb-no-object.jpg')),
    'b: all boards fixtures removed');
SELECT tests.assert(
    (SELECT count(*) = 0 FROM storage.objects WHERE bucket_id = 'boards'),
    'b: boards bucket empty after cleanup');
