import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 rise',
        className
      )}
    >
      <div className="flex flex-col gap-1.5">
        {breadcrumbs && (
          <nav className="flex items-center gap-1.5 text-sm text-foreground-subtle" aria-label="مسار التنقل">
            {breadcrumbs}
          </nav>
        )}
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              {icon}
            </div>
          )}
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm text-foreground-muted">{subtitle}</p>}
          </div>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
    </div>
  );
}