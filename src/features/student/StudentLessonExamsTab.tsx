import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Timer } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import {
  getExamQuestions,
  getMyExamAttempt,
  getRpcErrorCode,
  listExams,
  submitExam,
} from '../../data/rpc';
import { formatDate } from '../../lib/format';
import type { Exam, ExamAttempt, ExamQuestion } from '../../types/database';

const SUBMIT_ERROR_MESSAGES: Record<string, string> = {
  exam_not_found: 'الاختبار غير موجود',
  access_denied: 'لا تملك صلاحية الوصول لهذا الاختبار',
  attempt_already_exists: 'لقد أرسلت إجابتك من قبل',
  invalid_answers: 'يرجى الإجابة على جميع الأسئلة قبل الإرسال',
};

function submitErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && SUBMIT_ERROR_MESSAGES[code]) {
    return SUBMIT_ERROR_MESSAGES[code];
  }
  return 'تعذر إرسال الإجابة. حاول مرة أخرى';
}

function ExamSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-6 w-1/4" />
    </div>
  );
}

interface StudentLessonExamsTabProps {
  lessonId: string;
}

export function StudentLessonExamsTab({ lessonId }: StudentLessonExamsTabProps) {
  const { showToast } = useToast();
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [questionsByExam, setQuestionsByExam] = useState<Record<string, ExamQuestion[]>>({});
  const [attempts, setAttempts] = useState<Record<string, ExamAttempt | null>>({});
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [essayTexts, setEssayTexts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const examRows = await listExams(lessonId);
      setExams(examRows);
      const [questionGroups, attemptRows] = await Promise.all([
        Promise.all(examRows.map((exam) => getExamQuestions(exam.id))),
        Promise.all(examRows.map((exam) => getMyExamAttempt(exam.id))),
      ]);
      setQuestionsByExam(
        Object.fromEntries(examRows.map((exam, index) => [exam.id, questionGroups[index]])),
      );
      setAttempts(
        Object.fromEntries(examRows.map((exam, index) => [exam.id, attemptRows[index]])),
      );
    } catch {
      setLoadError(true);
    }
  }, [lessonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalScore = (examId: string): number =>
    (questionsByExam[examId] ?? []).reduce((sum, question) => sum + (question.max_score ?? 0), 0);

  const handleSubmit = async (exam: Exam) => {
    const questions = questionsByExam[exam.id] ?? [];
    const payload = questions.map((question) => {
      if (question.type === 'mcq') {
        return {
          questionId: question.id,
          choiceIndex: answers[question.id] ?? null,
        };
      }
      return {
        questionId: question.id,
        answerText: (essayTexts[question.id] ?? '').trim(),
      };
    });
    const complete = questions.every((question) =>
      question.type === 'mcq'
        ? answers[question.id] != null
        : (essayTexts[question.id] ?? '').trim().length > 0,
    );
    if (!complete) {
      setSubmitError(SUBMIT_ERROR_MESSAGES.invalid_answers);
      return;
    }
    setSubmitError(null);
    setSubmittingId(exam.id);
    try {
      await submitExam(exam.id, payload);
      showToast('تم إرسال إجابتك بنجاح');
      await load();
    } catch (error) {
      setSubmitError(submitErrorMessage(error));
    } finally {
      setSubmittingId(null);
    }
  };

  if (loadError) {
    return <ErrorState message="تعذر تحميل الاختبارات" onRetry={() => void load()} />;
  }

  if (exams === null) {
    return <ExamSkeleton />;
  }

  if (exams.length === 0) {
    return (
      <EmptyState
        title="لا توجد اختبارات بعد"
        description="سيضيف الأستاذ اختبارات لهذا الدرس عند توفرها."
        icon={<ClipboardList className="h-6 w-6" />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="lesson-exams-tab">
      {exams.map((exam) => {
        const attempt = attempts[exam.id] ?? null;
        const questions = questionsByExam[exam.id] ?? [];
        const total = totalScore(exam.id);
        const isSubmitting = submittingId === exam.id;
        return (
          <Card
            key={exam.id}
            title={exam.title}
            subtitle={attempt ? formatDate(attempt.submitted_at) : undefined}
            data-testid={`exam-card-${exam.id}`}
          >
            {attempt ? (
              <div data-testid={`exam-result-${exam.id}`}>
                <div className="flex flex-wrap items-center gap-3">
                  {attempt.status === 'graded' ? (
                    <Badge variant="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                      تم التصحيح
                    </Badge>
                  ) : (
                    <Badge variant="warning" icon={<Timer className="h-3.5 w-3.5" />}>
                      بانتظار تصحيح الأستاذ
                    </Badge>
                  )}
                  {attempt.final_score != null ? (
                    <span className="text-sm font-semibold text-foreground">
                      نتيجتك: {attempt.final_score} من {total}
                    </span>
                  ) : null}
                </div>
                {attempt.status === 'submitted' ? (
                  <p className="mt-3 text-sm text-foreground-muted">
                    تم استلام إجابتك وسيتم إعلان النتيجة بعد التصحيح.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-foreground-muted">
                  <Badge variant="neutral">درجة النجاح: {exam.passing_score}</Badge>
                  <Badge variant="neutral">{questions.length} سؤال</Badge>
                </div>
                {questions.map((question, questionIndex) => (
                  <div
                    key={question.id}
                    className="rounded-xl border border-white/10 bg-white/4 p-4"
                    data-testid={`exam-question-${question.id}`}
                  >
                    <p className="font-medium text-foreground">
                      {questionIndex + 1}. {question.prompt}
                    </p>
                    {question.type === 'mcq' ? (
                      <div className="mt-3 flex flex-col gap-2">
                        {(question.choices ?? []).map((choice, choiceIndex) => {
                          const choiceId = `choice-${question.id}-${choiceIndex}`;
                          return (
                            <label
                              key={choiceId}
                              htmlFor={choiceId}
                              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                                answers[question.id] === choiceIndex
                                  ? 'border-primary/50 bg-primary/10 text-foreground'
                                  : 'border-white/10 bg-white/4 text-foreground-muted hover:border-white/20 hover:text-foreground'
                              }`}
                            >
                              <input
                                id={choiceId}
                                type="radio"
                                name={`question-${question.id}`}
                                checked={answers[question.id] === choiceIndex}
                                onChange={() =>
                                  setAnswers((prev) => ({ ...prev, [question.id]: choiceIndex }))
                                }
                                className="h-4 w-4 accent-[var(--color-primary)]"
                              />
                              {choice}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <textarea
                        aria-label={`إجابة السؤال ${questionIndex + 1}`}
                        value={essayTexts[question.id] ?? ''}
                        onChange={(event) =>
                          setEssayTexts((prev) => ({
                            ...prev,
                            [question.id]: event.target.value,
                          }))
                        }
                        rows={3}
                        className="mt-3 w-full rounded-lg border border-white/15 bg-white/5 p-3 text-sm text-foreground placeholder:text-foreground-subtle/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="اكتب إجابتك هنا..."
                      />
                    )}
                  </div>
                ))}
                {submitError ? (
                  <p role="alert" className="text-sm font-medium text-error">
                    {submitError}
                  </p>
                ) : null}
                <div className="flex items-center justify-end gap-3">
                  <Button
                    onClick={() => void handleSubmit(exam)}
                    loading={isSubmitting}
                    data-testid={`exam-submit-${exam.id}`}
                  >
                    إرسال الإجابة
                  </Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
