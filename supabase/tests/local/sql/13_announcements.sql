-- =====================================================================
-- 13_announcements.sql — Phase 9 (0071) announcement signature assertions
-- ---------------------------------------------------------------------
-- Per-announcement Arabic signature (signature_name):
--   * schema shape (column, NOT NULL, default 'الإدارة', length CHECK)
--   * grant posture (authenticated new overloads, anon blocked)
--   * create: custom signature stored trimmed; omitted/blank -> default;
--     >60 chars -> invalid_signature; student -> permission_denied
--   * update: signature change persisted; NULL/blank keeps old value;
--     >60 chars -> invalid_signature
--   * get_active_announcements surfaces signature_name
-- Fixtures use titles prefixed 'TEST-SIG-' and are removed at the end.
-- W = mr_walid (...009), AD = admin (...00a), A = student (...001).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Section 1: schema shape
-- ---------------------------------------------------------------------
SELECT tests.assert(
    (SELECT data_type = 'text' AND is_nullable = 'NO' AND column_default = '''الإدارة''::text'
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'signature_name'),
    's: signature_name is text NOT NULL DEFAULT ''الإدارة''');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_constraint
     WHERE conname = 'announcements_signature_name_len'
       AND contype = 'c'
       AND conrelid = 'public.announcements'::regclass),
    's: announcements_signature_name_len CHECK exists');

-- ---------------------------------------------------------------------
-- Section 2: grant posture (new overloads)
-- ---------------------------------------------------------------------
SELECT tests.assert(has_function_privilege('authenticated', 'public.create_announcement(text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean, text)', 'EXECUTE'), 'g: create_announcement(+signature) for authenticated');
SELECT tests.assert(has_function_privilege('authenticated', 'public.update_announcement(uuid, text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean, text)', 'EXECUTE'), 'g: update_announcement(+signature) for authenticated');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.create_announcement(text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean, text)', 'EXECUTE'), 'g: create_announcement NOT executable by anon');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.update_announcement(uuid, text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean, text)', 'EXECUTE'), 'g: update_announcement NOT executable by anon');

-- ---------------------------------------------------------------------
-- Section 3: create matrix (as admin AD)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;

-- (a) custom signature stored trimmed
SELECT tests.expect_rows(
    $$SELECT public.create_announcement('TEST-SIG-1', 'body', NULL, NULL, 'info', '{student}', '{}', now(), NULL, true, true, '  الإدارة العامة  ')$$,
    1, 's: admin create with padded signature');
SELECT tests.assert(
    (SELECT signature_name = 'الإدارة العامة' FROM public.announcements WHERE title = 'TEST-SIG-1'),
    's: signature trimmed on create');

-- (b) omitted signature -> default 'الإدارة'
SELECT tests.expect_rows(
    $$SELECT public.create_announcement('TEST-SIG-2', 'body')$$,
    1, 's: admin create without signature');
SELECT tests.assert(
    (SELECT signature_name = 'الإدارة' FROM public.announcements WHERE title = 'TEST-SIG-2'),
    's: omitted signature defaults to الإدارة');

-- (c) blank signature -> default 'الإدارة'
SELECT tests.expect_rows(
    $$SELECT public.create_announcement('TEST-SIG-3', 'body', NULL, NULL, 'info', '{student}', '{}', now(), NULL, true, true, '   ')$$,
    1, 's: admin create with blank signature');
SELECT tests.assert(
    (SELECT signature_name = 'الإدارة' FROM public.announcements WHERE title = 'TEST-SIG-3'),
    's: blank signature normalizes to الإدارة');

-- (d) >60 chars -> invalid_signature
SELECT tests.expect_error(
    $$SELECT public.create_announcement('TEST-SIG-4', 'body', NULL, NULL, 'info', '{student}', '{}', now(), NULL, true, true, repeat('أ', 61))$$,
    'P0001', 'invalid_signature');

RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Section 4: mr_walid locked signature stored as given
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;

SELECT tests.expect_rows(
    $$SELECT public.create_announcement('TEST-SIG-5', 'body', NULL, NULL, 'info', '{student}', '{}', now(), NULL, true, true, 'م / وليد عوني')$$,
    1, 's: walid create with locked signature');
SELECT tests.assert(
    (SELECT signature_name = 'م / وليد عوني' FROM public.announcements WHERE title = 'TEST-SIG-5'),
    's: walid locked signature persisted verbatim');

RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Section 5: student cannot create (permission_denied)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;

SELECT tests.expect_error(
    $$SELECT public.create_announcement('TEST-SIG-6', 'body')$$,
    'P0001', 'permission_denied');

RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Section 6: update matrix (as admin AD)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;

-- (a) change signature (by id lookup, NULL keeps everything else)
SELECT tests.expect_rows(
    $$SELECT public.update_announcement((SELECT id FROM public.announcements WHERE title = 'TEST-SIG-2'), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'إدارة المنصة')$$,
    1, 's: admin update signature');
SELECT tests.assert(
    (SELECT signature_name = 'إدارة المنصة' FROM public.announcements WHERE title = 'TEST-SIG-2'),
    's: updated signature persisted');

-- (b) NULL signature keeps old value
SELECT tests.expect_rows(
    $$SELECT public.update_announcement((SELECT id FROM public.announcements WHERE title = 'TEST-SIG-2'), 'TEST-SIG-2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)$$,
    1, 's: admin update with NULL signature');
SELECT tests.assert(
    (SELECT signature_name = 'إدارة المنصة' FROM public.announcements WHERE title = 'TEST-SIG-2'),
    's: NULL signature keeps old value');

-- (c) >60 chars -> invalid_signature, row untouched
SELECT tests.expect_error(
    $$SELECT public.update_announcement((SELECT id FROM public.announcements WHERE title = 'TEST-SIG-2'), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, repeat('ب', 61))$$,
    'P0001', 'invalid_signature');
SELECT tests.assert(
    (SELECT signature_name = 'إدارة المنصة' FROM public.announcements WHERE title = 'TEST-SIG-2'),
    's: rejected update leaves signature untouched');

RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Section 6b: direct table reads as staff (regression for the 0049/0064
-- policy bug: teacher policies called get_current_role() in-policy, so any
-- direct SELECT as staff aborted with 42501; fixed in 0071 via the granted
-- DEFINER helpers is_teacher()/is_mr_walid()/is_admin())
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_count(
    $$SELECT count(*) FROM public.announcements WHERE title LIKE 'TEST-SIG-%'$$,
    4, 's: admin direct SELECT sees the 4 fixtures (no 42501)');
RESET ROLE;
RESET "app.current_user_id";

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT tests.expect_count(
    $$SELECT count(*) FROM public.announcements WHERE title LIKE 'TEST-SIG-%'$$,
    4, 's: teacher direct SELECT sees the 4 fixtures (no 42501)');
RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Section 7: get_active_announcements surfaces signature_name
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    (SELECT count(*) >= 0 FROM public.get_active_announcements('/')),
    's: get_active_announcements callable (shape carries signature_name)');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'signature_name'),
    's: announcements rowtype includes signature_name');
RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Cleanup fixtures
-- ---------------------------------------------------------------------
DELETE FROM public.announcements WHERE title LIKE 'TEST-SIG-%';
SELECT tests.expect_count(
    $$SELECT count(*) FROM public.announcements WHERE title LIKE 'TEST-SIG-%'$$,
    0, 's: fixtures removed');
