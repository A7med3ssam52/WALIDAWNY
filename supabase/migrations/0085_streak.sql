-- =====================================================================
-- 0085_streak.sql — Gentle daily streak + weekly freeze + fee-waiver voucher
-- ---------------------------------------------------------------------
-- Day counting (Africa/Cairo):
--   * an "active day" = any progress row with percent_completed > 0 whose
--     updated_at falls on that Cairo date (real studying — merely opening
--     a page writes nothing, so it never counts).
--   * freeze-covered days count as active.
-- Tables:
--   streak_freezes  — one manual freeze per student per week (Sat-Fri),
--                     covering the most recent missed day of that week.
--   streak_vouchers — fee-waiver voucher granted once ever at a 30-day
--                     streak; valid 30 days; consumed on explicit redeem.
-- RPCs (SECURITY DEFINER, same pattern as 0030 comments):
--   get_my_streak()        student-only reader (+auto-claim at 30d)
--   use_streak_freeze()    student-only writer
--   redeem_unit_code(text, bool) second param applies a valid voucher
--                     (fee -> 0); default false preserves old callers
--   list_student_streaks() staff-only (admin/mr_walid/teacher) reader
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) notification type for the voucher grant (in-app celebrations for
--    7/14 need no notification — only the 30-day voucher notifies).
-- ---------------------------------------------------------------------
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'voucher_granted';

-- ---------------------------------------------------------------------
-- 2) tables
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.streak_freezes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    week_start  date NOT NULL,
    covers_date date NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT streak_freezes_one_per_week UNIQUE (student_id, week_start),
    CONSTRAINT streak_freezes_covers_in_week CHECK (covers_date >= week_start AND covers_date < week_start + 7)
);

CREATE TABLE IF NOT EXISTS public.streak_vouchers (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id       uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    granted_at       timestamptz NOT NULL DEFAULT now(),
    expires_at       timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
    used_at          timestamptz,
    used_for_unit_id uuid REFERENCES public.units (id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT streak_vouchers_once_ever UNIQUE (student_id)
);

CREATE INDEX IF NOT EXISTS streak_freezes_student_idx ON public.streak_freezes (student_id);
CREATE INDEX IF NOT EXISTS streak_vouchers_student_idx ON public.streak_vouchers (student_id);
-- Streak reads scan one student's progress by recency.
CREATE INDEX IF NOT EXISTS idx_progress_student_updated ON public.progress (student_id, updated_at);

ALTER TABLE public.streak_freezes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_freezes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.streak_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_vouchers FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.streak_freezes IS 'Weekly manual freeze (one per student per Sat-Fri week). Writes only via use_streak_freeze().';
COMMENT ON TABLE public.streak_vouchers IS 'Fee-waiver voucher: granted once ever at a 30-day streak, valid 30 days, consumed on explicit redeem with p_use_voucher.';

DROP TRIGGER IF EXISTS audit_trigger ON public.streak_freezes;
CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.streak_freezes
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
DROP TRIGGER IF EXISTS audit_trigger ON public.streak_vouchers;
CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.streak_vouchers
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ---------------------------------------------------------------------
-- 3) RLS: students read own rows, staff read everything; writes go
--    exclusively through SECURITY DEFINER RPCs (same as unit_purchases).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS streak_freezes_select_own_or_staff ON public.streak_freezes;
CREATE POLICY streak_freezes_select_own_or_staff ON public.streak_freezes
    FOR SELECT
    USING (student_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS streak_freezes_insert_via_rpc ON public.streak_freezes;
CREATE POLICY streak_freezes_insert_via_rpc ON public.streak_freezes
    FOR INSERT
    WITH CHECK (false);

DROP POLICY IF EXISTS streak_vouchers_select_own_or_staff ON public.streak_vouchers;
CREATE POLICY streak_vouchers_select_own_or_staff ON public.streak_vouchers
    FOR SELECT
    USING (student_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS streak_vouchers_insert_via_rpc ON public.streak_vouchers;
CREATE POLICY streak_vouchers_insert_via_rpc ON public.streak_vouchers
    FOR INSERT
    WITH CHECK (false);

-- ---------------------------------------------------------------------
-- 4) internal helper: active Cairo dates for one student (study days +
--    freeze-covered days). Internal only — no client grant.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.streak_active_days(p_student uuid)
RETURNS SETOF date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT DISTINCT ((updated_at AT TIME ZONE 'Africa/Cairo'))::date
    FROM public.progress
    WHERE student_id = p_student AND percent_completed > 0
    UNION
    SELECT covers_date
    FROM public.streak_freezes
    WHERE student_id = p_student;
$$;

REVOKE EXECUTE ON FUNCTION public.streak_active_days(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.streak_active_days(uuid) IS 'Internal: distinct Cairo active dates (study + freezes) for one student. No client grants.';

-- ---------------------------------------------------------------------
-- 5) internal helper: full streak state as jsonb (single source of truth
--    for both the student reader and the staff list).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.streak_state(p_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today date := ((now() AT TIME ZONE 'Africa/Cairo'))::date;
    v_dow int := EXTRACT(ISODOW FROM v_today)::int;
    v_week_start date := v_today - ((v_dow + 1) % 7);
    v_days date[] := ARRAY(SELECT s.d FROM public.streak_active_days(p_student) AS s(d));
    v_cursor date;
    v_count int := 0;
    v_last_active date;
    v_freeze_used boolean;
    v_week jsonb := '[]'::jsonb;
    v_d date;
    v_stage text;
    v_voucher public.streak_vouchers%ROWTYPE;
    v_voucher_json jsonb;
BEGIN
    SELECT max(d) INTO v_last_active
    FROM (SELECT unnest(v_days) AS d) s
    WHERE d <= v_today;

    -- Walk back from today; if today is not active yet, the streak stays
    -- alive pending today (count starts at yesterday).
    v_cursor := v_today;
    IF NOT (v_cursor = ANY (v_days)) THEN
        v_cursor := v_cursor - 1;
    END IF;
    WHILE v_cursor = ANY (v_days) LOOP
        v_count := v_count + 1;
        v_cursor := v_cursor - 1;
    END LOOP;

    SELECT EXISTS (
        SELECT 1 FROM public.streak_freezes
        WHERE student_id = p_student AND week_start = v_week_start
    ) INTO v_freeze_used;

    FOR i IN 0..6 LOOP
        v_d := v_week_start + i;
        v_week := v_week || jsonb_build_object(
            'date', v_d,
            'active', (v_d = ANY (v_days)) AND v_d <= v_today,
            'frozen', EXISTS (SELECT 1 FROM public.streak_freezes WHERE student_id = p_student AND covers_date = v_d),
            'today', v_d = v_today,
            'future', v_d > v_today
        );
    END LOOP;

    IF v_count >= 30 THEN v_stage := 'storm';
    ELSIF v_count >= 7 THEN v_stage := 'flame';
    ELSIF v_count >= 1 THEN v_stage := 'spark';
    ELSE v_stage := 'none';
    END IF;

    SELECT * INTO v_voucher FROM public.streak_vouchers WHERE student_id = p_student;
    IF NOT FOUND THEN
        v_voucher_json := jsonb_build_object('status', 'none');
    ELSIF v_voucher.used_at IS NOT NULL THEN
        v_voucher_json := jsonb_build_object('status', 'used', 'used_at', v_voucher.used_at);
    ELSIF v_voucher.expires_at < now() THEN
        v_voucher_json := jsonb_build_object('status', 'expired', 'expires_at', v_voucher.expires_at);
    ELSE
        v_voucher_json := jsonb_build_object(
            'status', 'granted',
            'granted_at', v_voucher.granted_at,
            'expires_at', v_voucher.expires_at);
    END IF;

    RETURN jsonb_build_object(
        'current_days', v_count,
        'last_active', v_last_active,
        'week_start', v_week_start,
        'week', v_week,
        'freeze_available', NOT v_freeze_used,
        'freeze_used_this_week', v_freeze_used,
        'flame_stage', v_stage,
        'voucher', v_voucher_json);
END $$;

REVOKE EXECUTE ON FUNCTION public.streak_state(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.streak_state(uuid) IS 'Internal: single source of truth for streak state (student + staff readers). No client grants.';

-- ---------------------------------------------------------------------
-- 6) get_my_streak: student-only reader. Auto-claims the once-ever
--    voucher the first time a 30-day streak is observed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_streak()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student uuid := auth.uid();
    v_state jsonb;
    v_current int;
BEGIN
    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    v_state := public.streak_state(v_student);
    v_current := (v_state ->> 'current_days')::int;

    IF v_current >= 30 THEN
        INSERT INTO public.streak_vouchers (student_id)
        VALUES (v_student)
        ON CONFLICT (student_id) DO NOTHING;
        IF FOUND THEN
            INSERT INTO public.notifications (user_id, type, title, body, dedup_key)
            VALUES (v_student, 'voucher_granted', 'مكافأة الـ 30 يوم!',
                    'كسبت إعفاءً من رسوم المنصة في وحدة واحدة — صالح 30 يومًا',
                    'voucher_granted:' || v_student::text)
            ON CONFLICT (dedup_key) DO NOTHING;
            PERFORM public.audit_log('streak.voucher_granted', 'streak_vouchers', v_student,
                jsonb_build_object('current_days', v_current));
            v_state := public.streak_state(v_student);
        END IF;
    END IF;

    RETURN v_state;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_my_streak() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_streak() TO authenticated;

COMMENT ON FUNCTION public.get_my_streak() IS 'Student-only streak reader (Cairo days). Auto-claims the once-ever 30-day fee-waiver voucher with a notification.';

-- ---------------------------------------------------------------------
-- 7) use_streak_freeze: covers the most recent missed day of the current
--    week. One per week; refuses when useless or unneeded.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.use_streak_freeze()
RETURNS date
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student uuid := auth.uid();
    v_today date := ((now() AT TIME ZONE 'Africa/Cairo'))::date;
    v_dow int := EXTRACT(ISODOW FROM v_today)::int;
    v_week_start date := v_today - ((v_dow + 1) % 7);
    v_days date[] := ARRAY(SELECT s.d FROM public.streak_active_days(v_student) AS s(d));
    v_cursor date := v_today;
    v_target date := NULL;
    v_sim_count int := 0;
    v_sim_cursor date;
BEGIN
    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF EXISTS (SELECT 1 FROM public.streak_freezes WHERE student_id = v_student AND week_start = v_week_start) THEN
        RAISE EXCEPTION 'freeze_already_used';
    END IF;

    -- Most recent missed day in [week_start, today].
    WHILE v_cursor >= v_week_start LOOP
        IF NOT (v_cursor = ANY (v_days)) THEN
            v_target := v_cursor;
            EXIT;
        END IF;
        v_cursor := v_cursor - 1;
    END LOOP;

    IF v_target IS NULL THEN
        RAISE EXCEPTION 'no_missed_day';
    END IF;

    -- Simulate: covering the target must extend a live run (>1 day).
    -- A lone covered day after a 2+ day gap would fake a 1-day streak
    -- while the real run stays dead — refuse instead of wasting it.
    v_sim_cursor := v_today;
    IF NOT (v_sim_cursor = ANY (v_days) OR v_sim_cursor = v_target) THEN
        v_sim_cursor := v_sim_cursor - 1;
    END IF;
    WHILE v_sim_cursor = ANY (v_days) OR v_sim_cursor = v_target LOOP
        v_sim_count := v_sim_count + 1;
        v_sim_cursor := v_sim_cursor - 1;
    END LOOP;
    IF v_sim_count <= 1 THEN
        RAISE EXCEPTION 'freeze_wont_help';
    END IF;

    BEGIN
        INSERT INTO public.streak_freezes (student_id, week_start, covers_date)
        VALUES (v_student, v_week_start, v_target);
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'freeze_already_used';
    END;

    PERFORM public.audit_log('streak.freeze_used', 'streak_freezes', v_student,
        jsonb_build_object('covers_date', v_target));
    RETURN v_target;
END $$;

REVOKE EXECUTE ON FUNCTION public.use_streak_freeze() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.use_streak_freeze() TO authenticated;

COMMENT ON FUNCTION public.use_streak_freeze() IS 'Student-only weekly freeze: covers the most recent missed day of the current Cairo week. Errors: freeze_already_used / no_missed_day / freeze_wont_help.';

-- ---------------------------------------------------------------------
-- 8) redeem_unit_code with explicit voucher application (fee -> 0).
--    Default false preserves every existing caller.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_unit_code(p_code text, p_use_voucher boolean DEFAULT false)
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
    v_voucher public.streak_vouchers%ROWTYPE;
    v_fee numeric(10, 2);
    v_waived boolean := false;
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

    v_fee := v_pricing.platform_fee;
    IF COALESCE(p_use_voucher, false) THEN
        SELECT * INTO v_voucher
        FROM public.streak_vouchers
        WHERE student_id = v_student
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'voucher_not_found';
        END IF;
        IF v_voucher.used_at IS NOT NULL THEN
            RAISE EXCEPTION 'voucher_already_used';
        END IF;
        IF v_voucher.expires_at < now() THEN
            RAISE EXCEPTION 'voucher_expired';
        END IF;
        v_fee := 0;
        v_waived := true;
    END IF;

    INSERT INTO public.unit_purchases (
        student_id, unit_id, base_price, platform_fee, code_id, status
    )
    VALUES (
        v_student, v_unit.id, v_pricing.base_price, v_fee,
        v_code_row.id, 'active'
    )
    RETURNING * INTO v_purchase;

    UPDATE public.unit_codes
    SET status = 'used', used_at = now(), used_by = v_student
    WHERE id = v_code_row.id;

    IF v_waived THEN
        UPDATE public.streak_vouchers
        SET used_at = now(), used_for_unit_id = v_unit.id
        WHERE student_id = v_student;
        PERFORM public.audit_log('streak.voucher_used', 'streak_vouchers', v_student,
            jsonb_build_object('unit_id', v_unit.id, 'waived_fee', v_pricing.platform_fee));
    END IF;

    PERFORM public.audit_log('unit_purchase.create', 'unit_purchases', v_purchase.id,
        jsonb_build_object('unit_id', v_unit.id, 'price', v_purchase.total_price, 'fee_waived', v_waived));

    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    VALUES (v_student, 'unit_activated', 'تم تفعيل الوحدة', v_unit.name,
            'unit_activated:' || v_purchase.id, 'unit_purchases', v_purchase.id)
    ON CONFLICT (dedup_key) DO NOTHING;

    RETURN v_purchase;
END $$;

-- Stale single-arg overload retired (precedent: 0076). Default keeps old
-- one-arg calls working through the new signature.
DROP FUNCTION IF EXISTS public.redeem_unit_code(text);
REVOKE EXECUTE ON FUNCTION public.redeem_unit_code(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_unit_code(text, boolean) TO authenticated;

COMMENT ON FUNCTION public.redeem_unit_code(text, boolean) IS 'Student unit-code redemption; p_use_voucher consumes a valid fee-waiver voucher (platform_fee -> 0). Errors: voucher_not_found / voucher_already_used / voucher_expired.';

-- ---------------------------------------------------------------------
-- 9) list_student_streaks: staff-only reader (admin/mr_walid/teacher).
--    Same streak_state core — staff numbers can never diverge.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_student_streaks()
RETURNS TABLE (
    student_id uuid,
    full_name text,
    grade_name text,
    current_days int,
    last_active_date date,
    freeze_used_this_week boolean,
    voucher_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r record;
    s jsonb;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    FOR r IN
        SELECT p.id AS sid, COALESCE(p.full_name, '') AS fname, g.name AS gname
        FROM public.profiles p
        LEFT JOIN public.grades g ON g.id = p.grade_id
        WHERE p.role = 'student' AND p.deleted_at IS NULL
        ORDER BY p.full_name
    LOOP
        s := public.streak_state(r.sid);
        student_id := r.sid;
        full_name := r.fname;
        grade_name := r.gname;
        current_days := (s ->> 'current_days')::int;
        last_active_date := NULLIF(s ->> 'last_active', '')::date;
        freeze_used_this_week := (s ->> 'freeze_used_this_week')::boolean;
        voucher_status := (s #>> '{voucher,status}');
        RETURN NEXT;
    END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.list_student_streaks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_student_streaks() TO authenticated;

COMMENT ON FUNCTION public.list_student_streaks() IS 'Staff-only streak board: per-student current streak, last active day, freeze and voucher state. Shares streak_state() with the student reader.';
