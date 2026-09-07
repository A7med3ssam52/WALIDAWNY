-- =====================================================================
-- 0053_filter_deleted_pricing
-- Fix list_unit_pricing to exclude soft-deleted units (deleted_at IS NOT NULL).
-- Previously it returned pricing for deleted units (e.g., الباب الأول/الثاني
-- soft-deleted on 2026-09-02) which polluted the CodesPage dropdown and made
-- the default selected unit a deleted one, appearing as "no codes".
-- =====================================================================

DROP FUNCTION IF EXISTS public.list_unit_pricing();

CREATE OR REPLACE FUNCTION public.list_unit_pricing()
RETURNS TABLE (
    id uuid, unit_id uuid, base_price numeric(10, 2), platform_fee numeric(10, 2),
    total_price numeric(10, 2), is_active boolean, unit_name text, grade_name text,
    is_free boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT up.id, up.unit_id, up.base_price, up.platform_fee, up.total_price,
           up.is_active, u.name, g.name, u.is_free
    FROM public.unit_pricing up
    JOIN public.units u ON u.id = up.unit_id
    JOIN public.grades g ON g.id = u.grade_id
    WHERE u.deleted_at IS NULL
      AND g.deleted_at IS NULL
      AND g.is_active
      AND (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    UNION ALL
    SELECT NULL::uuid, u.id, 0::numeric(10,2), 0::numeric(10,2), 0::numeric(10,2),
           true, u.name, g.name, u.is_free
    FROM public.units u
    JOIN public.grades g ON g.id = u.grade_id
    WHERE u.is_free = true
      AND u.deleted_at IS NULL
      AND g.deleted_at IS NULL
      AND g.is_active
      AND NOT EXISTS (SELECT 1 FROM public.unit_pricing up2 WHERE up2.unit_id = u.id)
      AND (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    ORDER BY 8, 7;
$$;

REVOKE EXECUTE ON FUNCTION public.list_unit_pricing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_unit_pricing() TO authenticated;
COMMENT ON FUNCTION public.list_unit_pricing() IS 'Staff pricing list — excludes soft-deleted units (0053).';
