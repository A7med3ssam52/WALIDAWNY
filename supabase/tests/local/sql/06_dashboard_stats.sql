-- =====================================================================
-- 06_dashboard_stats.sql -- get_dashboard_stats() assertions
-- ---------------------------------------------------------------------
-- 0028 get_dashboard_stats: staff-only, JSON shape, aggregate correctness
-- on self-contained fixtures, grant posture (SECURITY.md 8.2).
-- Runs after 05 in filename order; cleans up everything it creates.
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

INSERT INTO public.units (id, grade_id, name, sort_order, status)
VALUES ('80000000-0000-0000-0000-000000000005', '80000000-0000-0000-0000-000000000001', 'Stats Unit', 1, 'published');

INSERT INTO public.unit_pricing (id, unit_id, base_price, platform_fee, is_active)
VALUES ('80000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000005', 1000, 100, true);

INSERT INTO public.unit_purchases (id, student_id, unit_id, base_price, platform_fee, status)
VALUES ('80000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000002',
        '80000000-0000-0000-0000-000000000005', 1000, 100, 'active');

-- Staff member in the same grade: must NEVER be counted as a student.
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES ('80000000-0000-0000-0000-000000000006',
        'stats-staff@walid-platform.local',
        '{"full_name":"Stats Staff","phone":"+201001000082","guardian_phone":"+201001000082","address":"Cairo","grade_id":"80000000-0000-0000-0000-000000000001"}',
        now(), now());
UPDATE public.profiles SET role = 'mr_walid', grade_id = '80000000-0000-0000-0000-000000000001'
WHERE id = '80000000-0000-0000-0000-000000000006';

-- ---------------------------------------------------------------------
-- Authorization: students cannot call; staff (admin, mr_walid, teacher) can
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error('SELECT public.get_dashboard_stats()', 'P0001', 'permission_denied');
RESET ROLE;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.assert((SELECT public.get_dashboard_stats() IS NOT NULL), 'd: admin can call');
RESET ROLE;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT tests.assert((SELECT public.get_dashboard_stats() IS NOT NULL), 'd: teacher can call');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Aggregate correctness against the fixtures (>= style: earlier suites
-- persist their own data, so exact totals are not asserted)
-- ---------------------------------------------------------------------
SELECT tests.assert(
    ((SELECT public.get_dashboard_stats()::jsonb #>> '{students,total}')::int) >= 1,
    'd: students.total >= 1');
SELECT tests.assert(
    ((SELECT public.get_dashboard_stats()::jsonb #>> '{students,total}')::int) =
    (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND role = 'student'),
    'd: students.total counts student-role profiles only (staff excluded)');
SELECT tests.assert(
    ((SELECT public.get_dashboard_stats()::jsonb #>> '{students,active}')::int) =
    (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'active' AND role = 'student'),
    'd: students.active counts active student-role profiles only (staff excluded)');
SELECT tests.assert(
    ((SELECT public.get_dashboard_stats()::jsonb #>> '{purchases,total}')::int) >= 1,
    'd: purchases.total >= 1');
SELECT tests.assert(
    ((SELECT public.get_dashboard_stats()::jsonb #>> '{purchases,total_revenue}')::numeric) >= 1100,
    'd: purchases.total_revenue >= 1100');
SELECT tests.assert(
    ((SELECT public.get_dashboard_stats()::jsonb #>> '{content,published_lessons}')::int) >= 1,
    'd: content.published_lessons >= 1');

SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
            (SELECT public.get_dashboard_stats()::jsonb -> 'by_grade')) e
        WHERE e ->> 'grade_name' = 'Stats Grade'
          AND (e ->> 'students')::int = 1
          AND (e ->> 'purchases')::int = 1
          AND (e ->> 'revenue')::numeric = 1100)),
    'd: by_grade row aggregates students + purchases');

SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
            (SELECT public.get_dashboard_stats()::jsonb -> 'top_units')) e
        WHERE e ->> 'unit_name' = 'Stats Unit'
          AND (e ->> 'purchases')::int = 1
          AND (e ->> 'revenue')::numeric = 1100)),
    'd: top_units carries the stats unit');

SELECT tests.assert(
    (SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
            (SELECT public.get_dashboard_stats()::jsonb -> 'recent_purchases')) e
        WHERE e ->> 'student_name' = 'Stats Student'
          AND e ->> 'unit_name' = 'Stats Unit'
          AND (e ->> 'total_price')::numeric = 1100)),
    'd: recent_purchases carries purchase + price snapshot');

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
DELETE FROM public.unit_purchases WHERE id = '80000000-0000-0000-0000-000000000004';
DELETE FROM public.unit_pricing   WHERE id = '80000000-0000-0000-0000-000000000003';
DELETE FROM public.units          WHERE id = '80000000-0000-0000-0000-000000000005';
DELETE FROM public.profiles       WHERE id IN ('80000000-0000-0000-0000-000000000002',
                                               '80000000-0000-0000-0000-000000000006');
DELETE FROM auth.users            WHERE id IN ('80000000-0000-0000-0000-000000000002',
                                               '80000000-0000-0000-0000-000000000006');
DELETE FROM public.grades         WHERE id = '80000000-0000-0000-0000-000000000001';

