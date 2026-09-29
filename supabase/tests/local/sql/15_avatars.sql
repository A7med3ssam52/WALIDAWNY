-- =====================================================================
-- 15_avatars.sql — Phase 9 (0082) student profile photos assertions
-- ---------------------------------------------------------------------
-- Covers:
--   * schema shape (profiles.avatar_path nullable text; private
--     `avatars` bucket; the four storage.objects policies with the
--     right commands + roles)
--   * grants (set_my_avatar / remove_my_avatar executable by
--     authenticated, NOT by anon)
--   * set_my_avatar negatives: no uid, disabled student, foreign path,
--     missing storage object
--   * happy path: object exists -> bind; remove_my_avatar clears the
--     binding and deletes the object
--   * storage SELECT matrix (owner sees own / other student sees
--     nothing / teacher sees / anon sees nothing)
-- Fixture ids use aa000000-... and are removed at the end. Student A
-- (7000...001, active), B (7000...002, disabled), D (7000...004,
-- active), T (7000...00b, teacher) come from 02_roles.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Section 1: schema shape
-- ---------------------------------------------------------------------
SELECT tests.assert(
    (SELECT count(*) = 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles'
        AND column_name = 'avatar_path' AND data_type = 'text'
        AND is_nullable = 'YES'),
    'a: profiles.avatar_path exists as nullable text');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM storage.buckets
      WHERE id = 'avatars' AND public = false),
    'a: private avatars bucket exists');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'avatars_insert_own' AND cmd = 'INSERT'
        AND roles::text = '{authenticated}'),
    'a: avatars_insert_own FOR INSERT TO authenticated exists');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'avatars_update_own' AND cmd = 'UPDATE'
        AND roles::text = '{authenticated}'),
    'a: avatars_update_own FOR UPDATE TO authenticated exists');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'avatars_select_owner_staff' AND cmd = 'SELECT'
        AND roles::text = '{authenticated}'),
    'a: avatars_select_owner_staff FOR SELECT TO authenticated exists');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'avatars_delete_owner_admin' AND cmd = 'DELETE'
        AND roles::text = '{authenticated}'),
    'a: avatars_delete_owner_admin FOR DELETE TO authenticated exists');

SELECT tests.assert(
    has_function_privilege('authenticated', 'public.set_my_avatar(text)', 'EXECUTE'),
    'g: set_my_avatar executable by authenticated');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.remove_my_avatar()', 'EXECUTE'),
    'g: remove_my_avatar executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.set_my_avatar(text)', 'EXECUTE'),
    'g: set_my_avatar NOT executable by anon');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.remove_my_avatar()', 'EXECUTE'),
    'g: remove_my_avatar NOT executable by anon');

-- ---------------------------------------------------------------------
-- Section 2: set_my_avatar negatives
-- ---------------------------------------------------------------------
-- No uid at all.
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''70000000-0000-0000-0000-000000000001/avatar.jpg'')',
    'P0001', 'permission_denied');

-- Disabled student B cannot bind.
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000002';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''70000000-0000-0000-0000-000000000002/avatar.jpg'')',
    'P0001', 'permission_denied');
RESET ROLE;
RESET "app.current_user_id";

-- Active student A: foreign path rejected.
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''70000000-0000-0000-0000-000000000004/avatar.jpg'')',
    'P0001', 'invalid_avatar_path');
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''avatars/evil.png'')',
    'P0001', 'invalid_avatar_path');
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(NULL)',
    'P0001', 'invalid_avatar_path');

-- Own path but no uploaded object yet.
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''70000000-0000-0000-0000-000000000001/avatar.jpg'')',
    'P0001', 'avatar_missing');
RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Section 3: happy path (fixture object inserted as harness owner)
-- ---------------------------------------------------------------------
INSERT INTO storage.objects (id, bucket_id, name, owner)
VALUES ('aa000000-0000-0000-0000-000000000001', 'avatars',
        '70000000-0000-0000-0000-000000000001/avatar.jpg',
        '70000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT public.set_my_avatar('70000000-0000-0000-0000-000000000001/avatar.jpg');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.profiles WHERE id = ''70000000-0000-0000-0000-000000000001'' AND avatar_path = ''70000000-0000-0000-0000-000000000001/avatar.jpg''',
    1, 'rpc: set_my_avatar binds the fixed path');

-- Owner sees their own object via RLS.
SELECT tests.expect_count(
    'SELECT count(*) FROM storage.objects WHERE bucket_id = ''avatars'' AND name = ''70000000-0000-0000-0000-000000000001/avatar.jpg''',
    1, 'rls: owner sees own avatar object');
RESET ROLE;
RESET "app.current_user_id";

-- Other active student D sees nothing.
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000004';
SET LOCAL ROLE student;
SELECT tests.expect_count(
    'SELECT count(*) FROM storage.objects WHERE bucket_id = ''avatars''',
    0, 'rls: other student sees no avatar objects');
RESET ROLE;
RESET "app.current_user_id";

-- Teacher sees the object (staff branch).
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT tests.expect_count(
    'SELECT count(*) FROM storage.objects WHERE bucket_id = ''avatars'' AND name = ''70000000-0000-0000-0000-000000000001/avatar.jpg''',
    1, 'rls: teacher sees the avatar object');
RESET ROLE;
RESET "app.current_user_id";

-- Anon sees nothing.
SET LOCAL ROLE anon;
SELECT tests.expect_count(
    'SELECT count(*) FROM storage.objects WHERE bucket_id = ''avatars''',
    0, 'rls: anon sees no avatar objects');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Section 4: remove_my_avatar clears binding + object
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT public.remove_my_avatar();
SELECT tests.expect_count(
    'SELECT count(*) FROM public.profiles WHERE id = ''70000000-0000-0000-0000-000000000001'' AND avatar_path IS NULL',
    1, 'rpc: remove_my_avatar clears the binding');
SELECT tests.expect_count(
    'SELECT count(*) FROM storage.objects WHERE bucket_id = ''avatars'' AND name = ''70000000-0000-0000-0000-000000000001/avatar.jpg''',
    0, 'rpc: remove_my_avatar deletes the object');
RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------
DELETE FROM storage.objects WHERE id = 'aa000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET avatar_path = NULL WHERE id = '70000000-0000-0000-0000-000000000001';
