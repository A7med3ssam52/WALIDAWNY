import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BadgeCheck,
  BookOpen,
  Clock,
  FileText,
  KeyRound,
  Users,
  Video,
  Wallet,
} from 'lucide-react';

import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { Skeleton } from '../../components/Skeleton';
import { StaffNav } from '../../components/StaffNav';
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
import { formatDate, formatDateTime, formatPrice } from '../../lib/format';
import type { DashboardStats } from '../../types/database';

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return <Card title={title}>{children}</Card>;
}

const emptyTable = (
  <EmptyState title="لا توجد بيانات بعد" className="glass-soft border-0" />
);

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

export function WalidDashboardPage({ nav }: { nav?: ReactNode }) {
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
      subtitle="نظرة عامة على الطلاب والاشتراكات والمحتوى"
      variant="sidebar"
      nav={nav ?? <StaffNav />}
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
              label="الطلاب"
              value={String(stats.students.total)}
              hint={`جدد هذا الشهر: ${stats.students.new_this_month}`}
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label="اشتراكات نشطة"
              value={String(stats.subscriptions.active)}
              tone="success"
              icon={<BadgeCheck className="h-5 w-5" />}
            />
            <StatCard
              label="تنتهي خلال 7 أيام"
              value={String(stats.subscriptions.expiring_7d)}
              tone="warning"
              icon={<Clock className="h-5 w-5" />}
            />
            <StatCard
              label="إيرادات الاشتراكات"
              value={formatPrice(stats.subscriptions.revenue_total)}
              tone="success"
              icon={<Wallet className="h-5 w-5" />}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="دروس منشورة"
              value={String(stats.content.published_lessons)}
              hint={`من أصل ${stats.content.lessons} درس`}
              icon={<BookOpen className="h-5 w-5" />}
            />
            <StatCard
              label="فيديوهات جاهزة"
              value={String(stats.content.videos_ready)}
              hint={`من أصل ${stats.content.videos} فيديو`}
              icon={<Video className="h-5 w-5" />}
            />
            <StatCard
              label="ملفات PDF جاهزة"
              value={String(stats.content.pdfs_ready)}
              hint={`من أصل ${stats.content.pdfs} ملف`}
              icon={<FileText className="h-5 w-5" />}
            />
            <StatCard
              label="أكواد متاحة"
              value={String(stats.codes.available)}
              hint={`مستخدمة: ${stats.codes.used} · ملغاة: ${stats.codes.revoked}`}
              icon={<KeyRound className="h-5 w-5" />}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="الطلاب حسب الصف">
              {stats.by_grade.length === 0 ? (
                emptyTable
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>الصف</TableHeadCell>
                      <TableHeadCell>الطلاب</TableHeadCell>
                      <TableHeadCell>مشتركون نشطون</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stats.by_grade.map((row) => (
                      <TableRow key={row.grade_name}>
                        <TableCell label="الصف" className="font-medium text-foreground">
                          {row.grade_name}
                        </TableCell>
                        <TableCell label="الطلاب">{row.students}</TableCell>
                        <TableCell label="مشتركون نشطون">{row.active_subscribers}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </SectionCard>

            <SectionCard title="آخر الاشتراكات">
              {stats.recent_subscriptions.length === 0 ? (
                emptyTable
              ) : (
                <ul className="divide-y divide-border-muted">
                  {stats.recent_subscriptions.map((sub) => (
                    <li
                      key={`${sub.student_name}-${sub.started_at}`}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{sub.student_name}</p>
                        <p className="mt-0.5 text-xs text-foreground-subtle">
                          {sub.grade_name ?? '—'} · {sub.duration_days} يوم ·{' '}
                          {formatDate(sub.started_at)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium text-foreground" dir="ltr">
                        {formatPrice(sub.total_price)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="اشتراكات تنتهي قريبًا">
              {stats.upcoming_expirations.length === 0 ? (
                emptyTable
              ) : (
                <ul className="divide-y divide-border-muted">
                  {stats.upcoming_expirations.map((exp) => (
                    <li
                      key={exp.student_name}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <span className="truncate font-medium text-foreground">
                        {exp.student_name}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-warning" dir="ltr">
                        {formatDateTime(exp.expires_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="مشاركة الطلاب">
              <div className="flex items-center justify-between py-3 text-sm">
                <span className="text-foreground-muted">طلاب بدأوا التعلم</span>
                <span className="font-semibold text-foreground" dir="ltr">
                  {stats.engagement.students_with_progress}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border-muted py-3 text-sm">
                <span className="text-foreground-muted">دروس مكتملة</span>
                <span className="font-semibold text-foreground" dir="ltr">
                  {stats.engagement.completed_lessons}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border-muted py-3 text-sm">
                <span className="text-foreground-muted">متوسط نسبة التقدم</span>
                <span className="font-semibold text-foreground" dir="ltr">
                  %{stats.engagement.avg_percent}
                </span>
              </div>
            </SectionCard>
          </div>
        </div>
      ) : null}
    </LayoutShell>
  );
}
