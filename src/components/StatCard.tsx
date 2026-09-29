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
  default: 'bg-surface border-border-muted',
  primary: 'bg-surface border-border-muted',
  success: 'bg-surface border-border-muted',
  warning: 'bg-surface border-border-muted',
  info: 'bg-surface border-border-muted',
};

const iconStyles = {
  default: 'text-foreground-muted',
  primary: 'text-primary-strong',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
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
        'flat-card glass-card flat-card-hover relative overflow-hidden p-4',
        variantStyles[variant],
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {icon && (
          <span aria-hidden="true" className={cn('shrink-0', iconStyles[variant])}>
            {icon}
          </span>
        )}
        <p className="health-kpi-label">{title}</p>
      </div>
      <div className="mt-2 font-display text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
        {value}
      </div>
      {trend && (
        <div
          className={cn(
            'mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold',
            trend.positive
              ? 'border-[rgba(127,191,142,0.25)] bg-[rgba(127,191,142,0.08)] text-success'
              : 'border-[rgba(232,139,139,0.25)] bg-[rgba(232,139,139,0.07)] text-error',
          )}
        >
          <span aria-hidden="true" className="text-[10px]">
            {trend.positive ? '▲' : '▼'}
          </span>
          <span>{trend.label}</span>
          <span className="opacity-70">({trend.value})</span>
        </div>
      )}
    </div>
  );
}
