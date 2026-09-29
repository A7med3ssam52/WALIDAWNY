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

import type { DemoKpi, DemoTone } from './newUiData';
import { DEMO_BARS, DEMO_KPIS, DEMO_PURCHASES, DEMO_UNITS } from './newUiData';

/**
 * Candidate A — Editorial.
 * Theme-variable driven (adapts to all 6 themes automatically):
 * - 24px radius, medium shadow, per-kind top accent strip
 * - Editorial header: overline eyebrow + display title + subtitle + action
 */

const KPI_ICONS = { users: Users, sales: BadgeCheck, revenue: Wallet, lessons: BookOpen } as const;

const TONE_STRIP: Record<DemoTone, string> = {
  green: 'var(--color-chart-1)',
  purple: 'var(--color-chart-2)',
  gold: 'var(--color-gold)',
  blue: 'var(--color-chart-3)',
};

const TONE_CHIP: Record<DemoTone, string> = {
  green: 'bg-primary-soft text-primary-strong border border-primary/25',
  purple: 'bg-accent-soft text-accent-strong border border-accent/25',
  gold: 'bg-warning/10 text-warning border border-warning/25',
  blue: 'bg-info/10 text-info border border-info/25',
};

function ACard({
  kind,
  eyebrow,
  title,
  subtitle,
  action,
  children,
  testId,
}: {
  kind: DemoTone;
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section
      data-testid={testId}
      className="overflow-hidden rounded-3xl border border-border bg-surface shadow-medium"
    >
      <span
        aria-hidden="true"
        className="block h-1.5 w-full"
        style={{ backgroundColor: TONE_STRIP[kind] }}
      />
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black tracking-wide text-foreground-subtle">{eyebrow}</p>
            <h3 className="mt-1 font-display text-lg font-extrabold text-foreground">{title}</h3>
            {subtitle ? (
              <p className="mt-1 text-xs leading-5 text-foreground-muted">{subtitle}</p>
            ) : null}
          </div>
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}

function AKpi({ kpi }: { kpi: DemoKpi }) {
  const Icon = KPI_ICONS[kpi.icon];
  const Trend = kpi.up ? TrendingUp : TrendingDown;
  return (
    <div
      data-testid={`newui-a-kpi-${kpi.id}`}
      className="overflow-hidden rounded-3xl border border-border bg-surface shadow-medium"
    >
      <span
        aria-hidden="true"
        className="block h-1.5 w-full"
        style={{ backgroundColor: TONE_STRIP[kpi.tone] }}
      />
      <div className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-[11px] font-black tracking-wide text-foreground-subtle">{kpi.label}</p>
          <p
            dir="ltr"
            className="mt-1 text-right font-display text-4xl font-black tabular-nums text-foreground"
          >
            {kpi.value}
          </p>
          <p
            className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              kpi.up ? 'bg-primary-soft text-primary-strong' : 'bg-error/10 text-error'
            }`}
          >
            <Trend aria-hidden="true" className="h-3 w-3" />
            {kpi.delta}
          </p>
        </div>
        <span
          aria-hidden="true"
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${TONE_CHIP[kpi.tone]}`}
        >
          <Icon className="h-6 w-6" />
        </span>
      </div>
    </div>
  );
}

function AChart() {
  const max = Math.max(...DEMO_BARS.map((b) => b.value));
  return (
    <div className="flex h-32 items-end gap-2" role="img" aria-label="إكمالات آخر 7 أيام">
      {DEMO_BARS.map((bar, i) => (
        <div key={bar.label} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[11px] font-black tabular-nums text-foreground">{bar.value}</span>
          <div
            role="progressbar"
            aria-valuenow={bar.value}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-label={`${bar.label}: ${bar.value}`}
            className="w-full rounded-t-xl"
            style={{
              height: `${Math.max(12, Math.round((bar.value / max) * 96))}px`,
              backgroundColor: i % 2 === 0 ? 'var(--color-chart-1)' : 'var(--color-chart-2)',
            }}
          />
          <span className="text-[10px] font-bold text-foreground-subtle">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

export function NewUiADashboard() {
  return (
    <div data-testid="newui-a-dashboard" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {DEMO_KPIS.map((kpi) => (
          <AKpi key={kpi.id} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ACard
          kind="purple"
          eyebrow="تحليل الأداء"
          title="إكمالات آخر 7 أيام"
          subtitle="أعمدة خضراء وبنفسجية بالتناوب من بيانات التقدم"
          testId="newui-a-chart"
        >
          <AChart />
        </ACard>
        <ACard
          kind="green"
          eyebrow="أحدث المشتريات"
          title="آخر 3 عمليات"
          subtitle="الطالب · الصف والوحدة · السعر"
          action={<span className="text-xs font-bold text-primary-strong">عرض الكل</span>}
          testId="newui-a-list"
        >
          <ul className="divide-y divide-border-muted">
            {DEMO_PURCHASES.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-3">
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
        </ACard>
      </div>

      <ACard
        kind="blue"
        eyebrow="الوحدات الأكثر مبيعًا"
        title="ترتيب الوحدات حسب المبيعات"
        testId="newui-a-table"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-start text-[11px] font-black tracking-wide text-foreground-subtle">
                <th scope="col" className="py-2 pe-2 text-start font-black">
                  الوحدة
                </th>
                <th scope="col" className="py-2 text-start font-black">
                  مبيعات
                </th>
                <th scope="col" className="py-2 text-start font-black">
                  الإيرادات
                </th>
              </tr>
            </thead>
            <tbody>
              {DEMO_UNITS.map((row) => (
                <tr key={row.id} className="border-t border-border-muted">
                  <td className="py-2.5 pe-2 font-bold text-foreground">{row.unit}</td>
                  <td className="py-2.5 tabular-nums text-foreground-muted">{row.sales}</td>
                  <td
                    dir="ltr"
                    className="py-2.5 text-right font-bold tabular-nums text-foreground"
                  >
                    {row.revenue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ACard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ACard
          kind="gold"
          eyebrow="مركز الدعم"
          title="الدعم الفني"
          subtitle="مشاكل الدخول والتفعيل والدفع — رد خلال دقائق"
          testId="newui-a-support-tech"
        >
          <span className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground">
            <Headset aria-hidden="true" className="h-4 w-4" />
            تواصل واتساب — دعم فني
          </span>
        </ACard>
        <ACard
          kind="green"
          eyebrow="مركز الدعم"
          title="الدعم الأكاديمي"
          subtitle="أسئلة الشرح والمنهج والامتحانات — المدرس يرد مباشرة"
          testId="newui-a-support-academic"
        >
          <span className="inline-flex items-center gap-2 rounded-2xl border border-warning/40 bg-warning/10 px-5 py-2.5 text-sm font-black text-warning">
            <GraduationCap aria-hidden="true" className="h-4 w-4" />
            تواصل واتساب — دعم أكاديمي
          </span>
        </ACard>
      </div>
    </div>
  );
}
