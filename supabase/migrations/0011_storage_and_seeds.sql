-- =====================================================================
-- 0011_storage_and_seeds
-- Phase 1 | Supabase Foundation | Database
-- Private storage buckets + storage RLS, and safe seed data
-- (app_settings, admin/mr_walid accounts, empty grades).
-- Reference: DATABASE.md sections 8-9.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Storage: private buckets, RLS enabled, NO anonymous policies and NO
-- direct object policies - every object operation goes through signed
-- URLs issued by Edge Functions (SECURITY.md section 9).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('pdfs', 'pdfs', false), ('audit-exports', 'audit-exports', false)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        BEGIN
            ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
            ALTER TABLE storage.objects FORCE ROW LEVEL SECURITY;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'storage.objects is platform-owned (supabase_storage_admin): skipping ENABLE/FORCE RLS - hosted default is RLS-enabled and not forced';
        END;
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- app_settings seeds (idempotent).
-- ---------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, description)
VALUES
    ('platform_name', '"وليد عونى"', 'Platform display name'),
    ('whatsapp_number', '"+201000000000"', 'Support WhatsApp number'),
    ('whatsapp_default_message', '"مرحباً، أريد الاستفسار عن الاشتراك"', 'Default WhatsApp message'),
    ('expiry_warning_days', '7', 'Days before expiry to warn subscribers')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- Grades: seeded EMPTY (created via UI; dashboard requires grade
-- creation first).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Seed admin + mr_walid accounts (A21).
-- Password is injected via the app.seed_admin_password session setting
-- (CI secret); the explicit default is dev-only. Profile rows are
-- created by handle_new_user from raw_user_meta_data, then roles are
-- promoted. Idempotent.
-- DEPLOY GUARD (LOW): in production (app.is_production = 'true') the
-- default dev password is a hard failure - the migration aborts until a
-- real secret is injected via app.seed_admin_password.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_password text := COALESCE(NULLIF(current_setting('app.seed_admin_password', true), ''), 'ChangeMe-Dev-Only-123!');
    v_is_production boolean := COALESCE(current_setting('app.is_production', true) = 'true', false);
    v_admin uuid;
    v_walid uuid;
BEGIN
    IF v_is_production AND v_password = 'ChangeMe-Dev-Only-123!' THEN
        RAISE EXCEPTION 'seed_admin_password_missing';
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE role IN ('admin', 'mr_walid')) THEN
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@walid-platform.local') THEN
        INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
        VALUES (
            gen_random_uuid(), 'admin@walid-platform.local',
            crypt(v_password, gen_salt('bf')),
            jsonb_build_object('full_name', 'Platform Admin', 'phone', '+201000000001',
                               'guardian_phone', '+201000000001', 'address', 'Cairo',
                               'seed_account', 'true'),
            now(), now()
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'mrwalid@walid-platform.local') THEN
        INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
        VALUES (
            gen_random_uuid(), 'mrwalid@walid-platform.local',
            crypt(v_password, gen_salt('bf')),
            jsonb_build_object('full_name', 'Walid Awny', 'phone', '+201000000002',
                               'guardian_phone', '+201000000002', 'address', 'Cairo',
                               'seed_account', 'true'),
            now(), now()
        );
    END IF;

    SELECT id INTO v_admin FROM auth.users WHERE email = 'admin@walid-platform.local';
    SELECT id INTO v_walid FROM auth.users WHERE email = 'mrwalid@walid-platform.local';

    UPDATE public.profiles SET role = 'admin'    WHERE id = v_admin;
    UPDATE public.profiles SET role = 'mr_walid' WHERE id = v_walid;

    PERFORM public.audit_log('seed.admin_provisioned', 'profile', v_admin,
        jsonb_build_object('role', 'admin'));
    PERFORM public.audit_log('seed.admin_provisioned', 'profile', v_walid,
        jsonb_build_object('role', 'mr_walid'));
END$$;
