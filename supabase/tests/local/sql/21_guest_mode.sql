-- =====================================================================
-- 21_guest_mode.sql — Phase 13 (0092) guest-mode assertions
-- ---------------------------------------------------------------------
-- Covers:
--   * grants (new guest RPCs: authenticated yes / anon no)
--   * set_guest_status gate (admin-only; target must be a student)
--   * staff mutation guard (walid cannot disable a guest; admin can)
--   * list_trash / list_all_unit_purchases / list_codes_by_unit exclude
--     guests for every caller (incl. admin)
--   * grant_guest_access happy path (zero-price purchase, grade-scoped,
--     can_access_lesson opens) + revoke
--   * dashboard students.total + streak board + presence-less aggregates
--     exclude guests
--   * leaderboard + comments hide guests from non-admin viewers
--   * suggestions inbox split (main vs guest)
-- Fixtures use 6d000000-... ids and are removed at the end.
-- Shared A-H/W/AD fixtures from 02_roles are read-only here.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.set_guest_status(uuid, boolean)', 'EXECUTE'),
    'g: set_guest_status executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.set_guest_status(uuid, boolean)', 'EXECUTE'),
    'g: set_guest_status NOT executable by anon');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.list_guests(boolean)', 'EXECUTE'),
    'g: list_guests executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.list_guests(boolean)', 'EXECUTE'),
    'g: list_guests NOT executable by anon');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.grant_guest_access(uuid, uuid)', 'EXECUTE'),
    'g: grant_guest_access executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.grant_guest_access(uuid, uuid)', 'EXECUTE'),
    'g: grant_guest_access NOT executable by anon');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.revoke_guest_access(uuid, uuid)', 'EXECUTE'),
    'g: revoke_guest_access executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.revoke_guest_access(uuid, uuid)', 'EXECUTE'),
    'g: revoke_guest_access NOT executable by anon');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.list_guest_purchases(uuid)', 'EXECUTE'),
    'g: list_guest_purchases executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.list_guest_purchases(uuid)', 'EXECUTE'),
    'g: list_guest_purchases NOT executable by anon');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.get_guest_stats()', 'EXECUTE'),
    'g: get_guest_stats executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.get_guest_stats()', 'EXECUTE'),
    'g: get_guest_stats NOT executable by anon');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.list_guest_suggestions(text, integer, integer)', 'EXECUTE'),
    'g: list_guest_suggestions executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.list_guest_suggestions(text, integer, integer)', 'EXECUTE'),
    'g: list_guest_suggestions NOT executable by anon');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.is_guest_profile(uuid)', 'EXECUTE'),
    'g: is_guest_profile executable by authenticated');

-- ---------------------------------------------------------------------
-- Fixtures: two students (G1 guest-candidate, G2 normal), one published
-- unit + lesson in grade 10000000-...-000000000001, pricing + code.
-- ---------------------------------------------------------------------
INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data) VALUES
    ('6d000000-0000-0000-0000-000000000001', 'test-g1@walid.test', 'x',
     '{"full_name":"GUEST1","phone":"+201001000021","guardian_phone":"+201001000021","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}'),
    ('6d000000-0000-0000-0000-000000000002', 'test-g2@walid.test', 'x',
     '{"full_name":"GUEST2","phone":"+201001000022","guardian_phone":"+201001000022","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}');

INSERT INTO public.units (id, grade_id, name, sort_order, status)
VALUES ('6d000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 'TEST-GUEST-U1', 91, 'published');
INSERT INTO public.lessons (id, unit_id, title, sort_order, status)
VALUES ('6d000000-0000-0000-0000-000000000011', '6d000000-0000-0000-0000-000000000010', 'TEST-GUEST-L1', 91, 'published');
INSERT INTO public.unit_pricing (id, unit_id, base_price, platform_fee, is_active)
VALUES ('6d000000-0000-0000-0000-000000000012', '6d000000-0000-0000-0000-000000000010', 200, 50, true);
INSERT INTO public.unit_codes (id, code, unit_pricing_id, status, created_by)
VALUES ('6d000000-0000-0000-0000-000000000013', 'WLDN-GUEST0001', '6d000000-0000-0000-0000-000000000012', 'available', '70000000-0000-0000-0000-00000000000a');

-- ---------------------------------------------------------------------
-- set_guest_status gate
-- ---------------------------------------------------------------------
-- walid cannot flag guests
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.set_guest_status(''6d000000-0000-0000-0000-000000000001'', true)',
    'P0001', 'access_denied');
RESET ROLE;

-- admin flags G1 as guest; non-student target rejected
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE student;
SELECT public.set_guest_status('6d000000-0000-0000-0000-000000000001', true);
SELECT tests.assert(
    (SELECT p.is_guest FROM public.profiles p WHERE p.id = '6d000000-0000-0000-0000-000000000001') IS TRUE,
    'g: admin set_guest_status(true) flags the student');
SELECT tests.expect_error(
    'SELECT public.set_guest_status(''70000000-0000-0000-0000-000000000009'', true)',
    'P0001', 'target_not_student');
RESET ROLE;

-- guest RPCs deny non-admin
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE student;
SELECT tests.expect_error('SELECT count(*) FROM public.list_guests()', 'P0001', 'access_denied');
SELECT tests.expect_error('SELECT public.get_guest_stats()', 'P0001', 'access_denied');
SELECT tests.expect_error(
    'SELECT public.grant_guest_access(''6d000000-0000-0000-0000-000000000001'', ''6d000000-0000-0000-0000-000000000010'')',
    'P0001', 'access_denied');
RESET ROLE;

-- admin guest list + stats see exactly the one guest
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE student;
SELECT tests.assert(
    (SELECT count(*) FROM public.list_guests()) = 1,
    'g: list_guests returns the single guest for admin');
SELECT tests.assert(
    ((SELECT public.get_guest_stats() ->> 'total_guests')::int = 1),
    'g: get_guest_stats counts the single guest');
SELECT tests.assert(
    ((SELECT public.get_guest_stats() ->> 'guest_purchases')::int = 0),
    'g: no guest purchases yet');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Staff mutation guard: walid cannot touch the guest; admin can.
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.disable_student(''6d000000-0000-0000-0000-000000000001'', ''spam'')',
    'P0001', 'access_denied');
SELECT tests.expect_error(
    'SELECT public.soft_delete_student(''6d000000-0000-0000-0000-000000000001'')',
    'P0001', 'access_denied');
RESET ROLE;

-- admin lifecycle on the guest still works
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE student;
SELECT public.disable_student('6d000000-0000-0000-0000-000000000001', 'guest check');
SELECT tests.assert(
    (SELECT p.status FROM public.profiles p WHERE p.id = '6d000000-0000-0000-0000-000000000001') = 'disabled',
    'g: admin can disable a guest');
SELECT public.enable_student('6d000000-0000-0000-0000-000000000001');
SELECT tests.assert(
    (SELECT p.status FROM public.profiles p WHERE p.id = '6d000000-0000-0000-0000-000000000001') = 'active',
    'g: admin can re-enable a guest');
RESET ROLE;

-- ---------------------------------------------------------------------
-- grant / access / revoke (admin grants, guest learns)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE student;
SELECT public.grant_guest_access('6d000000-0000-0000-0000-000000000001', '6d000000-0000-0000-0000-000000000010');
SELECT tests.assert(
    EXISTS (SELECT 1 FROM public.unit_purchases up
            WHERE up.student_id = '6d000000-0000-0000-0000-000000000001'
              AND up.unit_id = '6d000000-0000-0000-0000-000000000010'
              AND up.status = 'active' AND up.total_price = 0 AND up.code_id IS NULL),
    'g: grant creates a zero-price codeless purchase');
SELECT tests.assert(
    (SELECT count(*) FROM public.list_guest_purchases('6d000000-0000-0000-0000-000000000001')) = 1,
    'g: list_guest_purchases returns the grant for admin');
RESET ROLE;

-- the guest itself can now open the lesson
SET LOCAL "app.current_user_id" = '6d000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    public.can_access_lesson('6d000000-0000-0000-0000-000000000011'),
    'g: granted guest passes can_access_lesson');
RESET ROLE;

-- main purchase/code surfaces exclude the guest grant for everyone
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE student;
SELECT tests.assert(
    NOT EXISTS (SELECT 1 FROM public.list_all_unit_purchases()
                WHERE student_id = '6d000000-0000-0000-0000-000000000001'),
    'g: list_all_unit_purchases hides guest rows from walid');
RESET ROLE;
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE student;
SELECT tests.assert(
    NOT EXISTS (SELECT 1 FROM public.list_all_unit_purchases()
                WHERE student_id = '6d000000-0000-0000-0000-000000000001'),
    'g: list_all_unit_purchases hides guest rows even for admin');
SELECT tests.assert(
    ((SELECT public.get_dashboard_stats() -> 'students' ->> 'total')::int
     = (SELECT count(*) FROM public.profiles WHERE role = 'student' AND COALESCE(is_guest, false) = false AND deleted_at IS NULL)),
    'g: dashboard students.total excludes guests');
SELECT tests.assert(
    NOT EXISTS (SELECT 1 FROM public.list_student_streaks() WHERE student_id = '6d000000-0000-0000-0000-000000000001'),
    'g: streak board excludes the guest for admin');
RESET ROLE;

-- revoke closes access again
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE student;
SELECT public.revoke_guest_access('6d000000-0000-0000-0000-000000000001', '6d000000-0000-0000-0000-000000000010');
SELECT tests.assert(
    NOT EXISTS (SELECT 1 FROM public.unit_purchases up
                WHERE up.student_id = '6d000000-0000-0000-0000-000000000001'
                  AND up.unit_id = '6d000000-0000-0000-0000-000000000010'
                  AND up.status = 'active'),
    'g: revoke voids the guest purchase');
RESET ROLE;
SET LOCAL "app.current_user_id" = '6d000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    NOT public.can_access_lesson('6d000000-0000-0000-0000-000000000011'),
    'g: revoked guest loses lesson access');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Codes redeemed by guests vanish from the main code list.
-- ---------------------------------------------------------------------
UPDATE public.unit_codes
SET status = 'used', used_at = now(), used_by = '6d000000-0000-0000-0000-000000000001'
WHERE id = '6d000000-0000-0000-0000-000000000013';
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE student;
SELECT tests.assert(
    NOT EXISTS (SELECT 1 FROM public.list_codes_by_unit('6d000000-0000-0000-0000-000000000010')
                WHERE id = '6d000000-0000-0000-0000-000000000013'),
    'g: guest-redeemed code hidden from walid');
RESET ROLE;
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE student;
SELECT tests.assert(
    NOT EXISTS (SELECT 1 FROM public.list_codes_by_unit('6d000000-0000-0000-0000-000000000010')
                WHERE id = '6d000000-0000-0000-0000-000000000013'),
    'g: guest-redeemed code hidden even for admin');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Social surfaces: guest comment + guest leaderboard row hidden from
-- non-admins, visible to admin.
-- (Re-grant first: the revoke above closed lesson access, and posting
-- requires can_access_lesson.)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE student;
SELECT public.grant_guest_access('6d000000-0000-0000-0000-000000000001', '6d000000-0000-0000-0000-000000000010');
RESET ROLE;
SET LOCAL "app.current_user_id" = '6d000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT public.add_lesson_comment('6d000000-0000-0000-0000-000000000011', 'guest hello', NULL);
RESET ROLE;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE student;
SELECT tests.assert(
    NOT EXISTS (SELECT 1 FROM public.list_lesson_comments('6d000000-0000-0000-0000-000000000011')
                WHERE author_id = '6d000000-0000-0000-0000-000000000001'),
    'g: guest comment hidden from walid');
RESET ROLE;
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE student;
SELECT tests.assert(
    EXISTS (SELECT 1 FROM public.list_lesson_comments('6d000000-0000-0000-0000-000000000011')
            WHERE author_id = '6d000000-0000-0000-0000-000000000001'),
    'g: guest comment visible to admin');
RESET ROLE;

-- general exam leaderboard: guest attempt hidden from classmates
INSERT INTO public.exams (id, grade_id, title, sort_order, status)
VALUES ('6d000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000001', 'TEST-GUEST-GE', 91, 'published');
INSERT INTO public.exam_attempts (id, exam_id, student_id, status, final_score)
VALUES ('6d000000-0000-0000-0000-000000000021', '6d000000-0000-0000-0000-000000000020',
        '6d000000-0000-0000-0000-000000000001', 'graded', 80),
       ('6d000000-0000-0000-0000-000000000022', '6d000000-0000-0000-0000-000000000020',
        '70000000-0000-0000-0000-000000000001', 'graded', 70);

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    NOT EXISTS (SELECT 1 FROM public.get_general_exam_leaderboard('6d000000-0000-0000-0000-000000000020')
                WHERE student_id = '6d000000-0000-0000-0000-000000000001'),
    'g: guest attempt hidden from classmate leaderboard');
RESET ROLE;
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE student;
SELECT tests.assert(
    EXISTS (SELECT 1 FROM public.get_general_exam_leaderboard('6d000000-0000-0000-0000-000000000020')
            WHERE student_id = '6d000000-0000-0000-0000-000000000001'),
    'g: guest attempt visible to admin leaderboard');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Suggestions split: guest suggestion only in the guest inbox.
-- ---------------------------------------------------------------------
INSERT INTO public.platform_suggestions (id, student_id, kind, title, body, status)
VALUES ('6d000000-0000-0000-0000-000000000030', '6d000000-0000-0000-0000-000000000001',
        'suggestion', 'guest idea', 'guest body', 'new');

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE student;
SELECT tests.assert(
    NOT EXISTS (SELECT 1 FROM public.list_suggestions() WHERE id = '6d000000-0000-0000-0000-000000000030'),
    'g: guest suggestion excluded from the main inbox');
SELECT tests.assert(
    EXISTS (SELECT 1 FROM public.list_guest_suggestions() WHERE id = '6d000000-0000-0000-0000-000000000030'),
    'g: guest suggestion present in the guest inbox');
RESET ROLE;

-- ---------------------------------------------------------------------
-- RLS spot checks: walid cannot SELECT the guest profile row directly,
-- admin can; guest reads own row.
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE authenticated;
SELECT tests.assert(
    NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '6d000000-0000-0000-0000-000000000001'),
    'g: RLS hides the guest profile from walid direct select');
RESET ROLE;
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE authenticated;
SELECT tests.assert(
    EXISTS (SELECT 1 FROM public.profiles WHERE id = '6d000000-0000-0000-0000-000000000001'),
    'g: RLS keeps the guest profile visible to admin direct select');
RESET ROLE;
SET LOCAL "app.current_user_id" = '6d000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT tests.assert(
    EXISTS (SELECT 1 FROM public.profiles WHERE id = '6d000000-0000-0000-0000-000000000001'),
    'g: guest keeps own-row read');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Cleanup (actor pinned to admin: deleting the guest profiles fires
-- audit_trigger, and the actor must still exist in profiles).
-- RESET ROLE first: the purchases/codes/pricing tables are RPC-only
-- (no DELETE policy), so cleanup must run as the session owner to
-- actually delete rows instead of silently matching nothing under RLS.
-- ---------------------------------------------------------------------
RESET ROLE;
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
DELETE FROM public.exam_answers
WHERE attempt_id IN ('6d000000-0000-0000-0000-000000000021', '6d000000-0000-0000-0000-000000000022');
DELETE FROM public.exam_attempts
WHERE id IN ('6d000000-0000-0000-0000-000000000021', '6d000000-0000-0000-0000-000000000022');
DELETE FROM public.exams WHERE id = '6d000000-0000-0000-0000-000000000020';
DELETE FROM public.lesson_comments
WHERE lesson_id = '6d000000-0000-0000-0000-000000000011';
DELETE FROM public.platform_suggestions WHERE id = '6d000000-0000-0000-0000-000000000030';
DELETE FROM public.unit_purchases
WHERE student_id IN ('6d000000-0000-0000-0000-000000000001', '6d000000-0000-0000-0000-000000000002');
DELETE FROM public.unit_codes WHERE id = '6d000000-0000-0000-0000-000000000013';
DELETE FROM public.unit_pricing WHERE id = '6d000000-0000-0000-0000-000000000012';
DELETE FROM public.lessons WHERE id = '6d000000-0000-0000-0000-000000000011';
DELETE FROM public.units WHERE id = '6d000000-0000-0000-0000-000000000010';
DELETE FROM public.notifications
WHERE user_id IN ('6d000000-0000-0000-0000-000000000001', '6d000000-0000-0000-0000-000000000002');
DELETE FROM public.audit_logs
WHERE entity_id IN ('6d000000-0000-0000-0000-000000000001', '6d000000-0000-0000-0000-000000000002');
DELETE FROM public.profiles
WHERE id IN ('6d000000-0000-0000-0000-000000000001', '6d000000-0000-0000-0000-000000000002');
DELETE FROM auth.users
WHERE id IN ('6d000000-0000-0000-0000-000000000001', '6d000000-0000-0000-0000-000000000002');
