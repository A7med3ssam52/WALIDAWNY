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
      className={`glass-tile-error flex flex-col items-center justify-center gap-3 rounded-lg border px-6 py-10 text-center ${className ?? ''}`}
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-rose-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_28px_-8px_rgba(251,113,133,0.6)]"
      >
        {icon ?? <AlertTriangle className="h-6 w-6" />}
      </span>
      <p className="text-sm font-medium leading-relaxed text-rose-200">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
}
