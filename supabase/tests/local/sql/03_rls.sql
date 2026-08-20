-- =====================================================================
-- 03_rls.sql — RLS role-simulation matrix (TESTING.md section 4)
-- Approach: SET ROLE + auth-uid injection via app.current_user_id.
-- Allowed operations are asserted by row counts; denied operations are
-- asserted as errors (SQLSTATE 42501) or 0 rows, per policy shape.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fixture additions for this suite (run as postgres)
-- ---------------------------------------------------------------------
INSERT INTO public.notifications (id, user_id, type, title, body, dedup_key, is_read, entity_type, entity_id)
VALUES
    ('a0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'system', 'TEST-NA', NULL, NULL, false, 'unit_purchases', NULL),
    ('a0000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 'system', 'TEST-NB', NULL, NULL, false, 'unit_purchases', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
VALUES ('70000000-0000-0000-0000-0000000000ee', 'test-iap@walid.test', 'x',
        '{"full_name":"IAP","phone":"+201001000088","guardian_phone":"+201001000088","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}')
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.profiles WHERE id = '70000000-0000-0000-0000-0000000000ee';

-- =====================================================================
-- Section 1: active student A
-- =====================================================================
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;

-- profiles
SELECT tests.expect_count('SELECT count(*) FROM public.profiles WHERE id = ''70000000-0000-0000-0000-000000000001''', 1, 'A: own profile SELECT');
SELECT tests.expect_count('SELECT count(*) FROM public.profiles WHERE id = ''70000000-0000-0000-0000-000000000004''', 0, 'A: other student profile hidden');
-- list_trash is granted to authenticated but must be staff-gated in-body
-- (CRITICAL round-2 fix): students may not enumerate soft-deleted profiles
SELECT tests.expect_error('SELECT * FROM public.list_trash()', 'P0001', 'permission_denied');
SELECT tests.expect_rows('UPDATE public.profiles SET full_name = ''A2'' WHERE id = ''70000000-0000-0000-0000-000000000001''', 1, 'A: self-update 4-column path allowed');
SELECT tests.expect_error('UPDATE public.profiles SET role = ''admin'' WHERE id = ''70000000-0000-0000-0000-000000000001''', '42501', 'violates row-level security policy');
SELECT tests.expect_error('UPDATE public.profiles SET status = ''disabled'' WHERE id = ''70000000-0000-0000-0000-000000000001''', '42501', 'violates row-level security policy');
SELECT tests.expect_error('UPDATE public.profiles SET grade_id = ''10000000-0000-0000-0000-000000000002'' WHERE id = ''70000000-0000-0000-0000-000000000001''', '42501', 'violates row-level security policy');
SELECT tests.expect_rows('UPDATE public.profiles SET full_name = ''B2'' WHERE id = ''70000000-0000-0000-0000-000000000002''', 0, 'A: cannot touch another profile');
SELECT tests.expect_error('INSERT INTO public.profiles (id, full_name, phone, guardian_phone, address) VALUES (gen_random_uuid(), ''X'', ''+201001000077'', ''+201001000077'', ''Cairo'')', '42501', 'violates row-level security policy');
SELECT tests.expect_rows('DELETE FROM public.profiles WHERE id = ''70000000-0000-0000-0000-000000000001''', 0, 'A: DELETE profiles denied');

-- grades (binding B8: students see active, non-deleted only; 0027 seeded
-- 3 more active grades, so 2 fixture + 3 seeded = 5)
SELECT tests.expect_count('SELECT count(*) FROM public.grades', 5, 'A: grades = active non-deleted only (B8)');

-- unit_pricing (active + own-grade published unit only: A is grade1 -> pu1)
SELECT tests.expect_count('SELECT count(*) FROM public.unit_pricing', 1, 'A: unit_pricing = own-grade active only (pu1)');

-- unit_codes: students never see raw codes
SELECT tests.expect_count('SELECT count(*) FROM public.unit_codes', 0, 'A: no raw codes visible');
SELECT tests.expect_error('INSERT INTO public.unit_codes (code, unit_pricing_id, created_by) VALUES (''WLDN-INSERTCODE1'', ''20000000-0000-0000-0000-000000000001'', ''70000000-0000-0000-0000-000000000001'')', '42501', 'violates row-level security policy');

-- unit_purchases: own SELECT; RPC-only writes (no DML policies)
SELECT tests.expect_count('SELECT count(*) FROM public.unit_purchases', 1, 'A: own purchases visible');
SELECT tests.expect_count('SELECT count(*) FROM public.unit_purchases WHERE student_id = ''70000000-0000-0000-0000-000000000004''', 0, 'A: others purchases hidden');
SELECT tests.expect_error('INSERT INTO public.unit_purchases (student_id, unit_id, base_price, platform_fee) VALUES (''70000000-0000-0000-0000-000000000001'', ''30000000-0000-0000-0000-000000000001'', 1, 0)', '42501', 'violates row-level security policy');
SELECT tests.expect_rows('UPDATE public.unit_purchases SET status = ''void'' WHERE student_id = ''70000000-0000-0000-0000-000000000001''', 0, 'A: UPDATE purchases denied (RPC-only)');
SELECT tests.expect_rows('DELETE FROM public.unit_purchases WHERE student_id = ''70000000-0000-0000-0000-000000000001''', 0, 'A: DELETE purchases denied (RPC-only)');

-- units / lessons: published + own grade + non-deleted
SELECT tests.expect_count('SELECT count(*) FROM public.units', 1, 'A: units = published own-grade only');
SELECT tests.expect_count('SELECT count(*) FROM public.lessons', 3, 'A: lessons = published own-grade chain only');

-- lesson_videos: EVERY ready non-deleted video of accessible lessons
-- (0042: the is_primary condition was removed - multi-video feature; v1
-- primary ready + v2 ready non-primary visible, v3 processing hidden)
SELECT tests.expect_count('SELECT count(*) FROM public.lesson_videos', 2, 'A: videos = all ready of accessible lessons (0042)');
SELECT tests.expect_error('INSERT INTO public.lesson_videos (lesson_id, bunny_video_id, bunny_library_id) VALUES (''40000000-0000-0000-0000-000000000001'', ''BV-INSERT'', ''LIB-1'')', '42501', 'violates row-level security policy');

-- lesson_pdfs: only primary + ready of accessible lessons
SELECT tests.expect_count('SELECT count(*) FROM public.lesson_pdfs', 2, 'A: pdfs = primary ready only');

-- progress: own SELECT; RPC-only DML
SELECT tests.expect_count('SELECT count(*) FROM public.progress', 1, 'A: own progress visible');
SELECT tests.expect_count('SELECT count(*) FROM public.progress WHERE student_id = ''70000000-0000-0000-0000-000000000004''', 0, 'A: others progress hidden');
SELECT tests.expect_error('INSERT INTO public.progress (student_id, lesson_id, position_seconds, percent_completed) VALUES (''70000000-0000-0000-0000-000000000001'', ''40000000-0000-0000-0000-000000000009'', 5, 10)', '42501', 'violates row-level security policy');
SELECT tests.expect_rows('UPDATE public.progress SET percent_completed = 100 WHERE student_id = ''70000000-0000-0000-0000-000000000001''', 0, 'A: UPDATE progress denied (RPC-only)');
SELECT tests.expect_rows('DELETE FROM public.progress WHERE student_id = ''70000000-0000-0000-0000-000000000001''', 0, 'A: DELETE progress denied (RPC-only)');

-- notifications: own SELECT; B2 immutability
SELECT tests.expect_count('SELECT count(*) FROM public.notifications', 1, 'A: own notifications visible');
SELECT tests.expect_count('SELECT count(*) FROM public.notifications WHERE user_id = ''70000000-0000-0000-0000-000000000002''', 0, 'A: others notifications hidden');
SELECT tests.expect_error('UPDATE public.notifications SET is_read = true WHERE id = ''a0000000-0000-0000-0000-000000000001''', '42501', 'permission denied for table notifications');
SELECT tests.expect_error('UPDATE public.notifications SET is_read = true, title = ''x'' WHERE id = ''a0000000-0000-0000-0000-000000000001''', '42501', 'permission denied for table notifications');
SELECT tests.expect_error('UPDATE public.notifications SET title = ''x'' WHERE id = ''a0000000-0000-0000-0000-000000000001''', '42501', 'permission denied for table notifications');
SELECT tests.expect_error('DELETE FROM public.notifications WHERE id = ''a0000000-0000-0000-0000-000000000001''', '42501', 'permission denied for table notifications');
SELECT tests.expect_error('INSERT INTO public.notifications (user_id, type, title) VALUES (''70000000-0000-0000-0000-000000000001'', ''system'', ''x'')', '42501', 'permission denied for table notifications');

-- audit_logs: never visible to students
SELECT tests.expect_count('SELECT count(*) FROM public.audit_logs', 0, 'A: audit hidden');
SELECT tests.expect_error('INSERT INTO public.audit_logs (action, entity_type) VALUES (''x'',''y'')', '42501', 'violates row-level security policy');

-- app_settings: hidden from students
SELECT tests.expect_count('SELECT count(*) FROM public.app_settings', 0, 'A: app_settings hidden');
SELECT tests.expect_error('INSERT INTO public.app_settings (key, value) VALUES (''x'',''1'')', '42501', 'violates row-level security policy');

-- content DML as student: denied
SELECT tests.expect_error('INSERT INTO public.units (grade_id, name) VALUES (''10000000-0000-0000-0000-000000000001'', ''X'')', '42501', 'violates row-level security policy');
SELECT tests.expect_rows('UPDATE public.lessons SET title = ''x'' WHERE id = ''40000000-0000-0000-0000-000000000001''', 0, 'A: UPDATE lesson denied');
SELECT tests.expect_rows('DELETE FROM public.grades WHERE id = ''10000000-0000-0000-0000-000000000001''', 0, 'A: DELETE grade denied');

-- RPC-scoped reads
SELECT tests.expect_count('SELECT count(*) FROM public.get_my_unit_purchases()', 1, 'A: get_my_unit_purchases = own only');

-- mark-read RPC (binding B2 allowed path)
SELECT tests.expect_rows('SELECT public.mark_notification_read(''a0000000-0000-0000-0000-000000000001'')', 1, 'B2: mark_notification_read works');
SELECT tests.assert((SELECT is_read FROM public.notifications WHERE id = 'a0000000-0000-0000-0000-000000000001'), 'B2: notification now read');

RESET ROLE;

-- =====================================================================
-- Section 2: disabled student B
-- =====================================================================
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000002';
SET LOCAL ROLE student;

SELECT tests.expect_count('SELECT count(*) FROM public.profiles WHERE id = ''70000000-0000-0000-0000-000000000002''', 0, 'B: disabled - own profile SELECT denied');
SELECT tests.expect_rows('UPDATE public.profiles SET full_name = ''B2'' WHERE id = ''70000000-0000-0000-0000-000000000002''', 0, 'B: disabled - self UPDATE denied');
SELECT tests.expect_count('SELECT count(*) FROM public.grades', 0, 'B: disabled - grades denied');
SELECT tests.expect_count('SELECT count(*) FROM public.units', 0, 'B: disabled - units denied');
SELECT tests.expect_count('SELECT count(*) FROM public.lessons', 0, 'B: disabled - lessons denied');
SELECT tests.expect_count('SELECT count(*) FROM public.lesson_videos', 0, 'B: disabled - videos denied');
SELECT tests.expect_count('SELECT count(*) FROM public.lesson_pdfs', 0, 'B: disabled - pdfs denied');
SELECT tests.expect_count('SELECT count(*) FROM public.progress', 0, 'B: disabled - progress denied');
SELECT tests.expect_count('SELECT count(*) FROM public.unit_purchases', 1, 'B: disabled - purchase history still readable (A9)');
SELECT tests.expect_count('SELECT count(*) FROM public.notifications', 1, 'B: disabled - own notifications readable (stale session)');

RESET ROLE;

-- =====================================================================
-- Section 3: soft-deleted student C
-- =====================================================================
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000003';
SET LOCAL ROLE student;

SELECT tests.expect_count('SELECT count(*) FROM public.profiles WHERE id = ''70000000-0000-0000-0000-000000000003''', 0, 'C: deleted - profile denied');
SELECT tests.expect_count('SELECT count(*) FROM public.units', 0, 'C: deleted - units denied');
SELECT tests.expect_count('SELECT count(*) FROM public.lessons', 0, 'C: deleted - lessons denied');
SELECT tests.expect_count('SELECT count(*) FROM public.progress', 0, 'C: deleted - progress denied');

RESET ROLE;

-- =====================================================================
-- Section 4: student D (grade 2)
-- =====================================================================
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000004';
SET LOCAL ROLE student;

SELECT tests.expect_count('SELECT count(*) FROM public.units', 1, 'D: own-grade units only (u2)');
SELECT tests.expect_count('SELECT count(*) FROM public.lessons', 1, 'D: own-grade lessons only (l6)');
SELECT tests.expect_count('SELECT count(*) FROM public.unit_pricing', 1, 'D: unit_pricing = own-grade active only (pu2)');
SELECT tests.expect_count('SELECT count(*) FROM public.unit_purchases', 1, 'D: own purchases only (u2)');
SELECT tests.expect_count('SELECT count(*) FROM public.notifications WHERE id = ''a0000000-0000-0000-0000-000000000001''', 0, 'D: others notifications hidden');
SELECT tests.expect_error('UPDATE public.notifications SET is_read = true WHERE id = ''a0000000-0000-0000-0000-000000000001''', '42501', 'permission denied for table notifications');

RESET ROLE;

-- =====================================================================
-- Section 5: mr_walid
-- =====================================================================
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;

SELECT tests.assert((SELECT count(*) >= 10 FROM public.profiles), 'W: sees all profiles');
SELECT tests.expect_count('SELECT count(*) FROM public.grades', 7, 'W: sees all grades');
SELECT tests.expect_count('SELECT count(*) FROM public.units', 4, 'W: sees all units');
SELECT tests.expect_count('SELECT count(*) FROM public.lessons', 9, 'W: sees all lessons');
SELECT tests.expect_count('SELECT count(*) FROM public.lesson_videos', 3, 'W: sees all videos');
SELECT tests.expect_count('SELECT count(*) FROM public.lesson_pdfs', 2, 'W: sees all pdfs');
SELECT tests.expect_count('SELECT count(*) FROM public.unit_pricing', 4, 'W: sees all unit pricing');
SELECT tests.expect_count('SELECT count(*) FROM public.unit_codes', 6, 'W: sees all codes');
SELECT tests.expect_count('SELECT count(*) FROM public.unit_purchases', 3, 'W: sees all purchases');
SELECT tests.expect_count('SELECT count(*) FROM public.progress', 2, 'W: sees all progress');
SELECT tests.expect_count('SELECT count(*) FROM public.app_settings', 3, 'W: sees app_settings (0028 dropped expiry_warning_days)');
SELECT tests.expect_count('SELECT count(*) FROM public.audit_logs', 0, 'W: audit denied (admin only)');
SELECT tests.expect_rows('SELECT * FROM public.list_trash()', 1, 'W: list_trash returns soft-deleted students');
SELECT tests.assert(
    (SELECT full_name = 'C' FROM public.list_trash()),
    'W: list_trash returns the soft-deleted profile C');
SELECT tests.expect_error('INSERT INTO public.audit_logs (action, entity_type) VALUES (''x'',''y'')', '42501', 'violates row-level security policy');
SELECT tests.expect_error('UPDATE public.notifications SET is_read = true WHERE user_id = ''70000000-0000-0000-0000-000000000001''', '42501', 'permission denied for table notifications');

-- content DML allowed for staff
SELECT tests.expect_rows('INSERT INTO public.units (grade_id, name, sort_order) VALUES (''10000000-0000-0000-0000-000000000001'', ''TEST-WINSERT'', 9)', 1, 'W: INSERT unit allowed');
SELECT tests.expect_rows('UPDATE public.units SET name = ''TEST-WINSERT2'' WHERE name = ''TEST-WINSERT''', 1, 'W: UPDATE unit allowed');
SELECT tests.expect_rows('DELETE FROM public.units WHERE name = ''TEST-WINSERT2''', 1, 'W: DELETE unit allowed');
SELECT tests.expect_rows('INSERT INTO public.lessons (unit_id, title, sort_order) VALUES (''30000000-0000-0000-0000-000000000001'', ''TEST-WLINSERT'', 99)', 1, 'W: INSERT lesson allowed');
SELECT tests.expect_rows('DELETE FROM public.lessons WHERE title = ''TEST-WLINSERT''', 1, 'W: DELETE lesson allowed');

-- whatsapp% key update only
SELECT tests.expect_rows('UPDATE public.app_settings SET value = ''"+201001234567"'' WHERE key = ''whatsapp_number''', 1, 'W: whatsapp key update allowed');
SELECT tests.expect_rows('UPDATE public.app_settings SET value = ''"X"'' WHERE key = ''platform_name''', 0, 'W: non-whatsapp key update denied');

RESET ROLE;

-- =====================================================================
-- Section 5b: teacher (staff surface, same posture as mr_walid)
-- =====================================================================
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000b';
SET LOCAL ROLE authenticated;

SELECT tests.expect_count('SELECT count(*) FROM public.profiles WHERE id = ''70000000-0000-0000-0000-00000000000b''', 1, 'T: own profile SELECT');
SELECT tests.assert((SELECT count(*) >= 11 FROM public.profiles), 'T: sees all profiles (staff branch)');
SELECT tests.expect_count('SELECT count(*) FROM public.grades', 7, 'T: sees all grades');
SELECT tests.expect_count('SELECT count(*) FROM public.unit_pricing', 4, 'T: sees all unit pricing');
SELECT tests.expect_count('SELECT count(*) FROM public.units', 4, 'T: sees all units');
SELECT tests.expect_count('SELECT count(*) FROM public.lessons', 9, 'T: sees all lessons');
SELECT tests.expect_count('SELECT count(*) FROM public.lesson_videos', 3, 'T: sees all videos');
SELECT tests.expect_count('SELECT count(*) FROM public.lesson_pdfs', 2, 'T: sees all pdfs');
SELECT tests.expect_count('SELECT count(*) FROM public.unit_codes', 6, 'T: sees all codes');
SELECT tests.expect_count('SELECT count(*) FROM public.unit_purchases', 3, 'T: sees all purchases');
SELECT tests.expect_count('SELECT count(*) FROM public.progress', 2, 'T: sees all progress');
SELECT tests.expect_count('SELECT count(*) FROM public.app_settings', 3, 'T: sees app_settings (0028 dropped expiry_warning_days)');
SELECT tests.expect_count('SELECT count(*) FROM public.audit_logs', 0, 'T: audit denied (admin only)');
SELECT tests.expect_rows('SELECT * FROM public.list_trash()', 1, 'T: list_trash returns soft-deleted students');
SELECT tests.assert(
    (SELECT full_name = 'C' FROM public.list_trash()),
    'T: list_trash returns the soft-deleted profile C');
SELECT tests.expect_error('INSERT INTO public.audit_logs (action, entity_type) VALUES (''x'',''y'')', '42501', 'violates row-level security policy');
SELECT tests.expect_error('UPDATE public.notifications SET is_read = true WHERE user_id = ''70000000-0000-0000-0000-000000000001''', '42501', 'permission denied for table notifications');

-- content DML allowed for teachers (staff branch)
SELECT tests.expect_rows('INSERT INTO public.units (grade_id, name, sort_order) VALUES (''10000000-0000-0000-0000-000000000001'', ''TEST-TINSERT'', 9)', 1, 'T: INSERT unit allowed');
SELECT tests.expect_rows('UPDATE public.units SET name = ''TEST-TINSERT2'' WHERE name = ''TEST-TINSERT''', 1, 'T: UPDATE unit allowed');
SELECT tests.expect_rows('DELETE FROM public.units WHERE name = ''TEST-TINSERT2''', 1, 'T: DELETE unit allowed');
SELECT tests.expect_rows('INSERT INTO public.lessons (unit_id, title, sort_order) VALUES (''30000000-0000-0000-0000-000000000001'', ''TEST-TLINSERT'', 99)', 1, 'T: INSERT lesson allowed');
SELECT tests.expect_rows('DELETE FROM public.lessons WHERE title = ''TEST-TLINSERT''', 1, 'T: DELETE lesson allowed');

-- app_settings write stays admin / mr_walid-whatsapp% only
SELECT tests.expect_rows('UPDATE public.app_settings SET value = ''"X"'' WHERE key = ''platform_name''', 0, 'T: app_settings UPDATE denied (write is admin/mr_walid only)');

RESET ROLE;

-- =====================================================================
-- Section 6: admin
-- =====================================================================
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;

SELECT tests.assert((SELECT count(*) >= 1 FROM public.audit_logs), 'AD: audit visible');
SELECT tests.expect_rows('SELECT * FROM public.list_trash()', 1, 'AD: list_trash returns soft-deleted students');
SELECT tests.expect_error('INSERT INTO public.audit_logs (action, entity_type) VALUES (''x'',''y'')', '42501', 'violates row-level security policy');
SELECT tests.expect_rows('UPDATE public.audit_logs SET action = ''x'' WHERE id = (SELECT id FROM public.audit_logs LIMIT 1)', 0, 'AD: UPDATE audit denied');
SELECT tests.expect_rows('DELETE FROM public.audit_logs WHERE id = (SELECT id FROM public.audit_logs LIMIT 1)', 0, 'AD: DELETE audit denied');
SELECT tests.expect_error('INSERT INTO public.unit_purchases (student_id, unit_id, base_price, platform_fee) VALUES (''70000000-0000-0000-0000-000000000001'', ''30000000-0000-0000-0000-000000000001'', 1, 0)', '42501', 'violates row-level security policy');
SELECT tests.expect_error('INSERT INTO public.lesson_videos (lesson_id, bunny_video_id, bunny_library_id) VALUES (''40000000-0000-0000-0000-000000000001'', ''BV-AD'', ''LIB-1'')', '42501', 'violates row-level security policy');

-- admin profile INSERT + DELETE escape hatch
SELECT tests.expect_rows('INSERT INTO public.profiles (id, full_name, phone, guardian_phone, address) VALUES (''70000000-0000-0000-0000-0000000000ee'', ''IAP'', ''+201001000088'', ''+201001000088'', ''Cairo'')', 1, 'AD: INSERT profiles allowed');
SELECT tests.expect_rows('DELETE FROM public.profiles WHERE id = ''70000000-0000-0000-0000-0000000000ee''', 1, 'AD: DELETE profiles allowed (escape hatch)');

-- app_settings full write for admin
SELECT tests.expect_rows('UPDATE public.app_settings SET value = ''"WLP"'' WHERE key = ''platform_name''', 1, 'AD: any app_setting key update allowed');

-- grades DML
SELECT tests.expect_rows('INSERT INTO public.grades (id, name, sort_order) VALUES (''10000000-0000-0000-0000-0000000000ff'', ''TEST-ADINS'', 9)', 1, 'AD: INSERT grade allowed');
SELECT tests.expect_rows('DELETE FROM public.grades WHERE id = ''10000000-0000-0000-0000-0000000000ff''', 1, 'AD: DELETE grade allowed');

RESET ROLE;
DELETE FROM auth.users WHERE id = '70000000-0000-0000-0000-0000000000ee';

-- =====================================================================
-- Section 7: anon
-- =====================================================================
SET LOCAL ROLE anon;

-- anon cannot evaluate any RLS policy: the policy helpers (is_student,
-- is_admin, ...) are not granted to anon (0010), so every table query
-- errors with 42501 instead of returning rows (LOW-15 keeps only the
-- get_public_settings / list_active_grades / get_public_unit_prices
-- surfaces callable).
SELECT tests.expect_error('SELECT count(*) FROM public.profiles', '42501', 'permission denied for function');
SELECT tests.expect_error('SELECT count(*) FROM public.grades', '42501', 'permission denied for function');
SELECT tests.expect_error('SELECT count(*) FROM public.lessons', '42501', 'permission denied for function');
SELECT tests.expect_error('SELECT count(*) FROM public.app_settings', '42501', 'permission denied for function');
SELECT tests.assert((SELECT public.get_public_settings() ? 'platform_name'), 'anon: get_public_settings still callable');

RESET ROLE;

-- =====================================================================
-- Section 8: registration grade selection (0027)
-- =====================================================================

-- anon can list active grades only (id/name/sort_order), ordered
SET LOCAL ROLE anon;

SELECT tests.assert(
    (SELECT count(*) FROM public.list_active_grades()) >= 3,
    'ANON: list_active_grades exposes the seeded grades');
SELECT tests.assert(
    (SELECT count(*) FROM public.list_active_grades() lg
     WHERE lg.name IN ('الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي')) = 3,
    'ANON: list_active_grades returns exactly the three seeded grades');
SELECT tests.assert(
    (SELECT sort_order FROM public.list_active_grades() LIMIT 1) = 1,
    'ANON: list_active_grades ordered by sort_order');

-- anon can read public unit prices (published, active pricing, active grade)
SELECT tests.assert(
    (SELECT count(*) = 2 FROM public.get_public_unit_prices()),
    'ANON: get_public_unit_prices returns published+active only (u1, u2)');

RESET ROLE;

-- handle_new_user v3 grade gates (fail closed)
SELECT tests.expect_error(
    'INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
     VALUES (''70000000-0000-0000-0000-0000000000f1'', ''reg-missing@walid.test'', ''x'',
             ''{"full_name":"RM","phone":"+201001000091","guardian_phone":"+201001000091","address":"Cairo"}'')',
    'P0001', 'grade_required');
SELECT tests.expect_error(
    'INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
     VALUES (''70000000-0000-0000-0000-0000000000f2'', ''reg-badid@walid.test'', ''x'',
             ''{"full_name":"RB","phone":"+201001000092","guardian_phone":"+201001000092","address":"Cairo","grade_id":"not-a-uuid"}'')',
    'P0001', 'invalid_grade_id');
SELECT tests.expect_error(
    'INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
     VALUES (''70000000-0000-0000-0000-0000000000f3'', ''reg-nograde@walid.test'', ''x'',
             ''{"full_name":"RN","phone":"+201001000093","guardian_phone":"+201001000093","address":"Cairo","grade_id":"11111111-1111-1111-1111-111111111111"}'')',
    'P0001', 'grade_not_available');

-- valid grade_id -> profile created WITH the chosen grade
INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
VALUES ('70000000-0000-0000-0000-0000000000f4', 'reg-ok@walid.test', 'x',
        '{"full_name":"RO","phone":"+201001000094","guardian_phone":"+201001000094","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.profiles WHERE id = ''70000000-0000-0000-0000-0000000000f4'' AND grade_id = ''10000000-0000-0000-0000-000000000001''',
    1, 'REG: profile created with the chosen grade');

DELETE FROM auth.users WHERE id IN ('70000000-0000-0000-0000-0000000000f1',
                                    '70000000-0000-0000-0000-0000000000f2',
                                    '70000000-0000-0000-0000-0000000000f3',
                                    '70000000-0000-0000-0000-0000000000f4');
