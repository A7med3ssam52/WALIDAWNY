-- =====================================================================
-- 0069_suspension_reason
-- Suspended accounts sign in normally and see a non-dismissable
-- "account suspended" popup showing the admin-written reason.
--   * profiles.suspension_reason (nullable text, shown to the student)
--   * disable_student(..., p_reason) requires a non-empty reason
--   * enable/restore clear the reason
--   * sign-in gate blocks ONLY soft-deleted accounts (disabled may sign
--     in; content RLS via is_student() stays closed for them)
-- =====================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS suspension_reason text;

COMMENT ON COLUMN public.profiles.suspension_reason IS
    'Admin-written reason for status=disabled; shown to the student in the non-dismissable suspended popup. Cleared on enable/restore.';

-- ---------------------------------------------------------------------
-- disable_student(p_student_id, p_reason)
-- Staff-only (admin/mr_walid/teacher - mirrors 0025). Reason is
-- mandatory: empty/blank raises suspension_reason_required.
-- NOTE: revoke_sessions_if_possible is intentionally NOT called here:
-- the suspended student must be able to sign in and see the reason.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- enable_student: clears the reason on re-activation.
-- ---------------------------------------------------------------------
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
    SET status = 'active',
        suspension_reason = NULL
    WHERE id = p_student_id AND role = 'student' AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.audit_log('student.enable', 'profile', p_student_id);
END $$;

-- ---------------------------------------------------------------------
-- restore_student: clears the reason as well (back to a clean active
-- profile).
-- ---------------------------------------------------------------------
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
    SET deleted_at = NULL, status = 'active', suspension_reason = NULL
    WHERE id = p_student_id AND role = 'student';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_found';
    END IF;

    PERFORM public.audit_log('student.restore', 'profile', p_student_id);
END $$;

-- ---------------------------------------------------------------------
-- Sign-in gate: suspended (disabled) accounts MAY sign in so they can
-- see the suspension popup. Only soft-deleted accounts are blocked.
-- (Content stays closed for disabled accounts via is_student() RLS.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_sign_in_for_inactive_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = NEW.id
          AND deleted_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'account_inactive_or_deleted';
    END IF;
    RETURN NEW;
END $$;
