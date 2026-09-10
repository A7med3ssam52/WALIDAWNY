import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button } from './Button';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  icon?: ReactNode;
  className?: string;
}

export function ErrorState({ message, onRetry, icon, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`glass-tile-error spotlight-card relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border px-6 py-10 text-center shadow-[0_0_24px_-8px_rgba(251,113,133,0.25)] ${className ?? ''}`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -top-8 start-1/2 h-20 w-20 -translate-x-1/2 rounded-full bg-rose-500/15 blur-2xl" />
      <span
        aria-hidden="true"
        className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500/20 to-red-500/20 text-rose-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_28px_-8px_rgba(251,113,133,0.6)]"
      >
        {icon ?? <AlertTriangle className="h-6 w-6" />}
      </span>
      <p className="text-sm font-bold leading-relaxed text-rose-200">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
}
