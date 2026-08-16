-- =====================================================================
-- auth-shim.sql -- local harness ONLY. Never applied to a real Supabase
-- project.
--
-- Provides the minimal hosted-Supabase surface the migrations and the
-- assertion suites depend on:
--   * auth schema: users table + auth.uid()/auth.jwt()/auth.role()
--   * storage schema: buckets + objects (RLS enabled, no policies)
--   * role names: anon / authenticated (+ test roles as members of
--     authenticated so inherited grants behave like the hosted project)
--   * tests schema: assertion helpers used by the suites
--
-- auth.uid() reads request.jwt.claim.sub first (hosted Supabase claim),
-- then falls back to app.current_user_id so suites can inject the
-- simulated authenticated user via:
--   SET LOCAL "app.current_user_id" = '<uuid>';
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id                 uuid PRIMARY KEY,
    email              text UNIQUE,
    encrypted_password text,
    raw_user_meta_data jsonb,
    email_change       text,
    last_sign_in_at    timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid,
        NULLIF(current_setting('app.current_user_id', true), '')::uuid
    );
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT '{}'::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT 'authenticated'
$$;

-- ---------------------------------------------------------------------
-- storage shim
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
    id              text PRIMARY KEY,
    name            text,
    public          boolean NOT NULL DEFAULT false,
    file_size_limit bigint
);

CREATE TABLE IF NOT EXISTS storage.objects (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text,
    name      text,
    owner     uuid
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'student') THEN
        CREATE ROLE student NOLOGIN IN ROLE authenticated;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mr_walid') THEN
        CREATE ROLE mr_walid NOLOGIN IN ROLE authenticated;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin') THEN
        CREATE ROLE admin NOLOGIN IN ROLE authenticated;
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- Hosted-Supabase simulation: schema USAGE grants
-- The real project grants USAGE on auth/storage to anon/authenticated by
-- default; required here too for SECURITY INVOKER functions whose bodies
-- call auth.uid() directly (e.g. get_my_lesson_access) and for storage
-- bucket/object access by clients.
-- ---------------------------------------------------------------------
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT USAGE ON SCHEMA storage TO anon, authenticated;

-- Hosted-Supabase simulation: the real project grants ALL on
-- storage.buckets/storage.objects to anon/authenticated by default;
-- storage RLS policies are the enforcement (Phase 4: the 0015
-- pdfs_insert_row_backed policy is testable over these grants).
GRANT ALL ON TABLE storage.buckets TO anon, authenticated;
GRANT ALL ON TABLE storage.objects TO anon, authenticated;

-- ---------------------------------------------------------------------
-- Default privileges (hosted-Supabase simulation)
-- The real project starts with these grants (Supabase's base setup gives
-- anon/authenticated ALL on tables in the public schema); migrations then
-- enforce security via RLS + explicit REVOKEs (binding B2). Replicating
-- them here is REQUIRED for the harness: without them, SET ROLE-based
-- tests could not read any table at all (privilege check precedes RLS).
-- ---------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

-- ---------------------------------------------------------------------
-- assertion helpers (tests schema)
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated;

CREATE OR REPLACE FUNCTION tests.assert(p_cond boolean, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT COALESCE(p_cond, false) THEN
        RAISE EXCEPTION 'ASSERT FAILED: %', p_msg;
    END IF;
END $$;

-- Executes p_sql expecting a failure. When p_code is given the SQLSTATE
-- must match; when p_msg is given the error message must contain it.
CREATE OR REPLACE FUNCTION tests.expect_error(p_sql text, p_code text DEFAULT NULL, p_msg text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_err bool := false;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        v_err := true;
        IF p_code IS NOT NULL AND SQLSTATE <> p_code THEN
            RAISE EXCEPTION 'ASSERT FAILED: expected SQLSTATE % got % (%)', p_code, SQLSTATE, SQLERRM;
        END IF;
        IF p_msg IS NOT NULL AND position(p_msg in SQLERRM) = 0 THEN
            RAISE EXCEPTION 'ASSERT FAILED: expected message containing "%" got "%"', p_msg, SQLERRM;
        END IF;
    END;
    IF NOT v_err THEN
        RAISE EXCEPTION 'ASSERT FAILED: expected error (%:%) but statement succeeded', p_code, p_msg;
    END IF;
END $$;

-- Executes p_sql and asserts the affected row count.
CREATE OR REPLACE FUNCTION tests.expect_rows(p_sql text, p_expected int, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_rows int;
BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> p_expected THEN
        RAISE EXCEPTION 'ASSERT FAILED: % (expected % rows, got %)', p_msg, p_expected, v_rows;
    END IF;
END $$;

-- Executes p_sql (a scalar query such as SELECT count(*)...) and asserts
-- the VALUE of the first column of the single result row.
CREATE OR REPLACE FUNCTION tests.expect_count(p_sql text, p_expected int, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_value int;
BEGIN
    EXECUTE p_sql INTO v_value;
    IF v_value IS DISTINCT FROM p_expected THEN
        RAISE EXCEPTION 'ASSERT FAILED: % (expected %, got %)', p_msg, p_expected, v_value;
    END IF;
END $$;
