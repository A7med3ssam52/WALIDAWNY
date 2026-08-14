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
      className={`glass-card flex flex-col items-center justify-center gap-3 border-2 border-dashed border-primary/20 px-6 py-10 text-center ${className ?? ''}`}
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-indigo-300 shadow-[0_0_30px_-8px_rgba(129,140,248,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]"
      >
        {icon ?? <Inbox className="h-6 w-6" />}
      </span>
      <p className="text-base font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm leading-relaxed text-foreground-subtle">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
