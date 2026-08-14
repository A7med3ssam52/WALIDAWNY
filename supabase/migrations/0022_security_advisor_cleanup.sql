-- =====================================================================
-- 0022_security_advisor_cleanup
-- Phase 10 | Security Advisor | Database
-- Dashboard Security Advisor cleanup (reproduced locally from the
-- canonical supabase/pg-meta advisor lint set, lints.ts):
--
--   S1 (WARN auth_rls_initplan): policies call auth.uid() directly in
--      the per-row expression, defeating the initplan optimization
--      (auth.uid() re-evaluated per row and per policy check). Fix:
--      wrap in (select auth.uid()) so it is evaluated once per query.
--      Behavior is identical; applies to the 9 policies flagged.
--
--      EXCEPTION (CRITICAL): the two PROFILES policies below keep the
--      direct auth.uid() form. Wrapping them in (select auth.uid())
--      makes the student self-service UPDATE
--      (profiles_update_own_self_service WITH CHECK self-references
--      profiles via SELECT p.role/grade_id/status FROM profiles p)
--      fail with "infinite recursion detected in policy for relation
--      profiles" (SQLSTATE 42P17) - verified empirically and still
--      present in 0025. Direct auth.uid() keeps the update plan
--      finite. auth.uid() is immutable per request, so per-row
--      re-evaluation is semantically identical.
--
--   S2 (WARN multiple_permissive_policies): 5 tables pair a FOR ALL
--      staff DML policy with a FOR SELECT policy, so SELECT has two
--      permissive policies OR-ed together. Fix: split the FOR ALL
--      policy into command-specific INSERT/UPDATE/DELETE policies with
--      identical expressions; each command now has exactly one policy.
--      Permissive OR semantics are provably unchanged.
--
--   S3 (INFO unindexed_foreign_keys): 9 foreign keys have no covering
--      index (FK checks + join scans are unindexed). Fix: one index per
--      FK column. IF NOT EXISTS so the file stays idempotent.
--
--   S4 (WARN function_search_path_mutable): SECURITY INVOKER functions
--      without a pinned search_path. Fix: SET search_path = public on
--      get_my_subscriptions() / get_my_current_subscription().
--
-- Left unfixed BY DESIGN (advisor suggestions, not defects):
--   * anon/authenticated_security_definer_function_executable: the app
--     is an RPC-first API - SECURITY DEFINER + in-function guards are
--     the documented enforcement layer (SECURITY.md section 8). The
--     advisor's proposed remedies (switch to INVOKER, revoke EXECUTE,
--     move out of the API schema) would break the application.
--   * is_admin/is_mr_walid/is_student/can_access_lesson EXECUTE grants:
--     PostgreSQL requires EXECUTE on functions referenced in policy
--     expressions; they are not exposed through the RPC surface.
--   * extension_in_public (pgcrypto): harness-only artifact - hosted
--     Supabase installs pgcrypto into the extensions schema, so the
--     advisor never flags it on a hosted project.
-- =====================================================================

-- ---------------------------------------------------------------------
-- S1: auth_rls_initplan - evaluate auth.uid() once via (select auth.uid()).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_own_or_staff ON public.profiles;
CREATE POLICY profiles_select_own_or_staff ON public.profiles
    FOR SELECT
    USING ((id = auth.uid() AND public.is_student()) OR public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS profiles_update_own_self_service ON public.profiles;
CREATE POLICY profiles_update_own_self_service ON public.profiles
    FOR UPDATE
    USING (id = auth.uid() AND public.is_student())
    WITH CHECK (
        id = auth.uid()
        AND role = (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id)
        AND grade_id = (SELECT p.grade_id FROM public.profiles p WHERE p.id = profiles.id)
        AND status = (SELECT p.status FROM public.profiles p WHERE p.id = profiles.id)
        AND deleted_at IS NULL
    );

DROP POLICY IF EXISTS subscriptions_select_own_or_staff ON public.subscriptions;
CREATE POLICY subscriptions_select_own_or_staff ON public.subscriptions
    FOR SELECT
    USING (student_id = (select auth.uid()) OR public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS code_redemptions_select_own_or_staff ON public.code_redemptions;
CREATE POLICY code_redemptions_select_own_or_staff ON public.code_redemptions
    FOR SELECT
    USING (student_id = (select auth.uid()) OR public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS units_select_staff_or_published_own_grade ON public.units;
CREATE POLICY units_select_staff_or_published_own_grade ON public.units
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid()
        OR (
            public.is_student()
            AND grade_id IN (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid()))
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            AND status = 'published'
            AND deleted_at IS NULL
        )
    );

DROP POLICY IF EXISTS lessons_select_staff_or_published_own_grade ON public.lessons;
CREATE POLICY lessons_select_staff_or_published_own_grade ON public.lessons
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid()
        OR (
            public.is_student()
            AND status = 'published'
            AND deleted_at IS NULL
            AND unit_id IN (
                SELECT id FROM public.units
                WHERE grade_id = (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid()))
                  AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
                  AND status = 'published'
                  AND deleted_at IS NULL
            )
        )
    );

DROP POLICY IF EXISTS progress_select_own_or_staff ON public.progress;
CREATE POLICY progress_select_own_or_staff ON public.progress
    FOR SELECT
    USING ((student_id = (select auth.uid()) AND public.is_student()) OR public.is_mr_walid() OR public.is_admin());

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
    FOR SELECT
    USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS notifications_update_read_state ON public.notifications;
CREATE POLICY notifications_update_read_state ON public.notifications
    FOR UPDATE
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- S2: multiple_permissive_policies - split FOR ALL DML policies so each
-- command has exactly one permissive policy (identical expressions).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS grades_dml_staff ON public.grades;
DROP POLICY IF EXISTS grades_insert_staff ON public.grades;
CREATE POLICY grades_insert_staff ON public.grades
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid());
DROP POLICY IF EXISTS grades_update_staff ON public.grades;
CREATE POLICY grades_update_staff ON public.grades
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid())
    WITH CHECK (public.is_admin() OR public.is_mr_walid());
DROP POLICY IF EXISTS grades_delete_staff ON public.grades;
CREATE POLICY grades_delete_staff ON public.grades
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS pricing_plans_dml_admin ON public.pricing_plans;
DROP POLICY IF EXISTS pricing_plans_insert_admin ON public.pricing_plans;
CREATE POLICY pricing_plans_insert_admin ON public.pricing_plans
    FOR INSERT WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS pricing_plans_update_admin ON public.pricing_plans;
CREATE POLICY pricing_plans_update_admin ON public.pricing_plans
    FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS pricing_plans_delete_admin ON public.pricing_plans;
CREATE POLICY pricing_plans_delete_admin ON public.pricing_plans
    FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS units_dml_staff ON public.units;
DROP POLICY IF EXISTS units_insert_staff ON public.units;
CREATE POLICY units_insert_staff ON public.units
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid());
DROP POLICY IF EXISTS units_update_staff ON public.units;
CREATE POLICY units_update_staff ON public.units
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid())
    WITH CHECK (public.is_admin() OR public.is_mr_walid());
DROP POLICY IF EXISTS units_delete_staff ON public.units;
CREATE POLICY units_delete_staff ON public.units
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS lessons_dml_staff ON public.lessons;
DROP POLICY IF EXISTS lessons_insert_staff ON public.lessons;
CREATE POLICY lessons_insert_staff ON public.lessons
    FOR INSERT WITH CHECK (public.is_admin() OR public.is_mr_walid());
DROP POLICY IF EXISTS lessons_update_staff ON public.lessons;
CREATE POLICY lessons_update_staff ON public.lessons
    FOR UPDATE
    USING (public.is_admin() OR public.is_mr_walid())
    WITH CHECK (public.is_admin() OR public.is_mr_walid());
DROP POLICY IF EXISTS lessons_delete_staff ON public.lessons;
CREATE POLICY lessons_delete_staff ON public.lessons
    FOR DELETE USING (public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS app_settings_write_staff ON public.app_settings;
DROP POLICY IF EXISTS app_settings_insert_staff ON public.app_settings;
CREATE POLICY app_settings_insert_staff ON public.app_settings
    FOR INSERT
    WITH CHECK (public.is_admin() OR (public.is_mr_walid() AND key LIKE 'whatsapp%'));
DROP POLICY IF EXISTS app_settings_update_staff ON public.app_settings;
CREATE POLICY app_settings_update_staff ON public.app_settings
    FOR UPDATE
    USING (public.is_admin() OR (public.is_mr_walid() AND key LIKE 'whatsapp%'))
    WITH CHECK (public.is_admin() OR (public.is_mr_walid() AND key LIKE 'whatsapp%'));
-- NOTE: no DELETE policy on app_settings - settings are upsert-only via
-- set_app_setting() / INSERT .. ON CONFLICT DO UPDATE (SECURITY.md section 6
-- documents UPDATE/INSERT only). Removing the DELETE policy removes the
-- ability to hard-delete settings such as whatsapp_number or platform_name.

-- ---------------------------------------------------------------------
-- S3: unindexed_foreign_keys - covering index per FK column.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_app_settings_updated_by        ON public.app_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_code_redemptions_subscription_id ON public.code_redemptions (subscription_id);
CREATE INDEX IF NOT EXISTS idx_progress_video_id               ON public.progress (video_id);
CREATE INDEX IF NOT EXISTS idx_subscription_codes_created_by   ON public.subscription_codes (created_by);
CREATE INDEX IF NOT EXISTS idx_subscription_codes_pricing_plan ON public.subscription_codes (pricing_plan_id);
CREATE INDEX IF NOT EXISTS idx_subscription_codes_revoked_by   ON public.subscription_codes (revoked_by);
CREATE INDEX IF NOT EXISTS idx_subscription_codes_used_by      ON public.subscription_codes (used_by);
CREATE INDEX IF NOT EXISTS idx_subscriptions_code_id           ON public.subscriptions (code_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_pricing_plan      ON public.subscriptions (pricing_plan_id);

-- ---------------------------------------------------------------------
-- S4: function_search_path_mutable - pin search_path on the two
-- SECURITY INVOKER RPCs (bodies use fully-qualified names).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_subscriptions()
RETURNS SETOF public.subscriptions
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT * FROM public.subscriptions
    WHERE student_id = auth.uid()
    ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_my_current_subscription()
RETURNS public.subscriptions
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT * FROM public.subscriptions
    WHERE student_id = auth.uid()
      AND status = 'active'
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
$$;
