-- =====================================================================
-- 0051_free_units
-- Free units (doors) — when marked is_free=true the unit becomes free
-- for students (price 0, coupon price 0, badge مجاني). Covers:
--   * units.is_free column
--   * set_unit_free RPC (staff-only toggle + price zeroing)
--   * can_access_lesson updated to include free units
--   * RLS policies updated (units/lessons) to expose free content
--   * get_public_unit_prices / list_unit_pricing / get_my_lesson_access
--     updated to expose is_free and return zero prices for free units
--   * set_unit_price guard (reject non-zero for free units)
-- Reference: user request "أبواب مجانية — سعر الكوبون وسعر الباب صفر ومكتوب مجاني"
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) units.is_free
-- ---------------------------------------------------------------------
ALTER TABLE public.units
    ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.units.is_free IS 'When true the unit is free for all active students — price 0, coupon price 0, badge مجاني — no purchase required. Toggled via set_unit_free.';

-- ---------------------------------------------------------------------
-- 2) set_unit_free — staff-guarded toggle; when enabling free, ensure
--    pricing row exists with 0/0 so every price surface shows 0
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_unit_free(
    p_unit_id uuid,
    p_is_free boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_fee numeric(10,2);
    v_pricing_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.units WHERE id = p_unit_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    UPDATE public.units SET is_free = p_is_free WHERE id = p_unit_id;

    IF p_is_free THEN
        -- Force pricing to zero so coupons and price surfaces are 0
        INSERT INTO public.unit_pricing (unit_id, base_price, platform_fee, is_active)
        VALUES (p_unit_id, 0, 0, true)
        ON CONFLICT (unit_id) DO UPDATE
        SET base_price = 0,
            platform_fee = 0,
            is_active = true
        RETURNING id INTO v_pricing_id;

        -- If ON CONFLICT ... DO UPDATE did not RETURNING (older PG path),
        -- fetch the id
        IF v_pricing_id IS NULL THEN
            SELECT id INTO v_pricing_id FROM public.unit_pricing WHERE unit_id = p_unit_id;
        END IF;

        PERFORM public.audit_log('unit.free_set', 'unit', p_unit_id,
            jsonb_build_object('is_free', true, 'pricing_id', v_pricing_id));
    ELSE
        -- Un-free: keep pricing at 0 until staff sets a new price explicitly.
        -- Do not auto-restore old price to avoid surprise charges.
        PERFORM public.audit_log('unit.free_set', 'unit', p_unit_id,
            jsonb_build_object('is_free', false));
    END IF;
END $$;

COMMENT ON FUNCTION public.set_unit_free(uuid, boolean) IS 'Staff-guarded free-unit toggle; when enabling free, pricing is forced to 0/0 so coupons and all price surfaces show مجاني.';

REVOKE EXECUTE ON FUNCTION public.set_unit_free(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_unit_free(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Guard set_unit_price for free units — setting a non-zero price for
--    a free unit is rejected (must un-free first). Zero price is allowed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_unit_price(
    p_unit_id uuid,
    p_base_price numeric(10, 2)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_fee numeric(10, 2) := COALESCE(
        (SELECT (value::text)::numeric
           FROM public.app_settings WHERE key = 'platform_fee'),
        0
    );
    v_pricing_id uuid;
    v_is_free boolean;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.units WHERE id = p_unit_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    SELECT is_free INTO v_is_free FROM public.units WHERE id = p_unit_id;
    IF COALESCE(v_is_free, false) AND p_base_price <> 0 THEN
        RAISE EXCEPTION 'unit_is_free';
    END IF;

    IF p_base_price < 0 THEN
        RAISE EXCEPTION 'invalid_price';
    END IF;

    -- For free units force platform_fee 0 so total stays 0 regardless of global fee
    IF COALESCE(v_is_free, false) THEN
        v_fee := 0;
    END IF;

    INSERT INTO public.unit_pricing (unit_id, base_price, platform_fee)
    VALUES (p_unit_id, p_base_price, v_fee)
    ON CONFLICT (unit_id) DO UPDATE
    SET base_price = EXCLUDED.base_price,
        platform_fee = EXCLUDED.platform_fee
    RETURNING id INTO v_pricing_id;

    IF v_pricing_id IS NULL THEN
        SELECT id INTO v_pricing_id FROM public.unit_pricing WHERE unit_id = p_unit_id;
    END IF;

    PERFORM public.audit_log('unit_pricing.set', 'unit_pricing', v_pricing_id,
        jsonb_build_object('unit_id', p_unit_id, 'base_price', p_base_price,
                           'platform_fee', v_fee, 'is_free', COALESCE(v_is_free,false)));
END $$;

REVOKE EXECUTE ON FUNCTION public.set_unit_price(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_unit_price(uuid, numeric) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) can_access_lesson — add free-unit branch (u.is_free) alongside
--    trial. Free units are open to any active student for published
--    lesson+unit+active grade, no purchase needed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_lesson(p_lesson_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_grade_id uuid;
BEGIN
    IF v_uid IS NULL THEN
        RETURN false;
    END IF;
    IF public.is_admin() OR public.is_mr_walid() OR public.is_teacher() THEN
        RETURN EXISTS (SELECT 1 FROM public.lessons WHERE id = p_lesson_id AND deleted_at IS NULL);
    END IF;

    SELECT grade_id INTO v_grade_id
    FROM public.profiles
    WHERE id = v_uid
    LIMIT 1;

    RETURN EXISTS (
        SELECT 1
        FROM public.lessons l
        JOIN public.units u ON u.id = l.unit_id
        JOIN public.grades g ON g.id = u.grade_id
        WHERE l.id = p_lesson_id
          AND l.deleted_at IS NULL AND l.status = 'published'
          AND u.deleted_at IS NULL AND u.status = 'published'
          AND g.is_active AND g.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 FROM public.profiles p
              WHERE p.id = v_uid AND p.deleted_at IS NULL AND p.status = 'active'
          )
          AND (
              l.is_trial
              OR u.is_free
              OR (
                  EXISTS (
                      SELECT 1 FROM public.unit_purchases up
                      WHERE up.student_id = v_uid
                        AND up.unit_id = u.id
                        AND up.status = 'active'
                  )
                  AND u.grade_id = COALESCE(v_grade_id, u.grade_id)
              )
          )
    );
END $$;

COMMENT ON FUNCTION public.can_access_lesson(uuid) IS 'Lesson access: staff see any live lesson; students need published lesson+unit+active grade; trial lessons OR free units (u.is_free) are open to any active student, non-trial non-free require active purchase in own grade.';

GRANT EXECUTE ON FUNCTION public.can_access_lesson(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 4b) set_platform_fee — keep free units at 0 when global fee changes
-- ---------------------------------------------------------------------
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

    -- Do not overwrite free units — they stay 0/0
    UPDATE public.unit_pricing
    SET platform_fee = p_fee
    WHERE unit_id IS NOT NULL
      AND unit_id NOT IN (SELECT id FROM public.units WHERE is_free = true);

    PERFORM public.audit_log('platform_fee.set', 'app_settings', NULL,
        jsonb_build_object('platform_fee', p_fee));
END $$;

COMMENT ON FUNCTION public.set_platform_fee(numeric) IS 'One fixed platform fee added on top of every unit price (owner mr_walid or admin only; 0033; safe-update WHERE 0034) — free units keep 0.';

REVOKE EXECUTE ON FUNCTION public.set_platform_fee(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_platform_fee(numeric) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) RLS — add free-unit branches (student can SELECT free units and
--    their lessons even without own-grade purchase)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lessons_select_staff_or_published_own_grade ON public.lessons;
CREATE POLICY lessons_select_staff_or_published_own_grade ON public.lessons
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (
            public.is_student()
            AND status = 'published'
            AND deleted_at IS NULL
            AND unit_id IN (
                SELECT u.id FROM public.units u
                JOIN public.profiles p ON p.grade_id = u.grade_id
                WHERE p.id = auth.uid()
                  AND u.grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
                  AND u.status = 'published'
                  AND u.deleted_at IS NULL
            )
        )
        OR (
            public.is_student()
            AND is_trial = true
            AND status = 'published'
            AND deleted_at IS NULL
            AND unit_id IN (
                SELECT id FROM public.units
                WHERE status = 'published' AND deleted_at IS NULL
                  AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            )
        )
        OR (
            public.is_student()
            AND status = 'published'
            AND deleted_at IS NULL
            AND unit_id IN (
                SELECT id FROM public.units
                WHERE is_free = true
                  AND status = 'published' AND deleted_at IS NULL
                  AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            )
        )
    );

DROP POLICY IF EXISTS units_select_staff_or_published_own_grade ON public.units;
CREATE POLICY units_select_staff_or_published_own_grade ON public.units
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (
            public.is_student()
            AND grade_id IN (
                SELECT p.grade_id FROM public.profiles p WHERE p.id = auth.uid()
            )
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            AND status = 'published'
            AND deleted_at IS NULL
        )
        OR (
            public.is_student()
            AND status = 'published'
            AND deleted_at IS NULL
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            AND EXISTS (
                SELECT 1 FROM public.lessons l
                WHERE l.unit_id = units.id
                  AND l.is_trial = true
                  AND l.status = 'published'
                  AND l.deleted_at IS NULL
            )
        )
        OR (
            public.is_student()
            AND is_free = true
            AND status = 'published'
            AND deleted_at IS NULL
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
        )
    );

-- ---------------------------------------------------------------------
-- 6) get_public_unit_prices — expose is_free and force 0 prices for free
--    units (LEFT JOIN so free units without a pricing row still appear as 0)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_public_unit_prices();

CREATE OR REPLACE FUNCTION public.get_public_unit_prices()
RETURNS TABLE (
    unit_id uuid, unit_name text, grade_name text,
    base_price numeric(10, 2), platform_fee numeric(10, 2), total_price numeric(10, 2),
    is_free boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT u.id AS unit_id, u.name AS unit_name, g.name AS grade_name,
           CASE WHEN u.is_free THEN 0 ELSE COALESCE(up.base_price, 0) END AS base_price,
           CASE WHEN u.is_free THEN 0 ELSE COALESCE(up.platform_fee, 0) END AS platform_fee,
           CASE WHEN u.is_free THEN 0 ELSE COALESCE(up.total_price, 0) END AS total_price,
           u.is_free AS is_free
    FROM public.units u
    JOIN public.grades g ON g.id = u.grade_id
    LEFT JOIN public.unit_pricing up ON up.unit_id = u.id AND up.is_active
    WHERE u.status = 'published' AND u.deleted_at IS NULL
      AND g.is_active AND g.deleted_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_unit_prices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_unit_prices() TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 7) list_unit_pricing — add is_free to the returned table (exposes free
--    units even without a pricing row — UNION fallback)
-- ---------------------------------------------------------------------
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
    WHERE (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    UNION ALL
    SELECT NULL::uuid, u.id, 0::numeric(10,2), 0::numeric(10,2), 0::numeric(10,2),
           true, u.name, g.name, u.is_free
    FROM public.units u
    JOIN public.grades g ON g.id = u.grade_id
    WHERE u.is_free = true
      AND u.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.unit_pricing up2 WHERE up2.unit_id = u.id)
      AND (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    ORDER BY 8, 7;
$$;

REVOKE EXECUTE ON FUNCTION public.list_unit_pricing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_unit_pricing() TO authenticated;

-- ---------------------------------------------------------------------
-- 8) get_my_lesson_access — include is_free and force price 0 for free
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_my_lesson_access(uuid);

CREATE OR REPLACE FUNCTION public.get_my_lesson_access(p_lesson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_lesson_id uuid;
    v_unit_id uuid;
    v_unit_name text;
    v_is_trial boolean;
    v_is_free boolean;
    v_has_purchase boolean;
    v_price numeric(10, 2);
BEGIN
    SELECT l.id, l.unit_id, l.is_trial, u.name, u.is_free
    INTO v_lesson_id, v_unit_id, v_is_trial, v_unit_name, v_is_free
    FROM public.lessons l
    JOIN public.units u ON u.id = l.unit_id
    WHERE l.id = p_lesson_id AND l.deleted_at IS NULL;

    IF v_lesson_id IS NULL THEN
        RETURN jsonb_build_object(
            'has_access', false, 'has_purchase', false, 'is_trial', false, 'is_free', false,
            'unit_id', NULL::uuid, 'unit_name', NULL::text, 'price', NULL::numeric);
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.unit_purchases
        WHERE student_id = v_uid AND unit_id = v_unit_id AND status = 'active'
    ) INTO v_has_purchase;

    IF COALESCE(v_is_free, false) THEN
        v_price := 0;
    ELSE
        SELECT total_price INTO v_price
        FROM public.unit_pricing
        WHERE unit_id = v_unit_id AND is_active;
    END IF;

    RETURN jsonb_build_object(
        'has_access', public.can_access_lesson(p_lesson_id),
        'has_purchase', v_has_purchase,
        'is_trial', COALESCE(v_is_trial, false),
        'is_free', COALESCE(v_is_free, false),
        'unit_id', v_unit_id,
        'unit_name', v_unit_name,
        'price', v_price);
END $$;

REVOKE EXECUTE ON FUNCTION public.get_my_lesson_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_lesson_access(uuid) TO authenticated;
