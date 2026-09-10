import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  outline?: boolean;
  icon?: ReactNode;
}

const textClasses: Record<BadgeVariant, string> = {
  success: 'text-emerald-300',
  warning: 'text-amber-300',
  error: 'text-rose-300',
  info: 'text-sky-300',
  neutral: 'text-slate-300',
};

const bgClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-400/10',
  warning: 'bg-amber-400/10',
  error: 'bg-rose-400/10',
  info: 'bg-sky-400/10',
  neutral: 'bg-slate-400/10',
};

const borderClasses: Record<BadgeVariant, string> = {
  success: 'border-emerald-400/25',
  warning: 'border-amber-400/30',
  error: 'border-rose-400/25',
  info: 'border-sky-400/25',
  neutral: 'border-slate-400/20',
};

export function Badge({
  variant = 'neutral',
  outline = false,
  icon,
  children,
  className,
  ...rest
}: BadgeProps) {
  const glowMap: Record<BadgeVariant, string> = {
    success: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_12px_-4px_rgba(52,211,153,0.5)]',
    warning: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_12px_-4px_rgba(251,191,36,0.5)]',
    error: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_12px_-4px_rgba(251,113,133,0.5)]',
    info: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_12px_-4px_rgba(56,189,248,0.5)]',
    neutral: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold backdrop-blur ${textClasses[variant]} ${
        outline ? 'bg-white/5' : bgClasses[variant]
      } ${borderClasses[variant]} ${glowMap[variant]} ${className ?? ''}`}
      {...rest}
    >
      {icon ? (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
