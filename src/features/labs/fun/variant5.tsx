import { Lock } from 'lucide-react';

import { LAB_FUN_BADGES } from './funLabsData';
import { FunShell } from './mockKit';
import { cn } from '../../../lib/cn';

/**
 * Labs fun variant 5 — شارات المجهود.
 * Badges for effort and consistency, never for rank.
 * UI mock only: no backend, no persistence, noindex.
 */
export function Fun5() {
  const earned = LAB_FUN_BADGES.filter((b) => b.earned).length;
  return (
    <FunShell testId="labs-fun5">
      <div className="rounded-3xl border border-border bg-surface p-5 text-center shadow-medium">
        <p className="font-display text-2xl font-black text-foreground">
          {earned} <span className="text-sm font-bold text-foreground-subtle">من {LAB_FUN_BADGES.length} شارات</span>
        </p>
        <p className="mt-1 text-xs text-foreground-muted">شارات على مجهودك واستمرارك — مش على ترتيبك</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {LAB_FUN_BADGES.map((badge) => (
          <article
            key={badge.id}
            data-testid={`fun-badge-${badge.id}`}
            data-earned={badge.earned}
            className={cn(
              'flex flex-col items-center rounded-3xl border p-4 text-center shadow-sm',
              badge.earned ? 'border-border bg-surface' : 'border-dashed border-border bg-surface-muted/40',
            )}
          >
            <span aria-hidden="true" className={cn('text-4xl', !badge.earned && 'opacity-40 grayscale')}>
              {badge.earned ? badge.icon : <Lock className="h-8 w-8 text-foreground-subtle" />}
            </span>
            <h4 className={cn('mt-2 text-sm font-black', badge.earned ? 'text-foreground' : 'text-foreground-muted')}>{badge.name}</h4>
            <p className="mt-0.5 text-[11px] leading-5 text-foreground-subtle">{badge.description}</p>
            {!badge.earned && badge.hint ? (
              <span className="mt-2 rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-black text-primary-strong">{badge.hint}</span>
            ) : badge.earned ? (
              <span className="mt-2 rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-black text-success">حصلت عليها ✓</span>
            ) : null}
          </article>
        ))}
      </div>
    </FunShell>
  );
}
