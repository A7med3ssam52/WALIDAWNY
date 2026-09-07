-- =====================================================================
-- 0050_fix_announcements_audit_log
-- Hot-fix for 0049: audit_log() takes 4 params, 0049 was calling with 5
-- (extra v_user_id). This patch overwrites the 3 buggy RPCs so existing
-- deployed DBs that already ran 0049 start working without re-running it.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_announcement(
    p_title text,
    p_body text,
    p_link_url text DEFAULT NULL,
    p_link_label text DEFAULT NULL,
    p_variant text DEFAULT 'info',
    p_target_roles text[] DEFAULT '{"student","teacher","mr_walid","admin"}',
    p_hide_on_paths text[] DEFAULT '{}',
    p_starts_at timestamptz DEFAULT now(),
    p_ends_at timestamptz DEFAULT NULL,
    p_is_active boolean DEFAULT true,
    p_dismissible boolean DEFAULT true
)
RETURNS public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_announcement public.announcements;
    v_user_id uuid := auth.uid();
BEGIN
    IF NOT (public.is_admin() OR public.get_current_role() IN ('teacher','mr_walid')) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_link_url IS NOT NULL AND p_link_url !~ '^https://' THEN
        RAISE EXCEPTION 'invalid_link_url';
    END IF;

    INSERT INTO public.announcements (
        title, body, link_url, link_label, variant,
        target_roles, hide_on_paths, starts_at, ends_at,
        is_active, dismissible, created_by
    ) VALUES (
        p_title, p_body, p_link_url, p_link_label, p_variant,
        p_target_roles, p_hide_on_paths, p_starts_at, p_ends_at,
        p_is_active, p_dismissible, v_user_id
    )
    RETURNING * INTO v_announcement;

    PERFORM public.audit_log(
        'announcement.create', 'announcements', v_announcement.id,
        jsonb_build_object('title', p_title, 'variant', p_variant)
    );

    RETURN v_announcement;
END $$;

CREATE OR REPLACE FUNCTION public.update_announcement(
    p_id uuid,
    p_title text DEFAULT NULL,
    p_body text DEFAULT NULL,
    p_link_url text DEFAULT NULL,
    p_link_label text DEFAULT NULL,
    p_variant text DEFAULT NULL,
    p_target_roles text[] DEFAULT NULL,
    p_hide_on_paths text[] DEFAULT NULL,
    p_starts_at timestamptz DEFAULT NULL,
    p_ends_at timestamptz DEFAULT NULL,
    p_is_active boolean DEFAULT NULL,
    p_dismissible boolean DEFAULT NULL
)
RETURNS public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_announcement public.announcements;
    v_old jsonb;
BEGIN
    IF NOT (public.is_admin() OR public.get_current_role() IN ('teacher','mr_walid')) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT to_jsonb(a) INTO v_old FROM public.announcements a WHERE a.id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_found';
    END IF;

    IF p_link_url IS NOT NULL AND p_link_url !~ '^https://' THEN
        RAISE EXCEPTION 'invalid_link_url';
    END IF;

    UPDATE public.announcements SET
        title = COALESCE(p_title, title),
        body = COALESCE(p_body, body),
        link_url = p_link_url,
        link_label = p_link_label,
        variant = COALESCE(p_variant, variant),
        target_roles = COALESCE(p_target_roles, target_roles),
        hide_on_paths = COALESCE(p_hide_on_paths, hide_on_paths),
        starts_at = COALESCE(p_starts_at, starts_at),
        ends_at = p_ends_at,
        is_active = COALESCE(p_is_active, is_active),
        dismissible = COALESCE(p_dismissible, dismissible),
        updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_announcement;

    PERFORM public.audit_log(
        'announcement.update', 'announcements', v_announcement.id,
        jsonb_build_object('old', v_old, 'new', to_jsonb(v_announcement))
    );

    RETURN v_announcement;
END $$;

CREATE OR REPLACE FUNCTION public.delete_announcement(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_title text;
BEGIN
    IF NOT (public.is_admin() OR public.get_current_role() IN ('teacher','mr_walid')) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT title INTO v_title FROM public.announcements WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_found';
    END IF;

    DELETE FROM public.announcements WHERE id = p_id;

    PERFORM public.audit_log(
        'announcement.delete', 'announcements', p_id,
        jsonb_build_object('title', v_title)
    );
END $$;

-- Grants (idempotent, keep in sync with 0049)
REVOKE EXECUTE ON FUNCTION public.create_announcement(text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_announcement(uuid, text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_announcement(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_announcement(text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_announcement(uuid, text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_announcement(uuid) TO authenticated;
