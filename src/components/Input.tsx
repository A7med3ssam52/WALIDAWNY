import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  errorId?: string;
  hintId?: string;
  icon?: ReactNode;
}

export function Input({
  label,
  error,
  hint,
  errorId,
  hintId,
  icon,
  id,
  className,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy =
    [error ? (errorId ?? `${inputId}-error`) : '', hint ? (hintId ?? `${inputId}-hint`) : '']
      .filter(Boolean)
      .join(' ') || undefined;
  const borderClass = error
    ? 'border-error/55 focus:ring-error/35 focus:border-error/50 shadow-[0_0_0_1px_rgba(251,113,133,0.15)]'
    : 'border-white/10 focus:border-primary/50 focus:ring-primary/30 hover:border-white/15 focus:shadow-[0_0_20px_-8px_rgba(129,140,248,0.4)]';
  const iconClass = icon ? 'ps-10' : '';

  return (
    <div className="flex flex-col gap-1.5 group/input">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground-muted group-focus-within/input:text-foreground transition-colors">
        {label}
      </label>
      <div className="relative">
        {icon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-inline-start-3 top-1/2 -translate-y-1/2 text-foreground-subtle group-focus-within/input:text-primary transition-colors"
          >
            {icon}
          </span>
        ) : null}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`glass-input h-11 w-full border px-3 text-sm text-foreground placeholder:text-foreground-subtle/60 focus:outline-none focus:ring-2 sm:h-10 backdrop-blur transition-all duration-200 ${borderClass} ${iconClass} ${className ?? ''}`}
          {...rest}
        />
        {/* subtle inner highlight */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-focus-within/input:opacity-100 transition-opacity" />
      </div>
      {hint ? (
        <p id={hintId ?? `${inputId}-hint`} className="text-xs text-foreground-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId ?? `${inputId}-error`}
          role="alert"
          className="animate-fade-in text-xs font-medium text-rose-300 flex items-center gap-1"
        >
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.8)]" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
