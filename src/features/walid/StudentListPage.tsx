import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Pause, Play, Search, Trash2 } from 'lucide-react';

import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { Modal } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';
import { StaffNav } from '../../components/StaffNav';
import { StatusBadge } from '../../components/StatusBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from '../../components/Table';
import { useToast } from '../../components/Toast';
import { disableStudent, enableStudent, listStudents, softDeleteStudent } from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type { Profile } from '../../types/database';

type StatusFilter = 'all' | 'active' | 'disabled';

type PendingAction = { kind: 'disable' | 'enable' | 'delete'; student: Profile } | null;

const filterTabs: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'active', label: 'نشط' },
  { value: 'disabled', label: 'موقوف' },
];

function modalCopy(pending: NonNullable<PendingAction>): {
  title: string;
  description: string;
  label: string;
} {
  if (pending.kind === 'delete') {
    return {
      title: 'حذف الطالب',
      description: `سيتم نقل ${pending.student.full_name} إلى سلة المحذوفات ولن يتمكن من تسجيل الدخول. يمكنك استعادته لاحقًا.`,
      label: 'نعم، حذف',
    };
  }
  if (pending.kind === 'disable') {
    return {
      title: 'إيقاف الطالب',
      description: `سيتم منع ${pending.student.full_name} من تسجيل الدخول حتى يتم إعادة تفعيله.`,
      label: 'نعم، إيقاف',
    };
  }
  return {
    title: 'تفعيل الطالب',
    description: `سيتم السماح لـ ${pending.student.full_name} بتسجيل الدخول مرة أخرى.`,
    label: 'نعم، تفعيل',
  };
}

function StudentsTableSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full rounded-sm" />
      ))}
    </div>
  );
}

export function StudentListPage() {
  const { showToast } = useToast();
  const [students, setStudents] = useState<Profile[] | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    setStudents(null);
    try {
      setStudents(await listStudents());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = (students ?? []).filter((student) => {
    if (statusFilter !== 'all' && student.status !== statusFilter) {
      return false;
    }
    const query = search.trim().toLowerCase();
    if (
      query &&
      !student.full_name.toLowerCase().includes(query) &&
      !student.phone.includes(query)
    ) {
      return false;
    }
    return true;
  });

  const confirm = (kind: 'disable' | 'enable' | 'delete', student: Profile) => {
    setPending({ kind, student });
  };

  const runAction = async (action: NonNullable<PendingAction>) => {
    setBusy(true);
    try {
      if (action.kind === 'disable') {
        await disableStudent(action.student.id);
        showToast('تم إيقاف الطالب');
      } else if (action.kind === 'enable') {
        await enableStudent(action.student.id);
        showToast('تم تفعيل الطالب');
      } else {
        await softDeleteStudent(action.student.id);
        showToast('تم نقل الطالب إلى سلة المحذوفات');
      }
      await load();
    } catch {
      showToast('تعذر تنفيذ العملية. حاول مرة أخرى', 'error');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <LayoutShell
      title="إدارة الطلاب"
      subtitle="قائمة الطلاب المسجلين في المنصة"
      variant="sidebar"
      nav={<StaffNav />}
      actions={
        <Link
          to="/walid/students/trash"
          className="glass-soft inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 sm:h-10"
        >
          سلة المحذوفات
        </Link>
      }
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <Input
            label="بحث"
            name="search"
            icon={<Search className="h-4 w-4" />}
            placeholder="بحث بالاسم أو رقم الهاتف"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="تصفية حسب الحالة">
          {filterTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              aria-pressed={statusFilter === tab.value}
              className={`rounded-lg px-3.5 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 ${
                statusFilter === tab.value
                  ? 'btn-primary text-primary-foreground'
                  : 'glass-soft text-foreground-muted hover:bg-white/10 hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState message="تعذر تحميل قائمة الطلاب" onRetry={() => void load()} />
      ) : students === null ? (
        <StudentsTableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={students.length === 0 ? 'لا يوجد طلاب مسجلون بعد' : 'لا توجد نتائج مطابقة'}
          description={
            students.length === 0
              ? 'عندما يسجل الطلاب في المنصة سيظهرون هنا.'
              : 'جرّب تغيير البحث أو الفلتر.'
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeadCell>الاسم</TableHeadCell>
              <TableHeadCell>رقم الهاتف</TableHeadCell>
              <TableHeadCell>الحالة</TableHeadCell>
              <TableHeadCell>تاريخ التسجيل</TableHeadCell>
              <TableHeadCell>إجراءات</TableHeadCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((student) => (
              <TableRow key={student.id} data-testid={`student-row-${student.id}`}>
                <TableCell label="الاسم" className="font-medium text-foreground">
                  {student.full_name}
                </TableCell>
                <TableCell label="رقم الهاتف" dir="ltr">
                  {student.phone}
                </TableCell>
                <TableCell label="الحالة">
                  <StatusBadge status={student.status} deleted={Boolean(student.deleted_at)} />
                </TableCell>
                <TableCell label="تاريخ التسجيل">{formatDateTime(student.created_at)}</TableCell>
                <TableCell label="إجراءات">
                  <div className="flex flex-wrap items-center gap-1">
                    <Link
                      to={`/walid/students/${student.id}`}
                      className="inline-flex h-11 items-center gap-1.5 rounded-sm px-2.5 text-sm font-semibold text-primary-strong transition-colors hover:bg-primary-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 sm:h-10"
                    >
                      <Eye aria-hidden="true" className="h-4 w-4" />
                      عرض التفاصيل
                    </Link>
                    {student.status === 'active' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pause aria-hidden="true" className="h-4 w-4" />}
                        onClick={() => confirm('disable', student)}
                      >
                        إيقاف
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Play aria-hidden="true" className="h-4 w-4" />}
                        onClick={() => confirm('enable', student)}
                      >
                        تفعيل
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                      onClick={() => confirm('delete', student)}
                      className="text-error hover:bg-rose-500/10 hover:text-error"
                    >
                      حذف
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal
        open={pending !== null}
        title={pending ? modalCopy(pending).title : ''}
        description={pending ? modalCopy(pending).description : undefined}
        confirmLabel={pending ? modalCopy(pending).label : ''}
        danger={pending?.kind === 'delete'}
        loading={busy}
        onConfirm={() => {
          if (pending) {
            void runAction(pending);
          }
        }}
        onCancel={() => {
          if (!busy) {
            setPending(null);
          }
        }}
      />
    </LayoutShell>
  );
}
