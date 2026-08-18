import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface StatCardProps {
  title: string;
  value: ReactNode;
  icon?: ReactNode;
  trend?: { label: string; value: number; positive?: boolean };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'info';
  className?: string;
}

const variantStyles = {
  default: 'bg-white/5 border-white/10',
  primary: 'bg-primary-soft border-primary/30',
  success: 'bg-[rgba(16,185,129,0.12)] border-success/30',
  warning: 'bg-[rgba(245,158,11,0.12)] border-warning/30',
  info: 'bg-[rgba(14,165,233,0.12)] border-info/30',
};

export function StatCard({
  title,
  value,
  icon,
  trend,
  variant = 'default',
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'glass-card glass-card-hover group p-4 sm:p-5 xl:p-6',
        variantStyles[variant],
        'relative overflow-hidden transition-all duration-300',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground-subtle uppercase tracking-wider">
            {title}
          </p>
          <div className="mt-1.5 text-2xl sm:text-3xl font-display font-bold text-foreground">
            {value}
          </div>
          {trend && (
            <div
              className={cn(
                'mt-2 flex items-center gap-1.5 text-sm font-medium transition-colors',
                trend.positive ? 'text-success' : 'text-error'
              )}
            >
              <span aria-hidden="true">
                {trend.positive ? '▲' : '▼'}
              </span>
              <span>{trend.label}</span>
              <span className="text-foreground-muted">({trend.value}%)</span>
            </div>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              'shrink-0 flex h-12 w-12 items-center justify-center rounded-xl',
              variant === 'default' && 'bg-white/5 text-foreground-muted',
              variant === 'primary' && 'bg-primary-soft text-primary',
              variant === 'success' && 'bg-[rgba(16,185,129,0.15)] text-success',
              variant === 'warning' && 'bg-[rgba(245,158,11,0.15)] text-warning',
              variant === 'info' && 'bg-[rgba(14,165,233,0.15)] text-info'
            )}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="absolute inset-0 -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
      </div>
    </div>
  );
}