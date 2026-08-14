-- =====================================================================
-- 06_dashboard_stats.sql -- get_dashboard_stats() assertions
-- ---------------------------------------------------------------------
-- 0018 get_dashboard_stats: staff-only, JSON shape, aggregate correctness
-- on self-contained fixtures, grant posture (SECURITY.md 8.2).
-- Runs last in filename order; cleans up everything it creates.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Self-contained fixtures (unique IDs, removed at the end)
-- ---------------------------------------------------------------------
INSERT INTO public.grades (id, name, sort_order)
VALUES ('80000000-0000-0000-0000-000000000001', 'Stats Grade', 1);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES ('80000000-0000-0000-0000-000000000002',
        'stats-student@walid-platform.local',
        '{"full_name":"Stats Student","phone":"+201001000081","guardian_phone":"+201001000081","address":"Cairo","grade_id":"80000000-0000-0000-0000-000000000001"}',
        now(), now());

-- handle_new_user fires on the auth.users insert above and creates the
-- profile row with the meta grade_id (0027); keep the explicit assign
-- so the fixture stays self-contained.
UPDATE public.profiles SET grade_id = '80000000-0000-0000-0000-000000000001'
WHERE id = '80000000-0000-0000-0000-000000000002';

INSERT INTO public.pricing_plans (id, grade_id, duration_days, base_price, platform_fee, total_price)
VALUES ('80000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000001',
        30, 100, 10, 110);

INSERT INTO public.subscriptions (id, student_id, pricing_plan_id, base_price, platform_fee, total_price, status, expires_at)
VALUES ('80000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000002',
        '80000000-0000-0000-0000-000000000003', 100, 10, 110, 'active', now() + interval '3 days');

INSERT INTO public.units (id, grade_id, name, sort_order, status)
VALUES ('80000000-0000-0000-0000-000000000005', '80000000-0000-0000-0000-000000000001', 'Stats Unit', 1, 'published');

INSERT INTO public.lessons (id, unit_id, title, sort_order, status, published_at)
VALUES ('80000000-0000-0000-0000-000000000006', '80000000-0000-0000-0000-000000000005', 'Stats Lesson', 1, 'published', now());

-- ---------------------------------------------------------------------
-- Authorization: students cannot call; staff can
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error('SELECT public.get_dashboard_stats()', 'P0001', 'permission_denied');
RESET ROLE;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.assert((SELECT public.get_dashboard_stats() IS NOT NULL), 'd: admin can call');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Aggregate correctness against the fixtures (>= style: earlier suites
-- persist their own data, so exact totals are not asserted)
-- ---------------------------------------------------------------------
SELECT tests.assert(
    ((SELECT public.get_dashboard_stats()::jsonb #>> '{students,total}')::int) >= 1,
    'd: students.total >= 1');
SELECT tests.assert(
    ((SELECT public.get_dashboard_stats()::jsonb #>> '{subscriptions,active}')::int) >= 1,
    'd: subscriptions.active >= 1');
SELECT tests.assert(
    ((SELECT public.get_dashboard_stats()::jsonb #>> '{subscriptions,expiring_7d}')::int) >= 1,
    'd: subscriptions.expiring_7d flags the 3-day subscription');
SELECT tests.assert(
    ((SELECT public.get_dashboard_stats()::jsonb #>> '{subscriptions,revenue_total}')::numeric) >= 110,
    'd: revenue_total includes the fixture total_price');
SELECT tests.assert(
    ((SELECT public.get_dashboard_stats()::jsonb #>> '{content,published_lessons}')::int) >= 1,
    'd: content.published_lessons >= 1');

SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
            (SELECT public.get_dashboard_stats()::jsonb -> 'by_grade')) e
        WHERE e ->> 'grade_name' = 'Stats Grade'
          AND (e ->> 'students')::int = 1
          AND (e ->> 'active_subscribers')::int = 1)),
    'd: by_grade row aggregates students + subscribers');

SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
            (SELECT public.get_dashboard_stats()::jsonb -> 'recent_subscriptions')) e
        WHERE e ->> 'student_name' = 'Stats Student'
          AND (e ->> 'duration_days')::int = 30
          AND (e ->> 'total_price')::numeric = 110)),
    'd: recent_subscriptions carries plan + price snapshot');

SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
            (SELECT public.get_dashboard_stats()::jsonb -> 'upcoming_expirations')) e
        WHERE e ->> 'student_name' = 'Stats Student')),
    'd: upcoming_expirations lists the 3-day subscription');

-- ---------------------------------------------------------------------
-- Grant posture (SECURITY.md 8.2): granted to authenticated, locked
-- from anon
-- ---------------------------------------------------------------------
SELECT tests.assert(has_function_privilege('authenticated', 'public.get_dashboard_stats()', 'EXECUTE'),
    'g: get_dashboard_stats executable by authenticated');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.get_dashboard_stats()', 'EXECUTE'),
    'g: get_dashboard_stats NOT executable by anon');

-- ---------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------
DELETE FROM public.subscriptions      WHERE student_id = '80000000-0000-0000-0000-000000000002';
DELETE FROM public.pricing_plans      WHERE id = '80000000-0000-0000-0000-000000000003';
DELETE FROM public.lessons            WHERE id = '80000000-0000-0000-0000-000000000006';
DELETE FROM public.units              WHERE id = '80000000-0000-0000-0000-000000000005';
DELETE FROM public.profiles           WHERE id = '80000000-0000-0000-0000-000000000002';
DELETE FROM auth.users                WHERE id = '80000000-0000-0000-0000-000000000002';
DELETE FROM public.grades             WHERE id = '80000000-0000-0000-0000-000000000001';
