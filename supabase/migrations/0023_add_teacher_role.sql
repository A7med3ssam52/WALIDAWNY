-- =====================================================================
-- 0023_add_teacher_role
-- Adds the 'teacher' role and an admin-only RPC to promote a user to a
-- role by email (case-insensitive). Same audit path as set_user_role.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Add 'teacher' to public.user_role (idempotent)
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum
        WHERE enumtypid = 'public.user_role'::regtype
          AND enumlabel = 'teacher'
    ) THEN
        ALTER TYPE public.user_role ADD VALUE 'teacher';
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- set_role_by_email(p_email, p_role)
-- admin-only; THE ONLY path that mutates role via email lookup.
-- Usage: SELECT public.set_role_by_email('user@example.com', 'teacher');
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_role_by_email(
    p_email text,
    p_role public.user_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_old public.user_role;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = lower(btrim(p_email));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;

    SELECT role INTO v_old FROM public.profiles WHERE id = v_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'profile_not_found';
    END IF;

    UPDATE public.profiles SET role = p_role WHERE id = v_user_id;

    PERFORM public.audit_log('user.role_change', 'profile', v_user_id,
        jsonb_build_object('old_role', v_old, 'new_role', p_role));
END $$;

COMMENT ON FUNCTION public.set_role_by_email(text, public.user_role) IS 'Admin-only: sets a user''s role by auth email (case-insensitive). Audited exactly like set_user_role.';

REVOKE EXECUTE ON FUNCTION public.set_role_by_email(text, public.user_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_role_by_email(text, public.user_role) TO authenticated;
