import type { CSSProperties, ReactNode } from 'react';
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

import type { DemoKpi, DemoTone } from './newUiData';
import { DEMO_BARS, DEMO_KPIS, DEMO_PURCHASES, DEMO_UNITS } from './newUiData';

/**
 * Candidate C — Premium Glow.
 * Theme-variable driven (adapts to all 6 themes automatically via
 * --color-glow / --color-chart-* / --color-gold):
 * - 20px radius, elevated glow shadow, gradient top edge
 * - Glowing icon chips, luminous KPI values, soft halo behind charts
 */

const KPI_ICONS = { users: Users, sales: BadgeCheck, revenue: Wallet, lessons: BookOpen } as const;

const TONE_ACCENT: Record<DemoTone, string> = {
  green: 'var(--color-chart-1)',
  purple: 'var(--color-chart-2)',
  gold: 'var(--color-gold)',
  blue: 'var(--color-chart-3)',
};

const glowShadow: CSSProperties = { boxShadow: '0 12px 40px -16px var(--color-glow)' };
const chipGlow = (accent: string): CSSProperties => ({
  borderColor: accent,
  boxShadow: `0 0 18px -6px ${accent}, inset 0 0 12px -8px ${accent}`,
});

function GlowEdge({ accent }: { accent: string }) {
  return (
    <span
      aria-hidden="true"
      className="block h-[3px] w-full"
      style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
    />
  );
}

function CCard({
  accent,
  title,
  subtitle,
  action,
  children,
  testId,
}: {
  accent: DemoTone;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  testId: string;
}) {
  const color = TONE_ACCENT[accent];
  return (
    <section
      data-testid={testId}
      className="overflow-hidden rounded-[20px] border border-border bg-surface"
      style={glowShadow}
    >
      <GlowEdge accent={color} />
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-extrabold text-foreground">{title}</h3>
            {subtitle ? <p className="mt-1 text-xs text-foreground-muted">{subtitle}</p> : null}
          </div>
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}

function CKpi({ kpi }: { kpi: DemoKpi }) {
  const Icon = KPI_ICONS[kpi.icon];
  const accent = TONE_ACCENT[kpi.tone];
  const Trend = kpi.up ? TrendingUp : TrendingDown;
  return (
    <div
      data-testid={`newui-c-kpi-${kpi.id}`}
      className="relative overflow-hidden rounded-[20px] border border-border bg-surface"
      style={glowShadow}
    >
      <GlowEdge accent={accent} />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 end-0 h-28 w-28 rounded-full blur-2xl"
        style={{ backgroundColor: accent, opacity: 0.22 }}
      />
      <div className="relative flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground-muted">{kpi.label}</p>
          <p
            dir="ltr"
            className="mt-1 text-right font-display text-[2rem] font-black tabular-nums text-foreground"
          >
            {kpi.value}
          </p>
          <p
            className={`mt-2 inline-flex items-center gap-1 text-[11px] font-bold ${kpi.up ? 'text-success' : 'text-error'}`}
          >
            <Trend aria-hidden="true" className="h-3.5 w-3.5" />
            {kpi.delta}
          </p>
        </div>
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border bg-surface-muted"
          style={{ ...chipGlow(accent), color: accent }}
        >
          <Icon className="h-6 w-6" />
        </span>
      </div>
    </div>
  );
}

function CChart() {
  const max = Math.max(...DEMO_BARS.map((b) => b.value));
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 -top-4 h-16 rounded-full blur-2xl"
        style={{ backgroundColor: 'var(--color-glow)', opacity: 0.18 }}
      />
      <div
        className="relative flex h-32 items-end gap-2"
        role="img"
        aria-label="إكمالات آخر 7 أيام"
      >
        {DEMO_BARS.map((bar, i) => (
          <div key={bar.label} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[11px] font-black tabular-nums text-foreground">{bar.value}</span>
            <div
              role="progressbar"
              aria-valuenow={bar.value}
              aria-valuemin={0}
              aria-valuemax={max}
              aria-label={`${bar.label}: ${bar.value}`}
              className="w-full rounded-full"
              style={{
                height: `${Math.max(14, Math.round((bar.value / max) * 96))}px`,
                background: `linear-gradient(180deg, ${i % 2 === 0 ? 'var(--color-chart-1)' : 'var(--color-chart-2)'}, transparent 140%)`,
                boxShadow: `0 0 12px -4px ${i % 2 === 0 ? 'var(--color-chart-1)' : 'var(--color-chart-2)'}`,
              }}
            />
            <span className="text-[10px] font-bold text-foreground-subtle">{bar.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NewUiCDashboard() {
  return (
    <div data-testid="newui-c-dashboard" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {DEMO_KPIS.map((kpi) => (
          <CKpi key={kpi.id} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <CCard
          accent="purple"
          title="تحليل الأداء"
          subtitle="إكمالات آخر 7 أيام بتوهج لوني"
          testId="newui-c-chart"
        >
          <CChart />
        </CCard>
        <CCard
          accent="green"
          title="أحدث المشتريات"
          subtitle="آخر العمليات المسجلة"
          action={<span className="text-xs font-bold text-primary-strong">عرض الكل</span>}
          testId="newui-c-list"
        >
          <ul className="flex flex-col gap-2">
            {DEMO_PURCHASES.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border-muted bg-surface-muted px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{row.student}</p>
                  <p className="mt-0.5 truncate text-xs text-foreground-subtle">{row.meta}</p>
                </div>
                <span
                  dir="ltr"
                  className="shrink-0 text-sm font-black tabular-nums text-foreground"
                >
                  {row.price}
                </span>
              </li>
            ))}
          </ul>
        </CCard>
      </div>

      <CCard
        accent="blue"
        title="الوحدات الأكثر مبيعًا"
        subtitle="مرتبة حسب عدد المبيعات"
        testId="newui-c-table"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-start text-[11px] font-black text-foreground-subtle">
                <th scope="col" className="pb-2 pe-2 text-start font-black">
                  الوحدة
                </th>
                <th scope="col" className="pb-2 text-start font-black">
                  مبيعات
                </th>
                <th scope="col" className="pb-2 text-start font-black">
                  الإيرادات
                </th>
              </tr>
            </thead>
            <tbody>
              {DEMO_UNITS.map((row) => (
                <tr key={row.id}>
                  <td className="py-1.5 pe-2">
                    <span className="block rounded-xl border border-border-muted bg-surface-muted px-3 py-2 font-bold text-foreground">
                      {row.unit}
                    </span>
                  </td>
                  <td className="py-1.5 tabular-nums text-foreground-muted">{row.sales}</td>
                  <td
                    dir="ltr"
                    className="py-1.5 text-right font-bold tabular-nums text-foreground"
                  >
                    {row.revenue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CCard
          accent="gold"
          title="الدعم الفني"
          subtitle="رد خلال دقائق في ساعات العمل"
          testId="newui-c-support-tech"
        >
          <span
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground"
            style={{ boxShadow: '0 0 20px -6px var(--color-glow)' }}
          >
            <Headset aria-hidden="true" className="h-4 w-4" />
            تواصل واتساب — دعم فني
          </span>
        </CCard>
        <CCard
          accent="green"
          title="الدعم الأكاديمي"
          subtitle="المدرس يرد عليك مباشرة"
          testId="newui-c-support-academic"
        >
          <span className="inline-flex items-center gap-2 rounded-2xl border border-border bg-surface-muted px-5 py-2.5 text-sm font-black text-foreground">
            <GraduationCap aria-hidden="true" className="h-4 w-4" />
            تواصل واتساب — دعم أكاديمي
          </span>
        </CCard>
      </div>
    </div>
  );
}
