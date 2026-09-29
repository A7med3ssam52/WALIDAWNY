-- =====================================================================
-- 17_server_time.sql — Phase 9 (0084) authoritative server clock
-- ---------------------------------------------------------------------
-- Covers:
--   * get_server_time() exists and is executable by authenticated,
--     NOT by anon
--   * returns a timestamptz within ±60s of now()
--   * rejects calls with no authenticated uid (permission model of
--     SECURITY DEFINER + authenticated-only grant)
-- =====================================================================

SELECT tests.assert(
    has_function_privilege('authenticated', 'public.get_server_time()', 'EXECUTE'),
    'g: get_server_time executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.get_server_time()', 'EXECUTE'),
    'g: get_server_time NOT executable by anon');

SET LOCAL ROLE authenticated;
SELECT tests.assert(
    (SELECT public.get_server_time() BETWEEN now() - interval '60 seconds' AND now() + interval '60 seconds'),
    'rpc: get_server_time is within ±60s of now()');
RESET ROLE;
