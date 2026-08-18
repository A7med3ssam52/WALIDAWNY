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
      className={`glass-card ${interactive ? 'glass-card-hover' : ''} ${
        padding === 'md' ? 'p-4 sm:p-6' : 'p-4'
      } ${className ?? ''}`}
      {...rest}
    >
      {title ? (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-foreground-subtle">{subtitle}</p> : null}
          </div>
          <div className="w-full sm:w-auto">{actions}</div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
