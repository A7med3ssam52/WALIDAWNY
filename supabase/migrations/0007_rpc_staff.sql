-- =====================================================================
-- 0007_rpc_staff
-- Phase 1 | Supabase Foundation | Database
-- Client-callable staff RPCs (mr_walid/admin), all SECURITY DEFINER +
-- audited unless noted. Reference: DATABASE.md section 6.4.
-- =====================================================================

-- ---------------------------------------------------------------------
-- set_user_role(p_user_id, p_role)
-- admin-only; THE ONLY path that mutates role.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role public.user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old public.user_role;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT role INTO v_old FROM public.profiles WHERE id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;

    UPDATE public.profiles SET role = p_role WHERE id = p_user_id;

    PERFORM public.audit_log('user.role_change', 'profile', p_user_id,
        jsonb_build_object('old_role', v_old, 'new_role', p_role));
END $$;

-- ---------------------------------------------------------------------
-- set_student_grade(p_student_id, p_grade_id)
-- Staff-only grade assignment; grade must exist, be active and not
-- soft-deleted; target must be a student profile.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_student_grade(p_student_id uuid, p_grade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old uuid;
    v_role public.user_role;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT role, grade_id INTO v_role, v_old FROM public.profiles WHERE id = p_student_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;
    IF v_role <> 'student' THEN
        RAISE EXCEPTION 'not_a_student';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.grades WHERE id = p_grade_id AND is_active AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'grade_not_available';
    END IF;

    UPDATE public.profiles SET grade_id = p_grade_id WHERE id = p_student_id;

    PERFORM public.audit_log('student.grade_change', 'profile', p_student_id,
        jsonb_build_object('old_grade_id', v_old, 'new_grade_id', p_grade_id));
END $$;

-- ---------------------------------------------------------------------
-- Session revocation (LOW-18 spike outcome): DELETE FROM auth.sessions is
-- attempted only when the table exists (hosted Supabase). On the local
-- harness (no sessions table) the call is skipped; the fallback remains
-- the sign-in gate + RLS + Edge Function checks (binding B10).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_sessions_if_possible(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'auth' AND table_name = 'sessions'
    ) THEN
        DELETE FROM auth.sessions WHERE user_id = p_user_id;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- disable_student / enable_student
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disable_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.profiles
    SET status = 'disabled'
    WHERE id = p_student_id AND role = 'student' AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.revoke_sessions_if_possible(p_student_id);
    PERFORM public.audit_log('student.disable', 'profile', p_student_id);
END $$;

CREATE OR REPLACE FUNCTION public.enable_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.profiles
    SET status = 'active'
    WHERE id = p_student_id AND role = 'student' AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.audit_log('student.enable', 'profile', p_student_id);
END $$;

-- ---------------------------------------------------------------------
-- soft_delete_student / restore_student
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.profiles
    SET deleted_at = now(), status = 'disabled'
    WHERE id = p_student_id AND role = 'student';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.revoke_sessions_if_possible(p_student_id);
    PERFORM public.audit_log('student.soft_delete', 'profile', p_student_id);
END $$;

CREATE OR REPLACE FUNCTION public.restore_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.profiles
    SET deleted_at = NULL, status = 'active'
    WHERE id = p_student_id AND role = 'student';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.audit_log('student.restore', 'profile', p_student_id);
END $$;

-- ---------------------------------------------------------------------
-- update_student_profile (binding B3)
-- mr_walid/admin; strict 4-column whitelist; role/grade/status/deleted_at
-- can never be touched; audited. Target must be a STUDENT profile
-- (MEDIUM-4: mirrors disable_student/set_student_grade - an admin's or
-- mr_walid's own profile is out of scope and raises target_not_student).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_student_profile(
    p_student_id uuid,
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
    v_changed text[] := '{}'::text[];
    v_full_name text;
    v_phone text;
    v_guardian_phone text;
    v_address text;
    v_role text;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT full_name, phone, guardian_phone, address, role
    INTO v_full_name, v_phone, v_guardian_phone, v_address, v_role
    FROM public.profiles WHERE id = p_student_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    IF v_role <> 'student' THEN
        RAISE EXCEPTION 'target_not_student';
    END IF;

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
    WHERE id = p_student_id;

    PERFORM public.audit_log('student.profile_update', 'profile', p_student_id,
        jsonb_build_object('changed_fields', to_jsonb(v_changed)));
END $$;

-- ---------------------------------------------------------------------
-- list_trash() -- soft-deleted students, staff only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_trash()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT * FROM public.profiles
    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC;
$$;

-- ---------------------------------------------------------------------
-- create_manual_subscription (bindings B6, B10)
-- Staff-created subscription with a price snapshot copied from the plan;
-- p_notes lands in audit metadata; no grade requirement.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_manual_subscription(
    p_student_id uuid,
    p_plan_id uuid,
    p_started_at timestamptz,
    p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan public.pricing_plans%ROWTYPE;
    v_sub_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_student_id AND role = 'student') THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    SELECT * INTO v_plan FROM public.pricing_plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'plan_not_found';
    END IF;

    INSERT INTO public.subscriptions (
        student_id, pricing_plan_id, base_price, platform_fee, total_price,
        source, started_at, expires_at, status
    )
    VALUES (
        p_student_id, v_plan.id, v_plan.base_price, v_plan.platform_fee,
        v_plan.total_price, 'manual', p_started_at,
        p_started_at + (v_plan.duration_days || ' days')::interval, 'active'
    )
    RETURNING id INTO v_sub_id;

    PERFORM public.audit_log('subscription.create_manual', 'subscription', v_sub_id,
        jsonb_build_object('plan_id', v_plan.id, 'notes', p_notes));

    RETURN v_sub_id;
END $$;

-- ---------------------------------------------------------------------
-- generate_codes_internal(p_plan_id, p_count, p_note)
-- SECURITY DEFINER; called by Edge Function only - NO client grants.
-- Secure random codes via gen_random_bytes, unambiguous charset (A22).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_codes_internal(
    p_plan_id uuid,
    p_count integer,
    p_note text DEFAULT NULL
)
RETURNS SETOF public.subscription_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_actor uuid := COALESCE(auth.uid(), NULLIF(current_setting('app.system_actor_id', true), '')::uuid);
    v_plan_exists boolean;
    v_code text;
    v_attempt int;
    v_inserted int := 0;
    v_byte bytea;
    v_row public.subscription_codes%ROWTYPE;
BEGIN
    IF p_count < 1 OR p_count > 500 THEN
        RAISE EXCEPTION 'invalid_count';
    END IF;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'system_actor_required';
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.pricing_plans WHERE id = p_plan_id) INTO v_plan_exists;
    IF NOT v_plan_exists THEN
        RAISE EXCEPTION 'plan_not_found';
    END IF;

    v_attempt := 0;
    WHILE v_inserted < p_count AND v_attempt < p_count * 5 LOOP
        v_attempt := v_attempt + 1;
        v_byte := gen_random_bytes(12);
        v_code := 'WLDN-'
            || substr(v_chars, get_byte(v_byte, 0) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 1) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 2) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 3) % 32 + 1, 1)
            || '-'
            || substr(v_chars, get_byte(v_byte, 4) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 5) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 6) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 7) % 32 + 1, 1)
            || '-'
            || substr(v_chars, get_byte(v_byte, 8) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 9) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 10) % 32 + 1, 1)
            || substr(v_chars, get_byte(v_byte, 11) % 32 + 1, 1);

        BEGIN
            INSERT INTO public.subscription_codes (code, pricing_plan_id, created_by, note)
            VALUES (v_code, p_plan_id, v_actor, p_note)
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

-- ---------------------------------------------------------------------
-- revoke_subscription_code(p_code_id)
-- available/used -> revoked; does NOT cancel the created subscription
-- (A29).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_subscription_code(p_code_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prev public.code_status;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT status INTO v_prev FROM public.subscription_codes WHERE id = p_code_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'code_not_found';
    END IF;

    UPDATE public.subscription_codes
    SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
    WHERE id = p_code_id AND status IN ('available', 'used');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'code_not_revocable';
    END IF;

    PERFORM public.audit_log('code.revoke', 'subscription_code', p_code_id,
        jsonb_build_object('previous_status', v_prev));
END $$;

-- ---------------------------------------------------------------------
-- Grade lifecycle (soft delete; binding B8 semantics)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_grade(p_grade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.grades SET deleted_at = now() WHERE id = p_grade_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'grade_not_found';
    END IF;

    PERFORM public.audit_log('grade.delete', 'grade', p_grade_id);
END $$;

CREATE OR REPLACE FUNCTION public.restore_grade(p_grade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.grades SET deleted_at = NULL WHERE id = p_grade_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'grade_not_found';
    END IF;

    PERFORM public.audit_log('grade.restore', 'grade', p_grade_id);
END $$;

-- ---------------------------------------------------------------------
-- Unit lifecycle
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_unit(p_grade_id uuid, p_name text, p_sort_order integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    INSERT INTO public.units (grade_id, name, sort_order) VALUES (p_grade_id, btrim(p_name), p_sort_order)
    RETURNING id INTO v_id;

    PERFORM public.audit_log('unit.create', 'unit', v_id, jsonb_build_object('grade_id', p_grade_id));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_unit(p_unit_id uuid, p_name text, p_sort_order integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.units
    SET name = COALESCE(btrim(NULLIF(p_name, '')), name),
        sort_order = COALESCE(p_sort_order, sort_order)
    WHERE id = p_unit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    PERFORM public.audit_log('unit.update', 'unit', p_unit_id);
END $$;

CREATE OR REPLACE FUNCTION public.delete_unit(p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.units SET deleted_at = now() WHERE id = p_unit_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    PERFORM public.audit_log('unit.delete', 'unit', p_unit_id);
END $$;

CREATE OR REPLACE FUNCTION public.restore_unit(p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.units SET deleted_at = NULL WHERE id = p_unit_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    PERFORM public.audit_log('unit.restore', 'unit', p_unit_id);
END $$;

-- ---------------------------------------------------------------------
-- Lesson lifecycle
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_lesson(p_unit_id uuid, p_title text, p_description text DEFAULT NULL, p_sort_order integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    INSERT INTO public.lessons (unit_id, title, description, sort_order)
    VALUES (p_unit_id, btrim(p_title), p_description, p_sort_order)
    RETURNING id INTO v_id;

    PERFORM public.audit_log('lesson.create', 'lesson', v_id, jsonb_build_object('unit_id', p_unit_id));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_lesson(p_lesson_id uuid, p_title text, p_description text DEFAULT NULL, p_sort_order integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons
    SET title = COALESCE(btrim(NULLIF(p_title, '')), title),
        description = COALESCE(p_description, description),
        sort_order = COALESCE(p_sort_order, sort_order)
    WHERE id = p_lesson_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.update', 'lesson', p_lesson_id);
END $$;

CREATE OR REPLACE FUNCTION public.publish_lesson(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons
    SET status = 'published', published_at = now()
    WHERE id = p_lesson_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.publish', 'lesson', p_lesson_id);
    PERFORM public.notify_new_content(p_lesson_id);
END $$;

CREATE OR REPLACE FUNCTION public.hide_lesson(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons SET status = 'hidden' WHERE id = p_lesson_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.hide', 'lesson', p_lesson_id);
END $$;

CREATE OR REPLACE FUNCTION public.soft_delete_lesson(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons SET deleted_at = now() WHERE id = p_lesson_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.soft_delete', 'lesson', p_lesson_id);
END $$;

CREATE OR REPLACE FUNCTION public.restore_lesson(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons SET deleted_at = NULL WHERE id = p_lesson_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.restore', 'lesson', p_lesson_id);
END $$;

-- ---------------------------------------------------------------------
-- set_app_setting(p_key, p_value)
-- mr_walid: whatsapp% keys only; admin: all.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_app_setting(p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.is_admin() THEN
        NULL;
    ELSIF public.is_mr_walid() AND p_key LIKE 'whatsapp%' THEN
        NULL;
    ELSE
        RAISE EXCEPTION 'access_denied';
    END IF;

    INSERT INTO public.app_settings (key, value, updated_by, updated_at)
    VALUES (p_key, p_value, auth.uid(), now())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

    PERFORM public.audit_log('app_setting.update', 'app_setting', NULL,
        jsonb_build_object('key', p_key));
END $$;

-- ---------------------------------------------------------------------
-- set_pricing_plan (admin only + audit)
-- Upsert on (grade_id, duration_days).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_pricing_plan(
    p_grade_id uuid,
    p_duration_days integer,
    p_base_price numeric,
    p_platform_fee numeric,
    p_is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF p_base_price < 0 OR p_platform_fee < 0 OR p_duration_days <= 0 THEN
        RAISE EXCEPTION 'invalid_plan_values';
    END IF;

    INSERT INTO public.pricing_plans (grade_id, duration_days, base_price, platform_fee, total_price, is_active)
    VALUES (p_grade_id, p_duration_days, p_base_price, p_platform_fee, p_base_price + p_platform_fee, p_is_active)
    ON CONFLICT (grade_id, duration_days) DO UPDATE
    SET base_price = EXCLUDED.base_price,
        platform_fee = EXCLUDED.platform_fee,
        total_price = EXCLUDED.total_price,
        is_active = EXCLUDED.is_active
    RETURNING id INTO v_id;

    PERFORM public.audit_log('pricing.upsert', 'pricing_plan', v_id,
        jsonb_build_object('grade_id', p_grade_id, 'duration_days', p_duration_days));
    RETURN v_id;
END $$;

-- ---------------------------------------------------------------------
-- delete_pricing_plan(p_plan_id) (binding B7)
-- Hard-deletes ONLY unreferenced plans; referenced plans are deactivated
-- (is_active = false) instead; every attempt is audited.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_pricing_plan(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_referenced boolean;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions WHERE pricing_plan_id = p_plan_id
        UNION ALL
        SELECT 1 FROM public.subscription_codes WHERE pricing_plan_id = p_plan_id
    ) INTO v_referenced;

    IF v_referenced THEN
        UPDATE public.pricing_plans SET is_active = false WHERE id = p_plan_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'plan_not_found';
        END IF;
        PERFORM public.audit_log('pricing.delete', 'pricing_plan', p_plan_id,
            jsonb_build_object('deleted', false, 'deactivated', true));
    ELSE
        DELETE FROM public.pricing_plans WHERE id = p_plan_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'plan_not_found';
        END IF;
        PERFORM public.audit_log('pricing.delete', 'pricing_plan', p_plan_id,
            jsonb_build_object('deleted', true));
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- finalize_pdf_upload(p_pdf_id)
-- Marks the PDF ready and PROMOTES it to primary (demoting peers first
-- so the partial unique index is never violated mid-statement).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_pdf_upload(p_pdf_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT lesson_id INTO v_lesson FROM public.lesson_pdfs WHERE id = p_pdf_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'pdf_not_found';
    END IF;

    UPDATE public.lesson_pdfs
    SET is_primary = false
    WHERE lesson_id = v_lesson AND id <> p_pdf_id AND is_primary AND deleted_at IS NULL;

    UPDATE public.lesson_pdfs SET is_ready = true, is_primary = true WHERE id = p_pdf_id;

    PERFORM public.audit_log('pdf.finalize', 'lesson_pdf', p_pdf_id,
        jsonb_build_object('lesson_id', v_lesson));
END $$;
