-- =====================================================================
-- 0070_update_suspension_reason
-- Lets staff edit the suspension reason of an already-suspended
-- student without toggling the status (shown in StudentDetailPage).
-- =====================================================================

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
