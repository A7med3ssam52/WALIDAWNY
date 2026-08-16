-- =====================================================================
-- 09_exams.sql -- Phase 6 (0029) exams assertions
-- ---------------------------------------------------------------------
--   * access matrix: students without lesson access see nothing and
--     cannot submit; students with access see masked questions; staff
--     see the full answer key
--   * invalid payloads rejected (unknown question / malformed mcq /
--     empty essay / non-array)
--   * MCQ auto-grading + immediate exam_graded; one attempt per
--     (exam, student) enforced
--   * essay flow: submit -> submitted + exam_submitted fan-out to staff;
--     grade_exam_attempt (staff-only) -> graded + exam_graded
--   * notification_type / exam_question_type enum values, audit rows,
--     grant posture
-- Self-contained fixtures (EXAM-09-*, removed at the end).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Defensive cleanup (fresh cluster: no-ops) + fixtures on lesson
-- TEST-L1 (40000000-...-0001) whose unit 30000000-...-0001 sits in grade
-- 10000000-...-0001. Student ...001 owns an active purchase on that unit
-- (fixture 80000000-...-0001, suite 02) -> has access; student ...004 is
-- in grade ...-0002 -> no access.
-- ---------------------------------------------------------------------
DELETE FROM public.notifications
WHERE entity_type = 'exam_attempts'
  AND entity_id IN (SELECT id FROM public.exam_attempts
                    WHERE exam_id IN ('ab000000-0000-0000-0000-000000000001',
                                      'ab000000-0000-0000-0000-000000000005'));
DELETE FROM public.exam_answers
WHERE attempt_id IN (SELECT id FROM public.exam_attempts
                     WHERE exam_id IN ('ab000000-0000-0000-0000-000000000001',
                                       'ab000000-0000-0000-0000-000000000005'));
DELETE FROM public.exam_attempts
WHERE exam_id IN ('ab000000-0000-0000-0000-000000000001',
                  'ab000000-0000-0000-0000-000000000005');
DELETE FROM public.exam_questions
WHERE exam_id IN ('ab000000-0000-0000-0000-000000000001',
                  'ab000000-0000-0000-0000-000000000005');
DELETE FROM public.exams
WHERE id IN ('ab000000-0000-0000-0000-000000000001',
             'ab000000-0000-0000-0000-000000000005');
DELETE FROM public.audit_logs WHERE entity_type IN ('exams', 'exam_attempts');

-- exam1: MCQ-only (q1 correct = choice 1, max 2; q2 correct = choice 0, max 3)
INSERT INTO public.exams (id, lesson_id, title, sort_order, passing_score)
VALUES ('ab000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001', 'EXAM-09-MCQ', 1, 50);

INSERT INTO public.exam_questions (id, exam_id, type, prompt, choices, correct_index, max_score, sort_order)
VALUES ('ab000000-0000-0000-0000-000000000002', 'ab000000-0000-0000-0000-000000000001', 'mcq',
        'Q1', '["أ","ب","ج","د"]'::jsonb, 1, 2, 1),
       ('ab000000-0000-0000-0000-000000000003', 'ab000000-0000-0000-0000-000000000001', 'mcq',
        'Q2', '["صح","خطأ"]'::jsonb, 0, 3, 2);

-- exam2: MCQ + essay (q3 correct = choice 1, max 2; q4 essay max 5)
INSERT INTO public.exams (id, lesson_id, title, sort_order, passing_score)
VALUES ('ab000000-0000-0000-0000-000000000005',
        '40000000-0000-0000-0000-000000000001', 'EXAM-09-ESSAY', 2, 50);

INSERT INTO public.exam_questions (id, exam_id, type, prompt, choices, correct_index, max_score, sort_order)
VALUES ('ab000000-0000-0000-0000-000000000006', 'ab000000-0000-0000-0000-000000000005', 'mcq',
        'Q3', '["أ","ب"]'::jsonb, 1, 2, 1),
       ('ab000000-0000-0000-0000-000000000007', 'ab000000-0000-0000-0000-000000000005', 'essay',
        'Q4', NULL, NULL, 5, 2);

-- ---------------------------------------------------------------------
-- Enum additions (0029)
-- ---------------------------------------------------------------------
SELECT tests.assert(
    (SELECT 'exam_submitted'::public.notification_type = 'exam_submitted'
        AND 'exam_graded'::public.notification_type = 'exam_graded'),
    'e: notification_type gained exam_submitted + exam_graded');
SELECT tests.assert(
    (SELECT 'mcq'::public.exam_question_type = 'mcq'
        AND 'essay'::public.exam_question_type = 'essay'),
    'e: exam_question_type exists with mcq + essay');
SELECT tests.assert(
    (SELECT count(*) = 1 FROM pg_trigger
     WHERE tgname = 'audit_trigger' AND tgrelid = 'public.exams'::regclass),
    'e: audit_trigger attached to exams');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs WHERE entity_type = ''exams'' AND action = ''exams.insert''',
    2, 'e: exam inserts captured by audit_trigger');

-- ---------------------------------------------------------------------
-- Access matrix
-- ---------------------------------------------------------------------
-- student ...004 (no access to lesson): nothing visible, submit denied
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000004';
SET LOCAL ROLE student;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_exams(''40000000-0000-0000-0000-000000000001'')',
    0, 'e: student without access sees no exams');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.get_exam_questions(''ab000000-0000-0000-0000-000000000001'')',
    0, 'e: student without access sees no questions');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.exams WHERE lesson_id = ''40000000-0000-0000-0000-000000000001''',
    0, 'e: RLS hides exams from student without access');
SELECT tests.expect_error(
    'SELECT public.submit_exam_attempt(''ab000000-0000-0000-0000-000000000001'', ''[]''::jsonb)',
    'P0001', 'access_denied');
RESET ROLE;

-- staff: full visibility + answer key
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_exams(''40000000-0000-0000-0000-000000000001'')',
    2, 'e: admin sees both exams');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.get_exam_questions(''ab000000-0000-0000-0000-000000000001'')',
    2, 'e: admin sees both questions');
SELECT tests.assert(
    (SELECT count(*) = 2 AND count(correct_index) = 2
     FROM public.get_exam_questions('ab000000-0000-0000-0000-000000000001')),
    'e: staff receives correct_index on every question');
RESET ROLE;

-- student ...001 (owns the unit): visible, but answer key masked
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_count(
    'SELECT count(*) FROM public.list_exams(''40000000-0000-0000-0000-000000000001'')',
    2, 'e: student with access sees both exams');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.get_exam_questions(''ab000000-0000-0000-0000-000000000001'')',
    2, 'e: student with access sees the questions');
SELECT tests.assert(
    (SELECT count(*) = 2 AND count(correct_index) = 0
     FROM public.get_exam_questions('ab000000-0000-0000-0000-000000000001')),
    'e: student never receives correct_index (answer key masked)');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Invalid payloads (student ...001, exam2 still unattempted)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.submit_exam_attempt(''ab000000-0000-0000-0000-000000000005'', ''[{"question_id":"ab000000-0000-0000-0000-0000000000ff","choice_index":0}]''::jsonb)',
    'P0001', 'invalid_answers');
SELECT tests.expect_error(
    'SELECT public.submit_exam_attempt(''ab000000-0000-0000-0000-000000000005'', ''[{"question_id":"ab000000-0000-0000-0000-000000000006","answer_text":"x"}]''::jsonb)',
    'P0001', 'invalid_answers');
SELECT tests.expect_error(
    'SELECT public.submit_exam_attempt(''ab000000-0000-0000-0000-000000000005'', ''[{"question_id":"ab000000-0000-0000-0000-000000000007","answer_text":"   "}]''::jsonb)',
    'P0001', 'invalid_answers');
SELECT tests.expect_error(
    'SELECT public.submit_exam_attempt(''ab000000-0000-0000-0000-000000000005'', ''"nope"''::jsonb)',
    'P0001', 'invalid_answers');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.exam_attempts WHERE exam_id = ''ab000000-0000-0000-0000-000000000005''',
    0, 'e: no attempt created by rejected payloads');
RESET ROLE;

-- ---------------------------------------------------------------------
-- MCQ auto-grading (exam1)
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    ((SELECT public.submit_exam_attempt(
        'ab000000-0000-0000-0000-000000000001',
        '[{"question_id":"ab000000-0000-0000-0000-000000000002","choice_index":1},{"question_id":"ab000000-0000-0000-0000-000000000003","choice_index":1}]'::jsonb
    )).status = 'graded'),
    'e: MCQ-only exam auto-grades on submit');
RESET ROLE;

SELECT tests.expect_count(
    'SELECT count(*) FROM public.exam_attempts
      WHERE student_id = ''70000000-0000-0000-0000-000000000001''
        AND exam_id = ''ab000000-0000-0000-0000-000000000001'' AND status = ''graded''',
    1, 'e: attempt persisted as graded');
SELECT tests.assert(
    (SELECT auto_score = 2 AND final_score = 2 AND manual_score = 0
     FROM public.exam_attempts
     WHERE student_id = '70000000-0000-0000-0000-000000000001'
       AND exam_id = 'ab000000-0000-0000-0000-000000000001'),
    'e: auto_score 2 (q1 correct, q2 wrong) = final_score');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.exam_answers a
      JOIN public.exam_attempts t ON t.id = a.attempt_id
      WHERE t.student_id = ''70000000-0000-0000-0000-000000000001''
        AND t.exam_id = ''ab000000-0000-0000-0000-000000000001''
        AND a.question_id = ''ab000000-0000-0000-0000-000000000002'' AND a.score = 2',
    1, 'e: q1 (correct) scored 2');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.exam_answers a
      JOIN public.exam_attempts t ON t.id = a.attempt_id
      WHERE t.student_id = ''70000000-0000-0000-0000-000000000001''
        AND t.exam_id = ''ab000000-0000-0000-0000-000000000001''
        AND a.question_id = ''ab000000-0000-0000-0000-000000000003'' AND a.score IS NULL',
    1, 'e: q2 (wrong mcq) stored with NULL score');

-- second attempt blocked
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.submit_exam_attempt(''ab000000-0000-0000-0000-000000000001'', ''[]''::jsonb)',
    'P0001', 'attempt_already_exists');
RESET ROLE;

-- notifications: exam_graded to the student + exam_submitted fan-out to staff
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications
      WHERE user_id = ''70000000-0000-0000-0000-000000000001''
        AND type = ''exam_graded'' AND entity_type = ''exam_attempts''',
    1, 'e: student notified exam_graded (auto-graded)');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications n
      JOIN public.exam_attempts a ON n.dedup_key = ''exam_submitted:'' || n.user_id::text || '':'' || a.id::text
      WHERE a.student_id = ''70000000-0000-0000-0000-000000000001''
        AND a.exam_id = ''ab000000-0000-0000-0000-000000000001''
        AND n.user_id IN (''70000000-0000-0000-0000-000000000009'',
                          ''70000000-0000-0000-0000-00000000000a'',
                          ''70000000-0000-0000-0000-00000000000b'')',
    3, 'e: exam_submitted fan-out to admin/mr_walid/teacher');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs
      WHERE action = ''exam.submitted'' AND entity_type = ''exam_attempts''',
    1, 'e: audit exam.submitted recorded');

-- ---------------------------------------------------------------------
-- Essay flow (exam2): submit -> submitted; staff grade -> graded
-- ---------------------------------------------------------------------
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.assert(
    ((SELECT public.submit_exam_attempt(
        'ab000000-0000-0000-0000-000000000005',
        '[{"question_id":"ab000000-0000-0000-0000-000000000006","choice_index":1},{"question_id":"ab000000-0000-0000-0000-000000000007","answer_text":"حل السؤال"}]'::jsonb
    )).status = 'submitted'),
    'e: essay exam stays submitted after submit');
RESET ROLE;

SELECT tests.assert(
    (SELECT auto_score = 2 AND final_score IS NULL
     FROM public.exam_attempts
     WHERE student_id = '70000000-0000-0000-0000-000000000001'
       AND exam_id = 'ab000000-0000-0000-0000-000000000005'),
    'e: auto_score set (mcq correct), final pending essay grading');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications
      WHERE type = ''exam_submitted'' AND entity_type = ''exam_attempts''
        AND user_id IN (''70000000-0000-0000-0000-000000000009'',
                        ''70000000-0000-0000-0000-00000000000a'',
                        ''70000000-0000-0000-0000-00000000000b'')',
    6, 'e: exam_submitted fan-out for both attempts (3 staff x 2)');

-- student cannot grade
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';
SET LOCAL ROLE student;
SELECT tests.expect_error(
    'SELECT public.grade_exam_attempt(''ab000000-0000-0000-0000-0000000000aa'', ''[]''::jsonb)',
    'P0001', 'permission_denied');
RESET ROLE;

-- admin grades the essay
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.assert(
    (SELECT (public.grade_exam_attempt(
        a.id,
        '[{"question_id":"ab000000-0000-0000-0000-000000000007","score":4}]'::jsonb
    )).final_score = 6
     FROM public.exam_attempts a
     WHERE a.student_id = '70000000-0000-0000-0000-000000000001'
       AND a.exam_id = 'ab000000-0000-0000-0000-000000000005'),
    'e: grade_exam_attempt finalizes manual + auto = 6');
RESET ROLE;

SELECT tests.assert(
    (SELECT status = 'graded' AND manual_score = 4 AND final_score = 6
        AND graded_by = '70000000-0000-0000-0000-00000000000a' AND graded_at IS NOT NULL
     FROM public.exam_attempts
     WHERE student_id = '70000000-0000-0000-0000-000000000001'
       AND exam_id = 'ab000000-0000-0000-0000-000000000005'),
    'e: essay attempt finalized (manual 4 + auto 2 = 6)');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.notifications
      WHERE user_id = ''70000000-0000-0000-0000-000000000001''
        AND type = ''exam_graded'' AND entity_type = ''exam_attempts''',
    2, 'e: student notified exam_graded for both exams');
SELECT tests.expect_count(
    'SELECT count(*) FROM public.audit_logs
      WHERE action = ''exam.graded'' AND entity_type = ''exam_attempts''',
    1, 'e: audit exam.graded recorded');

-- grading an already-graded attempt is rejected
SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE admin;
SELECT tests.expect_error(
    'SELECT public.grade_exam_attempt(
        (SELECT id FROM public.exam_attempts
         WHERE student_id = ''70000000-0000-0000-0000-000000000001''
           AND exam_id = ''ab000000-0000-0000-0000-000000000005''),
        ''[]''::jsonb)',
    'P0001', 'already_graded');
RESET ROLE;

-- ---------------------------------------------------------------------
-- Grant posture (SECURITY.md 8.2 pattern)
-- ---------------------------------------------------------------------
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.list_exams(uuid)', 'EXECUTE'),
    'g: list_exams executable by authenticated');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.get_exam_questions(uuid)', 'EXECUTE'),
    'g: get_exam_questions executable by authenticated');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.get_my_exam_attempt(uuid)', 'EXECUTE'),
    'g: get_my_exam_attempt executable by authenticated');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.submit_exam_attempt(uuid, jsonb)', 'EXECUTE'),
    'g: submit_exam_attempt executable by authenticated');
SELECT tests.assert(
    has_function_privilege('authenticated', 'public.grade_exam_attempt(uuid, jsonb)', 'EXECUTE'),
    'g: grade_exam_attempt executable by authenticated');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.submit_exam_attempt(uuid, jsonb)', 'EXECUTE'),
    'g: submit_exam_attempt NOT executable by anon');
SELECT tests.assert(
    NOT has_function_privilege('anon', 'public.list_exams(uuid)', 'EXECUTE'),
    'g: list_exams NOT executable by anon');

-- ---------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------
RESET "app.current_user_id";
DELETE FROM public.notifications
WHERE entity_type = 'exam_attempts'
  AND entity_id IN (SELECT id FROM public.exam_attempts
                    WHERE exam_id IN ('ab000000-0000-0000-0000-000000000001',
                                      'ab000000-0000-0000-0000-000000000005'));
DELETE FROM public.exam_answers
WHERE attempt_id IN (SELECT id FROM public.exam_attempts
                     WHERE exam_id IN ('ab000000-0000-0000-0000-000000000001',
                                       'ab000000-0000-0000-0000-000000000005'));
DELETE FROM public.exam_attempts
WHERE exam_id IN ('ab000000-0000-0000-0000-000000000001',
                  'ab000000-0000-0000-0000-000000000005');
DELETE FROM public.exam_questions
WHERE exam_id IN ('ab000000-0000-0000-0000-000000000001',
                  'ab000000-0000-0000-0000-000000000005');
DELETE FROM public.exams
WHERE id IN ('ab000000-0000-0000-0000-000000000001',
             'ab000000-0000-0000-0000-000000000005');
DELETE FROM public.audit_logs
WHERE entity_type = 'exams'
   OR (entity_type = 'exam_attempts'
       AND action IN ('exam.submitted', 'exam.graded'));
