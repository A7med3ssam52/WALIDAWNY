-- =====================================================================
-- 18_streak.sql — Phase 12 (0085) gentle streak assertions
-- ---------------------------------------------------------------------
-- Covers:
--   * grants (authenticated yes / anon no; staff-only list gate)
--   * counting (consecutive days, gap reset, today-pending, Cairo days)
--   * freeze rules (cover, double-use, perfect week, wont-help)
--   * voucher auto-claim (once ever + notification) and expiry states
--   * redeem with p_use_voucher (fee -> 0, consume, errors)
--   * staff board (list_student_streaks) + student denial
-- Fixtures use 5d000000-... ids and are removed at the end. Timestamps
-- are built at Cairo noon so the Africa/Cairo day mapping is exact.
-- =====================================================================

-- Cairo noon N days ago, as timestamptz.
CREATE OR REPLACE FUNCTION tests.cairo_noon_ago(n int)
RETURNS timestamptz
LANGUAGE sql STABLE
AS $$ SELECT (((now() AT TIME ZONE 'Africa/Cairo')::date - n) + time '12:00') AT TIME ZONE 'Africa/Cairo' $$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.get_my_streak()', 'EXECUTE'),
    'g: get_my_streak executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.get_my_streak()', 'EXECUTE'),
    'g: get_my_streak NOT executable by anon');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.use_streak_freeze()', 'EXECUTE'),
    'g: use_streak_freeze executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.use_streak_freeze()', 'EXECUTE'),
    'g: use_streak_freeze NOT executable by anon');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.list_student_streaks()', 'EXECUTE'),
    'g: list_student_streaks executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.list_student_streaks()', 'EXECUTE'),
    'g: list_student_streaks NOT executable by anon');

-- Explicit anon lockdown (0086): the hosted platform auto-grants new
-- functions to anon (role default privileges), which REVOKE FROM PUBLIC
-- alone does not remove. These anchors pin the 0086 fix.
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.streak_active_days(uuid)', 'EXECUTE'),
    'g: anon cannot exec internal streak_active_days (0086)');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.streak_state(uuid)', 'EXECUTE'),
    'g: anon cannot exec internal streak_state (0086)');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.redeem_unit_code(text, boolean)', 'EXECUTE'),
    'g: anon cannot exec redeem_unit_code(text, boolean) (0086)');

-- staff gate on the board
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT count(*) FROM public.list_student_streaks()',
    'P0001', 'access_denied');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Fixtures: own unit + lessons + pricing + code (streak domain)
-- ---------------------------------------------------------------------
INSERT INTO public.units (id, grade_id, name, sort_order, status)
VALUES ('5d000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'TEST-STREAK-U1', 90, 'published');
INSERT INTO public.unit_pricing (id, unit_id, base_price, platform_fee, is_active)
VALUES ('5d000000-0000-0000-0000-000000000002', '5d000000-0000-0000-0000-000000000001', 200, 50, true);
INSERT INTO public.unit_codes (id, code, unit_pricing_id, status, created_by)
VALUES ('5d000000-0000-0000-0000-000000000003', 'WLDN-STREAK0001', '5d000000-0000-0000-0000-000000000002', 'available', '70000000-0000-0000-0000-000000000009');
INSERT INTO public.lessons (id, unit_id, title, sort_order, status)
SELECT ('5d000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       '5d000000-0000-0000-0000-000000000001', 'TEST-STREAK-L' || g, g, 'published'
FROM generate_series(1, 50) g;

-- ---------------------------------------------------------------------
-- Counting: E = 3 consecutive days (today, yesterday, day-2).
-- (E has no progress rows from other suites; A/D carry same-day rows
-- from 02_roles, so they are used only where assertions tolerate them.)
-- ---------------------------------------------------------------------
INSERT INTO public.progress (student_id, lesson_id, position_seconds, percent_completed, is_completed, updated_at)
SELECT '70000000-0000-0000-0000-000000000005',
       ('5d000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       120, 50, false, tests.cairo_noon_ago(g - 1)
FROM generate_series(1, 3) g;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000005';
SET LOCAL ROLE student;
SELECT tests.assert(
    ((SELECT public.get_my_streak() ->> 'current_days')::int = 3),
    's: E has a 3-day streak');
SELECT tests.assert(
    ((SELECT public.get_my_streak() ->> 'flame_stage') = 'spark'),
    's: 3 days => spark stage');
SELECT tests.assert(
    ((SELECT public.get_my_streak() ->> 'freeze_available')::boolean IS TRUE),
    's: freeze available on a fresh week');
RESET ROLE;

-- percent = 0 never counts (anti-gaming: opening without watching).
-- F is active with no grade: isolated from every other streak fixture.
INSERT INTO public.progress (student_id, lesson_id, position_seconds, percent_completed, is_completed, updated_at)
VALUES ('70000000-0000-0000-0000-000000000006',
        '5d000000-0000-0000-0000-000000000004', 0, 0, false, tests.cairo_noon_ago(0));
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000006';
SET LOCAL ROLE student;
SELECT tests.assert(
    ((SELECT public.get_my_streak() ->> 'current_days')::int = 0),
    's: percent=0 activity does not start a streak');
RESET ROLE;

-- Gap: active only 5 and 6 days ago => reset to 0
INSERT INTO public.progress (student_id, lesson_id, position_seconds, percent_completed, is_completed, updated_at)
VALUES ('70000000-0000-0000-0000-000000000008',
        '5d000000-0000-0000-0000-000000000005', 60, 30, false, tests.cairo_noon_ago(5)),
       ('70000000-0000-0000-0000-000000000008',
        '5d000000-0000-0000-0000-000000000006', 60, 30, false, tests.cairo_noon_ago(6));
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000008';
SET LOCAL ROLE student;
SELECT tests.assert(
    ((SELECT public.get_my_streak() ->> 'current_days')::int = 0),
    's: 2+ day gap resets the streak');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Freeze: G misses today, active yesterday + day-2 => freeze covers today.
-- (G is row-free from other suites and needs no purchase for freezing.)
-- ---------------------------------------------------------------------
INSERT INTO public.progress (student_id, lesson_id, position_seconds, percent_completed, is_completed, updated_at)
VALUES ('70000000-0000-0000-0000-000000000007',
        '5d000000-0000-0000-0000-000000000007', 90, 40, false, tests.cairo_noon_ago(1)),
       ('70000000-0000-0000-0000-000000000007',
        '5d000000-0000-0000-0000-000000000008', 90, 40, false, tests.cairo_noon_ago(2));
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000007';
SET LOCAL ROLE student;
SELECT tests.assert(
    ((SELECT public.get_my_streak() ->> 'current_days')::int = 2),
    's: G streak alive at 2 pending today');
SELECT tests.assert(
    ((SELECT public.use_streak_freeze()) = ((now() AT TIME ZONE 'Africa/Cairo')::date)),
    's: freeze covers today (most recent missed day)');
SELECT tests.assert(
    ((SELECT public.get_my_streak() ->> 'current_days')::int = 3),
    's: frozen today extends the streak to 3');
SELECT tests.expect_error(
    'SELECT public.use_streak_freeze()',
    'P0001', 'freeze_already_used');
RESET ROLE;

-- Perfect week: E active every day of the current week => no_missed_day
INSERT INTO public.progress (student_id, lesson_id, position_seconds, percent_completed, is_completed, updated_at)
SELECT '70000000-0000-0000-0000-000000000005',
       ('5d000000-0000-0000-0000-' || lpad((g + 10)::text, 12, '0'))::uuid,
       100, 60, false,
       (((now() AT TIME ZONE 'Africa/Cairo')::date
         - ((EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Africa/Cairo')::date)::int + 1) % 7) + g)
        + time '12:00') AT TIME ZONE 'Africa/Cairo'
FROM generate_series(0, 6) g
WHERE (((now() AT TIME ZONE 'Africa/Cairo')::date
        - ((EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Africa/Cairo')::date)::int + 1) % 7) + g)
       <= ((now() AT TIME ZONE 'Africa/Cairo')::date));
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000005';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.use_streak_freeze()',
    'P0001', 'no_missed_day');
RESET ROLE;

-- Dead streak: H active only 5 days ago => freeze would fake 1 day
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000008';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.use_streak_freeze()',
    'P0001', 'freeze_wont_help');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Voucher: fabricate a 30-day run for A, claim once, notify once
-- ---------------------------------------------------------------------
INSERT INTO public.progress (student_id, lesson_id, position_seconds, percent_completed, is_completed, updated_at)
SELECT '70000000-0000-0000-0000-000000000001',
       ('5d000000-0000-0000-0000-' || lpad((g + 20)::text, 12, '0'))::uuid,
       200, 80, true, tests.cairo_noon_ago(g)
FROM generate_series(1, 29) g;
-- A now has 30 consecutive Cairo days (0..29): day 0 from the 02_roles
-- fixture row, days 1..29 from the rows above.
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    ((SELECT public.get_my_streak() ->> 'current_days')::int >= 30),
    's: A reaches a 30-day streak');
SELECT tests.assert(
    ((SELECT public.get_my_streak() #>> '{voucher,status}') = 'granted'),
    's: voucher auto-claimed at 30 days');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.streak_vouchers WHERE student_id = ''70000000-0000-0000-0000-000000000001''',
    1, 's: exactly one voucher row (once ever)');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE user_id = ''70000000-0000-0000-0000-000000000001'' AND type = ''voucher_granted''',
    1, 's: exactly one voucher notification');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Redeem with voucher: G (grade1, no purchase) uses the streak code
-- ---------------------------------------------------------------------
-- G needs a voucher: grant directly (mirrors a 30-day claim)
INSERT INTO public.streak_vouchers (student_id)
VALUES ('70000000-0000-0000-0000-000000000007');
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000007';
SET LOCAL ROLE student;
SELECT tests.assert(
    ((SELECT public.redeem_unit_code('WLDN-STREAK0001', true)).platform_fee = 0),
    's: voucher redeem zeroes the platform fee');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.unit_purchases WHERE student_id = ''70000000-0000-0000-0000-000000000007'' AND platform_fee = 0 AND total_price = 200',
    1, 's: purchase recorded with base only (200, fee 0)');
SELECT tests.assert(
    ((SELECT used_for_unit_id FROM public.streak_vouchers WHERE student_id = '70000000-0000-0000-0000-000000000007') = '5d000000-0000-0000-0000-000000000001'),
    's: voucher consumed against the streak unit');
RESET ROLE;

-- Second redeem on another unit with the spent voucher => already_used.
-- (fresh unit + code for G)
INSERT INTO public.units (id, grade_id, name, sort_order, status)
VALUES ('5d000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 'TEST-STREAK-U2', 91, 'published');
INSERT INTO public.unit_pricing (id, unit_id, base_price, platform_fee, is_active)
VALUES ('5d000000-0000-0000-0000-000000000011', '5d000000-0000-0000-0000-000000000010', 200, 50, true);
INSERT INTO public.unit_codes (id, code, unit_pricing_id, status, created_by)
VALUES ('5d000000-0000-0000-0000-000000000012', 'WLDN-STREAK0002', '5d000000-0000-0000-0000-000000000011', 'available', '70000000-0000-0000-0000-000000000009');
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000007';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.redeem_unit_code(''WLDN-STREAK0002'', true)',
    'P0001', 'voucher_already_used');
-- plain redeem (no voucher) still charges the fee
SELECT tests.assert(
    ((SELECT public.redeem_unit_code('WLDN-STREAK0002', false)).platform_fee = 50),
    's: plain redeem keeps the platform fee');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Staff board
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE authenticated;
SELECT tests.assert(
    ((SELECT current_days FROM public.list_student_streaks() WHERE student_id = '70000000-0000-0000-0000-000000000001') >= 30),
    's: staff board shows A at 30+ days');
SELECT tests.assert(
    ((SELECT voucher_status FROM public.list_student_streaks() WHERE student_id = '70000000-0000-0000-0000-000000000001') = 'granted'),
    's: staff board shows A voucher granted');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Cleanup (streak domain only)
-- ---------------------------------------------------------------------
DELETE FROM public.unit_purchases WHERE unit_id IN ('5d000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000010');
DELETE FROM public.unit_codes WHERE id IN ('5d000000-0000-0000-0000-000000000003', '5d000000-0000-0000-0000-000000000012');
DELETE FROM public.unit_pricing WHERE id IN ('5d000000-0000-0000-0000-000000000002', '5d000000-0000-0000-0000-000000000011');
DELETE FROM public.progress WHERE lesson_id::text LIKE '5d000000-0000-0000-0000-%';
DELETE FROM public.lessons WHERE id::text LIKE '5d000000-0000-0000-0000-%';
DELETE FROM public.units WHERE id::text LIKE '5d000000-0000-0000-0000-%';
DELETE FROM public.streak_freezes WHERE student_id::text LIKE '70000000-0000-0000-0000-%';
DELETE FROM public.streak_vouchers WHERE student_id::text LIKE '70000000-0000-0000-0000-%';
DELETE FROM public.notifications WHERE user_id::text LIKE '70000000-0000-0000-0000-%' AND type = 'voucher_granted';
DELETE FROM public.audit_logs WHERE entity_type IN ('streak_freezes', 'streak_vouchers');
DROP FUNCTION IF EXISTS tests.cairo_noon_ago(int);
