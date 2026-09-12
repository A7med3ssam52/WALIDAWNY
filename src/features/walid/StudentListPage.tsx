import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Pause, Play, Search, Trash2 } from 'lucide-react';

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
    setReason('');
    setReasonError(null);
    setPending({ kind, student });
  };

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

  return (
    <LayoutShell
      title="إدارة الطلاب"
      subtitle="قائمة الطلاب المسجلين في المنصة"
      variant="sidebar"
      nav={<RoleNav />}
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
        <div className="flex flex-col gap-3">
          {filtered.map((student) => (
            <div
              key={student.id}
              data-testid={`student-row-${student.id}`}
              className="flex overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] backdrop-blur transition-all hover:border-indigo-400/20 hover:bg-white/[0.04]"
            >
              <div className="min-w-0 flex-1 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/25 to-violet-500/25 text-sm font-bold text-indigo-200">
                    {student.full_name.trim().charAt(0) || 'ط'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{student.full_name}</span>
                      <StatusBadge status={student.status} deleted={Boolean(student.deleted_at)} />
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-foreground-subtle" dir="ltr">
                      {student.phone}
                      <span className="hidden text-white/15 sm:inline">•</span>
                      <span className="hidden sm:inline-flex items-center gap-1 text-foreground-subtle" dir="rtl">
                        {formatDateTime(student.created_at)}
                      </span>
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-foreground-subtle sm:hidden">{formatDateTime(student.created_at)}</p>
                <div className="sr-only" aria-hidden="true">
                  <div role="cell" data-label="الاسم"></div>
                  <div role="cell" data-label="رقم الهاتف"></div>
                  <div role="cell" data-label="الحالة"></div>
                  <div role="cell" data-label="تاريخ التسجيل"></div>
                  <div role="cell" data-label="إجراءات">
                    عرض التفاصيل
                  </div>
                </div>
              </div>
              <div className="flex w-[64px] shrink-0 flex-col divide-y divide-white/5 border-s border-white/8 bg-white/[0.02]">
                <Link
                  to={`/walid/students/${student.id}`}
                  aria-label={`عرض ${student.full_name}`}
                  className="flex flex-1 flex-col items-center justify-center gap-1 text-indigo-300 transition-colors hover:bg-indigo-500/10 hover:text-indigo-200 focus:outline-none focus-visible:bg-indigo-500/10"
                >
                  <Eye className="h-4 w-4" />
                  <span className="text-[10px] font-semibold">عرض</span>
                </Link>
{student.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => confirm('disable', student)}
                      aria-label="إيقاف"
                      className="flex flex-1 flex-col items-center justify-center gap-1 text-amber-300 transition-colors hover:bg-amber-500/10 hover:text-amber-200 focus:outline-none"
                    >
                      <Pause className="h-4 w-4" />
                      <span className="text-[10px] font-semibold">إيقاف</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => confirm('enable', student)}
                      aria-label="تفعيل"
                      className="flex flex-1 flex-col items-center justify-center gap-1 text-emerald-300 transition-colors hover:bg-emerald-500/10 hover:text-emerald-200 focus:outline-none"
                    >
                      <Play className="h-4 w-4" />
                      <span className="text-[10px] font-semibold">تفعيل</span>
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => confirm('delete', student)}
                  aria-label="حذف"
                  className="flex flex-1 flex-col items-center justify-center gap-1 text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200 focus:outline-none"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="text-[10px] font-semibold">حذف</span>
                </button>
              </div>
            </div>
          ))}
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
