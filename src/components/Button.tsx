import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant =
  'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const baseClasses =
  'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-[transform,background-color,box-shadow,border-color,filter] duration-200 select-none ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.97] hover:scale-[1.01]';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'btn-primary text-primary-foreground shadow-[0_8px_20px_-10px_rgba(99,102,241,0.6)] hover:shadow-[0_12px_28px_-10px_rgba(99,102,241,0.7)]',
  secondary:
    'glass-input text-foreground border border-white/12 hover:border-primary/40 hover:bg-white/10 hover:text-white hover:shadow-[0_0_20px_-8px_rgba(129,140,248,0.4)] backdrop-blur',
  outline:
    'bg-transparent text-indigo-300 border border-indigo-400/30 hover:border-indigo-400/60 hover:bg-indigo-500/10 hover:text-indigo-200 hover:shadow-[0_0_20px_-8px_rgba(129,140,248,0.5)]',
  ghost: 'bg-transparent text-foreground-muted hover:bg-white/6 hover:text-foreground border border-transparent hover:border-white/5',
  destructive: 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-[0_8px_20px_-10px_rgba(244,63,94,0.6)] hover:from-rose-400 hover:to-red-500 hover:shadow-[0_12px_28px_-10px_rgba(244,63,94,0.7)] border border-rose-400/20',
  danger: 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-[0_8px_20px_-10px_rgba(244,63,94,0.6)] hover:from-rose-400 hover:to-red-500 border border-rose-400/20',
  link: 'bg-transparent text-indigo-300 underline-offset-4 hover:underline hover:text-indigo-200 p-0 h-auto',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-11 px-3 text-xs gap-1.5 sm:h-10',
  md: 'h-11 px-4 text-sm sm:h-10',
  lg: 'h-11 px-5 text-sm sm:text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  icon,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    baseClasses,
    variantClasses[variant],
    variant === 'link' ? '' : sizeClasses[size],
    loading ? 'cursor-wait' : '',
    className ?? '',
  ].join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : icon ? (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}
