-- =====================================================================
-- 0028_units_purchase
-- Phase 1 | Units Purchase | Database
-- Replaces the time-based subscription system (pricing_plans /
-- subscriptions / subscription_codes / code_redemptions) with PERMANENT
-- per-unit purchases via codes only:
--   unit_pricing    -> unit_codes -> unit_purchases (no expires_at)
-- plus trial lessons (lessons.is_trial). Reference:
-- IMPLEMENTATION-PLAN.md section 3.
--
-- Append-only migration: nothing in 0001..0027 is modified. All steps
-- below run in the exact order required by the plan (IMPLEMENTATION-
-- PLAN.md section 3.1).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) New enum: unit_purchase_status (additive - no conflict).
-- ---------------------------------------------------------------------
CREATE TYPE public.unit_purchase_status AS ENUM ('active', 'void');

-- ---------------------------------------------------------------------
-- 2) Cleanup BEFORE rebuilding notification_type: remove legacy
--    subscription notification rows and the expiry setting, then rebuild
--    the enum (ALTER COLUMN TYPE fails while old values remain).
-- ---------------------------------------------------------------------
DELETE FROM public.notifications
WHERE type IN ('subscription_activated', 'subscription_expiring', 'subscription_expired');

DELETE FROM public.app_settings WHERE key = 'expiry_warning_days';

-- ---------------------------------------------------------------------
-- 3) Rebuild notification_type: subscription_* -> unit_activated.
--    Phase 6/7 add exam_submitted/exam_graded then lesson_comment/
--    comment_reply via ALTER TYPE ... ADD VALUE (NOT here).
-- ---------------------------------------------------------------------
CREATE TYPE public.notification_type_new AS ENUM ('new_content', 'unit_activated', 'system');

ALTER TABLE public.notifications
    ALTER COLUMN type TYPE public.notification_type_new
    USING (type::text::public.notification_type_new);

DROP TYPE public.notification_type;
ALTER TYPE public.notification_type_new RENAME TO notification_type;

-- ---------------------------------------------------------------------
-- 4) New tables (per-unit pricing, codes, permanent purchases).
--    Prices are snapshotted from unit_pricing at activation (P12);
--    NO expires_at / duration_days anywhere.
-- ---------------------------------------------------------------------
CREATE TABLE public.unit_pricing (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id      uuid NOT NULL UNIQUE REFERENCES public.units(id) ON DELETE CASCADE,
    base_price   numeric(10, 2) NOT NULL CHECK (base_price >= 0),
    platform_fee numeric(10, 2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
    total_price  numeric(10, 2) GENERATED ALWAYS AS (base_price + platform_fee) STORED,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.unit_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_pricing FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.unit_pricing IS 'Permanent per-unit pricing (base + platform fee = generated total). Upserted via set_unit_price (admin only).';

CREATE TABLE public.unit_codes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code            text NOT NULL UNIQUE CHECK (code ~ '^WLDN-[A-Z0-9]{8,12}$'),
    unit_pricing_id uuid NOT NULL REFERENCES public.unit_pricing(id) ON DELETE RESTRICT,
    status          public.code_status NOT NULL DEFAULT 'available',
    created_by      uuid NOT NULL REFERENCES auth.users(id),
    used_at         timestamptz,
    used_by         uuid REFERENCES public.profiles(id),
    revoked_at      timestamptz,
    revoked_by      uuid REFERENCES auth.users(id),
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX unit_codes_pricing_id_idx    ON public.unit_codes(unit_pricing_id);
CREATE INDEX unit_codes_status_idx        ON public.unit_codes(status);

ALTER TABLE public.unit_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_codes FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.unit_codes IS 'Redeemable per-unit codes: stored uppercase, unambiguous charset, one-time redemption (status -> used). Students never see raw codes.';

CREATE TABLE public.unit_purchases (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    unit_id       uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    base_price    numeric(10, 2) NOT NULL CHECK (base_price >= 0),
    platform_fee  numeric(10, 2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
    total_price   numeric(10, 2) GENERATED ALWAYS AS (base_price + platform_fee) STORED,
    code_id       uuid REFERENCES public.unit_codes(id) ON DELETE SET NULL,
    status        public.unit_purchase_status NOT NULL DEFAULT 'active',
    purchased_at  timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX unit_purchases_student_unit_uniq ON public.unit_purchases(student_id, unit_id);
CREATE INDEX unit_purchases_student_idx ON public.unit_purchases(student_id);
CREATE INDEX unit_purchases_unit_idx    ON public.unit_purchases(unit_id);

ALTER TABLE public.unit_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_purchases FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.unit_purchases IS 'PERMANENT per-unit purchases (no expiry). Writes exclusively via SECURITY DEFINER RPCs (redeem_unit_code); direct client INSERT blocked by the insert_via_rpc policy.';

-- ---------------------------------------------------------------------
-- 4b) RLS policies (named style of 0009/0025). No DML policies on any of
--     the three tables: writes go exclusively through SECURITY DEFINER
--     RPCs. anon never evaluates helper functions in a policy - its only
--     price surface is the RPC get_public_unit_prices().
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS unit_pricing_select_staff_or_active_students ON public.unit_pricing;
CREATE POLICY unit_pricing_select_staff_or_active_students ON public.unit_pricing
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (
            public.is_student()
            AND is_active
            AND unit_id IN (
                SELECT u.id FROM public.units u
                WHERE u.status = 'published' AND u.deleted_at IS NULL
                  AND u.grade_id = (SELECT p.grade_id FROM public.profiles p WHERE p.id = auth.uid())
                  AND u.grade_id IN (SELECT g.id FROM public.grades g WHERE g.is_active AND g.deleted_at IS NULL)
            )
        )
    );

DROP POLICY IF EXISTS unit_codes_select_staff ON public.unit_codes;
CREATE POLICY unit_codes_select_staff ON public.unit_codes
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS unit_purchases_select_own_or_staff ON public.unit_purchases;
CREATE POLICY unit_purchases_select_own_or_staff ON public.unit_purchases
    FOR SELECT
    USING (student_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- Extra shield: no raw INSERT from any client role; only SECURITY
-- DEFINER functions (owner postgres, superuser - RLS bypassed) write.
DROP POLICY IF EXISTS unit_purchases_insert_via_rpc ON public.unit_purchases;
CREATE POLICY unit_purchases_insert_via_rpc ON public.unit_purchases
    FOR INSERT
    WITH CHECK (false);

-- ---------------------------------------------------------------------
-- 5) lessons: trial-lesson flag + partial unique index (max one trial
--    per unit among live lessons).
-- ---------------------------------------------------------------------
ALTER TABLE public.lessons
    ADD COLUMN is_trial boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX lessons_trial_unique
    ON public.lessons(unit_id)
    WHERE is_trial AND deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 6) Extend the set_updated_at application list (0004) with the two new
--    tables that carry updated_at. unit_purchases is intentionally NOT
--    added (no updated_at column - set_updated_at() writes it blindly).
--    Extend the audit_trigger inventory (0005) with all three new tables
--    (entity_type is free text - no CHECK/CASE to update, 0005/0019 use
--    substring matching only).
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON public.unit_pricing;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.unit_pricing
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.unit_codes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.unit_codes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'unit_pricing', 'unit_codes', 'unit_purchases'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON public.%I', v_table);
        EXECUTE format(
            'CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()',
            v_table
        );
    END LOOP;
END$$;

-- ---------------------------------------------------------------------
-- 7) Rewrite can_access_lesson: staff see any live lesson; students need
--    published lesson+unit in their own active grade, plus an active unit
--    purchase OR a trial lesson. Existing grants (authenticated, 0010)
--    are preserved by CREATE OR REPLACE.
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
BEGIN
    IF v_uid IS NULL THEN
        RETURN false;
    END IF;
    IF public.is_admin() OR public.is_mr_walid() OR public.is_teacher() THEN
        RETURN EXISTS (SELECT 1 FROM public.lessons WHERE id = p_lesson_id AND deleted_at IS NULL);
    END IF;
    RETURN EXISTS (
        SELECT 1
        FROM public.lessons l
        JOIN public.units u      ON u.id = l.unit_id
        JOIN public.profiles p   ON p.id = v_uid
        JOIN public.grades g     ON g.id = p.grade_id
        WHERE l.id = p_lesson_id
          AND l.deleted_at IS NULL AND l.status = 'published'
          AND u.deleted_at IS NULL AND u.status = 'published'
          AND g.is_active AND g.deleted_at IS NULL
          AND p.deleted_at IS NULL AND p.status = 'active'
          AND (l.is_trial OR EXISTS (
              SELECT 1 FROM public.unit_purchases up
              WHERE up.student_id = v_uid
                AND up.unit_id = u.id
                AND up.status = 'active'
          ))
    );
END $$;

COMMENT ON FUNCTION public.can_access_lesson(uuid) IS
    'Lesson access: staff see any live lesson; students need published lesson+unit in their own active grade, plus an active unit purchase OR a trial lesson.';

-- set_lesson_trial: staff-guarded trial toggle with atomic clear of any
-- previous trial in the same unit (decision D).
CREATE OR REPLACE FUNCTION public.set_lesson_trial(p_lesson_id uuid, p_is_trial boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_unit uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT unit_id INTO v_unit
    FROM public.lessons WHERE id = p_lesson_id AND deleted_at IS NULL;
    IF v_unit IS NULL THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    -- Clear any previous trial in the unit first, then (optionally) set
    -- the target - guarantees the partial unique index is never violated
    -- mid-statement.
    UPDATE public.lessons SET is_trial = false
    WHERE unit_id = v_unit AND deleted_at IS NULL AND is_trial;

    IF p_is_trial THEN
        UPDATE public.lessons SET is_trial = true
        WHERE id = p_lesson_id AND deleted_at IS NULL;
    END IF;

    PERFORM public.audit_log('unit.trial_set', 'lesson', p_lesson_id,
        jsonb_build_object('is_trial', p_is_trial));
END $$;

COMMENT ON FUNCTION public.set_lesson_trial(uuid, boolean) IS 'Staff-guarded trial toggle; at most one trial lesson per unit (partial unique index).';

-- ---------------------------------------------------------------------
-- 8a) New unit functions. Created BEFORE dropping the subscription
--     functions so the migration never hangs on references.
-- ---------------------------------------------------------------------
-- Student: redeem a unit code (permanent purchase).
CREATE OR REPLACE FUNCTION public.redeem_unit_code(p_code text)
RETURNS public.unit_purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code text := upper(btrim(p_code));
    v_student uuid := auth.uid();
    v_grade uuid;
    v_code_row public.unit_codes%ROWTYPE;
    v_pricing public.unit_pricing%ROWTYPE;
    v_unit public.units%ROWTYPE;
    v_purchase public.unit_purchases%ROWTYPE;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('wldn_redeem_unit:' || COALESCE(v_code, '')));

    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF v_code IS NULL OR v_code = '' THEN
        RAISE EXCEPTION 'code_not_found';
    END IF;

    SELECT * INTO v_code_row
    FROM public.unit_codes
    WHERE code = v_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'code_not_found';
    END IF;

    SELECT * INTO v_pricing FROM public.unit_pricing WHERE id = v_code_row.unit_pricing_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;
    IF NOT v_pricing.is_active THEN
        RAISE EXCEPTION 'unit_inactive';
    END IF;

    SELECT * INTO v_unit FROM public.units WHERE id = v_pricing.unit_id;
    IF v_unit.id IS NULL OR v_unit.deleted_at IS NOT NULL OR v_unit.status <> 'published' THEN
        RAISE EXCEPTION 'unit_inactive';
    END IF;

    IF v_code_row.status = 'revoked' THEN
        RAISE EXCEPTION 'code_revoked';
    END IF;
    IF v_code_row.status = 'used' THEN
        RAISE EXCEPTION 'code_already_used';
    END IF;

    SELECT grade_id INTO v_grade
    FROM public.profiles
    WHERE id = v_student AND role = 'student' AND deleted_at IS NULL;
    IF v_grade IS NULL THEN
        RAISE EXCEPTION 'no_grade_assigned';
    END IF;

    IF v_unit.grade_id <> v_grade THEN
        RAISE EXCEPTION 'unit_not_in_student_grade';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.unit_purchases
        WHERE student_id = v_student AND unit_id = v_unit.id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'unit_already_purchased';
    END IF;

    INSERT INTO public.unit_purchases (
        student_id, unit_id, base_price, platform_fee, code_id, status
    )
    VALUES (
        v_student, v_unit.id, v_pricing.base_price, v_pricing.platform_fee,
        v_code_row.id, 'active'
    )
    RETURNING * INTO v_purchase;

    UPDATE public.unit_codes
    SET status = 'used', used_at = now(), used_by = v_student
    WHERE id = v_code_row.id;

    PERFORM public.audit_log('unit_purchase.create', 'unit_purchases', v_purchase.id,
        jsonb_build_object('unit_id', v_unit.id, 'price', v_purchase.total_price));

    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    VALUES (v_student, 'unit_activated', 'تم تفعيل الوحدة', v_unit.name,
            'unit_activated:' || v_purchase.id, 'unit_purchases', v_purchase.id)
    ON CONFLICT (dedup_key) DO NOTHING;

    RETURN v_purchase;
END $$;

-- Student: my purchases (own rows via RLS).
CREATE OR REPLACE FUNCTION public.get_my_unit_purchases()
RETURNS SETOF public.unit_purchases
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT * FROM public.unit_purchases
    WHERE student_id = auth.uid()
    ORDER BY purchased_at DESC;
$$;

-- Student/staff/EF: lesson access info for the lesson player gates.
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
    v_has_purchase boolean;
    v_price numeric(10, 2);
BEGIN
    SELECT l.id, l.unit_id, l.is_trial, u.name
    INTO v_lesson_id, v_unit_id, v_is_trial, v_unit_name
    FROM public.lessons l
    JOIN public.units u ON u.id = l.unit_id
    WHERE l.id = p_lesson_id AND l.deleted_at IS NULL;

    IF v_lesson_id IS NULL THEN
        RETURN jsonb_build_object(
            'has_access', false, 'has_purchase', false, 'is_trial', false,
            'unit_id', NULL::uuid, 'unit_name', NULL::text, 'price', NULL::numeric);
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.unit_purchases
        WHERE student_id = v_uid AND unit_id = v_unit_id AND status = 'active'
    ) INTO v_has_purchase;

    SELECT total_price INTO v_price
    FROM public.unit_pricing
    WHERE unit_id = v_unit_id AND is_active;

    RETURN jsonb_build_object(
        'has_access', public.can_access_lesson(p_lesson_id),
        'has_purchase', v_has_purchase,
        'is_trial', COALESCE(v_is_trial, false),
        'unit_id', v_unit_id,
        'unit_name', v_unit_name,
        'price', v_price);
END $$;

-- Staff code functions.
-- create_unit_codes_internal: no client grants; actor via auth.uid() or
-- app.system_actor_id (same posture as the 0014 wrapper fix).
CREATE OR REPLACE FUNCTION public.create_unit_codes_internal(
    p_unit_pricing_id uuid,
    p_count integer,
    p_note text DEFAULT NULL
)
RETURNS SETOF public.unit_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Staff-guarded wrapper over create_unit_codes_internal (replaces the
-- subscription create_codes_for_staff, 0014).
CREATE OR REPLACE FUNCTION public.create_unit_codes_for_staff(
    p_unit_id uuid,
    p_count integer,
    p_note text DEFAULT NULL
)
RETURNS SETOF public.unit_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pricing_id uuid;
    v_pricing_active boolean;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.units WHERE id = p_unit_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    SELECT id, is_active INTO v_pricing_id, v_pricing_active
    FROM public.unit_pricing WHERE unit_id = p_unit_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;
    IF NOT v_pricing_active THEN
        RAISE EXCEPTION 'unit_inactive';
    END IF;

    RETURN QUERY SELECT * FROM public.create_unit_codes_internal(v_pricing_id, p_count, p_note);
END $$;

-- Staff: codes of a unit (validation + count caps stay in the internal fn).
CREATE OR REPLACE FUNCTION public.list_codes_by_unit(p_unit_id uuid)
RETURNS SETOF public.unit_codes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.units WHERE id = p_unit_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    RETURN QUERY
        SELECT uc.*
        FROM public.unit_codes uc
        JOIN public.unit_pricing up ON up.id = uc.unit_pricing_id
        WHERE up.unit_id = p_unit_id
        ORDER BY uc.created_at DESC;
END $$;

-- Staff: revoke an available code (used codes are NOT revocable).
CREATE OR REPLACE FUNCTION public.revoke_unit_code(p_code_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prev public.code_status;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT status INTO v_prev FROM public.unit_codes WHERE id = p_code_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'code_not_found';
    END IF;
    IF v_prev = 'used' THEN
        RAISE EXCEPTION 'code_already_used';
    END IF;
    IF v_prev = 'revoked' THEN
        RAISE EXCEPTION 'code_not_revocable';
    END IF;

    UPDATE public.unit_codes
    SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
    WHERE id = p_code_id AND status = 'available';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'code_not_revocable';
    END IF;

    PERFORM public.audit_log('unit_code.revoke', 'unit_codes', p_code_id,
        jsonb_build_object('previous_status', v_prev));
END $$;

-- Pricing functions.
-- set_unit_price: ADMIN ONLY (decision J - teachers never modify prices).
CREATE OR REPLACE FUNCTION public.set_unit_price(
    p_unit_id uuid,
    p_base_price numeric(10, 2),
    p_platform_fee numeric(10, 2) DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pricing_id uuid;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.units WHERE id = p_unit_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    IF p_base_price < 0 OR p_platform_fee < 0 THEN
        RAISE EXCEPTION 'invalid_price';
    END IF;

    INSERT INTO public.unit_pricing (unit_id, base_price, platform_fee)
    VALUES (p_unit_id, p_base_price, p_platform_fee)
    ON CONFLICT (unit_id) DO UPDATE
    SET base_price = EXCLUDED.base_price,
        platform_fee = EXCLUDED.platform_fee
    RETURNING id INTO v_pricing_id;

    PERFORM public.audit_log('unit_pricing.set', 'unit_pricing', v_pricing_id,
        jsonb_build_object('unit_id', p_unit_id, 'base_price', p_base_price,
                           'platform_fee', p_platform_fee));
END $$;

-- Staff: full pricing list with unit + grade names.
CREATE OR REPLACE FUNCTION public.list_unit_pricing()
RETURNS TABLE (
    id uuid, unit_id uuid, base_price numeric(10, 2), platform_fee numeric(10, 2),
    total_price numeric(10, 2), is_active boolean, unit_name text, grade_name text
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

    RETURN QUERY
        SELECT up.id, up.unit_id, up.base_price, up.platform_fee, up.total_price,
               up.is_active, u.name, g.name
        FROM public.unit_pricing up
        JOIN public.units u ON u.id = up.unit_id
        JOIN public.grades g ON g.id = u.grade_id
        ORDER BY g.sort_order, u.sort_order;
END $$;

-- Public (anon + authenticated): active prices of published units on live
-- grades (decision M) - the landing-page price surface.
CREATE OR REPLACE FUNCTION public.get_public_unit_prices()
RETURNS TABLE (
    unit_id uuid, unit_name text, grade_name text,
    base_price numeric(10, 2), platform_fee numeric(10, 2), total_price numeric(10, 2)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT u.id AS unit_id, u.name AS unit_name, g.name AS grade_name,
           up.base_price, up.platform_fee, up.total_price
    FROM public.unit_pricing up
    JOIN public.units u ON u.id = up.unit_id
    JOIN public.grades g ON g.id = u.grade_id
    WHERE up.is_active
      AND u.status = 'published' AND u.deleted_at IS NULL
      AND g.is_active AND g.deleted_at IS NULL;
$$;

-- Stats functions.
-- Staff: all purchases, optionally filtered by student (with names).
CREATE OR REPLACE FUNCTION public.list_all_unit_purchases(p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
    id uuid, student_id uuid, unit_id uuid, base_price numeric(10, 2),
    platform_fee numeric(10, 2), total_price numeric(10, 2), code_id uuid,
    status public.unit_purchase_status, purchased_at timestamptz,
    unit_name text, grade_name text
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

    RETURN QUERY
        SELECT up.id, up.student_id, up.unit_id, up.base_price, up.platform_fee,
               up.total_price, up.code_id, up.status, up.purchased_at,
               u.name, g.name
        FROM public.unit_purchases up
        JOIN public.units u ON u.id = up.unit_id
        JOIN public.grades g ON g.id = u.grade_id
        WHERE (p_student_id IS NULL OR up.student_id = p_student_id)
        ORDER BY up.purchased_at DESC;
END $$;

-- Staff: purchase analytics JSON.
CREATE OR REPLACE FUNCTION public.unit_purchase_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stats jsonb;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT jsonb_build_object(
        'total_purchases', (SELECT count(*) FROM public.unit_purchases WHERE status = 'active'),
        'total_revenue', (SELECT COALESCE(sum(total_price), 0) FROM public.unit_purchases WHERE status = 'active'),
        'revenue_this_month', (SELECT COALESCE(sum(total_price), 0) FROM public.unit_purchases
                               WHERE status = 'active' AND purchased_at >= date_trunc('month', now())),
        'by_grade', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'grade_name', r.grade_name, 'purchases', r.purchases, 'revenue', r.revenue
            ) ORDER BY r.sort_order)
            FROM (
                SELECT g.name AS grade_name, g.sort_order,
                       count(DISTINCT up.id) AS purchases,
                       COALESCE(sum(up.total_price), 0) AS revenue
                FROM public.unit_purchases up
                JOIN public.units u ON u.id = up.unit_id
                JOIN public.grades g ON g.id = u.grade_id
                WHERE up.status = 'active'
                GROUP BY g.id, g.name, g.sort_order
            ) r
        ), '[]'::jsonb),
        'top_units', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'unit_name', r.unit_name, 'purchases', r.purchases, 'revenue', r.revenue
            ) ORDER BY r.revenue DESC)
            FROM (
                SELECT u.name AS unit_name,
                       count(DISTINCT up.id) AS purchases,
                       COALESCE(sum(up.total_price), 0) AS revenue
                FROM public.unit_purchases up
                JOIN public.units u ON u.id = up.unit_id
                WHERE up.status = 'active'
                GROUP BY u.id, u.name
                ORDER BY revenue DESC
                LIMIT 5
            ) r
        ), '[]'::jsonb)
    ) INTO v_stats;

    RETURN v_stats;
END $$;

-- ---------------------------------------------------------------------
-- 8b) DROP the subscription functions (original signatures from
--     0006/0007/0014/0022/0025; verified against each source).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.redeem_subscription_code(text);
DROP FUNCTION IF EXISTS public.get_my_subscriptions();
DROP FUNCTION IF EXISTS public.get_my_current_subscription();
DROP FUNCTION IF EXISTS public.revoke_subscription_code(uuid);
DROP FUNCTION IF EXISTS public.create_manual_subscription(uuid, uuid, timestamptz, text);
DROP FUNCTION IF EXISTS public.set_pricing_plan(uuid, integer, numeric, numeric, boolean);
DROP FUNCTION IF EXISTS public.delete_pricing_plan(uuid);
DROP FUNCTION IF EXISTS public.expire_subscriptions();
DROP FUNCTION IF EXISTS public.create_codes_for_staff(uuid, integer, text);
DROP FUNCTION IF EXISTS public.generate_codes_internal(uuid, integer, text);

-- ---------------------------------------------------------------------
-- 9) Views (order is MANDATORY): redefine the student/stats views
--    without any v_active_subscriptions dependency FIRST, then drop
--    v_active_subscriptions. v_lesson_stats / v_audit_log are unchanged
--    (no references to removed columns). v_lesson_access must be
--    DROPPED+recreated (not CREATE OR REPLACE): lessons gained is_trial,
--    which shifts the l.* column expansion and would "rename" the
--    trailing can_access column.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_lesson_access;
CREATE VIEW public.v_lesson_access AS
SELECT l.*, public.can_access_lesson(l.id) AS can_access
FROM public.lessons l
JOIN public.units u ON u.id = l.unit_id
WHERE l.status = 'published' AND l.deleted_at IS NULL
  AND u.status = 'published' AND u.deleted_at IS NULL;

COMMENT ON VIEW public.v_lesson_access IS 'Lesson list with live access flag (new can_access_lesson: unit purchase or trial). Staff can read all published rows; students see published lessons of their own live grade only via RLS on lessons.';

-- Decision E: progress aggregates count ONLY lessons of the student's
-- purchased units, excluding trial lessons from numerator and denominator.
CREATE OR REPLACE VIEW public.v_student_progress_summary AS
SELECT p.student_id, g.id AS grade_id, u.id AS unit_id,
       ROUND(AVG(p.percent_completed), 2) AS percent,
       COUNT(*) FILTER (WHERE p.is_completed) AS completed_lessons,
       COUNT(*) AS total_lessons
FROM public.progress p
JOIN public.lessons l ON l.id = p.lesson_id AND l.deleted_at IS NULL AND NOT l.is_trial
JOIN public.units u ON u.id = l.unit_id AND u.deleted_at IS NULL
JOIN public.grades g ON g.id = u.grade_id AND g.deleted_at IS NULL
JOIN public.unit_purchases up
      ON up.student_id = p.student_id AND up.unit_id = u.id AND up.status = 'active'
GROUP BY p.student_id, g.id, u.id;

COMMENT ON VIEW public.v_student_progress_summary IS 'Per-student percent + completion counts per grade/unit over PURCHASED units only; trial lessons excluded (decision E).';

-- v_dashboard_metrics: no subscription columns; fed from unit_purchases.
-- DROPPED+recreated (CREATE OR REPLACE cannot drop the removed
-- subscription columns).
DROP VIEW IF EXISTS public.v_dashboard_metrics;
CREATE VIEW public.v_dashboard_metrics AS
SELECT
  (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL)                         AS total_students,
  (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'active')   AS active_students,
  (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'disabled') AS disabled_students,
  (SELECT COUNT(*) FROM public.unit_purchases WHERE status = 'active')                    AS active_purchases,
  (SELECT COUNT(*) FROM public.lessons WHERE deleted_at IS NULL AND status = 'published') AS published_lessons,
  (SELECT COUNT(*) FROM public.lessons WHERE deleted_at IS NULL AND status <> 'published') AS hidden_or_draft_lessons;

COMMENT ON VIEW public.v_dashboard_metrics IS 'Admin operational metrics fed from unit_purchases (no subscription columns).';

DROP VIEW IF EXISTS public.v_active_subscriptions;

-- Re-assert the 0026 view lockdown for the redefined views (CREATE OR
-- REPLACE preserves ACLs, this is belt & braces for the same posture).
REVOKE ALL ON PUBLIC.v_lesson_access FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_lesson_access FROM anon, authenticated;
REVOKE ALL ON PUBLIC.v_student_progress_summary FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_student_progress_summary FROM anon, authenticated;
REVOKE ALL ON PUBLIC.v_dashboard_metrics FROM PUBLIC;
REVOKE ALL ON PUBLIC.v_dashboard_metrics FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 10) Unified get_dashboard_stats (CREATE OR REPLACE - keeps grants).
--     No subscription keys remain: students / purchases / content /
--     engagement / by_grade / top_units / recent_purchases.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stats jsonb;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT jsonb_build_object(
        'students', jsonb_build_object(
            'total',        (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL),
            'active',       (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'active'),
            'disabled',     (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'disabled'),
            'deleted',      (SELECT count(*) FROM public.profiles WHERE deleted_at IS NOT NULL),
            'new_this_month', (SELECT count(*) FROM public.profiles
                               WHERE deleted_at IS NULL AND created_at >= date_trunc('month', now()))
        ),
        'purchases', jsonb_build_object(
            'total',               (SELECT count(*) FROM public.unit_purchases WHERE status = 'active'),
            'total_revenue',       (SELECT COALESCE(sum(total_price), 0) FROM public.unit_purchases WHERE status = 'active'),
            'revenue_this_month',  (SELECT COALESCE(sum(total_price), 0) FROM public.unit_purchases
                                    WHERE status = 'active' AND purchased_at >= date_trunc('month', now()))
        ),
        'content', jsonb_build_object(
            'grades',           (SELECT count(*) FROM public.grades WHERE deleted_at IS NULL),
            'units',            (SELECT count(*) FROM public.units WHERE deleted_at IS NULL),
            'lessons',          (SELECT count(*) FROM public.lessons WHERE deleted_at IS NULL),
            'published_lessons',(SELECT count(*) FROM public.lessons WHERE deleted_at IS NULL AND status = 'published'),
            'videos',           (SELECT count(*) FROM public.lesson_videos WHERE deleted_at IS NULL),
            'videos_ready',     (SELECT count(*) FROM public.lesson_videos WHERE deleted_at IS NULL AND status = 'ready'),
            'pdfs',             (SELECT count(*) FROM public.lesson_pdfs WHERE deleted_at IS NULL),
            'pdfs_ready',       (SELECT count(*) FROM public.lesson_pdfs WHERE deleted_at IS NULL AND is_ready)
        ),
        'engagement', jsonb_build_object(
            'students_with_progress', (SELECT count(DISTINCT student_id) FROM public.progress),
            'completed_lessons',      (SELECT count(*) FROM public.progress WHERE is_completed),
            'avg_percent',            (SELECT COALESCE(round(avg(percent_completed), 2), 0) FROM public.progress)
        ),
        'by_grade', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'grade_name', r.grade_name,
                'students', r.students,
                'purchases', r.purchases,
                'revenue', r.revenue
            ) ORDER BY r.sort_order)
            FROM (
                SELECT g.name AS grade_name, g.sort_order,
                       count(DISTINCT p.id) AS students,
                       count(DISTINCT up.id) AS purchases,
                       COALESCE(sum(up.total_price), 0) AS revenue
                FROM public.grades g
                LEFT JOIN public.profiles p
                       ON p.grade_id = g.id AND p.deleted_at IS NULL
                LEFT JOIN public.unit_purchases up
                       ON up.student_id = p.id AND up.status = 'active'
                WHERE g.deleted_at IS NULL
                GROUP BY g.id, g.name, g.sort_order
            ) r
        ), '[]'::jsonb),
        'top_units', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'unit_name', r.unit_name,
                'purchases', r.purchases,
                'revenue', r.revenue
            ) ORDER BY r.revenue DESC)
            FROM (
                SELECT u.name AS unit_name,
                       count(DISTINCT up.id) AS purchases,
                       COALESCE(sum(up.total_price), 0) AS revenue
                FROM public.unit_purchases up
                JOIN public.units u ON u.id = up.unit_id
                WHERE up.status = 'active'
                GROUP BY u.id, u.name
                ORDER BY revenue DESC
                LIMIT 5
            ) r
        ), '[]'::jsonb),
        'recent_purchases', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', p.full_name,
                'grade_name', g.name,
                'unit_name', u.name,
                'total_price', up.total_price,
                'purchased_at', up.purchased_at
            ) ORDER BY up.purchased_at DESC)
            FROM public.unit_purchases up
            JOIN public.profiles p ON p.id = up.student_id
            JOIN public.units u ON u.id = up.unit_id
            JOIN public.grades g ON g.id = u.grade_id
            WHERE up.status = 'active'
            LIMIT 5
        ), '[]'::jsonb)
    ) INTO v_stats;

    RETURN v_stats;
END $$;

-- ---------------------------------------------------------------------
-- 11) notify_new_content: audience = active purchasers of the unit.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_new_content(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_unit uuid;
BEGIN
    SELECT unit_id INTO v_unit FROM public.lessons WHERE id = p_lesson_id;
    IF v_unit IS NULL THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    INSERT INTO public.notifications (user_id, type, entity_type, entity_id, title, body, dedup_key)
    SELECT up.student_id, 'new_content', 'lesson', p_lesson_id,
           'محتوى جديد', l.title,
           'new_content:' || p_lesson_id || ':' || up.student_id
    FROM public.unit_purchases up
    JOIN public.lessons l ON l.id = p_lesson_id
    WHERE up.unit_id = v_unit
      AND up.status = 'active'
      AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.dedup_key = 'new_content:' || p_lesson_id || ':' || up.student_id
      );
END $$;

-- ---------------------------------------------------------------------
-- 12) Drop the old subscription tables (order mandatory: referential
--     leaves first).
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS public.code_redemptions;
DROP TABLE IF EXISTS public.subscriptions;
DROP TABLE IF EXISTS public.subscription_codes;
DROP TABLE IF EXISTS public.pricing_plans;

-- ---------------------------------------------------------------------
-- 13) Drop the subscription_status enum (last - after the table is gone).
-- ---------------------------------------------------------------------
DROP TYPE IF EXISTS public.subscription_status;

-- ---------------------------------------------------------------------
-- 14) Grants for the new functions (updated matrix, plan section 3.13).
--     Every new function: REVOKE FROM PUBLIC first, then explicit grant.
--     create_unit_codes_internal stays UNGRANTED (internal only); it is
--     SECURITY DEFINER-owned so the REVOKE below does not affect the
--     staff wrapper that calls it.
--     Subscription functions were dropped in step 8b, so no subscription
--     grant survives. can_access_lesson keeps its authenticated grant
--     from 0010 (CREATE OR REPLACE preserves it).
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_unit_codes_internal(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_unit_code(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.redeem_unit_code(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_unit_purchases() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_unit_purchases() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_lesson_access(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_lesson_access(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_public_unit_prices() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_public_unit_prices() TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.set_unit_price(uuid, numeric, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_unit_price(uuid, numeric, numeric) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_unit_pricing() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_unit_pricing() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_codes_by_unit(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_codes_by_unit(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.revoke_unit_code(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revoke_unit_code(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_unit_codes_for_staff(uuid, integer, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_unit_codes_for_staff(uuid, integer, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_all_unit_purchases(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_all_unit_purchases(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.unit_purchase_stats() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.unit_purchase_stats() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_lesson_trial(uuid, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_lesson_trial(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------
-- 15) Enumeration constraints on notifications.entity_type /
--     audit_logs.entity_type: both are free TEXT columns (0002), no
--     CHECK/CASE enumeration exists anywhere in 0005/0019 to replace
--     (verified). Nothing further to do.
-- ---------------------------------------------------------------------
