-- =====================================================================
-- 0089_avatars_cloudinary.sql — accept Cloudinary-hosted avatars
-- ---------------------------------------------------------------------
-- Supabase Storage is capped at 1GB (shared with pdfs / boards /
-- exam-images / suggestion-images). Avatar bytes move to Cloudinary
-- (free tier, `authenticated` delivery type — original + derivatives
-- only served through server-signed URLs), while profiles.avatar_path
-- stays the single source of truth.
--
-- Accepted avatar_path values after this migration (dual-read window):
--   * legacy Supabase object:
--       <own-uid>/avatar.jpg|jpeg|png|webp
--     (must exist in storage.objects — checked exactly like 0088)
--   * Cloudinary asset:
--       cloudinary:<own-uid>/avatar.<ext>:<version>
--     (ext = jpg|jpeg|png|webp, version = Cloudinary asset version
--     digits; e.g. cloudinary:7000...0001/avatar.jpg:1788000000)
--
-- Security properties preserved from 0082/0088:
--   * active students only (public.is_student()),
--   * the uid embedded in EITHER format must equal auth.uid() — a
--     student can never bind someone else's object,
--   * legacy paths still require the storage.objects row (avatar_missing
--     otherwise),
--   * Cloudinary paths skip the storage.objects check (bytes live
--     outside Supabase). Upload authorization for those happened at
--     signature issuance: the avatar-upload-signature Edge Function only
--     ever signs public_id avatars/<caller-uid>/avatar for the caller,
--     so a well-formed cloudinary:<own-uid>/... path is proof the
--     caller performed their own signed upload. The format check below
--     is strict (full regex + uid match) so nothing else binds.
--   * remove_my_avatar() is unchanged: the best-effort storage.objects
--     DELETE matches zero rows for Cloudinary paths (harmless); the
--     Cloudinary bytes are destroyed via the avatar-delete Edge
--     Function (Admin API, server secret) called by the client right
--     before the RPC — see src/data/rpc.ts removeMyAvatar().
--   * the 0087 per-set admin notification + audit_log are kept verbatim.
-- Grants follow SECURITY.md 8.2 (CREATE OR REPLACE preserves the
-- existing authenticated grant; restated explicitly below).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Document the dual format on the column.
-- ---------------------------------------------------------------------
COMMENT ON COLUMN public.profiles.avatar_path IS
'Student profile photo pointer. Either a Supabase Storage path in the private avatars bucket (<user_id>/avatar.jpg|jpeg|png|webp) or a Cloudinary pointer (cloudinary:<user_id>/avatar.<ext>:<version>, type=authenticated). NULL = no photo. Bound server-side via set_my_avatar(); never set directly by clients.';

-- ---------------------------------------------------------------------
-- 2) set_my_avatar: same 0087 behaviour, path check accepts the legacy
--    fixed path OR the caller-owned Cloudinary pointer.
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

    -- Notify every active, non-deleted admin (admin role only).
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT a.id, 'avatar_updated', 'تحديث الصورة الشخصية',
           COALESCE(v_name, v_uid_text),
           'avatar_updated:' || v_uid_text || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::text,
           'profiles', v_uid
    FROM public.profiles a
    WHERE a.role = 'admin'
      AND a.status = 'active'
      AND a.deleted_at IS NULL
    ON CONFLICT (dedup_key) DO NOTHING;

    PERFORM public.audit_log('profile.avatar_set', 'profiles', v_uid, NULL);
END $$;

COMMENT ON FUNCTION public.set_my_avatar(text) IS
'Student binds their own avatar after uploading it: either the legacy fixed Supabase object (<uid>/avatar.jpg|jpeg|png|webp, must exist) or their Cloudinary pointer (cloudinary:<uid>/avatar.<ext>:<version>, upload pre-authorized via the signed-upload Edge Function). Rejects any other path so profiles can never point at foreign objects. Notifies every active admin via avatar_updated on each change.';

REVOKE EXECUTE ON FUNCTION public.set_my_avatar(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_my_avatar(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) remove_my_avatar(): unchanged logic (the best-effort
--    storage.objects DELETE is a no-op for Cloudinary pointers; the
--    Cloudinary bytes are destroyed via the avatar-delete Edge Function
--    before this RPC runs). Comment refreshed; grants restated.
-- ---------------------------------------------------------------------
COMMENT ON FUNCTION public.remove_my_avatar() IS
'Student clears their avatar binding; a legacy Supabase object is removed best-effort (Cloudinary bytes, if any, are destroyed via the avatar-delete Edge Function before this call).';

REVOKE EXECUTE ON FUNCTION public.remove_my_avatar() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_my_avatar() TO authenticated;
