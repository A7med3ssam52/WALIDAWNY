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
  const inputId = id ?? rest.name ?? generatedId;
  const describedBy =
    [error ? (errorId ?? `${inputId}-error`) : '', hint ? (hintId ?? `${inputId}-hint`) : '']
      .filter(Boolean)
      .join(' ') || undefined;
  const borderClass = error
    ? 'border-error/55 focus:ring-error/35'
    : 'border-border focus:border-primary/60 focus:ring-primary/30';
  const iconClass = icon ? 'ps-10' : '';

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-secondary-foreground">
        {label}
      </label>
      <div className="relative">
        {icon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-inline-start-3 top-1/2 -translate-y-1/2 text-foreground-subtle"
          >
            {icon}
          </span>
        ) : null}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`glass-input h-11 w-full border px-3 text-sm text-foreground placeholder:text-foreground-subtle/60 focus:outline-none focus:ring-2 sm:h-10 ${borderClass} ${iconClass} ${className ?? ''}`}
          {...rest}
        />
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
          className="text-xs font-medium text-error"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
