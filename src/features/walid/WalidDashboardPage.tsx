import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  BadgeCheck,
  BarChart3,
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

import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { RoleNav } from '../../components/RoleNav';
import { Skeleton } from '../../components/Skeleton';
import { StatCard } from '../../components/StatCard';
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

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return <Card title={title}>{children}</Card>;
}

const emptyTable = <EmptyState title="لا توجد بيانات بعد" className="glass-soft border-0" />;

function StatCardSkeleton() {
  return (
    <div className="glass-card p-4" aria-hidden="true">
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

function DistributionBars({
  distribution,
}: {
  distribution?: { q1: number; q2: number; q3: number; q4: number } | null;
}) {
  const d = distribution ?? { q1: 0, q2: 0, q3: 0, q4: 0 };
  const buckets = [
    { label: '0-25%', value: d.q1 ?? 0, color: 'bg-slate-400' },
    { label: '25-50%', value: d.q2 ?? 0, color: 'bg-amber-400' },
    { label: '50-75%', value: d.q3 ?? 0, color: 'bg-sky-400' },
    { label: '75-100%', value: d.q4 ?? 0, color: 'bg-emerald-500' },
  ];
  const max = Math.max(1, ...buckets.map((b) => b.value));
  const total = buckets.reduce((s, b) => s + b.value, 0);
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-foreground-muted">لا توجد بيانات توزيع بعد</p>;
  }
  return (
    <div className="space-y-3" data-testid="distribution-bars">
      {buckets.map((b) => (
        <div key={b.label} className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-xs font-medium text-foreground-muted" dir="ltr">
            {b.label}
          </span>
          <div className="relative h-6 flex-1 overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10">
            <div
              className={`absolute inset-y-0 right-0 rounded-full ${b.color} transition-all duration-500`}
              style={{ width: `${Math.round((b.value / max) * 100)}%` }}
              role="progressbar"
              aria-valuenow={b.value}
              aria-valuemin={0}
              aria-valuemax={max}
              aria-label={`${b.label}: ${b.value}`}
              data-testid={`dist-bar-${b.label}`}
            />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
              {b.value}
            </span>
          </div>
          <span className="w-10 shrink-0 text-xs text-foreground-muted" dir="ltr">
            {total > 0 ? `${Math.round((b.value / total) * 100)}%` : '0%'}
          </span>
        </div>
      ))}
    </div>
  );
}

function DailyCompletionsChart({ daily }: { daily?: DashboardDailyCompletion[] | null }) {
  const rows = Array.isArray(daily) ? daily : [];
  // Fill to 7 days if needed: if DB returns less than 7, show what we have
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-foreground-muted">لا توجد إكمالات خلال آخر 7 أيام</p>;
  }
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-3" data-testid="daily-completions-chart">
      {/* CSS bar chart — horizontal */}
      <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: '96px' }}>
        {rows.map((r) => {
          const h = Math.max(8, Math.round((r.count / max) * 80));
          return (
            <div key={r.day} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-xs font-bold tabular-nums text-foreground" data-testid={`daily-count-${r.day}`}>
                {r.count}
              </span>
              <div
                className="w-full rounded-t-lg bg-gradient-to-t from-emerald-600 to-emerald-400 ring-1 ring-emerald-500/30 transition-all duration-500"
                style={{ height: `${h}px`, minHeight: '8px' }}
                role="progressbar"
                aria-valuenow={r.count}
                aria-valuemin={0}
                aria-valuemax={max}
                data-testid={`daily-bar-${r.day}`}
                title={`${r.day}: ${r.count}`}
              />
              <span className="truncate text-[10px] font-medium text-foreground-muted" dir="ltr">
                {r.day.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-center text-xs text-foreground-subtle">إكمالات آخر 7 أيام</p>
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
    >
      {error ? <ErrorState message="تعذر تحميل بيانات اللوحة" onRetry={() => void load()} /> : null}
      {!stats && !error ? (
        <div className="space-y-6" aria-busy="true">
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
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="الطلاب"
              value={String(stats.students.total)}
              icon={<Users className="h-5 w-5" />}
              variant="info"
            />
            <StatCard
              title="وحدات مباعة"
              value={String(stats.purchases.total)}
              icon={<BadgeCheck className="h-5 w-5" />}
              variant="success"
            />
            <StatCard
              title="إيرادات مستر وليد"
              value={formatPrice(stats.purchases.staff_revenue_this_month)}
              icon={<Wallet className="h-5 w-5" />}
              variant="success"
            />
            {isAdmin ? (
              <StatCard
                title="إجمالي إيرادات المنصة"
                value={formatPrice(stats.purchases.platform_fee_total)}
                icon={<Wallet className="h-5 w-5" />}
                variant="success"
              />
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="دروس منشورة"
              value={String(stats.content.published_lessons)}
              icon={<BookOpen className="h-5 w-5" />}
            />
            <StatCard
              title="فيديوهات جاهزة"
              value={String(stats.content.videos_ready)}
              icon={<Video className="h-5 w-5" />}
            />
            <StatCard
              title="ملفات PDF جاهزة"
              value={String(stats.content.pdfs_ready)}
              icon={<FileText className="h-5 w-5" />}
            />
            <StatCard
              title="دروس مكتملة"
              value={String(stats.engagement.completed_lessons)}
              icon={<Trophy className="h-5 w-5" />}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="الطلاب والمشتريات حسب الصف">
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
            </SectionCard>

            <SectionCard title="الوحدات الأكثر مبيعًا">
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
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="أحدث المشتريات">
              {(Array.isArray(stats.recent_purchases) ? stats.recent_purchases : []).length === 0 ? (
                emptyTable
              ) : (
                <ul className="divide-y divide-border-muted">
                  {(Array.isArray(stats.recent_purchases) ? stats.recent_purchases : []).map((purchase) => (
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
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="مشاركة الطلاب">
              <div className="flex items-center justify-between py-3 text-sm">
                <span className="flex items-center gap-2 text-foreground-muted">
                  <Users className="h-4 w-4" />
                  طلاب بدأوا التعلم
                </span>
                <span className="font-semibold text-foreground" dir="ltr">
                  {stats.engagement.students_with_progress ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border-muted py-3 text-sm">
                <span className="flex items-center gap-2 text-foreground-muted">
                  <CheckCircle2 className="h-4 w-4" />
                  دروس مكتملة
                </span>
                <span className="font-semibold text-foreground" dir="ltr">
                  {stats.engagement.completed_lessons ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border-muted py-3 text-sm">
                <span className="flex items-center gap-2 text-foreground-muted">
                  <TrendingUp className="h-4 w-4" />
                  متوسط نسبة التقدم
                </span>
                <span className="font-semibold text-foreground" dir="ltr">
                  %{stats.engagement.avg_percent ?? 0}
                </span>
              </div>
              {/* Enhanced metrics — fallback to 0 for old DB without 0057 */}
              <div className="flex items-center justify-between border-t border-border-muted py-3 text-sm">
                <span className="flex items-center gap-2 text-foreground-muted">
                  <Activity className="h-4 w-4" />
                  نسبة المشاركة
                </span>
                <span className="font-semibold text-foreground" dir="ltr">
                  {stats.engagement.participation_rate ?? 0}%
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border-muted py-3 text-sm">
                <span className="flex items-center gap-2 text-foreground-muted">
                  <Clock3 className="h-4 w-4" />
                  نشط آخر 7 أيام
                </span>
                <span className="font-semibold text-foreground" dir="ltr">
                  {stats.engagement.active_last_7d ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border-muted py-3 text-sm">
                <span className="text-foreground-muted">طلاب بلا نشاط</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400" dir="ltr">
                  {stats.engagement.inactive_students ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border-muted py-3 text-sm">
                <span className="text-foreground-muted">معدل الإكمال</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400" dir="ltr">
                  {stats.engagement.completion_rate ?? 0}%
                </span>
              </div>
            </SectionCard>
          </div>

          {/* Distribution + Daily completions */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="توزيع التقدم">
              <DistributionBars distribution={stats.engagement.distribution} />
            </SectionCard>
            <SectionCard title="نشاط آخر 7 أيام">
              <DailyCompletionsChart daily={stats.daily_completions} />
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="الطلاب الأكثر نشاطاً">
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
            </SectionCard>

            <SectionCard title="آخر الدروس المكتملة">
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
            </SectionCard>
          </div>

          {/* Overview icon row for empty-friendly anchor */}
          <div className="flex items-center gap-2 text-xs text-foreground-subtle" aria-hidden="true">
            <BarChart3 className="h-3.5 w-3.5" />
            <span>بيانات المشاركة تُحدث تلقائياً من تقدم الطلاب</span>
          </div>
        </div>
      ) : null}
    </LayoutShell>
  );
}
