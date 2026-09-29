import type { ReactNode } from 'react';

/**
 * Shared mock kit for /labs/fun variants — UI only, theme tokens only.
 */

export function FunShell({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div dir="rtl" data-testid={testId} className="flex flex-col gap-4">
      {children}
    </div>
  );
}

export function FunProgressBar({ percent, testId }: { percent: number; testId: string }) {
  return (
    <div data-testid={testId} className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${percent}%`, background: 'linear-gradient(to left, var(--color-chart-1), var(--color-chart-2))' }}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
