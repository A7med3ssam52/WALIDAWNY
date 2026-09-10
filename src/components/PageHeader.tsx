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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-indigo-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_16px_-6px_rgba(129,140,248,0.5)]">
              {icon}
            </div>
          )}
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm text-foreground-muted">{subtitle}</p>}
          </div>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:ms-auto">{actions}</div>}
    </div>
  );
}