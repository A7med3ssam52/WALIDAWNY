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
      className={`glass-card flex flex-col items-center justify-center gap-3 px-6 py-10 text-center ${className ?? ''}`}
    >
      <span
        aria-hidden="true"
        className="card-chip flex h-14 w-14 items-center justify-center"
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
