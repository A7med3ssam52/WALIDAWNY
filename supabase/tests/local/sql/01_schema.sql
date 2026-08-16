-- =====================================================================
-- 01_schema.sql — schema & constraint assertions
-- Covers IMPLEMENTATION-PLAN.md section 6.1: 18 tables (17 + lesson_comments
-- from 0030), 8 enums, columns, CHECK / UNIQUE / partial-unique / FK
-- rules, RLS enabled + FORCEd, 5 views (SECURITY INVOKER), trigger
-- inventory, storage buckets, B1 ownership, B2 notification grants.
-- The four subscription tables (pricing_plans / subscriptions /
-- subscription_codes / code_redemptions) and the subscription_status
-- enum must NOT exist after 0028.
-- =====================================================================

-- --- 18 application tables exist -------------------------------------
SELECT tests.assert(
    (SELECT count(*) = 18 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND c.relname IN ('profiles','grades','units','lessons',
                         'lesson_videos','lesson_pdfs','progress','notifications',
                         'audit_logs','app_settings',
                         'unit_pricing','unit_codes','unit_purchases',
                         'exams','exam_questions','exam_attempts','exam_answers',
                         'lesson_comments')),
    'all 18 application tables exist (17 + lesson_comments)');

-- --- the four legacy subscription tables are GONE ---------------------
SELECT tests.assert(
    (SELECT count(*) = 0 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND c.relname IN ('pricing_plans','subscriptions','subscription_codes','code_redemptions')),
    'legacy subscription tables dropped (0028 step 12)');

-- --- 8 enums with exact member sets ----------------------------------
SELECT tests.assert(
    (SELECT count(*) = 8 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typtype = 'e'),
    'exactly 8 enums exist in public');

SELECT tests.assert(
    (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] =
            ARRAY['student','mr_walid','admin','teacher']::text[]
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'user_role'),
    'user_role members are student,mr_walid,admin,teacher');

SELECT tests.assert(
    (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] =
            ARRAY['active','disabled']::text[]
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'account_status'),
    'account_status members are active,disabled');

SELECT tests.assert(
    (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] =
            ARRAY['available','used','revoked']::text[]
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'code_status'),
    'code_status members are available,used,revoked');

SELECT tests.assert(
    (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] =
            ARRAY['draft','published','hidden']::text[]
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'content_status'),
    'content_status members are draft,published,hidden');

SELECT tests.assert(
    (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] =
            ARRAY['pending_upload','uploading','processing','ready','failed','replaced']::text[]
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'video_status'),
    'video_status members match DATABASE.md');

SELECT tests.assert(
    (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] =
            ARRAY['new_content','unit_activated','system','exam_submitted','exam_graded','lesson_comment','comment_reply']::text[]
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'notification_type'),
    'notification_type members are new_content,unit_activated,system + exam_submitted,exam_graded (0028/0029) + lesson_comment,comment_reply (0030)');

SELECT tests.assert(
    (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] =
            ARRAY['active','void']::text[]
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'unit_purchase_status'),
    'unit_purchase_status members are active,void');

SELECT tests.assert(
    (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] =
            ARRAY['mcq','essay']::text[]
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'exam_question_type'),
    'exam_question_type members are mcq,essay (0029)');

SELECT tests.assert(
    (SELECT to_regtype('public.subscription_status') IS NULL),
    'subscription_status enum does NOT exist (0028 step 13)');

-- --- RLS enabled + FORCEd on all 18 tables ----------------------------
SELECT tests.assert(
    (SELECT count(*) = 18
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND c.relrowsecurity AND c.relforcerowsecurity),
    'RLS enabled AND forced on all 18 tables');

-- --- expected columns present ----------------------------------------
SELECT tests.assert(
    (SELECT array_agg(column_name ORDER BY column_name)::text[] = ARRAY[
        'address','created_at','deleted_at','full_name','grade_id','guardian_phone',
        'id','phone','role','status','updated_at']::text[]
     FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles'),
    'profiles has exactly the documented columns');

SELECT tests.assert(
    (SELECT count(*) = 0 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'unit_purchases' AND column_name = 'updated_at'),
    'unit_purchases has NO updated_at column (immutable history)');

SELECT tests.assert(
    (SELECT count(*) = 0 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'progress' AND column_name = 'created_at'),
    'progress has NO created_at column');

SELECT tests.assert(
    (SELECT is_nullable = 'NO' FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone'),
    'profiles.phone NOT NULL');

SELECT tests.assert(
    (SELECT is_nullable = 'NO' FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'is_trial'),
    'lessons.is_trial NOT NULL');

SELECT tests.assert(
    (SELECT data_type = 'numeric' AND numeric_precision = 5 AND numeric_scale = 2
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'progress' AND column_name = 'percent_completed'),
    'progress.percent_completed is numeric(5,2)');

SELECT tests.assert(
    (SELECT data_type = 'bigint' FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'lesson_pdfs' AND column_name = 'size_bytes'),
    'lesson_pdfs.size_bytes is bigint');

-- --- CHECK constraints ------------------------------------------------
SELECT tests.assert(
    (SELECT count(*) >= 2
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'profiles' AND c.contype = 'c'
       AND position('1[0-9]{9}' in pg_get_constraintdef(c.oid)) > 0
       AND pg_get_constraintdef(c.oid) LIKE '%phone%'),
    'profiles has Egyptian phone-format CHECK on phone and guardian_phone');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'unit_codes' AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%WLDN-%'
       AND pg_get_constraintdef(c.oid) LIKE '%A-Z0-9%'),
    'unit_codes CHECK enforces the stored-uppercase WLDN- format (0028)');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'unit_pricing' AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%base_price >= %'),
    'unit_pricing CHECK base_price >= 0');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'unit_pricing' AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%platform_fee >= %'),
    'unit_pricing CHECK platform_fee >= 0');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'unit_purchases' AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%base_price >= %'),
    'unit_purchases CHECK base_price >= 0');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'progress' AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%percent_completed%0%100%'),
    'progress CHECK 0 <= percent_completed <= 100');

-- --- GENERATED total_price (base + platform) --------------------------
SELECT tests.assert(
    (SELECT pg_get_expr(ad.adbin, ad.adrelid) LIKE '%base_price%platform_fee%'
     FROM pg_attrdef ad
     JOIN pg_class c ON c.oid = ad.adrelid
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ad.adnum
     WHERE c.relname = 'unit_pricing' AND a.attname = 'total_price'),
    'unit_pricing.total_price is GENERATED as base + platform');

SELECT tests.assert(
    (SELECT pg_get_expr(ad.adbin, ad.adrelid) LIKE '%base_price%platform_fee%'
     FROM pg_attrdef ad
     JOIN pg_class c ON c.oid = ad.adrelid
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ad.adnum
     WHERE c.relname = 'unit_purchases' AND a.attname = 'total_price'),
    'unit_purchases.total_price is GENERATED as base + platform');

-- --- UNIQUE constraints ----------------------------------------------
SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'profiles' AND indexdef LIKE '%phone%' AND indexdef LIKE '%UNIQUE%'),
    'profiles.phone UNIQUE');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'grades' AND indexdef LIKE '%name%' AND indexdef LIKE '%UNIQUE%'),
    'grades.name UNIQUE');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'units'
     AND indexdef LIKE '%grade_id%' AND indexdef LIKE '%name%' AND indexdef LIKE '%UNIQUE%'),
    'units (grade_id, name) UNIQUE');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'unit_codes' AND indexname = 'unit_codes_code_key'),
    'unit_codes.code UNIQUE');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'unit_pricing' AND indexdef LIKE '%unit_id%' AND indexdef LIKE '%UNIQUE%'),
    'unit_pricing.unit_id UNIQUE (one price row per unit)');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'unit_purchases'
     AND indexdef LIKE '%student_id%' AND indexdef LIKE '%unit_id%' AND indexdef LIKE '%UNIQUE%'),
    'unit_purchases (student_id, unit_id) UNIQUE');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'progress'
     AND indexdef LIKE '%student_id%' AND indexdef LIKE '%lesson_id%' AND indexdef LIKE '%UNIQUE%'),
    'progress (student_id, lesson_id) UNIQUE');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'notifications' AND indexdef LIKE '%dedup_key%' AND indexdef LIKE '%UNIQUE%'),
    'notifications.dedup_key UNIQUE');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'lesson_videos' AND indexdef LIKE '%bunny_video_id%' AND indexdef LIKE '%UNIQUE%'),
    'lesson_videos.bunny_video_id UNIQUE');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'lesson_pdfs' AND indexdef LIKE '%storage_path%' AND indexdef LIKE '%UNIQUE%'),
    'lesson_pdfs.storage_path UNIQUE');

-- --- Partial uniques (binding B9) -------------------------------------
SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'lesson_videos'
     AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%lesson_id%' AND indexdef LIKE '%WHERE%is_primary%deleted_at IS NULL%'),
    'lesson_videos partial unique: one primary per lesson (B9)');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'lesson_pdfs'
     AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%lesson_id%' AND indexdef LIKE '%WHERE%is_primary%deleted_at IS NULL%'),
    'lesson_pdfs partial unique: one primary per lesson');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'lessons'
     AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%unit_id%'
     AND indexdef LIKE '%WHERE%is_trial%deleted_at IS NULL%'),
    'lessons partial unique: at most one trial lesson per unit (0028)');

-- --- FK ON DELETE behaviors ------------------------------------------
SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'profiles' AND c.contype = 'f' AND c.conname = 'profiles_id_fkey'
       AND pg_get_constraintdef(c.oid) LIKE '%auth.users%' AND pg_get_constraintdef(c.oid) LIKE '%ON DELETE CASCADE%'),
    'profiles.id -> auth.users CASCADE');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'profiles' AND c.contype = 'f' AND c.conname = 'profiles_grade_id_fkey'
       AND pg_get_constraintdef(c.oid) LIKE '%ON DELETE SET NULL%'),
    'profiles.grade_id -> grades SET NULL');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'units' AND c.contype = 'f'
       AND pg_get_constraintdef(c.oid) LIKE '%REFERENCES grades%' AND pg_get_constraintdef(c.oid) LIKE '%ON DELETE CASCADE%'),
    'units.grade_id -> grades CASCADE');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'unit_pricing' AND c.contype = 'f'
       AND pg_get_constraintdef(c.oid) LIKE '%REFERENCES units%' AND pg_get_constraintdef(c.oid) LIKE '%ON DELETE CASCADE%'),
    'unit_pricing.unit_id -> units CASCADE');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'unit_codes' AND c.contype = 'f'
       AND pg_get_constraintdef(c.oid) LIKE '%REFERENCES unit_pricing%' AND pg_get_constraintdef(c.oid) LIKE '%ON DELETE RESTRICT%'),
    'unit_codes.unit_pricing_id -> unit_pricing RESTRICT');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'unit_purchases' AND c.contype = 'f'
       AND pg_get_constraintdef(c.oid) LIKE '%REFERENCES profiles%' AND pg_get_constraintdef(c.oid) LIKE '%ON DELETE CASCADE%'),
    'unit_purchases.student_id -> profiles CASCADE');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'unit_purchases' AND c.contype = 'f'
       AND pg_get_constraintdef(c.oid) LIKE '%REFERENCES units%' AND pg_get_constraintdef(c.oid) LIKE '%ON DELETE RESTRICT%'),
    'unit_purchases.unit_id -> units RESTRICT');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'unit_purchases' AND c.contype = 'f'
       AND pg_get_constraintdef(c.oid) LIKE '%REFERENCES unit_codes%' AND pg_get_constraintdef(c.oid) LIKE '%ON DELETE SET NULL%'),
    'unit_purchases.code_id -> unit_codes SET NULL');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'progress' AND c.contype = 'f' AND c.conname = 'progress_video_id_fkey'
       AND pg_get_constraintdef(c.oid) LIKE '%ON DELETE SET NULL%'),
    'progress.video_id -> lesson_videos SET NULL (A11)');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'lesson_videos' AND c.contype = 'f'
       AND pg_get_constraintdef(c.oid) LIKE '%REFERENCES lessons%' AND pg_get_constraintdef(c.oid) LIKE '%ON DELETE CASCADE%'),
    'lesson_videos.lesson_id -> lessons CASCADE');

-- --- 5 views, all SECURITY INVOKER; v_active_subscriptions GONE -------
SELECT tests.assert(
    (SELECT count(*) = 5 FROM information_schema.views WHERE table_schema = 'public'
     AND table_name IN ('v_lesson_access','v_student_progress_summary',
                        'v_lesson_stats','v_dashboard_metrics','v_audit_log')),
    'all 5 views exist');

SELECT tests.assert(
    (SELECT to_regclass('public.v_active_subscriptions') IS NULL),
    'v_active_subscriptions dropped (0028 step 9)');

-- PG views are SECURITY INVOKER by default (no SECURITY DEFINER views, L5);
-- the previous information_schema.security_type column does not exist in PG.
SELECT tests.assert(
    (SELECT count(*) = 5 FROM information_schema.views
     WHERE table_schema = 'public' AND table_name LIKE 'v_%'),
    'all 5 views are SECURITY INVOKER (L5)');

SELECT tests.assert(
    (SELECT count(*) = 0 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname LIKE 'v_%' AND c.reloptions IS NOT NULL),
    'no view carries security_barrier options');

-- v_dashboard_metrics / v_lesson_access expose no subscription columns
SELECT tests.assert(
    (SELECT count(*) = 0 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('v_dashboard_metrics','v_lesson_access')
       AND column_name LIKE '%subscription%'),
    'no subscription column in the redefined views (0028 step 9)');

-- --- Trigger inventory -------------------------------------------------
SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_trigger WHERE tgname = 'handle_new_user' AND tgrelid = 'auth.users'::regclass),
    'handle_new_user trigger on auth.users');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_trigger WHERE tgname = 'block_email_change' AND tgrelid = 'auth.users'::regclass),
    'block_email_change trigger on auth.users');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_trigger WHERE tgname = 'block_sign_in_for_inactive_accounts' AND tgrelid = 'auth.users'::regclass),
    'block_sign_in_for_inactive_accounts trigger on auth.users');

SELECT tests.assert(
    (SELECT count(*) = 11 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND t.tgname = 'set_updated_at'
       AND c.relname IN ('profiles','grades','units','lessons','lesson_videos','lesson_pdfs','progress','app_settings','unit_pricing','unit_codes','exams')),
    'set_updated_at on the 11 documented tables (0028 list + exams 0029)');

SELECT tests.assert(
    (SELECT count(*) = 12 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND t.tgname = 'audit_trigger'
       AND c.relname IN ('profiles','grades','units','lessons','lesson_videos','lesson_pdfs','app_settings','unit_pricing','unit_codes','unit_purchases','exams','lesson_comments')),
    'audit_trigger on the exact 12-table inventory (MED-8, 0028 + exams 0029 + lesson_comments 0030)');

SELECT tests.assert(
    (SELECT count(*) = 0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname IN ('progress','notifications') AND t.tgname = 'audit_trigger'),
    'progress and notifications are NOT audited');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_trigger WHERE tgname = 'notify_new_content' AND tgrelid = 'public.lessons'::regclass),
    'notify_new_content trigger on lessons');

-- --- Storage buckets: private ----------------------------------------
SELECT tests.assert(
    (SELECT count(*) = 2 FROM storage.buckets WHERE id IN ('pdfs','audit-exports') AND NOT public),
    'pdfs and audit-exports buckets exist and are private');

-- --- B1: SECURITY DEFINER ownership -----------------------------------
SELECT tests.assert(
    (SELECT count(*) = 0
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef AND pg_get_userbyid(p.proowner) <> 'postgres'),
    'B1: every SECURITY DEFINER function is owned by postgres');

-- --- B2: notification table grants ------------------------------------
SELECT tests.assert(
    (SELECT NOT has_table_privilege('authenticated', 'public.notifications', 'INSERT')
        AND NOT has_table_privilege('authenticated', 'public.notifications', 'UPDATE')
        AND NOT has_table_privilege('authenticated', 'public.notifications', 'DELETE')),
    'B2: authenticated has NO INSERT/UPDATE/DELETE on notifications');
