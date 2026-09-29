import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

import { ChevronDown } from 'lucide-react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Select({ label, error, hint, id, children, className, ...rest }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? rest.name ?? generatedId;
  const describedBy =
    [error ? `${selectId}-error` : '', hint ? `${selectId}-hint` : ''].filter(Boolean).join(' ') ||
    undefined;
  const borderClass = error
    ? 'border-error/60 focus:border-error focus:ring-error/25'
    : 'border-border focus:border-primary-strong focus:ring-primary/25 hover:border-foreground-subtle/60';

  return (
    <div className="flex flex-col gap-1.5 group/select">
      <label htmlFor={selectId} className="text-sm font-medium text-foreground-muted group-focus-within/select:text-foreground transition-colors">
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`glass-input h-11 w-full appearance-none border px-3 pe-9 text-sm text-foreground focus:outline-none focus:ring-2 sm:h-10 transition-colors duration-200 ${borderClass} ${className ?? ''}`}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute inset-inline-end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle group-focus-within/select:text-primary-strong transition-colors"
        />
      </div>
      {hint ? (
        <p id={`${selectId}-hint`} className="text-xs text-foreground-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${selectId}-error`} role="alert" className="animate-fade-in text-xs font-medium text-error flex items-center gap-1">
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-error" /> {error}
        </p>
      ) : null}
    </div>
  );
}
