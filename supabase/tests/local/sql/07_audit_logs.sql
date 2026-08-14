-- =====================================================================
-- 07_audit_logs.sql -- list_audit_logs / count_audit_logs assertions
-- ---------------------------------------------------------------------
-- 0019: admin-only audit reads, filter correctness, pagination, grants.
-- Self-contained fixtures (unique IDs, removed at the end).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fixtures: an admin actor + three audit rows
-- ---------------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES ('90000000-0000-0000-0000-0000000000aa',
        'audit-admin@walid-platform.local',
        '{"full_name":"Audit Admin","phone":"+201001000091","guardian_phone":"+201001000091","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}',
        now(), now());
-- role promoted directly (audit_logs.actor_role is a snapshot column)
UPDATE public.profiles SET role = 'admin'
WHERE id = '90000000-0000-0000-0000-0000000000aa';

INSERT INTO public.audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, metadata, ip_address, created_at)
VALUES ('90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-0000000000aa', 'admin',
        'grade.create', 'grade', NULL, '{"name":"Audit Grade"}'::jsonb, '127.0.0.1', now() - interval '2 days'),
       ('90000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-0000000000aa', 'admin',
        'user.role_change', 'profile', NULL, '{"role":"mr_walid"}'::jsonb, '127.0.0.1', now() - interval '1 day'),
       ('90000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-0000000000aa', 'admin',
        'pricing.delete', 'pricing_plan', NULL, '{}'::jsonb, '127.0.0.1', now());

-- ---------------------------------------------------------------------
-- Authorization: only admins
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error('SELECT public.list_audit_logs()', 'P0001', 'permission_denied');
RESET ROLE;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error('SELECT public.list_audit_logs()', 'P0001', 'permission_denied');
SELECT tests.expect_error('SELECT public.count_audit_logs()', 'P0001', 'permission_denied');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Listing + filters (as admin)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '90000000-0000-0000-0000-0000000000aa';
SET LOCAL ROLE admin;

SELECT tests.assert(
    (SELECT count(*) >= 3 FROM public.list_audit_logs()),
    'a: list_audit_logs returns the fixture rows (defaults to page of 50)');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_audit_logs(p_actor_id => ''90000000-0000-0000-0000-0000000000aa'', p_action => ''grade'')', 1,
    'a: action substring filter matches grade.create only');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_audit_logs(p_actor_id => ''90000000-0000-0000-0000-0000000000aa'', p_entity_type => ''profile'')', 1,
    'a: entity_type filter matches user.role_change only');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_audit_logs(p_actor_id => ''90000000-0000-0000-0000-0000000000aa'', p_from => now() - interval ''12 hours'')', 1,
    'a: from-range filter keeps only the newest row');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_audit_logs(p_actor_id => ''90000000-0000-0000-0000-0000000000aa'')', 3,
    'a: actor filter matches all fixture rows');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_audit_logs(p_actor_id => ''90000000-0000-0000-0000-0000000000aa'', p_to => now() - interval ''12 hours'')', 2,
    'a: to-range filter keeps the two older rows');

-- newest-first ordering
SELECT tests.assert(
    (SELECT action = 'pricing.delete'
     FROM public.list_audit_logs(p_actor_id => '90000000-0000-0000-0000-0000000000aa') LIMIT 1),
    'a: newest row comes first');

-- actor_name join present
SELECT tests.assert(
    (SELECT actor_name = 'Audit Admin'
     FROM public.list_audit_logs(p_actor_id => '90000000-0000-0000-0000-0000000000aa') LIMIT 1),
    'a: actor_name resolved from profiles');

-- pagination: limit 2 -> 2 rows, offset 2 -> 1 row
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_audit_logs(p_actor_id => ''90000000-0000-0000-0000-0000000000aa'', p_limit => 2)', 2,
    'a: limit clamps page size');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_audit_logs(p_actor_id => ''90000000-0000-0000-0000-0000000000aa'', p_limit => 2, p_offset => 2)', 1,
    'a: offset paginates');

-- count with filters
SELECT tests.expect_count(
    'SELECT public.count_audit_logs(p_actor_id => ''90000000-0000-0000-0000-0000000000aa'', p_entity_type => ''grade'')::int', 1,
    'a: count_audit_logs filters identically');
SELECT tests.expect_count(
    'SELECT public.count_audit_logs(p_actor_id => ''90000000-0000-0000-0000-0000000000aa'')::int', 3,
    'a: count_audit_logs totals the actor''s rows');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Grant posture (SECURITY.md 8.2)
-- ---------------------------------------------------------------------
SELECT tests.assert(has_function_privilege('authenticated', 'public.list_audit_logs(timestamptz, timestamptz, text, text, uuid, integer, integer)', 'EXECUTE'),
    'g: list_audit_logs executable by authenticated');
SELECT tests.assert(has_function_privilege('authenticated', 'public.count_audit_logs(timestamptz, timestamptz, text, text, uuid)', 'EXECUTE'),
    'g: count_audit_logs executable by authenticated');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.list_audit_logs(timestamptz, timestamptz, text, text, uuid, integer, integer)', 'EXECUTE'),
    'g: list_audit_logs NOT executable by anon');

-- ---------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------
-- audit_trigger records the actor for profile deletions too; without
-- RESET the last SET LOCAL user (the deleted fixture admin itself) would
-- violate audit_logs_actor_id_fkey. NULL actor = system action, FK-SET-NULL.
RESET "app.current_user_id";
DELETE FROM public.audit_logs WHERE id IN ('90000000-0000-0000-0000-000000000001',
                                           '90000000-0000-0000-0000-000000000002',
                                           '90000000-0000-0000-0000-000000000003');
DELETE FROM public.profiles WHERE id = '90000000-0000-0000-0000-0000000000aa';
DELETE FROM auth.users  WHERE id = '90000000-0000-0000-0000-0000000000aa';
