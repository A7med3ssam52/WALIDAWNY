import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface GridCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  border?: boolean;
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
};

export function GridCard({
  children,
  className,
  hover = true,
  padding = 'md',
  border = true,
}: GridCardProps) {
  return (
    <div
      className={cn(
        'glass-card relative overflow-hidden',
        hover && 'glass-card-hover group',
        paddingStyles[padding],
        border && 'border border-white/10',
        className
      )}
    >
      <div className="relative z-10">{children}</div>
      {hover && (
        <div className="absolute inset-0 -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden="true">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
        </div>
      )}
    </div>
  );
}