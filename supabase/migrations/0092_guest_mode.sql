-- =====================================================================
-- 0092_guest_mode
-- Guest mode: admin-only hidden students.
--   * profiles.is_guest (default false); only admin toggles it.
--   * Guests use the platform normally (login, lessons, exams) but are
--     invisible to mr_walid / teacher / assistant AND to other students
--     (leaderboard, comments), and use direct unit activation instead of
--     codes (grant_guest_access creates a zero-price unit_purchase).
--   * Main staff lists/stats ALWAYS exclude guests (even for admin);
--     admin works with guests through the dedicated guest RPCs below.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Column + index + helper
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_is_guest_idx
    ON public.profiles (is_guest) WHERE is_guest;

COMMENT ON COLUMN public.profiles.is_guest IS
    'Guest mode (0092): hidden student, visible to admin only. Toggled via set_guest_status (admin-only).';

CREATE OR REPLACE FUNCTION public.is_guest_profile(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT p.is_guest FROM public.profiles p WHERE p.id = p_user_id), false);
$$;

COMMENT ON FUNCTION public.is_guest_profile(uuid) IS
    '0092: true when the profile is flagged as guest. Used by RLS + RPC guest filters. No client grants.';

REVOKE EXECUTE ON FUNCTION public.is_guest_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_guest_profile(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) RLS: direct PostgREST selects hide guests from non-admin staff.
--    (SECURITY DEFINER RPCs are filtered separately below.)
-- ---------------------------------------------------------------------

-- profiles: latest shape is 0074 (self + deleted_at gate).
DROP POLICY IF EXISTS profiles_select_own_or_staff ON public.profiles;
CREATE POLICY profiles_select_own_or_staff ON public.profiles
    FOR SELECT
    USING (
        ((id = auth.uid()) AND deleted_at IS NULL)
        OR public.is_admin()
        OR ((public.is_mr_walid() OR public.is_teacher()) AND COALESCE(is_guest, false) = false)
    );

-- unit_codes: latest shape is 0028 (admin/mr_walid/teacher staff read).
DROP POLICY IF EXISTS unit_codes_select_staff ON public.unit_codes;
CREATE POLICY unit_codes_select_staff ON public.unit_codes
    FOR SELECT
    USING (
        public.is_admin()
        OR ((public.is_mr_walid() OR public.is_teacher())
            AND (used_by IS NULL OR NOT public.is_guest_profile(used_by)))
    );

-- unit_purchases: latest shape is 0028.
DROP POLICY IF EXISTS unit_purchases_select_own_or_staff ON public.unit_purchases;
CREATE POLICY unit_purchases_select_own_or_staff ON public.unit_purchases
    FOR SELECT
    USING (
        student_id = auth.uid()
        OR public.is_admin()
        OR ((public.is_mr_walid() OR public.is_teacher())
            AND NOT public.is_guest_profile(student_id))
    );

-- progress: latest shape is 0064.
DROP POLICY IF EXISTS progress_select_own_or_staff ON public.progress;
CREATE POLICY progress_select_own_or_staff ON public.progress
    FOR SELECT
    USING (
        (student_id = (select auth.uid()) AND public.is_student())
        OR public.is_admin()
        OR ((public.is_mr_walid() OR public.is_teacher())
            AND NOT public.is_guest_profile(student_id))
    );

-- streak tables: latest shape is 0085 (admin/mr_walid/teacher staff read).
DROP POLICY IF EXISTS streak_freezes_select_own_or_staff ON public.streak_freezes;
CREATE POLICY streak_freezes_select_own_or_staff ON public.streak_freezes
    FOR SELECT
    USING (
        student_id = auth.uid()
        OR public.is_admin()
        OR ((public.is_mr_walid() OR public.is_teacher())
            AND NOT public.is_guest_profile(student_id))
    );

DROP POLICY IF EXISTS streak_vouchers_select_own_or_staff ON public.streak_vouchers;
CREATE POLICY streak_vouchers_select_own_or_staff ON public.streak_vouchers
    FOR SELECT
    USING (
        student_id = auth.uid()
        OR public.is_admin()
        OR ((public.is_mr_walid() OR public.is_teacher())
            AND NOT public.is_guest_profile(student_id))
    );

-- presence sessions/events: latest shape is 0072 (staff incl. assistant).
DROP POLICY IF EXISTS student_sessions_select_own_or_admin ON public.student_sessions;
CREATE POLICY student_sessions_select_own_or_admin ON public.student_sessions
    FOR SELECT USING (
        student_id = auth.uid()
        OR public.is_admin()
        OR ((public.is_mr_walid() OR public.is_teacher() OR public.is_assistant())
            AND NOT public.is_guest_profile(student_id))
    );

DROP POLICY IF EXISTS student_activity_events_select_own_or_admin ON public.student_activity_events;
CREATE POLICY student_activity_events_select_own_or_admin ON public.student_activity_events
    FOR SELECT USING (
        student_id = auth.uid()
        OR public.is_admin()
        OR ((public.is_mr_walid() OR public.is_teacher() OR public.is_assistant())
            AND NOT public.is_guest_profile(student_id))
    );

-- lesson_comments: latest shape is 0064 (staff + author + access).
DROP POLICY IF EXISTS lesson_comments_select_gated ON public.lesson_comments;
CREATE POLICY lesson_comments_select_gated ON public.lesson_comments
    FOR SELECT USING (
        (
            public.is_admin()
            OR ((public.is_mr_walid() OR public.is_teacher()) AND NOT public.is_guest_profile(author_id))
            OR author_id = auth.uid()
            OR (public.can_access_lesson(lesson_id) AND NOT public.is_guest_profile(author_id))
        )
        AND (
            status = 'visible'
            OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
            OR author_id = auth.uid()
        )
    );

-- exam_attempts / exam_answers: latest shape is 0029 (admin/mr_walid/teacher).
DROP POLICY IF EXISTS exam_attempts_select_own_or_staff ON public.exam_attempts;
CREATE POLICY exam_attempts_select_own_or_staff ON public.exam_attempts
    FOR SELECT
    USING (
        student_id = auth.uid()
        OR public.is_admin()
        OR ((public.is_mr_walid() OR public.is_teacher())
            AND NOT public.is_guest_profile(student_id))
    );

DROP POLICY IF EXISTS exam_answers_select_own_or_staff ON public.exam_answers;
CREATE POLICY exam_answers_select_own_or_staff ON public.exam_answers
    FOR SELECT
    USING (
        public.is_admin()
        OR ((public.is_mr_walid() OR public.is_teacher())
            AND NOT EXISTS (
                SELECT 1 FROM public.exam_attempts a
                WHERE a.id = exam_answers.attempt_id
                  AND public.is_guest_profile(a.student_id)
            ))
        OR attempt_id IN (
            SELECT a.id FROM public.exam_attempts a
            WHERE a.student_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------
-- 3) Staff mutation RPCs: non-admin callers are rejected on guest
--    targets (defense in depth; UUIDs are unguessable and the UI never
--    exposes guest ids to non-admins). Bodies mirror 0025/0069/0070.
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

    -- 0092: guests are admin-managed only.
    IF NOT public.is_admin() AND public.is_guest_profile(p_student_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF p_grade_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.grades WHERE id = p_grade_id AND is_active AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'grade_not_available';
    END IF;

    UPDATE public.profiles SET grade_id = p_grade_id WHERE id = p_student_id;

    PERFORM public.audit_log('student.grade_change', 'profile', p_student_id,
        jsonb_build_object('old_grade_id', v_old, 'new_grade_id', p_grade_id));
END $$;

-- Stale single-arg overload superseded by the 0069 (uuid, text) version.
DROP FUNCTION IF EXISTS public.disable_student(uuid);

CREATE OR REPLACE FUNCTION public.disable_student(p_student_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF NOT public.is_admin() AND public.is_guest_profile(p_student_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'suspension_reason_required';
    END IF;

    UPDATE public.profiles
    SET status = 'disabled',
        suspension_reason = v_reason
    WHERE id = p_student_id AND role = 'student' AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.audit_log('student.disable', 'profile', p_student_id,
        jsonb_build_object('reason', v_reason));
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

    IF NOT public.is_admin() AND public.is_guest_profile(p_student_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.profiles
    SET status = 'active',
        suspension_reason = NULL
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

    IF NOT public.is_admin() AND public.is_guest_profile(p_student_id) THEN
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

    IF NOT public.is_admin() AND public.is_guest_profile(p_student_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.profiles
    SET deleted_at = NULL, status = 'active', suspension_reason = NULL
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

    IF NOT public.is_admin() AND public.is_guest_profile(p_student_id) THEN
        RAISE EXCEPTION 'access_denied';
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

CREATE OR REPLACE FUNCTION public.update_suspension_reason(p_student_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF NOT public.is_admin() AND public.is_guest_profile(p_student_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'suspension_reason_required';
    END IF;

    UPDATE public.profiles
    SET suspension_reason = v_reason
    WHERE id = p_student_id
      AND role = 'student'
      AND status = 'disabled'
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.audit_log('student.suspension_reason_update', 'profile', p_student_id,
        jsonb_build_object('reason', v_reason));
END $$;

-- ---------------------------------------------------------------------
-- 4) list_trash: guests never appear here (admin manages guest trash
--    through list_guests with p_include_deleted).
-- ---------------------------------------------------------------------
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
      AND COALESCE(is_guest, false) = false
    ORDER BY deleted_at DESC;
END $$;

-- ---------------------------------------------------------------------
-- 5) Guest admin RPCs (admin-only, audited)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_guest_status(p_student_id uuid, p_is_guest boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role public.user_role;
    v_old boolean;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT role, is_guest INTO v_role, v_old FROM public.profiles WHERE id = p_student_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;
    IF v_role <> 'student' THEN
        RAISE EXCEPTION 'target_not_student';
    END IF;

    UPDATE public.profiles SET is_guest = COALESCE(p_is_guest, false) WHERE id = p_student_id;

    PERFORM public.audit_log('student.guest_status', 'profile', p_student_id,
        jsonb_build_object('old_is_guest', v_old, 'new_is_guest', COALESCE(p_is_guest, false)));
END $$;

COMMENT ON FUNCTION public.set_guest_status(uuid, boolean) IS
    '0092: admin-only guest flag toggle. Unguesting keeps previously granted guest purchases (they behave like normal purchases afterwards).';

REVOKE EXECUTE ON FUNCTION public.set_guest_status(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_guest_status(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_guests(p_include_deleted boolean DEFAULT false)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    RETURN QUERY
    SELECT * FROM public.profiles
    WHERE role = 'student'
      AND COALESCE(is_guest, false) = true
      AND (COALESCE(p_include_deleted, false) OR deleted_at IS NULL)
    ORDER BY created_at DESC;
END $$;

COMMENT ON FUNCTION public.list_guests(boolean) IS
    '0092: admin-only guest list (feeds the separate Guests page).';

REVOKE EXECUTE ON FUNCTION public.list_guests(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_guests(boolean) TO authenticated;

-- Direct per-unit activation for guests (no codes). Grade-scoped like
-- redeem_unit_code: the unit must belong to the student's grade.
CREATE OR REPLACE FUNCTION public.grant_guest_access(p_student_id uuid, p_unit_id uuid)
RETURNS public.unit_purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_grade uuid;
    v_unit public.units%ROWTYPE;
    v_purchase public.unit_purchases%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT grade_id INTO v_grade
    FROM public.profiles
    WHERE id = p_student_id AND role = 'student' AND deleted_at IS NULL
      AND COALESCE(is_guest, false) = true;
    IF v_grade IS NULL THEN
        RAISE EXCEPTION 'guest_not_found';
    END IF;

    SELECT * INTO v_unit FROM public.units WHERE id = p_unit_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;
    IF v_unit.status <> 'published' THEN
        RAISE EXCEPTION 'unit_inactive';
    END IF;
    IF v_unit.grade_id <> v_grade THEN
        RAISE EXCEPTION 'unit_not_in_student_grade';
    END IF;

    INSERT INTO public.unit_purchases (student_id, unit_id, base_price, platform_fee, code_id, status)
    VALUES (p_student_id, v_unit.id, 0, 0, NULL, 'active')
    ON CONFLICT (student_id, unit_id) DO UPDATE SET status = 'active'
    RETURNING * INTO v_purchase;

    PERFORM public.audit_log('guest.access_grant', 'unit_purchases', v_purchase.id,
        jsonb_build_object('student_id', p_student_id, 'unit_id', v_unit.id));

    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    VALUES (p_student_id, 'unit_activated', 'تم تفعيل الوحدة', v_unit.name,
            'unit_activated:' || v_purchase.id, 'unit_purchases', v_purchase.id)
    ON CONFLICT (dedup_key) DO NOTHING;

    RETURN v_purchase;
END $$;

COMMENT ON FUNCTION public.grant_guest_access(uuid, uuid) IS
    '0092: admin-only direct unit activation for guests (zero-price purchase, no code). Grade-scoped; idempotent.';

REVOKE EXECUTE ON FUNCTION public.grant_guest_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_guest_access(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_guest_access(p_student_id uuid, p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF NOT public.is_guest_profile(p_student_id) THEN
        RAISE EXCEPTION 'guest_not_found';
    END IF;

    UPDATE public.unit_purchases
    SET status = 'void'
    WHERE student_id = p_student_id AND unit_id = p_unit_id AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'purchase_not_found';
    END IF;

    PERFORM public.audit_log('guest.access_revoke', 'unit_purchases', NULL,
        jsonb_build_object('student_id', p_student_id, 'unit_id', p_unit_id));
END $$;

COMMENT ON FUNCTION public.revoke_guest_access(uuid, uuid) IS
    '0092: admin-only removal of a guest unit activation (voids the purchase).';

REVOKE EXECUTE ON FUNCTION public.revoke_guest_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_guest_access(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_guest_purchases(p_student_id uuid DEFAULT NULL)
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
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    RETURN QUERY
        SELECT up.id, up.student_id, up.unit_id, up.base_price, up.platform_fee,
               up.total_price, up.code_id, up.status, up.purchased_at,
               u.name, g.name
        FROM public.unit_purchases up
        JOIN public.units u ON u.id = up.unit_id
        JOIN public.grades g ON g.id = u.grade_id
        JOIN public.profiles pst ON pst.id = up.student_id
        WHERE COALESCE(pst.is_guest, false) = true
          AND (p_student_id IS NULL OR up.student_id = p_student_id)
        ORDER BY up.purchased_at DESC;
END $$;

COMMENT ON FUNCTION public.list_guest_purchases(uuid) IS
    '0092: admin-only guest purchases (guest activations live here, never in list_all_unit_purchases).';

REVOKE EXECUTE ON FUNCTION public.list_guest_purchases(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_guest_purchases(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_guest_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stats jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT jsonb_build_object(
        'total_guests', (SELECT count(*) FROM public.profiles
                         WHERE role = 'student' AND COALESCE(is_guest, false) = true AND deleted_at IS NULL),
        'active_guests', (SELECT count(*) FROM public.profiles
                          WHERE role = 'student' AND COALESCE(is_guest, false) = true
                            AND deleted_at IS NULL AND status = 'active'),
        'guest_purchases', (SELECT count(*) FROM public.unit_purchases up
                            JOIN public.profiles p ON p.id = up.student_id
                            WHERE up.status = 'active' AND COALESCE(p.is_guest, false) = true),
        'new_guest_suggestions', (SELECT count(*) FROM public.platform_suggestions s
                                  JOIN public.profiles p ON p.id = s.student_id
                                  WHERE s.status = 'new' AND COALESCE(p.is_guest, false) = true)
    ) INTO v_stats;

    RETURN v_stats;
END $$;

COMMENT ON FUNCTION public.get_guest_stats() IS
    '0092: admin-only guest overview counters for the Guests page header.';

REVOKE EXECUTE ON FUNCTION public.get_guest_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_guest_suggestions(
    p_status text DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id           uuid,
    student_id   uuid,
    kind         text,
    title        text,
    body         text,
    image_path   text,
    status       text,
    created_at   timestamptz,
    student_name text,
    student_phone text,
    grade_name   text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF p_status IS NOT NULL AND p_status NOT IN ('new', 'reviewed', 'planned', 'done', 'rejected') THEN
        RAISE EXCEPTION 'invalid_status';
    END IF;

    RETURN QUERY
    SELECT s.id, s.student_id, s.kind, s.title, s.body, s.image_path, s.status, s.created_at,
           COALESCE(p.full_name, ''), COALESCE(p.phone, ''), g.name
    FROM public.platform_suggestions s
    JOIN public.profiles p ON p.id = s.student_id AND COALESCE(p.is_guest, false) = true
    LEFT JOIN public.grades g ON g.id = p.grade_id
    WHERE (p_status IS NULL OR s.status = p_status)
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END $$;

COMMENT ON FUNCTION public.list_guest_suggestions(text, integer, integer) IS
    '0092: admin-only guest suggestions inbox (guest rows live here, never in list_suggestions).';

REVOKE EXECUTE ON FUNCTION public.list_guest_suggestions(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_guest_suggestions(text, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------
-- 6) Existing readers: always exclude guests (for every caller,
--    including admin — admin uses the guest RPCs above).
-- ---------------------------------------------------------------------

-- list_codes_by_unit: latest shape is 0040 (TABLE + used_by_name).
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
          AND (uc.used_by IS NULL OR NOT public.is_guest_profile(uc.used_by))
        ORDER BY uc.created_at DESC;
END $$;

COMMENT ON FUNCTION public.list_codes_by_unit(uuid) IS
    '0092: guest-redeemed codes are excluded for every caller (guest activations use grant_guest_access, never codes).';

REVOKE EXECUTE ON FUNCTION public.list_codes_by_unit(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_codes_by_unit(uuid) TO authenticated;

-- list_all_unit_purchases: latest shape is 0028.
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
          AND NOT public.is_guest_profile(up.student_id)
        ORDER BY up.purchased_at DESC;
END $$;

-- unit_purchase_stats: latest shape is 0028.
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
        'total_purchases', (SELECT count(*) FROM public.unit_purchases up
                            WHERE up.status = 'active' AND NOT public.is_guest_profile(up.student_id)),
        'total_revenue', (SELECT COALESCE(sum(up.total_price), 0) FROM public.unit_purchases up
                          WHERE up.status = 'active' AND NOT public.is_guest_profile(up.student_id)),
        'revenue_this_month', (SELECT COALESCE(sum(up.total_price), 0) FROM public.unit_purchases up
                               WHERE up.status = 'active'
                                 AND up.purchased_at >= date_trunc('month', now())
                                 AND NOT public.is_guest_profile(up.student_id)),
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
                WHERE up.status = 'active' AND NOT public.is_guest_profile(up.student_id)
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
                WHERE up.status = 'active' AND NOT public.is_guest_profile(up.student_id)
                GROUP BY u.id, u.name
                ORDER BY revenue DESC
                LIMIT 5
            ) r
        ), '[]'::jsonb)
    ) INTO v_stats;

    RETURN v_stats;
END $$;

-- get_dashboard_stats: latest shape is 0072 (assistant included).
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stats jsonb;
    v_total_students int;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT count(*) INTO v_total_students FROM public.profiles
    WHERE deleted_at IS NULL AND role = 'student' AND COALESCE(is_guest, false) = false;

    SELECT jsonb_build_object(
        'students', jsonb_build_object(
            'total',        (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND role = 'student' AND COALESCE(is_guest, false) = false),
            'active',       (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'active' AND role = 'student' AND COALESCE(is_guest, false) = false),
            'disabled',     (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND status = 'disabled' AND role = 'student' AND COALESCE(is_guest, false) = false),
            'deleted',      (SELECT count(*) FROM public.profiles WHERE deleted_at IS NOT NULL AND role = 'student' AND COALESCE(is_guest, false) = false),
            'new_this_month', (SELECT count(*) FROM public.profiles
                               WHERE deleted_at IS NULL AND role = 'student' AND COALESCE(is_guest, false) = false AND created_at >= date_trunc('month', now()))
        ),
        'purchases', jsonb_build_object(
            'total',                    (SELECT count(*) FROM public.unit_purchases up WHERE up.status = 'active' AND NOT public.is_guest_profile(up.student_id)),
            'staff_revenue_this_month', (SELECT COALESCE(sum(up.base_price), 0) FROM public.unit_purchases up
                                         WHERE up.status = 'active' AND up.purchased_at >= date_trunc('month', now()) AND NOT public.is_guest_profile(up.student_id)),
            'platform_fee_total',       (SELECT COALESCE(sum(up.platform_fee), 0) FROM public.unit_purchases up
                                         WHERE up.status = 'active' AND NOT public.is_guest_profile(up.student_id))
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
            'students_with_progress', (SELECT count(DISTINCT pr.student_id) FROM public.progress pr WHERE NOT public.is_guest_profile(pr.student_id)),
            'completed_lessons',      (SELECT count(*) FROM public.progress pr WHERE pr.is_completed AND NOT public.is_guest_profile(pr.student_id)),
            'avg_percent',            (SELECT COALESCE(round(avg(pr.percent_completed), 2), 0) FROM public.progress pr WHERE NOT public.is_guest_profile(pr.student_id)),
            'participation_rate',     (SELECT CASE WHEN v_total_students = 0 THEN 0 ELSE round((count(DISTINCT pr.student_id)::numeric / v_total_students * 100), 1) END FROM public.progress pr WHERE NOT public.is_guest_profile(pr.student_id)),
            'completion_rate',        (SELECT CASE WHEN count(*) = 0 THEN 0 ELSE round((count(*) FILTER (WHERE pr.is_completed)::numeric / count(*) * 100), 1) END FROM public.progress pr WHERE NOT public.is_guest_profile(pr.student_id)),
            'active_last_7d',         (SELECT count(DISTINCT pr.student_id) FROM public.progress pr WHERE pr.last_watched_at >= now() - interval '7 days' AND NOT public.is_guest_profile(pr.student_id)),
            'inactive_students',      (SELECT count(*) FROM public.profiles p WHERE p.role='student' AND p.deleted_at IS NULL AND COALESCE(p.is_guest, false) = false AND NOT EXISTS (SELECT 1 FROM public.progress pr WHERE pr.student_id=p.id)),
            'distribution', jsonb_build_object(
                'q1', (SELECT count(*) FROM public.progress pr WHERE pr.percent_completed >= 0 AND pr.percent_completed < 25 AND NOT public.is_guest_profile(pr.student_id)),
                'q2', (SELECT count(*) FROM public.progress pr WHERE pr.percent_completed >= 25 AND pr.percent_completed < 50 AND NOT public.is_guest_profile(pr.student_id)),
                'q3', (SELECT count(*) FROM public.progress pr WHERE pr.percent_completed >= 50 AND pr.percent_completed < 75 AND NOT public.is_guest_profile(pr.student_id)),
                'q4', (SELECT count(*) FROM public.progress pr WHERE pr.percent_completed >= 75 AND pr.percent_completed <= 100 AND NOT public.is_guest_profile(pr.student_id))
            )
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
                       ON p.grade_id = g.id AND p.deleted_at IS NULL AND p.role = 'student' AND COALESCE(p.is_guest, false) = false
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
                WHERE up.status = 'active' AND NOT public.is_guest_profile(up.student_id)
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
            JOIN public.profiles p ON p.id = up.student_id AND COALESCE(p.is_guest, false) = false
            JOIN public.units u ON u.id = up.unit_id
            JOIN public.grades g ON g.id = u.grade_id
            WHERE up.status = 'active'
            LIMIT 5
        ), '[]'::jsonb),
        'recent_completions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_name', r.student_name,
                'lesson_title', r.lesson_title,
                'unit_name', r.unit_name,
                'completed_at', r.completed_at
            ) ORDER BY r.completed_at DESC)
            FROM (
                SELECT p.full_name AS student_name,
                       l.title AS lesson_title,
                       u.name AS unit_name,
                       COALESCE(pr.completed_at, pr.last_watched_at) AS completed_at
                FROM public.progress pr
                JOIN public.profiles p ON p.id = pr.student_id AND COALESCE(p.is_guest, false) = false
                JOIN public.lessons l ON l.id = pr.lesson_id
                JOIN public.units u ON u.id = l.unit_id
                WHERE pr.is_completed = true
                ORDER BY 4 DESC
                LIMIT 5
            ) r
        ), '[]'::jsonb),
        'top_active', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_id', r.student_id,
                'full_name', r.full_name,
                'grade_name', r.grade_name,
                'completed_lessons', r.completed_lessons,
                'avg_percent', r.avg_percent,
                'total_lessons', r.total_lessons
            ) ORDER BY r.completed_lessons DESC, r.avg_percent DESC)
            FROM (
                SELECT pr.student_id,
                       p.full_name,
                       g.name AS grade_name,
                       count(*) FILTER (WHERE pr.is_completed) AS completed_lessons,
                       round(avg(pr.percent_completed), 1) AS avg_percent,
                       count(*) AS total_lessons
                FROM public.progress pr
                JOIN public.profiles p ON p.id = pr.student_id AND COALESCE(p.is_guest, false) = false
                LEFT JOIN public.grades g ON g.id = p.grade_id
                WHERE p.deleted_at IS NULL AND p.role='student'
                GROUP BY pr.student_id, p.full_name, g.name
                ORDER BY count(*) FILTER (WHERE pr.is_completed) DESC, avg(pr.percent_completed) DESC
                LIMIT 5
            ) r
        ), '[]'::jsonb),
        'daily_completions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'day', r.day,
                'count', r.count
            ) ORDER BY r.day ASC)
            FROM (
                SELECT (COALESCE(pr.completed_at, pr.last_watched_at)::date)::text AS day,
                       count(*) AS count
                FROM public.progress pr
                WHERE pr.is_completed = true
                  AND COALESCE(pr.completed_at, pr.last_watched_at) >= CURRENT_DATE - 6
                  AND NOT public.is_guest_profile(pr.student_id)
                GROUP BY 1
                ORDER BY day ASC
            ) r
        ), '[]'::jsonb)
    ) INTO v_stats;

    RETURN v_stats;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

COMMENT ON FUNCTION public.get_dashboard_stats() IS '0092: every student/purchase/progress aggregate excludes guests (admin uses get_guest_stats for the guest overview).';

-- get_financial_reports: latest shape is 0043.
CREATE OR REPLACE FUNCTION public.get_financial_reports(
    p_from timestamptz DEFAULT NULL,
    p_to   timestamptz DEFAULT NULL,
    p_grade_id uuid DEFAULT NULL,
    p_unit_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF p_grade_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.grades WHERE id=p_grade_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'grade_not_found';
  END IF;
  IF p_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.units WHERE id=p_unit_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'unit_not_found';
  END IF;

  SELECT jsonb_build_object(
    'filters', jsonb_build_object('from', p_from, 'to', p_to, 'grade_id', p_grade_id, 'unit_id', p_unit_id),
    'summary', jsonb_build_object(
        'total_purchases', (SELECT count(*) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND NOT public.is_guest_profile(up.student_id) AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'total_base',      (SELECT COALESCE(sum(up.base_price),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND NOT public.is_guest_profile(up.student_id) AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'total_platform_fee', (SELECT COALESCE(sum(up.platform_fee),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND NOT public.is_guest_profile(up.student_id) AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'total_revenue',   (SELECT COALESCE(sum(up.total_price),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND NOT public.is_guest_profile(up.student_id) AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'avg_ticket',      (SELECT COALESCE(round(avg(up.total_price),2),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND NOT public.is_guest_profile(up.student_id) AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'void_purchases',  (SELECT count(*) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='void' AND NOT public.is_guest_profile(up.student_id) AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)),
        'expenses_total',  (SELECT COALESCE(sum(amount),0) FROM public.platform_expenses WHERE (p_from IS NULL OR spent_at>=p_from) AND (p_to IS NULL OR spent_at<=p_to)),
        'payouts_total',   (SELECT COALESCE(sum(amount),0) FROM public.platform_payouts WHERE (p_from IS NULL OR paid_at>=p_from) AND (p_to IS NULL OR paid_at<=p_to)),
        'net_platform',    (SELECT COALESCE(sum(up.platform_fee),0) FROM public.unit_purchases up JOIN public.units u ON u.id=up.unit_id WHERE up.status='active' AND NOT public.is_guest_profile(up.student_id) AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)) - (SELECT COALESCE(sum(amount),0) FROM public.platform_expenses WHERE (p_from IS NULL OR spent_at>=p_from) AND (p_to IS NULL OR spent_at<=p_to)) - (SELECT COALESCE(sum(amount),0) FROM public.platform_payouts WHERE (p_from IS NULL OR paid_at>=p_from) AND (p_to IS NULL OR paid_at<=p_to))
    ),
    'by_grade', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('grade_id', r.grade_id,'grade_name',r.grade_name,'purchases',r.purchases,'base_revenue',r.base_revenue,'platform_revenue',r.platform_revenue,'total_revenue',r.total_revenue) ORDER BY r.sort_order)
        FROM (
          SELECT g.id as grade_id, g.name as grade_name, g.sort_order,
                 count(up.id) as purchases,
                 COALESCE(sum(up.base_price),0) as base_revenue,
                 COALESCE(sum(up.platform_fee),0) as platform_revenue,
                 COALESCE(sum(up.total_price),0) as total_revenue
          FROM public.grades g
          LEFT JOIN public.units u ON u.grade_id=g.id AND u.deleted_at IS NULL AND (p_unit_id IS NULL OR u.id=p_unit_id)
          LEFT JOIN public.unit_purchases up ON up.unit_id=u.id AND up.status='active' AND NOT public.is_guest_profile(up.student_id) AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to)
          WHERE g.deleted_at IS NULL AND (p_grade_id IS NULL OR g.id=p_grade_id)
          GROUP BY g.id,g.name,g.sort_order
        ) r
    ),'[]'::jsonb),
    'by_unit', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('unit_id',r.unit_id,'unit_name',r.unit_name,'grade_name',r.grade_name,'purchases',r.purchases,'base_revenue',r.base_revenue,'platform_revenue',r.platform_revenue,'total_revenue',r.total_revenue) ORDER BY r.total_revenue DESC)
        FROM (
          SELECT u.id as unit_id, u.name as unit_name, g.name as grade_name,
                 count(up.id) as purchases,
                 COALESCE(sum(up.base_price),0) as base_revenue,
                 COALESCE(sum(up.platform_fee),0) as platform_revenue,
                 COALESCE(sum(up.total_price),0) as total_revenue
          FROM public.units u
          JOIN public.grades g ON g.id=u.grade_id
          LEFT JOIN public.unit_purchases up ON up.unit_id=u.id AND up.status='active' AND NOT public.is_guest_profile(up.student_id) AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to)
          WHERE u.deleted_at IS NULL AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)
          GROUP BY u.id,u.name,g.name
        ) r
        WHERE r.purchases > 0
    ),'[]'::jsonb),
    'daily', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('date',r.d,'purchases',r.purchases,'base_revenue',r.base_revenue,'platform_revenue',r.platform_revenue,'total_revenue',r.total_revenue) ORDER BY r.d)
        FROM (
          SELECT date_trunc('day', up.purchased_at)::date as d,
                 count(*) as purchases,
                 COALESCE(sum(up.base_price),0) as base_revenue,
                 COALESCE(sum(up.platform_fee),0) as platform_revenue,
                 COALESCE(sum(up.total_price),0) as total_revenue
          FROM public.unit_purchases up
          JOIN public.units u ON u.id=up.unit_id
          WHERE up.status='active' AND NOT public.is_guest_profile(up.student_id) AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR up.unit_id=p_unit_id)
          GROUP BY date_trunc('day', up.purchased_at)::date
          ORDER BY d DESC LIMIT 30
        ) r
    ),'[]'::jsonb),
    'code_stats', jsonb_build_object(
        'available', (SELECT count(*) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='available' AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)),
        'used',      (SELECT count(*) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='used' AND (uc.used_by IS NULL OR NOT public.is_guest_profile(uc.used_by)) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)),
        'revoked',   (SELECT count(*) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='revoked' AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)),
        'pending_base', (SELECT COALESCE(sum(up.base_price),0) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='available' AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)),
        'pending_total',(SELECT COALESCE(sum(up.total_price),0) FROM public.unit_codes uc JOIN public.unit_pricing up ON up.id=uc.unit_pricing_id JOIN public.units u ON u.id=up.unit_id WHERE uc.status='available' AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id))
    ),
    'recent_purchases', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('student_name',p.full_name,'grade_name',g.name,'unit_name',u.name,'base_price',up.base_price,'platform_fee',up.platform_fee,'total_price',up.total_price,'purchased_at',up.purchased_at) ORDER BY up.purchased_at DESC)
        FROM public.unit_purchases up
        JOIN public.profiles p ON p.id=up.student_id AND COALESCE(p.is_guest, false) = false
        JOIN public.units u ON u.id=up.unit_id
        JOIN public.grades g ON g.id=u.grade_id
        WHERE up.status='active' AND (p_from IS NULL OR up.purchased_at>=p_from) AND (p_to IS NULL OR up.purchased_at<=p_to) AND (p_grade_id IS NULL OR u.grade_id=p_grade_id) AND (p_unit_id IS NULL OR u.id=p_unit_id)
        LIMIT 10
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_financial_reports(timestamptz,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_financial_reports(timestamptz,timestamptz,uuid,uuid) TO authenticated;

COMMENT ON FUNCTION public.get_financial_reports(timestamptz,timestamptz,uuid,uuid) IS '0092: purchase/code aggregates exclude guests (guest activations are zero-price and live in list_guest_purchases).';

-- list_student_streaks: latest shape is 0085.
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
          AND COALESCE(p.is_guest, false) = false
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

-- ---------------------------------------------------------------------
-- 7) Presence readers: main lists exclude guests (admin-only surface,
--    but the Guests page has its own overview via get_guest_stats).
--    get_student_presence_history stays open for admin (used for guests
--    too — no leak: admin-only).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_online_students()
RETURNS SETOF public.v_online_students
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;
    RETURN QUERY
    SELECT v.* FROM public.v_online_students v
    JOIN public.profiles p ON p.id = v.student_id
    WHERE COALESCE(p.is_guest, false) = false
    ORDER BY v.last_seen_at DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_online_students() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_online_students() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_most_active_students(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_limit integer DEFAULT 20
)
RETURNS TABLE (
    student_id uuid,
    full_name text,
    phone text,
    grade_name text,
    total_sessions bigint,
    total_seconds bigint,
    total_hours numeric,
    last_seen_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    RETURN QUERY
    SELECT p.id AS student_id,
           p.full_name,
           p.phone,
           g.name AS grade_name,
           COUNT(s.id)::bigint AS total_sessions,
           COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at)))::bigint, 0) AS total_seconds,
           COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at)))/3600, 2), 0) AS total_hours,
           MAX(s.last_seen_at) AS last_seen_at
    FROM public.profiles p
    LEFT JOIN public.student_sessions s
           ON s.student_id = p.id
          AND (p_from IS NULL OR s.started_at >= p_from)
          AND (p_to IS NULL OR s.started_at <= p_to)
    LEFT JOIN public.grades g ON g.id = p.grade_id
    WHERE p.role = 'student' AND p.deleted_at IS NULL
      AND COALESCE(p.is_guest, false) = false
    GROUP BY p.id, p.full_name, p.phone, g.name
    HAVING COUNT(s.id) > 0
    ORDER BY total_seconds DESC, total_sessions DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
END $$;

REVOKE EXECUTE ON FUNCTION public.get_most_active_students(timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_most_active_students(timestamptz, timestamptz, integer) TO authenticated;

-- NOTE: 0056's overlapping-interval variant of get_most_active_students is
-- superseded here by the 0072-shaped body above (same signature). The
-- overlapping-window semantics are preserved by the caller passing p_from
-- / p_to; guest exclusion applies in both shapes.

CREATE OR REPLACE FUNCTION public.get_daily_active_students(
    p_date date,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    student_id uuid,
    full_name text,
    phone text,
    grade_name text,
    total_sessions bigint,
    total_seconds bigint,
    total_hours numeric,
    first_seen_at timestamptz,
    last_seen_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_from timestamptz := p_date::timestamptz;
    v_to   timestamptz := (p_date + 1)::timestamptz;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_date IS NULL THEN
        RAISE EXCEPTION 'invalid_date';
    END IF;

    RETURN QUERY
    SELECT p.id AS student_id,
           p.full_name,
           p.phone,
           g.name AS grade_name,
           COUNT(s.id)::bigint AS total_sessions,
           COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at))::bigint), 0)::bigint AS total_seconds,
           COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at)))/3600, 2), 0) AS total_hours,
           MIN(s.started_at) AS first_seen_at,
           MAX(s.last_seen_at) AS last_seen_at
    FROM public.profiles p
    JOIN public.student_sessions s
          ON s.student_id = p.id
         AND s.started_at < v_to
         AND COALESCE(s.ended_at, s.last_seen_at) >= v_from
    LEFT JOIN public.grades g ON g.id = p.grade_id
    WHERE p.role = 'student' AND p.deleted_at IS NULL
      AND COALESCE(p.is_guest, false) = false
    GROUP BY p.id, p.full_name, p.phone, g.name
    HAVING COUNT(s.id) > 0
    ORDER BY total_seconds DESC, last_seen_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END $$;

REVOKE EXECUTE ON FUNCTION public.get_daily_active_students(date, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_active_students(date, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_presence_daily_counts(
    p_from date DEFAULT CURRENT_DATE - 6,
    p_to   date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    day date,
    active_students bigint,
    total_sessions bigint,
    total_seconds bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
        RAISE EXCEPTION 'invalid_range';
    END IF;

    RETURN QUERY
    WITH days AS (
        SELECT generate_series(p_from, p_to, '1 day'::interval)::date AS d
    ),
    per_day AS (
        SELECT (s.started_at::date) AS d,
               s.student_id,
               COUNT(*) AS sessions,
               SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at))::bigint) AS secs
        FROM public.student_sessions s
        JOIN public.profiles p ON p.id = s.student_id AND COALESCE(p.is_guest, false) = false
        WHERE s.started_at::date BETWEEN p_from AND p_to
        GROUP BY (s.started_at::date), s.student_id
    )
    SELECT days.d AS day,
           COUNT(DISTINCT per_day.student_id)::bigint AS active_students,
           COALESCE(SUM(per_day.sessions), 0)::bigint AS total_sessions,
           COALESCE(SUM(per_day.secs), 0)::bigint AS total_seconds
    FROM days
    LEFT JOIN per_day ON per_day.d = days.d
    GROUP BY days.d
    ORDER BY days.d ASC;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_presence_daily_counts(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_presence_daily_counts(date, date) TO authenticated;

-- ---------------------------------------------------------------------
-- 8) Social surfaces: guests are hidden from non-admin viewers
--    (other students + mr_walid/teacher/assistant). Admin sees all.
-- ---------------------------------------------------------------------

-- list_lesson_comments: latest shape is 0061 (assistant included).
CREATE OR REPLACE FUNCTION public.list_lesson_comments(p_lesson_id uuid)
RETURNS TABLE (id uuid, lesson_id uuid, author_id uuid, author_name text, parent_id uuid, body text, status text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() OR public.can_access_lesson(p_lesson_id)) THEN RAISE EXCEPTION 'access_denied'; END IF;
    RETURN QUERY SELECT c.id, c.lesson_id, c.author_id, COALESCE(p.full_name, ''), c.parent_id, c.body, c.status, c.created_at FROM public.lesson_comments c JOIN public.lessons l ON l.id = c.lesson_id LEFT JOIN public.profiles p ON p.id = c.author_id WHERE c.lesson_id = p_lesson_id AND (c.status = 'visible' OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) AND (public.is_admin() OR NOT public.is_guest_profile(c.author_id)) ORDER BY c.created_at, c.id;
END $$;

-- get_general_exam_leaderboard: latest shape is 0080.
CREATE OR REPLACE FUNCTION public.get_general_exam_leaderboard(p_exam_id uuid)
RETURNS TABLE (
    rank bigint,
    student_id uuid,
    student_name text,
    status text,
    auto_score numeric,
    manual_score numeric,
    final_score numeric,
    submitted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exam public.exams%ROWTYPE;
    v_staff boolean := public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant();
    v_admin boolean := public.is_admin();
BEGIN
    SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id AND deleted_at IS NULL;
    IF v_exam.id IS NULL THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;
    IF v_exam.lesson_id IS NOT NULL OR v_exam.grade_id IS NULL THEN
        RAISE EXCEPTION 'not_general_exam';
    END IF;
    IF NOT (v_staff OR public.can_access_general_exam(p_exam_id)) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;
    IF NOT v_staff AND COALESCE(v_exam.show_leaderboard, true) = false THEN
        RAISE EXCEPTION 'leaderboard_hidden';
    END IF;

    RETURN QUERY
    SELECT ROW_NUMBER() OVER (
               ORDER BY a.final_score DESC NULLS LAST, a.submitted_at ASC
           ) AS rank,
           a.student_id, COALESCE(p.full_name, '') AS student_name,
           a.status, a.auto_score, a.manual_score, a.final_score, a.submitted_at
    FROM public.exam_attempts a
    JOIN public.profiles p ON p.id = a.student_id
    WHERE a.exam_id = p_exam_id
      AND (v_admin OR COALESCE(p.is_guest, false) = false)
    ORDER BY a.final_score DESC NULLS LAST, a.submitted_at ASC;
END $$;

-- grade_exam_attempt: refuse guest attempts for non-admin (latest: 0061).
CREATE OR REPLACE FUNCTION public.grade_exam_attempt(p_attempt_id uuid, p_scores jsonb)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_attempt public.exam_attempts%ROWTYPE; v_manual numeric(5, 2) := 0;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
    SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = p_attempt_id;
    IF v_attempt.id IS NULL THEN RAISE EXCEPTION 'attempt_not_found'; END IF;
    IF NOT public.is_admin() AND public.is_guest_profile(v_attempt.student_id) THEN RAISE EXCEPTION 'access_denied'; END IF;
    IF v_attempt.status = 'graded' THEN RAISE EXCEPTION 'already_graded'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(COALESCE(p_scores, '[]'::jsonb)) AS r(question_id uuid, score numeric) LEFT JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = v_attempt.exam_id AND q.type = 'essay' WHERE q.id IS NULL OR r.score IS NULL OR r.score < 0) THEN RAISE EXCEPTION 'invalid_scores'; END IF;
    UPDATE public.exam_answers a SET score = r.score FROM jsonb_to_recordset(COALESCE(p_scores, '[]'::jsonb)) AS r(question_id uuid, score numeric) WHERE a.attempt_id = v_attempt.id AND a.question_id = r.question_id;
    SELECT COALESCE(sum(a.score), 0) INTO v_manual FROM public.exam_answers a JOIN public.exam_questions q ON q.id = a.question_id WHERE a.attempt_id = v_attempt.id AND q.type = 'essay';
    UPDATE public.exam_attempts SET status = 'graded', manual_score = v_manual, final_score = COALESCE(auto_score, 0) + v_manual, graded_by = auth.uid(), graded_at = now() WHERE id = v_attempt.id RETURNING * INTO v_attempt;
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id) SELECT v_attempt.student_id, 'exam_graded', 'تم تصحيح الاختبار', e.title, 'exam_graded:' || v_attempt.id, 'exam_attempts', v_attempt.id FROM public.exams e WHERE e.id = v_attempt.exam_id ON CONFLICT (dedup_key) DO NOTHING;
    PERFORM public.audit_log('exam.graded', 'exam_attempts', p_attempt_id, jsonb_build_object('final_score', v_attempt.final_score, 'graded_by', auth.uid()));
    RETURN v_attempt;
END $$;

-- reset_general_exam_attempt: refuse guest targets for non-admin (0080).
CREATE OR REPLACE FUNCTION public.reset_general_exam_attempt(p_exam_id uuid, p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempt_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;
    IF NOT public.is_admin() AND public.is_guest_profile(p_student_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.exams
        WHERE id = p_exam_id AND deleted_at IS NULL
          AND lesson_id IS NULL AND grade_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;

    SELECT id INTO v_attempt_id FROM public.exam_attempts
    WHERE exam_id = p_exam_id AND student_id = p_student_id;
    IF v_attempt_id IS NULL THEN
        RAISE EXCEPTION 'attempt_not_found';
    END IF;

    DELETE FROM public.exam_answers WHERE attempt_id = v_attempt_id;
    DELETE FROM public.exam_attempts WHERE id = v_attempt_id;

    PERFORM public.audit_log('general_exam.attempt_reset', 'exam_attempts', v_attempt_id,
        jsonb_build_object('exam_id', p_exam_id, 'student_id', p_student_id));
END $$;

REVOKE EXECUTE ON FUNCTION public.reset_general_exam_attempt(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_general_exam_attempt(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 9) Fan-out notifications: guest activity notifies admins only
--    (otherwise mr_walid/teacher would learn that hidden students exist
--    and act). Bodies mirror 0061/0030.
-- ---------------------------------------------------------------------

-- add_lesson_comment: latest shape is 0061 (assistant included).
CREATE OR REPLACE FUNCTION public.add_lesson_comment(p_lesson_id uuid, p_body text, p_parent_id uuid DEFAULT NULL)
RETURNS public.lesson_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_comment public.lesson_comments%ROWTYPE; v_lesson text; v_parent public.lesson_comments%ROWTYPE; v_is_guest boolean := false; v_parent_admin boolean := false;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'permission_denied'; END IF;
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher() OR public.is_assistant() OR public.can_access_lesson(p_lesson_id)) THEN RAISE EXCEPTION 'access_denied'; END IF;
    IF length(btrim(COALESCE(p_body, ''))) = 0 OR length(btrim(COALESCE(p_body, ''))) > 1000 THEN RAISE EXCEPTION 'invalid_body'; END IF;
    IF p_parent_id IS NOT NULL THEN SELECT * INTO v_parent FROM public.lesson_comments WHERE id = p_parent_id; IF v_parent.id IS NULL OR v_parent.status <> 'visible' OR v_parent.lesson_id <> p_lesson_id THEN RAISE EXCEPTION 'invalid_parent'; END IF; END IF;
    v_is_guest := public.is_guest_profile(v_uid);
    SELECT title INTO v_lesson FROM public.lessons WHERE id = p_lesson_id;
    INSERT INTO public.lesson_comments (lesson_id, author_id, parent_id, body) VALUES (p_lesson_id, v_uid, p_parent_id, btrim(p_body)) RETURNING * INTO v_comment;
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id) SELECT u.id, 'comment_reply', 'تعليق جديد على الدرس', v_lesson, 'comment_reply:' || u.id || ':' || v_comment.id, 'lesson_comments', v_comment.id FROM public.profiles u WHERE u.role IN ('admin', 'mr_walid', 'teacher', 'assistant') AND u.status = 'active' AND u.deleted_at IS NULL AND u.id <> v_uid AND (NOT v_is_guest OR u.role = 'admin') ON CONFLICT (dedup_key) DO NOTHING;
    IF v_parent.id IS NOT NULL AND v_parent.author_id <> v_uid THEN SELECT (role = 'admin') INTO v_parent_admin FROM public.profiles WHERE id = v_parent.author_id; IF NOT v_is_guest OR COALESCE(v_parent_admin, false) THEN INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id) VALUES (v_parent.author_id, 'lesson_comment', 'تم الرد على تعليقك', v_lesson, 'lesson_comment:' || v_comment.id, 'lesson_comments', v_comment.id) ON CONFLICT (dedup_key) DO NOTHING; END IF; END IF;
    RETURN v_comment;
END $$;

-- submit_exam_attempt (lesson exams): staff fan-out skips non-admins for
-- guest submitters. Latest shape is 0061.
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(p_exam_id uuid, p_answers jsonb)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_exam public.exams%ROWTYPE; v_attempt public.exam_attempts; v_auto numeric(5,2):=0; v_has_essays boolean; v_is_guest boolean := false;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
    IF NOT public.is_student() THEN RAISE EXCEPTION 'permission_denied'; END IF;
    SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id AND deleted_at IS NULL;
    IF v_exam.id IS NULL THEN RAISE EXCEPTION 'exam_not_found'; END IF;
    IF NOT public.can_access_lesson(v_exam.lesson_id) THEN RAISE EXCEPTION 'access_denied'; END IF;
    IF EXISTS (SELECT 1 FROM public.exam_attempts WHERE exam_id = p_exam_id AND student_id = v_uid) THEN RAISE EXCEPTION 'attempt_already_exists'; END IF;
    IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_answers'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_answers) AS r(question_id uuid, choice_index integer, answer_text text) LEFT JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = p_exam_id WHERE q.id IS NULL) THEN RAISE EXCEPTION 'invalid_answers'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_answers) AS r(question_id uuid, choice_index integer, answer_text text) JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = p_exam_id WHERE (q.type = 'mcq' AND (r.choice_index IS NULL OR r.choice_index < 0 OR r.choice_index > jsonb_array_length(q.choices) -1)) OR (q.type = 'essay' AND length(btrim(COALESCE(r.answer_text, ''))) = 0)) THEN RAISE EXCEPTION 'invalid_answers'; END IF;
    v_is_guest := public.is_guest_profile(v_uid);
    INSERT INTO public.exam_attempts (exam_id, student_id, status) VALUES (p_exam_id, v_uid, 'submitted') RETURNING * INTO v_attempt;
    INSERT INTO public.exam_answers (attempt_id, question_id, choice_index, answer_text, score) SELECT v_attempt.id, q.id, r.choice_index, r.answer_text, CASE WHEN q.type='mcq' AND r.choice_index = q.correct_index THEN q.max_score ELSE NULL END FROM jsonb_to_recordset(p_answers) AS r(question_id uuid, choice_index integer, answer_text text) JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = p_exam_id;
    SELECT COALESCE(sum(score),0) INTO v_auto FROM public.exam_answers WHERE attempt_id = v_attempt.id;
    SELECT EXISTS (SELECT 1 FROM public.exam_questions WHERE exam_id = p_exam_id AND type='essay') INTO v_has_essays;
    UPDATE public.exam_attempts SET auto_score = v_auto WHERE id = v_attempt.id RETURNING * INTO v_attempt;
    IF NOT v_has_essays THEN UPDATE public.exam_attempts SET status='graded', manual_score=0, final_score=v_auto, graded_at=now() WHERE id = v_attempt.id RETURNING * INTO v_attempt; INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id) VALUES (v_uid, 'exam_graded', 'تم تصحيح الاختبار', v_exam.title, 'exam_graded:' || v_attempt.id, 'exam_attempts', v_attempt.id) ON CONFLICT (dedup_key) DO NOTHING; END IF;
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id) SELECT u.id, 'exam_submitted', 'اختبار بانتظار المراجعة', v_exam.title, 'exam_submitted:' || u.id || ':' || v_attempt.id, 'exam_attempts', v_attempt.id FROM public.profiles u WHERE u.role IN ('admin', 'mr_walid', 'teacher', 'assistant') AND u.status='active' AND u.deleted_at IS NULL AND (NOT v_is_guest OR u.role = 'admin') ON CONFLICT (dedup_key) DO NOTHING;
    PERFORM public.audit_log('exam.submitted', 'exam_attempts', v_attempt.id, jsonb_build_object('exam_id', p_exam_id, 'auto_score', v_auto));
    RETURN v_attempt;
END $$;

-- ---------------------------------------------------------------------
-- 10) Suggestions: main inbox excludes guests (admin-only surface, but
--     the Guests page owns guest rows via list_guest_suggestions).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_suggestions(
    p_kind text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id           uuid,
    student_id   uuid,
    kind         text,
    title        text,
    body         text,
    image_path   text,
    status       text,
    created_at   timestamptz,
    student_name text,
    student_phone text,
    grade_name   text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_kind IS NOT NULL AND p_kind NOT IN ('issue', 'suggestion', 'other') THEN
        RAISE EXCEPTION 'invalid_kind';
    END IF;

    IF p_status IS NOT NULL AND p_status NOT IN ('new', 'reviewed', 'planned', 'done', 'rejected') THEN
        RAISE EXCEPTION 'invalid_status';
    END IF;

    RETURN QUERY
    SELECT s.id, s.student_id, s.kind, s.title, s.body, s.image_path, s.status, s.created_at,
           COALESCE(p.full_name, ''), COALESCE(p.phone, ''), g.name
    FROM public.platform_suggestions s
    LEFT JOIN public.profiles p ON p.id = s.student_id
    LEFT JOIN public.grades g ON g.id = p.grade_id
    WHERE (p_kind IS NULL OR s.kind = p_kind)
      AND (p_status IS NULL OR s.status = p_status)
      AND NOT public.is_guest_profile(s.student_id)
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END $$;

CREATE OR REPLACE FUNCTION public.get_unread_suggestions_count()
RETURNS TABLE (
    unread_count integer,
    last_seen_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_watermark timestamptz;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT s.last_seen_at INTO v_watermark
    FROM public.suggestion_inbox_state s
    WHERE s.admin_id = auth.uid();

    IF v_watermark IS NULL THEN
        v_watermark := '1970-01-01T00:00:00Z'::timestamptz;
    END IF;

    RETURN QUERY
    SELECT count(*)::integer, v_watermark
    FROM public.platform_suggestions ps
    WHERE ps.created_at > v_watermark
      AND NOT public.is_guest_profile(ps.student_id);
END $$;

-- submit_general_exam_attempt: same admin-only fan-out for guest
-- submitters (latest shape is 0080).
CREATE OR REPLACE FUNCTION public.submit_general_exam_attempt(p_exam_id uuid, p_answers jsonb)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_exam public.exams%ROWTYPE;
    v_attempt public.exam_attempts;
    v_auto numeric(5, 2) := 0;
    v_has_essays boolean;
    v_deadline timestamptz;
    v_is_guest boolean := false;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;
    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id AND deleted_at IS NULL;
    IF v_exam.id IS NULL THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;
    IF v_exam.lesson_id IS NOT NULL OR v_exam.grade_id IS NULL THEN
        RAISE EXCEPTION 'not_general_exam';
    END IF;
    IF NOT public.can_access_general_exam(p_exam_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT * INTO v_attempt FROM public.exam_attempts
    WHERE exam_id = p_exam_id AND student_id = v_uid;
    IF v_attempt.id IS NULL OR v_attempt.started_at IS NULL THEN
        RAISE EXCEPTION 'not_started';
    END IF;
    IF EXISTS (SELECT 1 FROM public.exam_answers WHERE attempt_id = v_attempt.id) THEN
        RAISE EXCEPTION 'attempt_already_exists';
    END IF;

    IF v_exam.ends_at IS NOT NULL AND now() > v_exam.ends_at THEN
        RAISE EXCEPTION 'time_expired';
    END IF;
    IF v_exam.duration_minutes IS NOT NULL THEN
        v_deadline := v_attempt.started_at + (v_exam.duration_minutes || ' minutes')::interval;
        IF now() > v_deadline THEN
            RAISE EXCEPTION 'time_expired';
        END IF;
    END IF;

    IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'invalid_answers';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_answers)
             AS r(question_id uuid, choice_index integer, answer_text text)
        LEFT JOIN public.exam_questions q
               ON q.id = r.question_id AND q.exam_id = p_exam_id
        WHERE q.id IS NULL
    ) THEN
        RAISE EXCEPTION 'invalid_answers';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_answers)
             AS r(question_id uuid, choice_index integer, answer_text text)
        JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = p_exam_id
        WHERE (q.type = 'mcq'
               AND (r.choice_index IS NULL
                    OR r.choice_index < 0
                    OR r.choice_index > jsonb_array_length(q.choices) - 1))
           OR (q.type = 'essay'
               AND length(btrim(COALESCE(r.answer_text, ''))) = 0)
    ) THEN
        RAISE EXCEPTION 'invalid_answers';
    END IF;

    v_is_guest := public.is_guest_profile(v_uid);

    INSERT INTO public.exam_answers (attempt_id, question_id, choice_index, answer_text, score)
    SELECT v_attempt.id, q.id, r.choice_index, r.answer_text,
           CASE WHEN q.type = 'mcq' AND r.choice_index = q.correct_index
                THEN q.max_score ELSE NULL END
    FROM jsonb_to_recordset(p_answers)
         AS r(question_id uuid, choice_index integer, answer_text text)
    JOIN public.exam_questions q ON q.id = r.question_id AND q.exam_id = p_exam_id;

    SELECT COALESCE(sum(score), 0) INTO v_auto
    FROM public.exam_answers
    WHERE attempt_id = v_attempt.id;

    SELECT EXISTS (
        SELECT 1 FROM public.exam_questions
        WHERE exam_id = p_exam_id AND type = 'essay'
    ) INTO v_has_essays;

    UPDATE public.exam_attempts SET auto_score = v_auto
    WHERE id = v_attempt.id
    RETURNING * INTO v_attempt;

    IF NOT v_has_essays THEN
        UPDATE public.exam_attempts
        SET status = 'graded', manual_score = 0,
            final_score = v_auto, graded_at = now()
        WHERE id = v_attempt.id
        RETURNING * INTO v_attempt;

        INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
        VALUES (v_uid, 'exam_graded', 'تم تصحيح الاختبار', v_exam.title,
                'exam_graded:' || v_attempt.id, 'exam_attempts', v_attempt.id)
        ON CONFLICT (dedup_key) DO NOTHING;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT u.id, 'exam_submitted', 'اختبار بانتظار المراجعة', v_exam.title,
           'exam_submitted:' || u.id || ':' || v_attempt.id, 'exam_attempts', v_attempt.id
    FROM public.profiles u
    WHERE u.role IN ('admin', 'mr_walid', 'teacher', 'assistant')
      AND u.status = 'active' AND u.deleted_at IS NULL
      AND (NOT v_is_guest OR u.role = 'admin')
    ON CONFLICT (dedup_key) DO NOTHING;

    PERFORM public.audit_log('general_exam.submitted', 'exam_attempts', v_attempt.id,
        jsonb_build_object('exam_id', p_exam_id, 'auto_score', v_auto));

    RETURN v_attempt;
END $$;

CREATE OR REPLACE FUNCTION public.mark_suggestions_seen()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_previous timestamptz;
    v_marked   integer;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT s.last_seen_at INTO v_previous
    FROM public.suggestion_inbox_state s
    WHERE s.admin_id = auth.uid();

    IF v_previous IS NULL THEN
        v_previous := '1970-01-01T00:00:00Z'::timestamptz;
    END IF;

    SELECT count(*)::integer INTO v_marked
    FROM public.platform_suggestions ps
    WHERE ps.created_at > v_previous
      AND NOT public.is_guest_profile(ps.student_id);

    INSERT INTO public.suggestion_inbox_state (admin_id, last_seen_at)
    VALUES (auth.uid(), now())
    ON CONFLICT (admin_id) DO UPDATE
    SET last_seen_at = EXCLUDED.last_seen_at;

    RETURN v_marked;
END $$;
