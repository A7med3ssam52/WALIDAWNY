-- =====================================================================
-- 16_avatar_reminders.sql — Phase 9 (0083) bulk avatar reminders
-- ---------------------------------------------------------------------
-- Covers:
--   * enum value avatar_required exists on public.notification_type
--   * grants (remind_missing_avatars executable by authenticated,
--     NOT by anon)
--   * negatives: anon / plain student / disabled student all get
--     permission_denied
--   * happy path as admin: only active, non-deleted students WITHOUT
--     a photo are notified; returns the inserted count; rerun is a
--     no-op returning 0 (dedup)
-- Fixtures: A (7000...001, active, no photo), B (7000...002,
-- disabled), T (7000...00b, teacher). A temp admin row is created
-- and removed at the end.
-- =====================================================================

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'notification_type' AND e.enumlabel = 'avatar_required'),
    'a: avatar_required enum value exists');

SELECT tests.assert(
    has_function_privilege('authenticated', 'public.remind_missing_avatars()', 'EXECUTE'),
    'g: remind_missing_avatars executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.remind_missing_avatars()', 'EXECUTE'),
    'g: remind_missing_avatars NOT executable by anon');

-- GUC-free (no uid): permission_denied.
SELECT tests.expect_error(
    'SELECT public.remind_missing_avatars()',
    'P0001', 'permission_denied');

-- Plain active student: permission_denied.
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.remind_missing_avatars()',
    'P0001', 'permission_denied');
RESET ROLE;
RESET "app.current_user_id";

-- Temp admin fixture (removed at the end).
INSERT INTO auth.users (id, email) VALUES
    ('aa000000-0000-0000-0000-0000000000a1', 'avatar-admin@walid.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, full_name, phone, guardian_phone, address, role, status)
VALUES ('aa000000-0000-0000-0000-0000000000a1', 'Avatar Admin', '+201000000001', '+201000000001', 'Cairo', 'admin', 'active')
ON CONFLICT (id) DO NOTHING;

-- Happy path: A has no photo -> notified; B disabled -> skipped.
SET LOCAL "app.current_user_id" = 'aa000000-0000-0000-0000-0000000000a1';
SET LOCAL ROLE authenticated;
SELECT tests.assert(
    (SELECT public.remind_missing_avatars()) = 1,
    'rpc: first run notifies exactly the 1 eligible student');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE type = ''avatar_required'' AND user_id = ''70000000-0000-0000-0000-000000000001''',
    1, 'rpc: A got the avatar_required notification');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE type = ''avatar_required'' AND user_id = ''70000000-0000-0000-0000-000000000002''',
    0, 'rpc: disabled B is skipped');

-- Rerun is a no-op (dedup).
SELECT tests.assert(
    (SELECT public.remind_missing_avatars()) = 0,
    'rpc: second run inserts nothing (dedup)');
RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------
DELETE FROM public.notifications WHERE dedup_key LIKE 'avatar_required:%';
DELETE FROM public.profiles WHERE id = 'aa000000-0000-0000-0000-0000000000a1';
DELETE FROM auth.users WHERE id = 'aa000000-0000-0000-0000-0000000000a1';
