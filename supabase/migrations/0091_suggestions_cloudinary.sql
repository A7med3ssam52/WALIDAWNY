-- =====================================================================
-- 0091_suggestions_cloudinary.sql — suggestion images on Cloudinary
-- ---------------------------------------------------------------------
-- Supabase Storage is capped at 1GB (shared with pdfs / boards /
-- exam-images / avatars). Suggestion bytes move to Cloudinary
-- (free tier, `authenticated` delivery type — only served through
-- server-signed URLs), while platform_suggestions.image_path stays the
-- single source of truth.
--
-- CUTOVER (no dual-read window, per product decision): new image_path
-- values are Cloudinary pointers ONLY:
--   cloudinary:suggestion-images/<suggestion_id>/<image_uuid>.<ext>:<version>
-- (ext = jpg|jpeg|png|webp, both ids UUID, version = Cloudinary asset
-- version digits). Legacy Supabase paths ({uid}/{suggestion_id}.jpg)
-- are nulled below and rejected everywhere afterwards; the
-- `suggestion-images` bucket + its three storage policies are removed.
--
-- Security properties preserved from 0075:
--   * active students only (public.is_student()),
--   * attach binds the caller's OWN image-less suggestion row only
--     (suggestion_not_found otherwise, suggestion_image_exists on retry),
--   * the suggestion_id segment of the pointer must equal
--     p_suggestion_id — a student can never bind someone else's image,
--   * Cloudinary paths skip the storage.objects check (bytes live
--     outside Supabase). Upload authorization happened at signature
--     issuance: the upload-suggestion-image Edge Function only ever
--     signs public_id suggestion-images/<own-suggestion-id>/<uuid> for
--     the owning student, so a well-formed pointer for the caller's own
--     suggestion is proof of their own signed upload. The format check
--     below is strict (full regex + suggestion match) so nothing else
--     binds.
--   * delete_suggestion() no longer touches storage.objects (the
--     Cloudinary bytes are destroyed via the suggestion-image-delete
--     Edge Function called by the admin client best-effort before the
--     RPC — same posture as removeMyAvatar()/deleteExamImage()).
-- Grants follow SECURITY.md 8.2 (CREATE OR REPLACE preserves the
-- existing authenticated grants; restated explicitly below).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Cutover: null legacy Supabase pointers (they stop rendering by
--    design — no migration script, per product decision).
-- ---------------------------------------------------------------------
UPDATE public.platform_suggestions
SET image_path = NULL
WHERE image_path IS NOT NULL
  AND image_path NOT LIKE 'cloudinary:%';

-- ---------------------------------------------------------------------
-- 2) CHECK: Cloudinary pointers only.
-- ---------------------------------------------------------------------
ALTER TABLE public.platform_suggestions
    DROP CONSTRAINT IF EXISTS platform_suggestions_image_path_check;

ALTER TABLE public.platform_suggestions
    ADD CONSTRAINT platform_suggestions_image_path_check
    CHECK (
        image_path IS NULL
        OR image_path ~ '^cloudinary:suggestion-images/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp):[0-9]+$'
    );

COMMENT ON COLUMN public.platform_suggestions.image_path IS
'Cloudinary pointer for the single optional suggestion image (cloudinary:suggestion-images/<suggestion_id>/<image_uuid>.<ext>:<version>, type=authenticated). NULL = no image. Bound server-side via attach_suggestion_image(); never set directly by clients.';

-- ---------------------------------------------------------------------
-- 3) attach_suggestion_image: same ownership/single-image guards as
--    0075, path check accepts ONLY the caller-owned Cloudinary pointer
--    for this suggestion (no storage.objects lookup).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_suggestion_image(p_suggestion_id uuid, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_row public.platform_suggestions%ROWTYPE;
BEGIN
    IF v_uid IS NULL OR NOT public.is_student() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT * INTO v_row
    FROM public.platform_suggestions
    WHERE id = p_suggestion_id AND student_id = v_uid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'suggestion_not_found';
    END IF;

    IF v_row.image_path IS NOT NULL THEN
        RAISE EXCEPTION 'suggestion_image_exists';
    END IF;

    -- Strict Cloudinary shape + suggestion segment pinned to this row.
    -- A foreign suggestion's pointer (even well-formed) is invalid here.
    IF COALESCE(p_path, '') !~ '^cloudinary:suggestion-images/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp):[0-9]+$'
        OR split_part(split_part(p_path, '/', 2), '/', 1) <> v_row.id::text
    THEN
        RAISE EXCEPTION 'invalid_image';
    END IF;

    UPDATE public.platform_suggestions SET image_path = p_path WHERE id = v_row.id;
END $$;

COMMENT ON FUNCTION public.attach_suggestion_image(uuid, text) IS
'Binds a Cloudinary image to the caller''s own suggestion. Path must be cloudinary:suggestion-images/<own-suggestion-id>/<uuid>.<jpg|jpeg|png|webp>:<version> (upload pre-authorized via the signed-upload Edge Function). Rejects foreign/legacy paths with invalid_image.';

REVOKE EXECUTE ON FUNCTION public.attach_suggestion_image(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.attach_suggestion_image(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) delete_suggestion: admin-only hard delete (Cloudinary destroy is
--    best-effort via the suggestion-image-delete Edge Function before
--    this call; no storage.objects access remains).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_suggestion(p_suggestion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.platform_suggestions WHERE id = p_suggestion_id) THEN
        RAISE EXCEPTION 'suggestion_not_found';
    END IF;

    DELETE FROM public.platform_suggestions WHERE id = p_suggestion_id;

    PERFORM public.audit_log('suggestion.delete', 'platform_suggestions', p_suggestion_id, NULL);
END $$;

COMMENT ON FUNCTION public.delete_suggestion(uuid) IS
'Admin-only hard delete of a suggestion (its Cloudinary image, if any, is destroyed best-effort via the suggestion-image-delete Edge Function before this call).';

REVOKE EXECUTE ON FUNCTION public.delete_suggestion(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_suggestion(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) Storage cleanup: drop the suggestion-images policies, objects and
--    bucket (cutover — reads/writes no longer touch Supabase Storage).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
        DROP POLICY IF EXISTS suggestion_images_insert_own ON storage.objects;
        DROP POLICY IF EXISTS suggestion_images_select_owner_admin ON storage.objects;
        DROP POLICY IF EXISTS suggestion_images_delete_admin ON storage.objects;
        DELETE FROM storage.objects WHERE bucket_id = 'suggestion-images';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        DELETE FROM storage.buckets WHERE id = 'suggestion-images';
    END IF;
END$$;
