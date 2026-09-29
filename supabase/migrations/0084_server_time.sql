-- =====================================================================
-- 0084_server_time.sql — authoritative server clock for clients
-- ---------------------------------------------------------------------
-- The profile-completion grace countdown must not trust the device
-- clock (users can move it back to extend the deadline). This adds a
-- minimal get_server_time() RPC returning the database now().
-- Clients fetch it once per session, keep the offset, and derive all
-- deadline math from it. Grants follow SECURITY.md 8.2 (revoke
-- PUBLIC, grant authenticated).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT now();
$$;

COMMENT ON FUNCTION public.get_server_time() IS
'Authoritative server clock (anti-tamper anchor for client countdowns). No arguments, no PII.';

REVOKE EXECUTE ON FUNCTION public.get_server_time() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_server_time() TO authenticated;
