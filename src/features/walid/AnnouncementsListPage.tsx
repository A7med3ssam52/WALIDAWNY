import { useCallback, useEffect, useState } from 'react';
import { Plus, Edit, Trash2, Eye, ChevronLeft, ChevronRight } from 'lucide-react';

import { RoleNav } from '../../components/RoleNav';
import { Badge, type BadgeVariant } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { Modal } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from '../../components/Table';
import { useToast } from '../../components/Toast';
import { listAnnouncements, deleteAnnouncement } from '../../lib/announcements';
import { formatDateTime } from '../../lib/format';
import type { Announcement, AnnouncementVariant } from '../../lib/announcements';

const VARIANT_BADGE: Record<AnnouncementVariant, BadgeVariant> = {
  info: 'info',
  warning: 'warning',
  success: 'success',
  error: 'error',
};

const VARIANT_LABELS: Record<AnnouncementVariant, string> = {
  info: 'معلومات',
  warning: 'تحذير',
  success: 'نجاح',
  error: 'خطأ',
};

const PAGE_SIZE = 20;

export function WalidAnnouncementsListPage() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Announcement | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setError(false);
    try {
      const data = await listAnnouncements(PAGE_SIZE, targetPage * PAGE_SIZE);
      setRows(data);
      setPage(targetPage);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    setBusy(true);
    try {
      await deleteAnnouncement(deleteCandidate.id);
      showToast('تم حذف الإعلان');
      setDeleteCandidate(null);
      await load(page);
    } catch {
      showToast('تعذر الحذف. حاول مرة أخرى', 'error');
      setDeleteCandidate(null);
    } finally {
      setBusy(false);
    }
  };

  const hasMore = (rows?.length ?? 0) === PAGE_SIZE;

  return (
    <LayoutShell
      title="إدارة الإعلانات"
      subtitle="إنشاء وتعديل وحذف إعلانات المنصة — المعاينة تظهر في صفحة التعديل فقط"
      variant="sidebar"
      nav={<RoleNav />}
    >
      <div className="flex flex-col gap-4">
        <Card title="قائمة الإعلانات" subtitle={`الصفحة ${page + 1}`}>
          {error ? (
            <ErrorState message="تعذر تحميل الإعلانات" onRetry={() => void load(page)} />
          ) : rows === null ? (
            <div className="flex flex-col gap-3" aria-hidden="true">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="لا توجد إعلانات"
              description="ابدأ بإنشاء أول إعلان للمنصة."
              action={
                <Button
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => window.location.href = '/walid/announcements/new'}
                >
                  إنشاء إعلان
                </Button>
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>العنوان</TableHeadCell>
                      <TableHeadCell>النوع</TableHeadCell>
                      <TableHeadCell>الحالة</TableHeadCell>
                      <TableHeadCell>يبدأ في</TableHeadCell>
                      <TableHeadCell>ينتهي في</TableHeadCell>
                      <TableHeadCell className="text-center">إجراءات</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id} data-testid={`announcement-row-${row.id}`}>
                        <TableCell label="العنوان" className="font-medium text-foreground max-w-xs truncate">
                          {row.title}
                        </TableCell>
                        <TableCell label="النوع">
                          <Badge variant={VARIANT_BADGE[row.variant] ?? 'neutral'}>
                            {VARIANT_LABELS[row.variant] ?? row.variant}
                          </Badge>
                        </TableCell>
                        <TableCell label="الحالة">
                          <Badge variant={row.is_active ? 'success' : 'neutral'}>
                            {row.is_active ? 'نشط' : 'غير نشط'}
                          </Badge>
                        </TableCell>
                        <TableCell label="يبدأ في" className="font-mono text-xs" dir="ltr">
                          {formatDateTime(row.starts_at)}
                        </TableCell>
                        <TableCell label="ينتهي في" className="font-mono text-xs" dir="ltr">
                          {row.ends_at ? formatDateTime(row.ends_at) : '—'}
                        </TableCell>
                        <TableCell label="إجراءات" className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Eye className="h-4 w-4" />}
                              onClick={() => window.location.href = `/walid/announcements/${row.id}/edit`}
                              aria-label={`معاينة وتعديل ${row.title}`}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Edit className="h-4 w-4" />}
                              onClick={() => window.location.href = `/walid/announcements/${row.id}/edit`}
                              aria-label={`تعديل ${row.title}`}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Trash2 className="h-4 w-4" />}
                              onClick={() => setDeleteCandidate(row)}
                              className="text-error hover:bg-error/10"
                              aria-label={`حذف ${row.title}`}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm text-foreground-subtle">
                  {rows.length} إعلان في هذه الصفحة
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ChevronLeft className="h-4 w-4" />}
                    disabled={page === 0}
                    onClick={() => void load(page - 1)}
                  >
                    السابق
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ChevronRight className="h-4 w-4" />}
                    disabled={!hasMore}
                    onClick={() => void load(page + 1)}
                  >
                    التالي
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>

        <div className="flex justify-end">
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => window.location.href = '/walid/announcements/new'}
          >
            إنشاء إعلان جديد
          </Button>
        </div>
      </div>

      <Modal
        open={deleteCandidate !== null}
        title="حذف الإعلان"
        description={
          deleteCandidate
            ? `هل تريد حذف إعلان «${deleteCandidate.title}»؟ لا يمكن التراجع عن هذا الإجراء.`
            : ''
        }
        confirmLabel="نعم، احذف"
        danger={true}
        loading={busy}
        onConfirm={() => void handleDelete()}
        onCancel={() => { if (!busy) setDeleteCandidate(null); }}
      />
    </LayoutShell>
  );
}