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
    ? 'border-error/55 focus:ring-error/35'
    : 'border-border focus:border-primary/60 focus:ring-primary/30';

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-secondary-foreground">
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`glass-input h-11 w-full appearance-none border px-3 pe-9 text-sm text-foreground focus:outline-none focus:ring-2 sm:h-10 ${borderClass} ${className ?? ''}`}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute inset-inline-end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle"
        />
      </div>
      {hint ? (
        <p id={`${selectId}-hint`} className="text-xs text-foreground-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${selectId}-error`} role="alert" className="text-xs font-medium text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
