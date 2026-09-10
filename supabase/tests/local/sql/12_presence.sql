-- =====================================================================
-- 12_presence.sql — presence tracking (0055) assertions
-- ---------------------------------------------------------------------
-- Validates the online-presence subsystem:
--   * tables/views existence + constraints + indexes
--   * RLS: student own-row, admin read-all, anon/student denied for admin reads
--   * touch_presence happy path + rate-limit + closing
--   * get_online_students / get_student_presence_history / get_most_active_students
--   * close_stale_sessions internal lock + cleanup
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Schema shape
-- ---------------------------------------------------------------------
SELECT tests.assert(
    (SELECT to_regclass('public.student_sessions') IS NOT NULL),
    'presence: student_sessions table exists');
SELECT tests.assert(
    (SELECT to_regclass('public.student_activity_events') IS NOT NULL),
    'presence: student_activity_events table exists');
SELECT tests.assert(
    (SELECT to_regclass('public.v_online_students') IS NOT NULL),
    'presence: v_online_students view exists');
SELECT tests.assert(
    (SELECT to_regclass('public.v_student_activity_summary') IS NOT NULL),
    'presence: v_student_activity_summary view exists');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes WHERE tablename = 'student_sessions' AND indexname = 'uq_student_sessions_open'),
    'presence: unique open session index exists');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_proc WHERE proname = 'touch_presence'),
    'presence: touch_presence function exists');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_proc WHERE proname = 'get_online_students'),
    'presence: get_online_students exists');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_proc WHERE proname = 'get_student_presence_history'),
    'presence: get_student_presence_history exists');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_proc WHERE proname = 'get_most_active_students'),
    'presence: get_most_active_students exists');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_proc WHERE proname = 'close_stale_sessions'),
    'presence: close_stale_sessions exists');

-- RLS enabled + forced
SELECT tests.assert(
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.student_sessions'::regclass),
    'presence: student_sessions RLS enabled+forced');
SELECT tests.assert(
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.student_activity_events'::regclass),
    'presence: student_activity_events RLS enabled+forced');

-- Views are locked (no anon/authenticated SELECT)
SELECT tests.assert(NOT has_table_privilege('anon', 'public.v_online_students', 'SELECT'), 'presence: v_online_students anon locked');
SELECT tests.assert(NOT has_table_privilege('authenticated', 'public.v_online_students', 'SELECT'), 'presence: v_online_students authenticated locked');
SELECT tests.assert(NOT has_table_privilege('anon', 'public.v_student_activity_summary', 'SELECT'), 'presence: v_student_activity_summary anon locked');
SELECT tests.assert(NOT has_table_privilege('authenticated', 'public.v_student_activity_summary', 'SELECT'), 'presence: v_student_activity_summary authenticated locked');

-- Functions grants: anon none, authenticated 5 presence RPCs
SELECT tests.assert(NOT has_function_privilege('anon', 'public.touch_presence(text, uuid, boolean, boolean)', 'EXECUTE'), 'presence: anon cannot exec touch_presence');
SELECT tests.assert(has_function_privilege('authenticated', 'public.touch_presence(text, uuid, boolean, boolean)', 'EXECUTE'), 'presence: authenticated can exec touch_presence');
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.close_stale_sessions()', 'EXECUTE'), 'presence: close_stale_sessions not executable by authenticated');

-- ---------------------------------------------------------------------
-- 2. RLS: admin reads vs student reads
-- ---------------------------------------------------------------------
-- Clean slate
DELETE FROM public.student_sessions WHERE student_id IN ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002');

-- Student A creates a session via touch_presence
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_rows('SELECT public.touch_presence(''/student/dashboard'', NULL, true, false)', 1, 'presence: student A touch_presence succeeds');
RESET ROLE;
RESET "app.current_user_id";

-- Student A can SELECT own session
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert((SELECT count(*) = 1 FROM public.student_sessions WHERE student_id = '70000000-0000-0000-0000-000000000001'), 'presence: student A can read own session');
RESET ROLE;
RESET "app.current_user_id";

-- Student B cannot see A's session
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000002';
SET LOCAL ROLE student;
SELECT tests.assert((SELECT count(*) = 0 FROM public.student_sessions WHERE student_id = '70000000-0000-0000-0000-000000000001'), 'presence: student B cannot read A session');
RESET ROLE;
RESET "app.current_user_id";

-- Admin can read all
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.assert((SELECT count(*) >= 1 FROM public.student_sessions), 'presence: admin can read all sessions');
RESET ROLE;
RESET "app.current_user_id";

-- get_online_students: admin succeeds, student denied, anon denied
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_rows('SELECT public.get_online_students()', 1, 'presence: admin get_online_students returns rows');
RESET ROLE;
RESET "app.current_user_id";

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error('SELECT public.get_online_students()', 'P0001', 'permission_denied');
RESET ROLE;
RESET "app.current_user_id";

-- touch_presence: anon / non-student denied
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error('SELECT public.touch_presence(''/walid/dashboard'', NULL, true, false)', 'P0001', 'access_denied');
RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- 3. touch_presence happy path + rate limit + lesson enrichment
-- ---------------------------------------------------------------------
-- Second immediate touch with same path should be throttled
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    (SELECT (public.touch_presence('/student/dashboard', NULL, true, false)::jsonb ->> 'throttled') = 'true'),
    'presence: immediate duplicate touch is throttled');
RESET ROLE;
RESET "app.current_user_id";

-- Touch with different path should not be throttled
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    (SELECT (public.touch_presence('/student/curriculum', NULL, true, false)::jsonb ->> 'throttled') = 'false'),
    'presence: different path touch not throttled');
RESET ROLE;
RESET "app.current_user_id";

-- Current path updated
SELECT tests.assert(
    (SELECT current_path = '/student/curriculum' FROM public.student_sessions WHERE student_id = '70000000-0000-0000-0000-000000000001' AND ended_at IS NULL),
    'presence: current_path updated on path change');

-- Only one open session per student
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.student_sessions WHERE student_id = '70000000-0000-0000-0000-000000000001' AND ended_at IS NULL),
    'presence: only one open session per student');

-- ---------------------------------------------------------------------
-- 4. close_stale_sessions and closing
-- ---------------------------------------------------------------------
-- Make session stale (last_seen 10 minutes ago)
UPDATE public.student_sessions SET last_seen_at = now() - interval '10 minutes'
WHERE student_id = '70000000-0000-0000-0000-000000000001' AND ended_at IS NULL;

SELECT tests.assert(
    (SELECT count(*) = 0 FROM public.v_online_students WHERE student_id = '70000000-0000-0000-0000-000000000001'),
    'presence: stale session not in v_online_students (2m window)');

SELECT tests.assert(
    (SELECT public.close_stale_sessions() >= 1),
    'presence: close_stale_sessions closes at least one');

SELECT tests.assert(
    (SELECT ended_at IS NOT NULL FROM public.student_sessions WHERE student_id = '70000000-0000-0000-0000-000000000001' ORDER BY started_at DESC LIMIT 1),
    'presence: stale session now closed');

-- New heartbeat after close creates new session
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_rows('SELECT public.touch_presence(''/student/lessons/40000000-0000-0000-0000-000000000001'', ''40000000-0000-0000-0000-000000000001'', true, false)', 1, 'presence: new session after stale close');
RESET ROLE;
RESET "app.current_user_id";

-- Closing flag ends session
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_rows('SELECT public.touch_presence(NULL, NULL, false, true)', 1, 'presence: closing touch succeeds');
RESET ROLE;
RESET "app.current_user_id";

SELECT tests.assert(
    (SELECT ended_at IS NOT NULL FROM public.student_sessions WHERE student_id = '70000000-0000-0000-0000-000000000001' ORDER BY started_at DESC LIMIT 1),
    'presence: session ended after closing flag');

-- ---------------------------------------------------------------------
-- 5. History and ranking
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_rows('SELECT public.get_student_presence_history(''70000000-0000-0000-0000-000000000001'', NULL, NULL, 10, 0)', 1, 'presence: admin history returns rows');
SELECT tests.expect_rows('SELECT public.get_most_active_students(NULL, NULL, 5)', 1, 'presence: admin ranking returns rows');
RESET ROLE;
RESET "app.current_user_id";

-- Student cannot read history
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000002';
SET LOCAL ROLE student;
SELECT tests.expect_error('SELECT public.get_student_presence_history(''70000000-0000-0000-0000-000000000001'', NULL, NULL, 10, 0)', 'P0001', 'permission_denied');
SELECT tests.expect_error('SELECT public.get_most_active_students(NULL, NULL, 5)', 'P0001', 'permission_denied');
RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------
DELETE FROM public.student_sessions WHERE student_id IN ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002');
DELETE FROM public.student_activity_events WHERE student_id IN ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002');
SELECT tests.assert((SELECT count(*) = 0 FROM public.student_sessions WHERE student_id = '70000000-0000-0000-0000-000000000001'), 'presence: cleanup ok');
