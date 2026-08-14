import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant =
  'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

const baseClasses =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-[transform,background-color,box-shadow,border-color,filter] duration-150 select-none ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.97]';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'btn-primary text-primary-foreground',
  secondary:
    'glass-input text-secondary-foreground border border-white/12 hover:border-primary/40 hover:bg-white/10 hover:text-foreground',
  outline:
    'bg-transparent text-primary border border-primary/35 hover:border-primary/70 hover:bg-primary-soft',
  ghost: 'bg-transparent text-foreground-muted hover:bg-white/6 hover:text-foreground',
  destructive: 'bg-error text-[#2b0508] hover:bg-rose-400 active:bg-rose-300',
  danger: 'bg-error text-[#2b0508] hover:bg-rose-400 active:bg-rose-300',
  link: 'bg-transparent text-primary underline-offset-4 hover:underline p-0 h-auto',
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
