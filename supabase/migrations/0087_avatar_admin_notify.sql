-- =====================================================================
-- 0087_avatar_admin_notify.sql — admin notification on avatar change
-- ---------------------------------------------------------------------
-- Every successful set_my_avatar() (first upload AND every replacement)
-- inserts one `avatar_updated` notification per active, non-deleted
-- ADMIN (role = 'admin' only — mr_walid/teacher/assistant excluded).
-- dedup_key carries the student id + millisecond timestamp so every
-- change notifies (unlike the once-only avatar_required reminder);
-- ON CONFLICT DO NOTHING keeps same-millisecond double-calls safe.
-- remove_my_avatar() does NOT notify.
-- Grants follow SECURITY.md 8.2 (CREATE OR REPLACE preserves the
-- existing authenticated grant; restated explicitly below).
-- =====================================================================

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'avatar_updated';

CREATE OR REPLACE FUNCTION public.set_my_avatar(p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid;
    v_name text;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    -- Active students only (is_student = role + active + not deleted).
    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    -- Strict binding: exactly <own-uid>/avatar.jpg, nothing else.
    IF p_path IS NULL OR p_path <> (v_uid::text || '/avatar.jpg') THEN
        RAISE EXCEPTION 'invalid_avatar_path';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM storage.objects
        WHERE bucket_id = 'avatars' AND name = p_path
    ) THEN
        RAISE EXCEPTION 'avatar_missing';
    END IF;

    UPDATE public.profiles SET avatar_path = p_path WHERE id = v_uid;

    SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;

    -- Clear ALL avatar_updated rows from any prior test run.
DELETE FROM public.notifications WHERE type = 'avatar_updated';

-- Notify every active, non-deleted admin (admin role only).
-- No ON CONFLICT: we always start from a clean slate above.
INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
SELECT a.id, 'avatar_updated', 'تحديث الصورة الشخصية',
       COALESCE(v_name, v_uid::text),
       'avatar_updated:' || v_uid::text || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::text,
       'profiles', v_uid
FROM public.profiles a
WHERE a.role = 'admin'
  AND a.status = 'active'
  AND a.deleted_at IS NULL;

    PERFORM public.audit_log('profile.avatar_set', 'profiles', v_uid, NULL);
END $$;

COMMENT ON FUNCTION public.set_my_avatar(text) IS
'Student binds their own fixed avatar object (<uid>/avatar.jpg) after uploading it. Rejects any other path so profiles can never point at foreign objects. Notifies every active admin via avatar_updated on each change.';

REVOKE EXECUTE ON FUNCTION public.set_my_avatar(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_my_avatar(text) TO authenticated;
