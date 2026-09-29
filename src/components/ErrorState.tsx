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
      className={`glass-tile-error flex flex-col items-center justify-center gap-3 rounded-[20px] border px-6 py-10 text-center ${className ?? ''}`}
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-xl border border-error/25 bg-error/[0.08] text-error"
      >
        {icon ?? <AlertTriangle className="h-6 w-6" />}
      </span>
      <p className="text-sm font-bold leading-relaxed text-error">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
}
