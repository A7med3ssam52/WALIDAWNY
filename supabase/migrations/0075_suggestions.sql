-- =====================================================================
-- 0075_suggestions
-- Phase: Suggestions inbox | "مقترحات التحديث القادم"
-- Students submit issues/ideas (kind + required title + body 10..1000 +
-- optional single compressed image); admin-only inbox with full status
-- workflow, open/close kill-switch + banner message in app_settings,
-- and a student notification on every status change.
--
-- Append-only migration: nothing in 0001..0074 is modified (CREATE OR
-- REPLACE of get_public_settings only widens its key whitelist).
-- Access: writes via SECURITY DEFINER RPCs; RLS keeps direct DML to
-- own rows (students: insert own + select own, no update/delete) or
-- admin rows (staff reads NOTHING: teacher/mr_walid are excluded by
-- design - admin-only inbox).
-- Image flow mirrors the 0036/0041 boards pattern:
--   submit_suggestion -> client uploads {uid}/{suggestion_id}.jpg to the
--   private `suggestion-images` bucket (row-backed INSERT policy) ->
--   attach_suggestion_image validates ownership + Storage bytes exist
--   (0041 M2 posture: no bytes, no attach).
-- Test impact (updated alongside): 01_schema (audit_trigger 15->16,
-- buckets 3->4), 02_roles (get_public_settings gains 2 keys),
-- 05_grants (authenticated 84->90 + anon negatives), 08_security
-- (storage.objects lock 6->9 + anchors), new suite 15_suggestions.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) notification_type: suggestion_status (ADD VALUE only, idempotent;
--    only referenced at runtime inside function bodies - 0030 pattern).
-- ---------------------------------------------------------------------
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'suggestion_status';

-- ---------------------------------------------------------------------
-- 2) platform_suggestions table.
--    No updated_at column (status changes are tracked via notifications
--    + audit_logs), so set_updated_at is NOT attached; the table joins
--    the audit_trigger inventory (MED-8).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_suggestions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('issue', 'suggestion', 'other')),
    title      text NOT NULL CHECK (length(btrim(title)) > 0 AND length(btrim(title)) <= 100),
    body       text NOT NULL CHECK (length(btrim(body)) >= 10 AND length(btrim(body)) <= 1000),
    image_path text CHECK (
        image_path IS NULL
        OR image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
    ),
    status     text NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'reviewed', 'planned', 'done', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_suggestions_student
    ON public.platform_suggestions (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_suggestions_status
    ON public.platform_suggestions (status, created_at DESC);

ALTER TABLE public.platform_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_suggestions FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.platform_suggestions IS
'Student suggestions/issues inbox for the next platform update. Students insert + read own rows only (display-only history); admin reads/updates/deletes everything. Images live in the private suggestion-images bucket.';

-- ---------------------------------------------------------------------
-- 3) audit_trigger on platform_suggestions (MED-8 inventory grows
--    15 -> 16). No set_updated_at: the table has no updated_at column.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_trigger ON public.platform_suggestions;
CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.platform_suggestions
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ---------------------------------------------------------------------
-- 4) RLS policies (named style of 0009/0030). Students: SELECT own +
--    INSERT own (student_id forced to auth.uid); NO student UPDATE or
--    DELETE (history is display-only). Admin: full access. Staff
--    (teacher/mr_walid) get nothing - admin-only inbox by design.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS platform_suggestions_select_own_or_admin ON public.platform_suggestions;
CREATE POLICY platform_suggestions_select_own_or_admin ON public.platform_suggestions
    FOR SELECT
    USING (student_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS platform_suggestions_insert_own ON public.platform_suggestions;
CREATE POLICY platform_suggestions_insert_own ON public.platform_suggestions
    FOR INSERT
    WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS platform_suggestions_update_admin ON public.platform_suggestions;
CREATE POLICY platform_suggestions_update_admin ON public.platform_suggestions
    FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS platform_suggestions_delete_admin ON public.platform_suggestions;
CREATE POLICY platform_suggestions_delete_admin ON public.platform_suggestions
    FOR DELETE
    USING (public.is_admin());

-- ---------------------------------------------------------------------
-- 5) app_settings seeds (idempotent): kill-switch + admin-editable
--    banner message. Read by every student via get_public_settings
--    (section 8); written by admin via set_app_setting (0007, admin
--    may write any key - no new RPC needed).
-- ---------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, description)
VALUES
    ('suggestions_open', 'true',
     'Kill-switch for the suggestions inbox: true = students may submit, false = form replaced by suggestions_closed_message'),
    ('suggestions_banner_message',
     '"بنجهز التحديث القادم للمنصة — شاركنا المشاكل اللي بتقابلك أو أي فكرة جديدة، وهنراجع كل المشاركات قبل الإطلاق"',
     'Admin-editable banner/call-to-action text shown to students above the suggestions form'),
    ('suggestions_closed_message',
     '"انتهت فترة جمع المقترحات لهذا التحديث — شكرا لكل اللي شارك. تابع الإعلانات لموعد الإطلاق"',
     'Message shown to students instead of the form while suggestions_open is false')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 6) get_public_settings: widen the anon-safe whitelist with the two
--    student-facing suggestions keys (harmless booleans/text).
--    Grants preserved (CREATE OR REPLACE keeps 0010 anon+authenticated).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_object_agg(s.key, s.value)
    FROM public.app_settings s
    WHERE s.key IN ('whatsapp_number', 'whatsapp_default_message', 'platform_name',
                    'suggestions_open', 'suggestions_banner_message', 'suggestions_closed_message');
$$;

COMMENT ON FUNCTION public.get_public_settings() IS
'Anon-safe settings surface; returns only whatsapp_number, whatsapp_default_message, platform_name + the student-facing suggestions keys (suggestions_open, suggestions_banner_message, suggestions_closed_message).';

-- ---------------------------------------------------------------------
-- 7) submit_suggestion: student-only writer (is_student closes
--    disabled/deleted accounts instantly). Honors the kill-switch.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_suggestion(p_kind text, p_title text, p_body text)
RETURNS public.platform_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid   uuid := auth.uid();
    v_open  text;
    v_title text;
    v_body  text;
    v_row   public.platform_suggestions%ROWTYPE;
BEGIN
    IF v_uid IS NULL OR NOT public.is_student() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT COALESCE((SELECT s.value::text FROM public.app_settings s WHERE s.key = 'suggestions_open'), 'true')
      INTO v_open;
    IF v_open <> 'true' THEN
        RAISE EXCEPTION 'suggestions_closed';
    END IF;

    IF p_kind NOT IN ('issue', 'suggestion', 'other') THEN
        RAISE EXCEPTION 'invalid_kind';
    END IF;

    v_title := btrim(COALESCE(p_title, ''));
    IF length(v_title) = 0 OR length(v_title) > 100 THEN
        RAISE EXCEPTION 'invalid_title';
    END IF;

    v_body := btrim(COALESCE(p_body, ''));
    IF length(v_body) < 10 OR length(v_body) > 1000 THEN
        RAISE EXCEPTION 'invalid_body';
    END IF;

    INSERT INTO public.platform_suggestions (student_id, kind, title, body)
    VALUES (v_uid, p_kind, v_title, v_body)
    RETURNING * INTO v_row;

    RETURN v_row;
END $$;

COMMENT ON FUNCTION public.submit_suggestion(text, text, text) IS
'Student suggestion writer: is_student-gated, kill-switch-gated (suggestions_closed), kind/title/body validated (title required 1..100, body 10..1000).';

-- ---------------------------------------------------------------------
-- 8) attach_suggestion_image: binds an uploaded Storage object to the
--    caller''s own suggestion (0041 M2 posture: the object must exist).
--    Expected path: {student_uuid}/{suggestion_uuid}.{jpg|jpeg|png|webp}.
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
    v_ext text;
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

    v_ext := lower(substring(COALESCE(p_path, '') from '\.([A-Za-z0-9]+)$'));
    IF v_ext NOT IN ('jpg', 'jpeg', 'png', 'webp') THEN
        RAISE EXCEPTION 'invalid_image';
    END IF;

    IF p_path <> v_uid::text || '/' || v_row.id::text || '.' || v_ext THEN
        RAISE EXCEPTION 'invalid_image';
    END IF;

    -- M2 (0041): no Storage object -> the upload never happened.
    IF NOT EXISTS (
        SELECT 1 FROM storage.objects so
        WHERE so.bucket_id = 'suggestion-images'
          AND so.name = p_path
    ) THEN
        RAISE EXCEPTION 'suggestion_image_missing';
    END IF;

    UPDATE public.platform_suggestions SET image_path = p_path WHERE id = v_row.id;
END $$;

COMMENT ON FUNCTION public.attach_suggestion_image(uuid, text) IS
'Binds a Storage object to the caller''s own suggestion. Path must be {uid}/{suggestion_id}.{jpg|jpeg|png|webp} and the object must exist (suggestion_image_missing otherwise).';

-- ---------------------------------------------------------------------
-- 9) list_my_suggestions: own display-only history, newest first.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_suggestions()
RETURNS SETOF public.platform_suggestions
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_student() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    RETURN QUERY
    SELECT s.* FROM public.platform_suggestions s
    WHERE s.student_id = auth.uid()
    ORDER BY s.created_at DESC, s.id DESC;
END $$;

COMMENT ON FUNCTION public.list_my_suggestions() IS
'Own suggestions history for the student inbox page (display-only; no edit/delete RPC exists by design).';

-- ---------------------------------------------------------------------
-- 10) list_suggestions: admin-only inbox reader with kind/status
--     filters + student identity join (name/phone/grade).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_suggestions(
    p_kind text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id           uuid,
    student_id   uuid,
    kind         text,
    title        text,
    body         text,
    image_path   text,
    status       text,
    created_at   timestamptz,
    student_name text,
    student_phone text,
    grade_name   text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_kind IS NOT NULL AND p_kind NOT IN ('issue', 'suggestion', 'other') THEN
        RAISE EXCEPTION 'invalid_kind';
    END IF;

    IF p_status IS NOT NULL AND p_status NOT IN ('new', 'reviewed', 'planned', 'done', 'rejected') THEN
        RAISE EXCEPTION 'invalid_status';
    END IF;

    RETURN QUERY
    SELECT s.id, s.student_id, s.kind, s.title, s.body, s.image_path, s.status, s.created_at,
           COALESCE(p.full_name, ''), COALESCE(p.phone, ''), g.name
    FROM public.platform_suggestions s
    LEFT JOIN public.profiles p ON p.id = s.student_id
    LEFT JOIN public.grades g ON g.id = p.grade_id
    WHERE (p_kind IS NULL OR s.kind = p_kind)
      AND (p_status IS NULL OR s.status = p_status)
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END $$;

COMMENT ON FUNCTION public.list_suggestions(text, text, integer, integer) IS
'Admin-only suggestions inbox: kind/status filters, newest first, with student name/phone/grade. teacher/mr_walid are denied (admin-only inbox).';

-- ---------------------------------------------------------------------
-- 11) update_suggestion_status: admin-only workflow transition +
--     student notification (suggestion_status, dedup per id+status).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_suggestion_status(p_suggestion_id uuid, p_status text)
RETURNS public.platform_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row      public.platform_suggestions%ROWTYPE;
    v_old      text;
    v_title    text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    IF p_status NOT IN ('new', 'reviewed', 'planned', 'done', 'rejected') THEN
        RAISE EXCEPTION 'invalid_status';
    END IF;

    SELECT * INTO v_row FROM public.platform_suggestions WHERE id = p_suggestion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'suggestion_not_found';
    END IF;
    v_old := v_row.status;

    UPDATE public.platform_suggestions SET status = p_status WHERE id = p_suggestion_id
    RETURNING * INTO v_row;

    IF v_old IS DISTINCT FROM p_status THEN
        v_title := CASE p_status
            WHEN 'reviewed' THEN 'مشاركتك قيد المراجعة'
            WHEN 'planned'  THEN 'مقترحك اتخطط للتحديث القادم'
            WHEN 'done'     THEN 'مقترحك اتنفذ في التحديث'
            WHEN 'rejected' THEN 'تحديث بخصوص مشاركتك'
            ELSE 'تحديث على حالة مشاركتك'
        END;

        INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
        VALUES (v_row.student_id, 'suggestion_status', v_title, v_row.title,
                'suggestion_status:' || v_row.id::text || ':' || p_status, 'suggestion', v_row.id)
        ON CONFLICT (dedup_key) DO NOTHING;

        PERFORM public.audit_log(
            'suggestion.status', 'platform_suggestions', v_row.id,
            jsonb_build_object('old', v_old, 'new', p_status)
        );
    END IF;

    RETURN v_row;
END $$;

COMMENT ON FUNCTION public.update_suggestion_status(uuid, text) IS
'Admin-only status transition (new/reviewed/planned/done/rejected). Notifies the student once per (id,status) and audit-logs the transition.';

-- ---------------------------------------------------------------------
-- 12) delete_suggestion: admin-only hard delete + Storage cleanup.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_suggestion(p_suggestion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_path text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    SELECT image_path INTO v_path FROM public.platform_suggestions WHERE id = p_suggestion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'suggestion_not_found';
    END IF;

    DELETE FROM public.platform_suggestions WHERE id = p_suggestion_id;

    IF v_path IS NOT NULL THEN
        BEGIN
            DELETE FROM storage.objects
            WHERE bucket_id = 'suggestion-images' AND name = v_path;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    PERFORM public.audit_log('suggestion.delete', 'platform_suggestions', p_suggestion_id, NULL);
END $$;

COMMENT ON FUNCTION public.delete_suggestion(uuid) IS
'Admin-only hard delete of a suggestion plus its Storage image (best-effort object removal).';

-- ---------------------------------------------------------------------
-- 13) Grants (SECURITY.md 8.2 pattern): every new function is revoked
--     from PUBLIC and granted to authenticated. No anon surface added.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.submit_suggestion(text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_suggestion(text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.attach_suggestion_image(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.attach_suggestion_image(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_my_suggestions() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_my_suggestions() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_suggestions(text, text, integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_suggestions(text, text, integer, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_suggestion_status(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_suggestion_status(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_suggestion(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_suggestion(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 14) Storage: private `suggestion-images` bucket + row-backed
--     policies (0036/0041 pattern). INSERT binds the path to the
--     caller''s own image-less suggestion row; SELECT covers owner +
--     admin (signed-URL reads from both UIs); DELETE is admin-only.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('suggestion-images', 'suggestion-images', false)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    IF to_regclass('storage.objects') IS NOT NULL THEN
        DROP POLICY IF EXISTS suggestion_images_insert_own ON storage.objects;
        CREATE POLICY suggestion_images_insert_own ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'suggestion-images'
                AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
                AND split_part(name, '/', 1) = auth.uid()::text
                AND EXISTS (
                    SELECT 1 FROM public.platform_suggestions s
                    WHERE s.id::text = split_part(split_part(name, '/', 2), '.', 1)
                      AND s.student_id = auth.uid()
                      AND s.image_path IS NULL
                )
            );

        DROP POLICY IF EXISTS suggestion_images_select_owner_admin ON storage.objects;
        CREATE POLICY suggestion_images_select_owner_admin ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'suggestion-images'
                AND (public.is_admin() OR split_part(name, '/', 1) = auth.uid()::text)
                AND EXISTS (
                    SELECT 1 FROM public.platform_suggestions s
                    WHERE s.image_path = name
                )
            );

        DROP POLICY IF EXISTS suggestion_images_delete_admin ON storage.objects;
        CREATE POLICY suggestion_images_delete_admin ON storage.objects
            FOR DELETE TO authenticated
            USING (
                bucket_id = 'suggestion-images'
                AND public.is_admin()
                AND EXISTS (
                    SELECT 1 FROM public.platform_suggestions s
                    WHERE s.image_path = name
                )
            );
    END IF;
END$$;

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
-- (created inline in section 2; listed here for the inventory record)
-- idx_platform_suggestions_student (student_id, created_at DESC)
-- idx_platform_suggestions_status (status, created_at DESC)
