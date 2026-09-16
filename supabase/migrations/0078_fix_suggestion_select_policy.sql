-- =====================================================================
-- 0078_fix_suggestion_select_policy
-- Fixes a chicken-and-egg bug in the 0075 suggestion-images SELECT
-- policy: it was row-backed on platform_suggestions.image_path = name,
-- so a freshly uploaded object (whose row is still image-less) was
-- never SELECT-covered. The Storage API uploads with
-- INSERT ... RETURNING *, which REQUIRES a covering SELECT policy
-- (0041 C1), so every student image upload failed with 42501 - both
-- the direct client upload and the local-harness positive probe.
--
-- The replacement mirrors the INSERT scope (0041 C1 posture, but
-- stricter - ownership-bound): owner-or-admin + well-formed path +
-- an EXISTING row for that object id that is either the caller's own
-- (pending or attached) or, for admins, any row. No UPDATE/anon
-- surface is added; the INSERT and DELETE policies are untouched.
-- Append-only: 0075 is already applied remotely and is NOT modified.
-- =====================================================================

DO $$
BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
        DROP POLICY IF EXISTS suggestion_images_select_owner_admin ON storage.objects;
        CREATE POLICY suggestion_images_select_owner_admin ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'suggestion-images'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
                AND (public.is_admin() OR split_part(name, '/', 1) = auth.uid()::text)
                AND EXISTS (
                    SELECT 1 FROM public.platform_suggestions s
                    WHERE s.id::text = split_part(split_part(name, '/', 2), '.', 1)
                      AND (s.student_id = auth.uid() OR public.is_admin())
                )
            );
    END IF;
END$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'suggestion_images_select_owner_admin'
    ) THEN
        COMMENT ON POLICY suggestion_images_select_owner_admin ON storage.objects IS
        '0078: INSERT-scope mirror (0041 C1) - covers pending uploads for INSERT ... RETURNING plus attached reads; owner-bound, admin sees all rows. Replaces the 0075 image_path-bound version that broke fresh uploads.';
    END IF;
END$$;
