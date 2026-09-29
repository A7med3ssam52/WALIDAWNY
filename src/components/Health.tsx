import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DirectionalArrow } from './DirectionalArrow';

/**
 * Health Overview kit — Flat Minimal building blocks for walid/admin dashboards.
 * 12px radius, hairline muted borders, zero shadows, plain colored icons
 * (no chip boxes), single-hue charts. Fully theme-variable driven — adapts
 * to all 6 themes automatically.
 * No glass/conic/spotlight/neon/gradient-text/backdrop-blur/dark: anywhere here.
 */

export function HealthCard({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-border-muted bg-surface p-4 shadow-none ${className ?? ''}`}
    >
      {title ? (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-foreground-subtle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="w-full sm:w-auto">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function HealthKpi({
  label,
  value,
  icon,
  tone = 'green',
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: 'green' | 'purple';
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface p-4 shadow-none">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`shrink-0 ${tone === 'purple' ? 'text-accent-strong' : 'text-primary-strong'}`}
        >
          {icon}
        </span>
        <p className="health-kpi-label">{label}</p>
      </div>
      <div className="mt-2 font-display text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

/** SVG donut — no conic-gradient, light only. */
export function HealthDonut({
  percent,
  label,
  sub,
}: {
  percent: number;
  label: string;
  sub?: string;
}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const r = 44;
  const c = 2 * Math.PI * r;
  const off = c - (p / 100) * c;
  return (
    <div className="flex items-center gap-4">
      <div
        className="relative h-[120px] w-[120px] shrink-0"
        role="img"
        aria-label={`${label}: ${p}%`}
      >
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="var(--color-chart-track)"
            strokeWidth="14"
          />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="var(--color-chart-1)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={off}
          />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="var(--color-chart-2)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - ((p >= 25 ? 18 : (p / 25) * 18) / 100) * c}
            opacity={0.55}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-extrabold text-foreground" dir="ltr">
            {p}%
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="health-kpi-label">{label}</p>
        {sub ? <p className="mt-1 text-xs leading-5 text-foreground-muted">{sub}</p> : null}
      </div>
    </div>
  );
}

/** Wellness dots — commitment grid like the reference. */
export function HealthDots({
  values,
  testPrefix = 'wellness',
}: {
  values: number[];
  testPrefix?: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-2" data-testid={`${testPrefix}-dots`}>
      {values.map((v, i) => {
        const level = v / max;
        const color =
          level >= 0.66
            ? 'var(--color-chart-1)'
            : level >= 0.33
              ? 'var(--color-chart-2)'
              : 'var(--color-chart-track)';
        const size = 6 + Math.round(level * 6);
        return (
          <span
            key={i}
            data-testid={`${testPrefix}-dot-${i}`}
            title={String(v)}
            aria-label={`يوم ${i + 1}: ${v}`}
            style={{ width: size, height: size, backgroundColor: color }}
            className="inline-block rounded-full"
          />
        );
      })}
    </div>
  );
}

/** Flat analysis card — theme-aware surface, single-hue bars with opacity scale.
 *  `tone` is kept in the prop type for API compatibility; bars render in one
 *  hue (opacity encodes magnitude) per the Flat Minimal system. */
export function HealthAnalysis({
  title,
  subtitle,
  bars,
  foot,
}: {
  title: string;
  subtitle?: string;
  bars: Array<{ label: string; value: number; tone: 'lime' | 'purple' | 'gray' }>;
  foot?: ReactNode;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <section className="rounded-xl border border-border-muted bg-surface p-4 shadow-none">
      <div>
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-foreground-subtle">{subtitle}</p> : null}
      </div>
      <div className="mt-4 flex h-24 items-end gap-1.5" data-testid="daily-completions-chart">
        {bars.map((b) => {
          const h = Math.max(8, Math.round((b.value / max) * 72));
          return (
            <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
              <span
                className="text-[11px] font-bold tabular-nums text-foreground"
                data-testid={`daily-count-${b.label}`}
              >
                {b.value}
              </span>
              <div
                role="progressbar"
                aria-valuenow={b.value}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-label={`${b.label}: ${b.value}`}
                data-testid={`daily-bar-${b.label}`}
                title={`${b.label}: ${b.value}`}
                style={{
                  height: h,
                  backgroundColor: 'var(--color-chart-1)',
                  opacity: 0.45 + 0.55 * (b.value / max),
                }}
                className="w-full rounded-sm"
              />
              <span className="truncate text-[10px] font-medium text-foreground-subtle" dir="ltr">
                {b.label.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
      {foot ? <div className="mt-4 border-t border-border-muted pt-3">{foot}</div> : null}
    </section>
  );
}

export function HealthBackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex h-11 items-center gap-2 rounded-xl border border-border-muted bg-surface px-4 text-sm font-semibold text-foreground shadow-none transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 sm:h-10"
    >
      <DirectionalArrow direction="back" />
      {children}
    </Link>
  );
}

export function HealthFilterTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          aria-pressed={value === tab.value}
          className={`rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 ${
            value === tab.value
              ? 'btn-primary border-transparent'
              : 'border-border-muted bg-surface text-foreground-muted shadow-none hover:bg-surface-muted hover:text-foreground'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function HealthAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-sm font-bold text-foreground-muted"
    >
      {name.trim().charAt(0) || 'ط'}
    </span>
  );
}

export function HealthRowCard({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="flex overflow-hidden rounded-xl border border-border-muted bg-surface shadow-none transition-colors hover:border-border"
    >
      {children}
    </div>
  );
}
