import { PartyPopper, Users } from 'lucide-react';

import { LAB_FUN_CHALLENGE } from './funLabsData';
import { FunShell, FunProgressBar } from './mockKit';

/**
 * Labs fun variant 4 — تحدي الأسبوع الودي.
 * Collective class goal with shared progress — everyone wins, no ranking.
 * UI mock only: no backend, no persistence, noindex.
 */
export function Fun4() {
  const percent = Math.round((LAB_FUN_CHALLENGE.current / LAB_FUN_CHALLENGE.target) * 100);
  return (
    <FunShell testId="labs-fun4">
      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-medium">
        <div className="p-5 sm:p-6" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-chart-2) 16%, transparent), transparent 70%)' }}>
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <PartyPopper className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-black text-foreground">{LAB_FUN_CHALLENGE.title}</h3>
              <p className="mt-0.5 text-xs text-foreground-muted">فاضل {LAB_FUN_CHALLENGE.daysLeft} أيام — {LAB_FUN_CHALLENGE.contributors} طالب مشارك</p>
            </div>
          </div>
          <p className="mt-4 font-display text-3xl font-black tabular-nums text-foreground">
            {LAB_FUN_CHALLENGE.current}
            <span className="text-base font-bold text-foreground-subtle"> / {LAB_FUN_CHALLENGE.target} {LAB_FUN_CHALLENGE.unit}</span>
          </p>
          <div className="mt-3">
            <FunProgressBar percent={percent} testId="fun-challenge-bar" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex -space-x-2 space-x-reverse" aria-hidden="true">
              {LAB_FUN_CHALLENGE.contributorNames.map((n, i) => (
                <span key={i} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-accent-soft text-[11px] font-black text-accent-strong">
                  {n}
                </span>
              ))}
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-foreground-muted">
              <Users aria-hidden="true" className="h-3.5 w-3.5" />
              دفعتك كلها بتساهم
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border-muted p-4 sm:flex-row">
          <button type="button" data-testid="fun-challenge-cta" className="btn-primary inline-flex h-11 flex-1 items-center justify-center rounded-xl text-sm font-black">
            ساهم بدرس النهاردة
          </button>
          <p className="inline-flex flex-1 items-center justify-center text-center text-xs leading-6 text-foreground-subtle">
            هدف جماعي — الكل كسبان ومفيش ترتيب ولا خاسر
          </p>
        </div>
      </div>
    </FunShell>
  );
}
