-- =====================================================================
-- 12_videos.sql — Phase 5 (0042) multi-video + YouTube assertions
-- ---------------------------------------------------------------------
-- The multi-video lesson feature: `source`/`youtube_video_id` columns +
-- the cross-column CHECK + the global youtube unique index, the student
-- RLS gate now showing EVERY ready non-deleted video (is_primary
-- removed), the removed one-pending-upload-per-lesson rule, and the two
-- new staff RPCs add_youtube_video / delete_lesson_video. Covers:
--   * schema shape (columns, CHECK, unique index, nullable bunny id)
--   * youtube_video_id_from_url extraction matrix (all URL shapes +
--     bare id + rejections)
--   * RLS matrix: student A sees all ready non-deleted videos (incl.
--     non-primary) of accessible lessons; processing/deleted/draft-lesson
--     rows stay hidden; staff sees everything
--   * add_youtube_video: happy paths (first video primary, subsequent
--     non-primary, title default/trim/truncate), guards (student
--     negative, invalid url, duplicate incl. soft-deleted id,
--     lesson_not_found, lesson_deleted), audit
--   * delete_lesson_video: soft-delete non-primary, primary promotion to
--     the oldest ready sibling, sole-primary delete leaves no primary,
--     wrong_lesson, video_not_found (missing + already-deleted), student
--     negative, audit
--   * create_video_upload_record: TWO pending uploads on one lesson now
--     succeed (0042 removed the orphan rule)
-- Fixtures use aa000000-... ids (lesson 4000...008 = TEST-L8 published
-- grade-1 unit; 4000...009 = TEST-L9 trial; 4000...002 = TEST-L2 draft
-- for wrong_lesson; 4000...001 = TEST-L1 holds v1/v2/v3 from the 02/04
-- fixtures, untouched here) and are removed at the end.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Section 1: schema shape
-- ---------------------------------------------------------------------
SELECT tests.assert(
    (SELECT count(*) = 2 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'lesson_videos'
       AND column_name IN ('source', 'youtube_video_id')),
    'v12: source and youtube_video_id columns exist (0042)');

SELECT tests.assert(
    (SELECT data_type = 'text' AND is_nullable = 'YES'
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'lesson_videos'
       AND column_name = 'youtube_video_id'),
    'v12: youtube_video_id is nullable text');

SELECT tests.assert(
    (SELECT is_nullable = 'YES'
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'lesson_videos'
       AND column_name = 'bunny_video_id'),
    'v12: bunny_video_id NOT NULL dropped (0042)');

SELECT tests.assert(
    (SELECT column_default = '''bunny''::text'
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'lesson_videos'
       AND column_name = 'source'),
    'v12: source defaults to bunny');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'lesson_videos'
       AND indexname = 'uq_lesson_videos_youtube'
       AND indexdef LIKE '%youtube_video_id%' AND indexdef LIKE '%UNIQUE%'
       AND indexdef LIKE '%WHERE%youtube_video_id IS NOT NULL%'),
    'v12: partial unique uq_lesson_videos_youtube on youtube_video_id');

SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'lesson_videos' AND c.contype = 'c'
       AND c.conname = 'lesson_videos_source_check'
       AND pg_get_constraintdef(c.oid) LIKE '%source = ''bunny''%'
       AND pg_get_constraintdef(c.oid) LIKE '%source = ''youtube''%'
       AND pg_get_constraintdef(c.oid) LIKE '%bunny_video_id%'
       AND pg_get_constraintdef(c.oid) LIKE '%youtube_video_id%'),
    'v12: lesson_videos_source_check enforces the exact source/asset pairing');

-- existing bunny rows are untouched and still valid under the CHECK
SELECT tests.assert(
    (SELECT count(*) = 3 FROM public.lesson_videos
     WHERE source = 'bunny' AND bunny_video_id IS NOT NULL AND youtube_video_id IS NULL),
    'v12: the 3 legacy bunny rows keep source=bunny and their data');

-- ---------------------------------------------------------------------
-- Section 2: youtube_video_id_from_url extraction matrix
-- ---------------------------------------------------------------------
SELECT tests.assert(public.youtube_video_id_from_url('https://youtu.be/dQw4w9WgXcQ') = 'dQw4w9WgXcQ', 'yt: youtu.be form');
SELECT tests.assert(public.youtube_video_id_from_url('youtu.be/dQw4w9WgXcQ?t=42') = 'dQw4w9WgXcQ', 'yt: youtu.be with query');
SELECT tests.assert(public.youtube_video_id_from_url('http://youtu.be/dQw4w9WgXcQ/') = 'dQw4w9WgXcQ', 'yt: http + trailing slash');
SELECT tests.assert(public.youtube_video_id_from_url('https://www.youtube.com/watch?v=dQw4w9WgXcQ') = 'dQw4w9WgXcQ', 'yt: watch?v form');
SELECT tests.assert(public.youtube_video_id_from_url('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10') = 'dQw4w9WgXcQ', 'yt: mobile watch form');
SELECT tests.assert(public.youtube_video_id_from_url('https://www.youtube.com/watch?x=1&v=dQw4w9WgXcQ&t=5') = 'dQw4w9WgXcQ', 'yt: watch with params before v');
SELECT tests.assert(public.youtube_video_id_from_url('https://youtube.com/embed/dQw4w9WgXcQ') = 'dQw4w9WgXcQ', 'yt: embed form');
SELECT tests.assert(public.youtube_video_id_from_url('https://www.youtube.com/shorts/dQw4w9WgXcQ') = 'dQw4w9WgXcQ', 'yt: shorts form');
SELECT tests.assert(public.youtube_video_id_from_url('dQw4w9WgXcQ') = 'dQw4w9WgXcQ', 'yt: bare 11-char id form');
SELECT tests.assert(public.youtube_video_id_from_url('https://youtu.be/xyz') IS NULL, 'yt: too-short youtu.be id rejected');
SELECT tests.assert(public.youtube_video_id_from_url('not-a-url') IS NULL, 'yt: garbage rejected');
SELECT tests.assert(public.youtube_video_id_from_url('') IS NULL, 'yt: empty rejected');
SELECT tests.assert(public.youtube_video_id_from_url('https://example.com/watch?v=dQw4w9WgXcQ') IS NULL, 'yt: non-youtube domain rejected');
SELECT tests.assert(public.youtube_video_id_from_url('https://www.youtube.com/watch?x=1') IS NULL, 'yt: watch without v param rejected');

-- ---------------------------------------------------------------------
-- Section 3: fixtures (inserted as the harness superuser; FORCE RLS
-- does not apply to the table owner). y3 is soft-deleted, y4 lives on
-- the draft lesson l2; y1 is older than y2 so the primary promotion
-- order is deterministic.
-- ---------------------------------------------------------------------
INSERT INTO public.lesson_videos (id, lesson_id, source, youtube_video_id, bunny_library_id, title, status, is_primary, sort_order, deleted_at, created_at)
VALUES ('aa000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000008', 'youtube', 'AAAAAAAAAAA', 'youtube', 'YT-FIX-1', 'ready', true,  1, NULL,  now() - interval '3 days'),
       ('aa000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000008', 'youtube', 'BBBBBBBBBBB', 'youtube', 'YT-FIX-2', 'ready', false, 2, NULL,  now() - interval '2 days'),
       ('aa000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000008', 'youtube', 'CCCCCCCCCCC', 'youtube', 'YT-FIX-3', 'ready', false, 3, now(), now() - interval '1 day'),
       ('aa000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', 'youtube', 'DDDDDDDDDDD', 'youtube', 'YT-FIX-4', 'ready', true,  1, NULL,  now());

-- ---------------------------------------------------------------------
-- Section 4: RLS matrix
-- ---------------------------------------------------------------------
-- A (owns u1 -> l1 + l8): sees EVERY ready non-deleted video of the
-- accessible lessons - l1's v1+v2 (v2 is NOT primary) + l8's y1+y2 = 4;
-- v3 (processing), y3 (soft-deleted) and y4 (draft lesson) hidden.
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_videos', 4,
    'rls: A sees all ready non-deleted videos of accessible lessons (0042)');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_videos WHERE id = ''50000000-0000-0000-0000-000000000002''',
    1, 'rls: A sees the ready NON-primary v2 (is_primary condition removed)');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_videos WHERE id = ''50000000-0000-0000-0000-000000000003''',
    0, 'rls: A does NOT see the processing v3');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_videos WHERE id = ''aa000000-0000-0000-0000-000000000003''',
    0, 'rls: A does NOT see the soft-deleted y3');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_videos WHERE id = ''aa000000-0000-0000-0000-000000000004''',
    0, 'rls: A sees nothing on the draft lesson l2');
RESET ROLE;
RESET "app.current_user_id";

-- staff sees everything (7 rows incl. processing + soft-deleted + l2)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_videos', 7,
    'rls: staff sees every video row');
RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Section 5: add_youtube_video
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;

-- (a) first video of a primary-less lesson (l9): primary + ready +
-- youtube shape + default title
SELECT tests.expect_rows(
    'SELECT public.add_youtube_video(''40000000-0000-0000-0000-000000000009'', ''https://youtu.be/dQw4w9WgXcQ'')',
    1, 'v12: add first youtube video on l9');
SELECT tests.assert(
    (SELECT source = 'youtube' AND status = 'ready' AND is_primary
            AND youtube_video_id = 'dQw4w9WgXcQ'
            AND bunny_video_id IS NULL AND bunny_library_id = 'youtube'
            AND title = 'فيديو يوتيوب' AND sort_order = 0 AND deleted_at IS NULL
     FROM public.lesson_videos WHERE youtube_video_id = 'dQw4w9WgXcQ'),
    'v12: first video row is ready+primary with youtube shape and default title');

-- (b) second video of the same lesson: never takes the primary slot
SELECT tests.expect_rows(
    'SELECT public.add_youtube_video(''40000000-0000-0000-0000-000000000009'', ''https://www.youtube.com/watch?v=dQw4w9WgXcR'')',
    1, 'v12: add second youtube video on l9 (watch?v form)');
SELECT tests.assert(
    (SELECT NOT is_primary FROM public.lesson_videos WHERE youtube_video_id = 'dQw4w9WgXcR'),
    'v12: second video stays non-primary (B9/MED-10)');

-- (c) a lesson with an existing primary also adds non-primary (l8)
SELECT tests.expect_rows(
    'SELECT public.add_youtube_video(''40000000-0000-0000-0000-000000000008'', ''https://youtube.com/embed/dQw4w9WgXcS'')',
    1, 'v12: add youtube video on l8 (embed form)');
SELECT tests.assert(
    (SELECT NOT is_primary AND status = 'ready'
     FROM public.lesson_videos WHERE youtube_video_id = 'dQw4w9WgXcS'),
    'v12: l8 add stays non-primary');

-- (d) title handling: trimmed; whitespace-only -> default; >255 truncated
SELECT tests.expect_rows(
    'SELECT public.add_youtube_video(''40000000-0000-0000-0000-000000000009'', ''https://www.youtube.com/shorts/dQw4w9WgXcT'', ''   شرح مهم  '')',
    1, 'v12: add with padded title');
SELECT tests.assert(
    (SELECT title = 'شرح مهم' FROM public.lesson_videos WHERE youtube_video_id = 'dQw4w9WgXcT'),
    'v12: title trimmed');
SELECT tests.expect_rows(
    'SELECT public.add_youtube_video(''40000000-0000-0000-0000-000000000009'', ''https://m.youtube.com/watch?v=dQw4w9WgXcU'', ''   '')',
    1, 'v12: add with blank title');
SELECT tests.assert(
    (SELECT title = 'فيديو يوتيوب' FROM public.lesson_videos WHERE youtube_video_id = 'dQw4w9WgXcU'),
    'v12: blank title falls back to the default');
SELECT tests.expect_rows(
    'SELECT public.add_youtube_video(''40000000-0000-0000-0000-000000000009'', ''dQw4w9WgXcV'', repeat(''x'', 300))',
    1, 'v12: add with a >255 char title (bare id form)');
SELECT tests.assert(
    (SELECT length(title) = 255 FROM public.lesson_videos WHERE youtube_video_id = 'dQw4w9WgXcV'),
    'v12: title truncated to 255 chars');

-- (e) guard matrix: student -> permission_denied; invalid url;
-- duplicate (live id AND soft-deleted id); lesson_not_found; lesson_deleted
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.add_youtube_video(''40000000-0000-0000-0000-000000000009'', ''https://youtu.be/dQw4w9WgXcX'')',
    'P0001', 'permission_denied');
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_error(
    'SELECT public.add_youtube_video(''40000000-0000-0000-0000-000000000009'', ''https://youtu.be/xyz'')',
    'P0001', 'invalid_youtube_url');
SELECT tests.expect_error(
    'SELECT public.add_youtube_video(''40000000-0000-0000-0000-000000000009'', ''not-a-url'')',
    'P0001', 'invalid_youtube_url');
SELECT tests.expect_error(
    'SELECT public.add_youtube_video(''40000000-0000-0000-0000-000000000009'', ''https://youtu.be/AAAAAAAAAAA'')',
    'P0001', 'youtube_video_duplicate');
SELECT tests.expect_error(
    'SELECT public.add_youtube_video(''40000000-0000-0000-0000-000000000009'', ''https://youtu.be/CCCCCCCCCCC'')',
    'P0001', 'youtube_video_duplicate');
SELECT tests.expect_error(
    'SELECT public.add_youtube_video(gen_random_uuid(), ''https://youtu.be/dQw4w9WgXcX'')',
    'P0001', 'lesson_not_found');
SELECT tests.expect_error(
    'SELECT public.add_youtube_video(''40000000-0000-0000-0000-000000000004'', ''https://youtu.be/dQw4w9WgXcX'')',
    'P0001', 'lesson_deleted');
SELECT tests.assert(
    (SELECT NOT EXISTS (SELECT 1 FROM public.lesson_videos WHERE youtube_video_id = 'dQw4w9WgXcX')),
    'v12: denied add calls mutated nothing');

-- ---------------------------------------------------------------------
-- Section 6: delete_lesson_video
-- ---------------------------------------------------------------------
-- (a) soft-delete a non-primary ready video (z3 on l8): no promotion,
-- the primary y1 stays; the row is soft-deleted
SELECT tests.expect_rows(
    'SELECT public.delete_lesson_video(''40000000-0000-0000-0000-000000000008'', (SELECT id FROM public.lesson_videos WHERE youtube_video_id = ''dQw4w9WgXcS''))',
    1, 'v12: delete non-primary z3 on l8');
SELECT tests.assert(
    (SELECT deleted_at IS NOT NULL AND NOT is_primary
     FROM public.lesson_videos WHERE youtube_video_id = 'dQw4w9WgXcS'),
    'v12: non-primary delete is a soft delete, no promotion');
SELECT tests.assert(
    (SELECT is_primary FROM public.lesson_videos WHERE id = 'aa000000-0000-0000-0000-000000000001'),
    'v12: l8 primary y1 untouched by non-primary delete');

-- (b) delete the PRIMARY (y1): the oldest ready non-deleted sibling
-- (y2, created_at -2 days; z3 was deleted in (a)) is promoted
SELECT tests.expect_rows(
    'SELECT public.delete_lesson_video(''40000000-0000-0000-0000-000000000008'', ''aa000000-0000-0000-0000-000000000001'')',
    1, 'v12: delete primary y1 on l8');
SELECT tests.assert(
    (SELECT deleted_at IS NOT NULL AND NOT is_primary
     FROM public.lesson_videos WHERE id = 'aa000000-0000-0000-0000-000000000001'),
    'v12: deleted primary is soft-deleted and demoted');
SELECT tests.assert(
    (SELECT is_primary FROM public.lesson_videos WHERE id = 'aa000000-0000-0000-0000-000000000002'),
    'v12: oldest ready sibling y2 promoted to primary');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.lesson_videos
     WHERE lesson_id = '40000000-0000-0000-0000-000000000008'
       AND is_primary AND deleted_at IS NULL),
    'v12: exactly one primary on l8 after promotion');

-- (c) deleting the sole primary (z1 on l9) leaves the lesson primary-less
-- when no ready sibling remains: clear the other ready rows first
-- (z3/z4/z5, then z2) so the z1 delete has nobody to promote
SELECT tests.expect_rows(
    'SELECT public.delete_lesson_video(''40000000-0000-0000-0000-000000000009'', (SELECT id FROM public.lesson_videos WHERE youtube_video_id = ''dQw4w9WgXcT''))',
    1, 'v12: delete non-primary z3 on l9');
SELECT tests.expect_rows(
    'SELECT public.delete_lesson_video(''40000000-0000-0000-0000-000000000009'', (SELECT id FROM public.lesson_videos WHERE youtube_video_id = ''dQw4w9WgXcU''))',
    1, 'v12: delete non-primary z4 on l9');
SELECT tests.expect_rows(
    'SELECT public.delete_lesson_video(''40000000-0000-0000-0000-000000000009'', (SELECT id FROM public.lesson_videos WHERE youtube_video_id = ''dQw4w9WgXcV''))',
    1, 'v12: delete non-primary z5 on l9');
SELECT tests.expect_rows(
    'SELECT public.delete_lesson_video(''40000000-0000-0000-0000-000000000009'', (SELECT id FROM public.lesson_videos WHERE youtube_video_id = ''dQw4w9WgXcR''))',
    1, 'v12: delete non-primary z2 on l9');
SELECT tests.expect_rows(
    'SELECT public.delete_lesson_video(''40000000-0000-0000-0000-000000000009'', (SELECT id FROM public.lesson_videos WHERE youtube_video_id = ''dQw4w9WgXcQ''))',
    1, 'v12: delete primary z1 on l9');
SELECT tests.assert(
    (SELECT count(*) = 0 FROM public.lesson_videos
     WHERE lesson_id = '40000000-0000-0000-0000-000000000009'
       AND is_primary AND deleted_at IS NULL),
    'v12: no ready sibling left -> l9 stays primary-less');

-- (d) guard matrix: wrong_lesson (y4 lives on l2), video_not_found for a
-- missing id and for an already soft-deleted row (y3), student denied
SELECT tests.expect_error(
    'SELECT public.delete_lesson_video(''40000000-0000-0000-0000-000000000001'', ''aa000000-0000-0000-0000-000000000004'')',
    'P0001', 'wrong_lesson');
SELECT tests.expect_error(
    'SELECT public.delete_lesson_video(''40000000-0000-0000-0000-000000000002'', gen_random_uuid())',
    'P0001', 'video_not_found');
SELECT tests.expect_error(
    'SELECT public.delete_lesson_video(''40000000-0000-0000-0000-000000000008'', ''aa000000-0000-0000-0000-000000000003'')',
    'P0001', 'video_not_found');
RESET ROLE;
RESET "app.current_user_id";
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.delete_lesson_video(''40000000-0000-0000-0000-000000000002'', ''aa000000-0000-0000-0000-000000000004'')',
    'P0001', 'permission_denied');
RESET ROLE;
RESET "app.current_user_id";
-- y4 is still live: a valid delete on l2 succeeds (wrong_lesson above
-- must not have mutated anything)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.delete_lesson_video(''40000000-0000-0000-0000-000000000002'', ''aa000000-0000-0000-0000-000000000004'')',
    1, 'v12: delete y4 on l2 (valid)');
RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Section 7: multi-upload - two pending uploads on one lesson (0042)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000009';
SET LOCAL ROLE mr_walid;
SELECT tests.expect_rows(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000009'', ''BV12-P1'', ''LIB-1'', ''T12-1'', ''create'', NULL)',
    1, 'v12: first pending upload on l9');
SELECT tests.expect_rows(
    'SELECT public.create_video_upload_record(''40000000-0000-0000-0000-000000000009'', ''BV12-P2'', ''LIB-1'', ''T12-2'', ''create'', NULL)',
    1, 'v12: second pending upload on l9 (orphan rule removed, 0042)');
SELECT tests.assert(
    (SELECT count(*) = 2 FROM public.lesson_videos
     WHERE lesson_id = '40000000-0000-0000-0000-000000000009'
       AND status = 'pending_upload' AND deleted_at IS NULL),
    'v12: two pending rows coexist on the same lesson (0042)');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM public.lesson_videos
     WHERE lesson_id = '40000000-0000-0000-0000-000000000009'
       AND status = 'pending_upload' AND is_primary),
    'v12: exactly the first pending row holds the primary slot (B9)');
RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Section 8: audit trail (admin-only rows - assert as superuser)
-- ---------------------------------------------------------------------
SELECT tests.assert(
    (SELECT count(*) >= 5 FROM public.audit_logs
     WHERE action = 'video.youtube_added' AND actor_id = '70000000-0000-0000-0000-000000000009'),
    'v12: youtube adds audited with the caller actor');
SELECT tests.assert(
    (SELECT EXISTS (SELECT 1 FROM public.audit_logs
      WHERE action = 'video.youtube_added'
        AND entity_type = 'lesson_video'
        AND (metadata->>'youtube_video_id') = 'dQw4w9WgXcQ'
        AND (metadata->>'is_primary')::boolean
        AND (metadata->>'lesson_id') = '40000000-0000-0000-0000-000000000009')),
    'v12: first-video add audited with primary metadata');
SELECT tests.assert(
    (SELECT count(*) >= 4 FROM public.audit_logs
     WHERE action = 'video.deleted' AND actor_id = '70000000-0000-0000-0000-000000000009'),
    'v12: deletes audited with the caller actor');

-- ---------------------------------------------------------------------
-- Section 9: RLS re-check after the deletes
-- ---------------------------------------------------------------------
-- l8 now has y2 (promoted primary) + nothing else live (z3, y1 deleted);
-- l9 has no live videos; A sees l1's v1+v2 + l8's y2 = 3.
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_videos', 3,
    'rls: A sees the post-delete ready set (l1:2 + l8:1)');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_videos WHERE id = ''aa000000-0000-0000-0000-000000000001''',
    0, 'rls: A no longer sees the soft-deleted primary y1');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.lesson_videos WHERE id = ''aa000000-0000-0000-0000-000000000002''',
    1, 'rls: A sees the promoted ready sibling y2');
RESET ROLE;
RESET "app.current_user_id";

-- ---------------------------------------------------------------------
-- Section 10: cleanup + final state
-- ---------------------------------------------------------------------
DELETE FROM public.lesson_videos
WHERE id::text LIKE 'aa000000-%'
   OR youtube_video_id IN ('dQw4w9WgXcQ','dQw4w9WgXcR','dQw4w9WgXcS','dQw4w9WgXcT','dQw4w9WgXcU','dQw4w9WgXcV')
   OR bunny_video_id IN ('BV12-P1', 'BV12-P2');
DELETE FROM public.audit_logs
WHERE action IN ('video.youtube_added', 'video.deleted', 'video.upload_session_created')
  AND actor_id = '70000000-0000-0000-0000-000000000009';
SELECT tests.assert(
    (SELECT count(*) = 0 FROM public.lesson_videos
     WHERE id::text LIKE 'aa000000-%' OR bunny_video_id IN ('BV12-P1', 'BV12-P2')),
    'v12: all fixture rows removed');
SELECT tests.assert(
    (SELECT count(*) = 3 FROM public.lesson_videos
     WHERE id IN ('50000000-0000-0000-0000-000000000001',
                  '50000000-0000-0000-0000-000000000002',
                  '50000000-0000-0000-0000-000000000003')
       AND source = 'bunny' AND deleted_at IS NULL),
    'v12: l1 fixtures untouched');
SELECT tests.assert(
    (SELECT is_primary AND status = 'ready' AND source = 'bunny'
     FROM public.lesson_videos WHERE id = '50000000-0000-0000-0000-000000000001'),
    'v12: fixture v1 restored as primary ready');