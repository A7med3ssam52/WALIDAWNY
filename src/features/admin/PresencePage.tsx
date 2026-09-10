import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Clock, Eye, Search, Users, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';

import { AdminNav } from '../../components/AdminNav';
import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
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
import { getMostActiveStudents, getOnlineStudents } from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type { MostActiveStudent, OnlineStudent } from '../../types/database';

const POLL_INTERVAL_MS = 10_000;

function formatDuration(minutes: number): string {
  if (minutes < 1) return 'أقل من دقيقة';
  if (minutes < 60) return `${Math.round(minutes)} دقيقة`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (m === 0) return `${h} ساعة`;
  return `${h} ساعة و ${m} دقيقة`;
}

function pathLabel(path: string | null): string {
  if (!path) return '—';
  if (path.includes('/lessons/')) return 'يشاهد درس';
  if (path.includes('/curriculum')) return 'يتصفح المنهج';
  if (path.includes('/units')) return 'صفحة وحداتي';
  if (path.includes('/dashboard')) return 'لوحة الطالب';
  if (path.includes('/notifications')) return 'الإشعارات';
  if (path.includes('/profile')) return 'الملف الشخصي';
  return path.length > 40 ? path.slice(0, 40) + '…' : path;
}

function friendlyPath(path: string | null): string {
  if (!path) return '—';
  return path;
}

export function PresencePage() {
  const [online, setOnline] = useState<OnlineStudent[] | null>(null);
  const [mostActive, setMostActive] = useState<MostActiveStudent[] | null>(null);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'ranking'>('live');
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');

  const loadLive = useCallback(async () => {
    try {
      const data = await getOnlineStudents();
      setOnline(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  const loadRanking = useCallback(async () => {
    try {
      const data = await getMostActiveStudents({ limit: 20 });
      setMostActive(data);
    } catch {
      // ranking is non-critical
    }
  }, []);

  useEffect(() => {
    void loadLive();
    void loadRanking();
    const id = setInterval(() => {
      void loadLive();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadLive, loadRanking]);

  const filteredOnline = useMemo(() => {
    if (!online) return null;
    let rows = online;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.full_name.toLowerCase().includes(q) ||
          r.phone.includes(q) ||
          (r.grade_name ?? '').toLowerCase().includes(q),
      );
    }
    if (gradeFilter.trim()) {
      rows = rows.filter((r) => r.grade_name === gradeFilter);
    }
    return rows;
  }, [online, search, gradeFilter]);

  const grades = useMemo(() => {
    if (!online) return [];
    return [...new Set(online.map((r) => r.grade_name).filter(Boolean))] as string[];
  }, [online]);

  const stats = useMemo(() => {
    const onlineCount = online?.length ?? 0;
    const visibleCount = online?.filter((r) => r.is_visible).length ?? 0;
    const avgMinutes =
      online && online.length > 0
        ? Math.round(online.reduce((a, b) => a + (b.minutes_online ?? 0), 0) / online.length)
        : 0;
    return { onlineCount, visibleCount, avgMinutes };
  }, [online]);

  return (
    <LayoutShell
      title="المتواجدون الآن"
      subtitle="متابعة لحظية لنشاط الطلاب — من يشاهد الآن وماذا يفعل"
      variant="sidebar"
      nav={<AdminNav />}
    >
      <div className="flex flex-col gap-4">
        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard
            title="أونلاين الآن"
            value={online === null ? '—' : String(stats.onlineCount)}
            icon={<Users className="h-5 w-5" />}
            variant="success"
          />
          <StatCard
            title="نشط في المقدمة"
            value={online === null ? '—' : String(stats.visibleCount)}
            icon={<Eye className="h-5 w-5" />}
            variant="info"
          />
          <StatCard
            title="متوسط مدة الجلسة"
            value={online === null ? '—' : formatDuration(stats.avgMinutes)}
            icon={<Clock className="h-5 w-5" />}
            variant="primary"
          />
          <StatCard
            title="يُحدث كل 10 ثوانٍ"
            value="مباشر"
            icon={<Activity className="h-5 w-5" />}
            variant="default"
          />
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="تبويبات المتابعة"
          className="flex w-full flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/4 p-1 sm:w-fit"
        >
          <button
            role="tab"
            aria-selected={activeTab === 'live'}
            onClick={() => setActiveTab('live')}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:flex-none ${
              activeTab === 'live' ? 'nav-pill-active font-bold text-white' : 'text-foreground-muted hover:text-foreground'
            }`}
            data-testid="presence-tab-live"
          >
            المتواجدون الآن {online !== null ? `(${online.length})` : ''}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'ranking'}
            onClick={() => {
              setActiveTab('ranking');
              void loadRanking();
            }}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:flex-none ${
              activeTab === 'ranking' ? 'nav-pill-active font-bold text-white' : 'text-foreground-muted hover:text-foreground'
            }`}
            data-testid="presence-tab-ranking"
          >
            الأكثر نشاطاً
          </button>
        </div>

        {activeTab === 'live' ? (
          <Card
            title="الطلاب المتصلون الآن"
            subtitle={online === null ? 'جاري التحميل...' : `${filteredOnline?.length ?? 0} طالب أونلاين — آخر تحديث: ${new Date().toLocaleTimeString('ar-EG')}`}
            actions={
              <button
                onClick={() => void loadLive()}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/10"
              >
                تحديث الآن
              </button>
            }
          >
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <Input
                label="بحث بالاسم أو الهاتف"
                name="presence-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن طالب..."
                icon={<Search className="h-4 w-4" />}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground-muted">تصفية بالصف</label>
                <select
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="">كل الصفوف</option>
                  {grades.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error ? (
              <ErrorState message="تعذر تحميل المتواجدين" onRetry={() => void loadLive()} />
            ) : online === null ? (
              <div className="flex flex-col gap-3" aria-hidden="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredOnline && filteredOnline.length === 0 ? (
              <EmptyState
                title={online.length === 0 ? 'لا يوجد طلاب متصلون الآن' : 'لا نتائج للبحث'}
                description={
                  online.length === 0
                    ? 'سيظهر هنا كل طالب يتصفح المنصة لحظياً (يُحدث كل 10 ثوانٍ).'
                    : 'جرّب تغيير كلمة البحث أو الصف.'
                }
              />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>الطالب</TableHeadCell>
                    <TableHeadCell>الصف</TableHeadCell>
                    <TableHeadCell>متصل منذ</TableHeadCell>
                    <TableHeadCell>يعمل الآن</TableHeadCell>
                    <TableHeadCell>الحالة</TableHeadCell>
                    <TableHeadCell>الإجراء</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredOnline!.map((row) => {
                    const isStale = (row.seconds_since_seen ?? 0) > 45;
                    return (
                      <TableRow key={row.session_id} data-testid={`presence-row-${row.student_id}`}>
                        <TableCell label="الطالب">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{row.full_name}</span>
                            <span className="font-mono text-xs text-foreground-subtle" dir="ltr">
                              {row.phone}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell label="الصف">{row.grade_name ?? '—'}</TableCell>
                        <TableCell label="متصل منذ">{formatDuration(row.minutes_online)}</TableCell>
                        <TableCell label="يعمل الآن">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-foreground">{pathLabel(row.current_path)}</span>
                            {row.lesson_title ? (
                              <span className="text-xs text-foreground-subtle">{row.lesson_title}</span>
                            ) : null}
                            <span className="font-mono text-[11px] text-foreground-subtle" dir="ltr">
                              {friendlyPath(row.current_path)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell label="الحالة">
                          {row.is_visible && !isStale ? (
                            <Badge variant="success">نشط الآن</Badge>
                          ) : row.is_visible && isStale ? (
                            <Badge variant="warning">خامل</Badge>
                          ) : (
                            <Badge variant="neutral">في الخلفية</Badge>
                          )}
                          <span className="ms-2 text-xs text-foreground-subtle">
                            {Math.round(row.seconds_since_seen ?? 0)}ث
                          </span>
                        </TableCell>
                        <TableCell label="الإجراء">
                          <Link
                            to={`/admin/presence/${row.student_id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/10"
                            data-testid={`presence-history-${row.student_id}`}
                          >
                            السجل
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        ) : (
          <Card title="الأكثر نشاطاً" subtitle="ترتيب الطلاب حسب إجمالي وقت الاتصال">
            {mostActive === null ? (
              <div className="flex flex-col gap-3" aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : mostActive.length === 0 ? (
              <EmptyState title="لا توجد بيانات نشاط بعد" description="سيظهر الترتيب بعد بدء تسجيل الجلسات." />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>#</TableHeadCell>
                    <TableHeadCell>الطالب</TableHeadCell>
                    <TableHeadCell>الصف</TableHeadCell>
                    <TableHeadCell>الجلسات</TableHeadCell>
                    <TableHeadCell>إجمالي الوقت</TableHeadCell>
                    <TableHeadCell>آخر ظهور</TableHeadCell>
                    <TableHeadCell>الإجراء</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mostActive.map((row, idx) => (
                    <TableRow key={row.student_id} data-testid={`ranking-row-${row.student_id}`}>
                      <TableCell label="#">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                          {idx + 1}
                        </span>
                      </TableCell>
                      <TableCell label="الطالب">
                        <div className="flex items-center gap-2">
                          {idx < 3 ? <Trophy className="h-4 w-4 text-amber-400" /> : null}
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{row.full_name}</span>
                            <span className="font-mono text-xs text-foreground-subtle" dir="ltr">
                              {row.phone}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell label="الصف">{row.grade_name ?? '—'}</TableCell>
                      <TableCell label="الجلسات">{row.total_sessions}</TableCell>
                      <TableCell label="إجمالي الوقت">
                        <span className="font-medium text-foreground">
                          {row.total_hours < 1 ? `${Math.round(row.total_seconds / 60)} دقيقة` : `${row.total_hours} ساعة`}
                        </span>
                      </TableCell>
                      <TableCell label="آخر ظهور">
                        {row.last_seen_at ? formatDateTime(row.last_seen_at) : '—'}
                      </TableCell>
                      <TableCell label="الإجراء">
                        <Link
                          to={`/admin/presence/${row.student_id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/10"
                        >
                          السجل
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        )}
      </div>
    </LayoutShell>
  );
}
