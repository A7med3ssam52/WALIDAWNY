import { Check, Flame, HeartHandshake, ShieldCheck } from 'lucide-react';

import { LAB_FUN_STREAK } from './funLabsData';
import { FunShell } from './mockKit';
import { cn } from '../../../lib/cn';

/**
 * Labs fun variant 3 — سلسلة لطيفة.
 * Gentle day-streak with a weekly freeze day and kind messaging on breaks.
 * No harsh punishment by design. UI mock only.
 */
export function Fun3() {
  return (
    <FunShell testId="labs-fun3">
      <div className="overflow-hidden rounded-3xl border border-border bg-surface p-5 text-center shadow-medium sm:p-6">
        <span aria-hidden="true" className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning/10 text-warning">
          <Flame className="h-8 w-8" />
        </span>
        <p className="mt-3 font-display text-4xl font-black tabular-nums text-foreground">
          {LAB_FUN_STREAK.currentDays} <span className="text-base font-bold text-foreground-subtle">أيام متتالية</span>
        </p>
        <p className="mt-1 text-xs text-foreground-muted">{LAB_FUN_STREAK.totalMinutesWeek} دقيقة مذاكرة الأسبوع ده — استمر يا بطل</p>

        <ol data-testid="fun-streak-week" className="mx-auto mt-5 grid max-w-md grid-cols-7 gap-1.5" aria-label="أيام الأسبوع">
          {LAB_FUN_STREAK.week.map((d) => (
            <li key={d.day} className="flex flex-col items-center gap-1.5">
              <span
                data-testid={`fun-streak-day-${d.day}`}
                aria-hidden="true"
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-2xl border text-sm',
                  d.done ? 'border-transparent bg-primary text-primary-foreground' : 'border-dashed border-border bg-surface-muted text-foreground-subtle',
                  d.today && !d.done && 'border-primary-strong bg-primary-soft text-primary-strong',
                )}
              >
                {d.done ? <Check className="h-4 w-4" /> : <span className="font-black">{d.day.charAt(0)}</span>}
              </span>
              <span className={cn('text-[10px] font-bold', d.today ? 'text-primary-strong' : 'text-foreground-subtle')}>
                {d.today ? 'اليوم' : d.day}
              </span>
            </li>
          ))}
        </ol>

        <div className="mx-auto mt-5 flex max-w-md items-center gap-3 rounded-2xl border border-info/25 bg-info/[0.07] p-3.5 text-start">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/15 text-info">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <p className="text-xs leading-6 text-foreground">
            <span className="font-black">يوم تجميد متاح</span>
            <span className="block text-foreground-muted">مش فاضي بكرا؟ فعّله والسلسلة محفوظة — بدون ما تخسر حاجة</span>
          </p>
          <button type="button" data-testid="fun-freeze-use" className="shrink-0 rounded-xl bg-info px-3.5 py-2 text-xs font-black text-white">
            تفعيل
          </button>
        </div>

        <p className="mx-auto mt-4 flex max-w-md items-center justify-center gap-1.5 text-xs leading-6 text-foreground-subtle">
          <HeartHandshake aria-hidden="true" className="h-4 w-4 shrink-0 text-success" />
          انقطعت يوم؟ عادي جدًا — كمّل من النهاردة والسلسلة ترجع تكبر
        </p>
      </div>
    </FunShell>
  );
}
