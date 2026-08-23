-- =====================================================================
-- 0045_exam_images
-- Phase 12 | Exam Question Images (صور الامتحانات)
-- Teacher can attach images to exam questions (prompt image) and to
-- each MCQ choice (choice images). Students see images with the
-- question and answers.
--
-- Schema:
--   exam_questions.prompt_image_path text NULL  -- storage path in bucket exam-images
--   exam_questions.choice_image_paths jsonb NULL -- JSON array of storage paths or nulls, parallel to choices
--   bucket exam-images (private, 5MiB file_size_limit via config.toml)
--   No row-backed INSERT policy — uploads go through the service-role
--   Edge Function upload-exam-image (staff-only, validates exam ownership,
--   file name, size, extension, generates server-side path
--   {exam_id}/{uuid}.{ext}).
--   Reads go through get-exam-image-signed-urls (student via
--   can_access_lesson or staff preview) which signs each stored path
--   with service-role createSignedUrl (TTL 900).
--
-- Why two columns (prompt + per-choice array) instead of a separate
-- table: one image per question prompt + at most 4 per MCQ is bounded;
-- two nullable columns are simpler than a 1:N image table + ordering.
-- The array is parallel to choices: index i corresponds to choice i.
--
-- RLS: exam_questions keeps its 0029 policies (staff full, students
-- via can_access_lesson). No new policies. get_exam_questions is
-- extended to return the new columns (correct_index still masked for
-- students; image paths are never masked).
--
-- Storage: private bucket exam-images (mirrors boards/pdf buckets:
-- no public SELECT, no direct authenticated object policies — content
-- only via signed URLs). Row-backed guard is not needed: the upload
-- EF is service-role-signed, the only writer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columns on exam_questions
-- ---------------------------------------------------------------------
ALTER TABLE public.exam_questions
    ADD COLUMN IF NOT EXISTS prompt_image_path text
        CHECK (prompt_image_path IS NULL OR length(btrim(prompt_image_path)) > 0);

ALTER TABLE public.exam_questions
    ADD COLUMN IF NOT EXISTS choice_image_paths jsonb
        CHECK (choice_image_paths IS NULL OR jsonb_typeof(choice_image_paths) = 'array');

COMMENT ON COLUMN public.exam_questions.prompt_image_path IS
'Storage path in bucket exam-images for the question prompt image (NULL when no image). Set via teacher UI after upload-exam-image.';

COMMENT ON COLUMN public.exam_questions.choice_image_paths IS
'JSON array parallel to choices; each element is a storage path in bucket exam-images or null. Only for mcq questions.';

-- ---------------------------------------------------------------------
-- 2) Extend get_exam_questions to return the new columns (correct_index
--    masking preserved; image paths are always visible to allowed callers).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_exam_questions(p_exam_id uuid)
RETURNS SETOF public.exam_questions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT q.id, q.exam_id, q.type, q.prompt, q.choices,
           CASE WHEN (public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
                THEN q.correct_index ELSE NULL END AS correct_index,
           q.max_score, q.sort_order,
           q.prompt_image_path, q.choice_image_paths
    FROM public.exam_questions q
    JOIN public.exams e ON e.id = q.exam_id AND e.deleted_at IS NULL
    WHERE q.exam_id = p_exam_id
      AND (
          public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
          OR public.can_access_lesson(e.lesson_id)
      )
    ORDER BY q.sort_order;
$$;

COMMENT ON FUNCTION public.get_exam_questions(uuid) IS 'Questions of an exam; correct_index is masked for non-staff callers (answer key never leaks). Includes prompt_image_path + choice_image_paths.';

-- keep grants (idempotent)
REVOKE EXECUTE ON FUNCTION public.get_exam_questions(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_exam_questions(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Storage bucket exam-images (private)
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('exam-images', 'exam-images', false)
        ON CONFLICT (id) DO NOTHING;
    END IF;
END$$;

-- No INSERT/SELECT/DELETE policies on storage.objects for exam-images:
-- the upload-exam-image and get-exam-image-signed-urls Edge Functions
-- use the service-role client to mint signed URLs, bypassing RLS.
-- Direct object access via caller tokens is intentionally blocked.
