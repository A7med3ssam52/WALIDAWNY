import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Settings2 } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
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
  getPlatformFee,
  getRpcErrorCode,
  listGrades,
  listUnitPricing,
  listUnitsForGrade,
  setPlatformFee,
  setUnitPrice,
} from '../../data/rpc';
import { formatPrice } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import type { Grade, Unit, UnitPricingWithUnit } from '../../types/database';

const PRICING_ERROR_MESSAGES: Record<string, string> = {
  invalid_price_values: 'قيم السعر غير صحيحة — تأكد من السعر',
  invalid_price: 'قيم السعر غير صحيحة',
  invalid_fee: 'قيمة الرسوم غير صحيحة',
  unit_not_found: 'الوحدة غير موجودة',
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

interface PriceFormState {
  unitId: string;
  basePrice: string;
}

const EMPTY_FORM: PriceFormState = {
  unitId: '',
  basePrice: '',
};

export function PricingPage() {
  const { role } = useAuth();
  const { showToast } = useToast();
  const isAdmin = role === 'admin';
  const [pricing, setPricing] = useState<UnitPricingWithUnit[] | null>(null);
  const [platformFee, setPlatformFeeValue] = useState<number | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [error, setError] = useState(false);
  const [form, setForm] = useState<PriceFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feeForm, setFeeForm] = useState('');
  const [feeError, setFeeError] = useState<string | null>(null);
  const [feeSaving, setFeeSaving] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [nextPricing, nextGrades, nextFee] = await Promise.all([
        listUnitPricing(),
        listGrades(),
        getPlatformFee(),
      ]);
      setPricing(nextPricing);
      setGrades(nextGrades);
      setPlatformFeeValue(nextFee);
      setFeeForm((prev) => (prev === '' ? String(nextFee) : prev));
      const nextUnits = (
        await Promise.all(nextGrades.map((grade) => listUnitsForGrade(grade.id)))
      ).flat();
      setUnits(nextUnits);
      setForm((prev) => ({
        ...prev,
        unitId: prev.unitId || (nextUnits[0]?.id ?? ''),
      }));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (item: UnitPricingWithUnit) => {
    setForm({
      unitId: item.unit_id,
      basePrice: String(item.base_price),
    });
    setFormError(null);
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, unitId: units[0]?.id ?? '' });
    setFormError(null);
  };

  const handleSave = async () => {
    const basePrice = Number(form.basePrice);
    if (!form.unitId) {
      setFormError('اختر الوحدة');
      return;
    }
    if (!form.basePrice.trim() || basePrice < 0 || Number.isNaN(basePrice)) {
      setFormError('السعر الأساسي يجب أن يكون قيمة صحيحة غير سالبة');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await setUnitPrice({
        unitId: form.unitId,
        basePrice,
      });
      showToast('تم حفظ سعر الوحدة بنجاح');
      resetForm();
      await load();
    } catch (err) {
      setFormError(pricingErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFee = async () => {
    const fee = Number(feeForm);
    if (!feeForm.trim() || fee < 0 || Number.isNaN(fee)) {
      setFeeError('قيمة الرسوم يجب أن تكون صحيحة غير سالبة');
      return;
    }
    setFeeError(null);
    setFeeSaving(true);
    try {
      await setPlatformFee(fee);
      showToast('تم حفظ رسوم المنصة — ستُضاف على كل الوحدات');
      await load();
    } catch (err) {
      setFeeError(pricingErrorMessage(err));
    } finally {
      setFeeSaving(false);
    }
  };

  const totalPrice = Number(form.basePrice || 0) + (platformFee ?? 0);
  const selectedUnit = units.find((unit) => unit.id === form.unitId) ?? null;

  return (
    <LayoutShell
      title="أسعار الوحدات"
      subtitle="المدرس يحدد سعر كل باب، ورسوم المنصة الثابتة تضاف تلقائيًا — الوحدة تُشترى مرة واحدة مدى الحياة"
      variant="sidebar"
      nav={<StaffNav />}
    >
      <div className="flex flex-col gap-4">
        <Card title="أسعار الوحدات الحالية">
          {error ? (
            <ErrorState message="تعذر تحميل أسعار الوحدات" onRetry={() => void load()} />
          ) : pricing === null ? (
            <div className="flex flex-col gap-3" aria-hidden="true">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded-sm" />
              ))}
            </div>
          ) : pricing.length === 0 ? (
            <EmptyState
              title="لا توجد أسعار بعد"
              description="استخدم النموذج بالأسفل لتحديد سعر أول وحدة."
            />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>الصف</TableHeadCell>
                  <TableHeadCell>الوحدة</TableHeadCell>
                  <TableHeadCell>السعر الأساسي</TableHeadCell>
                  <TableHeadCell>رسوم المنصة</TableHeadCell>
                  <TableHeadCell>الإجمالي</TableHeadCell>
                  <TableHeadCell>الحالة</TableHeadCell>
                  <TableHeadCell>إجراءات</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pricing.map((item) => (
                  <TableRow key={item.id} data-testid={`price-row-${item.unit_id}`}>
                    <TableCell label="الصف" className="text-foreground-muted">
                      {item.grade_name ?? '—'}
                    </TableCell>
                    <TableCell label="الوحدة" className="font-medium text-foreground">
                      {item.unit_name}
                    </TableCell>
                    <TableCell label="السعر الأساسي" dir="ltr" className="font-mono">
                      {formatPrice(item.base_price)}
                    </TableCell>
                    <TableCell label="رسوم المنصة" dir="ltr" className="font-mono">
                      {formatPrice(item.platform_fee)}
                    </TableCell>
                    <TableCell
                      label="الإجمالي"
                      dir="ltr"
                      className="font-mono font-medium text-foreground"
                    >
                      {formatPrice(item.total_price)}
                    </TableCell>
                    <TableCell label="الحالة">
                      <Badge variant={item.is_active ? 'success' : 'neutral'}>
                        {item.is_active ? 'نشط' : 'موقف'}
                      </Badge>
                    </TableCell>
                    <TableCell label="إجراءات">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil aria-hidden="true" className="h-4 w-4" />}
                        onClick={() => startEdit(item)}
                      >
                        تعديل
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card
          title={form.unitId ? 'تعديل سعر وحدة' : 'إضافة سعر وحدة'}
          subtitle="يتم احتساب الإجمالي تلقائيًا = السعر الأساسي + رسوم المنصة الثابتة"
        >
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="الوحدة"
                name="price-unit"
                value={form.unitId}
                onChange={(event) => setForm({ ...form, unitId: event.target.value })}
              >
                {units.length === 0 ? (
                  <option value="">لا توجد وحدات متاحة</option>
                ) : (
                  units.map((unit) => {
                    const grade = grades.find((candidate) => candidate.id === unit.grade_id);
                    return (
                      <option key={unit.id} value={unit.id}>
                        {grade ? `${grade.name} — ` : ''}
                        {unit.name}
                      </option>
                    );
                  })
                )}
              </Select>
              <Input
                label="السعر الأساسي (ج.م)"
                name="price-base"
                type="number"
                min={0}
                step="0.01"
                value={form.basePrice}
                onChange={(event) => setForm({ ...form, basePrice: event.target.value })}
              />
            </div>
            <p className="text-sm text-foreground-muted">
              رسوم المنصة الثابتة:{' '}
              <span className="font-semibold text-foreground" dir="ltr">
                {formatPrice(platformFee ?? 0)}
              </span>{' '}
              — الإجمالي:{' '}
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
                حفظ السعر
              </Button>
              <Button variant="secondary" onClick={resetForm}>
                مسح
              </Button>
            </div>
            {selectedUnit ? (
              <p className="text-xs text-foreground-subtle">الوحدة المختارة: {selectedUnit.name}</p>
            ) : null}
          </div>
        </Card>

        {isAdmin ? (
          <Card
            title="رسوم المنصة الثابتة"
            subtitle="قيمة واحدة يحددها المدير وتُضاف تلقائيًا على سعر كل وحدة"
          >
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:max-w-xs">
                <Input
                  label="الرسوم الثابتة (ج.م)"
                  name="platform-fee"
                  type="number"
                  min={0}
                  step="0.01"
                  value={feeForm}
                  error={feeError ?? undefined}
                  onChange={(event) => {
                    setFeeForm(event.target.value);
                    setFeeError(null);
                  }}
                />
              </div>
              <div>
                <Button
                  loading={feeSaving}
                  icon={<Settings2 aria-hidden="true" className="h-4 w-4" />}
                  onClick={() => void handleSaveFee()}
                >
                  حفظ رسوم المنصة
                </Button>
              </div>
              <p className="text-xs text-foreground-subtle">
                عند التغيير تُحدَّث رسوم كل الوحدات فورًا (الإجمالي = السعر الأساسي + الرسوم).
              </p>
            </div>
          </Card>
        ) : null}
      </div>
    </LayoutShell>
  );
}
