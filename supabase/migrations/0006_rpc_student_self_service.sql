-- =====================================================================
-- 0006_rpc_student_self_service
-- Phase 1 | Supabase Foundation | Database
-- Client-callable student self-service RPCs (allowlist entries).
-- Reference: DATABASE.md section 6.3; SECURITY.md sections 10-11.
-- =====================================================================

-- ---------------------------------------------------------------------
-- update_own_profile(p_full_name, p_phone, p_guardian_phone, p_address)
-- SECURITY DEFINER; whitelisted to the 4 editable columns only; audit
-- logs PII deltas as changed column NAMES only (never values - MED-8).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_own_profile(
    p_full_name text,
    p_phone text,
    p_guardian_phone text,
    p_address text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_changed text[] := '{}'::text[];
    v_full_name text;
    v_phone text;
    v_guardian_phone text;
    v_address text;
BEGIN
    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT full_name, phone, guardian_phone, address
    INTO v_full_name, v_phone, v_guardian_phone, v_address
    FROM public.profiles WHERE id = v_uid;

    IF btrim(COALESCE(p_full_name, '')) IS DISTINCT FROM v_full_name THEN
        v_changed := array_append(v_changed, 'full_name');
    END IF;
    IF btrim(COALESCE(p_phone, '')) IS DISTINCT FROM v_phone THEN
        v_changed := array_append(v_changed, 'phone');
    END IF;
    IF btrim(COALESCE(p_guardian_phone, '')) IS DISTINCT FROM v_guardian_phone THEN
        v_changed := array_append(v_changed, 'guardian_phone');
    END IF;
    IF btrim(COALESCE(p_address, '')) IS DISTINCT FROM v_address THEN
        v_changed := array_append(v_changed, 'address');
    END IF;

    UPDATE public.profiles
    SET full_name = btrim(p_full_name),
        phone = btrim(p_phone),
        guardian_phone = btrim(p_guardian_phone),
        address = btrim(p_address)
    WHERE id = v_uid;

    IF array_length(v_changed, 1) > 0 THEN
        PERFORM public.audit_log('profile.update_own', 'profile', v_uid,
            jsonb_build_object('changed_fields', to_jsonb(v_changed)));
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- redeem_subscription_code(p_code) RETURNS uuid
-- Atomic redemption (SECURITY.md section 10.1): advisory lock per code
-- + FOR UPDATE + in-transaction re-validation + UNIQUE backstop.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_subscription_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code text := upper(btrim(p_code));
    v_student uuid := auth.uid();
    v_code_row public.subscription_codes%ROWTYPE;
    v_plan public.pricing_plans%ROWTYPE;
    v_grade_id uuid;
    v_sub_id uuid;
    v_expires timestamptz;
    v_warning_days int;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('wldn_redeem:' || lower(v_code)));

    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT * INTO v_code_row
    FROM public.subscription_codes
    WHERE code = v_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'code_not_found';
    END IF;

    IF v_code_row.status = 'used' THEN
        RAISE EXCEPTION 'code_already_used';
    END IF;
    IF v_code_row.status = 'revoked' THEN
        RAISE EXCEPTION 'code_revoked';
    END IF;

    SELECT grade_id INTO v_grade_id FROM public.profiles WHERE id = v_student;
    IF v_grade_id IS NULL THEN
        RAISE EXCEPTION 'no_grade_assigned';
    END IF;

    SELECT * INTO v_plan FROM public.pricing_plans WHERE id = v_code_row.pricing_plan_id;
    IF NOT FOUND OR NOT v_plan.is_active THEN
        RAISE EXCEPTION 'plan_not_available';
    END IF;
    -- BINDING B8: a plan on a grade that is inactive or soft-deleted is
    -- not purchasable (grade deactivation = soft-delete equivalent).
    IF NOT EXISTS (
        SELECT 1 FROM public.grades
        WHERE id = v_plan.grade_id AND is_active AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'plan_not_available';
    END IF;
    IF v_plan.grade_id <> v_grade_id THEN
        RAISE EXCEPTION 'plan_grade_mismatch';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE student_id = v_student AND status = 'active' AND expires_at > now()
    ) THEN
        RAISE EXCEPTION 'student_has_active_subscription';
    END IF;

    v_expires := now() + (v_plan.duration_days || ' days')::interval;

    UPDATE public.subscription_codes
    SET status = 'used', used_at = now(), used_by = v_student
    WHERE id = v_code_row.id;

    INSERT INTO public.subscriptions (
        student_id, pricing_plan_id, base_price, platform_fee, total_price,
        code_id, source, started_at, expires_at, status
    )
    VALUES (
        v_student, v_plan.id, v_plan.base_price, v_plan.platform_fee, v_plan.total_price,
        v_code_row.id, 'code', now(), v_expires, 'active'
    )
    RETURNING id INTO v_sub_id;

    INSERT INTO public.code_redemptions (code_id, student_id, subscription_id)
    VALUES (v_code_row.id, v_student, v_sub_id);

    -- Activation notification (deduped).
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    VALUES (v_student, 'subscription_activated', 'تم تفعيل اشتراكك', NULL,
            'sub_activated:' || v_sub_id, 'subscription', v_sub_id)
    ON CONFLICT (dedup_key) DO NOTHING;

    -- 7-day warning in the same transaction when the plan already fits
    -- inside the warning window (BLUEPRINT M7).
    v_warning_days := COALESCE(
        (SELECT (value #>> '{}')::int FROM public.app_settings WHERE key = 'expiry_warning_days'),
        7
    );
    IF v_expires <= now() + (v_warning_days || ' days')::interval THEN
        INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
        VALUES (v_student, 'subscription_expiring', 'اشتراكك يقترب من الانتهاء', NULL,
                'sub_expiring:' || v_sub_id, 'subscription', v_sub_id)
        ON CONFLICT (dedup_key) DO NOTHING;
    END IF;

    PERFORM public.audit_log('code.redeem', 'subscription', v_sub_id,
        jsonb_build_object('code', v_code, 'plan_id', v_plan.id, 'code_id', v_code_row.id));

    RETURN v_sub_id;
END $$;

-- ---------------------------------------------------------------------
-- get_my_subscriptions() / get_my_current_subscription()
-- Own rows only; RLS (student_id = auth.uid()) scopes them.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_subscriptions()
RETURNS SETOF public.subscriptions
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT * FROM public.subscriptions
    WHERE student_id = auth.uid()
    ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_my_current_subscription()
RETURNS public.subscriptions
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT * FROM public.subscriptions
    WHERE student_id = auth.uid()
      AND status = 'active'
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- upsert_progress(p_lesson_id, p_position_seconds, p_percent)
-- SECURITY DEFINER. Guard: is_student() + can_access_lesson().
-- Single atomic INSERT ... ON CONFLICT (student_id, lesson_id) DO UPDATE
-- (HIGH-3: no SELECT ... FOR UPDATE, so two concurrent first-writes for
-- the same (student, lesson) both succeed - whichever commits last wins
-- the position, and both arrive at the same merged state because the
-- update is a pure function of the previous row):
--   * percent_completed monotonic (GREATEST, clamped 0..100)   - A24/A12
--   * is_completed irreversible (OR with percent >= 90)        - A12
--   * position_seconds last-write-wins, clamped >= 0           - A26
--   * video_id = live primary (ready, not deleted); EXCLUDED.video_id
--     can never overwrite a valid pinned video (B4). If no primary
--     exists, the existing video_id is preserved (keeps any previously
--     pinned replacement video); a NULL video_id is only ever written
--     on a first insert.
-- Stale-video rejection happens BEFORE the write, against the CURRENT
-- primary video, so a concurrent replacement is always seen (HIGH-2).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_progress(
    p_lesson_id uuid,
    p_position_seconds integer DEFAULT 0,
    p_percent numeric DEFAULT 0
)
RETURNS public.progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student uuid := auth.uid();
    v_video uuid;
    v_pos int := GREATEST(0, COALESCE(p_position_seconds, 0));
    v_pct numeric(5,2) := LEAST(100, GREATEST(0, COALESCE(p_percent, 0)));
    v_result public.progress%ROWTYPE;
BEGIN
    IF NOT public.is_student() OR NOT public.can_access_lesson(p_lesson_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT id INTO v_video
    FROM public.lesson_videos
    WHERE lesson_id = p_lesson_id
      AND is_primary AND deleted_at IS NULL AND status = 'ready'
    ORDER BY sort_order, id
    LIMIT 1;

    -- BINDING B4 (HIGH-2): reject stale-video writes against the current
    -- primary BEFORE mutating anything.
    IF v_video IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.progress
            WHERE student_id = v_student
              AND lesson_id = p_lesson_id
              AND video_id IS NOT NULL
              AND video_id <> v_video
        ) THEN
            RAISE EXCEPTION 'progress_stale_video';
        END IF;
    END IF;

    INSERT INTO public.progress AS p (
        student_id, lesson_id, video_id, position_seconds,
        percent_completed, is_completed, last_watched_at
    )
    VALUES (
        v_student, p_lesson_id, v_video, v_pos, v_pct,
        v_pct >= 90, now()
    )
    ON CONFLICT (student_id, lesson_id) DO UPDATE
    SET position_seconds = v_pos,
        percent_completed = GREATEST(p.percent_completed, v_pct),
        is_completed = p.is_completed OR GREATEST(p.percent_completed, v_pct) >= 90,
        video_id = CASE
                       WHEN v_video IS NULL THEN p.video_id
                       ELSE v_video
                   END,
        last_watched_at = now()
    RETURNING * INTO v_result;

    RETURN v_result;
END $$;

-- ---------------------------------------------------------------------
-- mark_notification_read / mark_all_notifications_read
-- The ONLY paths that mutate notification read state (binding B2).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.notifications
    SET is_read = true, read_at = COALESCE(read_at, now())
    WHERE id = p_notification_id AND user_id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.notifications
    SET is_read = true, read_at = now()
    WHERE user_id = auth.uid() AND NOT is_read;
END $$;
