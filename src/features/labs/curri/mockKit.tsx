import type { ReactNode } from 'react';
import { Check, Lock, Play } from 'lucide-react';

import type { LabLessonStatus } from './curriLabsData';

/**
 * Shared mock kit for /labs/curri variants — UI only, theme tokens only.
 */

export function CurriShell({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div dir="rtl" data-testid={testId} className="flex flex-col gap-4">
      {children}
    </div>
  );
}

export function ProgressRing({ percent, size = 52 }: { percent: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`التقدم ${percent}٪`}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-border" stroke="currentColor" opacity={0.15} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * percent) / 100}
          style={{ stroke: 'var(--color-primary)' }}
        />
      </svg>
      <span className="absolute text-[11px] font-black tabular-nums text-foreground">{percent}٪</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: LabLessonStatus }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-black text-success">
        <Check aria-hidden="true" className="h-3 w-3" />
        مكتمل
      </span>
    );
  }
  if (status === 'in-progress') {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-black text-warning">
        جاري
      </span>
    );
  }
  if (status === 'trial-open' || status === 'locked') {
    if (status === 'locked') {
      return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-black text-foreground-subtle">
          <Lock aria-hidden="true" className="h-3 w-3" />
          مقفول
        </span>
      );
    }
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-black text-info">
        مجاني
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-bold text-foreground-muted">
      جديد
    </span>
  );
}

export function LessonIcon({ status }: { status: LabLessonStatus }) {
  if (status === 'completed') {
    return (
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
        <Check className="h-4 w-4" />
      </span>
    );
  }
  if (status === 'locked') {
    return (
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-foreground-subtle">
        <Lock className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-strong">
      <Play className="h-4 w-4" />
    </span>
  );
}
