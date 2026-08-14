-- =====================================================================
-- 02_roles.sql — role helpers, public settings, HIGH-1, escalation
-- ---------------------------------------------------------------------
-- Also builds the deterministic shared fixture used by 03/04/05:
-- grades, plans, staff + student users, curriculum, assets, progress,
-- subscriptions and codes. All fixture rows are recreated idempotently
-- (fixed UUIDs + cleanup of prior runs).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fixture cleanup (prior runs) - order follows the FK graph:
-- code_redemptions -> subscription_codes -> profiles (cascades
-- subscriptions/progress/notifications) -> units (cascades lessons ->
-- videos/pdfs) -> pricing_plans -> grades.
-- ---------------------------------------------------------------------
DELETE FROM public.code_redemptions WHERE student_id IN (SELECT id FROM auth.users WHERE email LIKE 'test-%@walid.test');
DELETE FROM public.subscription_codes WHERE note = 'TEST-FIXTURE';
DELETE FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'test-%@walid.test');
DELETE FROM public.units WHERE name LIKE 'TEST-%';
DELETE FROM public.pricing_plans WHERE grade_id IN (SELECT id FROM public.grades WHERE name LIKE 'TEST-%');
DELETE FROM public.grades WHERE name LIKE 'TEST-%';
DELETE FROM public.audit_logs;
DELETE FROM auth.users WHERE email LIKE 'test-%@walid.test';

-- ---------------------------------------------------------------------
-- Grades
-- ---------------------------------------------------------------------
INSERT INTO public.grades (id, name, sort_order, is_active, deleted_at) VALUES
    ('10000000-0000-0000-0000-000000000001', 'TEST-G1', 1, true,  NULL),
    ('10000000-0000-0000-0000-000000000002', 'TEST-G2', 2, true,  NULL),
    ('10000000-0000-0000-0000-000000000003', 'TEST-G3', 3, false, NULL),
    ('10000000-0000-0000-0000-000000000004', 'TEST-G4', 4, true,  now())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Pricing plans (grade 1: planA 30d, planA2 3d, planInactive 60d;
-- grade 2: planG2 30d, planG2b 7d)
-- ---------------------------------------------------------------------
INSERT INTO public.pricing_plans (id, grade_id, duration_days, base_price, platform_fee, total_price, is_active) VALUES
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 30,  100.00, 10.00, 110.00, true),
    ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 3,   20.00,  2.00,  22.00,  true),
    ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 60,  200.00, 20.00, 220.00, false),
    ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 30,  120.00, 12.00, 132.00, true),
    ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 7,   40.00,  4.00,  44.00,  true)
ON CONFLICT (grade_id, duration_days) DO NOTHING;

-- ---------------------------------------------------------------------
-- Staff + student users (handle_new_user creates the profile rows;
-- 0027 makes grade_id a REQUIRED meta field, so every fixture carries
-- the active grade-1 id; per-profile grades are set below)
-- A:  grade1 active,   has active subscription
-- B:  grade1 disabled, has active subscription (no pause - A9)
-- C:  grade1 soft-deleted
-- D:  grade2 active,   has active subscription
-- E:  grade1 active,   no subscription (redeem subject)
-- F:  no grade, active, no subscription
-- G:  grade1 active,   no subscription (expiry subject)
-- H:  grade1 active,   no subscription (short-plan redeem subject)
-- W:  mr_walid,  AD: admin
-- ---------------------------------------------------------------------
INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data) VALUES
    ('70000000-0000-0000-0000-000000000001', 'test-a@walid.test',   'x', '{"full_name":"A","phone":"+201001000001","guardian_phone":"+201001000001","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}'),
    ('70000000-0000-0000-0000-000000000002', 'test-b@walid.test',   'x', '{"full_name":"B","phone":"+201001000002","guardian_phone":"+201001000002","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}'),
    ('70000000-0000-0000-0000-000000000003', 'test-c@walid.test',   'x', '{"full_name":"C","phone":"+201001000003","guardian_phone":"+201001000003","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}'),
    ('70000000-0000-0000-0000-000000000004', 'test-d@walid.test',   'x', '{"full_name":"D","phone":"+201001000004","guardian_phone":"+201001000004","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}'),
    ('70000000-0000-0000-0000-000000000005', 'test-e@walid.test',   'x', '{"full_name":"E","phone":"+201001000005","guardian_phone":"+201001000005","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}'),
    ('70000000-0000-0000-0000-000000000006', 'test-f@walid.test',   'x', '{"full_name":"F","phone":"+201001000006","guardian_phone":"+201001000006","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}'),
    ('70000000-0000-0000-0000-000000000007', 'test-g@walid.test',   'x', '{"full_name":"G","phone":"+201001000007","guardian_phone":"+201001000007","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}'),
    ('70000000-0000-0000-0000-000000000008', 'test-h@walid.test',   'x', '{"full_name":"H","phone":"+201001000008","guardian_phone":"+201001000008","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}'),
    ('70000000-0000-0000-0000-000000000009', 'test-w@walid.test',   'x', '{"full_name":"W","phone":"+201001000009","guardian_phone":"+201001000009","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}'),
    ('70000000-0000-0000-0000-00000000000a', 'test-ad@walid.test',  'x', '{"full_name":"AD","phone":"+201001000010","guardian_phone":"+201001000010","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}'),
    ('70000000-0000-0000-0000-00000000000b', 'test-t@walid.test',   'x', '{"full_name":"T","phone":"+201001000011","guardian_phone":"+201001000011","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}')
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles SET role = 'mr_walid' WHERE id = '70000000-0000-0000-0000-000000000009';
UPDATE public.profiles SET role = 'admin'    WHERE id = '70000000-0000-0000-0000-00000000000a';
UPDATE public.profiles SET role = 'teacher'  WHERE id = '70000000-0000-0000-0000-00000000000b';

-- Per-profile state + grades
UPDATE public.profiles SET grade_id = '10000000-0000-0000-0000-000000000001' WHERE id IN
    ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002',
     '70000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000005',
     '70000000-0000-0000-0000-000000000007','70000000-0000-0000-0000-000000000008');
UPDATE public.profiles SET grade_id = '10000000-0000-0000-0000-000000000002' WHERE id = '70000000-0000-0000-0000-000000000004';
UPDATE public.profiles SET status = 'disabled' WHERE id = '70000000-0000-0000-0000-000000000002';
UPDATE public.profiles SET status = 'disabled', deleted_at = now() WHERE id = '70000000-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------
-- Curriculum
-- u1 (g1 published): l1 published, l2 draft, l3 hidden, l4 deleted,
--                    l8 published (PDF-only), l9 published (no assets)
-- u1h (g1 hidden):   l5 published
-- u2 (g2 published): l6 published
-- u3 (g3 published): l7 published (inactive grade - B8)
-- ---------------------------------------------------------------------
INSERT INTO public.units (id, grade_id, name, sort_order, status, deleted_at) VALUES
    ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'TEST-U1',  1, 'published', NULL),
    ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'TEST-U1H', 2, 'hidden',    NULL),
    ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'TEST-U2',  1, 'published', NULL),
    ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 'TEST-U3',  1, 'published', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lessons (id, unit_id, title, description, sort_order, status, published_at, deleted_at) VALUES
    ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'TEST-L1', NULL, 1, 'published', now(), NULL),
    ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'TEST-L2', NULL, 2, 'draft',     NULL,  NULL),
    ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'TEST-L3', NULL, 3, 'hidden',    NULL,  NULL),
    ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'TEST-L4', NULL, 4, 'published', now(), now()),
    ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000002', 'TEST-L5', NULL, 1, 'published', now(), NULL),
    ('40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000003', 'TEST-L6', NULL, 1, 'published', now(), NULL),
    ('40000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000004', 'TEST-L7', NULL, 1, 'published', now(), NULL),
    ('40000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000001', 'TEST-L8', NULL, 5, 'published', now(), NULL),
    ('40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000001', 'TEST-L9', NULL, 6, 'published', now(), NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Assets
-- l1: v1 primary ready, v2 ready non-primary, v3 processing non-primary
-- l1: p1 primary ready; l8: p8 primary ready (PDF-only lesson)
-- ---------------------------------------------------------------------
INSERT INTO public.lesson_videos (id, lesson_id, bunny_video_id, bunny_library_id, title, status, is_primary, sort_order, deleted_at) VALUES
    ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'BV-0001', 'LIB-1', 'V1', 'ready',      true,  1, NULL),
    ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'BV-0002', 'LIB-1', 'V2', 'ready',      false, 2, NULL),
    ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'BV-0003', 'LIB-1', 'V3', 'processing', false, 3, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lesson_pdfs (id, lesson_id, storage_path, original_name, is_primary, is_ready, deleted_at) VALUES
    ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'test/l1.pdf', 'l1.pdf', true, true,  NULL),
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000008', 'test/l8.pdf', 'l8.pdf', true, true,  NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Progress: A -> l1 (45%, v1, pos 100); D -> l6 (20%, no video)
-- ---------------------------------------------------------------------
INSERT INTO public.progress (student_id, lesson_id, video_id, position_seconds, percent_completed, is_completed)
VALUES
    ('70000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 100, 45.00, false),
    ('70000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000006', NULL, 30, 20.00, false)
ON CONFLICT (student_id, lesson_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Subscriptions: A, B (disabled, counts down), D
-- ---------------------------------------------------------------------
INSERT INTO public.subscriptions (id, student_id, pricing_plan_id, base_price, platform_fee, total_price, code_id, source, started_at, expires_at, status)
VALUES
    ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 100.00, 10.00, 110.00, NULL, 'manual', now() - interval '10 days', now() + interval '20 days', 'active'),
    ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 100.00, 10.00, 110.00, NULL, 'manual', now() - interval '10 days', now() + interval '30 days', 'active'),
    ('80000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', 120.00, 12.00, 132.00, NULL, 'manual', now() - interval '10 days', now() + interval '30 days', 'active')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Codes (note = TEST-FIXTURE):
-- code1 -> planA (g1, 30d)            [redeem happy path + lowercase]
-- code2 -> planG2 (g2)                [plan_grade_mismatch]
-- code3 -> planA2 (g1, 3d short)      [no-grade + short-window + active-sub]
-- code4 -> planA, revoked             [code_revoked]
-- code5 -> planInactive (g1, 60d)     [plan_not_available]
-- code6 -> planA, already used by A   [code_already_used]
-- ---------------------------------------------------------------------
INSERT INTO public.subscription_codes (id, code, pricing_plan_id, status, created_by, created_at, used_at, used_by, revoked_at, revoked_by, note) VALUES
    ('90000000-0000-0000-0000-000000000001', 'WLDN-AAAA-AAAA-AAAA', '20000000-0000-0000-0000-000000000001', 'available', '70000000-0000-0000-0000-00000000000a', now(), NULL, NULL, NULL, NULL, 'TEST-FIXTURE'),
    ('90000000-0000-0000-0000-000000000002', 'WLDN-BBBB-BBBB-BBBB', '20000000-0000-0000-0000-000000000004', 'available', '70000000-0000-0000-0000-00000000000a', now(), NULL, NULL, NULL, NULL, 'TEST-FIXTURE'),
    ('90000000-0000-0000-0000-000000000003', 'WLDN-CCCC-CCCC-CCCC', '20000000-0000-0000-0000-000000000002', 'available', '70000000-0000-0000-0000-00000000000a', now(), NULL, NULL, NULL, NULL, 'TEST-FIXTURE'),
    ('90000000-0000-0000-0000-000000000004', 'WLDN-DDDD-DDDD-DDDD', '20000000-0000-0000-0000-000000000001', 'revoked',   '70000000-0000-0000-0000-00000000000a', now(), NULL, NULL, now(), '70000000-0000-0000-0000-00000000000a', 'TEST-FIXTURE'),
    ('90000000-0000-0000-0000-000000000005', 'WLDN-EEEE-EEEE-EEEE', '20000000-0000-0000-0000-000000000003', 'available', '70000000-0000-0000-0000-00000000000a', now(), NULL, NULL, NULL, NULL, 'TEST-FIXTURE'),
    ('90000000-0000-0000-0000-000000000006', 'WLDN-FFFF-FFFF-FFFF', '20000000-0000-0000-0000-000000000001', 'used',      '70000000-0000-0000-0000-00000000000a', now(), now(), '70000000-0000-0000-0000-000000000001', NULL, NULL, 'TEST-FIXTURE')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- Role helper assertions
-- =====================================================================

-- --- active student A ------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(public.is_student() = true
                AND public.is_mr_walid() = false AND public.is_admin() = false,
    'A: is_student helpers correct');
SELECT tests.assert(public.can_access_lesson('40000000-0000-0000-0000-000000000001'),
    'A: can_access_lesson true for own published grade-1 lesson');
RESET ROLE;

-- --- disabled student B ----------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000002';
SET LOCAL ROLE student;
SELECT tests.assert(public.is_student() = false, 'B: disabled student is_student = false');
SELECT tests.assert(public.can_access_lesson('40000000-0000-0000-0000-000000000001') = false,
    'B: disabled student cannot access content');
RESET ROLE;

-- --- soft-deleted student C ------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000003';
SET LOCAL ROLE student;
SELECT tests.assert(public.is_student() = false, 'C: deleted student is_student = false');
RESET ROLE;

-- --- staff -----------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.assert(public.is_mr_walid() = true AND public.is_admin() = false AND public.is_student() = false,
    'W: mr_walid helpers correct');
RESET ROLE;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.assert(public.is_admin() = true AND public.is_student() = false, 'AD: admin helpers correct');
RESET ROLE;

-- --- teacher ---------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT tests.assert(public.is_teacher() = true AND public.is_admin() = false AND public.is_mr_walid() = false AND public.is_student() = false,
    'T: teacher helpers correct');
RESET ROLE;

-- --- anon -------------------------------------------------------------
-- anon has NO helper access at all (fail-closed by design; 05 verifies
-- the grant matrix in detail).
SET LOCAL ROLE anon;
SELECT tests.expect_error('SELECT public.is_student()', '42501', NULL);
SELECT tests.expect_error('SELECT public.is_admin()', '42501', NULL);
RESET ROLE;

-- --- get_public_settings as anon --------------------------------------
SET LOCAL ROLE anon;
SELECT tests.assert(
    (SELECT public.get_public_settings() IS NOT NULL AND jsonb_typeof(public.get_public_settings()) = 'object'),
    'anon: get_public_settings callable');
SELECT tests.assert(
    (SELECT public.get_public_settings() ? 'whatsapp_number'
        AND public.get_public_settings() ? 'whatsapp_default_message'
        AND public.get_public_settings() ? 'platform_name'),
    'get_public_settings returns the 3 public keys');
SELECT tests.assert(
    (SELECT NOT public.get_public_settings() ? 'expiry_warning_days'),
    'get_public_settings does NOT leak expiry_warning_days (LOW-15)');
RESET ROLE;

-- --- 0027: signup grade_id is REQUIRED and honored when valid -----------
INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
VALUES ('70000000-0000-0000-0000-0000000000ff', 'test-high1@walid.test', 'x',
        '{"full_name":"H1","phone":"+201001000099","guardian_phone":"+201001000099","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}')
ON CONFLICT (id) DO NOTHING;
SELECT tests.assert(
    (SELECT grade_id = '10000000-0000-0000-0000-000000000001'
     FROM public.profiles WHERE id = '70000000-0000-0000-0000-0000000000ff'),
    '0027: student-supplied ACTIVE grade_id is honored at signup');
DELETE FROM auth.users WHERE id = '70000000-0000-0000-0000-0000000000ff';

-- --- Role escalation: only admin may change roles ----------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    $$SELECT public.set_user_role('70000000-0000-0000-0000-000000000004', 'admin')$$,
    NULL, 'access_denied');
RESET ROLE;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error(
    $$SELECT public.set_user_role('70000000-0000-0000-0000-000000000004', 'admin')$$,
    NULL, 'access_denied');
RESET ROLE;

-- --- fail-closed meta validation (LOW-12) ------------------------------
SELECT tests.expect_error(
    $$INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
      VALUES (gen_random_uuid(), 'test-nometa@walid.test', 'x', '{"full_name":"NM"}')$$,
    NULL, 'profile_meta_required');
SELECT tests.assert(
    (SELECT count(*) = 0 FROM auth.users WHERE email = 'test-nometa@walid.test'),
    'LOW-12: failed insert leaves no orphan user/profile');
