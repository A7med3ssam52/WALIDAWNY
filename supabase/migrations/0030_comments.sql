-- =====================================================================
-- 0030_comments
-- Phase 7 | Comments | Database
-- Lesson discussions on top of the unit-purchase model
-- (IMPLEMENTATION-PLAN.md section 9):
--   lesson_comments: top-level comments + self-referencing replies.
-- notification_type gains lesson_comment (reply to your comment) and
-- comment_reply (staff oversight of every added comment/reply) via
-- ALTER TYPE ... ADD VALUE (PG 12+).
--
-- Append-only migration: nothing in 0001..0029 is modified.
-- Access: reads gated on can_access_lesson(lesson.lesson_id) or staff;
-- writes via the SECURITY DEFINER RPCs (add_lesson_comment /
-- delete_lesson_comment / list_lesson_comments); RLS keeps direct DML
-- to own rows (students) or any row (staff).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) notification_type: lesson_comment / comment_reply (ADD VALUE only,
--    idempotent; only referenced at runtime inside function bodies).
-- ---------------------------------------------------------------------
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'lesson_comment';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'comment_reply';

-- ---------------------------------------------------------------------
-- 2) lesson_comments table (DATABASE.md section 4.19).
--    No updated_at column, so set_updated_at is NOT attached; the table
--    joins the audit_trigger inventory (MED-8).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_comments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id  uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    parent_id  uuid REFERENCES public.lesson_comments(id) ON DELETE CASCADE,
    body       text NOT NULL CHECK (length(btrim(body)) > 0 AND length(btrim(body)) <= 1000),
    status     text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'removed')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lesson_comments_lesson_idx ON public.lesson_comments(lesson_id);
CREATE INDEX IF NOT EXISTS lesson_comments_parent_idx ON public.lesson_comments(parent_id) WHERE parent_id IS NOT NULL;

ALTER TABLE public.lesson_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_comments FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.lesson_comments IS 'Lesson comments with self-referencing replies. Students with lesson access may read visible rows and write their own; staff read everything (incl. removed) and moderate.';

-- ---------------------------------------------------------------------
-- 3) Parent/lesson consistency guard for direct DML: a reply must point
--    to a visible comment of the SAME lesson (the RPC validates too).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lesson_comments_parent_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.parent_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM public.lesson_comments p
           WHERE p.id = NEW.parent_id
             AND p.lesson_id = NEW.lesson_id
             AND p.status = 'visible'
       ) THEN
        RAISE EXCEPTION 'invalid_parent';
    END IF;
    RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.lesson_comments_parent_check() FROM PUBLIC;

DROP TRIGGER IF EXISTS lesson_comments_parent_check ON public.lesson_comments;
CREATE TRIGGER lesson_comments_parent_check BEFORE INSERT OR UPDATE ON public.lesson_comments
    FOR EACH ROW EXECUTE FUNCTION public.lesson_comments_parent_check();

-- ---------------------------------------------------------------------
-- 4) audit_trigger on lesson_comments (MED-8 inventory; progress and
--    notifications remain excluded). No set_updated_at: the table has no
--    updated_at column.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_trigger ON public.lesson_comments;
CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.lesson_comments
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ---------------------------------------------------------------------
-- 5) RLS policies (named style of 0009/0025/0028/0029). Students read
--    visible rows only when they can access the lesson (or their own);
--    writes to own rows; staff read everything and moderate.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_comments_select_gated ON public.lesson_comments;
CREATE POLICY lesson_comments_select_gated ON public.lesson_comments
    FOR SELECT
    USING (
        (
            public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
            OR author_id = auth.uid()
            OR public.can_access_lesson(lesson_id)
        )
        AND (
            status = 'visible'
            OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
            OR author_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS lesson_comments_insert_gated ON public.lesson_comments;
CREATE POLICY lesson_comments_insert_gated ON public.lesson_comments
    FOR INSERT
    WITH CHECK (
        public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
        OR public.can_access_lesson(lesson_id)
    );

DROP POLICY IF EXISTS lesson_comments_update_own_or_staff ON public.lesson_comments;
CREATE POLICY lesson_comments_update_own_or_staff ON public.lesson_comments
    FOR UPDATE
    USING (author_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    WITH CHECK (author_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

DROP POLICY IF EXISTS lesson_comments_delete_own_or_staff ON public.lesson_comments;
CREATE POLICY lesson_comments_delete_own_or_staff ON public.lesson_comments
    FOR DELETE
    USING (author_id = auth.uid() OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- ---------------------------------------------------------------------
-- 6) add_lesson_comment: SECURITY DEFINER student/staff writer.
--    Validates access + body + parent, inserts, then notifies:
--      - comment_reply -> every supervising staff member (moderation
--        visibility for every new comment/reply; dedup scoped per user).
--      - lesson_comment -> the parent comment's author when a reply is
--        posted to their comment (not self).
--    The audit_trigger captures lesson_comments.insert automatically.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_lesson_comment(p_lesson_id uuid, p_body text, p_parent_id uuid DEFAULT NULL)
RETURNS public.lesson_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid     uuid := auth.uid();
    v_comment public.lesson_comments%ROWTYPE;
    v_lesson  text;
    v_parent  public.lesson_comments%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
            OR public.can_access_lesson(p_lesson_id)) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    IF length(btrim(COALESCE(p_body, ''))) = 0
       OR length(btrim(COALESCE(p_body, ''))) > 1000 THEN
        RAISE EXCEPTION 'invalid_body';
    END IF;

    IF p_parent_id IS NOT NULL THEN
        SELECT * INTO v_parent
        FROM public.lesson_comments
        WHERE id = p_parent_id;
        IF v_parent.id IS NULL OR v_parent.status <> 'visible'
           OR v_parent.lesson_id <> p_lesson_id THEN
            RAISE EXCEPTION 'invalid_parent';
        END IF;
    END IF;

    SELECT title INTO v_lesson FROM public.lessons WHERE id = p_lesson_id;

    INSERT INTO public.lesson_comments (lesson_id, author_id, parent_id, body)
    VALUES (p_lesson_id, v_uid, p_parent_id, btrim(p_body))
    RETURNING * INTO v_comment;

    -- staff moderation visibility (one notification per recipient)
    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT u.id, 'comment_reply', 'تعليق جديد على الدرس', v_lesson,
           'comment_reply:' || u.id || ':' || v_comment.id, 'lesson_comments', v_comment.id
    FROM public.profiles u
    WHERE u.role IN ('admin', 'mr_walid', 'teacher')
      AND u.status = 'active' AND u.deleted_at IS NULL
      AND u.id <> v_uid
    ON CONFLICT (dedup_key) DO NOTHING;

    -- reply to your comment (skip self)
    IF v_parent.id IS NOT NULL AND v_parent.author_id <> v_uid THEN
        INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
        VALUES (v_parent.author_id, 'lesson_comment', 'تم الرد على تعليقك', v_lesson,
                'lesson_comment:' || v_comment.id, 'lesson_comments', v_comment.id)
        ON CONFLICT (dedup_key) DO NOTHING;
    END IF;

    RETURN v_comment;
END $$;

-- ---------------------------------------------------------------------
-- 7) delete_lesson_comment: hard delete of own comment, or any comment
--    by staff (moderation). audit_trigger captures the DELETE.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_lesson_comment(p_comment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row public.lesson_comments%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT * INTO v_row FROM public.lesson_comments WHERE id = p_comment_id;
    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'comment_not_found';
    END IF;

    IF v_row.author_id <> auth.uid()
       AND NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    DELETE FROM public.lesson_comments WHERE id = p_comment_id;
END $$;

-- ---------------------------------------------------------------------
-- 8) list_lesson_comments: access-gated reader. Staff see every status
--    (moderation); students see visible rows only. Replies are returned
--    as flat rows; the client groups by parent_id.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_lesson_comments(p_lesson_id uuid)
RETURNS TABLE (
    id          uuid,
    lesson_id   uuid,
    author_id   uuid,
    author_name text,
    parent_id   uuid,
    body        text,
    status      text,
    created_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
            OR public.can_access_lesson(p_lesson_id)) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    RETURN QUERY
    SELECT c.id, c.lesson_id, c.author_id, COALESCE(p.full_name, ''),
           c.parent_id, c.body, c.status, c.created_at
    FROM public.lesson_comments c
    JOIN public.lessons l ON l.id = c.lesson_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
    WHERE c.lesson_id = p_lesson_id
      AND (c.status = 'visible'
           OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher())
    ORDER BY c.created_at, c.id;
END $$;

COMMENT ON FUNCTION public.add_lesson_comment(uuid, text, uuid) IS 'Student/staff comment writer: access-gated, body-validated, parent must be a visible comment of the same lesson; notifies staff (comment_reply) and the parent author on replies (lesson_comment).';
COMMENT ON FUNCTION public.delete_lesson_comment(uuid) IS 'Deletes the caller''s own comment, or any comment when staff (moderation).';
COMMENT ON FUNCTION public.list_lesson_comments(uuid) IS 'Access-gated comment list: students see visible rows, staff see all statuses (incl. removed) for moderation.';

-- ---------------------------------------------------------------------
-- 9) Grants (SECURITY.md 8.2 pattern): every new function is revoked from
--    PUBLIC and granted to authenticated. No anon surface is added.
--    lesson_comments_parent_check is internal (no client grant).
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.add_lesson_comment(uuid, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_lesson_comment(uuid, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_lesson_comment(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_lesson_comment(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_lesson_comments(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_lesson_comments(uuid) TO authenticated;
