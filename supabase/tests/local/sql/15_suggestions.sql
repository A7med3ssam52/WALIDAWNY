-- =====================================================================
-- 15_suggestions.sql — Phase (0075) platform_suggestions assertions
-- ---------------------------------------------------------------------
-- submit_suggestion / attach_suggestion_image / list_my_suggestions /
-- list_suggestions / update_suggestion_status / delete_suggestion,
-- kill-switch (suggestions_open), validation limits, RLS matrix
-- (students own-only, no student update/delete; staff excluded;
-- admin full), suggestion_status notifications, row-backed
-- suggestion-images storage policies, audit capture and grant posture.
-- Fixture users (02_roles): A ...0001 active student, E ...0005 active
-- student, B ...0002 disabled, T ...000b teacher, W ...0009 mr_walid,
-- AD ...000a admin. Fixture rows use 5a000000-... ids, removed at end.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fixtures (harness superuser; table CHECKs still apply)
-- ---------------------------------------------------------------------
INSERT INTO public.platform_suggestions (id, student_id, kind, title, body, status, created_at)
VALUES ('5a000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
        'issue', 'عنوان ثابت 1', 'نص ثابت طويل بما يكفي للتحقق من الصحة', 'new', now()),
       ('5a000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000005',
        'suggestion', 'عنوان ثابت 2', 'نص ثابت آخر طويل بما يكفي للتحقق', 'new', now());

-- ---------------------------------------------------------------------
-- Validation (A writes via RPC)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.submit_suggestion(''bug'', ''عنوان صالح'', ''نص طويل بما يكفي للتحقق'')',
    'P0001', 'invalid_kind');
SELECT tests.expect_error(
    'SELECT public.submit_suggestion(''issue'', ''   '', ''نص طويل بما يكفي للتحقق من الصحة'')',
    'P0001', 'invalid_title');
SELECT tests.expect_error(
    'SELECT public.submit_suggestion(''issue'', ''عنوان صالح'', ''قصير'')',
    'P0001', 'invalid_body');
SELECT tests.expect_error(
    'SELECT public.submit_suggestion(''issue'', ''عنوان صالح'', ''   '')',
    'P0001', 'invalid_body');
SELECT tests.expect_error(
    'SELECT public.list_suggestions(''bug'', NULL, 50, 0)',
    'P0001', 'permission_denied');
SELECT tests.expect_error(
    'SELECT public.update_suggestion_status(''5a000000-0000-0000-0000-000000000001'', ''planned'')',
    'P0001', 'permission_denied');
SELECT tests.expect_error(
    'SELECT public.delete_suggestion(''5a000000-0000-0000-0000-000000000001'')',
    'P0001', 'permission_denied');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Disabled student (B) and anon are closed
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000002';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.submit_suggestion(''issue'', ''عنوان صالح'', ''نص طويل بما يكفي للتحقق'')',
    'P0001', 'permission_denied');
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL ROLE anon;
-- anon lacks EXECUTE on the RPC entirely (0075 revokes PUBLIC), so the
-- call fails at the grant layer with 42501 before any guard runs -
-- same posture as 03_rls section 7 (LOW-15).
SELECT tests.expect_error(
    'SELECT public.submit_suggestion(''issue'', ''عنوان صالح'', ''نص طويل بما يكفي للتحقق'')',
    '42501', 'permission denied for function');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Happy-path submit (A) + own history isolation
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_rows(
    'SELECT public.submit_suggestion(''suggestion'', ''عنوان ديناميكي'', ''نص ديناميكي طويل بما يكفي للتحقق من الصحة'')',
    1, 's: A submits successfully');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_my_suggestions()',
    2, 's: A sees fixture + own dynamic row');
SELECT tests.expect_rows(
    'SELECT public.submit_suggestion(''other'', ''عنوان تخزين'', ''نص تخزين طويل بما يكفي للتحقق من الصحة'')',
    1, 's: A submits a second row for the storage probe');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_my_suggestions()',
    3, 's: A sees fixture + both dynamic rows');
RESET ROLE;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000005';
SET LOCAL ROLE student;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_my_suggestions()',
    1, 's: E sees only own fixture row');
SELECT tests.expect_error(
    'SELECT public.attach_suggestion_image(''5a000000-0000-0000-0000-000000000001'', ''70000000-0000-0000-0000-000000000001/5a000000-0000-0000-0000-000000000001.jpg'')',
    'P0001', 'suggestion_not_found');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Direct RLS: students read own only; no student UPDATE/DELETE
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000005';
SET LOCAL ROLE student;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.platform_suggestions',
    1, 's: E direct select sees own row only');
SELECT tests.expect_rows(
    'UPDATE public.platform_suggestions SET status = ''done'' WHERE id = ''5a000000-0000-0000-0000-000000000002''', 0,
    's: student UPDATE matches nothing (no UPDATE policy)');
SELECT tests.expect_rows(
    'DELETE FROM public.platform_suggestions WHERE id = ''5a000000-0000-0000-0000-000000000002''', 0,
    's: student DELETE matches nothing (no DELETE policy; RLS filters to zero rows, no error)');
RESET ROLE;

-- teacher + mr_walid are excluded from the inbox (admin-only)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT tests.expect_error('SELECT public.list_suggestions()', 'P0001', 'permission_denied');
SELECT tests.expect_error(
    'SELECT public.update_suggestion_status(''5a000000-0000-0000-0000-000000000001'', ''reviewed'')',
    'P0001', 'permission_denied');
SELECT tests.expect_error(
    'SELECT public.delete_suggestion(''5a000000-0000-0000-0000-000000000001'')',
    'P0001', 'permission_denied');
RESET ROLE;
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error('SELECT public.list_suggestions()', 'P0001', 'permission_denied');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Kill-switch: closed inbox rejects submits, then reopen
-- ---------------------------------------------------------------------
UPDATE public.app_settings SET value = 'false' WHERE key = 'suggestions_open';
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.submit_suggestion(''issue'', ''عنوان صالح'', ''نص طويل بما يكفي للتحقق'')',
    'P0001', 'suggestions_closed');
RESET ROLE;
RESET "app.current_user_id";
UPDATE public.app_settings SET value = 'true' WHERE key = 'suggestions_open';
SELECT tests.assert(
    (SELECT public.get_public_settings() ? 'suggestions_open'
        AND public.get_public_settings() ? 'suggestions_banner_message'
        AND public.get_public_settings() ? 'suggestions_closed_message'),
    's: suggestions keys exposed via get_public_settings');

-- ---------------------------------------------------------------------
-- Image attach flow (A): missing bytes -> invalid path -> success ->
-- duplicate refused. Storage object planted as harness superuser.
-- ---------------------------------------------------------------------
INSERT INTO storage.objects (bucket_id, name)
SELECT 'suggestion-images', '70000000-0000-0000-0000-000000000001/' || s.id::text || '.jpg'
FROM public.platform_suggestions s
WHERE s.title = 'عنوان ديناميكي';

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.attach_suggestion_image(''5a000000-0000-0000-0000-000000000001'', ''70000000-0000-0000-0000-000000000001/5a000000-0000-0000-0000-000000000001.jpg'')',
    'P0001', 'suggestion_image_missing');
SELECT tests.expect_error(
    'SELECT public.attach_suggestion_image((SELECT id FROM public.platform_suggestions WHERE title = ''عنوان ديناميكي''), ''70000000-0000-0000-0000-000000000001/evil.png'')',
    'P0001', 'invalid_image');
SELECT tests.expect_rows(
    'SELECT public.attach_suggestion_image((SELECT id FROM public.platform_suggestions WHERE title = ''عنوان ديناميكي''), (SELECT ''70000000-0000-0000-0000-000000000001/'' || id::text || ''.jpg'' FROM public.platform_suggestions WHERE title = ''عنوان ديناميكي''))',
    1, 's: attach succeeds once bytes exist');
SELECT tests.expect_error(
    'SELECT public.attach_suggestion_image((SELECT id FROM public.platform_suggestions WHERE title = ''عنوان ديناميكي''), (SELECT ''70000000-0000-0000-0000-000000000001/'' || id::text || ''.jpg'' FROM public.platform_suggestions WHERE title = ''عنوان ديناميكي''))',
    'P0001', 'suggestion_image_exists');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.platform_suggestions WHERE title = ''عنوان ديناميكي'' AND image_path IS NOT NULL',
    1, 's: image_path bound to the row');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Storage INSERT policy probe: owner-bound to image-less own rows.
-- Correct path succeeds; foreign uid or foreign row -> 42501.
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_rows(
    'INSERT INTO storage.objects (bucket_id, name) SELECT ''suggestion-images'', ''70000000-0000-0000-0000-000000000001/'' || id::text || ''.png'' FROM public.platform_suggestions WHERE title = ''عنوان تخزين'' RETURNING *',
    1, 's: owner upload to own image-less row allowed');
SELECT tests.expect_error(
    'INSERT INTO storage.objects (bucket_id, name) VALUES (''suggestion-images'', ''70000000-0000-0000-0000-000000000005/5a000000-0000-0000-0000-000000000001.png'')',
    '42501', 'violates row-level security policy');
RESET ROLE;
-- E probing A's row with a constant path: the uid matches E but the
-- row is not theirs -> 42501. (A constant VALUES path is used on
-- purpose: an inner SELECT would be RLS-filtered to zero rows and the
-- INSERT would succeed vacuously.)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000005';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'INSERT INTO storage.objects (bucket_id, name) VALUES (''suggestion-images'', ''70000000-0000-0000-0000-000000000005/5a000000-0000-0000-0000-000000000001.png'')',
    '42501', 'violates row-level security policy');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Admin inbox: list + filters + status workflow + notifications
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_count('SELECT count(*) FROM public.list_suggestions()', 4,
    's: admin sees all 4 rows');
SELECT tests.expect_count('SELECT count(*) FROM public.list_suggestions(''issue'', NULL, 50, 0)', 1,
    's: admin kind filter works');
SELECT tests.expect_error(
    'SELECT public.update_suggestion_status(''5a000000-0000-0000-0000-000000000001'', ''bogus'')',
    'P0001', 'invalid_status');
SELECT tests.expect_error(
    'SELECT public.update_suggestion_status(gen_random_uuid(), ''planned'')',
    'P0001', 'suggestion_not_found');
SELECT tests.expect_rows(
    'SELECT public.update_suggestion_status(''5a000000-0000-0000-0000-000000000001'', ''planned'')',
    1, 's: admin transitions fixture to planned');
-- notification assertions (postgres superuser reads past RLS - 10_comments pattern)
RESET ROLE;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE type = ''suggestion_status'' AND user_id = ''70000000-0000-0000-0000-000000000001''',
    1, 's: student notified once on status change');
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_rows(
    'SELECT public.update_suggestion_status(''5a000000-0000-0000-0000-000000000001'', ''planned'')',
    1, 's: repeat same-status transition still succeeds');
RESET ROLE;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE type = ''suggestion_status'' AND user_id = ''70000000-0000-0000-0000-000000000001''',
    1, 's: no duplicate notification for unchanged status');
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_count('SELECT count(*) FROM public.list_suggestions(NULL, ''planned'', 50, 0)', 1,
    's: admin status filter works');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.platform_suggestions',
    4, 's: admin direct select sees everything');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Admin delete removes the row (image object cleanup is best-effort
-- inside the RPC; the suite asserts row removal + audit)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT public.delete_suggestion('5a000000-0000-0000-0000-000000000002');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.platform_suggestions WHERE id = ''5a000000-0000-0000-0000-000000000002''',
    0, 's: admin deletes E''s fixture row');
SELECT tests.expect_error(
    'SELECT public.delete_suggestion(''5a000000-0000-0000-0000-000000000002'')',
    'P0001', 'suggestion_not_found');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Audit capture (audit_trigger, MED-8): inserts = 2 fixtures + 2 RPC
-- adds; updates = 3 (attach + 2 status transitions; the no-op repeat
-- still issues UPDATE); deletes = 1 (admin RPC delete).
-- ---------------------------------------------------------------------
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs
      WHERE entity_type = ''platform_suggestions'' AND action = ''platform_suggestions.insert''',
    4, 's: audit insert captured for 2 fixtures + 2 RPC adds');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs
      WHERE entity_type = ''platform_suggestions'' AND action = ''platform_suggestions.update''',
    3, 's: audit update captured for attach + 2 status transitions');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs
      WHERE entity_type = ''platform_suggestions'' AND action = ''platform_suggestions.delete''',
    1, 's: audit delete captured for the admin RPC delete');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs
      WHERE entity_type = ''platform_suggestions'' AND action = ''suggestion.status''',
    1, 's: explicit status audit logged once (no-op repeat skipped)');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs
      WHERE entity_type = ''platform_suggestions'' AND action = ''suggestion.delete''',
    1, 's: explicit delete audit logged');

-- ---------------------------------------------------------------------
-- Grant posture (SECURITY.md 8.2 pattern)
-- ---------------------------------------------------------------------
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.submit_suggestion(text, text, text)', 'EXECUTE'),
    'g: submit_suggestion executable by authenticated');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.attach_suggestion_image(uuid, text)', 'EXECUTE'),
    'g: attach_suggestion_image executable by authenticated');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.list_my_suggestions()', 'EXECUTE'),
    'g: list_my_suggestions executable by authenticated');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.list_suggestions(text, text, integer, integer)', 'EXECUTE'),
    'g: list_suggestions executable by authenticated');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.update_suggestion_status(uuid, text)', 'EXECUTE'),
    'g: update_suggestion_status executable by authenticated');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.delete_suggestion(uuid)', 'EXECUTE'),
    'g: delete_suggestion executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.submit_suggestion(text, text, text)', 'EXECUTE'),
    'g: submit_suggestion NOT executable by anon');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.list_suggestions(text, text, integer, integer)', 'EXECUTE'),
    'g: list_suggestions NOT executable by anon');

-- ---------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------
RESET "app.current_user_id";
DELETE FROM public.notifications WHERE entity_type = 'suggestion';
DELETE FROM storage.objects WHERE bucket_id = 'suggestion-images';
DELETE FROM public.platform_suggestions
WHERE student_id IN ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005');
DELETE FROM public.audit_logs WHERE entity_type = 'platform_suggestions';
UPDATE public.app_settings SET value = 'true' WHERE key = 'suggestions_open';
