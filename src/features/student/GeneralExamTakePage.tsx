import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardList, Lock, Timer } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { Skeleton } from '../../components/Skeleton';
import { StudentNav } from '../../components/StudentNav';
import { useToast } from '../../components/Toast';
import {
  getExamImageSignedUrls,
  getExamQuestions,
  getGeneralExamLeaderboard,
  getGeneralExamReview,
  getMyExamAttempt,
  listAttemptAnswers,
  listGeneralExams,
  startGeneralExamAttempt,
  submitGeneralExam,
  type ExamAnswerInput,
} from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type {
  ExamAttempt,
  ExamQuestion,
  GeneralExamLeaderboardRow,
  GeneralExamReviewRow,
  GeneralExamRow,
} from '../../types/database';
import { LeaderboardCard } from '../exams/LeaderboardCard';
import {
  formatCountdown,
  getAttemptDeadlineMs,
  getGeneralExamTimeState,
  generalExamErrorMessage,
} from '../exams/generalExamUtils';
import { useAuth } from '../auth/AuthContext';

const CHOICE_LABELS = ['أ', 'ب', 'ج', 'د'];

type Phase = 'loading' | 'intro' | 'taking' | 'submitted';
type ResultTab = 'result' | 'leaderboard' | 'review';

export function GeneralExamTakePage() {
  const { examId } = useParams<{ examId: string }>();
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [exam, setExam] = useState<GeneralExamRow | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [hasAnswers, setHasAnswers] = useState(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState(false);

  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [essayTexts, setEssayTexts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const autoSubmittedRef = useRef(false);

  const [imageUrls, setImageUrls] = useState<
    Record<string, { promptUrl: string | null; choiceUrls: (string | null)[] | null }>
  >({});
  const [resultTab, setResultTab] = useState<ResultTab>('result');
  const [board, setBoard] = useState<GeneralExamLeaderboardRow[] | null>(null);
  const [boardHidden, setBoardHidden] = useState(false);
  const [review, setReview] = useState<GeneralExamReviewRow[] | null>(null);
  const [reviewLocked, setReviewLocked] = useState(false);

  const load = useCallback(async () => {
    if (!examId) return;
    setLoadError(false);
    setPhase('loading');
    try {
      const rows = await listGeneralExams();
      const found = rows.find((row) => row.id === examId) ?? null;
      if (!found) {
        setLoadError(true);
        return;
      }
      setExam(found);
      const [qs, myAttempt] = await Promise.all([
        getExamQuestions(examId),
        getMyExamAttempt(examId),
      ]);
      setQuestions(qs);
      setAttempt(myAttempt);
      if (myAttempt) {
        const myAnswers = await listAttemptAnswers(myAttempt.id);
        const submitted = myAnswers.length > 0;
        setHasAnswers(submitted);
        setPhase(submitted ? 'submitted' : 'taking');
      } else {
        setPhase('intro');
      }
      const hasImages = qs.some(
        (q) => q.prompt_image_path || (q.choice_image_paths && (q.choice_image_paths as unknown[]).some(Boolean)),
      );
      if (hasImages) {
        try {
          const signed = await getExamImageSignedUrls(examId);
          const map: Record<string, { promptUrl: string | null; choiceUrls: (string | null)[] | null }> = {};
          for (const img of signed) {
            map[img.question_id] = { promptUrl: img.prompt_image_url, choiceUrls: img.choice_image_urls };
          }
          setImageUrls(map);
        } catch {
          // best-effort
        }
      }
    } catch {
      setLoadError(true);
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  const deadlineMs = useMemo(() => {
    if (!exam || !attempt?.started_at) return null;
    return getAttemptDeadlineMs(attempt.started_at, exam.duration_minutes, exam.ends_at);
  }, [exam, attempt]);

  // 1s ticker while taking
  useEffect(() => {
    if (phase !== 'taking' || deadlineMs === null) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase, deadlineMs]);

  const remainingMs = deadlineMs === null ? null : Math.max(0, deadlineMs - nowMs);
  const timeState = exam ? getGeneralExamTimeState(exam, nowMs) : 'live';

  const handleStart = async () => {
    if (!examId) return;
    setStarting(true);
    try {
      const row = await startGeneralExamAttempt(examId);
      setAttempt(row);
      autoSubmittedRef.current = false;
      setPhase('taking');
      showToast('بدأ الامتحان — بالتوفيق', 'success');
    } catch (error) {
      showToast(generalExamErrorMessage(error), 'error');
    } finally {
      setStarting(false);
    }
  };

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (!examId || submitting || (auto && autoSubmittedRef.current)) return;
      if (auto) autoSubmittedRef.current = true;
      const payload: ExamAnswerInput[] = [];
      for (const question of questions) {
        if (question.type === 'mcq') {
          const choice = answers[question.id] ?? null;
          if (choice === null && !auto) {
            showToast('يرجى الإجابة على جميع الأسئلة قبل الإرسال', 'error');
            return;
          }
          payload.push({ questionId: question.id, choiceIndex: choice, answerText: null });
        } else {
          const text = (essayTexts[question.id] ?? '').trim();
          if (!text && !auto) {
            showToast('يرجى الإجابة على جميع الأسئلة قبل الإرسال', 'error');
            return;
          }
          payload.push({ questionId: question.id, choiceIndex: null, answerText: text || '—' });
        }
      }
      setSubmitting(true);
      try {
        const row = await submitGeneralExam(examId, payload);
        setAttempt(row);
        setHasAnswers(true);
        setPhase('submitted');
        setResultTab('result');
        showToast(
          row.status === 'graded' ? 'تم الإرسال والتصحيح التلقائي' : 'تم الإرسال — المقال بانتظار التصحيح',
          'success',
        );
      } catch (error) {
        if (auto) autoSubmittedRef.current = false;
        showToast(generalExamErrorMessage(error), 'error');
      } finally {
        setSubmitting(false);
      }
    },
    [examId, submitting, questions, answers, essayTexts, showToast],
  );

  // auto-submit when the timer hits zero
  useEffect(() => {
    if (phase === 'taking' && deadlineMs !== null && remainingMs === 0 && !submitting) {
      void handleSubmit(true);
    }
  }, [phase, deadlineMs, remainingMs, submitting, handleSubmit]);

  const loadBoard = useCallback(async () => {
    if (!examId) return;
    try {
      setBoard(await getGeneralExamLeaderboard(examId));
    } catch {
      setBoard([]);
      setBoardHidden(true);
    }
  }, [examId]);

  const loadReview = useCallback(async () => {
    if (!examId) return;
    try {
      setReview(await getGeneralExamReview(examId));
    } catch {
      setReview([]);
      setReviewLocked(true);
    }
  }, [examId]);

  useEffect(() => {
    if (phase !== 'submitted') return;
    if (resultTab === 'leaderboard' && board === null) void loadBoard();
    if (resultTab === 'review' && review === null) void loadReview();
  }, [phase, resultTab, board, review, loadBoard, loadReview]);

  const totalScore = questions.reduce((sum, q) => sum + Number(q.max_score ?? 0), 0);

  if (loadError || !examId) {
    return (
      <LayoutShell title="الامتحان" variant="sidebar" nav={<StudentNav />}>
        <ErrorState message="تعذر تحميل الامتحان" onRetry={() => void load()} />
      </LayoutShell>
    );
  }

  return (
    <LayoutShell
      title={exam?.title ?? 'الامتحان'}
      subtitle={
        exam
          ? `${exam.grade_name} • ${questions.length} سؤال • ${exam.duration_minutes != null ? `${exam.duration_minutes} دقيقة` : 'بدون مؤقت'}`
          : undefined
      }
      variant="sidebar"
      nav={<StudentNav />}
      actions={
        <Link to="/student/exams">
          <Button size="sm" variant="ghost" icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}>
            امتحاناتي
          </Button>
        </Link>
      }
    >
      {phase === 'loading' || !exam ? (
        <div className="flex flex-col gap-4" aria-hidden="true">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : phase === 'intro' ? (
        <div className="flex flex-col gap-4">
          <Card
            title="تعليمات الامتحان"
            subtitle={`الميعاد: ${exam.starts_at ? formatDateTime(exam.starts_at) : 'مفتوح'} ← ${exam.ends_at ? formatDateTime(exam.ends_at) : 'بدون نهاية'}`}
          >
            <ul className="flex flex-col gap-2 text-sm text-foreground-muted">
              <li>• محاولة واحدة فقط — تأكد من إجاباتك قبل الإرسال.</li>
              {exam.duration_minutes != null ? (
                <li>• لديك {exam.duration_minutes} دقيقة من لحظة الضغط على «ابدأ»، والمؤقت يُحسب من سيرفر المنصة.</li>
              ) : null}
              <li>• الاختياري يُصحح تلقائياً، والمقالي يحتاج تصحيح المدرس.</li>
              <li>• الإجابات الصحيحة تظهر بعد انتهاء ميعاد الامتحان لمنع الغش.</li>
            </ul>
            <div className="mt-4">
              {timeState === 'upcoming' ? (
                <p className="text-sm font-bold text-sky-300">
                  الامتحان يبدأ {exam.starts_at ? formatDateTime(exam.starts_at) : ''} — عُد في الميعاد.
                </p>
              ) : timeState === 'ended' ? (
                <p className="text-sm font-bold text-foreground-muted">انتهى ميعاد هذا الامتحان.</p>
              ) : (
                <Button loading={starting} onClick={() => void handleStart()}>
                  ابدأ الامتحان الآن
                </Button>
              )}
            </div>
          </Card>
        </div>
      ) : phase === 'taking' ? (
        <div className="flex flex-col gap-4 pb-24">
          {remainingMs !== null ? (
            <div
              role="timer"
              aria-live="polite"
              className={`sticky top-0 z-10 flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 backdrop-blur-xl ${
                remainingMs < 5 * 60_000
                  ? 'border-rose-400/40 bg-rose-500/15'
                  : 'border-white/10 bg-[rgba(8,6,22,0.85)]'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Timer aria-hidden="true" className="h-4 w-4" />
                الوقت المتبقي
              </span>
              <span className="font-display text-xl font-black tabular-nums text-foreground">
                {formatCountdown(remainingMs)}
              </span>
            </div>
          ) : null}
          <ol className="flex flex-col gap-3">
            {questions.map((question, index) => (
              <li key={question.id}>
                <Card padding="sm">
                  <p className="font-bold text-foreground">
                    {index + 1}. {question.prompt}
                    <span className="ms-2 text-xs font-bold text-foreground-subtle">({question.max_score} درجة)</span>
                  </p>
                  {imageUrls[question.id]?.promptUrl ? (
                    <img
                      src={imageUrls[question.id].promptUrl ?? ''}
                      alt="صورة السؤال"
                      className="mt-2 max-h-56 w-full rounded-xl border border-white/10 object-contain"
                      loading="lazy"
                    />
                  ) : null}
                  {question.type === 'mcq' ? (
                    <div className="mt-3 grid gap-2">
                      {(question.choices ?? []).map((choice, choiceIndex) => {
                        const selected = answers[question.id] === choiceIndex;
                        const choiceImg = imageUrls[question.id]?.choiceUrls?.[choiceIndex];
                        return (
                          <button
                            key={choiceIndex}
                            type="button"
                            onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: choiceIndex }))}
                            aria-pressed={selected}
                            className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-start text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                              selected
                                ? 'border-primary/60 bg-primary/15 text-white'
                                : 'border-white/8 bg-white/3 text-foreground-muted hover:border-white/20 hover:text-foreground'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                                selected ? 'bg-primary text-white' : 'bg-white/8 text-foreground-subtle'
                              }`}
                            >
                              {CHOICE_LABELS[choiceIndex]}
                            </span>
                            <span className="min-w-0 flex-1">{choice}</span>
                            {choiceImg ? (
                              <img src={choiceImg} alt="" className="h-12 w-12 rounded-lg object-cover" loading="lazy" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      aria-label={`إجابة السؤال ${index + 1}`}
                      value={essayTexts[question.id] ?? ''}
                      onChange={(event) => setEssayTexts((prev) => ({ ...prev, [question.id]: event.target.value }))}
                      rows={4}
                      placeholder="اكتب إجابتك هنا"
                      className="glass-input mt-3 w-full rounded-xl border border-white/10 bg-white/4 px-3 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    />
                  )}
                </Card>
              </li>
            ))}
          </ol>
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/8 bg-[rgba(8,6,22,0.92)] p-3 backdrop-blur-xl lg:bottom-auto lg:sticky lg:rounded-2xl lg:border">
            <Button size="lg" className="w-full" loading={submitting} onClick={() => void handleSubmit(false)}>
              إرسال الإجابات
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div role="tablist" aria-label="نتيجة الامتحان" className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'result', label: 'النتيجة' },
                { id: 'leaderboard', label: 'الأوائل' },
                { id: 'review', label: 'المراجعة' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={resultTab === item.id}
                type="button"
                onClick={() => setResultTab(item.id)}
                className={`rounded-xl px-3 py-3 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                  resultTab === item.id
                    ? 'nav-pill-active text-white'
                    : 'glass-card text-foreground-muted hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {resultTab === 'result' ? (
            <Card
              title="نتيجتك"
              subtitle={attempt ? `أُرسلت ${formatDateTime(attempt.submitted_at)}` : undefined}
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300"
                >
                  <CheckCircle2 className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-display text-2xl font-black text-foreground">
                    {attempt?.final_score ?? attempt?.auto_score ?? 0}
                    <span className="text-base font-bold text-foreground-subtle"> / {totalScore}</span>
                  </p>
                  <p className="text-xs text-foreground-subtle">
                    {attempt?.status === 'graded'
                      ? 'تم التصحيح النهائي'
                      : 'الاختياري مصحح — المقالي بانتظار المدرس'}
                  </p>
                </div>
              </div>
              {attempt && exam.passing_score > 0 && attempt.status === 'graded' ? (
                <p className="mt-3">
                  {(attempt.final_score ?? 0) / Math.max(totalScore, 1) >= exam.passing_score / 100 ? (
                    <Badge variant="success">ناجح — أحسنت</Badge>
                  ) : (
                    <Badge variant="error">راسب — راجع الدروس وحاول في القادم</Badge>
                  )}
                </p>
              ) : null}
            </Card>
          ) : null}

          {resultTab === 'leaderboard' ? (
            boardHidden ? (
              <EmptyState title="قايمة الأوائل مخفية" description="المدرس أخفى الترتيب لهذا الامتحان." />
            ) : (
              <LeaderboardCard
                rows={board}
                highlightStudentId={profile?.id ?? null}
                totalScore={totalScore || null}
              />
            )
          ) : null}

          {resultTab === 'review' ? (
            reviewLocked ? (
              <EmptyState
                title="المراجعة غير متاحة بعد"
                description="الإجابات الصحيحة ستظهر هنا بعد انتهاء ميعاد الامتحان لمنع الغش."
                icon={<Lock aria-hidden="true" className="h-6 w-6" />}
              />
            ) : review === null ? (
              <div className="flex flex-col gap-2" aria-hidden="true">
                <Skeleton className="h-24 w-full rounded-2xl" />
              </div>
            ) : (
              <ol className="flex flex-col gap-3">
                {review.map((row, index) => (
                  <li key={row.question_id}>
                    <Card padding="sm">
                      <p className="font-bold text-foreground">
                        {index + 1}. {row.prompt}
                      </p>
                      {row.q_type === 'mcq' ? (
                        <ul className="mt-2 flex flex-col gap-1 text-sm">
                          {(row.choices ?? []).map((choice, i) => {
                            const isCorrect = i === row.correct_index;
                            const isMine = i === row.my_choice_index;
                            return (
                              <li
                                key={i}
                                className={`rounded-lg px-2 py-1.5 ${
                                  isCorrect
                                    ? 'bg-emerald-400/10 font-bold text-emerald-300'
                                    : isMine
                                      ? 'bg-rose-400/10 text-rose-300'
                                      : 'text-foreground-muted'
                                }`}
                              >
                                {CHOICE_LABELS[i]}. {choice}
                                {isCorrect ? ' ✓ الصحيحة' : ''}
                                {isMine && !isCorrect ? ' (إجابتك)' : ''}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <div className="mt-2 text-sm">
                          <p className="whitespace-pre-wrap rounded-lg bg-white/4 px-2 py-1.5 text-foreground-muted">
                            إجابتك: {row.my_answer_text || '—'}
                          </p>
                          <p className="mt-1 font-bold text-foreground">
                            درجتك: {row.my_score ?? 'بانتظار التصحيح'} / {row.max_score}
                          </p>
                        </div>
                      )}
                      {row.q_type === 'mcq' ? (
                        <p className="mt-1 text-xs font-bold text-foreground-subtle">
                          درجتك في السؤال: {row.my_score ?? 0} / {row.max_score}
                        </p>
                      ) : null}
                    </Card>
                  </li>
                ))}
              </ol>
            )
          ) : null}

          {hasAnswers === false ? (
            <EmptyState
              title="محاولة بدون إجابات"
              description="بدأت الامتحان ولم ترسل الإجابات — ادخل وأكمل المحاولة."
              icon={<ClipboardList aria-hidden="true" className="h-6 w-6" />}
              action={
                <Button size="sm" onClick={() => setPhase('taking')}>
                  إكمال المحاولة
                </Button>
              }
            />
          ) : null}
        </div>
      )}
    </LayoutShell>
  );
}
