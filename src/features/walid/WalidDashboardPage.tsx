import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  TrendingUp,
  Trophy,
  Users,
  Video,
  Wallet,
} from 'lucide-react';

import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import {
  HealthAnalysis,
  HealthCard,
  HealthDonut,
  HealthDots,
  HealthKpi,
} from '../../components/Health';
import { LayoutShell } from '../../components/LayoutShell';
import { RoleNav } from '../../components/RoleNav';
import { Skeleton } from '../../components/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from '../../components/Table';
import { getDashboardStats } from '../../data/rpc';
import { formatDateTime, formatPrice } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import type {
  DashboardDailyCompletion,
  DashboardRecentCompletion,
  DashboardStats,
  DashboardTopActiveStudent,
} from '../../types/database';

const emptyTable = <EmptyState title="لا توجد بيانات بعد" className="border-0 shadow-none" />;

function StatCardSkeleton() {
  return (
    <div
      className="rounded-xl border border-border-muted bg-surface p-4 shadow-none"
      aria-hidden="true"
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-7 w-16" />
    </div>
  );
}

function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full rounded-sm" />
      ))}
    </div>
  );
}

function DistributionDots({
  distribution,
}: {
  distribution?: { q1: number; q2: number; q3: number; q4: number } | null;
}) {
  const d = distribution ?? { q1: 0, q2: 0, q3: 0, q4: 0 };
  const buckets = [
    { label: '0-25%', value: d.q1 ?? 0 },
    { label: '25-50%', value: d.q2 ?? 0 },
    { label: '50-75%', value: d.q3 ?? 0 },
    { label: '75-100%', value: d.q4 ?? 0 },
  ];
  const total = buckets.reduce((s, b) => s + b.value, 0);
  if (total === 0) {
    return (
      <p className="py-6 text-center text-sm text-foreground-muted">لا توجد بيانات توزيع بعد</p>
    );
  }
  const dots = buckets.flatMap((b, bi) =>
    Array.from({ length: Math.min(b.value, 24) }, (_, i) => ({ key: `${bi}-${i}`, bi })),
  );
  const tone = [
    'var(--color-chart-track)',
    'var(--color-chart-2)',
    'var(--color-chart-1)',
    'var(--color-primary-strong)',
  ];
  return (
    <div data-testid="distribution-bars">
      <HealthDots values={buckets.map((b) => b.value)} testPrefix="wellness" />
      <ul className="mt-4 space-y-2">
        {buckets.map((b, i) => (
          <li key={b.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-foreground-muted">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: tone[i] }}
              />
              <span dir="ltr">{b.label}</span>
            </span>
            <span
              className="font-bold tabular-nums text-foreground"
              data-testid={`dist-bar-${b.label}`}
              role="progressbar"
              aria-valuenow={b.value}
              aria-valuemin={0}
              aria-valuemax={Math.max(1, total)}
              aria-label={`${b.label}: ${b.value}`}
            >
              {b.value} · {Math.round((b.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
      <p className="sr-only">{dots.length} نقطة التزام</p>
    </div>
  );
}

export function WalidDashboardPage({ nav }: { nav?: ReactNode }) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    setStats(null);
    try {
      setStats(await getDashboardStats());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <LayoutShell
      title="لوحة المعلومات"
      subtitle="نظرة عامة على الطلاب والمشتريات والمحتوى"
      variant="sidebar"
      nav={nav ?? <RoleNav />}
      wide
    >
      {error ? <ErrorState message="تعذر تحميل بيانات اللوحة" onRetry={() => void load()} /> : null}
      {!stats && !error ? (
        <div className="space-y-4" aria-busy="true">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <StatCardSkeleton key={index} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TableSkeleton />
            <TableSkeleton />
          </div>
        </div>
      ) : null}
      {stats ? (
        <div className="space-y-4">
          {/* KPI row — white, soft green/purple icon chips */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <HealthKpi
              label="الطلاب"
              value={String(stats.students.total)}
              icon={<Users className="h-5 w-5" />}
              tone="green"
            />
            <HealthKpi
              label="وحدات مباعة"
              value={String(stats.purchases.total)}
              icon={<BadgeCheck className="h-5 w-5" />}
              tone="purple"
            />
            <HealthKpi
              label="إيرادات مستر وليد"
              value={formatPrice(stats.purchases.staff_revenue_this_month)}
              icon={<Wallet className="h-5 w-5" />}
              tone="green"
            />
            {isAdmin ? (
              <HealthKpi
                label="إجمالي إيرادات المنصة"
                value={formatPrice(stats.purchases.platform_fee_total)}
                icon={<Wallet className="h-5 w-5" />}
                tone="purple"
              />
            ) : (
              <HealthKpi
                label="دروس مكتملة"
                value={String(stats.engagement.completed_lessons)}
                icon={<Trophy className="h-5 w-5" />}
                tone="purple"
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <HealthKpi
              label="دروس منشورة"
              value={String(stats.content.published_lessons)}
              icon={<BookOpen className="h-5 w-5" />}
              tone="green"
            />
            <HealthKpi
              label="فيديوهات جاهزة"
              value={String(stats.content.videos_ready)}
              icon={<Video className="h-5 w-5" />}
              tone="purple"
            />
            <HealthKpi
              label="ملفات PDF جاهزة"
              value={String(stats.content.pdfs_ready)}
              icon={<FileText className="h-5 w-5" />}
              tone="green"
            />
            <HealthKpi
              label="طلاب بدأوا التعلم"
              value={String(stats.engagement.students_with_progress ?? 0)}
              icon={<Users className="h-5 w-5" />}
              tone="purple"
            />
          </div>

          {/* Health trio: Donut + Wellness dots + ink analysis */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <HealthCard title="التقدم" subtitle="متوسط نسبة تقدم الطلاب">
              <HealthDonut
                percent={stats.engagement.avg_percent ?? 0}
                label="متوسط التقدم"
                sub={`مشاركة ${stats.engagement.participation_rate ?? 0}% · إكمال ${stats.engagement.completion_rate ?? 0}%`}
              />
              <ul className="mt-4 space-y-2 border-t border-border-muted pt-3 text-sm">
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-foreground-muted">
                    <CheckCircle2 className="h-4 w-4" />
                    دروس مكتملة
                  </span>
                  <span className="font-bold tabular-nums text-foreground" dir="ltr">
                    {stats.engagement.completed_lessons ?? 0}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-foreground-muted">
                    <TrendingUp className="h-4 w-4" />
                    متوسط نسبة التقدم
                  </span>
                  <span className="font-bold tabular-nums text-foreground" dir="ltr">
                    %{stats.engagement.avg_percent ?? 0}
                  </span>
                </li>
              </ul>
            </HealthCard>

            <HealthCard title="الالتزام" subtitle="توزيع الطلاب حسب نسبة التقدم">
              <DistributionDots distribution={stats.engagement.distribution} />
            </HealthCard>

            <HealthAnalysis
              title="تحليل الأداء"
              subtitle="إكمالات آخر 7 أيام"
              bars={(() => {
                const rows: DashboardDailyCompletion[] = Array.isArray(stats.daily_completions)
                  ? stats.daily_completions
                  : [];
                if (rows.length === 0) return [{ label: '—', value: 0, tone: 'gray' as const }];
                return rows.map((r, i) => ({
                  label: r.day,
                  value: r.count,
                  tone: (i % 3 === 0 ? 'lime' : i % 3 === 1 ? 'purple' : 'gray') as
                    'lime' | 'purple' | 'gray',
                }));
              })()}
              foot={
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-foreground-muted">
                      <Clock3 className="h-4 w-4" />
                      نشط آخر 7 أيام
                    </span>
                    <span className="font-bold tabular-nums text-foreground" dir="ltr">
                      {stats.engagement.active_last_7d ?? 0}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-foreground-muted">طلاب بلا نشاط</span>
                    <span className="font-bold tabular-nums text-warning" dir="ltr">
                      {stats.engagement.inactive_students ?? 0}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-foreground-muted">معدل الإكمال</span>
                    <span className="font-bold tabular-nums text-foreground" dir="ltr">
                      {stats.engagement.completion_rate ?? 0}%
                    </span>
                  </li>
                </ul>
              }
            />
          </div>

          {/* Daily label anchor for assistive tech */}
          <p className="sr-only">نشاط آخر 7 أيام</p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <HealthCard title="الطلاب والمشتريات حسب الصف">
              {(Array.isArray(stats.by_grade) ? stats.by_grade : []).length === 0 ? (
                emptyTable
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>الصف</TableHeadCell>
                      <TableHeadCell>الطلاب</TableHeadCell>
                      <TableHeadCell>مشتريات</TableHeadCell>
                      <TableHeadCell>الإيرادات</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(Array.isArray(stats.by_grade) ? stats.by_grade : []).map((row) => (
                      <TableRow key={row.grade_name}>
                        <TableCell label="الصف" className="font-medium text-foreground">
                          {row.grade_name}
                        </TableCell>
                        <TableCell label="الطلاب">{row.students}</TableCell>
                        <TableCell label="مشتريات">{row.purchases}</TableCell>
                        <TableCell label="الإيرادات" className="font-mono" dir="ltr">
                          {formatPrice(row.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </HealthCard>

            <HealthCard title="الوحدات الأكثر مبيعًا">
              {(Array.isArray(stats.top_units) ? stats.top_units : []).length === 0 ? (
                emptyTable
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>الوحدة</TableHeadCell>
                      <TableHeadCell>مبيعات</TableHeadCell>
                      <TableHeadCell>الإيرادات</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(Array.isArray(stats.top_units) ? stats.top_units : []).map((row) => (
                      <TableRow key={row.unit_name}>
                        <TableCell label="الوحدة" className="font-medium text-foreground">
                          {row.unit_name}
                        </TableCell>
                        <TableCell label="مبيعات">{row.purchases}</TableCell>
                        <TableCell label="الإيرادات" className="font-mono" dir="ltr">
                          {formatPrice(row.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </HealthCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <HealthCard title="أحدث المشتريات">
              {(Array.isArray(stats.recent_purchases) ? stats.recent_purchases : []).length ===
              0 ? (
                emptyTable
              ) : (
                <ul className="divide-y divide-border-muted">
                  {(Array.isArray(stats.recent_purchases) ? stats.recent_purchases : []).map(
                    (purchase) => (
                      <li
                        key={`${purchase.student_name}-${purchase.unit_name}-${purchase.purchased_at}`}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">
                            {purchase.student_name}
                          </p>
                          <p className="mt-0.5 text-xs text-foreground-subtle">
                            {purchase.grade_name ?? '—'} · {purchase.unit_name} ·{' '}
                            {formatDateTime(purchase.purchased_at)}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-medium text-foreground" dir="ltr">
                          {formatPrice(purchase.total_price)}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </HealthCard>

            <HealthCard title="مشاركة الطلاب">
              <div className="flex items-center justify-between py-3 text-sm">
                <span className="text-foreground-muted">نسبة المشاركة</span>
                <span className="font-semibold text-foreground" dir="ltr">
                  {stats.engagement.participation_rate ?? 0}%
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border-muted py-3 text-sm">
                <span className="text-foreground-muted">طلاب بلا نشاط</span>
                <span className="font-semibold text-warning" dir="ltr">
                  {stats.engagement.inactive_students ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border-muted py-3 text-sm">
                <span className="text-foreground-muted">معدل الإكمال</span>
                <span className="font-semibold text-success" dir="ltr">
                  {stats.engagement.completion_rate ?? 0}%
                </span>
              </div>
            </HealthCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <HealthCard title="توزيع التقدم">
              <DistributionDots distribution={stats.engagement.distribution} />
            </HealthCard>
            <HealthCard title="الطلاب الأكثر نشاطاً">
              {(() => {
                const rows: DashboardTopActiveStudent[] = Array.isArray(stats.top_active)
                  ? (stats.top_active as DashboardTopActiveStudent[])
                  : [];
                if (rows.length === 0) return emptyTable;
                return (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeadCell>الطالب</TableHeadCell>
                        <TableHeadCell>الصف</TableHeadCell>
                        <TableHeadCell>مكتملة</TableHeadCell>
                        <TableHeadCell>المتوسط</TableHeadCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.student_id} data-testid={`top-active-${row.student_id}`}>
                          <TableCell label="الطالب" className="font-medium text-foreground">
                            {row.full_name}
                          </TableCell>
                          <TableCell label="الصف">{row.grade_name ?? '—'}</TableCell>
                          <TableCell label="مكتملة">{row.completed_lessons}</TableCell>
                          <TableCell label="المتوسط" dir="ltr">
                            {row.avg_percent}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </HealthCard>
          </div>

          <HealthCard title="آخر الدروس المكتملة">
            {(() => {
              const rows: DashboardRecentCompletion[] = Array.isArray(stats.recent_completions)
                ? (stats.recent_completions as DashboardRecentCompletion[])
                : [];
              if (rows.length === 0) return emptyTable;
              return (
                <ul className="divide-y divide-border-muted">
                  {rows.map((row, idx) => (
                    <li
                      key={`${row.student_name}-${row.lesson_title}-${row.completed_at}-${idx}`}
                      className="flex items-center justify-between gap-3 py-3"
                      data-testid={`recent-completion-${idx}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{row.student_name}</p>
                        <p className="mt-0.5 truncate text-xs text-foreground-subtle">
                          {row.lesson_title} · {row.unit_name}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-foreground-muted" dir="ltr">
                        {formatDateTime(row.completed_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </HealthCard>

          <p className="text-xs text-foreground-subtle">
            بيانات المشاركة تُحدث تلقائياً من تقدم الطلاب
          </p>
        </div>
      ) : null}
    </LayoutShell>
  );
}
