import type { ReactNode } from 'react';
import {
  BadgeCheck,
  BookOpen,
  Headset,
  GraduationCap,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';

import type { DemoKpi } from './newUiData';
import { DEMO_BARS, DEMO_KPIS, DEMO_PURCHASES, DEMO_UNITS } from './newUiData';

/**
 * Candidate B — Flat Minimal.
 * Theme-variable driven (adapts to all 6 themes automatically):
 * - 12px radius, hairline borders, zero shadows, compact density
 * - Plain colored icons (no chip boxes), hairline dividers, small headers
 */

const KPI_ICONS = { users: Users, sales: BadgeCheck, revenue: Wallet, lessons: BookOpen } as const;

const TONE_TEXT = {
  green: 'text-primary-strong',
  purple: 'text-accent-strong',
  gold: 'text-warning',
  blue: 'text-info',
} as const;

function BCard({
  title,
  action,
  children,
  testId,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-xl border border-border-muted bg-surface p-4 shadow-none"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function BKpi({ kpi }: { kpi: DemoKpi }) {
  const Icon = KPI_ICONS[kpi.icon];
  const Trend = kpi.up ? TrendingUp : TrendingDown;
  return (
    <div
      data-testid={`newui-b-kpi-${kpi.id}`}
      className="rounded-xl border border-border-muted bg-surface p-4 shadow-none"
    >
      <div className="flex items-center gap-2">
        <Icon aria-hidden="true" className={`h-5 w-5 ${TONE_TEXT[kpi.tone]}`} />
        <p className="text-xs font-bold text-foreground-muted">{kpi.label}</p>
      </div>
      <p
        dir="ltr"
        className="mt-2 text-right font-display text-3xl font-extrabold tabular-nums text-foreground"
      >
        {kpi.value}
      </p>
      <p
        className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold ${kpi.up ? 'text-success' : 'text-error'}`}
      >
        <Trend aria-hidden="true" className="h-3 w-3" />
        {kpi.delta}
      </p>
    </div>
  );
}

function BChart() {
  const max = Math.max(...DEMO_BARS.map((b) => b.value));
  return (
    <div className="flex h-24 items-end gap-1.5" role="img" aria-label="إكمالات آخر 7 أيام">
      {DEMO_BARS.map((bar) => (
        <div key={bar.label} className="flex flex-1 flex-col items-center gap-1">
          <div
            role="progressbar"
            aria-valuenow={bar.value}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-label={`${bar.label}: ${bar.value}`}
            title={`${bar.label}: ${bar.value}`}
            className="w-full rounded-sm"
            style={{
              height: `${Math.max(8, Math.round((bar.value / max) * 72))}px`,
              backgroundColor: 'var(--color-chart-1)',
              opacity: 0.45 + 0.55 * (bar.value / max),
            }}
          />
          <span className="text-[10px] font-medium text-foreground-subtle">
            {bar.label.slice(0, 6)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function NewUiBDashboard() {
  return (
    <div data-testid="newui-b-dashboard" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {DEMO_KPIS.map((kpi) => (
          <BKpi key={kpi.id} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <BCard title="إكمالات آخر 7 أيام" testId="newui-b-chart">
          <BChart />
        </BCard>
        <BCard
          title="أحدث المشتريات"
          action={<span className="text-xs font-bold text-primary-strong">عرض الكل</span>}
          testId="newui-b-list"
        >
          <ul className="divide-y divide-border-muted">
            {DEMO_PURCHASES.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-foreground">{row.student}</p>
                  <p className="truncate text-[11px] text-foreground-subtle">{row.meta}</p>
                </div>
                <span
                  dir="ltr"
                  className="shrink-0 text-[13px] font-bold tabular-nums text-foreground"
                >
                  {row.price}
                </span>
              </li>
            ))}
          </ul>
        </BCard>
      </div>

      <BCard title="الوحدات الأكثر مبيعًا" testId="newui-b-table">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-start text-[11px] font-bold text-foreground-subtle">
                <th scope="col" className="py-1.5 pe-2 text-start font-bold">
                  الوحدة
                </th>
                <th scope="col" className="py-1.5 text-start font-bold">
                  مبيعات
                </th>
                <th scope="col" className="py-1.5 text-start font-bold">
                  الإيرادات
                </th>
              </tr>
            </thead>
            <tbody>
              {DEMO_UNITS.map((row) => (
                <tr key={row.id} className="border-t border-border-muted">
                  <td className="py-2 pe-2 font-bold text-foreground">{row.unit}</td>
                  <td className="py-2 tabular-nums text-foreground-muted">{row.sales}</td>
                  <td dir="ltr" className="py-2 text-right font-bold tabular-nums text-foreground">
                    {row.revenue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BCard>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BCard title="الدعم الفني" testId="newui-b-support-tech">
          <p className="mb-3 text-xs leading-5 text-foreground-muted">
            مشاكل الدخول والتفعيل والدفع — رد خلال دقائق
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground">
            <Headset aria-hidden="true" className="h-4 w-4" />
            تواصل واتساب
          </span>
        </BCard>
        <BCard title="الدعم الأكاديمي" testId="newui-b-support-academic">
          <p className="mb-3 text-xs leading-5 text-foreground-muted">
            أسئلة الشرح والمنهج والامتحانات
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-[13px] font-bold text-foreground">
            <GraduationCap aria-hidden="true" className="h-4 w-4" />
            تواصل واتساب
          </span>
        </BCard>
      </div>
    </div>
  );
}
