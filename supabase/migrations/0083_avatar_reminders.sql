-- =====================================================================
-- 0083_avatar_reminders.sql — bulk avatar reminders for photo-less students
-- ---------------------------------------------------------------------
-- Adds the `avatar_required` notification type and a staff-only
-- remind_missing_avatars() RPC that notifies every active,
-- non-deleted student whose profiles.avatar_path IS NULL. Dedup key
-- (avatar_required:<student_id>) makes it once-only per student.
-- Grants follow SECURITY.md 8.2 (revoke PUBLIC, grant authenticated;
-- the function itself enforces admin/mr_walid).
-- =====================================================================

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'avatar_required';

CREATE OR REPLACE FUNCTION public.remind_missing_avatars()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT p.id, 'avatar_required', 'الصورة الشخصية مطلوبة',
           'ارفع صورتك الشخصية من صفحة الملف الشخصي لفتح كامل أقسام المنصة.',
           'avatar_required:' || p.id::text, NULL, NULL
    FROM public.profiles p
    WHERE p.role = 'student'
      AND p.status = 'active'
      AND p.deleted_at IS NULL
      AND p.avatar_path IS NULL
    ON CONFLICT (dedup_key) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    PERFORM public.audit_log('profile.avatar_remind_all', 'profiles', NULL,
        jsonb_build_object('reminded', v_count));

    RETURN v_count;
END $$;

COMMENT ON FUNCTION public.remind_missing_avatars() IS
'Admin/mr_walid bulk reminder: notifies active students without a profile photo (once-only via dedup). Returns the number of newly inserted notifications.';

REVOKE EXECUTE ON FUNCTION public.remind_missing_avatars() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remind_missing_avatars() TO authenticated;
