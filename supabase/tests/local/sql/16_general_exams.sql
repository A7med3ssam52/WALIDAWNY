-- =====================================================================
-- 16_general_exams.sql -- Phase G (0080) general-exam assertions
-- ---------------------------------------------------------------------
--   * scope guard: exactly one of (lesson_id, grade_id); old lesson
--     rows untouched (lesson_id NOT NULL, status backfilled published)
--   * visibility: students see published exams of their own grade only
--     (draft/archived/other-grade hidden); staff see all live
--   * answer key masked for students via get_exam_questions; upcoming
--     prompts hidden pre-start (0081 anti-cheat), staff preview OK
--   * start window enforced (exam_not_started / exam_ended),
--     cross-grade start denied (access_denied), empty exams rejected
--   * submit requires start (not_started), exact answer-set enforced
--     (count/distinct/membership), blanks accepted unscored (0081),
--     single attempt enforced,
--     server deadline enforced (time_expired via backdated started_at)
--   * MCQ auto-grade; review locked before ends_at
--     (answers_not_released) and open after
--   * leaderboard ranked + ties by submission time; honors
--     show_leaderboard for students; cross-grade denied
--   * publish requires a question (exam_empty) + fans out new_content
--     notifications to the grade's active students
--   * staff reset wipes an attempt; delete_exam soft-deletes generals
-- Self-contained fixtures (GE-16-*, removed at the end).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Defensive cleanup (fresh cluster: no-ops)
-- ---------------------------------------------------------------------
DELETE FROM public.notifications
WHERE entity_id IN ('ac000000-0000-0000-0000-000000000001',
                    'ac000000-0000-0000-0000-000000000002',
                    'ac000000-0000-0000-0000-000000000003',
                    'ac000000-0000-0000-0000-000000000004',
                    'ac000000-0000-0000-0000-000000000005',
                    'ac000000-0000-0000-0000-000000000006');
DELETE FROM public.exam_answers
WHERE attempt_id IN (SELECT id FROM public.exam_attempts
                     WHERE exam_id IN ('ac000000-0000-0000-0000-000000000001',
                                       'ac000000-0000-0000-0000-000000000002',
                                       'ac000000-0000-0000-0000-000000000003',
                                       'ac000000-0000-0000-0000-000000000004',
                                       'ac000000-0000-0000-0000-000000000005',
                                       'ac000000-0000-0000-0000-000000000006'));
DELETE FROM public.exam_attempts
WHERE exam_id IN ('ac000000-0000-0000-0000-000000000001',
                  'ac000000-0000-0000-0000-000000000002',
                  'ac000000-0000-0000-0000-000000000003',
                  'ac000000-0000-0000-0000-000000000004',
                  'ac000000-0000-0000-0000-000000000005',
                  'ac000000-0000-0000-0000-000000000006');
DELETE FROM public.exam_questions
WHERE exam_id IN ('ac000000-0000-0000-0000-000000000001',
                  'ac000000-0000-0000-0000-000000000002',
                  'ac000000-0000-0000-0000-000000000003',
                  'ac000000-0000-0000-0000-000000000004',
                  'ac000000-0000-0000-0000-000000000005',
                  'ac000000-0000-0000-0000-000000000006');
DELETE FROM public.exams
WHERE id IN ('ac000000-0000-0000-0000-000000000001',
             'ac000000-0000-0000-0000-000000000002',
             'ac000000-0000-0000-0000-000000000003',
             'ac000000-0000-0000-0000-000000000004',
             'ac000000-0000-0000-0000-000000000005',
             'ac000000-0000-0000-0000-000000000006');

-- ---------------------------------------------------------------------
-- Fixtures (grade G1 = 1000...0001, G2 = 1000...0002)
-- ---------------------------------------------------------------------
-- GE1: G1 open MCQ-only (q correct=1 max 2), duration 60
INSERT INTO public.exams (id, lesson_id, grade_id, title, status, starts_at, ends_at, duration_minutes, passing_score)
VALUES ('ac000000-0000-0000-0000-000000000001', NULL,
        '10000000-0000-0000-0000-000000000001', 'GE-16-OPEN-MCQ', 'published',
        now() - interval '1 day', now() + interval '1 day', 60, 50);
INSERT INTO public.exam_questions (id, exam_id, type, prompt, choices, correct_index, max_score, sort_order)
VALUES ('ac000000-0000-0000-0000-000000000011', 'ac000000-0000-0000-0000-000000000001', 'mcq',
        'Q1', '["أ","ب"]'::jsonb, 1, 2, 1);

-- GE2: G1 open MCQ+essay, duration 60
INSERT INTO public.exams (id, lesson_id, grade_id, title, status, starts_at, ends_at, duration_minutes, passing_score)
VALUES ('ac000000-0000-0000-0000-000000000002', NULL,
        '10000000-0000-0000-0000-000000000001', 'GE-16-OPEN-MIXED', 'published',
        now() - interval '1 day', now() + interval '1 day', 60, 50);
INSERT INTO public.exam_questions (id, exam_id, type, prompt, choices, correct_index, max_score, sort_order)
VALUES ('ac000000-0000-0000-0000-000000000012', 'ac000000-0000-0000-0000-000000000002', 'mcq',
        'Q1', '["أ","ب"]'::jsonb, 0, 2, 1),
       ('ac000000-0000-0000-0000-000000000013', 'ac000000-0000-0000-0000-000000000002', 'essay',
        'Q2', NULL, NULL, 5, 2);

-- GE3: G1 future (starts tomorrow)
INSERT INTO public.exams (id, lesson_id, grade_id, title, status, starts_at, ends_at, duration_minutes, passing_score)
VALUES ('ac000000-0000-0000-0000-000000000003', NULL,
        '10000000-0000-0000-0000-000000000001', 'GE-16-FUTURE', 'published',
        now() + interval '1 day', now() + interval '2 days', 60, 50);
INSERT INTO public.exam_questions (id, exam_id, type, prompt, choices, correct_index, max_score, sort_order)
VALUES ('ac000000-0000-0000-0000-000000000014', 'ac000000-0000-0000-0000-000000000003', 'mcq',
        'Q1', '["أ","ب"]'::jsonb, 0, 1, 1);

-- GE4: G2 open
INSERT INTO public.exams (id, lesson_id, grade_id, title, status, starts_at, ends_at, duration_minutes, passing_score)
VALUES ('ac000000-0000-0000-0000-000000000004', NULL,
        '10000000-0000-0000-0000-000000000002', 'GE-16-G2', 'published',
        now() - interval '1 day', now() + interval '1 day', 60, 50);
INSERT INTO public.exam_questions (id, exam_id, type, prompt, choices, correct_index, max_score, sort_order)
VALUES ('ac000000-0000-0000-0000-000000000015', 'ac000000-0000-0000-0000-000000000004', 'mcq',
        'Q1', '["أ","ب"]'::jsonb, 0, 1, 1);

-- GE5: G1 draft (hidden from students)
INSERT INTO public.exams (id, lesson_id, grade_id, title, status, starts_at, ends_at, duration_minutes, passing_score)
VALUES ('ac000000-0000-0000-0000-000000000005', NULL,
        '10000000-0000-0000-0000-000000000001', 'GE-16-DRAFT', 'draft',
        now() - interval '1 day', now() + interval '1 day', 60, 50);
INSERT INTO public.exam_questions (id, exam_id, type, prompt, choices, correct_index, max_score, sort_order)
VALUES ('ac000000-0000-0000-0000-000000000016', 'ac000000-0000-0000-0000-000000000005', 'mcq',
        'Q1', '["أ","ب"]'::jsonb, 0, 1, 1);

-- ---------------------------------------------------------------------
-- Scope guard: exactly one of lesson_id / grade_id
-- ---------------------------------------------------------------------
SELECT tests.expect_error(
    'INSERT INTO public.exams (lesson_id, grade_id, title) VALUES (''40000000-0000-0000-0000-000000000001'', ''10000000-0000-0000-0000-000000000001'', ''GE-16-BAD-BOTH'')',
    '23514', 'exams_scope_check');
SELECT tests.expect_error(
    'INSERT INTO public.exams (lesson_id, grade_id, title) VALUES (NULL, NULL, ''GE-16-BAD-NEITHER'')',
    '23514', 'exams_scope_check');

-- old lesson rows keep lesson_id + backfilled published status
SELECT tests.assert(
    (SELECT count(*) = 2 AND bool_and(status = 'published')
     FROM public.exams WHERE id IN ('ab000000-0000-0000-0000-000000000001',
                                    'ab000000-0000-0000-0000-000000000005')),
    'g: legacy lesson exams untouched by 0080 (status backfilled published)');

-- ---------------------------------------------------------------------
-- Visibility matrix via list_general_exams
-- ---------------------------------------------------------------------
-- student ...001 (G1): GE1 + GE2 + GE3 (draft + G2 hidden)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_general_exams()',
    3, 'g: G1 student sees 3 published G1 exams (draft + G2 hidden)');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_general_exams() WHERE grade_name IS NOT NULL AND question_count >= 1',
    3, 'g: list carries grade_name + question_count');
RESET ROLE;

-- student ...004 (G2): only GE4
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000004';
SET LOCAL ROLE student;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_general_exams()',
    1, 'g: G2 student sees only the G2 exam');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.get_exam_questions(''ac000000-0000-0000-0000-000000000001'')',
    0, 'g: G2 student sees no questions of a G1 exam');
RESET ROLE;

-- admin: all 5
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_general_exams()',
    5, 'g: admin sees all 5 general exams');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_general_exams(''10000000-0000-0000-0000-000000000002'')',
    1, 'g: grade filter works');
SELECT tests.assert(
    (SELECT count(*) = 1 AND count(correct_index) = 1
     FROM public.get_exam_questions('ac000000-0000-0000-0000-000000000001')),
    'g: staff receives correct_index');
RESET ROLE;

-- student ...001: key masked
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    (SELECT count(*) = 1 AND count(correct_index) = 0
     FROM public.get_exam_questions('ac000000-0000-0000-0000-000000000001')),
    'g: student never receives correct_index');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.exams WHERE grade_id IS NOT NULL AND deleted_at IS NULL',
    3, 'g: RLS exposes only own-grade published generals to G1 student');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Start gating
-- ---------------------------------------------------------------------
-- future exam -> exam_not_started
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.start_general_exam_attempt(''ac000000-0000-0000-0000-000000000003'')',
    'P0001', 'exam_not_started');
-- cross-grade -> access_denied
SELECT tests.expect_error(
    'SELECT public.start_general_exam_attempt(''ac000000-0000-0000-0000-000000000004'')',
    'P0001', 'access_denied');
-- draft -> access_denied
SELECT tests.expect_error(
    'SELECT public.start_general_exam_attempt(''ac000000-0000-0000-0000-000000000005'')',
    'P0001', 'access_denied');
-- submit without start -> not_started
SELECT tests.expect_error(
    'SELECT public.submit_general_exam_attempt(''ac000000-0000-0000-0000-000000000002'', ''[]''::jsonb)',
    'P0001', 'not_started');
-- upcoming exam prompts hidden from students (0081 F1 anti-cheat)
SELECT tests.expect_count(
    'SELECT count(*) FROM public.get_exam_questions(''ac000000-0000-0000-0000-000000000003'')',
    0, 'g: upcoming general exam prompts hidden before start');
RESET ROLE;

-- staff still previews upcoming prompts
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.get_exam_questions(''ac000000-0000-0000-0000-000000000003'')',
    1, 'g: staff previews upcoming general exam prompts');
RESET ROLE;

-- question-less published exam cannot start (0081 F5)
INSERT INTO public.exams (id, lesson_id, grade_id, title, status, starts_at, ends_at, duration_minutes, passing_score)
VALUES ('ac000000-0000-0000-0000-000000000006', NULL,
        '10000000-0000-0000-0000-000000000001', 'GE-16-EMPTY', 'published',
        now() - interval '1 day', now() + interval '1 day', 60, 50);
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.start_general_exam_attempt(''ac000000-0000-0000-0000-000000000006'')',
    'P0001', 'exam_empty');
RESET ROLE;
DELETE FROM public.exams WHERE id = 'ac000000-0000-0000-0000-000000000006';

-- ---------------------------------------------------------------------
-- Answer-set validation (0081 F2) + blank tolerance (0081 F3) on GE2
-- (MCQ q12 + essay q13), fresh student ...003
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000003';
SET LOCAL ROLE student;
SELECT public.start_general_exam_attempt('ac000000-0000-0000-0000-000000000002');
-- partial set (1 of 2) -> invalid
SELECT tests.expect_error(
    'SELECT public.submit_general_exam_attempt(''ac000000-0000-0000-0000-000000000002'', ''[{"question_id":"ac000000-0000-0000-0000-000000000012","choice_index":0}]''::jsonb)',
    'P0001', 'invalid_answers');
-- duplicated question -> invalid
SELECT tests.expect_error(
    'SELECT public.submit_general_exam_attempt(''ac000000-0000-0000-0000-000000000002'', ''[{"question_id":"ac000000-0000-0000-0000-000000000012","choice_index":0},{"question_id":"ac000000-0000-0000-0000-000000000012","choice_index":0}]''::jsonb)',
    'P0001', 'invalid_answers');
-- blank MCQ + blank essay accepted, stored unscored, attempt pending essays
SELECT tests.assert(
    ((SELECT public.submit_general_exam_attempt(
        'ac000000-0000-0000-0000-000000000002',
        '[{"question_id":"ac000000-0000-0000-0000-000000000012","choice_index":null,"answer_text":null},{"question_id":"ac000000-0000-0000-0000-000000000013","choice_index":null,"answer_text":""}]'::jsonb
    )).status = 'submitted'),
    'g: blank answers accepted as submitted (pending essay grading)');
RESET ROLE;

SELECT tests.assert(
    (SELECT auto_score = 0
     FROM public.exam_attempts
     WHERE student_id = '70000000-0000-0000-0000-000000000003'
       AND exam_id = 'ac000000-0000-0000-0000-000000000002'),
    'g: blank MCQ contributes 0 to auto_score');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.exam_answers a JOIN public.exam_attempts t ON t.id = a.attempt_id WHERE t.student_id = ''70000000-0000-0000-0000-000000000003'' AND t.exam_id = ''ac000000-0000-0000-0000-000000000002'' AND a.score IS NULL',
    2, 'g: blank answers stored unscored');
-- cleanup the ...003/GE2 probe attempt (answers + attempt)
DELETE FROM public.exam_answers
WHERE attempt_id IN (SELECT id FROM public.exam_attempts
                     WHERE student_id = '70000000-0000-0000-0000-000000000003'
                       AND exam_id = 'ac000000-0000-0000-0000-000000000002');
DELETE FROM public.exam_attempts
WHERE student_id = '70000000-0000-0000-0000-000000000003'
  AND exam_id = 'ac000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------
-- Start + MCQ auto-grade (GE1, student ...001 correct answer)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    ((SELECT public.start_general_exam_attempt('ac000000-0000-0000-0000-000000000001')).started_at IS NOT NULL),
    'g: start pins server-side started_at');
SELECT tests.assert(
    ((SELECT public.submit_general_exam_attempt(
        'ac000000-0000-0000-0000-000000000001',
        '[{"question_id":"ac000000-0000-0000-0000-000000000011","choice_index":1}]'::jsonb
    )).status = 'graded'),
    'g: MCQ-only general exam auto-grades on submit');
RESET ROLE;

SELECT tests.assert(
    (SELECT final_score = 2 AND auto_score = 2
     FROM public.exam_attempts
     WHERE student_id = '70000000-0000-0000-0000-000000000001'
       AND exam_id = 'ac000000-0000-0000-0000-000000000001'),
    'g: full marks recorded (2/2)');

-- resume is idempotent; re-submit blocked
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT public.start_general_exam_attempt('ac000000-0000-0000-0000-000000000001');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.exam_attempts WHERE exam_id = ''ac000000-0000-0000-0000-000000000001'' AND student_id = ''70000000-0000-0000-0000-000000000001''',
    1, 'g: resume does not duplicate the attempt');
SELECT tests.expect_error(
    'SELECT public.submit_general_exam_attempt(''ac000000-0000-0000-0000-000000000001'', ''[{"question_id":"ac000000-0000-0000-0000-000000000011","choice_index":1}]''::jsonb)',
    'P0001', 'attempt_already_exists');
-- review locked before ends_at
SELECT tests.expect_error(
    'SELECT count(*) FROM public.get_general_exam_review(''ac000000-0000-0000-0000-000000000001'')',
    'P0001', 'answers_not_released');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Deadline: backdate started_at beyond the 60m budget -> time_expired
-- (student ...002 on GE1, wrong-but-valid answer payload)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000002';
SET LOCAL ROLE student;
SELECT public.start_general_exam_attempt('ac000000-0000-0000-0000-000000000001');
RESET ROLE;

UPDATE public.exam_attempts SET started_at = now() - interval '90 minutes'
WHERE exam_id = 'ac000000-0000-0000-0000-000000000001'
  AND student_id = '70000000-0000-0000-0000-000000000002';

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000002';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.submit_general_exam_attempt(''ac000000-0000-0000-0000-000000000001'', ''[{"question_id":"ac000000-0000-0000-0000-000000000011","choice_index":0}]''::jsonb)',
    'P0001', 'time_expired');
RESET ROLE;

-- staff reset wipes it so the student can retake cleanly
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT public.reset_general_exam_attempt('ac000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.exam_attempts WHERE exam_id = ''ac000000-0000-0000-0000-000000000001'' AND student_id = ''70000000-0000-0000-0000-000000000002''',
    0, 'g: reset wipes the attempt');
RESET ROLE;

-- student ...002 retakes with a wrong answer (score 0, still graded)
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000002';
SET LOCAL ROLE student;
SELECT public.start_general_exam_attempt('ac000000-0000-0000-0000-000000000001');
SELECT tests.assert(
    ((SELECT public.submit_general_exam_attempt(
        'ac000000-0000-0000-0000-000000000001',
        '[{"question_id":"ac000000-0000-0000-0000-000000000011","choice_index":0}]'::jsonb
    )).final_score = 0),
    'g: wrong MCQ submits as graded with 0');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Leaderboard: ...001 (2 pts) rank 1, ...002 (0 pts) rank 2
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    (SELECT rank = 1 AND final_score = 2
     FROM public.get_general_exam_leaderboard('ac000000-0000-0000-0000-000000000001')
     WHERE student_id = '70000000-0000-0000-0000-000000000001'),
    'g: top scorer is rank 1');
SELECT tests.assert(
    (SELECT rank = 2 AND final_score = 0
     FROM public.get_general_exam_leaderboard('ac000000-0000-0000-0000-000000000001')
     WHERE student_id = '70000000-0000-0000-0000-000000000002'),
    'g: second scorer is rank 2');
RESET ROLE;

-- cross-grade leaderboard denied
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000004';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT count(*) FROM public.get_general_exam_leaderboard(''ac000000-0000-0000-0000-000000000001'')',
    'P0001', 'access_denied');
RESET ROLE;

-- show_leaderboard=false hides from students, not staff
UPDATE public.exams SET show_leaderboard = false
WHERE id = 'ac000000-0000-0000-0000-000000000001';

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT count(*) FROM public.get_general_exam_leaderboard(''ac000000-0000-0000-0000-000000000001'')',
    'P0001', 'leaderboard_hidden');
RESET ROLE;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.get_general_exam_leaderboard(''ac000000-0000-0000-0000-000000000001'')',
    2, 'g: staff bypass show_leaderboard=false');
RESET ROLE;

UPDATE public.exams SET show_leaderboard = true
WHERE id = 'ac000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------
-- Review opens after ends_at (close GE1 window, then review)
-- ---------------------------------------------------------------------
UPDATE public.exams SET ends_at = now() - interval '1 hour'
WHERE id = 'ac000000-0000-0000-0000-000000000001';

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    (SELECT count(*) = 1 AND count(correct_index) = 1
     FROM public.get_general_exam_review('ac000000-0000-0000-0000-000000000001')),
    'g: answer key released after ends_at');
SELECT tests.assert(
    (SELECT my_choice_index = 1 AND my_score = 2
     FROM public.get_general_exam_review('ac000000-0000-0000-0000-000000000001')),
    'g: review carries my answer + score');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Publish flow: empty draft rejected; with question -> published + fan-out
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_error(
    'SELECT public.publish_general_exam(''ac000000-0000-0000-0000-000000000005'')',
    'P0001', 'exam_empty');
-- create -> update -> publish a fresh draft via RPCs
SELECT public.create_general_exam(
    '10000000-0000-0000-0000-000000000001', 'GE-16-RPC',
    now() - interval '1 hour', now() + interval '1 day', 30, 50, true) INTO TEMP TABLE tmp_ge16_new;
SELECT tests.expect_error(
    'SELECT public.update_general_exam((SELECT * FROM tmp_ge16_new), NULL, now() + interval ''2 days'', now() + interval ''1 day'')',
    'P0001', 'invalid_window');
RESET ROLE;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
INSERT INTO public.exam_questions (exam_id, type, prompt, choices, correct_index, max_score, sort_order)
SELECT (SELECT * FROM tmp_ge16_new), 'mcq', 'Q', '["أ","ب"]'::jsonb, 0, 1, 1;

SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT public.publish_general_exam((SELECT * FROM tmp_ge16_new));
SELECT tests.assert(
    ((SELECT status FROM public.exams WHERE id = (SELECT * FROM tmp_ge16_new)) = 'published'),
    'g: publish flips draft to published');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE entity_type = ''exams'' AND entity_id = (SELECT * FROM tmp_ge16_new) AND user_id = ''70000000-0000-0000-0000-000000000001''',
    1, 'g: publish fans out new_content to a G1 student');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications WHERE entity_type = ''exams'' AND entity_id = (SELECT * FROM tmp_ge16_new) AND user_id = ''70000000-0000-0000-0000-000000000004''',
    0, 'g: publish does NOT notify other-grade students');
RESET ROLE;

-- delete_exam soft-deletes the RPC-created general exam
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT public.delete_exam((SELECT * FROM tmp_ge16_new));
SELECT tests.expect_count(
    'SELECT count(*) FROM public.exams WHERE id = (SELECT * FROM tmp_ge16_new) AND deleted_at IS NULL',
    0, 'g: delete_exam soft-deletes a general exam');
RESET ROLE;
DROP TABLE IF EXISTS tmp_ge16_new;

-- ---------------------------------------------------------------------
-- Grants posture: no anon surface on the new RPCs
-- ---------------------------------------------------------------------
SELECT tests.assert(
    (SELECT count(*) = 0 FROM information_schema.role_routine_grants
     WHERE grantee = 'PUBLIC'
       AND routine_schema = 'public'
       AND routine_name IN ('create_general_exam','update_general_exam','publish_general_exam',
                            'list_general_exams','start_general_exam_attempt',
                            'submit_general_exam_attempt','get_general_exam_leaderboard',
                            'get_general_exam_review','reset_general_exam_attempt',
                            'can_access_general_exam')),
    'g: no PUBLIC execute on general-exam RPCs');

-- ---------------------------------------------------------------------
-- Final cleanup
-- ---------------------------------------------------------------------
DELETE FROM public.notifications
WHERE entity_id IN ('ac000000-0000-0000-0000-000000000001',
                    'ac000000-0000-0000-0000-000000000002',
                    'ac000000-0000-0000-0000-000000000003',
                    'ac000000-0000-0000-0000-000000000004',
                    'ac000000-0000-0000-0000-000000000005',
                    'ac000000-0000-0000-0000-000000000006');
DELETE FROM public.exam_answers
WHERE attempt_id IN (SELECT id FROM public.exam_attempts
                     WHERE exam_id IN ('ac000000-0000-0000-0000-000000000001',
                                       'ac000000-0000-0000-0000-000000000002',
                                       'ac000000-0000-0000-0000-000000000003',
                                       'ac000000-0000-0000-0000-000000000004',
                                       'ac000000-0000-0000-0000-000000000005',
                                       'ac000000-0000-0000-0000-000000000006'));
DELETE FROM public.exam_attempts
WHERE exam_id IN ('ac000000-0000-0000-0000-000000000001',
                  'ac000000-0000-0000-0000-000000000002',
                  'ac000000-0000-0000-0000-000000000003',
                  'ac000000-0000-0000-0000-000000000004',
                  'ac000000-0000-0000-0000-000000000005',
                  'ac000000-0000-0000-0000-000000000006');
DELETE FROM public.exam_questions
WHERE exam_id IN ('ac000000-0000-0000-0000-000000000001',
                  'ac000000-0000-0000-0000-000000000002',
                  'ac000000-0000-0000-0000-000000000003',
                  'ac000000-0000-0000-0000-000000000004',
                  'ac000000-0000-0000-0000-000000000005',
                  'ac000000-0000-0000-0000-000000000006');
DELETE FROM public.exams
WHERE id IN ('ac000000-0000-0000-0000-000000000001',
             'ac000000-0000-0000-0000-000000000002',
             'ac000000-0000-0000-0000-000000000003',
             'ac000000-0000-0000-0000-000000000004',
             'ac000000-0000-0000-0000-000000000005',
             'ac000000-0000-0000-0000-000000000006');
DELETE FROM public.exams WHERE title IN ('GE-16-RPC', 'GE-16-BAD-BOTH', 'GE-16-BAD-NEITHER');
DELETE FROM public.audit_logs WHERE entity_type IN ('exams', 'exam_attempts');
