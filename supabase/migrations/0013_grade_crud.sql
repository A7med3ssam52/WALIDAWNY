-- =====================================================================
-- 0013_grade_crud
-- Phase 3 | Grades, Pricing & Subscriptions | Database
-- create_grade / update_grade: client-callable grade CRUD for staff
-- (mr_walid/admin), SECURITY DEFINER + audited. Guards mirror 0007's
-- delete_grade and 0012's list_trash patterns:
--   * permission_denied  unless is_admin() OR is_mr_walid()
--   * grade_not_found    update target does not exist
--   * grade_deleted      update target soft-deleted (deleted_at set,
--                        binding B8)
--   * grade_inactive     update target deactivated (is_active = false,
--                        binding B8)
--   * grade_name_required empty/whitespace name
--   * duplicate grade    case-sensitive name collision (grades.name is
--                        UNIQUE; same rejection style as
--                        generate_codes_internal's unique_violation catch)
-- update_grade returns early without auditing when no field actually
-- changes, and only ever updates the provided fields.
-- Append-only migration; nothing in 0002/0007 is rewritten.
-- Reference: DATABASE.md section 6.4 (staff RPCs).
-- =====================================================================

-- ---------------------------------------------------------------------
-- create_grade(p_name text, p_sort_order integer DEFAULT 0) RETURNS uuid
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_grade(p_name text, p_sort_order integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF btrim(COALESCE(p_name, '')) = '' THEN
        RAISE EXCEPTION 'grade_name_required';
    END IF;

    IF EXISTS (SELECT 1 FROM public.grades WHERE name = btrim(p_name)) THEN
        RAISE EXCEPTION 'duplicate grade';
    END IF;

    BEGIN
        INSERT INTO public.grades (name, sort_order)
        VALUES (btrim(p_name), p_sort_order)
        RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
        -- race backstop for the concurrent create path
        RAISE EXCEPTION 'duplicate grade';
    END;

    PERFORM public.audit_log('grade.create', 'grade', v_id,
        jsonb_build_object('name', btrim(p_name), 'sort_order', p_sort_order));

    RETURN v_id;
END $$;

-- ---------------------------------------------------------------------
-- update_grade(p_grade_id uuid, p_name text DEFAULT NULL,
--              p_sort_order integer DEFAULT NULL) RETURNS void
-- No-op (no audit) when neither provided field actually changes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_grade(
    p_grade_id uuid,
    p_name text DEFAULT NULL,
    p_sort_order integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_name text;
    v_sort_order integer;
    v_deleted_at timestamptz;
    v_is_active boolean;
    v_meta jsonb := '{}'::jsonb;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT name, sort_order, deleted_at, is_active
    INTO v_name, v_sort_order, v_deleted_at, v_is_active
    FROM public.grades WHERE id = p_grade_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'grade_not_found';
    END IF;
    IF v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'grade_deleted';
    END IF;
    IF NOT v_is_active THEN
        RAISE EXCEPTION 'grade_inactive';
    END IF;

    IF p_name IS NOT NULL AND btrim(p_name) = '' THEN
        RAISE EXCEPTION 'grade_name_required';
    END IF;

    IF p_name IS NOT NULL AND btrim(p_name) <> v_name
       AND EXISTS (SELECT 1 FROM public.grades WHERE name = btrim(p_name) AND id <> p_grade_id) THEN
        RAISE EXCEPTION 'duplicate grade';
    END IF;

    -- No-op: nothing provided, or every provided field already matches.
    IF (p_name IS NULL OR btrim(p_name) = v_name)
       AND (p_sort_order IS NULL OR p_sort_order = v_sort_order) THEN
        RETURN;
    END IF;

    BEGIN
        UPDATE public.grades
        SET name = COALESCE(NULLIF(btrim(p_name), ''), name),
            sort_order = COALESCE(p_sort_order, sort_order)
        WHERE id = p_grade_id;
    EXCEPTION WHEN unique_violation THEN
        -- race backstop for the concurrent rename path
        RAISE EXCEPTION 'duplicate grade';
    END;

    IF p_name IS NOT NULL AND btrim(p_name) <> v_name THEN
        v_meta := v_meta || jsonb_build_object('name', btrim(p_name), 'old_name', v_name);
    END IF;
    IF p_sort_order IS NOT NULL AND p_sort_order <> v_sort_order THEN
        v_meta := v_meta || jsonb_build_object('sort_order', p_sort_order);
    END IF;

    PERFORM public.audit_log('grade.update', 'grade', p_grade_id, v_meta);
END $$;

-- ---------------------------------------------------------------------
-- Grant matrix: authenticated only, staff enforced in-function (same
-- posture as list_trash, 0010/0012). An explicit REVOKE FROM PUBLIC
-- first: 0010 revoked existing functions before these were created,
-- and new functions otherwise inherit the PUBLIC default grant.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_grade(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_grade(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_grade(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_grade(uuid, text, integer) TO authenticated;
