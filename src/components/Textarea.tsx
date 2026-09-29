import { useId, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
  errorId?: string;
  hintId?: string;
}

export function Textarea({
  label,
  error,
  hint,
  errorId,
  hintId,
  id,
  className,
  rows = 4,
  ...rest
}: TextareaProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy =
    [error ? (errorId ?? `${inputId}-error`) : '', hint ? (hintId ?? `${inputId}-hint`) : '']
      .filter(Boolean)
      .join(' ') || undefined;
  const borderClass = error
    ? 'border-error/60 focus:border-error focus:ring-error/25'
    : 'border-border focus:border-primary-strong focus:ring-primary/25 hover:border-foreground-subtle/60';

  return (
    <div className="flex flex-col gap-1.5 group/textarea">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground-muted group-focus-within/textarea:text-foreground transition-colors">
        {label}
      </label>
      <textarea
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        rows={rows}
        className={`glass-input w-full border px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle/60 focus:outline-none focus:ring-2 resize-y transition-colors duration-200 ${borderClass} ${className ?? ''}`}
        {...rest}
      />
      {hint ? (
        <p id={hintId ?? `${inputId}-hint`} className="text-xs text-foreground-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId ?? `${inputId}-error`}
          role="alert"
          className="animate-fade-in text-xs font-medium text-error flex items-center gap-1"
        >
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-error" /> {error}
        </p>
      ) : null}
    </div>
  );
}
