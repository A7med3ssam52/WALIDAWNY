import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { Skeleton } from '../../components/Skeleton';
import { StaffNav } from '../../components/StaffNav';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from '../../components/Table';
import { useToast } from '../../components/Toast';
import {
  deletePricingPlan,
  getRpcErrorCode,
  listGrades,
  listPricingPlans,
  setPricingPlan,
} from '../../data/rpc';
import { formatPrice } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import type { Grade, PricingPlanWithGrade } from '../../types/database';

const PRICING_ERROR_MESSAGES: Record<string, string> = {
  invalid_plan_values: 'قيم الخطة غير صحيحة — تأكد من المدة والسعر',
  plan_not_found: 'الخطة غير موجودة',
  permission_denied: 'ليست لديك صلاحية',
  access_denied: 'ليست لديك صلاحية',
};

function pricingErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && PRICING_ERROR_MESSAGES[code]) {
    return PRICING_ERROR_MESSAGES[code];
  }
  return 'تعذر تنفيذ العملية. حاول مرة أخرى';
}

interface PlanFormState {
  gradeId: string;
  durationDays: string;
  basePrice: string;
  platformFee: string;
  isActive: boolean;
}

const EMPTY_FORM: PlanFormState = {
  gradeId: '',
  durationDays: '',
  basePrice: '',
  platformFee: '',
  isActive: true,
};

export function PricingPage() {
  const { role } = useAuth();
  const { showToast } = useToast();
  const isAdmin = role === 'admin';
  const [plans, setPlans] = useState<PricingPlanWithGrade[] | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [error, setError] = useState(false);
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<PricingPlanWithGrade | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [nextPlans, nextGrades] = await Promise.all([listPricingPlans(), listGrades()]);
      setPlans(nextPlans);
      setGrades(nextGrades);
      setForm((prev) => ({ ...prev, gradeId: prev.gradeId || (nextGrades[0]?.id ?? '') }));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (plan: PricingPlanWithGrade) => {
    setForm({
      gradeId: plan.grade_id,
      durationDays: String(plan.duration_days),
      basePrice: String(plan.base_price),
      platformFee: String(plan.platform_fee),
      isActive: plan.is_active,
    });
    setFormError(null);
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, gradeId: grades[0]?.id ?? '' });
    setFormError(null);
  };

  const handleSave = async () => {
    const durationDays = Math.trunc(Number(form.durationDays));
    const basePrice = Number(form.basePrice);
    const platformFee = Number(form.platformFee);
    if (!form.gradeId) {
      setFormError('اختر الصف');
      return;
    }
    if (!form.durationDays.trim() || durationDays < 1) {
      setFormError('المدة يجب أن تكون يومًا واحدًا على الأقل');
      return;
    }
    if (
      !form.basePrice.trim() ||
      !form.platformFee.trim() ||
      basePrice < 0 ||
      platformFee < 0 ||
      Number.isNaN(basePrice) ||
      Number.isNaN(platformFee)
    ) {
      setFormError('السعر الأساسي ورسوم المنصة يجب أن تكون قيمًا صحيحة غير سالبة');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await setPricingPlan({
        gradeId: form.gradeId,
        durationDays,
        basePrice,
        platformFee,
        isActive: form.isActive,
      });
      showToast('تم حفظ الخطة بنجاح');
      resetForm();
      await load();
    } catch (err) {
      setFormError(pricingErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) {
      return;
    }
    setDeleteBusy(true);
    try {
      await deletePricingPlan(deleting.id);
      setDeleting(null);
      const nextPlans = await listPricingPlans();
      setPlans(nextPlans);
      if (nextPlans.some((plan) => plan.id === deleting.id)) {
        showToast('الخطة مرتبطة باشتراكات أو أكواد سابقة — تم إيقافها بدلاً من حذفها');
      } else {
        showToast('تم حذف الخطة بنجاح');
      }
    } catch (err) {
      showToast(pricingErrorMessage(err), 'error');
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const totalPrice = Number(form.basePrice) + Number(form.platformFee);

  return (
    <LayoutShell
      title="الأسعار"
      subtitle="خطط الاشتراك لكل صف — المدة والسعر ورسوم المنصة"
      variant="sidebar"
      nav={<StaffNav />}
    >
      <div className="flex flex-col gap-4">
        {!isAdmin ? (
          <div className="flex items-center gap-2 rounded-md border border-info/30 bg-info/10 px-4 py-3 text-sm font-medium text-info">
            وضع القراءة فقط — إدارة الأسعار متاحة للمدير فقط
          </div>
        ) : null}

        <Card title="الخطط الحالية">
          {error ? (
            <ErrorState message="تعذر تحميل خطط الأسعار" onRetry={() => void load()} />
          ) : plans === null ? (
            <div className="flex flex-col gap-3" aria-hidden="true">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded-sm" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <EmptyState
              title="لا توجد خطط أسعار بعد"
              description="استخدم النموذج بالأسفل لإضافة أول خطة."
            />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>الصف</TableHeadCell>
                  <TableHeadCell>المدة</TableHeadCell>
                  <TableHeadCell>السعر الأساسي</TableHeadCell>
                  <TableHeadCell>رسوم المنصة</TableHeadCell>
                  <TableHeadCell>الإجمالي</TableHeadCell>
                  <TableHeadCell>الحالة</TableHeadCell>
                  {isAdmin ? <TableHeadCell>إجراءات</TableHeadCell> : null}
                </TableRow>
              </TableHead>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id} data-testid={`plan-row-${plan.id}`}>
                    <TableCell label="الصف" className="font-medium text-foreground">
                      {plan.grade_name ?? '—'}
                    </TableCell>
                    <TableCell label="المدة">{plan.duration_days} يوم</TableCell>
                    <TableCell label="السعر الأساسي" dir="ltr" className="font-mono">
                      {formatPrice(plan.base_price)}
                    </TableCell>
                    <TableCell label="رسوم المنصة" dir="ltr" className="font-mono">
                      {formatPrice(plan.platform_fee)}
                    </TableCell>
                    <TableCell
                      label="الإجمالي"
                      dir="ltr"
                      className="font-mono font-medium text-foreground"
                    >
                      {formatPrice(plan.total_price)}
                    </TableCell>
                    <TableCell label="الحالة">
                      <Badge variant={plan.is_active ? 'success' : 'neutral'}>
                        {plan.is_active ? 'نشطة' : 'موقفة'}
                      </Badge>
                    </TableCell>
                    {isAdmin ? (
                      <TableCell label="إجراءات">
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Pencil aria-hidden="true" className="h-4 w-4" />}
                            onClick={() => startEdit(plan)}
                          >
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                            onClick={() => setDeleting(plan)}
                            className="text-error hover:bg-rose-500/10 hover:text-error"
                          >
                            حذف
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {isAdmin ? (
          <Card
            title={form.gradeId ? 'إضافة / تعديل خطة' : 'إضافة خطة'}
            subtitle="يتم احتساب الإجمالي تلقائيًا = السعر الأساسي + رسوم المنصة"
          >
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="الصف"
                  name="plan-grade"
                  value={form.gradeId}
                  onChange={(event) => setForm({ ...form, gradeId: event.target.value })}
                >
                  {grades.length === 0 ? (
                    <option value="">لا توجد صفوف نشطة</option>
                  ) : (
                    grades.map((grade) => (
                      <option key={grade.id} value={grade.id}>
                        {grade.name}
                      </option>
                    ))
                  )}
                </Select>
                <Input
                  label="المدة (أيام)"
                  name="plan-duration"
                  type="number"
                  value={form.durationDays}
                  onChange={(event) => setForm({ ...form, durationDays: event.target.value })}
                />
                <Input
                  label="السعر الأساسي (ج.م)"
                  name="plan-base-price"
                  type="number"
                  value={form.basePrice}
                  onChange={(event) => setForm({ ...form, basePrice: event.target.value })}
                />
                <Input
                  label="رسوم المنصة (ج.م)"
                  name="plan-fee"
                  type="number"
                  value={form.platformFee}
                  onChange={(event) => setForm({ ...form, platformFee: event.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground-muted">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                />
                خطة نشطة (متاحة للتفعيل)
              </label>
              <p className="text-sm text-foreground-muted">
                الإجمالي:{' '}
                <span className="font-semibold text-foreground" dir="ltr">
                  {formatPrice(totalPrice)}
                </span>
              </p>
              {formError ? (
                <p role="alert" className="text-xs font-medium text-error">
                  {formError}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button
                  loading={saving}
                  icon={<Plus aria-hidden="true" className="h-4 w-4" />}
                  onClick={() => void handleSave()}
                >
                  حفظ الخطة
                </Button>
                <Button variant="secondary" onClick={resetForm}>
                  مسح
                </Button>
              </div>
            </div>
          </Card>
        ) : null}
      </div>

      <Modal
        open={deleting !== null}
        title={deleting ? `حذف الخطة: ${deleting.duration_days} يوم` : ''}
        description={
          deleting
            ? `إن كانت الخطة مرتبطة باشتراكات أو أكواد سابقة فلن تُحذف نهائيًا بل ستُوقف (is_active = false). إن لم تكن مرتبطة بأي شيء فستُحذف نهائيًا.`
            : ''
        }
        confirmLabel="نعم، حذف"
        danger
        loading={deleteBusy}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (!deleteBusy) {
            setDeleting(null);
          }
        }}
      />
    </LayoutShell>
  );
}
