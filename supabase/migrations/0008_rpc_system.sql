-- =====================================================================
-- 0008_rpc_system
-- Phase 1 | Supabase Foundation | Database
-- System functions (internal - NO client grants, MED-6):
-- notify_new_content, expire_subscriptions, set_video_status,
-- recheck_video_states. Reference: DATABASE.md section 6.5.
-- =====================================================================

-- ---------------------------------------------------------------------
-- notify_new_content(p_lesson_id)
-- Deduped fan-out (dedup_key new_content:{lesson_id}:{student_id}, A28);
-- targets ACTIVE subscribers of the lesson's grade only (LOW-19).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_new_content(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_grade uuid;
    v_published boolean;
BEGIN
    SELECT u.grade_id, l.status = 'published'
    INTO v_grade, v_published
    FROM public.lessons l
    JOIN public.units u ON u.id = l.unit_id
    WHERE l.id = p_lesson_id;

    IF NOT FOUND OR NOT v_published THEN
        RETURN;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
    SELECT p.id, 'new_content', 'محتوى جديد', NULL,
           'new_content:' || p_lesson_id || ':' || p.id,
           'lesson', p_lesson_id
    FROM public.profiles p
    WHERE p.role = 'student'
      AND p.status = 'active'
      AND p.deleted_at IS NULL
      AND p.grade_id = v_grade
      AND EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE s.student_id = p.id
            AND s.status = 'active'
            AND s.expires_at > now()
      )
    ON CONFLICT (dedup_key) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------
-- expire_subscriptions()
-- Idempotent (A7): flips expired labels, emits once-only expiring and
-- expired notifications (dedup ON CONFLICT), audits. Live authority is
-- expires_at > now() regardless of label (A8). Never invoked by
-- SELECT-side triggers (MED-4/R4).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub record;
    v_warning_days int;
BEGIN
    v_warning_days := COALESCE(
        (SELECT (value #>> '{}')::int FROM public.app_settings WHERE key = 'expiry_warning_days'),
        7
    );

    -- 1) Flip expired subscriptions; emit once-only expired notification.
    FOR v_sub IN
        SELECT id, student_id FROM public.subscriptions
        WHERE status = 'active' AND expires_at <= now()
        FOR UPDATE
    LOOP
        UPDATE public.subscriptions SET status = 'expired' WHERE id = v_sub.id;

        INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
        VALUES (v_sub.student_id, 'subscription_expired', 'انتهى اشتراكك', NULL,
                'sub_expired:' || v_sub.id, 'subscription', v_sub.id)
        ON CONFLICT (dedup_key) DO NOTHING;

        PERFORM public.audit_log('subscription.expire', 'subscription', v_sub.id);
    END LOOP;

    -- 2) Emit the 7-day warning for subscriptions inside the window
    --    (once-only via UNIQUE(dedup_key)). Only ACTIVE, non-deleted
    --    students are warned (LOW: disabled/soft-deleted students are
    --    skipped here - the expiry flip above still applies to all).
    FOR v_sub IN
        SELECT s.id, s.student_id
        FROM public.subscriptions s
        JOIN public.profiles p ON p.id = s.student_id
        WHERE s.status = 'active'
          AND s.expires_at > now()
          AND s.expires_at <= now() + (v_warning_days || ' days')::interval
          AND p.status = 'active'
          AND p.deleted_at IS NULL
    LOOP
        INSERT INTO public.notifications (user_id, type, title, body, dedup_key, entity_type, entity_id)
        VALUES (v_sub.student_id, 'subscription_expiring', 'اشتراكك يقترب من الانتهاء', NULL,
                'sub_expiring:' || v_sub.id, 'subscription', v_sub.id)
        ON CONFLICT (dedup_key) DO NOTHING;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- set_video_status(p_video_id, p_new_status, ...)
-- Internal - NO client grants. Validates legal transitions (per
-- ARCHITECTURE.md): pending_upload -> uploading|failed,
-- uploading -> processing|failed, processing -> ready|failed,
-- ready -> replaced, failed -> pending_upload|uploading, replaced
-- terminal. Performs is_primary promotion/demotion (MED-10) and the
-- replacement progress reset (A11).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_video_status(
    p_video_id uuid,
    p_new_status public.video_status,
    p_duration_seconds integer DEFAULT NULL,
    p_thumbnail_url text DEFAULT NULL,
    p_error_message text DEFAULT NULL,
    p_replacement_video_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old public.video_status;
    v_lesson uuid;
    v_legal boolean;
BEGIN
    SELECT status, lesson_id INTO v_old, v_lesson
    FROM public.lesson_videos WHERE id = p_video_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'video_not_found';
    END IF;

    v_legal := (v_old = 'pending_upload' AND p_new_status IN ('uploading', 'failed'))
            OR (v_old = 'uploading' AND p_new_status IN ('processing', 'failed'))
            OR (v_old = 'processing' AND p_new_status IN ('ready', 'failed'))
            OR (v_old = 'ready' AND p_new_status = 'replaced')
            OR (v_old = 'failed' AND p_new_status IN ('pending_upload', 'uploading'));

    IF NOT v_legal THEN
        RAISE EXCEPTION 'invalid_video_transition'
            USING DETAIL = v_old || ' -> ' || p_new_status;
    END IF;

    UPDATE public.lesson_videos
    SET status = p_new_status,
        duration_seconds = COALESCE(p_duration_seconds, duration_seconds),
        thumbnail_url = COALESCE(p_thumbnail_url, thumbnail_url),
        error_message = CASE WHEN p_new_status = 'failed' THEN COALESCE(p_error_message, error_message)
                             ELSE NULL END
    WHERE id = p_video_id;

    -- Promotion (MED-10): a video becoming ready is promoted to primary
    -- when the lesson has no non-deleted primary yet.
    IF p_new_status = 'ready' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.lesson_videos
            WHERE lesson_id = v_lesson AND is_primary AND deleted_at IS NULL
        ) THEN
            UPDATE public.lesson_videos SET is_primary = true WHERE id = p_video_id;
        END IF;
    END IF;

    -- Demotion + replacement progress reset (A11).
    -- HIGH-2: the replacement video must belong to the SAME lesson as the
    -- replaced one (raise otherwise), and progress rows are re-pointed
    -- only when they belong to this lesson - never across lessons.
    -- MEDIUM-2: a replacement that is ALREADY ready is promoted to
    -- primary in the same transaction (demote old primary first, then
    -- promote - the partial unique (lesson_id) WHERE is_primary forbids
    -- two primaries at once). A still-processing replacement leaves the
    -- lesson temporarily without a primary; the regular 'ready' promotion
    -- branch above promotes it when the Phase 5/EF webhook later flips it.
    IF p_new_status = 'replaced' THEN
        IF p_replacement_video_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.lesson_videos
            WHERE id = p_replacement_video_id
              AND lesson_id = v_lesson
              AND deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'replacement_video_mismatch';
        END IF;

        UPDATE public.lesson_videos SET is_primary = false WHERE id = p_video_id;

        IF p_replacement_video_id IS NOT NULL THEN

            -- MEDIUM-2: promote the replacement only when it is already
            -- ready AND the lesson currently has no primary (i.e. the
            -- replaced video WAS the primary). Replacing a non-primary
            -- video must never steal the primary slot.
            IF (SELECT status FROM public.lesson_videos WHERE id = p_replacement_video_id) = 'ready'
               AND NOT EXISTS (
                   SELECT 1 FROM public.lesson_videos
                   WHERE lesson_id = v_lesson AND is_primary AND deleted_at IS NULL
               ) THEN
                UPDATE public.lesson_videos SET is_primary = true WHERE id = p_replacement_video_id;
            END IF;

            UPDATE public.progress
            SET video_id = p_replacement_video_id
            WHERE video_id = p_video_id
              AND lesson_id = v_lesson;
        ELSE
            UPDATE public.progress
            SET position_seconds = 0,
                percent_completed = 0,
                is_completed = false,
                video_id = NULL
            WHERE video_id = p_video_id
              AND lesson_id = v_lesson;
        END IF;
    END IF;

    PERFORM public.audit_log('video.status_change', 'lesson_video', p_video_id,
        jsonb_build_object('old_status', v_old, 'new_status', p_new_status));
END $$;

-- ---------------------------------------------------------------------
-- recheck_video_states()
-- Phase 5 stub: will reconcile stuck Bunny videos (e.g. processing too
-- long). Exists so the scheduling chain and grant matrix are complete.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recheck_video_states()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NULL;
END $$;

-- ---------------------------------------------------------------------
-- notify_new_content trigger (DATABASE.md section 7)
-- AFTER UPDATE on lessons when status becomes 'published'. The fan-out
-- is deduped (new_content:{lesson_id}:{student_id}) so double-firing
-- with publish_lesson() is harmless. publish_lesson() calls the function
-- explicitly so audit ordering is deterministic; the trigger is the
-- documented safety net for any other status flip path.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_new_content_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.notify_new_content(NEW.id);
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_new_content ON public.lessons;
CREATE TRIGGER notify_new_content
    AFTER UPDATE OF status ON public.lessons
    FOR EACH ROW
    WHEN (NEW.status = 'published' AND OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.notify_new_content_trigger();
