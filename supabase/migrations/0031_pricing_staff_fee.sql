-- =====================================================================
-- 0031_pricing_staff_fee
-- Pricing model per owner decision: the TEACHER sets the base price for
-- each unit (also at creation time), the ADMIN sets ONE fixed platform
-- fee that is added automatically on top of every unit
-- (total = base_price + platform_fee, generated column).
--   * set_unit_price(uuid, numeric)   -> staff (teacher/mr_walid/admin)
--   * set_platform_fee(numeric)       -> ADMIN ONLY (global fixed fee)
--   * get_platform_fee()              -> public read (anon + auth)
-- Plus: create_lesson/update_lesson accept p_is_trial so the teacher can
-- mark the ONE free (trial) lesson per unit from the UI (decision: trial
-- lesson = free video; max one per unit enforced by lessons_trial_unique).
-- Reference: IMPLEMENTATION-PLAN.md section 3 (replaces decision J).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Supersede the old admin-only 3-arg set_unit_price (0028).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_unit_price(uuid, numeric, numeric);

-- ---------------------------------------------------------------------
-- 2) set_unit_price: staff sets the BASE price only; the platform fee
--    is always the admin's global fee (app_settings key 'platform_fee').
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
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.units WHERE id = p_unit_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    IF p_base_price < 0 THEN
        RAISE EXCEPTION 'invalid_price';
    END IF;

    INSERT INTO public.unit_pricing (unit_id, base_price, platform_fee)
    VALUES (p_unit_id, p_base_price, v_fee)
    ON CONFLICT (unit_id) DO UPDATE
    SET base_price = EXCLUDED.base_price
    RETURNING id INTO v_pricing_id;

    PERFORM public.audit_log('unit_pricing.set', 'unit_pricing', v_pricing_id,
        jsonb_build_object('unit_id', p_unit_id, 'base_price', p_base_price,
                           'platform_fee', v_fee));
END $$;

-- ---------------------------------------------------------------------
-- 3) set_platform_fee: ADMIN ONLY. One fixed fee for the platform,
--    applied to every unit's price (past and future rows).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_platform_fee(p_fee numeric(10, 2))
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_fee < 0 THEN
        RAISE EXCEPTION 'invalid_fee';
    END IF;

    INSERT INTO public.app_settings (key, value, description)
    VALUES ('platform_fee', to_jsonb(p_fee),
            'Fixed platform fee added on top of every unit price (admin-only)')
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        description = EXCLUDED.description,
        updated_at = now();

    UPDATE public.unit_pricing SET platform_fee = p_fee;

    PERFORM public.audit_log('platform_fee.set', 'app_settings', NULL,
        jsonb_build_object('platform_fee', p_fee));
END $$;

-- ---------------------------------------------------------------------
-- 4) get_platform_fee: public read (anon + authenticated) so the
--    landing page can show "base + fixed platform fee".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_fee()
RETURNS numeric(10, 2)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT (value::text)::numeric
           FROM public.app_settings WHERE key = 'platform_fee'),
        0
    )
$$;

-- ---------------------------------------------------------------------
-- 5) Lessons: p_is_trial support (free video per unit, teacher-chosen).
--    Old 4-arg signatures are dropped so no stale overload survives.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_lesson(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.update_lesson(uuid, text, text, integer);

CREATE OR REPLACE FUNCTION public.create_lesson(
    p_unit_id uuid,
    p_title text,
    p_description text DEFAULT NULL,
    p_sort_order integer DEFAULT 0,
    p_is_trial boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    INSERT INTO public.lessons (unit_id, title, description, sort_order, is_trial)
    VALUES (p_unit_id, btrim(p_title), p_description, p_sort_order, COALESCE(p_is_trial, false))
    RETURNING id INTO v_id;

    PERFORM public.audit_log('lesson.create', 'lesson', v_id,
        jsonb_build_object('unit_id', p_unit_id, 'is_trial', COALESCE(p_is_trial, false)));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_lesson(
    p_lesson_id uuid,
    p_title text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_sort_order integer DEFAULT NULL,
    p_is_trial boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons
    SET title = COALESCE(btrim(NULLIF(p_title, '')), title),
        description = COALESCE(p_description, description),
        sort_order = COALESCE(p_sort_order, sort_order),
        is_trial = COALESCE(p_is_trial, is_trial)
    WHERE id = p_lesson_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.update', 'lesson', p_lesson_id);
END $$;

-- ---------------------------------------------------------------------
-- 6) Grants (mirror the 0028/0010 matrix posture).
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.set_unit_price(uuid, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_unit_price(uuid, numeric) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_platform_fee(numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_platform_fee(numeric) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_platform_fee() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_fee() TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_lesson(uuid, text, text, integer, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_lesson(uuid, text, text, integer, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_lesson(uuid, text, text, integer, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_lesson(uuid, text, text, integer, boolean) TO authenticated;

-- ---------------------------------------------------------------------
-- 7) Documentation comments reflect the new model.
-- ---------------------------------------------------------------------
COMMENT ON TABLE public.unit_pricing IS 'Permanent per-unit pricing (teacher base price + fixed platform fee = generated total). Base via set_unit_price (staff); fee via set_platform_fee (admin only).';

COMMENT ON COLUMN public.lessons.is_trial IS 'Free trial lesson (one free video per unit, teacher-chosen; max one among live lessons).';