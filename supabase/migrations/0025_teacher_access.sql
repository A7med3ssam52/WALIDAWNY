-- =====================================================================
-- 0025_teacher_access
-- Grants the 'teacher' role the same staff surface as mr_walid:
--
--   1. is_teacher() role helper (mirrors 0003's is_mr_walid; STABLE +
--      SECURITY DEFINER, search_path pinned) granted to authenticated so
--      policy expressions can evaluate it (0022's S1 note).
--   2. RLS policies: every staff branch gets `OR public.is_teacher()`.
--      Each policy below is the CURRENT canonical version (0009 or the
--      S1/S2 rewrite in 0022) recreated VERBATIM with only the teacher
--      branch appended - the (select auth.uid()) initplan fix and the
--      command-specific split policies are preserved.
--   3. Staff RPC guards: `IF NOT (public.is_admin() OR public.is_mr_walid())`
--      becomes `IF NOT (public.is_admin() OR public.is_mr_walid() OR
--      public.is_teacher())` via CREATE OR REPLACE FUNCTION with
--      identical signatures and bodies (only the guard changes).
--      Grants are preserved by CREATE OR REPLACE.
--
-- Intentionally NOT opened to teachers (admin/mr_walid only, or
-- student-only as before): set_user_role, set_role_by_email,
-- set_pricing_plan, delete_pricing_plan, set_app_setting,
-- update_own_profile, profiles_update_own_self_service,
-- pricing_plans DML, app_settings write, audit_logs (select + RPCs).
-- =====================================================================

-- ---------------------------------------------------------------------
-- is_teacher() role helper (mirrors 0003:39-47 is_mr_walid)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT role = 'teacher' FROM public.profiles WHERE id = auth.uid()), false);
$$;

COMMENT ON FUNCTION public.is_teacher() IS 'Current caller is a teacher. RLS policy helper - granted to authenticated for policy evaluation only.';

REVOKE EXECUTE ON FUNCTION public.is_teacher() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_teacher() TO authenticated;

-- ---------------------------------------------------------------------
-- profiles - SELECT own/staff (0022:45-48 + teacher branch)
-- ---------------------------------------------------------------------
-- NOTE: keeps the direct auth.uid() form from 0022 (NOT the
-- (select auth.uid()) initplan fix) - the sublink wrapper makes the
-- student self-service UPDATE recurse (SQLSTATE 42P17); see 0022's S1
-- exception comment.
DROP POLICY IF EXISTS profiles_select_own_or_staff ON public.profiles;
CREATE POLICY profiles_select_own_or_staff ON public.profiles
    FOR SELECT
    USING ((id = auth.uid() AND public.is_student()) OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- grades - SELECT staff/active-students (0009:74-78) + DML (0022:125-133)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS grades_select_staff_or_active_students ON public.grades;
CREATE POLICY grades_select_staff_or_active_students ON public.grades
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
           OR (public.is_student() AND deleted_at IS NULL AND is_active));

DROP POLICY IF EXISTS grades_insert_staff ON public.grades;
CREATE POLICY grades_insert_staff ON public.grades
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS grades_update_staff ON public.grades;
CREATE POLICY grades_update_staff ON public.grades
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS grades_delete_staff ON public.grades;
CREATE POLICY grades_delete_staff ON public.grades
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- pricing_plans - SELECT staff/active-students (0009:89-93)
-- DML stays admin-only (0009:95-99 / 0022:135-143).
-- Student branch is grade-bound: active plans for the student's own grade
-- only, and the plan's grade must itself be active and non-deleted
-- (SECURITY.md section 6; same shape as units/lessons below).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS pricing_plans_select_staff_or_active_students ON public.pricing_plans;
CREATE POLICY pricing_plans_select_staff_or_active_students ON public.pricing_plans
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (
            public.is_student()
            AND is_active
            AND grade_id IN (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid()))
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
        )
    );

-- ---------------------------------------------------------------------
-- subscriptions / code_redemptions - SELECT own/staff (0022:62-65, 67-70)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS subscriptions_select_own_or_staff ON public.subscriptions;
CREATE POLICY subscriptions_select_own_or_staff ON public.subscriptions
    FOR SELECT
    USING (student_id = (select auth.uid()) OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS code_redemptions_select_own_or_staff ON public.code_redemptions;
CREATE POLICY code_redemptions_select_own_or_staff ON public.code_redemptions
    FOR SELECT
    USING (student_id = (select auth.uid()) OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- subscription_codes - SELECT staff (0009:114-117)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS subscription_codes_select_staff ON public.subscription_codes;
CREATE POLICY subscription_codes_select_staff ON public.subscription_codes
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- units - SELECT staff/published-own-grade (0022:72-84) + DML (0022:145-153)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS units_select_staff_or_published_own_grade ON public.units;
CREATE POLICY units_select_staff_or_published_own_grade ON public.units
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (
            public.is_student()
            AND grade_id IN (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid()))
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            AND status = 'published'
            AND deleted_at IS NULL
        )
    );

DROP POLICY IF EXISTS units_insert_staff ON public.units;
CREATE POLICY units_insert_staff ON public.units
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS units_update_staff ON public.units;
CREATE POLICY units_update_staff ON public.units
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS units_delete_staff ON public.units;
CREATE POLICY units_delete_staff ON public.units
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- lessons - SELECT staff/published-own-grade (0022:86-103) + DML (0022:155-163)
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
                SELECT id FROM public.units
                WHERE grade_id = (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid()))
                  AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
                  AND status = 'published'
                  AND deleted_at IS NULL
            )
        )
    );

DROP POLICY IF EXISTS lessons_insert_staff ON public.lessons;
CREATE POLICY lessons_insert_staff ON public.lessons
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS lessons_update_staff ON public.lessons;
CREATE POLICY lessons_update_staff ON public.lessons
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
DROP POLICY IF EXISTS lessons_delete_staff ON public.lessons;
CREATE POLICY lessons_delete_staff ON public.lessons
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- lesson_videos / lesson_pdfs - SELECT gated (0009:188-195, 201-208)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_videos_select_gated ON public.lesson_videos;
CREATE POLICY lesson_videos_select_gated ON public.lesson_videos
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND status = 'ready' AND is_primary)
    );

DROP POLICY IF EXISTS lesson_pdfs_select_gated ON public.lesson_pdfs;
CREATE POLICY lesson_pdfs_select_gated ON public.lesson_pdfs
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND is_ready AND is_primary)
    );

-- ---------------------------------------------------------------------
-- progress - SELECT own/staff (0022:105-108)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS progress_select_own_or_staff ON public.progress;
CREATE POLICY progress_select_own_or_staff ON public.progress
    FOR SELECT
    USING ((student_id = (select auth.uid()) AND public.is_student()) OR public.is_mr_walid() OR public.is_admin() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- app_settings - SELECT staff (0009:248-251); write stays
-- admin / mr_walid-whatsapp% only (0009:253-257, 0022:165-175).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS app_settings_select_staff ON public.app_settings;
CREATE POLICY app_settings_select_staff ON public.app_settings
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- Staff RPC guards: append OR public.is_teacher() to every
-- `IF NOT (public.is_admin() OR public.is_mr_walid())` check.
-- Signatures and bodies are otherwise identical to the canonical
-- definitions (0007 / 0012 / 0013 / 0014 / 0015 / 0016 / 0017 / 0018).
-- ---------------------------------------------------------------------

-- --- student management ----------------------------------------------
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT role, grade_id INTO v_role, v_old FROM public.profiles WHERE id = p_student_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;
    IF v_role <> 'student' THEN
        RAISE EXCEPTION 'not_a_student';
    END IF;

    -- NULL clears the grade (A1: grade is nullable); only non-NULL ids
    -- must exist, be active and not soft-deleted.
    IF p_grade_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.grades WHERE id = p_grade_id AND is_active AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'grade_not_available';
    END IF;

    UPDATE public.profiles SET grade_id = p_grade_id WHERE id = p_student_id;

    PERFORM public.audit_log('student.grade_change', 'profile', p_student_id,
        jsonb_build_object('old_grade_id', v_old, 'new_grade_id', p_grade_id));
END $$;

CREATE OR REPLACE FUNCTION public.disable_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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

CREATE OR REPLACE FUNCTION public.soft_delete_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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

CREATE OR REPLACE FUNCTION public.list_trash()
RETURNS SETOF public.profiles
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
    SELECT * FROM public.profiles
    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC;
END $$;

-- --- subscriptions / codes -------------------------------------------
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_student_id AND role = 'student') THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    SELECT * INTO v_plan FROM public.pricing_plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'plan_not_found';
    END IF;

    -- mirror redeem_subscription_code (0006:116,124 / binding B8): inactive
    -- plans and plans on inactive or deleted grades are not purchasable
    IF NOT v_plan.is_active THEN
        RAISE EXCEPTION 'plan_not_available';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.grades
        WHERE id = v_plan.grade_id AND is_active AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'plan_not_available';
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

CREATE OR REPLACE FUNCTION public.revoke_subscription_code(p_code_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prev public.code_status;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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

-- --- grades lifecycle ------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_grade(p_grade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.grades SET deleted_at = NULL WHERE id = p_grade_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'grade_not_found';
    END IF;

    PERFORM public.audit_log('grade.restore', 'grade', p_grade_id);
END $$;

CREATE OR REPLACE FUNCTION public.create_grade(p_name text, p_sort_order integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF btrim(COALESCE(p_name, '')) = '' THEN
        RAISE EXCEPTION 'grade_name_required';
    END IF;

    IF EXISTS (SELECT 1 FROM public.grades WHERE name = btrim(p_name)) THEN
        RAISE EXCEPTION 'duplicate grade';
    END IF;

    BEGIN
        INSERT INTO public.grades (name, sort_order)
        VALUES (btrim(p_name), p_sort_order)
        RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
        -- race backstop for the concurrent create path
        RAISE EXCEPTION 'duplicate grade';
    END;

    PERFORM public.audit_log('grade.create', 'grade', v_id,
        jsonb_build_object('name', btrim(p_name), 'sort_order', p_sort_order));

    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_grade(
    p_grade_id uuid,
    p_name text DEFAULT NULL,
    p_sort_order integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_name text;
    v_sort_order integer;
    v_deleted_at timestamptz;
    v_is_active boolean;
    v_meta jsonb := '{}'::jsonb;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT name, sort_order, deleted_at, is_active
    INTO v_name, v_sort_order, v_deleted_at, v_is_active
    FROM public.grades WHERE id = p_grade_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'grade_not_found';
    END IF;
    IF v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'grade_deleted';
    END IF;
    IF NOT v_is_active THEN
        RAISE EXCEPTION 'grade_inactive';
    END IF;

    IF p_name IS NOT NULL AND btrim(p_name) = '' THEN
        RAISE EXCEPTION 'grade_name_required';
    END IF;

    IF p_name IS NOT NULL AND btrim(p_name) <> v_name
       AND EXISTS (SELECT 1 FROM public.grades WHERE name = btrim(p_name) AND id <> p_grade_id) THEN
        RAISE EXCEPTION 'duplicate grade';
    END IF;

    -- No-op: nothing provided, or every provided field already matches.
    IF (p_name IS NULL OR btrim(p_name) = v_name)
       AND (p_sort_order IS NULL OR p_sort_order = v_sort_order) THEN
        RETURN;
    END IF;

    BEGIN
        UPDATE public.grades
        SET name = COALESCE(NULLIF(btrim(p_name), ''), name),
            sort_order = COALESCE(p_sort_order, sort_order)
        WHERE id = p_grade_id;
    EXCEPTION WHEN unique_violation THEN
        -- race backstop for the concurrent rename path
        RAISE EXCEPTION 'duplicate grade';
    END;

    IF p_name IS NOT NULL AND btrim(p_name) <> v_name THEN
        v_meta := v_meta || jsonb_build_object('name', btrim(p_name), 'old_name', v_name);
    END IF;
    IF p_sort_order IS NOT NULL AND p_sort_order <> v_sort_order THEN
        v_meta := v_meta || jsonb_build_object('sort_order', p_sort_order);
    END IF;

    PERFORM public.audit_log('grade.update', 'grade', p_grade_id, v_meta);
END $$;

-- --- units lifecycle -------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_unit(p_grade_id uuid, p_name text, p_sort_order integer DEFAULT 0)
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.units SET deleted_at = NULL WHERE id = p_unit_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    PERFORM public.audit_log('unit.restore', 'unit', p_unit_id);
END $$;

-- --- lessons lifecycle -----------------------------------------------
CREATE OR REPLACE FUNCTION public.create_lesson(p_unit_id uuid, p_title text, p_description text DEFAULT NULL, p_sort_order integer DEFAULT 0)
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.lessons SET deleted_at = NULL WHERE id = p_lesson_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;

    PERFORM public.audit_log('lesson.restore', 'lesson', p_lesson_id);
END $$;

-- --- assets ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_pdf_upload(p_pdf_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
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

CREATE OR REPLACE FUNCTION public.create_codes_for_staff(
    p_plan_id uuid,
    p_count integer,
    p_note text DEFAULT NULL
)
RETURNS SETOF public.subscription_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    RETURN QUERY SELECT * FROM public.generate_codes_internal(p_plan_id, p_count, p_note);
END $$;

CREATE OR REPLACE FUNCTION public.create_pdf_upload_record(
    p_lesson_id uuid,
    p_original_name text,
    p_size_bytes bigint DEFAULT NULL
)
RETURNS TABLE (id uuid, storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_path text;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_size_bytes IS NOT NULL AND (p_size_bytes < 0 OR p_size_bytes > 52428800) THEN
        RAISE EXCEPTION 'invalid_pdf_size';
    END IF;

    -- NOTE: unqualified column refs must be avoided: the RETURNS TABLE
    -- OUT parameter `id` shadows table columns in SQL statements.
    IF NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id) THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id AND l.deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'lesson_deleted';
    END IF;

    v_path := p_lesson_id::text || '/' || gen_random_uuid()::text || '.pdf';

    INSERT INTO public.lesson_pdfs (lesson_id, storage_path, original_name, size_bytes, is_ready, is_primary)
    VALUES (p_lesson_id, v_path, btrim(p_original_name), p_size_bytes, false, false)
    RETURNING lesson_pdfs.id INTO v_id;

    PERFORM public.audit_log('pdf.upload_started', 'lesson_pdf', v_id,
        jsonb_build_object('lesson_id', p_lesson_id, 'original_name', p_original_name,
                           'storage_path', v_path, 'size_bytes', p_size_bytes));

    RETURN QUERY SELECT v_id, v_path;
END $$;

CREATE OR REPLACE FUNCTION public.create_video_upload_record(
    p_lesson_id uuid,
    p_bunny_video_id text,
    p_bunny_library_id text,
    p_title text,
    p_mode text,
    p_old_video_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, is_primary boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_primary boolean;
    v_old_status public.video_status;
    v_old_lesson uuid;
BEGIN
    -- staff guard reads the request-scoped claims (is_admin/is_mr_walid
    -- are RLS policy helpers granted to authenticated; see 0010)
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_mode NOT IN ('create', 'replace') THEN
        RAISE EXCEPTION 'invalid_mode';
    END IF;

    IF p_bunny_video_id IS NULL OR btrim(p_bunny_video_id) = ''
       OR p_bunny_library_id IS NULL OR btrim(p_bunny_library_id) = '' THEN
        RAISE EXCEPTION 'invalid_bunny_video_id';
    END IF;

    -- NOTE: unqualified column refs must be avoided: the RETURNS TABLE
    -- OUT parameters (id, is_primary) shadow table columns in SQL
    -- statements (same rule as 0015 §85).
    IF NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id) THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id AND l.deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'lesson_deleted';
    END IF;

    -- orphan-session guard (Phase 1 rule): at most one pending upload
    IF EXISTS (
        SELECT 1 FROM public.lesson_videos lv
        WHERE lv.lesson_id = p_lesson_id
          AND lv.status = 'pending_upload'
          AND lv.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'lesson_has_pending_upload';
    END IF;

    IF p_mode = 'replace' THEN
        IF p_old_video_id IS NULL THEN
            RAISE EXCEPTION 'old_video_required';
        END IF;
        SELECT lv.status, lv.lesson_id INTO v_old_status, v_old_lesson
        FROM public.lesson_videos lv
        WHERE lv.id = p_old_video_id AND lv.deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'old_video_not_found';
        END IF;
        IF v_old_lesson <> p_lesson_id THEN
            RAISE EXCEPTION 'wrong_lesson';
        END IF;
        IF v_old_status <> 'ready' THEN
            RAISE EXCEPTION 'old_video_not_ready';
        END IF;
        v_primary := false;
    ELSE
        v_primary := NOT EXISTS (
            SELECT 1 FROM public.lesson_videos lv
            WHERE lv.lesson_id = p_lesson_id AND lv.is_primary AND lv.deleted_at IS NULL
        );
    END IF;

    INSERT INTO public.lesson_videos
        (lesson_id, bunny_video_id, bunny_library_id, title, status, is_primary, sort_order)
    VALUES
        (p_lesson_id, btrim(p_bunny_video_id), btrim(p_bunny_library_id),
         btrim(p_title), 'pending_upload', v_primary, 0)
    RETURNING lesson_videos.id INTO v_id;

    PERFORM public.audit_log('video.upload_session_created', 'lesson_video', v_id,
        jsonb_build_object('lesson_id', p_lesson_id, 'mode', p_mode,
                           'bunny_video_id', p_bunny_video_id,
                           'old_video_id', p_old_video_id,
                           'is_primary', v_primary));

    RETURN QUERY SELECT v_id, v_primary;
END $$;

CREATE OR REPLACE FUNCTION public.delete_video_upload_record(
    p_lesson_id uuid,
    p_video_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
    v_status public.video_status;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lv.lesson_id, lv.status INTO v_lesson, v_status
    FROM public.lesson_videos lv
    WHERE lv.id = p_video_id AND lv.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'video_not_found';
    END IF;
    IF v_lesson <> p_lesson_id THEN
        RAISE EXCEPTION 'wrong_lesson';
    END IF;
    IF v_status <> 'pending_upload' THEN
        RAISE EXCEPTION 'video_not_pending';
    END IF;

    DELETE FROM public.lesson_videos WHERE id = p_video_id;

    PERFORM public.audit_log('video.upload_session_cancelled', 'lesson_video', p_video_id,
        jsonb_build_object('lesson_id', p_lesson_id));
END $$;

-- --- dashboards ------------------------------------------------------
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
        'subscriptions', jsonb_build_object(
            'active',               (SELECT count(*) FROM public.v_active_subscriptions),
            'expiring_7d',          (SELECT count(*) FROM public.v_active_subscriptions
                                     WHERE expires_at <= now() + interval '7 days'),
            'expired',              (SELECT count(*) FROM public.subscriptions WHERE status = 'expired'),
            'revenue_total',        (SELECT COALESCE(sum(total_price), 0) FROM public.v_active_subscriptions),
            'revenue_this_month',   (SELECT COALESCE(sum(total_price), 0) FROM public.subscriptions
                                     WHERE status = 'active' AND started_at >= date_trunc('month', now()))
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
        'codes', jsonb_build_object(
            'available', (SELECT count(*) FROM public.subscription_codes WHERE status = 'available'),
            'used',      (SELECT count(*) FROM public.subscription_codes WHERE status = 'used'),
            'revoked',   (SELECT count(*) FROM public.subscription_codes WHERE status = 'revoked')
        ),
        'by_grade', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'grade_name', r.grade_name,
                'students', r.students,
                'active_subscribers', r.active_subscribers
            ) ORDER BY r.sort_order)
            FROM (
                SELECT g.name AS grade_name, g.sort_order,
                       count(DISTINCT p.id) AS students,
                       count(DISTINCT s.student_id) AS active_subscribers
                FROM public.grades g
                LEFT JOIN public.profiles p
                       ON p.grade_id = g.id AND p.deleted_at IS NULL
                LEFT JOIN public.v_active_subscriptions s ON s.student_id = p.id
                WHERE g.deleted_at IS NULL
                GROUP BY g.id, g.name, g.sort_order
            ) r
        ), '[]'::jsonb),
        'recent_subscriptions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', p.full_name,
                'grade_name', g.name,
                'duration_days', pl.duration_days,
                'total_price', s.total_price,
                'status', s.status,
                'started_at', s.started_at,
                'expires_at', s.expires_at
            ) ORDER BY s.created_at DESC)
            FROM public.subscriptions s
            JOIN public.profiles p ON p.id = s.student_id
            JOIN public.pricing_plans pl ON pl.id = s.pricing_plan_id
            LEFT JOIN public.grades g ON g.id = pl.grade_id
            LIMIT 5
        ), '[]'::jsonb),
        'upcoming_expirations', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', p.full_name,
                'expires_at', s.expires_at
            ) ORDER BY s.expires_at)
            FROM public.v_active_subscriptions s
            JOIN public.profiles p ON p.id = s.student_id
            WHERE s.expires_at <= now() + interval '7 days'
            LIMIT 5
        ), '[]'::jsonb)
    ) INTO v_stats;

    RETURN v_stats;
END $$;
