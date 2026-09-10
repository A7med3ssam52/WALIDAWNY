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
        'glass-card glass-card-hover spotlight-card group relative overflow-hidden p-4 sm:p-5 xl:p-6',
        variantStyles[variant],
        'transition-all duration-300 hover:-translate-y-1',
        className
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-70" />
      <div aria-hidden="true" className="pointer-events-none absolute -end-10 -top-10 h-24 w-24 rounded-full bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-widest text-foreground-subtle uppercase">
            {title}
          </p>
          <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-foreground">
            {value}
          </div>
          {trend && (
            <div
              className={cn(
                'mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold backdrop-blur',
                trend.positive ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300' : 'border-rose-400/20 bg-rose-500/10 text-rose-300'
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
        {icon && (
          <div
            className={cn(
              'shrink-0 flex h-12 w-12 items-center justify-center rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3',
              variant === 'default' && 'bg-white/5 text-foreground-muted',
              variant === 'primary' && 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-300 shadow-[0_0_20px_-8px_rgba(99,102,241,0.5)]',
              variant === 'success' && 'bg-[rgba(16,185,129,0.15)] text-emerald-300 shadow-[0_0_20px_-8px_rgba(52,211,153,0.5)]',
              variant === 'warning' && 'bg-[rgba(245,158,11,0.15)] text-amber-300 shadow-[0_0_20px_-8px_rgba(245,158,11,0.5)]',
              variant === 'info' && 'bg-[rgba(14,165,233,0.15)] text-sky-300 shadow-[0_0_20px_-8px_rgba(56,189,248,0.5)]'
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}