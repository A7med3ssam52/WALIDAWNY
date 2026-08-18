import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';

import { Button } from '../../components/Button';
import { DirectionalArrow } from '../../components/DirectionalArrow';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { Modal } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';
import { RoleNav } from '../../components/RoleNav';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from '../../components/Table';
import { useToast } from '../../components/Toast';
import { listTrash, restoreStudent } from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type { Profile } from '../../types/database';

export function TrashPage() {
  const { showToast } = useToast();

  const [students, setStudents] = useState<Profile[] | null>(null);
  const [error, setError] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    setStudents(null);
    try {
      setStudents(await listTrash());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRestore = async () => {
    if (!pendingRestore) {
      return;
    }
    setBusy(true);
    try {
      await restoreStudent(pendingRestore.id);
      showToast('تمت استعادة الطالب بنجاح');
      setPendingRestore(null);
      await load();
    } catch {
      showToast('تعذر استعادة الطالب', 'error');
      setPendingRestore(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <LayoutShell
      title="سلة المحذوفات"
      subtitle="الطلاب المحذوفون مؤقتًا"
      variant="sidebar"
      nav={<RoleNav />}
      actions={
        <Link
          to="/walid/students"
          className="glass-soft inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 sm:h-10"
        >
          <DirectionalArrow direction="back" />
          العودة إلى قائمة الطلاب
        </Link>
      }
    >
      {error ? (
        <ErrorState message="تعذر تحميل سلة المحذوفات" onRetry={() => void load()} />
      ) : students === null ? (
        <div className="flex flex-col gap-3" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-sm" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <EmptyState title="سلة المحذوفات فارغة" description="لا يوجد طلاب محذوفون حاليًا." />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeadCell>الاسم</TableHeadCell>
              <TableHeadCell>رقم الهاتف</TableHeadCell>
              <TableHeadCell>تاريخ الحذف</TableHeadCell>
              <TableHeadCell>إجراءات</TableHeadCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {students.map((student) => (
              <TableRow key={student.id} data-testid={`trash-row-${student.id}`}>
                <TableCell label="الاسم" className="font-medium text-foreground">
                  {student.full_name}
                </TableCell>
                <TableCell label="رقم الهاتف" dir="ltr">
                  {student.phone}
                </TableCell>
                <TableCell label="تاريخ الحذف">{formatDateTime(student.deleted_at)}</TableCell>
                <TableCell label="إجراءات">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<RotateCcw aria-hidden="true" className="h-4 w-4" />}
                    onClick={() => setPendingRestore(student)}
                    className="text-primary-strong hover:bg-primary-soft hover:text-primary-strong"
                  >
                    استعادة
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal
        open={pendingRestore !== null}
        title="استعادة الطالب"
        description={
          pendingRestore
            ? `سيتم إعادة ${pendingRestore.full_name} إلى قائمة الطلاب النشطين.`
            : undefined
        }
        confirmLabel="نعم، استعادة"
        loading={busy}
        onConfirm={() => void handleRestore()}
        onCancel={() => {
          if (!busy) {
            setPendingRestore(null);
          }
        }}
      />
    </LayoutShell>
  );
}
