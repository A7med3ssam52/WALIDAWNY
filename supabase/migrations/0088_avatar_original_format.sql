-- =====================================================================
-- 0088_avatar_original_format.sql — store avatars at full original quality
-- ---------------------------------------------------------------------
-- Uploads now keep the student's original file bytes + MIME type (no
-- client-side downscale / JPEG re-encode), so the object name carries
-- the real extension: <user_id>/avatar.jpg|jpeg|png|webp.
-- This migration widens every server-side pin that assumed `.jpg`:
--   * storage RLS avatars_insert_own / avatars_update_own name regex
--   * set_my_avatar(p_path) strict path check (0087 notify block kept)
-- Security property preserved: the path must still live strictly under
-- the caller's own uid folder, so a student can never bind (or write)
-- someone else's object. remove_my_avatar() needs no change (it already
-- deletes whatever path is stored on the profile).
-- Grants follow SECURITY.md 8.2 (CREATE OR REPLACE preserves the
-- existing authenticated grant; restated explicitly below).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Widen the storage name regex (guarded like 0082: no-op when the
--    storage schema is absent, e.g. single-file deploys).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('storage.objects') IS NULL THEN
        RETURN;
    END IF;

    DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
    CREATE POLICY avatars_insert_own ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
            bucket_id = 'avatars'
            AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\\.(jpg|jpeg|png|webp)$'
            AND split_part(name, '/', 1) = auth.uid()::text
        );

    DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
    CREATE POLICY avatars_update_own ON storage.objects
        FOR UPDATE TO authenticated
        USING (
            bucket_id = 'avatars'
            AND split_part(name, '/', 1) = auth.uid()::text
        )
        WITH CHECK (
            bucket_id = 'avatars'
            AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\\.(jpg|jpeg|png|webp)$'
            AND split_part(name, '/', 1) = auth.uid()::text
        );
END $$;

-- ---------------------------------------------------------------------
-- 2) set_my_avatar: same 0087 behaviour, path check allows the four
--    original-format extensions under the caller's own uid folder.
-- ---------------------------------------------------------------------
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

    -- Strict binding: exactly <own-uid>/avatar.<ext> with an allow-listed
    -- original-format extension — nothing else.
    IF p_path IS NULL
       OR (
           p_path <> (v_uid::text || '/avatar.jpg')
           AND p_path <> (v_uid::text || '/avatar.jpeg')
           AND p_path <> (v_uid::text || '/avatar.png')
           AND p_path <> (v_uid::text || '/avatar.webp')
       )
    THEN
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

    -- Notify every active, non-deleted admin (admin role only).
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT a.id, 'avatar_updated', 'تحديث الصورة الشخصية',
           COALESCE(v_name, v_uid::text),
           'avatar_updated:' || v_uid::text || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::text,
           'profiles', v_uid
    FROM public.profiles a
    WHERE a.role = 'admin'
      AND a.status = 'active'
      AND a.deleted_at IS NULL
    ON CONFLICT (dedup_key) DO NOTHING;

    PERFORM public.audit_log('profile.avatar_set', 'profiles', v_uid, NULL);
END $$;

COMMENT ON FUNCTION public.set_my_avatar(text) IS
'Student binds their own fixed avatar object (<uid>/avatar.jpg|jpeg|png|webp, original bytes + MIME preserved) after uploading it. Rejects any other path so profiles can never point at foreign objects. Notifies every active admin via avatar_updated on each change.';

REVOKE EXECUTE ON FUNCTION public.set_my_avatar(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_my_avatar(text) TO authenticated;
