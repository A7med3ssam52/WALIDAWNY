-- =====================================================================
-- 10_comments.sql — Phase 7 (0030) lesson_comments assertions
-- ---------------------------------------------------------------------
-- add_lesson_comment / delete_lesson_comment / list_lesson_comments,
-- RLS matrix (access gate, own-or-staff update/delete), the two
-- notification types (comment_reply -> staff, lesson_comment -> parent
-- author), parent/lesson consistency, body limits, audit capture and
-- grant posture. Fixtures use ac000000-... ids and are removed at the end.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fixtures (inserted as the harness superuser; the parent trigger and
-- body CHECK still apply). Lesson 4000...0001 = TEST-L1 (published,
-- student ...001 owns it via fixture purchase); 4000...0002 = TEST-L2
-- (draft, different lesson for the cross-lesson parent guard).
-- ---------------------------------------------------------------------
INSERT INTO public.lesson_comments (id, lesson_id, author_id, parent_id, body, status, created_at)
VALUES ('ac000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
        '70000000-0000-0000-0000-000000000001', NULL, 'تعليق ثابت 1', 'visible', now()),
       ('ac000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002',
        '70000000-0000-0000-0000-000000000001', NULL, 'تعليق على درس آخر', 'visible', now()),
       ('ac000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001',
        '70000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001',
        'رد ثابت', 'visible', now()),
       ('ac000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001',
        '70000000-0000-0000-0000-00000000000b', NULL, 'تعليق معلم', 'visible', now()),
       ('ac000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000001',
        '70000000-0000-0000-0000-000000000001', NULL, 'تعليق محذوف', 'removed', now());

-- ---------------------------------------------------------------------
-- Access matrix
-- ---------------------------------------------------------------------
-- D (no access): everything denied
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000004';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.list_lesson_comments(''40000000-0000-0000-0000-000000000001'')',
    'P0001', 'access_denied');
SELECT tests.expect_error(
    'SELECT public.add_lesson_comment(''40000000-0000-0000-0000-000000000001'', ''x'')',
    'P0001', 'access_denied');
SELECT tests.expect_error(
    'SELECT public.delete_lesson_comment(''ac000000-0000-0000-0000-000000000001'')',
    'P0001', 'permission_denied');
RESET ROLE;

-- A (lesson owner): sees the 3 visible rows on the lesson, removed hidden
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_lesson_comments(''40000000-0000-0000-0000-000000000001'')',
    3, 'c: A sees 3 visible comments (removed hidden)');
-- direct table select: A also sees their own removed row (author clause)
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_comments WHERE lesson_id = ''40000000-0000-0000-0000-000000000001''',
    4, 'c: A direct RLS select sees 3 visible + own removed');
RESET ROLE;

-- staff: sees all statuses (moderation)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_lesson_comments(''40000000-0000-0000-0000-000000000001'')',
    4, 'c: staff sees all 4 rows incl. removed');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Parent / lesson consistency + body limits (A writes on the owned lesson)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.add_lesson_comment(''40000000-0000-0000-0000-000000000001'', ''رد خاطئ'', ''ac000000-0000-0000-0000-000000000002'')',
    'P0001', 'invalid_parent');
SELECT tests.expect_error(
    'SELECT public.add_lesson_comment(''40000000-0000-0000-0000-000000000001'', ''رد على محذوف'', ''ac000000-0000-0000-0000-000000000005'')',
    'P0001', 'invalid_parent');
SELECT tests.expect_error(
    'SELECT public.add_lesson_comment(''40000000-0000-0000-0000-000000000001'', ''   '')',
    'P0001', 'invalid_body');
SELECT tests.expect_error(
    'SELECT public.add_lesson_comment(''40000000-0000-0000-0000-000000000001'', repeat(''x'', 1001))',
    'P0001', 'invalid_body');
SELECT tests.assert(
    ((SELECT public.add_lesson_comment('40000000-0000-0000-0000-000000000001', repeat('x', 1000))).status = 'visible'),
    'c: 1000-char body is accepted (boundary)');
RESET ROLE;

-- ---------------------------------------------------------------------
-- add_lesson_comment happy paths + notifications
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    ((SELECT public.add_lesson_comment('40000000-0000-0000-0000-000000000001', 'تعليق من الطالب')).author_id
        = '70000000-0000-0000-0000-000000000001'),
    'c: A adds a top-level comment');
RESET ROLE;

-- teacher replies to A's fixture comment -> lesson_comment to A (parent author)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT tests.assert(
    ((SELECT public.add_lesson_comment('40000000-0000-0000-0000-000000000001', 'رد المعلم',
        'ac000000-0000-0000-0000-000000000001')).parent_id
        = 'ac000000-0000-0000-0000-000000000001'),
    'c: teacher replies to A''s comment');
RESET ROLE;

-- notification assertions (postgres superuser reads past RLS)
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications
      WHERE user_id = ''70000000-0000-0000-0000-000000000001''
        AND type = ''lesson_comment'' AND entity_type = ''lesson_comments''
        AND entity_id = (SELECT id FROM public.lesson_comments WHERE body = ''رد المعلم'')',
    1, 'c: A notified lesson_comment when teacher replied to A''s comment');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications
      WHERE type = ''comment_reply'' AND entity_type = ''lesson_comments''
        AND entity_id = (SELECT id FROM public.lesson_comments WHERE body = ''رد المعلم'')
        AND user_id IN (''70000000-0000-0000-0000-000000000009'',
                        ''70000000-0000-0000-0000-00000000000a'')',
    2, 'c: comment_reply fan-out to other staff (teacher excluded as author)');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications
      WHERE type = ''comment_reply'' AND entity_type = ''lesson_comments''
        AND entity_id = (SELECT id FROM public.lesson_comments WHERE body = ''تعليق من الطالب'')
        AND user_id IN (''70000000-0000-0000-0000-000000000009'',
                        ''70000000-0000-0000-0000-00000000000a'',
                        ''70000000-0000-0000-0000-00000000000b'')',
    3, 'c: comment_reply fan-out to all 3 fixture staff on a student comment');

-- ---------------------------------------------------------------------
-- RLS: direct DML stays own-or-staff
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_rows('UPDATE public.lesson_comments SET body = ''معدل ذاتيا'' WHERE id = ''ac000000-0000-0000-0000-000000000001''',
    1, 'c: A updates own comment');
SELECT tests.expect_rows('UPDATE public.lesson_comments SET body = ''معدل'' WHERE id = ''ac000000-0000-0000-0000-000000000004''',
    0, 'c: A cannot update teacher''s comment');
SELECT tests.expect_rows('UPDATE public.lesson_comments SET status = ''removed'' WHERE id = ''ac000000-0000-0000-0000-000000000004''',
    0, 'c: A cannot moderate teacher''s comment');
SELECT tests.expect_rows('DELETE FROM public.lesson_comments WHERE id = ''ac000000-0000-0000-0000-000000000003''',
    1, 'c: A deletes own reply');
SELECT tests.expect_rows('DELETE FROM public.lesson_comments WHERE id = ''ac000000-0000-0000-0000-000000000004''',
    0, 'c: A cannot delete teacher''s comment');
SELECT tests.expect_error(
    'INSERT INTO public.lesson_comments (lesson_id, author_id, body) VALUES (''40000000-0000-0000-0000-000000000002'', ''70000000-0000-0000-0000-000000000001'', ''x'')',
    '42501', 'violates row-level security policy');
RESET ROLE;

-- delete RPC guard: non-author student cannot delete, staff can
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000004';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.delete_lesson_comment(''ac000000-0000-0000-0000-000000000004'')',
    'P0001', 'permission_denied');
SELECT tests.expect_error(
    'SELECT public.delete_lesson_comment(''ac000000-0000-0000-0000-0000000000ff'')',
    'P0001', 'comment_not_found');
RESET ROLE;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT public.delete_lesson_comment('ac000000-0000-0000-0000-000000000001');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_comments WHERE id = ''ac000000-0000-0000-0000-000000000001''',
    0, 'c: moderated comment gone');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Audit capture (audit_trigger, MED-8): inserts = 5 fixtures + 3 RPC
-- adds; updates = 1 (self body edit); deletes = 3 (A''s RLS delete of the
-- fixture reply, admin RPC delete of the fixture parent, and the CASCADE
-- delete of the teacher''s dynamic reply under that parent).
-- ---------------------------------------------------------------------
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs
      WHERE entity_type = ''lesson_comments'' AND action = ''lesson_comments.insert''',
    8, 'c: audit insert captured for 5 fixtures + 3 RPC adds');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs
      WHERE entity_type = ''lesson_comments'' AND action = ''lesson_comments.update''',
    1, 'c: audit update captured for the self body edit');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs
      WHERE entity_type = ''lesson_comments'' AND action = ''lesson_comments.delete''',
    3, 'c: audit delete captured (RLS delete + admin RPC delete + parent cascade)');

-- ---------------------------------------------------------------------
-- Grant posture (SECURITY.md 8.2 pattern)
-- ---------------------------------------------------------------------
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.add_lesson_comment(uuid, text, uuid)', 'EXECUTE'),
    'g: add_lesson_comment executable by authenticated');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.delete_lesson_comment(uuid)', 'EXECUTE'),
    'g: delete_lesson_comment executable by authenticated');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.list_lesson_comments(uuid)', 'EXECUTE'),
    'g: list_lesson_comments executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.add_lesson_comment(uuid, text, uuid)', 'EXECUTE'),
    'g: add_lesson_comment NOT executable by anon');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.list_lesson_comments(uuid)', 'EXECUTE'),
    'g: list_lesson_comments NOT executable by anon');
SELECT tests.assert(
    NOT has_function_privilege('authenticated', 'public.lesson_comments_parent_check()', 'EXECUTE'),
    'g: lesson_comments_parent_check internal (no client grant)');

-- ---------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------
RESET "app.current_user_id";
DELETE FROM public.notifications
WHERE entity_type = 'lesson_comments'
  AND entity_id IN (SELECT id FROM public.lesson_comments
                    WHERE lesson_id IN ('40000000-0000-0000-0000-000000000001',
                                        '40000000-0000-0000-0000-000000000002'));
DELETE FROM public.lesson_comments
WHERE lesson_id IN ('40000000-0000-0000-0000-000000000001',
                    '40000000-0000-0000-0000-000000000002');
DELETE FROM public.audit_logs
WHERE entity_type = 'lesson_comments';
