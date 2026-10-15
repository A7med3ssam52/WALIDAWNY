import { useCallback, useEffect, useState } from 'react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import {
  getRpcErrorCode,
  grantGuestAccess,
  listGuestPurchases,
  listUnitsForGrade,
  revokeGuestAccess,
  setGuestStatus,
} from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type { Profile, Unit, UnitPurchaseWithUnit } from '../../types/database';

const GUEST_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'ليست لديك صلاحية',
  guest_not_found: 'الطالب الضيف غير موجود',
  target_not_student: 'الهدف ليس طالبًا',
  unit_not_found: 'الوحدة غير موجودة',
  unit_inactive: 'هذه الوحدة غير متاحة حاليًا',
  unit_not_in_student_grade: 'الوحدة ليست من نفس الصف الدراسي للطالب',
  purchase_not_found: 'لا يوجد تفعيل نشط لهذه الوحدة',
};

function guestErrorMessage(error: unknown): string {
  const raw = error as { message?: unknown };
  const code = typeof raw?.message === 'string' ? raw.message : getRpcErrorCode(error);
  if (code && GUEST_ERROR_MESSAGES[code]) {
    return GUEST_ERROR_MESSAGES[code];
  }
  return 'تعذر تنفيذ العملية. حاول مرة أخرى';
}

export function GuestBadge() {
  return <Badge variant="warning">ضيف</Badge>;
}

/** Admin-only toggle: convert a normal student to guest and back. */
export function GuestToggleButton({
  student,
  onChanged,
}: {
  student: Profile;
  onChanged: () => void | Promise<void>;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await setGuestStatus(student.id, !student.is_guest);
      showToast(student.is_guest ? 'تم إرجاع الطالب إلى القوائم العادية' : 'تم تحويل الطالب إلى ضيف');
      await onChanged();
    } catch (err) {
      showToast(guestErrorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="secondary" size="sm" loading={busy} onClick={() => void toggle()}>
      {student.is_guest ? 'إلغاء وضع الضيف' : 'تحويل إلى ضيف'}
    </Button>
  );
}

/** Admin-only card: direct per-unit activation for a guest (no codes). */
export function GuestUnitsCard({ student }: { student: Profile }) {
  const { showToast } = useToast();
  const [purchases, setPurchases] = useState<UnitPurchaseWithUnit[] | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [granting, setGranting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextPurchases, nextUnits] = await Promise.all([
        listGuestPurchases(student.id),
        student.grade_id ? listUnitsForGrade(student.grade_id) : Promise.resolve([] as Unit[]),
      ]);
      setPurchases(nextPurchases.filter((item) => item.status === 'active'));
      setUnits(nextUnits.filter((unit) => !unit.deleted_at));
      setSelectedUnitId((prev) => {
        if (prev) return prev;
        const activeIds = new Set(
          nextPurchases.filter((item) => item.status === 'active').map((item) => item.unit_id),
        );
        return nextUnits.find((unit) => !unit.deleted_at && !activeIds.has(unit.id))?.id ?? '';
      });
    } catch {
      setPurchases([]);
    }
  }, [student.id, student.grade_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGrant = async () => {
    if (!selectedUnitId) {
      showToast('اختر وحدة أولاً', 'error');
      return;
    }
    setGranting(true);
    try {
      await grantGuestAccess(student.id, selectedUnitId);
      showToast('تم تفعيل الوحدة للضيف');
      setSelectedUnitId('');
      await load();
    } catch (err) {
      showToast(guestErrorMessage(err), 'error');
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (purchase: UnitPurchaseWithUnit) => {
    setRevokingId(purchase.id);
    try {
      await revokeGuestAccess(student.id, purchase.unit_id);
      showToast('تم إلغاء تفعيل الوحدة');
      await load();
    } catch (err) {
      showToast(guestErrorMessage(err), 'error');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Card title="وحدات الضيف" subtitle="تفعيل مباشر بدون أكواد — من نفس صف الطالب الدراسي">
      {!student.grade_id ? (
        <p className="text-sm text-foreground-muted">
          حدد الصف الدراسي للطالب أولاً من تعديل البيانات لتتمكن من تفعيل الوحدات.
        </p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Select
              label="الوحدة"
              name="guest-unit"
              value={selectedUnitId}
              onChange={(event) => setSelectedUnitId(event.target.value)}
            >
              <option value="">اختر وحدة…</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          </div>
          <Button loading={granting} onClick={() => void handleGrant()}>
            تفعيل الوحدة
          </Button>
        </div>
      )}
      <div className="mt-4">
        {purchases === null ? (
          <p className="text-sm text-foreground-muted">جاري التحميل…</p>
        ) : purchases.length === 0 ? (
          <p className="text-sm text-foreground-muted">لا توجد وحدات مفعّلة لهذا الضيف بعد.</p>
        ) : (
          <ul className="divide-y divide-border-muted">
            {purchases.map((purchase) => (
              <li
                key={purchase.id}
                data-testid={`guest-purchase-${purchase.id}`}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{purchase.unit_name}</p>
                  <p className="mt-0.5 text-xs text-foreground-subtle">
                    {formatDateTime(purchase.purchased_at)}
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  loading={revokingId === purchase.id}
                  onClick={() => void handleRevoke(purchase)}
                >
                  إلغاء التفعيل
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
