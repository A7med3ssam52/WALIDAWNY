-- =====================================================================
-- 0046_delete_exam_fix
-- Fixes silent-failure delete path for exams / exam_questions.
--
-- Problem: `src/data/rpc.ts:deleteExam` did a direct
--   `UPDATE exams SET deleted_at = now() WHERE id = ?`
-- via the caller token. When RLS filtered the row (e.g. caller not
-- staff, or exam already soft-deleted) PostgREST returns 200 with
-- 0 rows — the UI showed "تم حذف الاختبار" while nothing was
-- deleted. The same silent 0-row success existed for
-- `deleteExamQuestion` (hard DELETE).
--
-- Fix: authoritative SECURITY DEFINER RPCs that:
--   * re-validate staff guard (is_admin OR is_mr_walid OR is_teacher)
--   * raise `exam_not_found` / `question_not_found` when the target
--     does not exist or is already soft-deleted
--   * soft-delete the exam (deleted_at = now()) + audit
--   * hard-delete the question + best-effort storage cleanup for
--     exam-images (prompt + choice paths) + audit
-- The wrappers are the ONLY supported delete surfaces; the direct
-- table RLS paths remain but the UI no longer relies on them.
--
-- Storage cleanup: exam-images objects are addressed as
--   {exam_id}/{uuid}.{ext}. On exam soft-delete all objects with
--   prefix {exam_id}/ are removed best-effort; on question hard-delete
--   only the paths referenced by that question are removed.
--   Failures are silent — DB state is authoritative.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) delete_exam(p_exam_id uuid) — soft-delete
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_exam(p_exam_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
    v_deleted timestamptz;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lesson_id, deleted_at INTO v_lesson, v_deleted
    FROM public.exams
    WHERE id = p_exam_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;

    IF v_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;

    UPDATE public.exams
    SET deleted_at = now(), updated_at = now()
    WHERE id = p_exam_id;

    -- best-effort storage cleanup for exam-images (service role bypasses RLS,
    -- but this definer is table owner and can delete storage rows directly;
    -- if storage schema is absent in harness, the block is skipped)
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
            DELETE FROM storage.objects
            WHERE bucket_id = 'exam-images'
              AND name LIKE p_exam_id::text || '/%';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- storage cleanup is best-effort; never fail the delete
        NULL;
    END;

    PERFORM public.audit_log('exam.deleted', 'exams', p_exam_id,
        jsonb_build_object('lesson_id', v_lesson));
END $$;

COMMENT ON FUNCTION public.delete_exam(uuid) IS 'Staff-only soft-delete for exams (deleted_at = now()). Raises exam_not_found when absent/already deleted, permission_denied otherwise. Best-effort removal of exam-images objects with prefix {exam_id}/. Audited.';

REVOKE EXECUTE ON FUNCTION public.delete_exam(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_exam(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) delete_exam_question(p_question_id uuid) — hard-delete
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_exam_question(p_question_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exam uuid;
    v_prompt text;
    v_choices jsonb;
    v_elem text;
    v_idx int;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT exam_id, prompt_image_path, choice_image_paths
    INTO v_exam, v_prompt, v_choices
    FROM public.exam_questions
    WHERE id = p_question_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'question_not_found';
    END IF;

    -- ensure parent exam is still live (prevents deleting from a soft-deleted exam)
    IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = v_exam AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'exam_not_found';
    END IF;

    DELETE FROM public.exam_questions WHERE id = p_question_id;

    -- best-effort storage cleanup for this question's images
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
            IF v_prompt IS NOT NULL AND v_prompt <> '' THEN
                DELETE FROM storage.objects WHERE bucket_id = 'exam-images' AND name = v_prompt;
            END IF;
            IF v_choices IS NOT NULL AND jsonb_typeof(v_choices) = 'array' THEN
                FOR v_idx IN 0..jsonb_array_length(v_choices) - 1 LOOP
                    v_elem := v_choices->>v_idx;
                    IF v_elem IS NOT NULL AND v_elem <> '' THEN
                        DELETE FROM storage.objects WHERE bucket_id = 'exam-images' AND name = v_elem;
                    END IF;
                END LOOP;
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    PERFORM public.audit_log('exam_question.deleted', 'exam_questions', p_question_id,
        jsonb_build_object('exam_id', v_exam));
END $$;

COMMENT ON FUNCTION public.delete_exam_question(uuid) IS 'Staff-only hard-delete for exam_questions. Raises question_not_found when absent, exam_not_found when parent exam is soft-deleted. Best-effort removal of the question prompt/choice image objects. Audited.';

REVOKE EXECUTE ON FUNCTION public.delete_exam_question(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_exam_question(uuid) TO authenticated;
