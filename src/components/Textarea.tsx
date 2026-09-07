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
    ? 'border-error/55 focus:ring-error/35'
    : 'border-border focus:border-primary/60 focus:ring-primary/30';

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-secondary-foreground">
        {label}
      </label>
      <textarea
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        rows={rows}
        className={`glass-input w-full border px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle/60 focus:outline-none focus:ring-2 resize-y ${borderClass} ${className ?? ''}`}
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
          className="text-xs font-medium text-error"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}