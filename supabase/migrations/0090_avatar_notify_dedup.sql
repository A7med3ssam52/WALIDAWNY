-- =====================================================================
-- 0090_avatar_notify_dedup.sql — per-admin dedup_key for avatar_updated
-- ---------------------------------------------------------------------
-- Bug: 0087/0088/0089 built the notification dedup_key from the
-- STUDENT id + millisecond timestamp only:
--   'avatar_updated:<student_uid>:<ms>'
-- With TWO or more active admins, the multi-row INSERT...SELECT raises
-- the same dedup_key for every admin row — the first row inserts and
-- every other admin's row hits ON CONFLICT (dedup_key) DO NOTHING and
-- is silently dropped. Result: only ONE admin is ever notified per
-- avatar change (whichever row the planner serves first), nondetermin-
-- istically. The local harness caught it as suite 19 asserting
-- "AD notified = 1, got 0" whenever another suite left a second
-- active admin behind.
--
-- Fix: scope the dedup_key per admin —
--   'avatar_updated:<student_uid>:<admin_id>:<ms>'
-- so every matching admin inserts exactly one row per change, and
-- same-millisecond double-calls stay safe per (student, admin).
-- Nothing else changes (path checks, admin predicate, audit, grants
-- all identical to 0089). Grants follow SECURITY.md 8.2.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_my_avatar(p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid;
    v_name text;
    v_uid_text text;
    v_is_legacy boolean := false;
    v_is_cloudinary boolean := false;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    -- Active students only (is_student = role + active + not deleted).
    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_path IS NULL THEN
        RAISE EXCEPTION 'invalid_avatar_path';
    END IF;

    v_uid_text := v_uid::text;

    -- Legacy Supabase object: exactly <own-uid>/avatar.<ext>.
    IF p_path = (v_uid_text || '/avatar.jpg')
        OR p_path = (v_uid_text || '/avatar.jpeg')
        OR p_path = (v_uid_text || '/avatar.png')
        OR p_path = (v_uid_text || '/avatar.webp')
    THEN
        v_is_legacy := true;
    -- Cloudinary pointer: cloudinary:<own-uid>/avatar.<ext>:<version>.
    -- The uid segment is extracted and pinned to the caller below.
    ELSIF p_path ~ '^cloudinary:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.(jpg|jpeg|png|webp):[0-9]+$'
        AND split_part(split_part(p_path, ':', 2), '/', 1) = v_uid_text
    THEN
        v_is_cloudinary := true;
    END IF;

    IF NOT v_is_legacy AND NOT v_is_cloudinary THEN
        RAISE EXCEPTION 'invalid_avatar_path';
    END IF;

    -- Legacy paths must reference an actually-uploaded object.
    -- Cloudinary bytes live outside Supabase; their upload was
    -- authorized at signature issuance (owner-only public_id).
    IF v_is_legacy AND NOT EXISTS (
        SELECT 1 FROM storage.objects
        WHERE bucket_id = 'avatars' AND name = p_path
    ) THEN
        RAISE EXCEPTION 'avatar_missing';
    END IF;

    UPDATE public.profiles SET avatar_path = p_path WHERE id = v_uid;

    SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;

    -- Notify every active, non-deleted admin (admin role only), one row
    -- per admin: the dedup_key embeds the admin id so multi-admin
    -- inserts never collide with each other.
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT a.id, 'avatar_updated', 'تحديث الصورة الشخصية',
           COALESCE(v_name, v_uid_text),
           'avatar_updated:' || v_uid_text || ':' || a.id::text || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::text,
           'profiles', v_uid
    FROM public.profiles a
    WHERE a.role = 'admin'
      AND a.status = 'active'
      AND a.deleted_at IS NULL
    ON CONFLICT (dedup_key) DO NOTHING;

    PERFORM public.audit_log('profile.avatar_set', 'profiles', v_uid, NULL);
END $$;

COMMENT ON FUNCTION public.set_my_avatar(text) IS
'Student binds their own avatar after uploading it: either the legacy fixed Supabase object (<uid>/avatar.jpg|jpeg|png|webp, must exist) or their Cloudinary pointer (cloudinary:<uid>/avatar.<ext>:<version>, upload pre-authorized via the signed-upload Edge Function). Rejects any other path so profiles can never point at foreign objects. Notifies every active admin via avatar_updated on each change (dedup per student+admin+ms).';

REVOKE EXECUTE ON FUNCTION public.set_my_avatar(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_my_avatar(text) TO authenticated;
