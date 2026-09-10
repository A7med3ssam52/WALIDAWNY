import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={`glass-card spotlight-card conic-ring relative flex flex-col items-center justify-center gap-3 overflow-hidden px-6 py-10 text-center ${className ?? ''}`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -top-10 start-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/10 blur-2xl" />
      <span
        aria-hidden="true"
        className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-indigo-300 shadow-[0_0_30px_-8px_rgba(129,140,248,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]"
      >
        {icon ?? <Inbox className="h-6 w-6" />}
      </span>
      <p className="font-display text-base font-bold text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm leading-relaxed text-foreground-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
