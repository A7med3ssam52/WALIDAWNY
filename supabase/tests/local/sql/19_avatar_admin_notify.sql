-- =====================================================================
-- 19_avatar_admin_notify.sql — Phase 9 (0087) admin avatar notifications
-- ---------------------------------------------------------------------
-- Covers:
--   * enum value avatar_updated exists on public.notification_type
--   * set_my_avatar as active student A notifies the active admin (AD)
--     with entity link to the student; teacher/mr_walid/disabled admin
--     get nothing
--   * per-admin fan-out (0090): a second, dedicated temp admin gets its
--     OWN row per change (the pre-0090 shared dedup_key silently
--     dropped every admin after the first)
--   * every change notifies: a second set (after a clock tick) inserts
--     a second row (per-change dedup, not once-only)
--   * remove_my_avatar does NOT notify
-- NOTE: notifications SELECT is own-row RLS, so cross-user counts run
-- as the harness owner (no SET LOCAL ROLE) which bypasses RLS.
-- Fixtures: A (7000...001, active student), AD (7000...00a, active
-- admin), W (7000...009, mr_walid), T (7000...00b, teacher), one temp
-- disabled admin + one temp active admin (both removed at the end).
-- Order-independence: other suites may leave extra active admins
-- behind; per-admin dedup (0090) makes every matching admin's count
-- exact, and the dedicated temp admin gives a zero-baseline anchor.
-- =====================================================================

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'notification_type' AND e.enumlabel = 'avatar_updated'),
    'a: avatar_updated enum value exists');

-- Order-independence: earlier suites (e.g. 15_avatars happy path) run
-- set_my_avatar too, which now notifies as well — start from zero.
DELETE FROM public.notifications WHERE type = 'avatar_updated';

-- Precondition probes (owner view): AD active; student A active.
-- (No global admin-population assertion: other suites may leave their
-- own active admins behind; per-user assertions below are what matter.)
SELECT tests.expect_count(
    'SELECT count(*) FROM public.profiles WHERE id = ''70000000-0000-0000-0000-00000000000a'' AND role = ''admin'' AND status = ''active'' AND deleted_at IS NULL',
    1, 'pre: AD is an active admin');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.profiles WHERE id = ''70000000-0000-0000-0000-000000000001'' AND role = ''student'' AND status = ''active'' AND deleted_at IS NULL',
    1, 'pre: student A active');

-- Fixture object for A (harness owner bypasses storage RLS).
INSERT INTO storage.objects (id, bucket_id, name, owner)
VALUES ('aa000000-0000-0000-0000-0000000000a2', 'avatars',
        '70000000-0000-0000-0000-000000000001/avatar.jpg',
        '70000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Temp admins (created with full meta so handle_new_user succeeds;
-- removed at the end): one disabled, one active anchor.
INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data) VALUES
    ('aa000000-0000-0000-0000-0000000000a3', 'avatar-disabled-admin@walid.test', 'x',
     '{"full_name":"Disabled Admin","phone":"+201000000003","guardian_phone":"+201000000003","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}'),
    ('aa000000-0000-0000-0000-0000000000a4', 'avatar-anchor-admin@walid.test', 'x',
     '{"full_name":"Anchor Admin","phone":"+201000000004","guardian_phone":"+201000000004","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}')
ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET role = 'admin', status = 'disabled'
WHERE id = 'aa000000-0000-0000-0000-0000000000a3';
UPDATE public.profiles SET role = 'admin', status = 'active'
WHERE id = 'aa000000-0000-0000-0000-0000000000a4';
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE type = ''avatar_updated'' AND user_id = ''aa000000-0000-0000-0000-0000000000a4''',
    0, 'pre: anchor admin starts with zero avatar notifications');

-- First change as student A.
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT public.set_my_avatar('70000000-0000-0000-0000-000000000001/avatar.jpg');
RESET ROLE;
RESET "app.current_user_id";

-- Cross-user counts as harness owner (bypasses notifications RLS).
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE type = ''avatar_updated'' AND user_id = ''70000000-0000-0000-0000-00000000000a''',
    1, 'rpc: active admin AD notified on first avatar set');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE type = ''avatar_updated'' AND user_id = ''70000000-0000-0000-0000-00000000000a'' AND entity_type = ''profiles'' AND entity_id = ''70000000-0000-0000-0000-000000000001''',
    1, 'rpc: AD notification links the student via entity_id');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE type = ''avatar_updated'' AND user_id = ''aa000000-0000-0000-0000-0000000000a4'' AND entity_type = ''profiles'' AND entity_id = ''70000000-0000-0000-0000-000000000001''',
    1, 'rpc: anchor admin gets its own row per change (0090 fan-out)');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE type = ''avatar_updated'' AND user_id IN (''70000000-0000-0000-0000-000000000009'', ''70000000-0000-0000-0000-00000000000b'', ''aa000000-0000-0000-0000-0000000000a3'')',
    0, 'rpc: mr_walid, teacher and disabled admin get nothing');

-- Second change notifies again (per-change, not once-only).
SELECT pg_sleep(0.02);
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT public.set_my_avatar('70000000-0000-0000-0000-000000000001/avatar.jpg');
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE type = ''avatar_updated'' AND user_id = ''70000000-0000-0000-0000-00000000000a''',
    2, 'rpc: second avatar set notifies again');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE type = ''avatar_updated'' AND user_id = ''aa000000-0000-0000-0000-0000000000a4''',
    2, 'rpc: anchor admin notified again on second set');

-- Removal does not notify.
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT public.remove_my_avatar();
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE type = ''avatar_updated'' AND user_id = ''70000000-0000-0000-0000-00000000000a''',
    2, 'rpc: remove_my_avatar adds no notification');

-- ---------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------
DELETE FROM public.notifications WHERE type = 'avatar_updated';
DELETE FROM storage.objects WHERE id = 'aa000000-0000-0000-0000-0000000000a2';
DELETE FROM public.profiles WHERE id IN ('aa000000-0000-0000-0000-0000000000a3', 'aa000000-0000-0000-0000-0000000000a4');
DELETE FROM auth.users WHERE id IN ('aa000000-0000-0000-0000-0000000000a3', 'aa000000-0000-0000-0000-0000000000a4');
UPDATE public.profiles SET avatar_path = NULL WHERE id = '70000000-0000-0000-0000-000000000001';
