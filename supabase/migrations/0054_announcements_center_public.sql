-- =====================================================================
-- 0054_announcements_center_public
-- Center modal + public visibility: anon on "/" sees student-targeted announcements
-- Extends 0050: keeps v_role::text cast, audit_log 4 params, is_teacher helper,
-- adds OR (v_role IS NULL AND p_current_path='/' AND 'student'=ANY(target_roles))
-- for LandingPage public surface. Also re-applies center-modal comment.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_active_announcements(p_current_path text DEFAULT '/')
RETURNS SETOF public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role public.user_role;
BEGIN
    v_role := public.get_current_role();
    RETURN QUERY
    SELECT a.* FROM public.announcements a
    WHERE a.is_active
      AND a.starts_at <= now()
      AND (a.ends_at IS NULL OR a.ends_at > now())
      AND (
        v_role::text = ANY(a.target_roles)
        OR (v_role IS NULL AND p_current_path = '/' AND 'student' = ANY(a.target_roles))
      )
      AND NOT (p_current_path = ANY(a.hide_on_paths))
    ORDER BY a.created_at DESC
    LIMIT 1;
END $$;

COMMENT ON FUNCTION public.get_active_announcements(text) IS
'Center modal: anon on "/" sees student-targeted active announcements (public landing), authenticated sees by role. Filtered by hide_on_paths and time window.';

-- Grants keep as before (anon needs LandingPage)
REVOKE EXECUTE ON FUNCTION public.get_active_announcements(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_announcements(text) TO anon, authenticated;
