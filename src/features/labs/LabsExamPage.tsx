import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, FlaskConical, Timer } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { SeoHead } from '../../components/SeoHead';
import type { GeneralExamRow } from '../../types/database';
import { LiveExamCard } from '../student/LiveExamCard';
import { LeaderboardCard } from '../exams/LeaderboardCard';
import { formatCountdown } from '../exams/generalExamUtils';
import {
  buildLabsLeaderboard,
  gradeLabsExam,
  LABS_DURATION_MS,
  LABS_QUESTIONS,
  LABS_TOTAL_SCORE,
  type LabsResult,
} from './labsExamData';

const CHOICE_LABELS = ['أ', 'ب', 'ج', 'د'];

/** Mock rows so /labs/exam showcases the dashboard live-exam card design. */
function labsCardPreviewRows(): GeneralExamRow[] {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const base = {
    grade_id: 'lab-grade',
    grade_name: 'الثالث الثانوي',
    sort_order: 0,
    passing_score: 50,
    status: 'published' as const,
    show_leaderboard: true,
    question_count: 10,
    attempt_count: 24,
    my_attempt_id: null,
    my_status: null,
    created_at: iso(now),
    updated_at: iso(now),
  };
  return [
    {
      ...base,
      id: 'lab-card-exam-1',
      title: 'امتحان شامل — الفصل الأول',
      starts_at: iso(now - 30 * 60_000),
      ends_at: iso(now + 90 * 60_000),
      duration_minutes: 60,
    },
    {
      ...base,
      id: 'lab-card-exam-2',
      title: 'اختبار سريع — الكهربية',
      starts_at: iso(now - 10 * 60_000),
      ends_at: iso(now + 50 * 60_000),
      duration_minutes: 30,
    },
  ];
}

type Phase = 'intro' | 'taking' | 'submitted';
type ResultTab = 'result' | 'leaderboard' | 'review';

export function LabsExamPage() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [choices, setChoices] = useState<Record<string, number | null>>({});
  const [essays, setEssays] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LabsResult | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>('result');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const autoSubmittedRef = useRef(false);

  const deadlineMs = useMemo(
    () => (startedAt === null ? null : startedAt + LABS_DURATION_MS),
    [startedAt],
  );

  useEffect(() => {
    if (phase !== 'taking' || deadlineMs === null) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase, deadlineMs]);

  const remainingMs = deadlineMs === null ? null : Math.max(0, deadlineMs - nowMs);

  const handleSubmit = useCallback(
    (auto = false) => {
      if (submitting) return;
      if (auto) {
        if (autoSubmittedRef.current) return;
        autoSubmittedRef.current = true;
      } else {
        const unanswered = LABS_QUESTIONS.some((question) =>
          question.type === 'mcq'
            ? (choices[question.id] ?? null) === null
            : !(essays[question.id] ?? '').trim(),
        );
        if (unanswered) {
          setSubmitError('يرجى الإجابة على جميع الأسئلة قبل الإرسال (وضع تجريبي).');
          return;
        }
      }
      setSubmitError(null);
      setSubmitting(true);
      // Simulate network latency so the loading state is visible.
      window.setTimeout(() => {
        setResult(gradeLabsExam({ choices, essays }));
        setSubmitting(false);
        setResultTab('result');
        setPhase('submitted');
      }, 600);
    },
    [submitting, choices, essays],
  );

  useEffect(() => {
    if (phase === 'taking' && deadlineMs !== null && remainingMs === 0 && !submitting) {
      void handleSubmit(true);
    }
  }, [phase, deadlineMs, remainingMs, submitting, handleSubmit]);

  const handleStart = () => {
    setChoices({});
    setEssays({});
    setResult(null);
    setSubmitError(null);
    autoSubmittedRef.current = false;
    setStartedAt(Date.now());
    setNowMs(Date.now());
    setPhase('taking');
  };

  const board = useMemo(
    () => (result ? buildLabsLeaderboard(result.finalScore) : []),
    [result],
  );

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <SeoHead
        title="معمل تجربة الامتحان | وليد عونى"
        description="صفحة تجريبية لمعاينة تجربة الامتحان كما يراها الطالب: مؤقت ونتيجة وأوائل."
        canonicalPath="/labs/exam"
        noIndex
      />
      <header className="border-b border-white/8 bg-white/3">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-1 text-sm font-bold text-foreground-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
            الرئيسية
          </Link>
          <span className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-300">
            <FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />
            وضع تجريبي — لا تُحفظ أي بيانات
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">امتحان تجريبي — ٣ دقائق</h1>
          <p className="mt-1 text-sm text-foreground-subtle">
            نفس شاشات الطالب الحقيقية: مؤقت، إرسال، نتيجة، أوائل، مراجعة.
          </p>
        </div>

        {phase === 'intro' ? (
          <div className="mb-6 flex flex-col gap-2">
            <p className="text-xs font-bold text-foreground-subtle">
              هكذا يظهر كارت «امتحان جاري الآن» في لوحة تحكم الطالب:
            </p>
            <LiveExamCard previewExams={labsCardPreviewRows()} />
          </div>
        ) : null}

        {phase === 'intro' ? (
          <Card title="تعليمات الامتحان" subtitle="٦ أسئلة • الدرجة الكلية ٧ • النجاح من ٥٠٪">
            <ul className="flex flex-col gap-2 text-sm text-foreground-muted">
              <li>• لديك ٣ دقائق من لحظة الضغط على «ابدأ» — عند انتهاء الوقت تُرسل إجاباتك تلقائياً.</li>
              <li>• الاختياري يُصحح تلقائياً. (في الامتحان الحقيقي المقال يُصححه المدرس — هنا يُحسب تجريبياً.)</li>
              <li>• في الامتحان الحقيقي تظهر الإجابات الصحيحة بعد انتهاء الميعاد لمنع الغش — هنا تظهر فوراً لأنها تجربة.</li>
            </ul>
            <div className="mt-4">
              <Button onClick={handleStart}>ابدأ الامتحان التجريبي</Button>
            </div>
          </Card>
        ) : phase === 'taking' ? (
          <div className="flex flex-col gap-4 pb-24">
            {remainingMs !== null ? (
              <div
                role="timer"
                aria-live="polite"
                className={`sticky top-0 z-10 flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 backdrop-blur-xl ${
                  remainingMs < 30_000
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
              {LABS_QUESTIONS.map((question, index) => (
                <li key={question.id}>
                  <Card padding="sm">
                    <p className="font-bold text-foreground">
                      {index + 1}. {question.prompt}
                      <span className="ms-2 text-xs font-bold text-foreground-subtle">
                        ({question.maxScore} {question.maxScore === 1 ? 'درجة' : 'درجات'})
                      </span>
                    </p>
                    {question.type === 'mcq' ? (
                      <div className="mt-3 grid gap-2">
                        {(question.choices ?? []).map((choice, choiceIndex) => {
                          const selected = choices[question.id] === choiceIndex;
                          return (
                            <button
                              key={choiceIndex}
                              type="button"
                              onClick={() => {
                                setSubmitError(null);
                                setChoices((prev) => ({ ...prev, [question.id]: choiceIndex }));
                              }}
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
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <textarea
                        aria-label={`إجابة السؤال ${index + 1}`}
                        value={essays[question.id] ?? ''}
                        onChange={(event) => {
                          setSubmitError(null);
                          setEssays((prev) => ({ ...prev, [question.id]: event.target.value }));
                        }}
                        rows={3}
                        placeholder="اكتب إجابتك هنا"
                        className="glass-input mt-3 w-full rounded-xl border border-white/10 bg-white/4 px-3 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      />
                    )}
                  </Card>
                </li>
              ))}
            </ol>
            {submitError ? (
              <p role="alert" className="text-sm font-bold text-rose-300">{submitError}</p>
            ) : null}
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/8 bg-[rgba(8,6,22,0.92)] p-3 backdrop-blur-xl">
              <div className="mx-auto max-w-3xl">
                <Button size="lg" className="w-full" loading={submitting} onClick={() => handleSubmit(false)}>
                  إرسال الإجابات
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div role="tablist" aria-label="نتيجة الامتحان التجريبي" className="grid grid-cols-3 gap-2">
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

            {resultTab === 'result' && result ? (
              <Card title="نتيجتك (تجريبية)">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300"
                  >
                    <CheckCircle2 className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="font-display text-2xl font-black text-foreground">
                      {result.finalScore}
                      <span className="text-base font-bold text-foreground-subtle"> / {LABS_TOTAL_SCORE}</span>
                    </p>
                    <p className="mt-1">
                      {result.passed ? (
                        <Badge variant="success">ناجح — أحسنت</Badge>
                      ) : (
                        <Badge variant="error">راسب — حاول مجدداً</Badge>
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <Button size="sm" variant="secondary" onClick={handleStart}>
                    إعادة التجربة
                  </Button>
                </div>
              </Card>
            ) : null}

            {resultTab === 'leaderboard' ? (
              <LeaderboardCard rows={board} highlightStudentId="lab-you" totalScore={LABS_TOTAL_SCORE} />
            ) : null}

            {resultTab === 'review' && result ? (
              <ol className="flex flex-col gap-3">
                {LABS_QUESTIONS.map((question, index) => (
                  <li key={question.id}>
                    <Card padding="sm">
                      <p className="font-bold text-foreground">
                        {index + 1}. {question.prompt}
                      </p>
                      {question.type === 'mcq' ? (
                        <ul className="mt-2 flex flex-col gap-1 text-sm">
                          {(question.choices ?? []).map((choice, i) => {
                            const isCorrect = i === question.correctIndex;
                            const isMine = i === (choices[question.id] ?? null);
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
                            إجابتك: {essays[question.id]?.trim() || '—'}
                          </p>
                          <p className="mt-1 text-xs text-foreground-subtle">
                            في الامتحان الحقيقي يصحح المقال يدوياً — هنا احتُسب تجريبياً.
                          </p>
                        </div>
                      )}
                      <p className="mt-1 text-xs font-bold text-foreground-subtle">
                        درجتك في السؤال: {result.perQuestion[question.id] ?? 0} / {question.maxScore}
                      </p>
                    </Card>
                  </li>
                ))}
              </ol>
            ) : null}

            {!result ? (
              <EmptyState title="لا توجد نتيجة" description="ابدأ الامتحان ثم أرسل إجاباتك." />
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
