-- =====================================================================
-- 04_business.sql — business-rule assertions
-- ---------------------------------------------------------------------
-- Auth gates, audit trail (PII-free), progress semantics, code
-- redemption matrix, content access matrix, subscription expiry
-- idempotency, video state machine and PDF finalization.
-- Fixture: shared 02_roles.sql (A-H, W, AD). Runs in one transaction
-- per file, so SET LOCAL state must be reset at every section boundary.
-- =====================================================================

-- =====================================================================
-- Section 1: auth gates (handle_new_user, email immutability, sign-in)
-- =====================================================================
RESET ROLE;
RESET "app.current_user_id";

-- signup with complete meta -> profile created with the chosen grade
-- (0027: grade_id is required; valid + active ids are honored)
INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
VALUES ('70000000-0000-0000-0000-0000000000aa', 'test-signup@walid.test', 'x',
        '{"full_name":"S1","phone":"+201001000066","guardian_phone":"+201001000066","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}')
ON CONFLICT (id) DO NOTHING;
SELECT tests.assert(
    (SELECT full_name = 'S1' AND phone = '+201001000066' AND role = 'student'
            AND status = 'active' AND grade_id = '10000000-0000-0000-0000-000000000001' AND deleted_at IS NULL
     FROM public.profiles WHERE id = '70000000-0000-0000-0000-0000000000aa'),
    'handle_new_user: profile created with safe defaults (chosen active grade)');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.audit_logs WHERE action = 'profiles.insert' AND entity_id = '70000000-0000-0000-0000-0000000000aa'),
    'audit_trigger: profiles.insert row recorded');
DELETE FROM auth.users WHERE id = '70000000-0000-0000-0000-0000000000aa';

-- email immutability: change raises; other column changes are fine
SELECT tests.expect_error(
    'UPDATE auth.users SET email = ''test-a-x@walid.test'' WHERE id = ''70000000-0000-0000-0000-000000000001''',
    'P0001', 'email_change_forbidden');
SELECT tests.expect_rows(
    'UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data WHERE id = ''70000000-0000-0000-0000-000000000001''',
    1, 'auth: non-email UPDATE allowed');

-- sign-in gate: active passes, disabled/deleted raise
SELECT tests.expect_rows(
    'UPDATE auth.users SET last_sign_in_at = now() WHERE id = ''70000000-0000-0000-0000-000000000001''',
    1, 'auth: active user sign-in allowed');
SELECT tests.expect_error(
    'UPDATE auth.users SET last_sign_in_at = now() WHERE id = ''70000000-0000-0000-0000-000000000002''',
    'P0001', 'account_inactive_or_deleted');
SELECT tests.expect_error(
    'UPDATE auth.users SET last_sign_in_at = now() WHERE id = ''70000000-0000-0000-0000-000000000003''',
    'P0001', 'account_inactive_or_deleted');

-- =====================================================================
-- Section 2: audit trail is PII-free and actor-aware
-- =====================================================================
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;

-- name change only
SELECT tests.expect_rows(
    'SELECT public.update_own_profile(''A'', ''+201001000001'', ''+201001000001'', ''Cairo'')',
    1, 'own profile: name-only update accepted');
-- phone change (PII) - must never land in metadata as a value
SELECT tests.expect_rows(
    'SELECT public.update_own_profile(''A'', ''+201001000055'', ''+201001000055'', ''Cairo'')',
    1, 'own profile: phone update accepted');
-- restore fixture phone
SELECT tests.expect_rows(
    'SELECT public.update_own_profile(''A'', ''+201001000001'', ''+201001000001'', ''Cairo'')',
    1, 'own profile: fixture phone restored');

-- audit checks must run as admin: audit_logs SELECT is admin-only via RLS
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;

SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM public.audit_logs
        WHERE action = 'profile.update_own'
          AND actor_id = '70000000-0000-0000-0000-000000000001'
          AND actor_role = 'student'
          AND metadata -> 'changed_fields' @> '["full_name"]'::jsonb
    )),
    'audit: update_own_profile logs changed column names only (full_name)');
SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM public.audit_logs
        WHERE action = 'profile.update_own'
          AND actor_id = '70000000-0000-0000-0000-000000000001'
          AND actor_role = 'student'
          AND metadata -> 'changed_fields' @> '["phone"]'::jsonb
    )),
    'audit: update_own_profile logs changed column names only (phone)');
SELECT tests.assert(
    (SELECT NOT EXISTS (
        SELECT 1 FROM public.audit_logs WHERE metadata::text LIKE '%+201001000055%'
    )),
    'audit: phone VALUE never appears in metadata (MED-8)');
-- trigger-generated row strips sensitive columns from old/new snapshots
SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM public.audit_logs
        WHERE action = 'profiles.update'
          AND metadata -> 'changed_fields' @> '["phone"]'::jsonb
          AND metadata -> 'new' -> 'phone' IS NULL
          AND metadata -> 'old' -> 'guardian_phone' IS NULL
    )),
    'audit: trigger snapshot excludes phone/guardian_phone/address values');
RESET ROLE;
RESET "app.current_user_id";

-- =====================================================================
-- Section 3: upsert_progress semantics (active student A)
-- =====================================================================
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;

-- l9 (published, no assets): video_id must stay NULL
SELECT tests.expect_rows(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000009'', 5, 10)',
    1, 'progress: l9 upsert accepted');
SELECT tests.assert(
    (SELECT video_id IS NULL AND position_seconds = 5 AND percent_completed = 10.00
            AND NOT is_completed
     FROM public.progress WHERE student_id = '70000000-0000-0000-0000-000000000001' AND lesson_id = '40000000-0000-0000-0000-000000000009'),
    'progress: no-video lesson -> video_id NULL, position + percent stored');

-- percent is monotonic (GREATEST)
SELECT tests.expect_rows(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000009'', 5, 40)',
    1, 'progress: raise percent');
SELECT tests.expect_rows(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000009'', 5, 25)',
    1, 'progress: lower percent accepted but clamped');
SELECT tests.assert(
    (SELECT percent_completed = 40.00
     FROM public.progress WHERE student_id = '70000000-0000-0000-0000-000000000001' AND lesson_id = '40000000-0000-0000-0000-000000000009'),
    'progress: percent never decreases (monotonic)');

-- position is last-write-wins
SELECT tests.expect_rows(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000009'', 500, 40)',
    1, 'progress: position 500');
SELECT tests.expect_rows(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000009'', 7, 40)',
    1, 'progress: position 7');
SELECT tests.assert(
    (SELECT position_seconds = 7
     FROM public.progress WHERE student_id = '70000000-0000-0000-0000-000000000001' AND lesson_id = '40000000-0000-0000-0000-000000000009'),
    'progress: position is last-write-wins');

-- completion at >= 90 is irreversible
SELECT tests.expect_rows(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000009'', 7, 92)',
    1, 'progress: cross 90%');
SELECT tests.assert(
    (SELECT is_completed AND percent_completed = 92.00
     FROM public.progress WHERE student_id = '70000000-0000-0000-0000-000000000001' AND lesson_id = '40000000-0000-0000-0000-000000000009'),
    'progress: >= 90% marks completed');
SELECT tests.expect_rows(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000009'', 7, 10)',
    1, 'progress: late low percent');
SELECT tests.assert(
    (SELECT is_completed AND percent_completed = 92.00
     FROM public.progress WHERE student_id = '70000000-0000-0000-0000-000000000001' AND lesson_id = '40000000-0000-0000-0000-000000000009'),
    'progress: completion irreversible after 90%');

-- primary video pinning on l1 (existing progress row, video v1)
SELECT tests.expect_rows(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000001'', 200, 55)',
    1, 'progress: l1 update');
SELECT tests.assert(
    (SELECT video_id = '50000000-0000-0000-0000-000000000001' AND position_seconds = 200 AND percent_completed = 55.00
     FROM public.progress WHERE student_id = '70000000-0000-0000-0000-000000000001' AND lesson_id = '40000000-0000-0000-0000-000000000001'),
    'progress: primary ready video pinned');

-- l8 is PDF-only: video_id stays NULL
SELECT tests.expect_rows(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000008'', 1, 1)',
    1, 'progress: l8 (PDF-only) accepted');
SELECT tests.assert(
    (SELECT video_id IS NULL
     FROM public.progress WHERE student_id = '70000000-0000-0000-0000-000000000001' AND lesson_id = '40000000-0000-0000-0000-000000000008'),
    'progress: PDF-only lesson has no video pinned');

-- clamp: negative position and >100 percent
SELECT tests.expect_rows(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000008'', -5, 250)',
    1, 'progress: out-of-range values accepted');
SELECT tests.assert(
    (SELECT position_seconds = 0 AND percent_completed = 100.00
     FROM public.progress WHERE student_id = '70000000-0000-0000-0000-000000000001' AND lesson_id = '40000000-0000-0000-0000-000000000008'),
    'progress: position clamped >= 0, percent clamped <= 100');
RESET ROLE;
RESET "app.current_user_id";

-- stale-video rejection (binding B4): temporarily promote v2 on l1
RESET ROLE;
RESET "app.current_user_id";
UPDATE public.lesson_videos SET is_primary = false WHERE id = '50000000-0000-0000-0000-000000000001';
UPDATE public.lesson_videos SET is_primary = true  WHERE id = '50000000-0000-0000-0000-000000000002';

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000001'', 1, 1)',
    'P0001', 'progress_stale_video');
RESET ROLE;
RESET "app.current_user_id";

-- restore v1 as primary
UPDATE public.lesson_videos SET is_primary = false WHERE id = '50000000-0000-0000-0000-000000000002';
UPDATE public.lesson_videos SET is_primary = true  WHERE id = '50000000-0000-0000-0000-000000000001';
SELECT tests.assert(
    (SELECT video_id = '50000000-0000-0000-0000-000000000001'
     FROM public.progress WHERE student_id = '70000000-0000-0000-0000-000000000001' AND lesson_id = '40000000-0000-0000-0000-000000000001'),
    'progress: stale-write attempt left existing row untouched');

-- disabled student and anon are rejected
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000002';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000001'', 1, 1)',
    'P0001', 'access_denied');
RESET ROLE;
RESET "app.current_user_id";

SET LOCAL ROLE anon;
SELECT tests.expect_error(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000001'', 1, 1)',
    '42501', 'permission denied for function upsert_progress');
RESET ROLE;

-- =====================================================================
-- Section 4: redeem_subscription_code matrix
-- =====================================================================
RESET ROLE;
RESET "app.current_user_id";

-- F (no grade) is rejected before any code mutation; code3 stays available
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000006';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.redeem_subscription_code(''WLDN-CCCC-CCCC-CCCC'')',
    'P0001', 'no_grade_assigned');
RESET ROLE;
RESET "app.current_user_id";
-- subscription_codes are invisible to students: verify code3 as admin
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.assert(
    (SELECT status = 'available' AND used_at IS NULL
     FROM public.subscription_codes WHERE id = '90000000-0000-0000-0000-000000000003'),
    'redeem: failed attempt leaves code untouched');
RESET ROLE;
RESET "app.current_user_id";

-- E: happy path - lowercase input normalized, planA (g1, 30d)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000005';
SET LOCAL ROLE student;
SELECT tests.assert(
    (SELECT public.redeem_subscription_code('wldn-aaaa-aaaa-aaaa') IS NOT NULL),
    'redeem: E redeems code1 (lowercase normalized)');
SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE student_id = '70000000-0000-0000-0000-000000000005'
          AND pricing_plan_id = '20000000-0000-0000-0000-000000000001'
          AND code_id = '90000000-0000-0000-0000-000000000001'
          AND source = 'code' AND status = 'active'
          AND base_price = 100.00 AND platform_fee = 10.00 AND total_price = 110.00
          AND expires_at BETWEEN now() + interval '29 days' AND now() + interval '31 days'
    )),
    'redeem: subscription created with price snapshot + 30d window');
SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM public.code_redemptions
        WHERE code_id = '90000000-0000-0000-0000-000000000001'
          AND student_id = '70000000-0000-0000-0000-000000000005'
          AND subscription_id IS NOT NULL
    )),
    'redeem: code_redemptions row recorded');
SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE user_id = '70000000-0000-0000-0000-000000000005'
          AND type = 'subscription_activated'
    )),
    'redeem: activation notification emitted');
SELECT tests.assert(
    (SELECT NOT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE user_id = '70000000-0000-0000-0000-000000000005'
          AND type = 'subscription_expiring'
    )),
    'redeem: no expiring warning for 30d plan');
-- subscription_codes + audit_logs are invisible to students: verify as admin
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.assert(
    (SELECT status = 'used' AND used_by = '70000000-0000-0000-0000-000000000005' AND used_at IS NOT NULL
     FROM public.subscription_codes WHERE id = '90000000-0000-0000-0000-000000000001'),
    'redeem: code1 marked used by E');
SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM public.audit_logs
        WHERE action = 'code.redeem' AND actor_id = '70000000-0000-0000-0000-000000000005' AND actor_role = 'student'
    )),
    'redeem: code.redeem audit row with actor');
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000005';
SET LOCAL ROLE student;
SELECT tests.assert(
    (SELECT (SELECT id FROM public.get_my_current_subscription()) IS NOT NULL),
    'redeem: get_my_current_subscription now live for E');
RESET ROLE;
RESET "app.current_user_id";

-- E now has an active sub: grade mismatch checked BEFORE active-sub check
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000005';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.redeem_subscription_code(''WLDN-BBBB-BBBB-BBBB'')',
    'P0001', 'plan_grade_mismatch');
RESET ROLE;
RESET "app.current_user_id";

-- revoked / unavailable / used codes
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000005';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.redeem_subscription_code(''WLDN-DDDD-DDDD-DDDD'')',
    'P0001', 'code_revoked');
SELECT tests.expect_error(
    'SELECT public.redeem_subscription_code(''WLDN-EEEE-EEEE-EEEE'')',
    'P0001', 'plan_not_available');
RESET ROLE;
RESET "app.current_user_id";

-- A: own active sub blocks redemption (fresh available code needed)
INSERT INTO public.subscription_codes (id, code, pricing_plan_id, status, created_by, created_at, note)
VALUES ('90000000-0000-0000-0000-000000000007', 'WLDN-TEST-AAAA-AAAA', '20000000-0000-0000-0000-000000000001', 'available', '70000000-0000-0000-0000-00000000000a', now(), 'TEST-FIXTURE')
ON CONFLICT (id) DO UPDATE SET status = 'available', used_at = NULL, used_by = NULL, revoked_at = NULL, revoked_by = NULL;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.redeem_subscription_code(''WLDN-TEST-AAAA-AAAA'')',
    'P0001', 'student_has_active_subscription');
SELECT tests.expect_error(
    'SELECT public.redeem_subscription_code(''WLDN-FFFF-FFFF-FFFF'')',
    'P0001', 'code_already_used');
-- subscription_codes invisible to students: verify as admin
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.assert(
    (SELECT status = 'available'
     FROM public.subscription_codes WHERE id = '90000000-0000-0000-0000-000000000007'),
    'redeem: failed attempts leave the fresh code untouched');
RESET ROLE;
RESET "app.current_user_id";

-- G: re-redeeming the just-used code1 fails
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000007';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.redeem_subscription_code(''WLDN-AAAA-AAAA-AAAA'')',
    'P0001', 'code_already_used');
RESET ROLE;
RESET "app.current_user_id";

-- H: 3-day plan -> sub + expiring warning in the same transaction
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000008';
SET LOCAL ROLE student;
SELECT tests.assert(
    (SELECT public.redeem_subscription_code('WLDN-CCCC-CCCC-CCCC') IS NOT NULL),
    'redeem: H redeems code3 (3-day plan)');
SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE student_id = '70000000-0000-0000-0000-000000000008'
          AND expires_at BETWEEN now() + interval '2.5 days' AND now() + interval '3.5 days'
    )),
    'redeem: 3-day plan yields ~3 day expiry');
SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE user_id = '70000000-0000-0000-0000-000000000008'
          AND type = 'subscription_expiring'
    )),
    'redeem: expiring warning emitted inside warning window');
SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE user_id = '70000000-0000-0000-0000-000000000008'
          AND type = 'subscription_activated'
    )),
    'redeem: activation notification also emitted');
RESET ROLE;
RESET "app.current_user_id";

-- disabled student B and anon are rejected
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000002';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.redeem_subscription_code(''WLDN-BBBB-BBBB-BBBB'')',
    'P0001', 'access_denied');
RESET ROLE;
RESET "app.current_user_id";

SET LOCAL ROLE anon;
SELECT tests.expect_error(
    'SELECT public.redeem_subscription_code(''WLDN-BBBB-BBBB-BBBB'')',
    '42501', 'permission denied for function redeem_subscription_code');
RESET ROLE;

-- UNIQUE backstop: a second redemption for the same (code, student) is impossible
SELECT tests.expect_error(
    'INSERT INTO public.code_redemptions (code_id, student_id, subscription_id)
     VALUES (''90000000-0000-0000-0000-000000000001'', ''70000000-0000-0000-0000-000000000005'',
             (SELECT id FROM public.subscriptions WHERE student_id = ''70000000-0000-0000-0000-000000000005'' AND code_id = ''90000000-0000-0000-0000-000000000001''))',
    '23505', NULL);
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.code_redemptions
     WHERE code_id = '90000000-0000-0000-0000-000000000001' AND student_id = '70000000-0000-0000-0000-000000000005'),
    'redeem: UNIQUE(code_id, student_id) backstop holds');
-- NOTE: concurrent double-redeem is serialized by the advisory lock
-- (pg_advisory_xact_lock on the code), making the UNIQUE a safety net.

-- =====================================================================
-- Section 5: can_access_lesson full matrix
-- =====================================================================
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(public.can_access_lesson('40000000-0000-0000-0000-000000000001'),
    'access: l1 published own grade = true');
SELECT tests.assert(NOT public.can_access_lesson('40000000-0000-0000-0000-000000000002'),
    'access: l2 draft = false');
SELECT tests.assert(NOT public.can_access_lesson('40000000-0000-0000-0000-000000000003'),
    'access: l3 hidden = false');
SELECT tests.assert(NOT public.can_access_lesson('40000000-0000-0000-0000-000000000004'),
    'access: l4 soft-deleted = false');
SELECT tests.assert(NOT public.can_access_lesson('40000000-0000-0000-0000-000000000005'),
    'access: l5 hidden unit = false');
SELECT tests.assert(NOT public.can_access_lesson('40000000-0000-0000-0000-000000000006'),
    'access: l6 wrong grade = false');
SELECT tests.assert(NOT public.can_access_lesson('40000000-0000-0000-0000-000000000007'),
    'access: l7 inactive grade (B8) = false');
SELECT tests.assert(public.can_access_lesson('40000000-0000-0000-0000-000000000008'),
    'access: l8 PDF-only = true');
SELECT tests.assert(public.can_access_lesson('40000000-0000-0000-0000-000000000009'),
    'access: l9 no assets = true');
SELECT tests.assert(NOT public.can_access_lesson(gen_random_uuid()),
    'access: nonexistent lesson = false');
RESET ROLE;
RESET "app.current_user_id";

-- F: no grade -> false; anon -> false
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000006';
SET LOCAL ROLE student;
SELECT tests.assert(NOT public.can_access_lesson('40000000-0000-0000-0000-000000000001'),
    'access: F without grade = false');
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL ROLE anon;
SELECT tests.expect_error(
    'SELECT public.can_access_lesson(''40000000-0000-0000-0000-000000000001'')',
    '42501', 'permission denied for function can_access_lesson');
RESET ROLE;

-- =====================================================================
-- Section 6: expire_subscriptions idempotency (runs as postgres)
-- =====================================================================
RESET ROLE;
RESET "app.current_user_id";

-- fixture subs: one inside the warning window, one already expired
INSERT INTO public.subscriptions (id, student_id, pricing_plan_id, base_price, platform_fee, total_price, source, started_at, expires_at, status)
VALUES
    ('81000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 100.00, 10.00, 110.00, 'manual', now() - interval '25 days', now() + interval '5 days',  'active'),
    ('81000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 100.00, 10.00, 110.00, 'manual', now() - interval '31 days', now() - interval '1 day',  'active')
ON CONFLICT (id) DO UPDATE
    SET started_at = EXCLUDED.started_at, expires_at = EXCLUDED.expires_at, status = EXCLUDED.status;

SELECT tests.expect_rows('SELECT public.expire_subscriptions()', 1, 'expire: first run');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.notifications
     WHERE dedup_key = 'sub_expiring:81000000-0000-0000-0000-000000000001'),
    'expire: warning emitted once for in-window sub');
SELECT tests.assert(
    (SELECT status = 'expired' FROM public.subscriptions WHERE id = '81000000-0000-0000-0000-000000000002'),
    'expire: expired sub flipped to expired');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.notifications
     WHERE dedup_key = 'sub_expired:81000000-0000-0000-0000-000000000002'),
    'expire: expired notification emitted once');
SELECT tests.assert(
    (SELECT status = 'active' FROM public.subscriptions WHERE id = '80000000-0000-0000-0000-000000000001'),
    'expire: future subscription untouched');

SELECT tests.expect_rows('SELECT public.expire_subscriptions()', 1, 'expire: second run');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.notifications
     WHERE dedup_key = 'sub_expiring:81000000-0000-0000-0000-000000000001'),
    'expire: idempotent - no duplicate warning');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.notifications
     WHERE dedup_key = 'sub_expired:81000000-0000-0000-0000-000000000002'),
    'expire: idempotent - no duplicate expired notification');
SELECT tests.assert(
    (SELECT count(*) >= 1 FROM public.audit_logs WHERE action = 'subscription.expire'),
    'expire: audited');

-- LOW: 7-day warning is skipped for disabled (B) and soft-deleted (C)
-- students, while the expiry flip still applies to everyone.
INSERT INTO public.subscriptions (id, student_id, pricing_plan_id, base_price, platform_fee, total_price, source, started_at, expires_at, status)
VALUES
    ('81000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 100.00, 10.00, 110.00, 'manual', now() - interval '25 days', now() + interval '6 days',  'active'),
    ('81000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 100.00, 10.00, 110.00, 'manual', now() - interval '25 days', now() + interval '6 days',  'active')
ON CONFLICT (id) DO UPDATE
    SET started_at = EXCLUDED.started_at, expires_at = EXCLUDED.expires_at, status = EXCLUDED.status;

SELECT tests.expect_rows('SELECT public.expire_subscriptions()', 1, 'expire: third run');
SELECT tests.assert(
    (SELECT NOT EXISTS (SELECT 1 FROM public.notifications WHERE dedup_key = 'sub_expiring:81000000-0000-0000-0000-000000000003')),
    'expire: disabled student B gets no expiring warning');
SELECT tests.assert(
    (SELECT NOT EXISTS (SELECT 1 FROM public.notifications WHERE dedup_key = 'sub_expiring:81000000-0000-0000-0000-000000000004')),
    'expire: soft-deleted student C gets no expiring warning');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.notifications WHERE dedup_key = 'sub_expiring:81000000-0000-0000-0000-000000000001'),
    'expire: active student E still warned (control)');
DELETE FROM public.subscriptions WHERE id IN ('81000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000004');

-- =====================================================================
-- Section 7: set_video_status state machine (internal, runs as postgres)
-- =====================================================================
RESET ROLE;
RESET "app.current_user_id";

-- v3 processing -> ready (no promotion: l1 already has primary)
SELECT tests.expect_rows(
    'SELECT public.set_video_status(''50000000-0000-0000-0000-000000000003'', ''ready'', 60)',
    1, 'video: processing -> ready');
SELECT tests.assert(
    (SELECT status = 'ready' AND duration_seconds = 60 AND NOT is_primary
     FROM public.lesson_videos WHERE id = '50000000-0000-0000-0000-000000000003'),
    'video: promoted-ready stays non-primary when primary exists');

-- ready -> replaced with a replacement video: progress re-pointed
SELECT tests.expect_rows(
    'SELECT public.set_video_status(''50000000-0000-0000-0000-000000000003'', ''replaced'', NULL, NULL, NULL, ''50000000-0000-0000-0000-000000000001'')',
    1, 'video: ready -> replaced');
SELECT tests.assert(
    (SELECT NOT EXISTS (SELECT 1 FROM public.progress WHERE video_id = '50000000-0000-0000-0000-000000000003')),
    'video: no progress points at replaced video');

-- HIGH-2: replacement must belong to the SAME lesson as the replaced
-- video. v6 lives in l2, v3 lives in l1 -> rejected, nothing mutated.
INSERT INTO public.lesson_videos (id, lesson_id, bunny_video_id, bunny_library_id, title, status, is_primary, sort_order, deleted_at)
VALUES ('50000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000002', 'BV-0006', 'LIB-1', 'V6', 'ready', true, 1, NULL)
ON CONFLICT (id) DO UPDATE SET lesson_id = EXCLUDED.lesson_id, status = 'ready', deleted_at = NULL;
-- progress rows to prove re-pointing is lesson-scoped:
INSERT INTO public.progress (student_id, lesson_id, video_id, position_seconds, percent_completed, is_completed)
VALUES
    ('70000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 60, 70.00, false),
    ('70000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', 10, 10.00, false)
ON CONFLICT (student_id, lesson_id) DO UPDATE
    SET video_id = EXCLUDED.video_id, position_seconds = EXCLUDED.position_seconds,
        percent_completed = EXCLUDED.percent_completed, is_completed = EXCLUDED.is_completed;

UPDATE public.lesson_videos SET status = 'ready' WHERE id = '50000000-0000-0000-0000-000000000003';
SELECT tests.expect_error(
    'SELECT public.set_video_status(''50000000-0000-0000-0000-000000000003'', ''replaced'', NULL, NULL, NULL, ''50000000-0000-0000-0000-000000000006'')',
    'P0001', 'replacement_video_mismatch');
SELECT tests.assert(
    (SELECT status = 'ready' FROM public.lesson_videos WHERE id = '50000000-0000-0000-0000-000000000003'),
    'video: mismatched replacement leaves video untouched');
SELECT tests.assert(
    (SELECT NOT EXISTS (SELECT 1 FROM public.progress WHERE video_id = '50000000-0000-0000-0000-000000000006')),
    'video: mismatched replacement leaves other lesson untouched');

-- same-lesson replacement: only THIS lesson's progress rows are re-pointed
SELECT tests.expect_rows(
    'SELECT public.set_video_status(''50000000-0000-0000-0000-000000000003'', ''replaced'', NULL, NULL, NULL, ''50000000-0000-0000-0000-000000000002'')',
    1, 'video: ready -> replaced (same-lesson v2)');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.progress
     WHERE video_id = '50000000-0000-0000-0000-000000000002'
       AND lesson_id = '40000000-0000-0000-0000-000000000001'),
    'video: l1 progress re-pointed to replacement v2');
SELECT tests.assert(
    (SELECT video_id = '50000000-0000-0000-0000-000000000003'
     FROM public.progress
     WHERE student_id = '70000000-0000-0000-0000-000000000004'
       AND lesson_id = '40000000-0000-0000-0000-000000000002'),
    'video: l2 progress untouched by l1 replacement');
DELETE FROM public.progress WHERE student_id IN ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000004')
  AND lesson_id IN ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002')
  AND video_id IN ('50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003');
DELETE FROM public.lesson_videos WHERE id = '50000000-0000-0000-0000-000000000006';
UPDATE public.lesson_videos SET status = 'processing' WHERE id = '50000000-0000-0000-0000-000000000003';

-- illegal transition: replaced is terminal
SELECT tests.expect_error(
    'SELECT public.set_video_status(''50000000-0000-0000-0000-000000000003'', ''ready'')',
    'P0001', 'invalid_video_transition');

-- failed path + error message, then recovery
UPDATE public.lesson_videos SET status = 'processing' WHERE id = '50000000-0000-0000-0000-000000000003';
SELECT tests.expect_rows(
    'SELECT public.set_video_status(''50000000-0000-0000-0000-000000000003'', ''failed'', NULL, NULL, ''bad file'')',
    1, 'video: processing -> failed');
SELECT tests.assert(
    (SELECT status = 'failed' AND error_message = 'bad file'
     FROM public.lesson_videos WHERE id = '50000000-0000-0000-0000-000000000003'),
    'video: failed records error_message');
SELECT tests.expect_rows(
    'SELECT public.set_video_status(''50000000-0000-0000-0000-000000000003'', ''pending_upload'')',
    1, 'video: failed -> pending_upload');
SELECT tests.assert(
    (SELECT status = 'pending_upload' AND error_message IS NULL
     FROM public.lesson_videos WHERE id = '50000000-0000-0000-0000-000000000003'),
    'video: error_message cleared on recovery');
SELECT tests.expect_rows(
    'SELECT public.set_video_status(''50000000-0000-0000-0000-000000000003'', ''uploading'')',
    1, 'video: pending_upload -> uploading');
SELECT tests.expect_rows(
    'SELECT public.set_video_status(''50000000-0000-0000-0000-000000000003'', ''processing'')',
    1, 'video: uploading -> processing (fixture restored)');
SELECT tests.assert(
    (SELECT count(*) >= 4 FROM public.audit_logs WHERE action = 'video.status_change'),
    'video: every transition audited');

-- illegal transition back to ready from replaced after fixture surgery is
-- impossible; direct fixture UPDATE above is the only escape (staff-only
-- table privileges, never exposed via RPC).

-- ---------------------------------------------------------------------
-- MEDIUM-2: ready replacement is promoted to primary atomically; a
-- still-processing replacement is promoted later when it flips to ready.
-- ---------------------------------------------------------------------
-- restore A's l1 fixture progress row (removed by the HIGH-2 cleanup) so
-- the re-pointing assertions have a row to work with
INSERT INTO public.progress (student_id, lesson_id, video_id, position_seconds, percent_completed, is_completed)
VALUES ('70000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 100, 45.00, false)
ON CONFLICT (student_id, lesson_id) DO UPDATE
    SET video_id = EXCLUDED.video_id, position_seconds = EXCLUDED.position_seconds,
        percent_completed = EXCLUDED.percent_completed, is_completed = EXCLUDED.is_completed;

-- (a) primary v1 replaced by an ALREADY-ready v2 -> promoted in-txn
SELECT tests.expect_rows(
    'SELECT public.set_video_status(''50000000-0000-0000-0000-000000000001'', ''replaced'', NULL, NULL, NULL, ''50000000-0000-0000-0000-000000000002'')',
    1, 'video: ready primary v1 replaced by ready v2');
SELECT tests.assert(
    (SELECT status = 'replaced' AND NOT is_primary FROM public.lesson_videos WHERE id = '50000000-0000-0000-0000-000000000001'),
    'video: v1 demoted + marked replaced');
SELECT tests.assert(
    (SELECT is_primary FROM public.lesson_videos WHERE id = '50000000-0000-0000-0000-000000000002'),
    'video: ready replacement v2 promoted to primary');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.lesson_videos
     WHERE lesson_id = '40000000-0000-0000-0000-000000000001' AND is_primary AND deleted_at IS NULL),
    'video: exactly one primary after ready-replacement finalization');
SELECT tests.assert(
    (SELECT video_id = '50000000-0000-0000-0000-000000000002'
     FROM public.progress
     WHERE student_id = '70000000-0000-0000-0000-000000000001'
       AND lesson_id = '40000000-0000-0000-0000-000000000001'),
    'video: progress re-pointed to promoted replacement');

-- fixture restore: demote the promoted replacement FIRST, then v1 primary
UPDATE public.lesson_videos SET is_primary = false WHERE id = '50000000-0000-0000-0000-000000000002';
UPDATE public.lesson_videos SET status = 'ready', is_primary = true WHERE id = '50000000-0000-0000-0000-000000000001';
UPDATE public.progress
SET video_id = '50000000-0000-0000-0000-000000000001'
WHERE student_id = '70000000-0000-0000-0000-000000000001'
  AND lesson_id = '40000000-0000-0000-0000-000000000001';

-- (b) primary v1 replaced by still-processing v3 -> NO primary yet
SELECT tests.expect_rows(
    'SELECT public.set_video_status(''50000000-0000-0000-0000-000000000001'', ''replaced'', NULL, NULL, NULL, ''50000000-0000-0000-0000-000000000003'')',
    1, 'video: primary v1 replaced by processing v3');
SELECT tests.assert(
    (SELECT status = 'processing' AND NOT is_primary FROM public.lesson_videos WHERE id = '50000000-0000-0000-0000-000000000003'),
    'video: processing replacement NOT promoted');
SELECT tests.assert(
    (SELECT count(*) = 0 FROM public.lesson_videos
     WHERE lesson_id = '40000000-0000-0000-0000-000000000001' AND is_primary AND deleted_at IS NULL),
    'video: no primary while replacement still processing');
SELECT tests.assert(
    (SELECT video_id = '50000000-0000-0000-0000-000000000003'
     FROM public.progress
     WHERE student_id = '70000000-0000-0000-0000-000000000001'
       AND lesson_id = '40000000-0000-0000-0000-000000000001'),
    'video: progress re-pointed to processing replacement');

-- Phase 5/EF webhook path: replacement flips to ready -> promoted
SELECT tests.expect_rows(
    'SELECT public.set_video_status(''50000000-0000-0000-0000-000000000003'', ''ready'', 90)',
    1, 'video: processing -> ready (replacement promotion path)');
SELECT tests.assert(
    (SELECT status = 'ready' AND is_primary FROM public.lesson_videos WHERE id = '50000000-0000-0000-0000-000000000003'),
    'video: previously-processing replacement promoted on ready');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.lesson_videos
     WHERE lesson_id = '40000000-0000-0000-0000-000000000001' AND is_primary AND deleted_at IS NULL),
    'video: exactly one primary after promotion on ready');

-- fixture restore: demote the promoted replacement FIRST, then v1 primary
UPDATE public.lesson_videos SET is_primary = false, status = 'processing' WHERE id = '50000000-0000-0000-0000-000000000003';
UPDATE public.lesson_videos SET status = 'ready', is_primary = true WHERE id = '50000000-0000-0000-0000-000000000001';
UPDATE public.progress
SET video_id = '50000000-0000-0000-0000-000000000001', position_seconds = 100, percent_completed = 45.00, is_completed = false
WHERE student_id = '70000000-0000-0000-0000-000000000001'
  AND lesson_id = '40000000-0000-0000-0000-000000000001';

-- cross-lesson validation still raises (HIGH-2 regression guard)
INSERT INTO public.lesson_videos (id, lesson_id, bunny_video_id, bunny_library_id, title, status, is_primary, sort_order, deleted_at)
VALUES ('50000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000002', 'BV-0006', 'LIB-1', 'V6', 'ready', true, 1, NULL)
ON CONFLICT (id) DO UPDATE SET lesson_id = EXCLUDED.lesson_id, status = 'ready', deleted_at = NULL;
SELECT tests.expect_error(
    'SELECT public.set_video_status(''50000000-0000-0000-0000-000000000001'', ''replaced'', NULL, NULL, NULL, ''50000000-0000-0000-0000-000000000006'')',
    'P0001', 'replacement_video_mismatch');
DELETE FROM public.lesson_videos WHERE id = '50000000-0000-0000-0000-000000000006';

-- =====================================================================
-- Section 8: finalize_pdf_upload promotion/demotion (as admin)
-- =====================================================================
RESET ROLE;
RESET "app.current_user_id";

INSERT INTO public.lesson_pdfs (id, lesson_id, storage_path, original_name, is_primary, is_ready, deleted_at)
VALUES ('61000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'test/l1b.pdf', 'l1b.pdf', false, false, NULL)
ON CONFLICT (id) DO UPDATE SET is_primary = false, is_ready = false, deleted_at = NULL;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_rows(
    'SELECT public.finalize_pdf_upload(''61000000-0000-0000-0000-000000000001'')',
    1, 'pdf: finalize new upload');
SELECT tests.assert(
    (SELECT is_ready AND is_primary
     FROM public.lesson_pdfs WHERE id = '61000000-0000-0000-0000-000000000001'),
    'pdf: new upload promoted to primary + ready');
SELECT tests.assert(
    (SELECT NOT is_primary FROM public.lesson_pdfs WHERE id = '60000000-0000-0000-0000-000000000001'),
    'pdf: previous primary demoted');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.lesson_pdfs
     WHERE lesson_id = '40000000-0000-0000-0000-000000000001' AND is_primary AND deleted_at IS NULL),
    'pdf: exactly one primary per lesson (partial unique)');
SELECT tests.assert(
    (SELECT EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'pdf.finalize' AND entity_id = '61000000-0000-0000-0000-000000000001')),
    'pdf: finalize audited');
RESET ROLE;
RESET "app.current_user_id";

-- restore fixture: p1 primary again (demote p9 first - partial unique)
UPDATE public.lesson_pdfs SET is_primary = false WHERE id = '61000000-0000-0000-0000-000000000001';
UPDATE public.lesson_pdfs SET is_primary = true WHERE id = '60000000-0000-0000-0000-000000000001';
SELECT tests.assert(
    (SELECT NOT is_primary FROM public.lesson_pdfs WHERE id = '61000000-0000-0000-0000-000000000001'),
    'pdf: fixture restored (p1 primary, p9 demoted)');

-- =====================================================================
-- Section 9: staff RPC spot checks
-- =====================================================================
RESET ROLE;
RESET "app.current_user_id";

-- B round trip: enable -> disable (state must end disabled for re-runs)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.enable_student(''70000000-0000-0000-0000-000000000002'')',
    1, 'staff: enable B');
SELECT tests.assert(
    (SELECT status = 'active' FROM public.profiles WHERE id = '70000000-0000-0000-0000-000000000002'),
    'staff: B active after enable');
SELECT tests.expect_rows(
    'SELECT public.disable_student(''70000000-0000-0000-0000-000000000002'')',
    1, 'staff: disable B');
SELECT tests.assert(
    (SELECT status = 'disabled' FROM public.profiles WHERE id = '70000000-0000-0000-0000-000000000002'),
    'staff: B disabled again (fixture preserved)');
RESET ROLE;
RESET "app.current_user_id";

-- set_student_grade: D g2 -> g1 -> back to g2
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.set_student_grade(''70000000-0000-0000-0000-000000000004'', ''10000000-0000-0000-0000-000000000001'')',
    1, 'staff: D -> g1');
SELECT tests.assert(
    (SELECT grade_id = '10000000-0000-0000-0000-000000000001' FROM public.profiles WHERE id = '70000000-0000-0000-0000-000000000004'),
    'staff: D grade changed');
SELECT tests.expect_rows(
    'SELECT public.set_student_grade(''70000000-0000-0000-0000-000000000004'', ''10000000-0000-0000-0000-000000000002'')',
    1, 'staff: D back to g2');
SELECT tests.expect_error(
    'SELECT public.set_student_grade(''70000000-0000-0000-0000-000000000004'', ''10000000-0000-0000-0000-000000000003'')',
    'P0001', 'grade_not_available');
RESET ROLE;
RESET "app.current_user_id";

-- publish_lesson fires the deduped new_content fan-out to active
-- grade-1 subscribers only (A, E, H - B is disabled, C deleted, D g2,
-- F/G no active sub).
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.publish_lesson(''40000000-0000-0000-0000-000000000002'')',
    1, 'staff: publish l2');
RESET ROLE;
RESET "app.current_user_id";
-- notifications are visible only to their own user_id under RLS; the
-- fan-out count must be asserted as postgres (superuser bypasses RLS)
SELECT tests.assert(
    (SELECT count(*) = 3 FROM public.notifications
     WHERE dedup_key LIKE 'new_content:40000000-0000-0000-0000-000000000002:%'),
    'publish: fan-out to exactly 3 eligible students');
SELECT tests.assert(
    (SELECT count(*) = 3 FROM public.notifications
     WHERE dedup_key LIKE 'new_content:40000000-0000-0000-0000-000000000002:%'
       AND user_id IN ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000005','70000000-0000-0000-0000-000000000008')),
    'publish: recipients are A, E, H only');
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.publish_lesson(''40000000-0000-0000-0000-000000000002'')',
    1, 'staff: publish l2 again');
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.assert(
    (SELECT count(*) = 3 FROM public.notifications
     WHERE dedup_key LIKE 'new_content:40000000-0000-0000-0000-000000000002:%'),
    'publish: re-publish is deduped');
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.hide_lesson(''40000000-0000-0000-0000-000000000002'')',
    1, 'staff: hide l2 (fixture restored)');
RESET ROLE;
RESET "app.current_user_id";

-- delete_pricing_plan: unreferenced -> hard delete; referenced -> deactivate
INSERT INTO public.pricing_plans (id, grade_id, duration_days, base_price, platform_fee, total_price, is_active)
VALUES ('22000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 10, 50.00, 5.00, 55.00, true)
ON CONFLICT (id) DO UPDATE SET is_active = true;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_rows(
    'SELECT public.delete_pricing_plan(''22000000-0000-0000-0000-000000000001'')',
    1, 'staff: delete unreferenced plan');
SELECT tests.assert(
    (SELECT NOT EXISTS (SELECT 1 FROM public.pricing_plans WHERE id = '22000000-0000-0000-0000-000000000001')),
    'staff: unreferenced plan hard-deleted');
SELECT tests.assert(
    (SELECT EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'pricing.delete' AND metadata ->> 'deleted' = 'true')),
    'staff: hard delete audited');
RESET ROLE;
RESET "app.current_user_id";

-- referenced plan: insert fresh + code referencing it, then deactivate
INSERT INTO public.pricing_plans (id, grade_id, duration_days, base_price, platform_fee, total_price, is_active)
VALUES ('22000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 11, 55.00, 5.50, 60.50, true)
ON CONFLICT (id) DO UPDATE SET is_active = true;
INSERT INTO public.subscription_codes (id, code, pricing_plan_id, status, created_by, created_at, note)
VALUES ('92000000-0000-0000-0000-000000000002', 'WLDN-TEST-CCCC-CCCC', '22000000-0000-0000-0000-000000000002', 'available', '70000000-0000-0000-0000-00000000000a', now(), 'TEST-FIXTURE')
ON CONFLICT (id) DO UPDATE SET status = 'available', used_at = NULL, used_by = NULL;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_rows(
    'SELECT public.delete_pricing_plan(''22000000-0000-0000-0000-000000000002'')',
    1, 'staff: delete referenced plan');
SELECT tests.assert(
    (SELECT is_active = false FROM public.pricing_plans WHERE id = '22000000-0000-0000-0000-000000000002'),
    'staff: referenced plan deactivated, not deleted (B7)');
SELECT tests.assert(
    (SELECT EXISTS (SELECT 1 FROM public.audit_logs
        WHERE action = 'pricing.delete' AND entity_id = '22000000-0000-0000-0000-000000000002'
          AND metadata ->> 'deactivated' = 'true')),
    'staff: deactivation audited');
RESET ROLE;
RESET "app.current_user_id";

-- cleanup of throwaway fixture rows
DELETE FROM public.subscription_codes WHERE id = '92000000-0000-0000-0000-000000000002';
DELETE FROM public.pricing_plans WHERE id = '22000000-0000-0000-0000-000000000002';

-- =====================================================================
-- Section 10: update_own_profile guard rails
-- =====================================================================
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error(
    'SELECT public.update_own_profile(''W'', ''+201001000009'', ''+201001000009'', ''Cairo'')',
    'P0001', 'access_denied');
RESET ROLE;
RESET "app.current_user_id";

SET LOCAL ROLE anon;
SELECT tests.expect_error(
    'SELECT public.update_own_profile(''X'', ''+201001000099'', ''+201001000099'', ''Cairo'')',
    '42501', 'permission denied for function update_own_profile');
RESET ROLE;

-- =====================================================================
-- Section 11: HIGH-1 grade enforcement (B8) - can_access_lesson,
--              units/lessons visibility, upsert_progress, redemption
-- =====================================================================
RESET ROLE;
RESET "app.current_user_id";

-- scratch published unit in g1 + published lesson with a ready primary
-- video, so every gate is exclusively testable against the grade flags.
INSERT INTO public.units (id, grade_id, name, sort_order, status, deleted_at)
VALUES ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'B8 Scratch Unit', 99, 'published', NULL)
ON CONFLICT (id) DO UPDATE SET grade_id = EXCLUDED.grade_id, status = 'published', deleted_at = NULL;
INSERT INTO public.lessons (id, unit_id, title, sort_order, status, deleted_at)
VALUES ('40000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-00000000000b', 'B8 Scratch Lesson', 99, 'published', NULL)
ON CONFLICT (id) DO UPDATE SET unit_id = EXCLUDED.unit_id, status = 'published', deleted_at = NULL;
INSERT INTO public.lesson_videos (id, lesson_id, bunny_video_id, bunny_library_id, title, status, is_primary, sort_order, deleted_at)
VALUES ('50000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000011', 'BV-B8', 'LIB-1', 'B8V', 'ready', true, 1, NULL)
ON CONFLICT (id) DO UPDATE SET lesson_id = EXCLUDED.lesson_id, status = 'ready', deleted_at = NULL;
INSERT INTO public.subscription_codes (id, code, pricing_plan_id, status, created_by, created_at, note)
VALUES ('92000000-0000-0000-0000-000000000011', 'WLDN-TEST-GGGG-GGGG', '20000000-0000-0000-0000-000000000001', 'available', '70000000-0000-0000-0000-00000000000a', now(), 'TEST-FIXTURE')
ON CONFLICT (id) DO UPDATE SET status = 'available', used_at = NULL, used_by = NULL;

-- baseline: everything passes while the grade is live
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_rows(
    'SELECT public.can_access_lesson(''40000000-0000-0000-0000-000000000011'')',
    1, 'B8: baseline can_access_lesson (grade live)');
SELECT tests.assert(
    (SELECT public.can_access_lesson('40000000-0000-0000-0000-000000000011')),
    'B8: baseline access true');
SELECT tests.expect_rows(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000011'', 30, 25)',
    1, 'B8: baseline upsert_progress accepted');
RESET ROLE;
RESET "app.current_user_id";

-- G has no active subscription -> the redemption subject for every phase
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000007';
SET LOCAL ROLE student;
SELECT tests.expect_rows(
    'SELECT public.redeem_subscription_code(''WLDN-TEST-GGGG-GGGG'')',
    1, 'B8: baseline redemption accepted');
RESET ROLE;
RESET "app.current_user_id";
-- reset the code + resulting subscription for the next phase
DELETE FROM public.notifications
WHERE dedup_key IN (
    SELECT 'sub_activated:' || s.id FROM public.subscriptions s WHERE s.code_id = '92000000-0000-0000-0000-000000000011'
    UNION ALL
    SELECT 'sub_expiring:' || s.id FROM public.subscriptions s WHERE s.code_id = '92000000-0000-0000-0000-000000000011'
);
DELETE FROM public.code_redemptions WHERE code_id = '92000000-0000-0000-0000-000000000011';
DELETE FROM public.subscriptions WHERE code_id = '92000000-0000-0000-0000-000000000011';
UPDATE public.subscription_codes SET status = 'available', used_at = NULL, used_by = NULL
WHERE id = '92000000-0000-0000-0000-000000000011';

-- grade deactivated (is_active = false): all gates close
UPDATE public.grades SET is_active = false WHERE id = '10000000-0000-0000-0000-000000000001';
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    (SELECT NOT public.can_access_lesson('40000000-0000-0000-0000-000000000011')),
    'B8: grade inactive -> can_access_lesson false');
SELECT tests.expect_error(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000011'', 5, 10)',
    'P0001', 'access_denied');
SELECT tests.expect_count('SELECT count(*) FROM public.units WHERE id = ''30000000-0000-0000-0000-00000000000b''', 0, 'B8: grade inactive -> unit hidden');
SELECT tests.expect_count('SELECT count(*) FROM public.lessons WHERE id = ''40000000-0000-0000-0000-000000000011''', 0, 'B8: grade inactive -> lesson hidden');
SELECT tests.expect_count('SELECT count(*) FROM public.lesson_videos WHERE id = ''50000000-0000-0000-0000-000000000011''', 0, 'B8: grade inactive -> video hidden');
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000007';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.redeem_subscription_code(''WLDN-TEST-GGGG-GGGG'')',
    'P0001', 'plan_not_available');
RESET ROLE;
RESET "app.current_user_id";
UPDATE public.grades SET is_active = true WHERE id = '10000000-0000-0000-0000-000000000001';

-- grade soft-deleted (delete_grade): same behaviour, is_active untouched
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_rows(
    'SELECT public.delete_grade(''10000000-0000-0000-0000-000000000001'')',
    1, 'B8: delete_grade soft-deletes');
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    (SELECT NOT public.can_access_lesson('40000000-0000-0000-0000-000000000011')),
    'B8: grade soft-deleted -> can_access_lesson false');
SELECT tests.expect_error(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000011'', 5, 10)',
    'P0001', 'access_denied');
SELECT tests.expect_count('SELECT count(*) FROM public.units WHERE id = ''30000000-0000-0000-0000-00000000000b''', 0, 'B8: grade soft-deleted -> unit hidden');
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000007';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.redeem_subscription_code(''WLDN-TEST-GGGG-GGGG'')',
    'P0001', 'plan_not_available');
RESET ROLE;
RESET "app.current_user_id";

-- restore: gates reopen
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_rows(
    'SELECT public.restore_grade(''10000000-0000-0000-0000-000000000001'')',
    1, 'B8: restore_grade reopens');
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    (SELECT public.can_access_lesson('40000000-0000-0000-0000-000000000011')),
    'B8: restored grade -> access true again');
SELECT tests.expect_rows(
    'SELECT public.upsert_progress(''40000000-0000-0000-0000-000000000011'', 40, 35)',
    1, 'B8: restored grade -> upsert accepted');
RESET ROLE;
RESET "app.current_user_id";

-- redemption after restore succeeds
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000007';
SET LOCAL ROLE student;
SELECT tests.expect_rows(
    'SELECT public.redeem_subscription_code(''WLDN-TEST-GGGG-GGGG'')',
    1, 'B8: restored grade -> redemption accepted');
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.assert(
    (SELECT EXISTS (SELECT 1 FROM public.subscriptions s
                    JOIN public.code_redemptions cr ON cr.subscription_id = s.id
                    JOIN public.subscription_codes c ON c.id = cr.code_id
                    WHERE c.code = 'WLDN-TEST-GGGG-GGGG')),
    'B8: redemption recorded');

-- fixture cleanup
DELETE FROM public.notifications
WHERE dedup_key IN (
    SELECT 'sub_activated:' || s.id FROM public.subscriptions s WHERE s.code_id = '92000000-0000-0000-0000-000000000011'
    UNION ALL
    SELECT 'sub_expiring:' || s.id FROM public.subscriptions s WHERE s.code_id = '92000000-0000-0000-0000-000000000011'
);
DELETE FROM public.code_redemptions WHERE code_id = '92000000-0000-0000-0000-000000000011';
DELETE FROM public.subscriptions WHERE code_id = '92000000-0000-0000-0000-000000000011';
DELETE FROM public.progress
WHERE student_id = '70000000-0000-0000-0000-000000000001'
  AND lesson_id = '40000000-0000-0000-0000-000000000011';
DELETE FROM public.lesson_videos WHERE id = '50000000-0000-0000-0000-000000000011';
DELETE FROM public.lessons WHERE id = '40000000-0000-0000-0000-000000000011';
DELETE FROM public.units WHERE id = '30000000-0000-0000-0000-00000000000b';
DELETE FROM public.subscription_codes WHERE id = '92000000-0000-0000-0000-000000000011';

-- =====================================================================
-- Section 12: MEDIUM-4 update_student_profile target guard
-- =====================================================================
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_error(
    'SELECT public.update_student_profile(''70000000-0000-0000-0000-00000000000a'', ''Hacked Name'', ''+201001000001'', ''+201001000001'', ''Cairo'')',
    'P0001', 'target_not_student');
SELECT tests.assert(
    (SELECT full_name = 'AD' AND role = 'admin' FROM public.profiles WHERE id = '70000000-0000-0000-0000-00000000000a'),
    'update_student_profile: admin profile untouched');
RESET ROLE;
RESET "app.current_user_id";

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error(
    'SELECT public.update_student_profile(''70000000-0000-0000-0000-000000000009'', ''Walid X'', ''+201001000001'', ''+201001000001'', ''Cairo'')',
    'P0001', 'target_not_student');
SELECT tests.assert(
    (SELECT full_name = 'W' AND role = 'mr_walid' FROM public.profiles WHERE id = '70000000-0000-0000-0000-000000000009'),
    'update_student_profile: mr_walid profile untouched');
RESET ROLE;
RESET "app.current_user_id";

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_rows(
    'SELECT public.update_student_profile(''70000000-0000-0000-0000-000000000001'', ''B8 Updated Name'', ''+201001000001'', ''+201001000001'', ''Cairo'')',
    1, 'update_student_profile: student update ok');
SELECT tests.assert(
    (SELECT full_name = 'B8 Updated Name' AND role = 'student' FROM public.profiles WHERE id = '70000000-0000-0000-0000-000000000001'),
    'update_student_profile: name updated, role untouched');
SELECT tests.assert(
    (SELECT EXISTS (SELECT 1 FROM public.audit_logs
        WHERE action = 'student.profile_update' AND entity_id = '70000000-0000-0000-0000-000000000001'
          AND metadata ->> 'changed_fields' LIKE '%full_name%')),
    'update_student_profile: audited with changed columns');
RESET ROLE;
RESET "app.current_user_id";
-- restore the fixture name for rerun idempotency
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_rows(
    'SELECT public.update_student_profile(''70000000-0000-0000-0000-000000000001'', ''A'', ''+201001000001'', ''+201001000001'', ''Cairo'')',
    1, 'update_student_profile: fixture restored');
RESET ROLE;
RESET "app.current_user_id";

-- =====================================================================
-- Section 13: set_student_grade NULL clearing (A1) + grade validation
-- =====================================================================
-- D (…0004) is back at fixture grade g2 after Section 9's round trip.
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.set_student_grade(''70000000-0000-0000-0000-000000000004'', NULL)',
    1, 'grade: NULL clears grade');
SELECT tests.assert(
    (SELECT grade_id IS NULL FROM public.profiles WHERE id = '70000000-0000-0000-0000-000000000004'),
    'grade: D grade cleared');
RESET ROLE;
RESET "app.current_user_id";
-- audit_logs SELECT is admin-only via RLS: read the audit row as admin
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.assert(
    (SELECT EXISTS (SELECT 1 FROM public.audit_logs
        WHERE action = 'student.grade_change' AND entity_id = '70000000-0000-0000-0000-000000000004'
          AND metadata ? 'old_grade_id' AND metadata ? 'new_grade_id'
          AND (metadata ->> 'new_grade_id') IS NULL)),
    'grade: clearing audited with new_grade_id null');
RESET ROLE;
RESET "app.current_user_id";
-- back to mr_walid for the validation cases
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;

-- non-NULL ids that don't exist / are inactive / are soft-deleted still raise
SELECT tests.expect_error(
    'SELECT public.set_student_grade(''70000000-0000-0000-0000-000000000004'', gen_random_uuid())',
    'P0001', 'grade_not_available');
SELECT tests.assert(
    (SELECT grade_id IS NULL FROM public.profiles WHERE id = '70000000-0000-0000-0000-000000000004'),
    'grade: failed assignment leaves grade cleared');
SELECT tests.expect_error(
    'SELECT public.set_student_grade(''70000000-0000-0000-0000-000000000004'', ''10000000-0000-0000-0000-000000000003'')',
    'P0001', 'grade_not_available');
SELECT tests.expect_error(
    'SELECT public.set_student_grade(''70000000-0000-0000-0000-000000000004'', ''10000000-0000-0000-0000-000000000004'')',
    'P0001', 'grade_not_available');

-- target-role guard kept (staff may not unassign their own profile)
SELECT tests.expect_error(
    'SELECT public.set_student_grade(''70000000-0000-0000-0000-000000000009'', NULL)',
    'P0001', 'not_a_student');

-- restore fixture: D back to g2
SELECT tests.expect_rows(
    'SELECT public.set_student_grade(''70000000-0000-0000-0000-000000000004'', ''10000000-0000-0000-0000-000000000002'')',
    1, 'grade: fixture restored (D -> g2)');
SELECT tests.assert(
    (SELECT grade_id = '10000000-0000-0000-0000-000000000002' FROM public.profiles WHERE id = '70000000-0000-0000-0000-000000000004'),
    'grade: D back on g2');
RESET ROLE;
RESET "app.current_user_id";

-- =====================================================================
-- Section 14: create_grade / update_grade (Phase 3 grade CRUD)
-- Scratch grade names use TEST-G14-*; 02_roles cleans TEST-% on the
-- next run. All audit reads run as admin (RLS: admin-only SELECT).
-- =====================================================================
RESET ROLE;
RESET "app.current_user_id";

-- mr_walid creates a grade; uuid returned
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.assert(
    (SELECT public.create_grade('TEST-G14-SEC1', 10) IS NOT NULL),
    'grade: mr_walid creates a grade (uuid returned)');
SELECT tests.assert(
    (SELECT name = 'TEST-G14-SEC1' AND sort_order = 10 AND is_active AND deleted_at IS NULL
     FROM public.grades WHERE name = 'TEST-G14-SEC1'),
    'grade: created row has name/sort_order, active, not deleted');
-- duplicate ACTIVE name raises
SELECT tests.expect_error(
    'SELECT public.create_grade(''TEST-G14-SEC1'', 20)',
    'P0001', 'duplicate grade');
-- empty/whitespace name raises
SELECT tests.expect_error(
    'SELECT public.create_grade(''   '')',
    'P0001', 'grade_name_required');
-- nonexistent update target raises
SELECT tests.expect_error(
    'SELECT public.update_grade(''f0000000-0000-0000-0000-000000000000'')',
    'P0001', 'grade_not_found');
RESET ROLE;
RESET "app.current_user_id";

-- update renames + reorders (name only, then sort_order only)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.update_grade((SELECT id FROM public.grades WHERE name = ''TEST-G14-SEC1''), ''TEST-G14-SEC1B'', 20)',
    1, 'grade: rename + reorder in one call');
SELECT tests.assert(
    (SELECT name = 'TEST-G14-SEC1B' AND sort_order = 20
     FROM public.grades WHERE name = 'TEST-G14-SEC1B'),
    'grade: name and sort_order updated');
SELECT tests.expect_rows(
    'SELECT public.update_grade((SELECT id FROM public.grades WHERE name = ''TEST-G14-SEC1B''), NULL, 30)',
    1, 'grade: sort_order-only update');
SELECT tests.assert(
    (SELECT name = 'TEST-G14-SEC1B' AND sort_order = 30
     FROM public.grades WHERE name = 'TEST-G14-SEC1B'),
    'grade: name untouched by sort_order-only update');
RESET ROLE;
RESET "app.current_user_id";

-- rename onto an existing ACTIVE name raises
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error(
    'SELECT public.update_grade((SELECT id FROM public.grades WHERE name = ''TEST-G14-SEC1B''), ''TEST-G1'')',
    'P0001', 'duplicate grade');
SELECT tests.assert(
    (SELECT name = 'TEST-G14-SEC1B' FROM public.grades WHERE name = 'TEST-G14-SEC1B'),
    'grade: failed rename leaves name unchanged');
-- empty name on update raises
SELECT tests.expect_error(
    'SELECT public.update_grade((SELECT id FROM public.grades WHERE name = ''TEST-G14-SEC1B''), ''  '')',
    'P0001', 'grade_name_required');
RESET ROLE;
RESET "app.current_user_id";

-- no-op update: same name + same sort_order -> no audit, no change
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.update_grade((SELECT id FROM public.grades WHERE name = ''TEST-G14-SEC1B''), ''TEST-G14-SEC1B'', 30)',
    1, 'grade: no-change update is a no-op');
RESET ROLE;
RESET "app.current_user_id";
-- audit read as admin: exactly ONE grade.update row for this grade
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.assert(
    (SELECT sort_order = 30 FROM public.grades WHERE name = 'TEST-G14-SEC1B'),
    'grade: sort_order unchanged after no-op');
SELECT tests.assert(
    (SELECT count(*) = 2 FROM public.audit_logs
     WHERE action = 'grade.update'
       AND entity_id = (SELECT id FROM public.grades WHERE name = 'TEST-G14-SEC1B')),
    'grade: no-op update adds no audit row (2 from real updates only)');
RESET ROLE;
RESET "app.current_user_id";

-- student role is denied (in-function guard; grant is authenticated-wide)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.create_grade(''TEST-G14-STUDENT'')',
    'P0001', 'permission_denied');
SELECT tests.expect_error(
    'SELECT public.update_grade((SELECT id FROM public.grades WHERE name = ''TEST-G14-SEC1B''), ''TEST-G14-HACK'')',
    'P0001', 'permission_denied');
SELECT tests.assert(
    (SELECT NOT EXISTS (SELECT 1 FROM public.grades WHERE name = 'TEST-G14-HACK')),
    'grade: denied student mutated nothing');
RESET ROLE;
RESET "app.current_user_id";

-- soft-deleted grade: update blocked, restore reopens (B8)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_rows(
    'SELECT public.delete_grade((SELECT id FROM public.grades WHERE name = ''TEST-G14-SEC1B''))',
    1, 'grade: delete_grade soft-deletes');
SELECT tests.expect_error(
    'SELECT public.update_grade((SELECT id FROM public.grades WHERE name = ''TEST-G14-SEC1B''), ''TEST-G14-X'')',
    'P0001', 'grade_deleted');
SELECT tests.expect_rows(
    'SELECT public.restore_grade((SELECT id FROM public.grades WHERE name = ''TEST-G14-SEC1B''))',
    1, 'grade: restore_grade reopens');
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.update_grade((SELECT id FROM public.grades WHERE name = ''TEST-G14-SEC1B''), ''TEST-G14-SEC1C'', 40)',
    1, 'grade: update works after restore');
SELECT tests.assert(
    (SELECT name = 'TEST-G14-SEC1C' AND sort_order = 40
     FROM public.grades WHERE name = 'TEST-G14-SEC1C'),
    'grade: restored grade renamed + reordered');
RESET ROLE;
RESET "app.current_user_id";

-- is_active = false grade blocks update (B8 deactivation semantics)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
UPDATE public.grades SET is_active = false WHERE name = 'TEST-G14-SEC1C';
SELECT tests.expect_error(
    'SELECT public.update_grade((SELECT id FROM public.grades WHERE name = ''TEST-G14-SEC1C''), ''TEST-G14-SEC1D'')',
    'P0001', 'grade_inactive');
SELECT tests.assert(
    (SELECT name = 'TEST-G14-SEC1C' AND is_active = false
     FROM public.grades WHERE name = 'TEST-G14-SEC1C'),
    'grade: inactive grade untouched by blocked update');
-- fixture cleanup: remove the scratch grade entirely
DELETE FROM public.grades WHERE name LIKE 'TEST-G14-%';
RESET ROLE;
RESET "app.current_user_id";

-- =====================================================================
-- Section 15: create_codes_for_staff (EF wrapper, 0014)
-- Staff-guarded entry point for generate_codes_internal: the guard uses
-- the request-scoped claims (auth.uid via is_admin/is_mr_walid) exactly
-- like list_trash in 0012, so a PostgREST user-JWT call works with
-- created_by = caller uid; a GUC-free call (service role / plain psql)
-- hits permission_denied BEFORE generate_codes_internal is reached;
-- plan/count validation stays inside generate_codes_internal.
-- Generated rows carry note = 'test' only (cleaned up at the end).
-- =====================================================================
RESET ROLE;
RESET "app.current_user_id";

-- (a) mr_walid: 3 codes, created_by = caller, CHECK format, available
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.create_codes_for_staff(''20000000-0000-0000-0000-000000000001'', 3, ''test'')',
    3, 'codes: mr_walid generates 3 codes');
SELECT tests.assert(
    (SELECT count(*) = 3
     FROM public.subscription_codes
     WHERE created_by = '70000000-0000-0000-0000-000000000009'
       AND note = 'test' AND status = 'available'
       AND used_at IS NULL AND revoked_at IS NULL
       AND code ~ '^WLDN-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$'),
    'codes: 3 rows by mr_walid, unambiguous CHECK format, status available');
SELECT tests.assert(
    (SELECT count(*) = 0
     FROM public.subscription_codes
     WHERE code !~ '^WLDN-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$'),
    'codes: no generated code violates the unambiguous charset');
RESET ROLE;
RESET "app.current_user_id";

-- (b) student calling the wrapper directly -> permission_denied
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.create_codes_for_staff(''20000000-0000-0000-0000-000000000001'', 3, ''test'')',
    'P0001', 'permission_denied');
RESET ROLE;
RESET "app.current_user_id";
-- subscription_codes are invisible to students (RLS): count as postgres
SELECT tests.assert(
    (SELECT count(*) = 3 FROM public.subscription_codes WHERE note = 'test'),
    'codes: denied student mutated nothing');

-- (c) plain psql session (postgres, NO claims): permission_denied, NOT
-- system_actor_required - clients cannot skip the guard by omitting sub
SELECT tests.expect_error(
    'SELECT public.create_codes_for_staff(''20000000-0000-0000-0000-000000000001'', 3, ''test'')',
    'P0001', 'permission_denied');
SELECT tests.assert(
    (SELECT count(*) = 3 FROM public.subscription_codes WHERE note = 'test'),
    'codes: GUC-free path mutated nothing');

-- (d) count cap stays inside generate_codes_internal: 0 / 501 -> invalid_count
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error(
    'SELECT public.create_codes_for_staff(''20000000-0000-0000-0000-000000000001'', 0, ''test'')',
    'P0001', 'invalid_count');
SELECT tests.expect_error(
    'SELECT public.create_codes_for_staff(''20000000-0000-0000-0000-000000000001'', 501, ''test'')',
    'P0001', 'invalid_count');

-- (e) plan validation stays in generate_codes_internal: unknown plan -> plan_not_found
SELECT tests.expect_error(
    'SELECT public.create_codes_for_staff(gen_random_uuid(), 3, ''test'')',
    'P0001', 'plan_not_found');
RESET ROLE;
RESET "app.current_user_id";

-- cleanup: the 3 codes generated in (a), plus any rows leaked by failed
-- (b)-(e) attempts (asserted above to be none)
DELETE FROM public.subscription_codes WHERE note = 'test';
RESET ROLE;
RESET "app.current_user_id";

-- =====================================================================
-- Section 16: create_pdf_upload_record + finalize (EF wrapper, 0015)
-- The upload-pdf Edge Function (Phase 4) drives the PDF upload flow
-- ARCHITECTURE.md §8.2/§8.3:
--   1. staff wrapper reserves the row + {lesson_id}/{uuid}.pdf path
--      (lesson_pdfs has NO INSERT policy in 0009; the wrapper is the
--      only insert surface and is staff-guarded like create_codes_for_staff)
--   2. the 0015 storage.objects INSERT policy (pdfs_insert_row_backed)
--      lets the caller-token client issue the I4 signed upload URL
--      (storage requires an objects INSERT policy at issuance)
--   3. finalize_pdf_upload (0007, UNCHANGED) marks ready + promotes.
-- Fixtures used: l1 (published, has primary p1), l4 (soft-deleted),
-- W = mr_walid ...009, A = student ...001, AD = admin ...00a.
-- Pending rows created here are removed at the end of this section.
-- =====================================================================
RESET ROLE;
RESET "app.current_user_id";

-- (a) mr_walid reserves a pending row: Arabic original_name, declared
-- size, server-generated {lesson_id}/{uuid}.pdf path, not ready, not primary
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.create_pdf_upload_record(''40000000-0000-0000-0000-000000000001'', ''ملخص-الوحدة-1.pdf'', 12345)',
    1, 'pdf16: mr_walid reserves a pending upload row');
SELECT tests.assert(
    (SELECT storage_path ~ '^40000000-0000-0000-0000-000000000001/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
       AND is_ready = false AND is_primary = false
       AND size_bytes = 12345 AND deleted_at IS NULL
     FROM public.lesson_pdfs
     WHERE original_name = 'ملخص-الوحدة-1.pdf'),
    'pdf16: storage_path is {lesson_id}/{uuid}.pdf, pending flags, size recorded');
-- the path uuid is server-generated: it must NOT be the row's id
SELECT tests.assert(
    (SELECT storage_path <> id::text
     FROM public.lesson_pdfs
     WHERE original_name = 'ملخص-الوحدة-1.pdf'),
    'pdf16: path uuid independent from row id (gen_random_uuid)');
RESET ROLE;
RESET "app.current_user_id";

-- (b) second pending row on the same lesson: partial-unique untouched
-- (the index only counts is_primary AND not deleted)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.create_pdf_upload_record(''40000000-0000-0000-0000-000000000001'', ''two.pdf'', NULL)',
    1, 'pdf16: second pending row allowed');
SELECT tests.assert(
    (SELECT count(*) = 2 FROM public.lesson_pdfs
     WHERE lesson_id = '40000000-0000-0000-0000-000000000001'
       AND is_primary = false AND is_ready = false AND deleted_at IS NULL),
    'pdf16: two non-primary pending rows coexist (partial unique untouched)');
RESET ROLE;
RESET "app.current_user_id";

-- (c) guard matrix: student -> permission_denied; GUC-free (plain psql)
-- -> permission_denied; unknown lesson -> lesson_not_found; soft-deleted
-- lesson -> lesson_deleted; out-of-bounds size -> invalid_pdf_size
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.create_pdf_upload_record(''40000000-0000-0000-0000-000000000001'', ''x.pdf'', NULL)',
    'P0001', 'permission_denied');
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.expect_error(
    'SELECT public.create_pdf_upload_record(''40000000-0000-0000-0000-000000000001'', ''x.pdf'', NULL)',
    'P0001', 'permission_denied');
-- the lesson/size guards require an authenticated-staff context; re-arm it
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error(
    'SELECT public.create_pdf_upload_record(gen_random_uuid(), ''x.pdf'', NULL)',
    'P0001', 'lesson_not_found');
SELECT tests.expect_error(
    'SELECT public.create_pdf_upload_record(''40000000-0000-0000-0000-000000000004'', ''x.pdf'', NULL)',
    'P0001', 'lesson_deleted');
SELECT tests.expect_error(
    'SELECT public.create_pdf_upload_record(''40000000-0000-0000-0000-000000000001'', ''x.pdf'', -1)',
    'P0001', 'invalid_pdf_size');
SELECT tests.expect_error(
    'SELECT public.create_pdf_upload_record(''40000000-0000-0000-0000-000000000001'', ''x.pdf'', 52428801)',
    'P0001', 'invalid_pdf_size');
SELECT tests.assert(
    (SELECT NOT EXISTS (SELECT 1 FROM public.lesson_pdfs
      WHERE original_name NOT IN ('ملخص-الوحدة-1.pdf', 'two.pdf') AND deleted_at IS NULL
        AND lesson_id = '40000000-0000-0000-0000-000000000001' AND is_ready = false)),
    'pdf16: denied callers mutated nothing');

-- (d) storage.objects INSERT policy (pdfs_insert_row_backed, 0015):
-- the policy is satisfiable only at a row-backed path visible to the caller
CREATE TEMP TABLE pdf16_paths (p text);
INSERT INTO pdf16_paths
SELECT storage_path FROM public.lesson_pdfs WHERE original_name = 'ملخص-الوحدة-1.pdf';

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'INSERT INTO storage.objects (bucket_id, name) SELECT ''pdfs'', p FROM pdf16_paths',
    1, 'storage16: row-backed path insertable');
SELECT tests.expect_error(
    'INSERT INTO storage.objects (bucket_id, name) VALUES (''pdfs'', ''40000000-0000-0000-0000-000000000001/11111111-2222-3333-4444-555555555555.pdf'')',
    '42501', 'row-level security');
SELECT tests.expect_error(
    'INSERT INTO storage.objects (bucket_id, name) VALUES (''pdfs'', ''test/l1.pdf'')',
    '42501', 'row-level security');
SELECT tests.expect_error(
    'INSERT INTO storage.objects (bucket_id, name) VALUES (''audit-exports'', (SELECT p FROM pdf16_paths))',
    '42501', 'row-level security');
-- carry the pending path into the student context via a custom GUC
-- (temp tables are not readable under a different effective role;
-- SET LOCAL with a subquery is not valid syntax, so use set_config())
SELECT pg_catalog.set_config('app.pdf16_path', storage_path, true)
FROM public.lesson_pdfs WHERE original_name = 'ملخص-الوحدة-1.pdf';
RESET ROLE;
RESET "app.current_user_id";

-- student: pending rows are INVISIBLE under the 0009 SELECT policy, so the
-- same row-backed path is denied (the issuance-time boundary)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'INSERT INTO storage.objects (bucket_id, name) VALUES (''pdfs'', current_setting(''app.pdf16_path''))',
    '42501', 'row-level security');
RESET ROLE;
RESET "app.current_user_id";
RESET "app.pdf16_path";
SELECT tests.assert(
    (SELECT count(*) = 1 FROM storage.objects WHERE bucket_id = 'pdfs'),
    'storage16: exactly one test object so far (student denial inserted nothing)');

-- hardened (0020): a READY PRIMARY pdf path of an accessible lesson is
-- NO LONGER insertable - the policy now only satisfies PENDING
-- (is_ready=false AND is_primary=false) row-backed paths, so a student
-- cannot plant bytes at a visible primary PDF object (HARD-2).
-- l9 is published/unit published/own grade/active sub for student A.
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.create_pdf_upload_record(''40000000-0000-0000-0000-000000000009'', ''TEST-PDF16-L9.pdf'', 42)',
    1, 'pdf16: pending row on l9 (visible-primary proof)');
SELECT tests.expect_rows(
    'SELECT public.finalize_pdf_upload((SELECT id FROM public.lesson_pdfs WHERE original_name = ''TEST-PDF16-L9.pdf''))',
    1, 'pdf16: finalize l9 (0007 unchanged, caller-token path)');
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'INSERT INTO storage.objects (bucket_id, name)
     SELECT ''pdfs'', storage_path FROM public.lesson_pdfs WHERE original_name = ''TEST-PDF16-L9.pdf''',
    '42501', 'row-level security');
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.assert(
    (SELECT count(*) = 1 FROM storage.objects
     WHERE bucket_id = 'pdfs'),
    'storage16: hardened - visible primary path no longer insertable (0020)');

-- (e) full EF flow on l1: finalize_pdf_upload over the caller token
-- (0007 UNCHANGED - staff guard from request claims, 0014-verified
-- mechanism) promotes the new upload and demotes the previous primary
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.finalize_pdf_upload((SELECT id FROM public.lesson_pdfs WHERE original_name = ''ملخص-الوحدة-1.pdf''))',
    1, 'pdf16: finalize over caller token');
SELECT tests.assert(
    (SELECT is_ready AND is_primary
     FROM public.lesson_pdfs WHERE original_name = 'ملخص-الوحدة-1.pdf'),
    'pdf16: new upload ready + primary');
SELECT tests.assert(
    (SELECT NOT is_primary FROM public.lesson_pdfs WHERE id = '60000000-0000-0000-0000-000000000001'),
    'pdf16: previous primary demoted');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.lesson_pdfs
     WHERE lesson_id = '40000000-0000-0000-0000-000000000001' AND is_primary AND deleted_at IS NULL),
    'pdf16: exactly one primary');
-- audit_logs SELECT is admin-only (0009): read it as the session superuser
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.assert(
    (SELECT EXISTS (SELECT 1 FROM public.audit_logs
      WHERE action = 'pdf.finalize' AND actor_id = '70000000-0000-0000-0000-000000000009'
        AND entity_id = (SELECT lp.id FROM public.lesson_pdfs lp WHERE lp.original_name = 'ملخص-الوحدة-1.pdf')
        AND entity_type = 'lesson_pdf')),
    'pdf16: finalize audited with caller actor');

-- (f) cleanup: restore fixture p1 primary, remove the wrapper rows and
-- every artifact created in this section
UPDATE public.lesson_pdfs SET is_primary = false
WHERE lesson_id = '40000000-0000-0000-0000-000000000001' AND is_primary
  AND id <> '60000000-0000-0000-0000-000000000001';
UPDATE public.lesson_pdfs SET is_primary = true
WHERE id = '60000000-0000-0000-0000-000000000001';
DELETE FROM public.audit_logs
WHERE action = 'pdf.upload_started'
   OR (action = 'pdf.finalize' AND entity_type = 'lesson_pdf' AND entity_id IN (
       SELECT lp.id FROM public.lesson_pdfs lp WHERE lp.original_name IN ('ملخص-الوحدة-1.pdf', 'two.pdf', 'TEST-PDF16-L9.pdf')));
DELETE FROM storage.objects WHERE bucket_id = 'pdfs' AND name IN (
    SELECT storage_path FROM public.lesson_pdfs
    WHERE original_name IN ('ملخص-الوحدة-1.pdf', 'TEST-PDF16-L9.pdf'));
DELETE FROM public.lesson_pdfs
WHERE original_name IN ('ملخص-الوحدة-1.pdf', 'two.pdf', 'TEST-PDF16-L9.pdf');
DROP TABLE pdf16_paths;
SELECT tests.assert(
    (SELECT count(*) = 0 FROM public.lesson_pdfs WHERE original_name IN ('ملخص-الوحدة-1.pdf', 'two.pdf', 'TEST-PDF16-L9.pdf')),
    'pdf16: wrapper-created rows cleaned up');
SELECT tests.assert(
    (SELECT is_primary AND is_ready FROM public.lesson_pdfs WHERE id = '60000000-0000-0000-0000-000000000001'),
    'pdf16: fixture p1 restored as primary ready');
RESET ROLE;
RESET "app.current_user_id";

-- =====================================================================
-- Section 17: create_video_upload_record (EF wrapper, 0016)
-- The create-video-upload-session Edge Function (Phase 5) reserves the
-- lesson_videos row (ARCHITECTURE.md §8.2/§7.2):
--   1. staff wrapper inserts the pending_upload row (lesson_videos has
--      NO INSERT policy in 0009; the wrapper is the only insert surface)
--   2. create mode: is_primary=true ONLY when the lesson has no live
--      primary (B9/MED-10); replace mode: never takes primary here —
--      promotion happens on 'ready' via set_video_status (0008, UNCHANGED)
--   3. orphan rule: at most ONE pending_upload row per lesson
-- Fixtures used: l1 (v1 primary ready, v2 ready non-primary, v3
-- processing non-primary), l4 (soft-deleted), l8 (no videos), l5
-- (published, no videos), W = mr_walid ...009, A = student ...001.
-- Rows created here are removed at the end of this section.
-- =====================================================================
RESET ROLE;
RESET "app.current_user_id";

-- (a) replace-mode guards on l1 (no pending row yet): old_video_required,
-- old_video_not_found, old_video_not_ready (v3 is processing), wrong_lesson
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000001'', ''BV17-1'', ''LIB-1'', ''T17'', ''replace'', NULL)',
    'P0001', 'old_video_required');
SELECT tests.expect_error(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000001'', ''BV17-2'', ''LIB-1'', ''T17'', ''replace'', gen_random_uuid())',
    'P0001', 'old_video_not_found');
SELECT tests.expect_error(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000001'', ''BV17-3'', ''LIB-1'', ''T17'', ''replace'', ''50000000-0000-0000-0000-000000000003'')',
    'P0001', 'old_video_not_ready');
-- temp ready video on l5 (different lesson) for the wrong_lesson guard:
-- lesson_videos has FORCE RLS with no INSERT policy, so this raw fixture
-- insert must run as the session superuser, not as mr_walid
RESET ROLE;
RESET "app.current_user_id";
INSERT INTO public.lesson_videos (id, lesson_id, bunny_video_id, bunny_library_id, title, status, is_primary, sort_order, deleted_at)
VALUES ('50000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000005', 'BV17-OTHER', 'LIB-1', 'V17-OTHER', 'ready', true, 1, NULL);
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000001'', ''BV17-4'', ''LIB-1'', ''T17'', ''replace'', ''50000000-0000-0000-0000-000000000017'')',
    'P0001', 'wrong_lesson');
-- replace with a ready same-lesson old video (v1): pending row, never primary
SELECT tests.expect_rows(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000001'', ''BV17-5'', ''LIB-1'', ''  T17-REPLACE  '', ''replace'', ''50000000-0000-0000-0000-000000000001'')',
    1, 'video17: replace reserves a pending row');
SELECT tests.assert(
    (SELECT status = 'pending_upload' AND NOT is_primary AND title = 'T17-REPLACE'
            AND bunny_video_id = 'BV17-5' AND sort_order = 0 AND deleted_at IS NULL
     FROM public.lesson_videos WHERE bunny_video_id = 'BV17-5'),
    'video17: replace row pending, non-primary, title trimmed');

-- (b) orphan rule: a second pending row on l1 is rejected
SELECT tests.expect_error(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000001'', ''BV17-6'', ''LIB-1'', ''T17'', ''create'', NULL)',
    'P0001', 'lesson_has_pending_upload');
RESET ROLE;
RESET "app.current_user_id";
-- remove the pending row before continuing: lesson_videos has FORCE RLS with
-- no DELETE policy, so a DELETE as mr_walid silently affects 0 rows (the
-- orphan guard would then reject (c)); the cleanup must run as the session
-- superuser
DELETE FROM public.lesson_videos WHERE bunny_video_id = 'BV17-5';

-- (c) create mode: first video of a lesson takes the primary slot (l8),
-- a lesson with an existing primary does not (l1)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000008'', ''BV17-7'', ''LIB-1'', ''T17-FIRST'', ''create'', NULL)',
    1, 'video17: first video on l8');
SELECT tests.assert(
    (SELECT is_primary AND status = 'pending_upload'
     FROM public.lesson_videos WHERE bunny_video_id = 'BV17-7'),
    'video17: create on primary-less lesson reserves the primary slot');
SELECT tests.expect_rows(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000001'', ''BV17-8'', ''LIB-1'', ''T17-2'', ''create'', NULL)',
    1, 'video17: create on l1 (primary exists)');
SELECT tests.assert(
    (SELECT NOT is_primary FROM public.lesson_videos WHERE bunny_video_id = 'BV17-8'),
    'video17: create on lesson with primary stays non-primary (B9/MED-10)');

-- (d) guard matrix: student -> permission_denied; GUC-free (plain psql)
-- -> permission_denied; unknown lesson -> lesson_not_found; soft-deleted
-- lesson -> lesson_deleted; empty bunny ids -> invalid_bunny_video_id;
-- bad mode -> invalid_mode
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000001'', ''BV17-9'', ''LIB-1'', ''T17'', ''create'', NULL)',
    'P0001', 'permission_denied');
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.expect_error(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000001'', ''BV17-9'', ''LIB-1'', ''T17'', ''create'', NULL)',
    'P0001', 'permission_denied');
-- the remaining guards require an authenticated-staff context; re-arm it
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error(
    'SELECT public.create_video_upload_record(gen_random_uuid(), ''BV17-9'', ''LIB-1'', ''T17'', ''create'', NULL)',
    'P0001', 'lesson_not_found');
SELECT tests.expect_error(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000004'', ''BV17-9'', ''LIB-1'', ''T17'', ''create'', NULL)',
    'P0001', 'lesson_deleted');
SELECT tests.expect_error(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000001'', ''   '', ''LIB-1'', ''T17'', ''create'', NULL)',
    'P0001', 'invalid_bunny_video_id');
SELECT tests.expect_error(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000001'', ''BV17-9'', ''   '', ''T17'', ''create'', NULL)',
    'P0001', 'invalid_bunny_video_id');
SELECT tests.expect_error(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000001'', ''BV17-9'', ''LIB-1'', ''T17'', ''delete'', NULL)',
    'P0001', 'invalid_mode');
SELECT tests.assert(
    (SELECT NOT EXISTS (SELECT 1 FROM public.lesson_videos
      WHERE bunny_video_id IN ('BV17-9', 'BV17-6', 'BV17-1', 'BV17-2', 'BV17-3', 'BV17-4'))),
    'video17: denied callers mutated nothing');

-- (e) wrapper calls are audited with the caller actor
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.assert(
    (SELECT EXISTS (SELECT 1 FROM public.audit_logs
      WHERE action = 'video.upload_session_created' AND actor_id = '70000000-0000-0000-0000-000000000009'
        AND entity_type = 'lesson_video'
        AND (metadata->>'mode') = 'create'
        AND (metadata->>'is_primary')::boolean)),
    'video17: create session audited (first-video primary)');

-- (f) cleanup: remove wrapper rows, the temp l5 video and audit rows;
-- fixture l1 keeps v1 as the sole primary
DELETE FROM public.audit_logs WHERE action = 'video.upload_session_created';
DELETE FROM public.lesson_videos WHERE bunny_video_id IN ('BV17-7', 'BV17-8', 'BV17-OTHER');
SELECT tests.assert(
    (SELECT count(*) = 0 FROM public.lesson_videos
     WHERE status = 'pending_upload' AND deleted_at IS NULL),
    'video17: no pending rows remain');
SELECT tests.assert(
    (SELECT is_primary AND status = 'ready' FROM public.lesson_videos WHERE id = '50000000-0000-0000-0000-000000000001'),
    'video17: fixture v1 restored as primary ready');
RESET ROLE;
RESET "app.current_user_id";

-- =====================================================================
-- Section 18: delete_video_upload_record (EF wrapper, 0017)
-- The create-video-upload-session Edge Function (Phase 5) releases an
-- abandoned/cancelled session through this wrapper: the pending row is
-- hard-deleted (no content was ever committed) so the lesson can start
-- a new session (orphan rule, 0016). Guards: staff only; row exists +
-- not soft-deleted (video_not_found); same lesson (wrong_lesson);
-- still pending_upload (video_not_pending).
-- Fixtures used: l1 (v1 primary ready, v2 ready non-primary), l8
-- (no videos), W = mr_walid ...009, A = student ...001.
-- =====================================================================
RESET ROLE;
RESET "app.current_user_id";

-- (a) happy path: reserve a pending row on l1 (create, non-primary), then
-- release it via the wrapper; the row disappears and the audit trail records
-- the cancellation with the caller actor. The wrapper generates the row id,
-- so it is captured through a temp table (granted to the staff role below,
-- otherwise the SET LOCAL ROLE block cannot INSERT into it).
CREATE TEMP TABLE video18_ids (id uuid);
GRANT ALL ON TABLE video18_ids TO mr_walid;
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
INSERT INTO video18_ids
SELECT id FROM public.create_video_upload_record(
    '40000000-0000-0000-0000-000000000001', 'BV18-1', 'LIB-1', 'T18', 'create', NULL);
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.lesson_videos
     WHERE bunny_video_id = 'BV18-1' AND status = 'pending_upload'),
    'video18: one pending row reserved');
SELECT public.delete_video_upload_record(
    '40000000-0000-0000-0000-000000000001', (SELECT id FROM video18_ids));
SELECT tests.assert(
    (SELECT NOT EXISTS (SELECT 1 FROM public.lesson_videos WHERE bunny_video_id = 'BV18-1')),
    'video18: pending row deleted');
-- the audit trail is admin-only (0009 FORCE RLS), so the audit assert must
-- run outside the mr_walid role block (mirrors Section 17 (e))
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.assert(
    (SELECT EXISTS (SELECT 1 FROM public.audit_logs
      WHERE action = 'video.upload_session_cancelled'
        AND actor_id = '70000000-0000-0000-0000-000000000009'
        AND entity_type = 'lesson_video'
        AND (metadata->>'lesson_id') = '40000000-0000-0000-0000-000000000001')),
    'video18: cancellation audited with caller actor');

-- (b) after the release a NEW session is allowed again (orphan rule no
-- longer fires): second reserve succeeds; then release it
TRUNCATE video18_ids;
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
INSERT INTO video18_ids
SELECT id FROM public.create_video_upload_record(
    '40000000-0000-0000-0000-000000000001', 'BV18-2', 'LIB-1', 'T18-2', 'create', NULL);
SELECT public.delete_video_upload_record(
    '40000000-0000-0000-0000-000000000001', (SELECT id FROM video18_ids));
SELECT tests.assert(
    (SELECT NOT EXISTS (SELECT 1 FROM public.lesson_videos WHERE bunny_video_id = 'BV18-2')),
    'video18: second release ok');

-- (c) guard matrix: student -> permission_denied; GUC-free -> permission_denied;
-- unknown video -> video_not_found; soft-deleted row -> video_not_found;
-- ready row -> video_not_pending; wrong lesson -> wrong_lesson
-- temp fixtures: a soft-deleted pending row on l8 (video_not_found) and a
-- LIVE ready row on l8 (wrong_lesson when asked with l1)
RESET ROLE;
RESET "app.current_user_id";
INSERT INTO public.lesson_videos (id, lesson_id, bunny_video_id, bunny_library_id, title, status, is_primary, sort_order, deleted_at)
VALUES ('50000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000008', 'BV18-DEL', 'LIB-1', 'V18-DEL', 'pending_upload', false, 0, now());
INSERT INTO public.lesson_videos (id, lesson_id, bunny_video_id, bunny_library_id, title, status, is_primary, sort_order, deleted_at)
VALUES ('50000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000008', 'BV18-OTHER', 'LIB-1', 'V18-OTHER', 'ready', true, 1, NULL);
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.delete_video_upload_record(''40000000-0000-0000-0000-000000000008'', ''50000000-0000-0000-0000-000000000020'')',
    'P0001', 'permission_denied');
RESET ROLE;
RESET "app.current_user_id";
SELECT tests.expect_error(
    'SELECT public.delete_video_upload_record(''40000000-0000-0000-0000-000000000008'', ''50000000-0000-0000-0000-000000000020'')',
    'P0001', 'permission_denied');
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error(
    'SELECT public.delete_video_upload_record(''40000000-0000-0000-0000-000000000001'', gen_random_uuid())',
    'P0001', 'video_not_found');
SELECT tests.expect_error(
    'SELECT public.delete_video_upload_record(''40000000-0000-0000-0000-000000000008'', ''50000000-0000-0000-0000-000000000020'')',
    'P0001', 'video_not_found');
SELECT tests.expect_error(
    'SELECT public.delete_video_upload_record(''40000000-0000-0000-0000-000000000001'', ''50000000-0000-0000-0000-000000000021'')',
    'P0001', 'wrong_lesson');
SELECT tests.expect_error(
    'SELECT public.delete_video_upload_record(''40000000-0000-0000-0000-000000000001'', ''50000000-0000-0000-0000-000000000001'')',
    'P0001', 'video_not_pending');
SELECT tests.assert(
    (SELECT count(*) = 2 FROM public.lesson_videos WHERE bunny_video_id IN ('BV18-DEL', 'BV18-OTHER')),
    'video18: denied callers deleted nothing');

-- (d) cleanup: remove the temp fixtures + audit rows
RESET ROLE;
RESET "app.current_user_id";
DELETE FROM public.lesson_videos WHERE bunny_video_id IN ('BV18-DEL', 'BV18-OTHER');
DELETE FROM public.audit_logs WHERE action = 'video.upload_session_cancelled';
SELECT tests.assert(
    (SELECT count(*) = 0 FROM public.lesson_videos
     WHERE status = 'pending_upload' AND deleted_at IS NULL),
    'video18: no pending rows remain');
SELECT tests.assert(
    (SELECT is_primary AND status = 'ready' FROM public.lesson_videos WHERE id = '50000000-0000-0000-0000-000000000001'),
    'video18: fixture v1 restored as primary ready');
RESET ROLE;
RESET "app.current_user_id";



