-- =====================================================================
-- 0034_platform_fee_safe_update
-- Pricing | Hosted Supabase guardrails
-- Hosted projects enable "safe update" guardrails by default: any
-- UPDATE without a WHERE clause raises 21000 ("UPDATE requires a WHERE
-- clause") even inside SECURITY DEFINER functions. set_platform_fee
-- rewrites EVERY unit_pricing row, so its blanket UPDATE is now
-- expressed with an explicit predicate (unit_id IS NOT NULL == all rows).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_platform_fee(p_fee numeric(10, 2))
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_fee < 0 THEN
        RAISE EXCEPTION 'invalid_fee';
    END IF;

    INSERT INTO public.app_settings (key, value, description)
    VALUES ('platform_fee', to_jsonb(p_fee),
            'Fixed platform fee added on top of every unit price (owner/admin-only)')
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        description = EXCLUDED.description,
        updated_at = now();

    UPDATE public.unit_pricing SET platform_fee = p_fee WHERE unit_id IS NOT NULL;

    PERFORM public.audit_log('platform_fee.set', 'app_settings', NULL,
        jsonb_build_object('platform_fee', p_fee));
END $$;

COMMENT ON FUNCTION public.set_platform_fee(numeric) IS
    'One fixed platform fee added on top of every unit price (owner mr_walid or admin only; 0033; safe-update WHERE 0034).';