-- =====================================================================
-- 0049_announcements
-- Announcements system: admin/teacher manageable, preview only on edit pages
-- =====================================================================

-- ---------------------------------------------------------------------
-- Table: public.announcements
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    body text NOT NULL,
    link_url text,
    link_label text,
    variant text NOT NULL DEFAULT 'info' CHECK (variant IN ('info','warning','success','error')),
    target_roles text[] NOT NULL DEFAULT '{"student","teacher","mr_walid","admin"}',
    hide_on_paths text[] NOT NULL DEFAULT '{}',
    starts_at timestamptz NOT NULL DEFAULT now(),
    ends_at timestamptz,
    is_active boolean NOT NULL DEFAULT true,
    dismissible boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.announcements IS 'Global announcements. Preview shows ONLY on admin/teacher announcement edit pages via RPC path filtering.';

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------
-- Public/anon can read ONLY active announcements (for preview on edit pages)
CREATE POLICY announcements_select_active ON public.announcements
    FOR SELECT USING (
        is_active
        AND starts_at <= now()
        AND (ends_at IS NULL OR ends_at > now())
    );

-- Admin full access
CREATE POLICY announcements_admin_all ON public.announcements
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Teacher/mr_walid: read all, write own (for management UI)
CREATE POLICY announcements_teacher_select ON public.announcements
    FOR SELECT USING (public.get_current_role() IN ('teacher','mr_walid'));

CREATE POLICY announcements_teacher_write ON public.announcements
    FOR INSERT WITH CHECK (public.get_current_role() IN ('teacher','mr_walid','admin'));

CREATE POLICY announcements_teacher_update ON public.announcements
    FOR UPDATE USING (public.get_current_role() IN ('teacher','mr_walid','admin'))
    WITH CHECK (public.get_current_role() IN ('teacher','mr_walid','admin'));

CREATE POLICY announcements_teacher_delete ON public.announcements
    FOR DELETE USING (public.get_current_role() IN ('teacher','mr_walid','admin'));

-- ---------------------------------------------------------------------
-- Updated_at trigger (uses existing set_updated_at from 0004)
-- ---------------------------------------------------------------------
CREATE TRIGGER set_announcements_updated_at
    BEFORE UPDATE ON public.announcements
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RPC: get_active_announcements(p_current_path)
-- Returns active announcements filtered by:
--   - user role (target_roles)
--   - current path (hide_on_paths) - ONLY shows on edit pages
--   - time window (starts_at/ends_at)
--   - is_active
-- LIMIT 1 returns the most recent for single-bar preview
-- ---------------------------------------------------------------------
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
      AND v_role = ANY(a.target_roles)
      AND NOT (p_current_path = ANY(a.hide_on_paths))
      AND (
          -- ONLY show on announcement edit/create pages
          p_current_path ILIKE '/admin/announcements/%'
          OR p_current_path ILIKE '/walid/announcements/%'
      )
    ORDER BY a.created_at DESC
    LIMIT 1;
END $$;

COMMENT ON FUNCTION public.get_active_announcements(text) IS
'Returns the latest active announcement for preview. ONLY returns data when current path is an admin/teacher announcement edit or create page.';

-- ---------------------------------------------------------------------
-- RPC: list_announcements (for management UI - admin/teacher)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_announcements(
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS SETOF public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.get_current_role() IN ('teacher','mr_walid')) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    RETURN QUERY
    SELECT a.* FROM public.announcements a
    ORDER BY a.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END $$;

COMMENT ON FUNCTION public.list_announcements(integer, integer) IS
'Paginated list for admin/teacher management UI.';

-- ---------------------------------------------------------------------
-- RPC: get_announcement_by_id (for edit page)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_announcement_by_id(p_id uuid)
RETURNS public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_announcement public.announcements;
BEGIN
    IF NOT (public.is_admin() OR public.get_current_role() IN ('teacher','mr_walid')) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT * INTO v_announcement
    FROM public.announcements
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_found';
    END IF;

    RETURN v_announcement;
END $$;

-- ---------------------------------------------------------------------
-- RPC: create_announcement (admin/teacher)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- RPC: update_announcement (admin/teacher)
-- ---------------------------------------------------------------------
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
    v_user_id uuid := auth.uid();
    v_old jsonb;
BEGIN
    IF NOT (public.is_admin() OR public.get_current_role() IN ('teacher','mr_walid')) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT to_jsonb(a) INTO v_old FROM public.announcements a WHERE a.id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_found';
    END IF;

    UPDATE public.announcements SET
        title = COALESCE(p_title, title),
        body = COALESCE(p_body, body),
        link_url = COALESCE(p_link_url, link_url),
        link_label = COALESCE(p_link_label, link_label),
        variant = COALESCE(p_variant, variant),
        target_roles = COALESCE(p_target_roles, target_roles),
        hide_on_paths = COALESCE(p_hide_on_paths, hide_on_paths),
        starts_at = COALESCE(p_starts_at, starts_at),
        ends_at = COALESCE(p_ends_at, ends_at),
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

-- ---------------------------------------------------------------------
-- RPC: delete_announcement (admin/teacher)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_announcement(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
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

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_active_announcements(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_announcements(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_announcement_by_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_announcement(text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_announcement(uuid, text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_announcement(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_active_announcements(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_announcements(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_announcement_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_announcement(text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_announcement(uuid, text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_announcement(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_announcements_active_time ON public.announcements (is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON public.announcements (created_by);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements (created_at DESC);