-- =====================================================================
-- 0014_codes_ef_wrapper
-- Phase 3 | Grades, Pricing & Subscriptions | Database
-- Staff-guarded EF entry point for generate_codes_internal (0007).
--
-- Problem fixed: generate_codes_internal attributes the actor via
-- COALESCE(auth.uid(), current_setting('app.system_actor_id', true))
-- and raises 'system_actor_required' when both are absent. A service-role
-- PostgREST client carries no sub claim and PostgREST exposes no
-- per-request GUC channel, so every Edge Function call over the service
-- role rejected. The fix: a SECURITY DEFINER wrapper that is granted to
-- authenticated and works when invoked over PostgREST with the CALLER'S
-- OWN user JWT (the EF forwards the verified caller token).
--
-- Semantics (verified in tests/local/sql/04_business.sql Section 15):
--   * The guard uses the request-scoped claims (request.jwt.claims) via
--     the is_admin()/is_mr_walid() helpers, exactly like list_trash()
--     (0012); SECURITY DEFINER does not clear session GUCs, so the
--     auth.uid()-based helpers keep working over PostgREST user-JWT
--     calls. Students calling the wrapper directly -> permission_denied.
--   * generate_codes_internal then reads the same auth.uid() (same
--     request claims) -> actor satisfied, created_by = caller uid.
--   * Called WITHOUT a JWT sub (service role / no claims): the guard
--     raises permission_denied BEFORE generate_codes_internal is ever
--     reached, so any GUC-free path stays denied.
--   * Plan validation (plan_not_found) and the count cap (1..500,
--     invalid_count) stay inside generate_codes_internal - NOT
--     duplicated here.
-- Bindings B6/B8/B9 are unaffected.
-- Append-only migration; nothing in 0007 is rewritten.
-- Reference: DATABASE.md section 6.4 (staff RPCs).
-- =====================================================================

-- ---------------------------------------------------------------------
-- create_codes_for_staff(p_plan_id, p_count, p_note)
-- RETURNS SETOF subscription_codes; staff-guarded EF entry point that
-- delegates to generate_codes_internal (0007) - validation stays there.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_codes_for_staff(
    p_plan_id uuid,
    p_count integer,
    p_note text DEFAULT NULL
)
RETURNS SETOF public.subscription_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    RETURN QUERY SELECT * FROM public.generate_codes_internal(p_plan_id, p_count, p_note);
END $$;

-- ---------------------------------------------------------------------
-- Grant matrix: authenticated only, staff enforced in-function (same
-- posture as list_trash, 0010/0012; explicit REVOKE FROM PUBLIC first
-- because new functions otherwise inherit the PUBLIC default grant).
-- generate_codes_internal keeps NO client grants (unchanged - this
-- wrapper is the only new surface). anon: nothing.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_codes_for_staff(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_codes_for_staff(uuid, integer, text) TO authenticated;