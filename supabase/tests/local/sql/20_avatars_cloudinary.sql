-- =====================================================================
-- 20_avatars_cloudinary.sql — Phase 10 (0089) Cloudinary avatar pointers
-- ---------------------------------------------------------------------
-- Covers the 0089 rewrite of set_my_avatar(p_path):
--   * negatives: no uid, disabled student, foreign uid (legacy AND
--     cloudinary shapes), malformed cloudinary pointers (bad ext,
--     missing/non-numeric version, wrong prefix, uid segment mismatch)
--   * legacy regression: own legacy path with no object still raises
--     avatar_missing (the 0088 existence check survived the rewrite)
--   * happy path: a well-formed caller-owned cloudinary pointer binds
--     WITHOUT any storage.objects row; remove_my_avatar clears the
--     binding and touches no storage object
-- Fixture ids use aa000000-... (none needed here — no storage rows).
-- Student A (7000...001, active), B (7000...002, disabled) come from
-- 02_roles. avatar_updated notifications from this suite are removed
-- at the end (order-independence with 19_avatar_admin_notify).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Section 1: negatives
-- ---------------------------------------------------------------------
-- No uid at all (cloudinary shape).
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''cloudinary:70000000-0000-0000-0000-000000000001/avatar.jpg:1788000000'')',
    'P0001', 'permission_denied');

-- Disabled student B cannot bind a cloudinary pointer.
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000002';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''cloudinary:70000000-0000-0000-0000-000000000002/avatar.jpg:1788000000'')',
    'P0001', 'permission_denied');
RESET ROLE;
RESET "app.current_user_id";

-- Active student A: foreign pointers rejected (legacy + cloudinary).
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''70000000-0000-0000-0000-000000000004/avatar.jpg'')',
    'P0001', 'invalid_avatar_path');
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''cloudinary:70000000-0000-0000-0000-000000000004/avatar.jpg:1788000000'')',
    'P0001', 'invalid_avatar_path');
-- Malformed cloudinary pointers: bad extension, missing version,
-- non-numeric version, wrong prefix, empty version.
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''cloudinary:70000000-0000-0000-0000-000000000001/avatar.gif:1788000000'')',
    'P0001', 'invalid_avatar_path');
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''cloudinary:70000000-0000-0000-0000-000000000001/avatar.jpg'')',
    'P0001', 'invalid_avatar_path');
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''cloudinary:70000000-0000-0000-0000-000000000001/avatar.jpg:latest'')',
    'P0001', 'invalid_avatar_path');
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''cdn:70000000-0000-0000-0000-000000000001/avatar.jpg:1788000000'')',
    'P0001', 'invalid_avatar_path');
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''cloudinary:70000000-0000-0000-0000-000000000001/avatar.jpg:'')',
    'P0001', 'invalid_avatar_path');
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(NULL)',
    'P0001', 'invalid_avatar_path');

-- Legacy regression: own legacy path with no uploaded object still
-- raises avatar_missing after the 0089 rewrite.
SELECT tests.expect_error(
    'SELECT public.set_my_avatar(''70000000-0000-0000-0000-000000000001/avatar.jpg'')',
    'P0001', 'avatar_missing');
RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Section 2: happy path — cloudinary pointer binds with no storage row
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT public.set_my_avatar('cloudinary:70000000-0000-0000-0000-000000000001/avatar.jpg:1788000000');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.profiles WHERE id = ''70000000-0000-0000-0000-000000000001'' AND avatar_path = ''cloudinary:70000000-0000-0000-0000-000000000001/avatar.jpg:1788000000''',
    1, 'rpc: set_my_avatar binds the cloudinary pointer without a storage row');
-- webp variant re-binds the same way (overwrite, no orphans).
SELECT public.set_my_avatar('cloudinary:70000000-0000-0000-0000-000000000001/avatar.webp:1788000001');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.profiles WHERE id = ''70000000-0000-0000-0000-000000000001'' AND avatar_path = ''cloudinary:70000000-0000-0000-0000-000000000001/avatar.webp:1788000001''',
    1, 'rpc: set_my_avatar re-binds the webp cloudinary pointer');

-- ---------------------------------------------------------------------
-- Section 3: remove_my_avatar clears a cloudinary binding, no storage touch
-- ---------------------------------------------------------------------
SELECT public.remove_my_avatar();
SELECT tests.expect_count(
    'SELECT count(*) FROM public.profiles WHERE id = ''70000000-0000-0000-0000-000000000001'' AND avatar_path IS NULL',
    1, 'rpc: remove_my_avatar clears the cloudinary binding');
SELECT tests.expect_count(
    'SELECT count(*) FROM storage.objects WHERE bucket_id = ''avatars''',
    0, 'rpc: remove_my_avatar touches no storage object for cloudinary paths');
RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------
DELETE FROM public.notifications WHERE type = 'avatar_updated';
UPDATE public.profiles SET avatar_path = NULL WHERE id = '70000000-0000-0000-0000-000000000001';
