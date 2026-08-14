-- =====================================================================
-- 0001_extensions_and_enums
-- Phase 1 | Supabase Foundation | Database
-- Extensions and all enumerated types used across the schema.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_cron / pg_net are provided by the hosted Supabase platform.
-- On the local embedded-PostgreSQL harness they do not exist, so they
-- are intentionally guarded. Do NOT create stubs for them; all schema
-- objects that depend on them are gated behind IF EXISTS.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron;
    END IF;
END$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
        CREATE EXTENSION IF NOT EXISTS pg_net;
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- Enumerated types (exact member sets per DATABASE.md section 3).
-- Idempotent: CREATE TYPE has no IF NOT EXISTS in PostgreSQL, so each
-- enum is guarded on to_regtype (a re-run of the full schema in the
-- SQL editor is a no-op for already-created types).
-- ---------------------------------------------------------------------

DO $$
BEGIN
    IF to_regtype('public.user_role') IS NULL THEN
        CREATE TYPE public.user_role AS ENUM (
            'student',
            'mr_walid',
            'admin'
        );
    END IF;
END$$;

DO $$
BEGIN
    IF to_regtype('public.account_status') IS NULL THEN
        CREATE TYPE public.account_status AS ENUM (
            'active',
            'disabled'
        );
    END IF;
END$$;

DO $$
BEGIN
    IF to_regtype('public.subscription_status') IS NULL THEN
        CREATE TYPE public.subscription_status AS ENUM (
            'active',
            'expired'
        );
    END IF;
END$$;

DO $$
BEGIN
    IF to_regtype('public.code_status') IS NULL THEN
        CREATE TYPE public.code_status AS ENUM (
            'available',
            'used',
            'revoked'
        );
    END IF;
END$$;

DO $$
BEGIN
    IF to_regtype('public.content_status') IS NULL THEN
        CREATE TYPE public.content_status AS ENUM (
            'draft',
            'published',
            'hidden'
        );
    END IF;
END$$;

DO $$
BEGIN
    IF to_regtype('public.video_status') IS NULL THEN
        CREATE TYPE public.video_status AS ENUM (
            'pending_upload',
            'uploading',
            'processing',
            'ready',
            'failed',
            'replaced'
        );
    END IF;
END$$;

DO $$
BEGIN
    IF to_regtype('public.notification_type') IS NULL THEN
        CREATE TYPE public.notification_type AS ENUM (
            'subscription_activated',
            'subscription_expiring',
            'subscription_expired',
            'new_content',
            'system'
        );
    END IF;
END$$;
