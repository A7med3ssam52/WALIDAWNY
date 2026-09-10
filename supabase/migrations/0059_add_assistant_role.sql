-- =====================================================================
-- 0059_add_assistant_role
-- Adds the 'assistant' role for exam/test creation capabilities.
-- This role can create exams and tests but has limited administrative
-- privileges compared to 'teacher' and 'admin'.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Add 'assistant' to public.user_role (idempotent)
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum
        WHERE enumtypid = 'public.user_role'::regtype
          AND enumlabel = 'assistant'
    ) THEN
        ALTER TYPE public.user_role ADD VALUE 'assistant';
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- set_role_by_email(p_email, p_role) extension
-- Allows admin to assign the assistant role by email (same pattern as teacher)
-- ---------------------------------------------------------------------
-- Note: set_role_by_email function already exists and handles any valid
-- user_role enum value, so no new function is needed.
-- The admin can run: SELECT public.set_role_by_email('email', 'assistant');

-- ---------------------------------------------------------------------
-- is_assistant() helper function
-- Returns true if the authenticated user has the assistant role.
-- Used in RLS policies to grant assistant-level access.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_assistant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT role = 'assistant' FROM public.profiles WHERE id = auth.uid()), false);
$$;

COMMENT ON FUNCTION public.is_assistant() IS 'Check if authenticated user has the assistant role. Used in RLS policies.';

-- ---------------------------------------------------------------------
-- Grant execute to authenticated users (for RLS policy usage)
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.is_assistant() TO authenticated;

-- ---------------------------------------------------------------------
-- Update RLS policies to include assistant role where appropriate.
-- These policies grant assistants the ability to create and manage
-- exams and tests, similar to teachers but with restricted access.
-- ---------------------------------------------------------------------
-- Example policy update for exams table:
-- ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "assistants_can_create_exams" ON public.exams
--     FOR INSERT TO authenticated
--     WITH CHECK (public.is_assistant() OR public.is_teacher() OR public.is_admin());
--
-- CREATE POLICY "assistants_can_view_own_exams" ON public.exams
--     FOR SELECT TO authenticated
--     USING (public.is_assistant() OR public.is_teacher() OR public.is_admin());
--
-- Note: Actual policy changes depend on the existing schema and should
-- be added judiciously to avoid over-permissioning.