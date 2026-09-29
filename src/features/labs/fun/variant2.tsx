import { useState } from 'react';
import { Check, Flame, HelpCircle } from 'lucide-react';

import { LAB_FUN_QUESTION } from './funLabsData';
import { FunShell } from './mockKit';
import { cn } from '../../../lib/cn';

/**
 * Labs fun variant 2 — سؤال اليوم.
 * One quick MCQ a day with instant feedback + peer stats.
 * UI mock only: no backend, no persistence, noindex.
 */
export function Fun2() {
  const [choice, setChoice] = useState<number | null>(null);
  const answered = choice !== null;
  const correct = choice === LAB_FUN_QUESTION.correctIndex;

  return (
    <FunShell testId="labs-fun2">
      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-medium">
        <div className="flex items-center gap-3 border-b border-border-muted p-5">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong">
            <HelpCircle className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-black text-foreground">سؤال اليوم</h3>
            <p className="text-xs text-foreground-muted">دقيقة واحدة — {LAB_FUN_QUESTION.answeredCount} طالب جاوبوا النهاردة</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-[11px] font-black text-warning">
            <Flame aria-hidden="true" className="h-3 w-3" />
            ٤ أيام
          </span>
        </div>

        <div className="p-5">
          <p className="font-bold leading-8 text-foreground">{LAB_FUN_QUESTION.prompt}</p>
          <div className="mt-4 grid gap-2" role="group" aria-label="اختيارات سؤال اليوم">
            {LAB_FUN_QUESTION.choices.map((text, i) => {
              const picked = choice === i;
              const isCorrect = i === LAB_FUN_QUESTION.correctIndex;
              return (
                <button
                  key={text}
                  type="button"
                  data-testid={`fun-daily-choice-${i}`}
                  disabled={answered}
                  onClick={() => setChoice(i)}
                  aria-pressed={picked}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-start text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong/50',
                    !answered && 'border-border bg-surface text-foreground-muted hover:border-primary/50 hover:text-foreground',
                    answered && isCorrect && 'border-success bg-success/10 text-foreground',
                    answered && picked && !isCorrect && 'border-error/50 bg-error/[0.07] text-foreground',
                    answered && !picked && !isCorrect && 'border-border bg-surface-muted/40 text-foreground-subtle',
                  )}
                >
                  <span aria-hidden="true" className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black',
                    answered && isCorrect ? 'bg-success text-white' : picked ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-foreground-subtle',
                  )}>
                    {answered && isCorrect ? <Check className="h-4 w-4" /> : ['أ', 'ب', 'ج', 'د'][i]}
                  </span>
                  <span className="flex-1">{text}</span>
                </button>
              );
            })}
          </div>

          {answered ? (
            <div data-testid="fun-daily-result" className={cn(
              'mt-4 rounded-2xl border p-4 text-sm leading-7',
              correct ? 'border-success/30 bg-success/[0.07]' : 'border-warning/30 bg-warning/[0.07]',
            )}>
              <p className="font-black text-foreground">{correct ? 'صح — عاش! 🔥' : 'قريبة! الإجابة الصحيحة: تتضاعف'}</p>
              <p className="mt-1 text-foreground-muted">{LAB_FUN_QUESTION.explanation}</p>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs font-bold text-foreground-muted">
                  <span>اللي جاوبوا صح النهاردة</span>
                  <span className="tabular-nums">{LAB_FUN_QUESTION.correctPercent}٪</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${LAB_FUN_QUESTION.correctPercent}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-center text-xs text-foreground-subtle">اختار إجابة وشوف الشرح فورًا — بكرا سؤال جديد</p>
          )}
        </div>
      </div>
    </FunShell>
  );
}
