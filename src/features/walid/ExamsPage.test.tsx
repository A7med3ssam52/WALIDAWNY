import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  getQueryCallCount,
  makeExam,
  makeExamAnswer,
  makeExamAttempt,
  makeExamQuestion,
  makeGrade,
  makeLesson,
  makeProfile,
  makeUnit,
  mockState,
  resetMockState,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

function seedCurriculum() {
  mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
  mockState.units.push(
    makeUnit({ id: 'unit-1', grade_id: 'grade-1', name: 'الوحدة الأولى', status: 'published' }),
  );
  mockState.lessons.push(
    makeLesson({ id: 'lesson-1', unit_id: 'unit-1', title: 'الدرس الأول', status: 'published' }),
  );
}

async function selectLesson() {
  const unitSelect = await screen.findByLabelText('الوحدة');
  await waitFor(() => {
    expect(unitSelect.querySelector('option[value="unit-1"]')).toBeInTheDocument();
  });
  fireEvent.change(unitSelect, { target: { value: 'unit-1' } });
  const lessonSelect = await screen.findByLabelText('الدرس');
  await waitFor(() => {
    expect(lessonSelect.querySelector('option[value="lesson-1"]')).toBeInTheDocument();
  });
  fireEvent.change(lessonSelect, { target: { value: 'lesson-1' } });
  await screen.findByText('الدرس الأول');
}

describe('ExamsPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedWalid();
  });

  it('appears as a nav item in the staff menu', async () => {
    renderApp('/walid/dashboard');

    expect(await screen.findByRole('link', { name: 'الإختبارات' })).toBeInTheDocument();
  });

  it('lets the staff create an exam for a lesson', async () => {
    seedCurriculum();
    renderApp('/walid/exams');

    expect(await screen.findByRole('heading', { name: 'الإختبارات' })).toBeInTheDocument();
    await selectLesson();
    expect(await screen.findByText('لا توجد اختبارات بعد')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('عنوان الاختبار'), {
      target: { value: 'اختبار الفصل الأول' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'إضافة اختبار' }));

    expect(await screen.findByText('اختبار الفصل الأول')).toBeInTheDocument();
    expect(getQueryCallCount('exams')).toBeGreaterThan(0);
  });

  it('adds an mcq question to the selected exam', async () => {
    seedCurriculum();
    mockState.exams.push(makeExam({ id: 'exam-1', lesson_id: 'lesson-1', title: 'اختبار الفصل الأول' }));
    renderApp('/walid/exams');

    await selectLesson();
    expect(await screen.findByText('لا توجد أسئلة بعد')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('نص السؤال'), {
      target: { value: 'ما عاصمة مصر؟' },
    });
    fireEvent.change(screen.getByLabelText('الخيار أ'), { target: { value: 'القاهرة' } });
    fireEvent.change(screen.getByLabelText('الخيار ب'), { target: { value: 'الإسكندرية' } });
    fireEvent.click(screen.getByRole('button', { name: 'إضافة سؤال' }));

    expect(await screen.findByText(/ما عاصمة مصر؟/)).toBeInTheDocument();
    expect(screen.getByText(/القاهرة/)).toBeInTheDocument();
  });

  it('lists attempts and grades the essay part through the grading modal', async () => {
    seedCurriculum();
    mockState.exams.push(makeExam({ id: 'exam-1', lesson_id: 'lesson-1', title: 'اختبار الفصل الأول' }));
    mockState.examQuestions.push(
      makeExamQuestion({
        id: 'question-1',
        exam_id: 'exam-1',
        type: 'essay',
        prompt: 'اشرح قواعد اللغة',
        max_score: 5,
        sort_order: 1,
      }),
      makeExamQuestion({
        id: 'question-2',
        exam_id: 'exam-1',
        type: 'mcq',
        prompt: 'اختر الرقم الصحيح',
        choices: ['1', '2'],
        correct_index: 1,
        max_score: 1,
        sort_order: 2,
      }),
    );
    mockState.examAttempts.push(
      makeExamAttempt({
        id: 'attempt-1',
        exam_id: 'exam-1',
        student_id: 'user-test-1',
        status: 'submitted',
      }),
    );
    mockState.examAnswers.push(
      makeExamAnswer({
        id: 'answer-1',
        attempt_id: 'attempt-1',
        question_id: 'question-1',
        answer_text: 'الجملة الاسمية تبدأ باسم.',
        score: null,
      }),
    );
    mockState.profiles.push(makeProfile({ id: 'user-test-1', full_name: 'أحمد محمد' }));
    renderApp('/walid/exams');

    await selectLesson();
    expect(await screen.findByTestId('attempt-row-attempt-1')).toBeInTheDocument();
    expect(screen.getByText('أحمد محمد')).toBeInTheDocument();
    expect(screen.getByText('بانتظار التصحيح')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'تصحيح' }));

    expect(
      await screen.findByLabelText('السؤال 1: اشرح قواعد اللغة'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('السؤال 1: اشرح قواعد اللغة'), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التصحيح' }));

    await waitFor(() => expect(expectRpcCall('grade_exam_attempt')).toBeTruthy());
    expect(expectRpcCall('grade_exam_attempt')).toEqual({
      p_attempt_id: 'attempt-1',
      p_scores: [{ question_id: 'question-1', score: 4 }],
    });
    expect(await screen.findByText('تم التصحيح')).toBeInTheDocument();
    expect(screen.getByText('النتيجة: 4')).toBeInTheDocument();
  });
});
