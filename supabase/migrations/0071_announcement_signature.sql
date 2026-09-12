-- =====================================================================
-- 0071_announcement_signature
-- Per-announcement Arabic signature shown in handwriting under the ad modal.
--   - Admin default: 'الإدارة' (editable in the form)
--   - Mr Walid: locked 'م / وليد عوني' (enforced in the form UI)
-- Server normalizes empty values to the default and caps length at 60 chars.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Column (existing rows backfilled with the default)
-- ---------------------------------------------------------------------
ALTER TABLE public.announcements
    ADD COLUMN IF NOT EXISTS signature_name text NOT NULL DEFAULT 'الإدارة';

UPDATE public.announcements
SET signature_name = 'الإدارة'
WHERE signature_name IS NULL OR btrim(signature_name) = '';

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'announcements_signature_name_len'
    ) THEN
        ALTER TABLE public.announcements
            ADD CONSTRAINT announcements_signature_name_len
            CHECK (char_length(btrim(signature_name)) BETWEEN 1 AND 60);
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- RPC: create_announcement — new trailing param (drop old overload first)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_announcement(text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean);

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
    p_dismissible boolean DEFAULT true,
    p_signature_name text DEFAULT 'الإدارة'
)
RETURNS public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_announcement public.announcements;
    v_user_id uuid := auth.uid();
    v_signature text := NULLIF(btrim(COALESCE(p_signature_name, '')), '');
BEGIN
    IF NOT (public.is_admin() OR public.get_current_role() IN ('teacher','mr_walid')) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_link_url IS NOT NULL AND p_link_url !~ '^https://' THEN
        RAISE EXCEPTION 'invalid_link_url';
    END IF;

    IF v_signature IS NULL THEN
        v_signature := 'الإدارة';
    ELSIF char_length(v_signature) > 60 THEN
        RAISE EXCEPTION 'invalid_signature';
    END IF;

    INSERT INTO public.announcements (
        title, body, link_url, link_label, variant,
        target_roles, hide_on_paths, starts_at, ends_at,
        is_active, dismissible, signature_name, created_by
    ) VALUES (
        p_title, p_body, p_link_url, p_link_label, p_variant,
        p_target_roles, p_hide_on_paths, p_starts_at, p_ends_at,
        p_is_active, p_dismissible, v_signature, v_user_id
    )
    RETURNING * INTO v_announcement;

    PERFORM public.audit_log(
        'announcement.create', 'announcements', v_announcement.id,
        jsonb_build_object('title', p_title, 'variant', p_variant, 'signature_name', v_signature)
    );

    RETURN v_announcement;
END $$;

-- ---------------------------------------------------------------------
-- RPC: update_announcement — new trailing param (drop old overload first)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_announcement(uuid, text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean);

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
    p_dismissible boolean DEFAULT NULL,
    p_signature_name text DEFAULT NULL
)
RETURNS public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_announcement public.announcements;
    v_old jsonb;
    v_signature text := NULLIF(btrim(COALESCE(p_signature_name, '')), '');
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

    IF v_signature IS NOT NULL AND char_length(v_signature) > 60 THEN
        RAISE EXCEPTION 'invalid_signature';
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
        signature_name = COALESCE(v_signature, signature_name),
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
-- RLS policy hardening (latent 0049/0064 bug fixed alongside):
-- announcements_teacher_* called public.get_current_role() DIRECTLY in the
-- policy expression. Policies evaluate as the INVOKING user, and
-- get_current_role() is revoked from authenticated/anon (internal helper),
-- so ANY direct table read as staff aborted with
--   42501 permission denied for function get_current_role
-- (RPC access kept working because SECURITY DEFINER RPCs run as the owner).
-- Rewritten with the granted DEFINER helpers is_teacher()/is_mr_walid()/
-- is_admin() — identical role semantics, direct reads work again.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS announcements_teacher_select ON public.announcements;
CREATE POLICY announcements_teacher_select ON public.announcements
    FOR SELECT USING (public.is_teacher() OR public.is_mr_walid());

DROP POLICY IF EXISTS announcements_teacher_write ON public.announcements;
CREATE POLICY announcements_teacher_write ON public.announcements
    FOR INSERT WITH CHECK (public.is_teacher() OR public.is_mr_walid() OR public.is_admin());

DROP POLICY IF EXISTS announcements_teacher_update ON public.announcements;
CREATE POLICY announcements_teacher_update ON public.announcements
    FOR UPDATE USING (public.is_teacher() OR public.is_mr_walid() OR public.is_admin())
    WITH CHECK (public.is_teacher() OR public.is_mr_walid() OR public.is_admin());

DROP POLICY IF EXISTS announcements_teacher_delete ON public.announcements;
CREATE POLICY announcements_teacher_delete ON public.announcements
    FOR DELETE USING (public.is_teacher() OR public.is_mr_walid() OR public.is_admin());

-- ---------------------------------------------------------------------
-- Grants (fresh functions after DROP — revoke PUBLIC default first,
-- then grant explicitly, same posture as 0049/0050)
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_announcement(text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_announcement(uuid, text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_announcement(text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_announcement(uuid, text, text, text, text, text, text[], text[], timestamptz, timestamptz, boolean, boolean, text) TO authenticated;
