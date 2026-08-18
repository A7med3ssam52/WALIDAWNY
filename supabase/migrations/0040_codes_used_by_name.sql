-- 0040_codes_used_by_name.sql
-- list_codes_by_unit: include the student name who redeemed each code.
-- The function's return type changes from SETOF unit_codes to an explicit
-- TABLE that appends used_by_name (LEFT JOIN profiles on used_by).
-- PostgreSQL does not allow changing a function's return type, so the old
-- function must be dropped first (DROP FUNCTION removes its grants too;
-- the REVOKE/GRANT lines from 0028 are re-applied below).
-- NOTE: RETURNS TABLE introduces PL/pgSQL variables named like table
-- columns, so units.id MUST stay qualified inside the body (42702
-- "column reference id is ambiguous" otherwise).

DROP FUNCTION IF EXISTS public.list_codes_by_unit(uuid);

CREATE OR REPLACE FUNCTION public.list_codes_by_unit(p_unit_id uuid)
RETURNS TABLE (
    id              uuid,
    code            text,
    unit_pricing_id uuid,
    status          public.code_status,
    created_by      uuid,
    used_at         timestamptz,
    used_by         uuid,
    revoked_at      timestamptz,
    revoked_by      uuid,
    note            text,
    created_at      timestamptz,
    updated_at      timestamptz,
    used_by_name    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.units WHERE units.id = p_unit_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    RETURN QUERY
        SELECT uc.id, uc.code, uc.unit_pricing_id, uc.status, uc.created_by, uc.used_at,
               uc.used_by, uc.revoked_at, uc.revoked_by, uc.note, uc.created_at, uc.updated_at,
               p.full_name AS used_by_name
        FROM public.unit_codes uc
        JOIN public.unit_pricing up ON up.id = uc.unit_pricing_id
        LEFT JOIN public.profiles p ON p.id = uc.used_by
        WHERE up.unit_id = p_unit_id
        ORDER BY uc.created_at DESC;
END $$;

COMMENT ON FUNCTION public.list_codes_by_unit(uuid) IS
    'Staff: codes of a unit with the full name of the student who redeemed each used code (used_by_name is NULL until redeemed).';

REVOKE EXECUTE ON FUNCTION public.list_codes_by_unit(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_codes_by_unit(uuid) TO authenticated;