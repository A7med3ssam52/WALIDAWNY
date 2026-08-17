-- =====================================================================
-- 05_grants.sql — function/table privilege assertions (SECURITY.md §8)
-- ---------------------------------------------------------------------
-- Verifies the MED-6 allowlist exactly: anon -> ONLY get_public_settings
-- + list_active_grades (0027 registration picker) + get_public_unit_prices
-- (0028 landing page) + get_platform_fee (0031 public read); authenticated
-- -> the 64 client RPCs incl. the 12 new purchase/trial RPCs (0028) + the
-- 5 new exam RPCs (0029) + the 3 new comment RPCs (0030) + the pricing
-- RPCs (0031) + the 5 RLS policy helpers; every internal/system function
-- stays non-executable (0028 REVOKEs create_unit_codes_internal - the
-- staff wrapper is SECURITY DEFINER).
-- Also verifies binding B2 (notifications DML revoked from clients) and
-- the view lockdown (5 internal views; v_active_subscriptions is dropped).
-- =====================================================================

-- ---------------------------------------------------------------------
-- anon: exactly FOUR executable public functions
-- ---------------------------------------------------------------------
SELECT tests.assert(
    (SELECT count(*) = 4 FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND has_function_privilege('anon', oid, 'EXECUTE')),
    'anon: exactly four executable public functions');
SELECT tests.assert(has_function_privilege('anon', 'public.get_public_settings()', 'EXECUTE'),
    'anon: get_public_settings executable (LOW-15)');
SELECT tests.assert(has_function_privilege('anon', 'public.list_active_grades()', 'EXECUTE'),
    'anon: list_active_grades executable (0027 registration picker)');
SELECT tests.assert(has_function_privilege('anon', 'public.get_public_unit_prices()', 'EXECUTE'),
    'anon: get_public_unit_prices executable (0028 landing page)');
SELECT tests.assert(has_function_privilege('anon', 'public.get_platform_fee()', 'EXECUTE'),
    'anon: get_platform_fee executable (0031 public read)');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.create_unit_codes_internal(uuid, integer, text)', 'EXECUTE'),
    'anon: create_unit_codes_internal NOT executable (0028 REVOKE)');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.update_own_profile(text, text, text, text)', 'EXECUTE'),
    'anon: update_own_profile NOT executable');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.redeem_unit_code(text)', 'EXECUTE'),
    'anon: redeem_unit_code NOT executable');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.set_unit_price(uuid, numeric)', 'EXECUTE'),
    'anon: set_unit_price NOT executable');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.set_platform_fee(numeric)', 'EXECUTE'),
    'anon: set_platform_fee NOT executable');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.upsert_progress(uuid, integer, numeric)', 'EXECUTE'),
    'anon: upsert_progress NOT executable');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.is_admin()', 'EXECUTE'),
    'anon: is_admin NOT executable');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.is_student()', 'EXECUTE'),
    'anon: is_student NOT executable');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.can_access_lesson(uuid)', 'EXECUTE'),
    'anon: can_access_lesson NOT executable');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.get_current_role()', 'EXECUTE'),
    'anon: get_current_role NOT executable');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.create_grade(text, integer)', 'EXECUTE'),
    'anon: create_grade NOT executable');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.create_pdf_upload_record(uuid, text, bigint)', 'EXECUTE'),
    'anon: create_pdf_upload_record NOT executable');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.create_video_upload_record(uuid, text, text, text, text, uuid)', 'EXECUTE'),
    'anon: create_video_upload_record NOT executable');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.delete_video_upload_record(uuid, uuid)', 'EXECUTE'),
    'anon: delete_video_upload_record NOT executable');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.delete_pdf_upload_record(uuid, uuid)', 'EXECUTE'),
    'anon: delete_pdf_upload_record NOT executable');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.submit_exam_attempt(uuid, jsonb)', 'EXECUTE'),
    'anon: submit_exam_attempt NOT executable (0029)');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.grade_exam_attempt(uuid, jsonb)', 'EXECUTE'),
    'anon: grade_exam_attempt NOT executable (0029)');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.add_lesson_comment(uuid, text, uuid)', 'EXECUTE'),
    'anon: add_lesson_comment NOT executable (0030)');
SELECT tests.assert(NOT has_function_privilege('anon', 'public.list_lesson_comments(uuid)', 'EXECUTE'),
    'anon: list_lesson_comments NOT executable (0030)');

-- ---------------------------------------------------------------------
-- authenticated: the full client allowlist (65 functions)
-- ---------------------------------------------------------------------
SELECT tests.assert(
    (SELECT count(*) = 65 FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
        AND has_function_privilege('authenticated', oid, 'EXECUTE')),
    'authenticated: exactly 65 executable public functions');

SELECT tests.assert(has_function_privilege('authenticated', 'public.update_own_profile(text, text, text, text)', 'EXECUTE'), 'g: update_own_profile');
SELECT tests.assert(has_function_privilege('authenticated', 'public.update_student_profile(uuid, text, text, text, text)', 'EXECUTE'), 'g: update_student_profile');
SELECT tests.assert(has_function_privilege('authenticated', 'public.redeem_unit_code(text)', 'EXECUTE'), 'g: redeem_unit_code (0028)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.get_my_unit_purchases()', 'EXECUTE'), 'g: get_my_unit_purchases (0028)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.get_my_lesson_access(uuid)', 'EXECUTE'), 'g: get_my_lesson_access (0028)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.upsert_progress(uuid, integer, numeric)', 'EXECUTE'), 'g: upsert_progress');
SELECT tests.assert(has_function_privilege('authenticated', 'public.mark_notification_read(uuid)', 'EXECUTE'), 'g: mark_notification_read');
SELECT tests.assert(has_function_privilege('authenticated', 'public.mark_all_notifications_read()', 'EXECUTE'), 'g: mark_all_notifications_read');
SELECT tests.assert(has_function_privilege('authenticated', 'public.set_student_grade(uuid, uuid)', 'EXECUTE'), 'g: set_student_grade');
SELECT tests.assert(has_function_privilege('authenticated', 'public.disable_student(uuid)', 'EXECUTE'), 'g: disable_student');
SELECT tests.assert(has_function_privilege('authenticated', 'public.enable_student(uuid)', 'EXECUTE'), 'g: enable_student');
SELECT tests.assert(has_function_privilege('authenticated', 'public.soft_delete_student(uuid)', 'EXECUTE'), 'g: soft_delete_student');
SELECT tests.assert(has_function_privilege('authenticated', 'public.restore_student(uuid)', 'EXECUTE'), 'g: restore_student');
SELECT tests.assert(has_function_privilege('authenticated', 'public.list_trash()', 'EXECUTE'), 'g: list_trash');
SELECT tests.assert(has_function_privilege('authenticated', 'public.create_unit(uuid, text, integer)', 'EXECUTE'), 'g: create_unit');
SELECT tests.assert(has_function_privilege('authenticated', 'public.update_unit(uuid, text, integer)', 'EXECUTE'), 'g: update_unit');
SELECT tests.assert(has_function_privilege('authenticated', 'public.delete_unit(uuid)', 'EXECUTE'), 'g: delete_unit');
SELECT tests.assert(has_function_privilege('authenticated', 'public.restore_unit(uuid)', 'EXECUTE'), 'g: restore_unit');
SELECT tests.assert(has_function_privilege('authenticated', 'public.create_lesson(uuid, text, text, integer, boolean)', 'EXECUTE'), 'g: create_lesson (0031 trial flag)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.update_lesson(uuid, text, text, integer, boolean)', 'EXECUTE'), 'g: update_lesson (0031 trial flag)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.publish_lesson(uuid)', 'EXECUTE'), 'g: publish_lesson');
SELECT tests.assert(has_function_privilege('authenticated', 'public.hide_lesson(uuid)', 'EXECUTE'), 'g: hide_lesson');
SELECT tests.assert(has_function_privilege('authenticated', 'public.soft_delete_lesson(uuid)', 'EXECUTE'), 'g: soft_delete_lesson');
SELECT tests.assert(has_function_privilege('authenticated', 'public.restore_lesson(uuid)', 'EXECUTE'), 'g: restore_lesson');
SELECT tests.assert(has_function_privilege('authenticated', 'public.delete_grade(uuid)', 'EXECUTE'), 'g: delete_grade');
SELECT tests.assert(has_function_privilege('authenticated', 'public.restore_grade(uuid)', 'EXECUTE'), 'g: restore_grade');
SELECT tests.assert(has_function_privilege('authenticated', 'public.create_grade(text, integer)', 'EXECUTE'), 'g: create_grade');
SELECT tests.assert(has_function_privilege('authenticated', 'public.update_grade(uuid, text, integer)', 'EXECUTE'), 'g: update_grade');
SELECT tests.assert(has_function_privilege('authenticated', 'public.list_active_grades()', 'EXECUTE'), 'g: list_active_grades (0027 registration picker)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.set_app_setting(text, jsonb)', 'EXECUTE'), 'g: set_app_setting');
SELECT tests.assert(has_function_privilege('authenticated', 'public.set_user_role(uuid, public.user_role)', 'EXECUTE'), 'g: set_user_role');
SELECT tests.assert(has_function_privilege('authenticated', 'public.set_role_by_email(text, public.user_role)', 'EXECUTE'), 'g: set_role_by_email');
SELECT tests.assert(has_function_privilege('authenticated', 'public.finalize_pdf_upload(uuid)', 'EXECUTE'), 'g: finalize_pdf_upload');
SELECT tests.assert(has_function_privilege('authenticated', 'public.create_pdf_upload_record(uuid, text, bigint)', 'EXECUTE'), 'g: create_pdf_upload_record');
SELECT tests.assert(has_function_privilege('authenticated', 'public.create_video_upload_record(uuid, text, text, text, text, uuid)', 'EXECUTE'), 'g: create_video_upload_record');
SELECT tests.assert(has_function_privilege('authenticated', 'public.delete_video_upload_record(uuid, uuid)', 'EXECUTE'), 'g: delete_video_upload_record');
SELECT tests.assert(has_function_privilege('authenticated', 'public.delete_pdf_upload_record(uuid, uuid)', 'EXECUTE'), 'g: delete_pdf_upload_record');
SELECT tests.assert(has_function_privilege('authenticated', 'public.get_dashboard_stats()', 'EXECUTE'), 'g: get_dashboard_stats');
SELECT tests.assert(has_function_privilege('authenticated', 'public.list_audit_logs(timestamp with time zone, timestamp with time zone, text, text, uuid, integer, integer)', 'EXECUTE'), 'g: list_audit_logs');
SELECT tests.assert(has_function_privilege('authenticated', 'public.count_audit_logs(timestamp with time zone, timestamp with time zone, text, text, uuid)', 'EXECUTE'), 'g: count_audit_logs');
SELECT tests.assert(has_function_privilege('authenticated', 'public.get_public_settings()', 'EXECUTE'), 'g: get_public_settings');
SELECT tests.assert(has_function_privilege('authenticated', 'public.get_public_unit_prices()', 'EXECUTE'), 'g: get_public_unit_prices (0028)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.set_unit_price(uuid, numeric)', 'EXECUTE'), 'g: set_unit_price (0031 staff base price)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.set_platform_fee(numeric)', 'EXECUTE'), 'g: set_platform_fee (0031 admin fee)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.get_platform_fee()', 'EXECUTE'), 'g: get_platform_fee (0031)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.list_unit_pricing()', 'EXECUTE'), 'g: list_unit_pricing (0028)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.list_codes_by_unit(uuid)', 'EXECUTE'), 'g: list_codes_by_unit (0028)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.revoke_unit_code(uuid)', 'EXECUTE'), 'g: revoke_unit_code (0028)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.create_unit_codes_for_staff(uuid, integer, text)', 'EXECUTE'), 'g: create_unit_codes_for_staff (0028)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.list_all_unit_purchases(uuid)', 'EXECUTE'), 'g: list_all_unit_purchases (0028)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.unit_purchase_stats()', 'EXECUTE'), 'g: unit_purchase_stats (0028)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.set_lesson_trial(uuid, boolean)', 'EXECUTE'), 'g: set_lesson_trial (0028)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE'), 'g: is_admin (RLS policy helper)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.is_mr_walid()', 'EXECUTE'), 'g: is_mr_walid (RLS policy helper)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.is_teacher()', 'EXECUTE'), 'g: is_teacher (RLS policy helper)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.is_student()', 'EXECUTE'), 'g: is_student (RLS policy helper)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.can_access_lesson(uuid)', 'EXECUTE'), 'g: can_access_lesson (RLS policy helper)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.list_exams(uuid)', 'EXECUTE'), 'g: list_exams (0029)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.get_exam_questions(uuid)', 'EXECUTE'), 'g: get_exam_questions (0029)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.get_my_exam_attempt(uuid)', 'EXECUTE'), 'g: get_my_exam_attempt (0029)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.submit_exam_attempt(uuid, jsonb)', 'EXECUTE'), 'g: submit_exam_attempt (0029)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.grade_exam_attempt(uuid, jsonb)', 'EXECUTE'), 'g: grade_exam_attempt (0029)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.add_lesson_comment(uuid, text, uuid)', 'EXECUTE'), 'g: add_lesson_comment (0030)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.delete_lesson_comment(uuid)', 'EXECUTE'), 'g: delete_lesson_comment (0030)');
SELECT tests.assert(has_function_privilege('authenticated', 'public.list_lesson_comments(uuid)', 'EXECUTE'), 'g: list_lesson_comments (0030)');

-- ---------------------------------------------------------------------
-- authenticated: internal/system functions stay locked down
-- ---------------------------------------------------------------------
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.create_unit_codes_internal(uuid, integer, text)', 'EXECUTE'), 'g: create_unit_codes_internal locked (0028 REVOKE)');
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.set_video_status(uuid, public.video_status, integer, text, text, uuid)', 'EXECUTE'), 'g: set_video_status locked');
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.recheck_video_states()', 'EXECUTE'), 'g: recheck_video_states locked');
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.notify_new_content(uuid)', 'EXECUTE'), 'g: notify_new_content locked');
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.notify_new_content_trigger()', 'EXECUTE'), 'g: notify_new_content_trigger locked');
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.audit_log(text, text, uuid, jsonb)', 'EXECUTE'), 'g: audit_log locked');
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'), 'g: handle_new_user locked');
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.block_email_change()', 'EXECUTE'), 'g: block_email_change locked');
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.block_sign_in_for_inactive_accounts()', 'EXECUTE'), 'g: block_sign_in_for_inactive_accounts locked');
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.set_updated_at()', 'EXECUTE'), 'g: set_updated_at locked');
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.clear_primary_on_soft_delete()', 'EXECUTE'), 'g: clear_primary_on_soft_delete locked');
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.revoke_sessions_if_possible(uuid)', 'EXECUTE'), 'g: revoke_sessions_if_possible locked');
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.get_current_role()', 'EXECUTE'), 'g: get_current_role locked');
SELECT tests.assert(NOT has_function_privilege('authenticated', 'public.lesson_comments_parent_check()', 'EXECUTE'), 'g: lesson_comments_parent_check locked (0030)');

-- ---------------------------------------------------------------------
-- Binding B2: notifications DML revoked, SELECT remains
-- ---------------------------------------------------------------------
SELECT tests.assert(has_table_privilege('authenticated', 'public.notifications', 'SELECT'), 'B2: notifications SELECT granted');
SELECT tests.assert(NOT has_table_privilege('authenticated', 'public.notifications', 'INSERT'), 'B2: notifications INSERT revoked');
SELECT tests.assert(NOT has_table_privilege('authenticated', 'public.notifications', 'UPDATE'), 'B2: notifications UPDATE revoked');
SELECT tests.assert(NOT has_table_privilege('authenticated', 'public.notifications', 'DELETE'), 'B2: notifications DELETE revoked');
SELECT tests.assert(has_table_privilege('anon', 'public.notifications', 'SELECT'), 'B2: anon notifications SELECT granted');
SELECT tests.assert(NOT has_table_privilege('anon', 'public.notifications', 'INSERT'), 'B2: anon notifications INSERT revoked');
SELECT tests.assert(NOT has_table_privilege('anon', 'public.notifications', 'UPDATE'), 'B2: anon notifications UPDATE revoked');
SELECT tests.assert(NOT has_table_privilege('anon', 'public.notifications', 'DELETE'), 'B2: anon notifications DELETE revoked');

-- ---------------------------------------------------------------------
-- Table surface: clients hold table-level SELECT everywhere (hosted
-- Supabase default); RLS does the row filtering, revocations the rest.
-- ---------------------------------------------------------------------
SELECT tests.assert(has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 't: profiles SELECT granted');
SELECT tests.assert(has_table_privilege('authenticated', 'public.progress', 'SELECT'), 't: progress SELECT granted');
SELECT tests.assert(has_table_privilege('authenticated', 'public.audit_logs', 'SELECT'), 't: audit_logs SELECT granted (RLS: admin-only rows)');
SELECT tests.assert(has_table_privilege('authenticated', 'public.app_settings', 'SELECT'), 't: app_settings SELECT granted (RLS: staff-only rows)');
SELECT tests.assert(has_table_privilege('authenticated', 'public.unit_pricing', 'SELECT'), 't: unit_pricing SELECT granted (0028)');
SELECT tests.assert(has_table_privilege('authenticated', 'public.unit_codes', 'SELECT'), 't: unit_codes SELECT granted (0028, RLS staff-only rows)');
SELECT tests.assert(has_table_privilege('authenticated', 'public.unit_purchases', 'SELECT'), 't: unit_purchases SELECT granted (0028)');
SELECT tests.assert(has_table_privilege('anon', 'public.unit_pricing', 'SELECT'), 't: anon unit_pricing SELECT granted (0028 landing page)');

-- ---------------------------------------------------------------------
-- View lockdown (0026 + 0028): the 5 remaining views are internal-only,
-- consumed by SECURITY DEFINER functions (owner postgres) - no client
-- role (anon or authenticated) holds any privilege on them (L5 /
-- SECURITY.md section 8). v_active_subscriptions is dropped (0028).
-- ---------------------------------------------------------------------
SELECT tests.assert(NOT has_table_privilege('anon', 'public.v_lesson_access', 'SELECT'), 'v: v_lesson_access anon locked');
SELECT tests.assert(NOT has_table_privilege('authenticated', 'public.v_lesson_access', 'SELECT'), 'v: v_lesson_access authenticated locked');
SELECT tests.assert(NOT has_table_privilege('anon', 'public.v_student_progress_summary', 'SELECT'), 'v: v_student_progress_summary anon locked');
SELECT tests.assert(NOT has_table_privilege('authenticated', 'public.v_student_progress_summary', 'SELECT'), 'v: v_student_progress_summary authenticated locked');
SELECT tests.assert(NOT has_table_privilege('anon', 'public.v_lesson_stats', 'SELECT'), 'v: v_lesson_stats anon locked');
SELECT tests.assert(NOT has_table_privilege('authenticated', 'public.v_lesson_stats', 'SELECT'), 'v: v_lesson_stats authenticated locked');
SELECT tests.assert(NOT has_table_privilege('anon', 'public.v_dashboard_metrics', 'SELECT'), 'v: v_dashboard_metrics anon locked');
SELECT tests.assert(NOT has_table_privilege('authenticated', 'public.v_dashboard_metrics', 'SELECT'), 'v: v_dashboard_metrics authenticated locked');
SELECT tests.assert(NOT has_table_privilege('anon', 'public.v_audit_log', 'SELECT'), 'v: v_audit_log anon locked');
SELECT tests.assert(NOT has_table_privilege('authenticated', 'public.v_audit_log', 'SELECT'), 'v: v_audit_log authenticated locked');
