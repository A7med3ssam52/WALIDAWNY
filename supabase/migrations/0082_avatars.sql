-- =====================================================================
-- 0082_avatars.sql — student profile photos
-- ---------------------------------------------------------------------
-- Adds an optional per-student profile photo shown in the dashboard
-- header (and anywhere a student identity is rendered):
--   * profiles.avatar_path (nullable storage path, NULL = no photo)
--   * private `avatars` bucket, one fixed object per student:
--     <user_id>/avatar.jpg (overwrite on re-upload, no orphans)
--   * RPC-only profile binding: set_my_avatar(p_path) pins the path to
--     the caller (<uid>/avatar.jpg); remove_my_avatar() clears it and
--     deletes the object best-effort. Direct client UPDATE of
--     avatar_path is intentionally NOT granted (existing
--     profiles_update_own_self_service allows other self-service
--     columns, but avatar binding stays server-side so a student can
--     never point their profile at someone else's object).
--   * Storage RLS: INSERT/UPDATE own fixed path; SELECT owner + staff
--     (admin / mr_walid / teacher, e.g. student detail + lists);
--     DELETE owner + admin.
-- Grants follow SECURITY.md 8.2 (revoke PUBLIC, grant authenticated).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) profiles.avatar_path
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS avatar_path text NULL;

COMMENT ON COLUMN public.profiles.avatar_path IS
'Storage path of the student profile photo inside the private avatars bucket (<user_id>/avatar.jpg). NULL = no photo. Bound server-side via set_my_avatar(); never set directly by clients.';

-- ---------------------------------------------------------------------
-- 2) Private `avatars` bucket
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('avatars', 'avatars', false)
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) Storage RLS (0075/0036 pattern: strict fixed-path binding)
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
            AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.jpg$'
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
            AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.jpg$'
            AND split_part(name, '/', 1) = auth.uid()::text
        );

    DROP POLICY IF EXISTS avatars_select_owner_staff ON storage.objects;
    CREATE POLICY avatars_select_owner_staff ON storage.objects
        FOR SELECT TO authenticated
        USING (
            bucket_id = 'avatars'
            AND (
                split_part(name, '/', 1) = auth.uid()::text
                OR public.is_admin()
                OR public.is_mr_walid()
                OR public.is_teacher()
            )
        );

    DROP POLICY IF EXISTS avatars_delete_owner_admin ON storage.objects;
    CREATE POLICY avatars_delete_owner_admin ON storage.objects
        FOR DELETE TO authenticated
        USING (
            bucket_id = 'avatars'
            AND (split_part(name, '/', 1) = auth.uid()::text OR public.is_admin())
        );
END $$;

-- ---------------------------------------------------------------------
-- 4) set_my_avatar(p_path): bind own fixed path (active students only)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_my_avatar(p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid;
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

    PERFORM public.audit_log('profile.avatar_set', 'profiles', v_uid, NULL);
END $$;

COMMENT ON FUNCTION public.set_my_avatar(text) IS
'Student binds their own fixed avatar object (<uid>/avatar.jpg) after uploading it. Rejects any other path so profiles can never point at foreign objects.';

REVOKE EXECUTE ON FUNCTION public.set_my_avatar(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_my_avatar(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) remove_my_avatar(): clear binding + best-effort object removal
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_my_avatar()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid;
    v_path text;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT public.is_student() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT avatar_path INTO v_path FROM public.profiles WHERE id = v_uid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'profile_not_found';
    END IF;

    UPDATE public.profiles SET avatar_path = NULL WHERE id = v_uid;

    IF v_path IS NOT NULL THEN
        BEGIN
            DELETE FROM storage.objects
            WHERE bucket_id = 'avatars' AND name = v_path;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    PERFORM public.audit_log('profile.avatar_remove', 'profiles', v_uid, NULL);
END $$;

COMMENT ON FUNCTION public.remove_my_avatar() IS
'Student clears their avatar binding; the storage object is removed best-effort.';

REVOKE EXECUTE ON FUNCTION public.remove_my_avatar() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_my_avatar() TO authenticated;
