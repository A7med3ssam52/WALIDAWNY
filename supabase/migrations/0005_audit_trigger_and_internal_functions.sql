-- =====================================================================
-- 0005_audit_trigger_and_internal_functions
-- Phase 1 | Supabase Foundation | Database
-- audit_log() internal function + generic audit_trigger() attached to
-- the fixed 10-table inventory (MED-8). progress and notifications are
-- explicitly excluded. PII values (phone, guardian_phone, address) are
-- never written into audit metadata.
-- =====================================================================

-- ---------------------------------------------------------------------
-- audit_log(action, entity_type, entity_id, metadata)
-- Internal function - no client grants. Called by SECURITY DEFINER RPCs
-- and by audit_trigger(). actor_id NULL = system job.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_log(
    p_action text,
    p_entity_type text,
    p_entity_id uuid DEFAULT NULL,
    p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_role public.user_role := public.get_current_role();
    v_ip text;
BEGIN
    v_ip := NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';

    INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata, ip_address)
    VALUES (v_actor, v_role, p_action, p_entity_type, p_entity_id, p_metadata, v_ip);
END $$;

COMMENT ON FUNCTION public.audit_log(text, text, uuid, jsonb) IS 'Internal audit writer; no client grants. Never records PII values.';

-- ---------------------------------------------------------------------
-- audit_trigger()
-- AFTER INSERT/UPDATE/DELETE on the fixed inventory. Records the
-- actor, the action (table.operation), changed column names only for
-- UPDATEs, and old/new snapshots minus sensitive columns.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_changed text[];
    v_old jsonb;
    v_new jsonb;
    v_action text;
    v_entity_id uuid;
    v_metadata jsonb;
    v_sensitive text[] := '{}'::text[];
    v_ip text;
BEGIN
    IF TG_TABLE_NAME = 'profiles' THEN
        v_sensitive := ARRAY['phone', 'guardian_phone', 'address'];
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old := to_jsonb(OLD) - v_sensitive;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new := to_jsonb(NEW) - v_sensitive;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        SELECT COALESCE(array_agg(key), '{}'::text[]) INTO v_changed
        FROM (
            SELECT key
            FROM jsonb_each(to_jsonb(OLD)) o
            FULL OUTER JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
            WHERE o.value IS DISTINCT FROM n.value
        ) d;
    END IF;

    v_action := TG_TABLE_NAME || '.' || lower(TG_OP);
    -- app_settings is a key/value table without an id column.
    IF TG_TABLE_NAME = 'app_settings' THEN
        v_entity_id := NULL;
    ELSE
        v_entity_id := COALESCE(NEW.id, OLD.id);
    END IF;

    v_metadata := '{}'::jsonb;
    IF TG_OP = 'INSERT' THEN
        v_metadata := jsonb_build_object('new', v_new);
    ELSIF TG_OP = 'UPDATE' THEN
        v_metadata := jsonb_build_object('old', v_old, 'new', v_new, 'changed_fields', to_jsonb(v_changed));
    ELSE
        v_metadata := jsonb_build_object('old', v_old);
    END IF;

    v_ip := NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';

    INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata, ip_address)
    VALUES (auth.uid(), public.get_current_role(), v_action, TG_TABLE_NAME, v_entity_id, v_metadata, v_ip);

    RETURN COALESCE(NEW, OLD);
END $$;

-- ---------------------------------------------------------------------
-- Attach audit_trigger to the fixed 10-table inventory (MED-8).
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'profiles', 'grades', 'units', 'lessons', 'lesson_videos',
        'lesson_pdfs', 'pricing_plans', 'subscriptions',
        'subscription_codes', 'app_settings'
    ] LOOP
        -- Legacy tables may already be gone (0028 drops the subscription
        -- subsystem); skip missing tables instead of failing with 42P01.
        IF to_regclass(format('public.%I', v_table)) IS NULL THEN
            CONTINUE;
        END IF;
        EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON public.%I', v_table);
        EXECUTE format(
            'CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()',
            v_table
        );
    END LOOP;
END$$;
