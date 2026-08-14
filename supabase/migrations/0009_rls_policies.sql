-- =====================================================================
-- 0009_rls_policies
-- Phase 1 | Supabase Foundation | Database
-- ROW LEVEL SECURITY on all 14 application tables, FORCEd on all,
-- plus the full policy matrix. Reference: SECURITY.md section 6;
-- TESTING.md section 4.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enable + FORCE RLS on all 14 tables (belt & braces).
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.grades              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_plans       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_codes  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.code_redemptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_redemptions    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.units               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units               FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lessons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons             FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_videos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_videos       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_pdfs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_pdfs         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.progress            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings        FORCE ROW LEVEL SECURITY;
-- ---------------------------------------------------------------------
-- profiles
-- Own-row SELECT additionally requires is_student() so disabled and
-- soft-deleted students are denied entirely (TESTING.md section 4
-- matrix: SELECT/UPDATE denied for disabled/deleted).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_own_or_staff ON public.profiles;
CREATE POLICY profiles_select_own_or_staff ON public.profiles
    FOR SELECT
    USING ((id = auth.uid() AND public.is_student()) OR public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS profiles_insert_admin ON public.profiles;
CREATE POLICY profiles_insert_admin ON public.profiles
    FOR INSERT WITH CHECK (public.is_admin());

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

DROP POLICY IF EXISTS profiles_delete_admin ON public.profiles;
CREATE POLICY profiles_delete_admin ON public.profiles
    FOR DELETE USING (public.is_admin());

-- ---------------------------------------------------------------------
-- grades
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS grades_select_staff_or_active_students ON public.grades;
CREATE POLICY grades_select_staff_or_active_students ON public.grades
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid()
           OR (public.is_student() AND deleted_at IS NULL AND is_active));

DROP POLICY IF EXISTS grades_dml_staff ON public.grades;
CREATE POLICY grades_dml_staff ON public.grades
    FOR ALL
    USING (public.is_admin() OR public.is_mr_walid())
    WITH CHECK (public.is_admin() OR public.is_mr_walid());

-- ---------------------------------------------------------------------
-- pricing_plans
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS pricing_plans_select_staff_or_active_students ON public.pricing_plans;
CREATE POLICY pricing_plans_select_staff_or_active_students ON public.pricing_plans
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid()
           OR (public.is_student() AND is_active));

DROP POLICY IF EXISTS pricing_plans_dml_admin ON public.pricing_plans;
CREATE POLICY pricing_plans_dml_admin ON public.pricing_plans
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- subscriptions -- SELECT own/staff; DML RPC-only (WITH (NO POLICY)).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS subscriptions_select_own_or_staff ON public.subscriptions;
CREATE POLICY subscriptions_select_own_or_staff ON public.subscriptions
    FOR SELECT
    USING (student_id = auth.uid() OR public.is_admin() OR public.is_mr_walid());

ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- subscription_codes -- staff SELECT only; DML RPC/EF-only.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS subscription_codes_select_staff ON public.subscription_codes;
CREATE POLICY subscription_codes_select_staff ON public.subscription_codes
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid());

-- ---------------------------------------------------------------------
-- code_redemptions -- SELECT own/staff; INSERT RPC-only.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS code_redemptions_select_own_or_staff ON public.code_redemptions;
CREATE POLICY code_redemptions_select_own_or_staff ON public.code_redemptions
    FOR SELECT
    USING (student_id = auth.uid() OR public.is_admin() OR public.is_mr_walid());

-- ---------------------------------------------------------------------
-- units
-- Student branch additionally requires the OWN grade (live from the
-- profile) and that the grade itself is active AND not soft-deleted
-- (BINDING B8: grade deactivation = soft-delete equivalent).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS units_select_staff_or_published_own_grade ON public.units;
CREATE POLICY units_select_staff_or_published_own_grade ON public.units
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid()
        OR (
            public.is_student()
            AND grade_id IN (SELECT grade_id FROM public.profiles WHERE id = auth.uid())
            AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
            AND status = 'published'
            AND deleted_at IS NULL
        )
    );

DROP POLICY IF EXISTS units_dml_staff ON public.units;
CREATE POLICY units_dml_staff ON public.units
    FOR ALL
    USING (public.is_admin() OR public.is_mr_walid())
    WITH CHECK (public.is_admin() OR public.is_mr_walid());

-- ---------------------------------------------------------------------
-- lessons
-- Student branch follows the same rules as units: published, not
-- deleted, unit published & not deleted, own live grade, and the grade
-- active AND not soft-deleted (BINDING B8).
-- ---------------------------------------------------------------------
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
                WHERE grade_id = (SELECT grade_id FROM public.profiles WHERE id = auth.uid())
                  AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL)
                  AND status = 'published'
                  AND deleted_at IS NULL
            )
        )
    );

DROP POLICY IF EXISTS lessons_dml_staff ON public.lessons;
CREATE POLICY lessons_dml_staff ON public.lessons
    FOR ALL
    USING (public.is_admin() OR public.is_mr_walid())
    WITH CHECK (public.is_admin() OR public.is_mr_walid());

-- ---------------------------------------------------------------------
-- lesson_videos -- student SELECT gated by can_access_lesson + primary
-- ready; DML RPC/Edge-Function-only.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_videos_select_gated ON public.lesson_videos;
CREATE POLICY lesson_videos_select_gated ON public.lesson_videos
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND status = 'ready' AND is_primary)
    );

-- ---------------------------------------------------------------------
-- lesson_pdfs -- student SELECT gated by can_access_lesson + primary
-- ready (metadata only); DML RPC/Edge-Function-only.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_pdfs_select_gated ON public.lesson_pdfs;
CREATE POLICY lesson_pdfs_select_gated ON public.lesson_pdfs
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND is_ready AND is_primary)
    );

-- ---------------------------------------------------------------------
-- progress -- SELECT own/staff; DML RPC-only (WITH (NO POLICY)).
-- The own-rows branch additionally requires is_student() so disabled and
-- soft-deleted students lose even their progress view (TESTING.md section
-- 4 matrix: progress denied for disabled/deleted).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS progress_select_own_or_staff ON public.progress;
CREATE POLICY progress_select_own_or_staff ON public.progress
    FOR SELECT
    USING ((student_id = auth.uid() AND public.is_student()) OR public.is_mr_walid() OR public.is_admin());

-- ---------------------------------------------------------------------
-- notifications -- own SELECT; column-scoped UPDATE belt-and-braces
-- (binding B2; the real enforcement is REVOKE, applied in 0010).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
    FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_read_state ON public.notifications;
CREATE POLICY notifications_update_read_state ON public.notifications
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- audit_logs -- admin SELECT only; INSERT trigger/system-only.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS audit_logs_select_admin ON public.audit_logs;
CREATE POLICY audit_logs_select_admin ON public.audit_logs
    FOR SELECT
    USING (public.is_admin());

-- ---------------------------------------------------------------------
-- app_settings -- staff SELECT; UPDATE/INSERT staff with mr_walid
-- restricted to whatsapp% keys.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS app_settings_select_staff ON public.app_settings;
CREATE POLICY app_settings_select_staff ON public.app_settings
    FOR SELECT
    USING (public.is_admin() OR public.is_mr_walid());

DROP POLICY IF EXISTS app_settings_write_staff ON public.app_settings;
CREATE POLICY app_settings_write_staff ON public.app_settings
    FOR ALL
    USING (public.is_admin() OR (public.is_mr_walid() AND key LIKE 'whatsapp%'))
    WITH CHECK (public.is_admin() OR (public.is_mr_walid() AND key LIKE 'whatsapp%'));
