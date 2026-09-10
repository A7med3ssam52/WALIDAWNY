import { useCallback, useEffect, useState } from 'react';
import { Clock, History } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { AdminNav } from '../../components/AdminNav';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { Pagination } from '../../components/Pagination';
import { Skeleton } from '../../components/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from '../../components/Table';
import { getProfileById, getStudentPresenceHistory } from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type { PresenceHistoryRow, Profile } from '../../types/database';

const PAGE_SIZE = 20;

function formatDurationSeconds(sec: number): string {
  if (sec < 60) return `${sec} ث`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}د ${s}ث` : `${m}د`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}س ${rm}د` : `${h}س`;
}

export function StudentPresenceHistoryPage() {
  const { studentId = '' } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<PresenceHistoryRow[] | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);
  const [totalHint, setTotalHint] = useState<number | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const p = await getProfileById(studentId);
      setProfile(p);
    } catch {
      // ignore
    }
  }, [studentId]);

  const load = useCallback(
    async (targetPage: number) => {
      setError(false);
      try {
        const data = await getStudentPresenceHistory(studentId, {
          limit: PAGE_SIZE,
          offset: targetPage * PAGE_SIZE,
        });
        setRows(data);
        setPage(targetPage);
        // heuristic: if we got less than PAGE_SIZE, we are at last page
        if (data.length < PAGE_SIZE) {
          setTotalHint(targetPage * PAGE_SIZE + data.length);
        } else {
          setTotalHint(null);
        }
      } catch {
        setError(true);
      }
    },
    [studentId],
  );

  useEffect(() => {
    void loadProfile();
    void load(0);
  }, [load, loadProfile]);

  const totalSessions = totalHint;
  const totalPages = totalHint !== null ? Math.max(1, Math.ceil(totalHint / PAGE_SIZE)) : null;

  const totalHours =
    rows && rows.length > 0
      ? (rows.reduce((a, b) => a + (b.duration_seconds ?? 0), 0) / 3600).toFixed(1)
      : null;

  return (
    <LayoutShell
      title={profile ? `سجل حضور — ${profile.full_name}` : 'سجل حضور الطالب'}
      subtitle={profile ? `${profile.phone} · ${profile.grade_id ?? '—'}` : undefined}
      variant="sidebar"
      nav={<AdminNav />}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/admin/presence"
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-white/10"
          >
            ← العودة للمتواجدين
          </Link>
          {profile ? (
            <Link
              to={`/walid/students/${studentId}`}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-white/10"
            >
              ملف الطالب
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card title="إجمالي الجلسات (الصفحة الحالية)">
            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold text-foreground">{rows?.length ?? '—'}</span>
            </div>
          </Card>
          <Card title="مجموع الوقت (الصفحة)">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold text-foreground">
                {totalHours !== null ? `${totalHours} ساعة` : '—'}
              </span>
            </div>
          </Card>
          <Card title="آخر تحديث">
            <p className="text-sm text-foreground-muted">{new Date().toLocaleString('ar-EG')}</p>
          </Card>
        </div>

        <Card title="سجل الجلسات" subtitle={totalSessions !== null ? `${totalSessions} جلسة` : 'أحدث الجلسات أولاً'}>
          {error ? (
            <ErrorState message="تعذر تحميل السجل" onRetry={() => void load(page)} />
          ) : rows === null ? (
            <div className="flex flex-col gap-3" aria-hidden="true">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="لا توجد جلسات" description="هذا الطالب لم يسجل أي حضور بعد." />
          ) : (
            <>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>بدأت</TableHeadCell>
                    <TableHeadCell>انتهت</TableHeadCell>
                    <TableHeadCell>المدة</TableHeadCell>
                    <TableHeadCell>الصفحة</TableHeadCell>
                    <TableHeadCell>الحالة</TableHeadCell>
                    <TableHeadCell>IP</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} data-testid={`history-row-${r.id}`}>
                      <TableCell label="بدأت">{formatDateTime(r.started_at)}</TableCell>
                      <TableCell label="انتهت">
                        {r.ended_at ? formatDateTime(r.ended_at) : <span className="text-success">مفتوحة الآن</span>}
                      </TableCell>
                      <TableCell label="المدة">{formatDurationSeconds(r.duration_seconds)}</TableCell>
                      <TableCell label="الصفحة">
                        <span className="font-mono text-xs" dir="ltr">
                          {r.current_path ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell label="الحالة">{r.is_visible ? 'مقدمة' : 'خلفية'}</TableCell>
                      <TableCell label="IP">
                        <span className="font-mono text-xs" dir="ltr">
                          {r.ip_address ?? '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages !== null ? (
                <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
                  <p className="text-sm text-foreground-subtle">
                    صفحة {page + 1} من {totalPages}
                  </p>
                  <Pagination page={page} totalPages={totalPages} onPageChange={(n) => void load(n)} />
                </div>
              ) : (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => void load(page + 1)}
                    className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-foreground hover:bg-white/10"
                    disabled={rows.length < PAGE_SIZE}
                  >
                    التالي
                  </button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </LayoutShell>
  );
}
