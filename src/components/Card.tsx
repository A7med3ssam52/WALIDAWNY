import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  padding?: 'sm' | 'md';
  interactive?: boolean;
}

export function Card({
  title,
  subtitle,
  actions,
  padding = 'md',
  interactive = false,
  children,
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={`glass-card relative overflow-hidden ${interactive ? 'glass-card-hover spotlight-card' : ''} ${
        padding === 'md' ? 'p-4 sm:p-6' : 'p-4'
      } ${className ?? ''}`}
      {...rest}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      {title ? (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-foreground-subtle">{subtitle}</p> : null}
          </div>
          <div className="w-full sm:w-auto">{actions}</div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
