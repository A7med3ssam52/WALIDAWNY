-- =====================================================================
-- 14_assistant_assets.sql - 0073 assistant lesson-assets write parity
-- Static guard-source assertions (no fixtures needed):
--   * pdf/video-upload RPCs patched by 0073 include is_assistant
--     (teacher parity for lesson assets).
--   * delete_pdf_upload_record stays admin/mr_walid-only (0044, even
--     teacher excluded) - assistant must NOT appear.
--   * boards + youtube RPCs keep their 0061 assistant grant (regression).
-- =====================================================================

-- --- 0073: pdf RPCs include assistant ---------------------------------
SELECT tests.assert(
    (SELECT pg_get_functiondef(to_regprocedure('public.create_pdf_upload_record(uuid, text, bigint)')) LIKE '%is_assistant()%'),
    'a14: create_pdf_upload_record guard includes assistant (0073)');

SELECT tests.assert(
    (SELECT pg_get_functiondef(to_regprocedure('public.finalize_pdf_upload(uuid)')) LIKE '%is_assistant()%'),
    'a14: finalize_pdf_upload guard includes assistant (0073)');

-- --- 0073: video-upload RPCs include assistant -------------------------
SELECT tests.assert(
    (SELECT pg_get_functiondef(to_regprocedure('public.create_video_upload_record(uuid, text, text, text, text, uuid)')) LIKE '%is_assistant()%'),
    'a14: create_video_upload_record guard includes assistant (0073)');

SELECT tests.assert(
    (SELECT pg_get_functiondef(to_regprocedure('public.delete_video_upload_record(uuid, uuid)')) LIKE '%is_assistant()%'),
    'a14: delete_video_upload_record guard includes assistant (0073)');

-- --- 0044: pdf delete stays restricted (teacher parity) ----------------
SELECT tests.assert(
    (SELECT pg_get_functiondef(to_regprocedure('public.delete_pdf_upload_record(uuid, uuid)')) NOT LIKE '%is_assistant()%'),
    'a14: delete_pdf_upload_record guard excludes assistant (0044 admin/mr_walid-only)');

-- --- 0061 regression: boards + youtube keep assistant ------------------
SELECT tests.assert(
    (SELECT pg_get_functiondef(to_regprocedure('public.create_board_upload_record(uuid, text, bigint)')) LIKE '%is_assistant()%'),
    'a14: create_board_upload_record keeps assistant (0061)');

SELECT tests.assert(
    (SELECT pg_get_functiondef(to_regprocedure('public.finalize_board_upload(uuid)')) LIKE '%is_assistant()%'),
    'a14: finalize_board_upload keeps assistant (0061)');

SELECT tests.assert(
    (SELECT pg_get_functiondef(to_regprocedure('public.delete_board_upload_record(uuid, uuid)')) LIKE '%is_assistant()%'),
    'a14: delete_board_upload_record keeps assistant (0061)');

SELECT tests.assert(
    (SELECT pg_get_functiondef(to_regprocedure('public.reorder_boards(uuid, uuid[])')) LIKE '%is_assistant()%'),
    'a14: reorder_boards keeps assistant (0061)');

SELECT tests.assert(
    (SELECT pg_get_functiondef(to_regprocedure('public.add_youtube_video(uuid, text, text)')) LIKE '%is_assistant()%'),
    'a14: add_youtube_video keeps assistant (0061)');

SELECT tests.assert(
    (SELECT pg_get_functiondef(to_regprocedure('public.delete_lesson_video(uuid, uuid)')) LIKE '%is_assistant()%'),
    'a14: delete_lesson_video keeps assistant (0061)');
