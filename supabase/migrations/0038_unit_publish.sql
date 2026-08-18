-- =====================================================================
-- 0038_unit_publish
-- Unit-level publish/hide. The UNIT status is the hard availability gate
-- for everything student-facing: redeem_unit_code (0028) raises
-- 'unit_inactive' ("الوحدة غير متاحة حالياً") unless the unit is
-- published, get_public_unit_prices / listUnitsForGrade / can_access_lesson
-- all require status = 'published'. Yet no RPC could ever CHANGE
-- units.status (only lessons had publish_lesson/hide_lesson, 0007/0025,
-- and create_unit/update_unit never touch status), so every unit stayed
-- 'draft' forever and every code redemption failed with
-- 'unit_inactive' even though the unit was fully set up and its lessons
-- were published.
--
-- Fix: publish_unit / hide_unit mirroring the publish_lesson/hide_lesson
-- posture (0025): staff-guarded (admin/mr_walid/teacher), audited,
-- pinned search_path, granted to authenticated only.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.publish_unit(p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.units
    SET status = 'published'
    WHERE id = p_unit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    PERFORM public.audit_log('unit.publish', 'unit', p_unit_id);
END $$;

CREATE OR REPLACE FUNCTION public.hide_unit(p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    UPDATE public.units
    SET status = 'hidden'
    WHERE id = p_unit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unit_not_found';
    END IF;

    PERFORM public.audit_log('unit.hide', 'unit', p_unit_id);
END $$;

-- ---------------------------------------------------------------------
-- Grants (same posture as every staff function: authenticated only).
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.publish_unit(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.publish_unit(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.hide_unit(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hide_unit(uuid) TO authenticated;

COMMENT ON FUNCTION public.publish_unit(uuid) IS
'Staff-guarded unit publish: makes the unit visible to students and redeemable via activation codes (the redeem_unit_code gate).';

COMMENT ON FUNCTION public.hide_unit(uuid) IS
'Staff-guarded unit hide: removes the unit from the student curriculum and blocks code redemption with unit_inactive.';