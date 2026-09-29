import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, CalendarDays, Eye, Pause, Phone, Play, Search, Trash2 } from 'lucide-react';

import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { Modal } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';
import { RoleNav } from '../../components/RoleNav';
import { StatusBadge } from '../../components/StatusBadge';
import { Textarea } from '../../components/Textarea';
import { useToast } from '../../components/Toast';
import { disableStudent, enableStudent, listStudents, remindMissingAvatars, softDeleteStudent } from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type { Profile } from '../../types/database';

type StatusFilter = 'all' | 'active' | 'disabled' | 'noavatar';

type PendingAction = { kind: 'disable' | 'enable' | 'delete'; student: Profile } | null;

const filterTabs: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'active', label: 'نشط' },
  { value: 'disabled', label: 'موقوف' },
  { value: 'noavatar', label: 'بدون صورة' },
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
      description: `سيتم إيقاف ${pending.student.full_name} وسيرى سبب الإيقاف عند تسجيل الدخول.`,
      label: 'نعم، إيقاف',
    };
  }
  return {
    title: 'تفعيل الطالب',
    description: `سيتم السماح لـ ${pending.student.full_name} بتسجيل الدخول مرة أخرى.`,
    label: 'نعم، تفعيل',
  };
}

function StudentsGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="glass-card flex flex-col items-center p-5">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="mt-3 h-4 w-32" />
          <Skeleton className="mt-2 h-5 w-20 rounded-full" />
          <Skeleton className="mt-4 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </div>
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
  const [remindBusy, setRemindBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

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
    if (statusFilter === 'noavatar') {
      if (student.avatar_path) {
        return false;
      }
    } else if (statusFilter !== 'all' && student.status !== statusFilter) {
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
    setReason('');
    setReasonError(null);
    setPending({ kind, student });
  };

  const missingAvatarCount = (students ?? []).filter((student) => !student.avatar_path).length;

  const runAction = async (action: NonNullable<PendingAction>) => {
    if (action.kind === 'disable' && reason.trim().length === 0) {
      setReasonError('سبب الإيقاف مطلوب وسيظهر للطالب');
      return;
    }
    setBusy(true);
    try {
      if (action.kind === 'disable') {
        await disableStudent(action.student.id, reason.trim());
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
      setReason('');
      setReasonError(null);
    }
  };

  const handleRemindAll = async () => {
    if (remindBusy) {
      return;
    }
    setRemindBusy(true);
    try {
      const count = await remindMissingAvatars();
      showToast(
        count > 0 ? `تم إرسال التذكير إلى ${count} طالب بدون صورة` : 'لا يوجد طلبة بدون صورة حاليًا',
      );
    } catch {
      showToast('تعذر إرسال التذكير. حاول مرة أخرى', 'error');
    } finally {
      setRemindBusy(false);
    }
  };

  return (
    <LayoutShell
      title="إدارة الطلاب"
      subtitle="قائمة الطلاب المسجلين في المنصة"
      variant="sidebar"
      nav={<RoleNav />}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<BellRing aria-hidden="true" className="h-4 w-4" />}
            loading={remindBusy}
            onClick={() => void handleRemindAll()}
            className="shrink-0 rounded-xl"
          >
            تذكير الكل بالصورة
          </Button>
          <Link
            to="/walid/students/trash"
            className="inline-flex h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-subtle transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 sm:h-10"
          >
            سلة المحذوفات
          </Link>
        </div>
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
                  : 'border border-border bg-surface text-foreground-muted shadow-subtle hover:bg-surface-muted hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.value === 'noavatar' && missingAvatarCount > 0 ? (
                <span
                  aria-label={`${missingAvatarCount} بدون صورة`}
                  className="ms-1.5 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-bold text-warning"
                >
                  {missingAvatarCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState message="تعذر تحميل قائمة الطلاب" onRetry={() => void load()} />
      ) : students === null ? (
        <StudentsGridSkeleton />
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((student) => {
            const initial = student.full_name.trim().charAt(0) || 'ط';
            const isActive = student.status === 'active';
            return (
              <article
                key={student.id}
                data-testid={`student-row-${student.id}`}
                className="glass-card flex flex-col overflow-hidden"
              >
                <div className="flex flex-col items-center px-4 pt-5 text-center">
                  <span
                    aria-hidden="true"
                    className={`flex h-16 w-16 items-center justify-center rounded-full text-xl font-black ring-2 ${
                      isActive
                        ? 'bg-primary-soft text-primary-strong ring-success/50'
                        : 'bg-surface-muted text-foreground-muted ring-warning/50'
                    }`}
                  >
                    {initial}
                  </span>
                  <h3 className="mt-3 w-full truncate text-base font-bold text-foreground">
                    {student.full_name}
                  </h3>
                  <div className="mt-1.5">
                    <StatusBadge status={student.status} deleted={Boolean(student.deleted_at)} />
                  </div>
                </div>
                <dl className="flex flex-col gap-2 px-4 py-4 text-xs">
                  <div className="flex items-center justify-center gap-1.5 text-foreground-muted">
                    <dt className="sr-only">رقم الهاتف</dt>
                    <Phone aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    <dd className="font-semibold tabular-nums" dir="ltr">
                      {student.phone}
                    </dd>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 text-foreground-subtle">
                    <dt className="sr-only">تاريخ التسجيل</dt>
                    <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    <dd>انضم {formatDateTime(student.created_at)}</dd>
                  </div>
                  {!isActive && student.suspension_reason ? (
                    <dd className="mx-auto mt-1 max-w-full truncate rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1 font-medium text-warning">
                      سبب الإيقاف: {student.suspension_reason}
                    </dd>
                  ) : null}
                </dl>
                <div className="mt-auto grid grid-cols-3 divide-x divide-border-muted border-t border-border-muted">
                  <Link
                    to={`/walid/students/${student.id}`}
                    aria-label={`عرض ${student.full_name}`}
                    className="flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-primary-strong transition-colors hover:bg-surface-muted focus:outline-none focus-visible:bg-surface-muted"
                  >
                    <Eye aria-hidden="true" className="h-4 w-4" />
                    عرض
                  </Link>
                  {isActive ? (
                    <button
                      type="button"
                      onClick={() => confirm('disable', student)}
                      aria-label="إيقاف"
                      className="flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-warning transition-colors hover:bg-surface-muted focus:outline-none"
                    >
                      <Pause aria-hidden="true" className="h-4 w-4" />
                      إيقاف
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => confirm('enable', student)}
                      aria-label="تفعيل"
                      className="flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-success transition-colors hover:bg-surface-muted focus:outline-none"
                    >
                      <Play aria-hidden="true" className="h-4 w-4" />
                      تفعيل
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => confirm('delete', student)}
                    aria-label="حذف"
                    className="flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-error transition-colors hover:bg-surface-muted focus:outline-none"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    حذف
                  </button>
                </div>
              </article>
            );
          })}
        </div>
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
            setReason('');
            setReasonError(null);
          }
        }}
      >
        {pending?.kind === 'disable' ? (
          <div className="mt-4">
            <Textarea
              label="سبب الإيقاف (إجباري)"
              name="suspension-reason"
              placeholder="اكتب سبب الإيقاف — سيظهر للطالب"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError) {
                  setReasonError(null);
                }
              }}
              error={reasonError ?? undefined}
              rows={3}
            />
          </div>
        ) : null}
      </Modal>
    </LayoutShell>
  );
}
