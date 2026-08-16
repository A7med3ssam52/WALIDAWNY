-- 0032_fix_code_generation_randomness.sql
-- ---------------------------------------------------------------------------
-- HOSTED-PLATFORM FIX: code generation failed with
--    42883: function gen_random_bytes(integer) does not exist
-- on Supabase because pgcrypto lives in the `extensions` schema there, while
-- create_unit_codes_internal (0028) pinned `search_path = public` (B1).
-- On local Postgres the harness installs pgcrypto INTO public, so the bug
-- only surfaced on the hosted platform.
--
-- Fix: repin the function's search_path to `public, extensions` — the
-- canonical Supabase pattern for SECURITY DEFINER functions that call
-- extension functions. `extensions` does not exist in the local harness,
-- but Postgres skips missing schemas during resolution, so gen_random_bytes
-- still resolves from public there (same behavior on both environments).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_unit_codes_internal(
    p_unit_pricing_id uuid,
    p_count integer,
    p_note text DEFAULT NULL
)
RETURNS SETOF public.unit_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_actor uuid := COALESCE(auth.uid(), NULLIF(current_setting('app.system_actor_id', true), '')::uuid);
    v_pricing_active boolean;
    v_code text;
    v_attempt int;
    v_inserted int := 0;
    v_row public.unit_codes%ROWTYPE;
BEGIN
    IF p_count < 1 OR p_count > 500 THEN
        RAISE EXCEPTION 'invalid_count';
    END IF;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'system_actor_required';
    END IF;

    SELECT is_active INTO v_pricing_active FROM public.unit_pricing WHERE id = p_unit_pricing_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_pricing_not_found';
    END IF;
    IF NOT v_pricing_active THEN
        RAISE EXCEPTION 'unit_inactive';
    END IF;

    v_attempt := 0;
    WHILE v_inserted < p_count AND v_attempt < p_count * 5 LOOP
        v_attempt := v_attempt + 1;
        v_code := 'WLDN-';
        FOR i IN 1..12 LOOP
            v_code := v_code || substr(v_chars, get_byte(gen_random_bytes(1), 0) % 32 + 1, 1);
        END LOOP;

        BEGIN
            INSERT INTO public.unit_codes (code, unit_pricing_id, created_by, note)
            VALUES (v_code, p_unit_pricing_id, v_actor, p_note)
            RETURNING * INTO v_row;
            v_inserted := v_inserted + 1;
            RETURN NEXT v_row;
        EXCEPTION WHEN unique_violation THEN
            NULL;
        END;
    END LOOP;

    IF v_inserted < p_count THEN
        RAISE EXCEPTION 'generation_failed';
    END IF;
    RETURN;
END $$;

-- Internal-only: keep the client surface locked (same posture as 0028).
REVOKE EXECUTE ON FUNCTION public.create_unit_codes_internal(uuid, integer, text) FROM PUBLIC;

COMMENT ON FUNCTION public.create_unit_codes_internal(uuid, integer, text) IS
'Generates WLDN-* codes for a pricing row (unambiguous charset A22, pgcrypto randomness). search_path = public, extensions so gen_random_bytes resolves on Supabase (extensions schema) and locally (public). Edge-Function-only entry: create_unit_codes_for_staff.';