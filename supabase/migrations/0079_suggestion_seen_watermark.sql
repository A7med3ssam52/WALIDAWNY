-- =====================================================================
-- 0079_suggestion_seen_watermark
-- Unread badges for the admin suggestions inbox (0075): each admin
-- carries a per-admin seen-watermark; suggestions created after it
-- count as unread. Viewing the inbox advances the watermark, which
-- clears the AdminNav badge. Status workflow is untouched: "unread"
-- (never seen) is orthogonal to status=new (not yet triaged).
--
-- Append-only migration: nothing in 0001..0078 is modified.
-- No audit_trigger: read-state is not audited (same posture as
-- progress/notifications read state - MED-8 inventory unchanged).
-- Test impact: 05_grants (authenticated 109->111 + anchors),
-- 08_security section 6 (2 anon anchors), new 15_suggestions section.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) suggestion_inbox_state: one row per admin.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suggestion_inbox_state (
    admin_id     uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suggestion_inbox_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestion_inbox_state FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.suggestion_inbox_state IS
'Per-admin seen-watermark for the suggestions inbox. Suggestions with created_at > last_seen_at count as unread (0079).';

DROP POLICY IF EXISTS suggestion_inbox_state_admin_all ON public.suggestion_inbox_state;
CREATE POLICY suggestion_inbox_state_admin_all ON public.suggestion_inbox_state
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- 2) get_unread_suggestions_count: admin-only badge reader. A missing
--    row means "never visited" -> everything counts as unread.
-- ---------------------------------------------------------------------
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
    FROM public.platform_suggestions
    WHERE created_at > v_watermark;
END $$;

COMMENT ON FUNCTION public.get_unread_suggestions_count() IS
'Admin-only unread badge reader: count of suggestions newer than the caller''s watermark (epoch when never visited).';

-- ---------------------------------------------------------------------
-- 3) mark_suggestions_seen: advances the caller''s watermark to now().
--    Returns how many rows were newly marked (for the header copy).
-- ---------------------------------------------------------------------
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
    FROM public.platform_suggestions
    WHERE created_at > v_previous;

    INSERT INTO public.suggestion_inbox_state (admin_id, last_seen_at)
    VALUES (auth.uid(), now())
    ON CONFLICT (admin_id) DO UPDATE
    SET last_seen_at = EXCLUDED.last_seen_at;

    RETURN v_marked;
END $$;

COMMENT ON FUNCTION public.mark_suggestions_seen() IS
'Admin-only: advances the caller''s inbox watermark to now(); returns the newly-marked count. Called when the inbox page loads.';

-- ---------------------------------------------------------------------
-- 4) Grants (SECURITY.md 8.2 pattern): revoked from PUBLIC, granted
--    to authenticated. No anon surface added.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_unread_suggestions_count() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_unread_suggestions_count() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_suggestions_seen() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_suggestions_seen() TO authenticated;
