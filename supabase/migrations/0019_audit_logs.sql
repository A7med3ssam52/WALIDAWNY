-- =====================================================================
-- 0019_audit_logs
-- Phase 8 | Notifications & Audit | Database
-- list_audit_logs / count_audit_logs: admin-only, filterable audit-log
-- reads for the /walid/audit UI (BLUEPRINT row 8). The audit trail is
-- INSERT-only by design; these two RPCs are the ONLY client read paths
-- (the audit_logs table is admin-SELECT-only via RLS, and the EF
-- export-audit-log reads via the service role with the same filters).
-- Guards mirror every other client RPC: is_admin() -> permission_denied
-- (mr_walid deliberately excluded - audit is admin-only).
-- Read-only: no audit row (nothing is mutated).
-- Reference: DATABASE.md section 6.4; SECURITY.md 8.2.
-- =====================================================================

-- ---------------------------------------------------------------------
-- list_audit_logs(...) RETURNS SETOF v_audit_log
--   p_from / p_to       created_at range (inclusive)
--   p_action            substring match on action (ILIKE)
--   p_entity_type       substring match on entity_type (ILIKE)
--   p_actor_id          exact actor filter
--   p_limit / p_offset  pagination (limit clamped to 1..200)
-- Ordered created_at DESC (newest first).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_audit_logs(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_action text DEFAULT NULL,
    p_entity_type text DEFAULT NULL,
    p_actor_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS SETOF public.v_audit_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    RETURN QUERY
    SELECT a.*
    FROM public.v_audit_log a
    WHERE (p_from IS NULL OR a.created_at >= p_from)
      AND (p_to IS NULL OR a.created_at <= p_to)
      AND (p_action IS NULL OR a.action ILIKE '%' || p_action || '%')
      AND (p_entity_type IS NULL OR a.entity_type ILIKE '%' || p_entity_type || '%')
      AND (p_actor_id IS NULL OR a.actor_id = p_actor_id)
    ORDER BY a.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END $$;

-- ---------------------------------------------------------------------
-- count_audit_logs(...) RETURNS bigint - same filters, no pagination.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_audit_logs(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_action text DEFAULT NULL,
    p_entity_type text DEFAULT NULL,
    p_actor_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count bigint;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT count(*) INTO v_count
    FROM public.v_audit_log a
    WHERE (p_from IS NULL OR a.created_at >= p_from)
      AND (p_to IS NULL OR a.created_at <= p_to)
      AND (p_action IS NULL OR a.action ILIKE '%' || p_action || '%')
      AND (p_entity_type IS NULL OR a.entity_type ILIKE '%' || p_entity_type || '%')
      AND (p_actor_id IS NULL OR a.actor_id = p_actor_id);

    RETURN v_count;
END $$;

-- Grant matrix: authenticated only, admin enforced in-function (same
-- posture as 0013/0018). Explicit REVOKE FROM PUBLIC first.
REVOKE EXECUTE ON FUNCTION public.list_audit_logs(timestamptz, timestamptz, text, text, uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_audit_logs(timestamptz, timestamptz, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_audit_logs(timestamptz, timestamptz, text, text, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_audit_logs(timestamptz, timestamptz, text, text, uuid) TO authenticated;
