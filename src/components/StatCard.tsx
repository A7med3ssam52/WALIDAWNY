import type { ReactNode } from 'react';

export type StatTone = 'default' | 'success' | 'warning' | 'error';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
}

const iconTones: Record<StatTone, string> = {
  default:
    'bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/25 text-indigo-300 shadow-[0_0_24px_-6px_rgba(99,102,241,0.5)]',
  success: 'bg-emerald-400/12 text-emerald-300 shadow-[0_0_24px_-6px_rgba(52,211,153,0.45)]',
  warning: 'bg-amber-400/12 text-amber-300 shadow-[0_0_24px_-6px_rgba(251,191,36,0.45)]',
  error: 'bg-rose-400/12 text-rose-300 shadow-[0_0_24px_-6px_rgba(251,113,133,0.45)]',
};

export function StatCard({ label, value, icon, hint, tone = 'default' }: StatCardProps) {
  return (
    <div className="glass-card glass-card-hover group flex items-start gap-3 p-4">
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-transform duration-300 group-hover:scale-110 ${iconTones[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground-subtle">{label}</p>
        <p className="mt-0.5 text-xl font-bold text-foreground" dir="ltr">
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-xs text-foreground-subtle">{hint}</p> : null}
      </div>
    </div>
  );
}
