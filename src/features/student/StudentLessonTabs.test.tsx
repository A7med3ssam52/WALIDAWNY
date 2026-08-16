import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hlsMock = vi.hoisted(() => {
  const handlers: Array<{ event: string; cb: () => void }> = [];
  return {
    handlers,
    HlsMock: function (this: {
      on: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      loadSource: ReturnType<typeof vi.fn>;
      attachMedia: ReturnType<typeof vi.fn>;
    }) {
      this.on = vi.fn((event: string, cb: () => void) => {
        handlers.push({ event, cb });
      });
      this.destroy = vi.fn();
      this.loadSource = vi.fn();
      this.attachMedia = vi.fn();
    } as unknown as {
      new (): {
        on: ReturnType<typeof vi.fn>;
        destroy: ReturnType<typeof vi.fn>;
        loadSource: ReturnType<typeof vi.fn>;
        attachMedia: ReturnType<typeof vi.fn>;
      };
    },
    trigger: (event: string) => {
      handlers.filter((entry) => entry.event === event).forEach((entry) => entry.cb());
    },
  };
});

vi.mock('hls.js', () => {
  const Hls = hlsMock.HlsMock as unknown as {
    new (): {
      on: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      loadSource: ReturnType<typeof vi.fn>;
      attachMedia: ReturnType<typeof vi.fn>;
    };
    isSupported: () => boolean;
    Events: Record<string, string>;
  };
  Hls.isSupported = () => true;
  Hls.Events = { MANIFEST_PARSED: 'MANIFEST_PARSED' };
  return { default: Hls };
});

import {
  expectRpcCall,
  getRpcCalls,
  makeExam,
  makeExamAttempt,
  makeExamQuestion,
  makeGrade,
  makeLesson,
  makeLessonComment,
  makeUnit,
  makeUnitPurchase,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

function seedLessonPage() {
  mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
  mockState.units.push(
    makeUnit({ id: 'unit-1', grade_id: 'grade-1', name: 'الوحدة الأولى', status: 'published' }),
  );
  mockState.lessons.push(
    makeLesson({ id: 'lesson-1', unit_id: 'unit-1', title: 'الدرس الأول', status: 'published' }),
  );
  mockState.unitPurchases.push(makeUnitPurchase({ id: 'purchase-1', unit_id: 'unit-1' }));
}

describe('StudentLessonPage — exams tab', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: 'grade-1' });
    hlsMock.handlers.length = 0;
  });

  it('renders an mcq exam and grades it automatically after submission', async () => {
    seedLessonPage();
    mockState.exams.push(makeExam({ id: 'exam-1', lesson_id: 'lesson-1', title: 'اختبار الدرس الأول' }));
    mockState.examQuestions.push(
      makeExamQuestion({
        id: 'question-1',
        exam_id: 'exam-1',
        type: 'mcq',
        prompt: 'ما عاصمة مصر؟',
        choices: ['القاهرة', 'الإسكندرية'],
        correct_index: 0,
        max_score: 1,
        sort_order: 1,
      }),
    );
    renderApp('/student/lessons/lesson-1');

    fireEvent.click(await screen.findByTestId('lesson-tab-exams'));

    expect(await screen.findByTestId('exam-card-exam-1')).toBeInTheDocument();
    expect(screen.getByText('اختبار الدرس الأول')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('القاهرة'));
    fireEvent.click(screen.getByTestId('exam-submit-exam-1'));

    await waitFor(() => expect(expectRpcCall('submit_exam_attempt')).toBeTruthy());
    expect(expectRpcCall('submit_exam_attempt')).toEqual({
      p_exam_id: 'exam-1',
      p_answers: [{ question_id: 'question-1', choice_index: 0, answer_text: null }],
    });
    expect(await screen.findByTestId('exam-result-exam-1')).toBeInTheDocument();
    expect(screen.getByText('تم التصحيح')).toBeInTheDocument();
    expect(screen.getByText('نتيجتك: 1 من 1')).toBeInTheDocument();
  });

  it('keeps exams with essay questions pending until the staff grades them', async () => {
    seedLessonPage();
    mockState.exams.push(
      makeExam({ id: 'exam-2', lesson_id: 'lesson-1', title: 'الاختبار المقالي', passing_score: 50 }),
    );
    mockState.examQuestions.push(
      makeExamQuestion({
        id: 'question-3',
        exam_id: 'exam-2',
        type: 'essay',
        prompt: 'اشرح قواعد اللغة',
        max_score: 5,
        sort_order: 1,
      }),
      makeExamQuestion({
        id: 'question-4',
        exam_id: 'exam-2',
        type: 'mcq',
        prompt: 'اختر الرقم الصحيح',
        choices: ['1', '2'],
        correct_index: 1,
        max_score: 1,
        sort_order: 2,
      }),
    );
    renderApp('/student/lessons/lesson-1');

    fireEvent.click(await screen.findByTestId('lesson-tab-exams'));

    expect(await screen.findByTestId('exam-card-exam-2')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('إجابة السؤال 1'), {
      target: { value: 'الجملة الاسمية تبدأ باسم.' },
    });
    fireEvent.click(screen.getByLabelText('2'));
    fireEvent.click(screen.getByTestId('exam-submit-exam-2'));

    await waitFor(() => expect(expectRpcCall('submit_exam_attempt')).toBeTruthy());
    expect(await screen.findByText('بانتظار تصحيح الأستاذ')).toBeInTheDocument();
    expect(screen.queryByText(/نتيجتك:/)).not.toBeInTheDocument();
  });

  it('shows the result for an already-graded attempt and hides the form', async () => {
    seedLessonPage();
    mockState.exams.push(makeExam({ id: 'exam-1', lesson_id: 'lesson-1', title: 'اختبار الدرس الأول' }));
    mockState.examQuestions.push(
      makeExamQuestion({
        id: 'question-1',
        exam_id: 'exam-1',
        type: 'mcq',
        prompt: 'سؤال أول',
        choices: ['أ', 'ب'],
        correct_index: 0,
        max_score: 1,
        sort_order: 1,
      }),
      makeExamQuestion({
        id: 'question-2',
        exam_id: 'exam-1',
        type: 'mcq',
        prompt: 'سؤال ثانٍ',
        choices: ['أ', 'ب'],
        correct_index: 1,
        max_score: 1,
        sort_order: 2,
      }),
    );
    mockState.examAttempts.push(
      makeExamAttempt({
        id: 'attempt-1',
        exam_id: 'exam-1',
        status: 'graded',
        auto_score: 2,
        final_score: 2,
      }),
    );
    renderApp('/student/lessons/lesson-1');

    fireEvent.click(await screen.findByTestId('lesson-tab-exams'));

    expect(await screen.findByTestId('exam-result-exam-1')).toBeInTheDocument();
    expect(screen.getByText('نتيجتك: 2 من 2')).toBeInTheDocument();
    expect(screen.queryByTestId('exam-submit-exam-1')).not.toBeInTheDocument();
  });

  it('blocks submitting an incomplete exam client-side', async () => {
    seedLessonPage();
    mockState.exams.push(makeExam({ id: 'exam-1', lesson_id: 'lesson-1', title: 'اختبار الدرس الأول' }));
    mockState.examQuestions.push(
      makeExamQuestion({
        id: 'question-1',
        exam_id: 'exam-1',
        type: 'mcq',
        prompt: 'ما عاصمة مصر؟',
        choices: ['القاهرة', 'الإسكندرية'],
        correct_index: 0,
        max_score: 1,
        sort_order: 1,
      }),
    );
    renderApp('/student/lessons/lesson-1');

    fireEvent.click(await screen.findByTestId('lesson-tab-exams'));
    fireEvent.click(await screen.findByTestId('exam-submit-exam-1'));

    expect(await screen.findByText('يرجى الإجابة على جميع الأسئلة قبل الإرسال')).toBeInTheDocument();
    expect(expectRpcCall('submit_exam_attempt')).toBeUndefined();
  });
});

describe('StudentLessonPage — comments tab', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: 'grade-1' });
    hlsMock.handlers.length = 0;
  });

  it('lists comments, adds a new one, replies, and deletes an own comment', async () => {
    seedLessonPage();
    mockState.lessonComments.push(
      makeLessonComment({
        id: 'comment-1',
        lesson_id: 'lesson-1',
        author_id: 'user-test-1',
        author_name: 'أحمد محمد',
        body: 'شرح ممتاز، شكرًا للأستاذ',
      }),
      makeLessonComment({
        id: 'comment-2',
        lesson_id: 'lesson-1',
        author_id: 'user-student-2',
        author_name: 'منى علي',
        body: 'هل يمكن إعادة الشرح؟',
        parent_id: 'comment-1',
      }),
    );
    renderApp('/student/lessons/lesson-1');

    fireEvent.click(await screen.findByTestId('lesson-tab-comments'));

    expect(await screen.findByTestId('comment-comment-1')).toBeInTheDocument();
    expect(screen.getByText('شرح ممتاز، شكرًا للأستاذ')).toBeInTheDocument();
    expect(screen.getByText('منى علي')).toBeInTheDocument();
    expect(screen.queryByTestId('comment-delete-comment-2')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('comment-input'), {
      target: { value: 'ملاحظة جديدة على الدرس' },
    });
    fireEvent.click(screen.getByTestId('comment-submit'));

    await waitFor(() => expect(expectRpcCall('add_lesson_comment')).toBeTruthy());
    expect(expectRpcCall('add_lesson_comment')).toEqual({
      p_lesson_id: 'lesson-1',
      p_body: 'ملاحظة جديدة على الدرس',
      p_parent_id: null,
    });
    expect(await screen.findByText('ملاحظة جديدة على الدرس')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('reply-toggle-comment-1'));
    fireEvent.change(screen.getByTestId('reply-input-comment-1'), {
      target: { value: 'شكرًا لملاحظتك' },
    });
    fireEvent.click(screen.getByTestId('reply-submit-comment-1'));

    await waitFor(() => {
      const calls = getRpcCalls().filter((call) => call.fn === 'add_lesson_comment');
      expect(calls.at(-1)?.args).toEqual({
        p_lesson_id: 'lesson-1',
        p_body: 'شكرًا لملاحظتك',
        p_parent_id: 'comment-1',
      });
    });
    expect(await screen.findByText('شكرًا لملاحظتك')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('comment-delete-comment-1'));

    await waitFor(() => expect(expectRpcCall('delete_lesson_comment')).toEqual({ p_comment_id: 'comment-1' }));
    expect(screen.queryByText('شرح ممتاز، شكرًا للأستاذ')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no comments', async () => {
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    fireEvent.click(await screen.findByTestId('lesson-tab-comments'));

    expect(await screen.findByText('لا توجد تعليقات بعد')).toBeInTheDocument();
  });
});
