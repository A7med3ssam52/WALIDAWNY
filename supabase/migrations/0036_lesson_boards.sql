-- =====================================================================
-- 0036_lesson_boards
-- Phase 8 | Lesson Boards (السبورات) | Database
-- Lesson-board photos: the teacher uploads whiteboard/board photos per
-- lesson (upload / delete / reorder / preview) and students see them as
-- an image grid inside the SAME lesson tab below the video and the PDF
-- (ARCHITECTURE.md §8.2 row 6 "get-board-signed-urls / upload-board /
-- delete-board"; SECURITY.md section 9 storage posture).
--
-- Why a SECURITY DEFINER wrapper family (same shape as 0015/0025/0031):
--   lesson_boards carries a SINGLE SELECT policy + FORCE RLS (0009-style),
--   so a caller-token client CANNOT insert/update/delete rows. Every
--   mutation goes through the four staff-guarded wrappers below which
--   re-validate all rules server-side (authoritative backstop; the Edge
--   Functions pre-check the same rules over the caller token for UX).
--
-- Why the single SELECT policy (lesson_boards_select_gated):
--   * staff (admin / mr_walid / teacher) -> every row (metadata for the
--     staff UI: pending + ready + soft-deleted rows, the UI filters);
--   * student -> ONLY is_ready=true rows of lessons they can access
--     (can_access_lesson); pending uploads and soft-deleted boards stay
--     invisible, so a student can never mint a row-backed storage path
--     (0015's issuance-time boundary).
--   NO INSERT/UPDATE/DELETE policies: DML is RPC-only (lesson_pdfs
--   pattern). The partial-unique "one primary per lesson" index does NOT
--   apply here: every board is shown, so there is no is_primary column
--   and no (lesson_id, sort_order) uniqueness — sort_order is a display
--   hint maintained exclusively by reorder_boards (same non-unique
--   posture as lessons/units sort_order).
--
-- Why soft delete (delete_board_upload_record):
--   Unlike the PDF flow (0031 hard-deletes only NON-ready rows), a
--   board may be removed at ANY time — ready or pending — because the
--   teacher deletes photos the students already see. The row is
--   soft-deleted (deleted_at = now()) so the storage object can be
--   removed best-effort by the Edge Function and the metadata stays for
--   audit/restore history.
--
-- Why reorder_boards enforces the EXACT ready set:
--   The staff UI sends the full ordered list of the lesson's ready,
--   non-deleted boards. Any deviation (missing/extra/duplicate ids, a
--   pending or deleted row, a row of another lesson) is a
--   validation_error / board_not_found / wrong_lesson — the wrapper
--   never guesses the intended order.
--
-- Storage: private `boards` bucket (config.toml [storage.buckets.boards],
-- public=false, file_size_limit=10MiB) + ONE row-backed INSERT policy on
-- storage.objects (boards_insert_row_backed) — the minimal exception to
-- "no direct object policies" required for createSignedUploadUrl
-- issuance over the caller-token path (0015's exact pattern: path shape
-- '{lesson_id}/{uuid}.{ext}' AND an existing non-deleted lesson_boards
-- row with that storage_path VISIBLE TO THE CALLER). Object reads stay
-- locked behind the get-board-signed-urls Edge Function.
--
-- Error surface (P0001 + detail message):
--   permission_denied | lesson_not_found | lesson_deleted |
--   invalid_board_size | invalid_file_extension | board_not_found |
--   wrong_lesson | board_already_ready | validation_error
--
-- Grant surface: authenticated ONLY (client RPCs #66-69, count asserted
-- in tests/local/sql/05_grants.sql). anon stays fully locked.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) lesson_boards table (lesson_pdfs shape: 0002:218-239)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_boards (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id      uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    storage_path   text NOT NULL UNIQUE CHECK (length(btrim(storage_path)) > 0),
    original_name  text NOT NULL CHECK (length(btrim(original_name)) > 0),
    size_bytes     bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
    mime_type      text NOT NULL DEFAULT 'image/jpeg',
    sort_order     integer NOT NULL DEFAULT 0,
    is_ready       boolean NOT NULL DEFAULT false,
    deleted_at     timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_boards FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.lesson_boards IS 'Board photos attached to lessons (Supabase Storage-backed, private boards bucket). is_ready gates student visibility; sort_order is the teacher-driven display order (reorder_boards); delete_board_upload_record soft-deletes. Direct SELECT by students returns metadata only; content requires a signed URL from get-board-signed-urls.';

CREATE INDEX IF NOT EXISTS idx_lesson_boards_lesson ON public.lesson_boards (lesson_id);

-- ---------------------------------------------------------------------
-- 2) Triggers: set_updated_at (the table carries updated_at, 0004
--    convention) + audit_trigger (MED-8 inventory, 0005/0029/0030 style).
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON public.lesson_boards;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.lesson_boards
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_trigger ON public.lesson_boards;
CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.lesson_boards
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ---------------------------------------------------------------------
-- 3) RLS: single SELECT policy (0025:193-200 lesson_pdfs pattern with
--    the is_primary condition dropped — every ready board is shown).
--    Student branch adds deleted_at IS NULL (spec: students see ready
--    boards only, "غير المحذوفة" — soft-deleted boards must not leak).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_boards_select_gated ON public.lesson_boards;
CREATE POLICY lesson_boards_select_gated ON public.lesson_boards
    FOR SELECT
    USING (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR (public.is_student() AND public.can_access_lesson(lesson_id)
            AND is_ready AND deleted_at IS NULL)
    );

-- ---------------------------------------------------------------------
-- 4) create_board_upload_record(p_lesson_id, p_original_name, p_size_bytes)
-- Staff-guarded EF entry point (upload-board): reserves the storage
-- path and creates the pending lesson_boards row. The path is generated
-- here as '{lesson_id}/{uuid}.{ext}' with gen_random_uuid() — the client
-- NEVER supplies a path component (IDOR/path-traversal impossible, 0015
-- pattern). The extension (jpg/jpeg/png/webp, case-insensitive) is the
-- only content hint available before the bytes exist; mime_type is
-- derived from it and pinned on the signed upload URL by the EF.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_board_upload_record(
    p_lesson_id uuid,
    p_original_name text,
    p_size_bytes bigint DEFAULT NULL
)
RETURNS TABLE (id uuid, storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_path text;
    v_name text;
    v_ext text;
    v_mime text;
    v_sort integer;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_size_bytes IS NOT NULL AND (p_size_bytes < 0 OR p_size_bytes > 10485760) THEN
        RAISE EXCEPTION 'invalid_board_size';
    END IF;

    -- NOTE: unqualified column refs must be avoided: the RETURNS TABLE
    -- OUT parameter `id` shadows table columns in SQL statements (0015:85).
    IF NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id) THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = p_lesson_id AND l.deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'lesson_deleted';
    END IF;

    -- basename only (strip any client path segment) + extension checks
    v_name := btrim(p_original_name);
    v_name := substring(v_name from '([^/\\]*)$');
    v_ext  := lower(substring(v_name from '\.([^.]+)$'));
    IF v_name IS NULL OR v_name = '' OR length(v_name) > 255
       OR v_ext IS NULL OR v_ext NOT IN ('jpg', 'jpeg', 'png', 'webp') THEN
        RAISE EXCEPTION 'invalid_file_extension';
    END IF;

    v_mime := CASE v_ext
        WHEN 'jpg'  THEN 'image/jpeg'
        WHEN 'jpeg' THEN 'image/jpeg'
        WHEN 'png'  THEN 'image/png'
        WHEN 'webp' THEN 'image/webp'
    END;

    SELECT COALESCE(MAX(lb.sort_order), 0) + 1 INTO v_sort
    FROM public.lesson_boards lb
    WHERE lb.lesson_id = p_lesson_id AND lb.deleted_at IS NULL;

    v_path := p_lesson_id::text || '/' || gen_random_uuid()::text || '.' || v_ext;

    INSERT INTO public.lesson_boards
        (lesson_id, storage_path, original_name, size_bytes, mime_type, sort_order, is_ready)
    VALUES
        (p_lesson_id, v_path, v_name, p_size_bytes, v_mime, v_sort, false)
    RETURNING lesson_boards.id INTO v_id;

    PERFORM public.audit_log('board.upload_started', 'lesson_board', v_id,
        jsonb_build_object('lesson_id', p_lesson_id, 'original_name', v_name,
                           'storage_path', v_path, 'size_bytes', p_size_bytes,
                           'mime_type', v_mime));

    RETURN QUERY SELECT v_id, v_path;
END $$;

COMMENT ON FUNCTION public.create_board_upload_record(uuid, text, bigint) IS
'Phase 8 staff wrapper: reserves the pending lesson_boards row + server-generated {lesson_id}/{uuid}.{ext} storage_path for the upload-board Edge Function. Staff-guarded; validates lesson, 10MiB size cap and jpg/jpeg/png/webp extension; mime_type derived from the extension; sort_order = max+1. Authenticated-only grant (client RPC #66).';

-- ---------------------------------------------------------------------
-- 5) finalize_board_upload(p_board_id)
-- Staff-guarded: marks the pending row is_ready=true after the bytes
-- were uploaded to the signed URL. No primary concept — every ready
-- board is displayed. A second finalize is a board_already_ready error.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_board_upload(p_board_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
    v_ready boolean;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lb.lesson_id, lb.is_ready INTO v_lesson, v_ready
    FROM public.lesson_boards lb
    WHERE lb.id = p_board_id AND lb.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'board_not_found';
    END IF;
    IF v_ready THEN
        RAISE EXCEPTION 'board_already_ready';
    END IF;

    UPDATE public.lesson_boards SET is_ready = true WHERE id = p_board_id;

    PERFORM public.audit_log('board.finalized', 'lesson_board', p_board_id,
        jsonb_build_object('lesson_id', v_lesson));
END $$;

COMMENT ON FUNCTION public.finalize_board_upload(uuid) IS
'Phase 8 staff wrapper: marks a pending lesson_boards row ready after the upload (is_ready=true). Staff-guarded; board_not_found when absent/deleted; board_already_ready on repeat. Authenticated-only grant (client RPC #67).';

-- ---------------------------------------------------------------------
-- 6) delete_board_upload_record(p_lesson_id, p_board_id)
-- Staff-guarded SOFT delete (deleted_at = now()) of ANY board row —
-- ready or pending — because the teacher removes photos students
-- already see (unlike the PDF release 0031 which hard-deletes only
-- non-ready rows). The Edge Function removes the Storage object
-- best-effort; this wrapper is the authoritative, audited backstop.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_board_upload_record(
    p_lesson_id uuid,
    p_board_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lesson uuid;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT lb.lesson_id INTO v_lesson
    FROM public.lesson_boards lb
    WHERE lb.id = p_board_id AND lb.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'board_not_found';
    END IF;
    IF v_lesson <> p_lesson_id THEN
        RAISE EXCEPTION 'wrong_lesson';
    END IF;

    UPDATE public.lesson_boards
    SET deleted_at = now(), updated_at = now()
    WHERE id = p_board_id;

    PERFORM public.audit_log('board.deleted', 'lesson_board', p_board_id,
        jsonb_build_object('lesson_id', p_lesson_id));
END $$;

COMMENT ON FUNCTION public.delete_board_upload_record(uuid, uuid) IS
'Phase 8 staff wrapper: soft-deletes a lesson_boards row (ready OR pending) of the given lesson — the ONLY delete surface for boards. Staff-guarded; board_not_found when absent/already deleted; wrong_lesson on lesson mismatch. Authenticated-only grant (client RPC #68).';

-- ---------------------------------------------------------------------
-- 7) reorder_boards(p_lesson_id, p_board_ids)
-- Staff-guarded: the list must be EXACTLY the lesson''s ready,
-- non-deleted boards (same size + same set, no duplicates) — any
-- deviation is a validation_error; each id must exist
-- (board_not_found) and belong to the lesson (wrong_lesson). Updates
-- sort_order to 1..n in the passed order. No (lesson_id, sort_order)
-- unique constraint exists (see header), so sequential in-place
-- updates cannot transiently collide.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_boards(
    p_lesson_id uuid,
    p_board_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expected integer;
    v_lesson uuid;
    v_ready boolean;
    v_i integer;
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    -- a NULL/empty array or any duplicate entry is never a valid reorder
    IF p_board_ids IS NULL OR cardinality(p_board_ids) = 0
       OR cardinality(p_board_ids) <>
          cardinality(ARRAY(SELECT DISTINCT unnest(p_board_ids))) THEN
        RAISE EXCEPTION 'validation_error';
    END IF;

    -- the list must cover EXACTLY the ready, non-deleted boards of the lesson
    SELECT count(*) INTO v_expected
    FROM public.lesson_boards lb
    WHERE lb.lesson_id = p_lesson_id AND lb.deleted_at IS NULL AND lb.is_ready;

    IF cardinality(p_board_ids) <> v_expected THEN
        RAISE EXCEPTION 'validation_error';
    END IF;

    FOR v_i IN 1..cardinality(p_board_ids) LOOP
        SELECT lb.lesson_id, lb.is_ready INTO v_lesson, v_ready
        FROM public.lesson_boards lb
        WHERE lb.id = p_board_ids[v_i] AND lb.deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'board_not_found';
        END IF;
        IF v_lesson <> p_lesson_id THEN
            RAISE EXCEPTION 'wrong_lesson';
        END IF;
        IF NOT v_ready THEN
            RAISE EXCEPTION 'validation_error';
        END IF;

        UPDATE public.lesson_boards SET sort_order = v_i WHERE id = p_board_ids[v_i];
    END LOOP;

    PERFORM public.audit_log('board.reordered', 'lesson_board', NULL,
        jsonb_build_object('lesson_id', p_lesson_id, 'board_ids', to_jsonb(p_board_ids)));
END $$;

COMMENT ON FUNCTION public.reorder_boards(uuid, uuid[]) IS
'Phase 8 staff wrapper: applies the teacher''s board order (sort_order 1..n). The list must equal EXACTLY the lesson''s ready non-deleted boards; duplicates/missing/extra ids -> validation_error, unknown -> board_not_found, other lesson -> wrong_lesson. Authenticated-only grant (client RPC #69).';

-- ---------------------------------------------------------------------
-- 8) Grants: authenticated only (SECURITY.md 8.2 pattern; explicit
--    REVOKE FROM PUBLIC first because new functions otherwise inherit
--    the PUBLIC default grant). anon: nothing.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_board_upload_record(uuid, text, bigint) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_board_upload_record(uuid, text, bigint) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.finalize_board_upload(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.finalize_board_upload(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_board_upload_record(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_board_upload_record(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reorder_boards(uuid, uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reorder_boards(uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------
-- 9) Storage: private `boards` bucket + ONE row-backed INSERT policy
--    (0011 bucket pattern + 0015:122-137 policy pattern). Signed-upload-
--    URL issuance over the caller-token path requires the caller to
--    satisfy an INSERT policy on storage.objects; the WITH CHECK binds
--    the path to an existing, non-deleted lesson_boards row visible to
--    the caller (pending rows are invisible to students under the 0009-
--    style SELECT policy, so only staff can reserve paths; every
--    row-backed path already holds its object, so a direct upload to a
--    visible ready path conflicts on the real platform).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('boards', 'boards', false)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        DROP POLICY IF EXISTS boards_insert_row_backed ON storage.objects;
        CREATE POLICY boards_insert_row_backed ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'boards'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
                AND EXISTS (
                    SELECT 1 FROM public.lesson_boards
                    WHERE storage_path = name AND deleted_at IS NULL
                )
            );
    END IF;
END$$;
