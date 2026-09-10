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
    ? 'border-error/55 focus:ring-error/35 focus:border-error/50'
    : 'border-white/10 focus:border-primary/50 focus:ring-primary/30 hover:border-white/15 focus:shadow-[0_0_20px_-8px_rgba(129,140,248,0.4)]';

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
        className={`glass-input w-full border px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle/60 focus:outline-none focus:ring-2 resize-y backdrop-blur transition-all duration-200 ${borderClass} ${className ?? ''}`}
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
          className="animate-fade-in text-xs font-medium text-rose-300 flex items-center gap-1"
        >
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-rose-400" /> {error}
        </p>
      ) : null}
    </div>
  );
}