-- =====================================================================
-- 0033_platform_fee_owner_access
-- Pricing | Owner access
-- The fixed platform fee (set_platform_fee) was ADMIN ONLY, but the
-- platform has no real admin account: Walid Awny (mr_walid) is the
-- owner. Allow mr_walid OR admin to set the fee; teachers/students
-- stay denied (verified by the harness in 04_business.sql).
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

    UPDATE public.unit_pricing SET platform_fee = p_fee;

    PERFORM public.audit_log('platform_fee.set', 'app_settings', NULL,
        jsonb_build_object('platform_fee', p_fee));
END $$;

COMMENT ON FUNCTION public.set_platform_fee(numeric) IS
    'One fixed platform fee added on top of every unit price (owner mr_walid or admin only; 0033).';
