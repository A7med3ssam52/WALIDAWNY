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
    ? 'border-error/55 focus:ring-error/35 focus:border-error/50'
    : 'border-white/10 focus:border-primary/50 focus:ring-primary/30 hover:border-white/15 focus:shadow-[0_0_20px_-8px_rgba(129,140,248,0.4)]';

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
          className={`glass-input h-11 w-full appearance-none border px-3 pe-9 text-sm text-foreground focus:outline-none focus:ring-2 sm:h-10 backdrop-blur transition-all duration-200 ${borderClass} ${className ?? ''}`}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute inset-inline-end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle group-focus-within/select:text-primary transition-colors"
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-focus-within/select:opacity-100 transition-opacity" />
      </div>
      {hint ? (
        <p id={`${selectId}-hint`} className="text-xs text-foreground-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${selectId}-error`} role="alert" className="animate-fade-in text-xs font-medium text-rose-300 flex items-center gap-1">
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-rose-400" /> {error}
        </p>
      ) : null}
    </div>
  );
}
