import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Pause, Play, Trash2, UserRoundCheck } from 'lucide-react';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DirectionalArrow } from '../../components/DirectionalArrow';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { Skeleton } from '../../components/Skeleton';
import { StaffNav } from '../../components/StaffNav';
import { PurchaseBadge, StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import {
  disableStudent,
  enableStudent,
  getProfileById,
  listAllUnitPurchases,
  listGrades,
  restoreStudent,
  setStudentGrade,
  softDeleteStudent,
  updateStudentProfile,
} from '../../data/rpc';
import { formatDateTime, formatPrice } from '../../lib/format';
import { validateProfileForm, type ProfileFormValues } from '../../lib/validation';
import type { Grade, Profile, UnitPurchaseWithUnit } from '../../types/database';

type PendingAction = 'disable' | 'enable' | 'delete' | 'restore' | null;

function actionCopy(
  action: NonNullable<PendingAction>,
  student: Profile,
): {
  title: string;
  description: string;
  label: string;
  danger: boolean;
} {
  if (action === 'delete') {
    return {
      title: 'حذف الطالب',
      description: `سيتم نقل ${student.full_name} إلى سلة المحذوفات ولن يتمكن من تسجيل الدخول. يمكنك استعادته لاحقًا.`,
      label: 'نعم، حذف',
      danger: true,
    };
  }
  if (action === 'disable') {
    return {
      title: 'إيقاف الطالب',
      description: `سيتم منع ${student.full_name} من تسجيل الدخول حتى يتم إعادة تفعيله.`,
      label: 'نعم، إيقاف',
      danger: true,
    };
  }
  if (action === 'enable') {
    return {
      title: 'تفعيل الطالب',
      description: `سيتم السماح لـ ${student.full_name} بتسجيل الدخول مرة أخرى.`,
      label: 'نعم، تفعيل',
      danger: false,
    };
  }
  return {
    title: 'استعادة الطالب',
    description: `سيتم إعادة ${student.full_name} إلى قائمة الطلاب النشطين.`,
    label: 'نعم، استعادة',
    danger: false,
  };
}

function DetailItem({
  label,
  children,
  ltr = false,
}: {
  label: string;
  children: ReactNode;
  ltr?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-foreground-subtle">{label}</p>
      <p
        className={`mt-1 text-sm text-foreground ${ltr ? 'font-mono' : ''}`}
        dir={ltr ? 'ltr' : undefined}
      >
        {children}
      </p>
    </div>
  );
}

export function StudentDetailPage() {
  const { studentId } = useParams();
  const { showToast } = useToast();

  const [student, setStudent] = useState<Profile | null>(null);
  const [purchases, setPurchases] = useState<UnitPurchaseWithUnit[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState<ProfileFormValues>({
    fullName: '',
    phone: '',
    guardianPhone: '',
    address: '',
  });
  const [selectedGradeId, setSelectedGradeId] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileFormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) {
      return;
    }
    setLoadError(false);
    setStudent(null);
    try {
      const [nextStudent, nextGrades, nextPurchases] = await Promise.all([
        getProfileById(studentId),
        listGrades(),
        listAllUnitPurchases(studentId),
      ]);
      if (!nextStudent) {
        setLoadError(true);
        return;
      }
      setStudent(nextStudent);
      setGrades(nextGrades);
      setPurchases(nextPurchases);
      setForm({
        fullName: nextStudent.full_name,
        phone: nextStudent.phone,
        guardianPhone: nextStudent.guardian_phone,
        address: nextStudent.address,
      });
      setSelectedGradeId(nextStudent.grade_id ?? '');
    } catch {
      setLoadError(true);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!student) {
      return;
    }
    const nextErrors = validateProfileForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      await updateStudentProfile({
        studentId: student.id,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        guardianPhone: form.guardianPhone.trim(),
        address: form.address.trim(),
      });
      if (selectedGradeId !== (student.grade_id ?? '')) {
        try {
          await setStudentGrade(student.id, selectedGradeId || null);
        } catch {
          showToast('تم تحديث بيانات الطالب، لكن تعذر تعديل الصف الدراسي', 'error');
          await load();
          return;
        }
      }
      showToast('تم تحديث بيانات الطالب');
      await load();
    } catch {
      showToast('تعذر تحديث بيانات الطالب', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (action: NonNullable<PendingAction>) => {
    if (!student) {
      return;
    }
    setBusy(true);
    try {
      if (action === 'disable') {
        await disableStudent(student.id);
        showToast('تم إيقاف الطالب');
      } else if (action === 'enable') {
        await enableStudent(student.id);
        showToast('تم تفعيل الطالب');
      } else if (action === 'delete') {
        await softDeleteStudent(student.id);
        showToast('تم نقل الطالب إلى سلة المحذوفات');
      } else {
        await restoreStudent(student.id);
        showToast('تمت استعادة الطالب');
      }
      await load();
    } catch {
      showToast('تعذر تنفيذ العملية. حاول مرة أخرى', 'error');
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  };

  if (loadError) {
    return (
      <LayoutShell title="بيانات الطالب">
        <ErrorState message="تعذر تحميل بيانات الطالب" onRetry={() => void load()} />
      </LayoutShell>
    );
  }

  if (student === null) {
    return (
      <LayoutShell title="بيانات الطالب">
        <div className="space-y-4" aria-hidden="true">
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-48 w-full rounded-md" />
        </div>
      </LayoutShell>
    );
  }

  const gradeName = grades.find((grade) => grade.id === student.grade_id)?.name;
  const isDeleted = Boolean(student.deleted_at);

  return (
    <LayoutShell
      title={student.full_name}
      subtitle={`بيانات الطالب - ${student.phone}`}
      variant="sidebar"
      nav={<StaffNav />}
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
      <div className="flex flex-col gap-4">
        <Card title="معلومات الحساب">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailItem label="الحالة">
              <StatusBadge status={student.status} deleted={isDeleted} />
            </DetailItem>
            <DetailItem label="الصف الدراسي">{gradeName ?? 'بدون صف'}</DetailItem>
            <DetailItem label="رقم الهاتف" ltr>
              {student.phone}
            </DetailItem>
            <DetailItem label="هاتف ولي الأمر" ltr>
              {student.guardian_phone}
            </DetailItem>
            <DetailItem label="العنوان">{student.address}</DetailItem>
            <DetailItem label="تاريخ التسجيل">{formatDateTime(student.created_at)}</DetailItem>
            {isDeleted ? (
              <DetailItem label="تاريخ الحذف">{formatDateTime(student.deleted_at)}</DetailItem>
            ) : null}
          </div>
        </Card>

        <Card title="إجراءات الحساب">
          <div className="flex flex-wrap gap-3">
            {isDeleted ? (
              <Button
                variant="primary"
                icon={<UserRoundCheck aria-hidden="true" className="h-4 w-4" />}
                onClick={() => setPendingAction('restore')}
              >
                استعادة الطالب
              </Button>
            ) : (
              <>
                {student.status === 'active' ? (
                  <Button
                    variant="secondary"
                    icon={<Pause aria-hidden="true" className="h-4 w-4" />}
                    onClick={() => setPendingAction('disable')}
                  >
                    إيقاف الطالب
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    icon={<Play aria-hidden="true" className="h-4 w-4" />}
                    onClick={() => setPendingAction('enable')}
                  >
                    تفعيل الطالب
                  </Button>
                )}
                <Button
                  variant="danger"
                  icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                  onClick={() => setPendingAction('delete')}
                >
                  نقل إلى سلة المحذوفات
                </Button>
              </>
            )}
          </div>
        </Card>

        <Card title="الوحدات المشتراة" subtitle="وحدات مُفعّلة مدى الحياة لهذا الطالب">
          {purchases.length === 0 ? (
            <p className="text-sm text-foreground-muted">لم يشترِ هذا الطالب أي وحدات بعد.</p>
          ) : (
            <ul className="divide-y divide-border-muted">
              {purchases.map((purchase) => (
                <li
                  key={purchase.id}
                  className="flex items-center justify-between gap-3 py-3"
                  data-testid={`purchase-${purchase.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{purchase.unit_name}</p>
                    <p className="mt-0.5 text-xs text-foreground-subtle">
                      {formatDateTime(purchase.purchased_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-medium text-foreground" dir="ltr">
                      {formatPrice(purchase.total_price)}
                    </span>
                    <PurchaseBadge status={purchase.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="تعديل البيانات" subtitle="بيانات الطالب الشخصية">
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <Input
              label="الاسم الكامل"
              name="fullName"
              value={form.fullName}
              onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
              error={errors.fullName}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="رقم الهاتف"
                name="phone"
                dir="ltr"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                error={errors.phone}
              />
              <Input
                label="رقم هاتف ولي الأمر (اختياري)"
                name="guardianPhone"
                dir="ltr"
                value={form.guardianPhone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, guardianPhone: event.target.value }))
                }
                error={errors.guardianPhone}
              />
            </div>
            <Input
              label="العنوان"
              name="address"
              value={form.address}
              onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              error={errors.address}
            />
            <Select
              label="الصف الدراسي"
              name="grade"
              value={selectedGradeId}
              onChange={(event) => setSelectedGradeId(event.target.value)}
            >
              <option value="">بدون صف</option>
              {grades.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.name}
                </option>
              ))}
            </Select>
            <div>
              <Button type="submit" loading={submitting}>
                حفظ التغييرات
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <Modal
        open={pendingAction !== null}
        title={pendingAction && student ? actionCopy(pendingAction, student).title : ''}
        description={
          pendingAction && student ? actionCopy(pendingAction, student).description : undefined
        }
        confirmLabel={pendingAction && student ? actionCopy(pendingAction, student).label : ''}
        danger={pendingAction === 'disable' || pendingAction === 'delete'}
        loading={busy}
        onConfirm={() => {
          if (pendingAction) {
            void runAction(pendingAction);
          }
        }}
        onCancel={() => {
          if (!busy) {
            setPendingAction(null);
          }
        }}
      />
    </LayoutShell>
  );
}
