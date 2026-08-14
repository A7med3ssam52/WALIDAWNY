-- =====================================================================
-- 01_schema.sql — schema & constraint assertions
-- Covers TESTING.md section 3: 14 tables, 7 enums, columns, CHECK /
-- UNIQUE / partial-unique / FK rules, RLS enabled + FORCEd, 6 views
-- (SECURITY INVOKER), trigger inventory, storage buckets, B1 ownership,
-- B2 notification grants.
-- =====================================================================

-- --- 14 application tables exist -------------------------------------
SELECT tests.assert(
    (SELECT count(*) = 14 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND c.relname IN ('profiles','grades','pricing_plans','subscriptions',
                         'subscription_codes','code_redemptions','units','lessons',
                         'lesson_videos','lesson_pdfs','progress','notifications',
                         'audit_logs','app_settings')),
    'all 14 application tables exist');

-- --- 7 enums with exact member sets ----------------------------------
SELECT tests.assert(
    (SELECT count(*) = 7 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typtype = 'e'),
    'exactly 7 enums exist in public');

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
            ARRAY['active','expired']::text[]
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'subscription_status'),
    'subscription_status members are active,expired');

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
            ARRAY['subscription_activated','subscription_expiring','subscription_expired','new_content','system']::text[]
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'notification_type'),
    'notification_type members match DATABASE.md');

-- --- RLS enabled + FORCEd on all 14 tables ----------------------------
SELECT tests.assert(
    (SELECT count(*) = 14
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND c.relrowsecurity AND c.relforcerowsecurity),
    'RLS enabled AND forced on all 14 tables');

-- --- expected columns present ----------------------------------------
SELECT tests.assert(
    (SELECT array_agg(column_name ORDER BY column_name)::text[] = ARRAY[
        'address','created_at','deleted_at','full_name','grade_id','guardian_phone',
        'id','phone','role','status','updated_at']::text[]
     FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles'),
    'profiles has exactly the documented columns');

SELECT tests.assert(
    (SELECT count(*) = 0 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'updated_at'),
    'subscriptions has NO updated_at column (immutable history)');

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
     WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'guardian_phone'),
    'profiles.guardian_phone NOT NULL');

SELECT tests.assert(
    (SELECT is_nullable = 'NO' FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'address'),
    'profiles.address NOT NULL');

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
     WHERE t.relname = 'subscription_codes' AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%code = upper(code)%'),
    'subscription_codes CHECK enforces stored-uppercase codes');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'subscription_codes' AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%WLDN-%'
       AND pg_get_constraintdef(c.oid) LIKE '%ABCDEFGHJKLMNPQRSTUVWXYZ23456789%'),
    'subscription_codes CHECK enforces the unambiguous format regex (B9/A22)');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'pricing_plans' AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ~ 'total_price\s*=\s*(\(base_price\s*\+\s*platform_fee|base_price\s*\+\s*platform_fee\)|base_price\s*\+\s*platform_fee)\s*\)?'),
    'pricing_plans CHECK total = base + fee (A6)');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'subscriptions' AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%expires_at > started_at%'),
    'subscriptions CHECK expires_at > started_at');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'progress' AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%percent_completed%0%100%'),
    'progress CHECK 0 <= percent_completed <= 100');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'pricing_plans' AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%duration_days > 0%'),
    'pricing_plans CHECK duration_days > 0');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'subscriptions' AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ~ 'source\s*=\s*ANY\s*\(ARRAY\[.*''code''::text.*''manual''::text'),
    'subscriptions CHECK source IN (code, manual)');

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
    (SELECT count(*) = 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'code_redemptions' AND indexdef LIKE '%code_id%' AND indexdef LIKE '%UNIQUE%'),
    'code_redemptions (code_id) UNIQUE - physical double-redemption backstop');

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
     WHERE t.relname = 'subscriptions' AND c.contype = 'f' AND c.conname = 'subscriptions_pricing_plan_id_fkey'
       AND pg_get_constraintdef(c.oid) LIKE '%ON DELETE RESTRICT%'),
    'subscriptions.pricing_plan_id -> pricing_plans RESTRICT (B7)');

SELECT tests.assert(
    (SELECT count(*) = 1
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'code_redemptions' AND c.contype = 'f' AND c.conname = 'code_redemptions_subscription_id_fkey'
       AND pg_get_constraintdef(c.oid) LIKE '%ON DELETE RESTRICT%'),
    'code_redemptions.subscription_id -> subscriptions RESTRICT (L6)');

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

-- --- 6 views, all SECURITY INVOKER -----------------------------------
SELECT tests.assert(
    (SELECT count(*) = 6 FROM information_schema.views WHERE table_schema = 'public'
     AND table_name IN ('v_active_subscriptions','v_lesson_access','v_student_progress_summary',
                        'v_lesson_stats','v_dashboard_metrics','v_audit_log')),
    'all 6 views exist');

-- PG views are SECURITY INVOKER by default (no SECURITY DEFINER views, L5);
-- the previous information_schema.security_type column does not exist in PG.
SELECT tests.assert(
    (SELECT count(*) = 6 FROM information_schema.views
     WHERE table_schema = 'public' AND table_name LIKE 'v_%'),
    'all 6 views are SECURITY INVOKER (L5)');

SELECT tests.assert(
    (SELECT count(*) = 0 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname LIKE 'v_%' AND c.reloptions IS NOT NULL),
    'no view carries security_barrier options');

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
    (SELECT count(*) = 9 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND t.tgname = 'set_updated_at'
       AND c.relname IN ('profiles','grades','pricing_plans','units','lessons','lesson_videos','lesson_pdfs','progress','app_settings')),
    'set_updated_at on the 9 documented tables');

SELECT tests.assert(
    (SELECT count(*) = 10 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND t.tgname = 'audit_trigger'
       AND c.relname IN ('profiles','grades','units','lessons','lesson_videos','lesson_pdfs','pricing_plans','subscriptions','subscription_codes','app_settings')),
    'audit_trigger on the exact 10-table inventory (MED-8)');

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
