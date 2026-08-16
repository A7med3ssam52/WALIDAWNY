import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageOpen, PlayCircle } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { LockedUnitCard } from '../../components/LockedUnitCard';
import { RedeemCodeForm } from '../../components/RedeemCodeForm';
import { Skeleton } from '../../components/Skeleton';
import { StudentNav } from '../../components/StudentNav';
import { useToast } from '../../components/Toast';
import {
  getMyUnitPurchases,
  getPublicSettings,
  getPublicUnitPrices,
  getRpcErrorCode,
  listUnitsForGrade,
  redeemUnitCode,
} from '../../data/rpc';
import { formatPrice } from '../../lib/format';
import type {
  PublicSettings,
  PublicUnitPrice,
  Unit,
  UnitPurchaseWithUnit,
} from '../../types/database';
import { useAuth } from '../auth/AuthContext';

const REDEEM_ERROR_MESSAGES: Record<string, string> = {
  code_not_found: 'الكود غير صالح',
  code_already_used: 'تم استخدام هذا الكود بالفعل',
  code_revoked: 'تم إلغاء هذا الكود',
  unit_not_found: 'الوحدة المطلوبة غير موجودة',
  unit_inactive: 'هذه الوحدة غير متاحة حاليًا',
  unit_purchased: 'لقد قمت بشراء هذه الوحدة بالفعل',
  no_grade_assigned: 'لم يتم تحديد صفك الدراسي بعد — تواصل مع الأستاذ',
};

function redeemErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && REDEEM_ERROR_MESSAGES[code]) {
    return REDEEM_ERROR_MESSAGES[code];
  }
  return 'تعذر تفعيل الوحدة. حاول مرة أخرى';
}

function UnitsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className="glass-card space-y-3 p-4 sm:p-6">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function UnitsPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [purchases, setPurchases] = useState<UnitPurchaseWithUnit[]>([]);
  const [prices, setPrices] = useState<PublicUnitPrice[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [unitsResult, purchasesResult, pricesResult, settingsResult] = await Promise.all([
        profile?.grade_id ? listUnitsForGrade(profile.grade_id) : Promise.resolve([]),
        getMyUnitPurchases(),
        getPublicUnitPrices(),
        getPublicSettings(),
      ]);
      setUnits(unitsResult.filter((unit) => unit.status === 'published'));
      setPurchases(purchasesResult);
      setPrices(pricesResult);
      setSettings(settingsResult);
    } catch {
      setError(true);
    }
  }, [profile?.grade_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const priceById = new Map(prices.map((price) => [price.unit_id, price]));
  const purchasedUnitIds = new Set(purchases.map((purchase) => purchase.unit_id));
  const lockedUnits = (units ?? []).filter((unit) => !purchasedUnitIds.has(unit.id));

  const handleRedeem = async (code: string): Promise<boolean> => {
    setRedeemError(null);
    setRedeemBusy(true);
    try {
      await redeemUnitCode(code);
      showToast('تم تفعيل الوحدة بنجاح');
      await load();
      return true;
    } catch (err) {
      setRedeemError(redeemErrorMessage(err));
      return false;
    } finally {
      setRedeemBusy(false);
    }
  };

  return (
    <LayoutShell
      title="وحداتي"
      subtitle="الوحدات المشتراة والوحدات المتاحة في صفك"
      variant="sidebar"
      nav={<StudentNav />}
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <ErrorState message="تعذر تحميل الوحدات" onRetry={() => void load()} />
        ) : units === null ? (
          <UnitsSkeleton />
        ) : !profile?.grade_id ? (
          <EmptyState
            icon={<PackageOpen className="h-6 w-6" />}
            title="لم يتم تحديد صفك الدراسي"
            description="تواصل مع الأستاذ لتحديد الصف الدراسي الخاص بك ثم حاول مرة أخرى."
          />
        ) : (
          <>
            <Card title="وحداتي المشتراة" subtitle="الوحدات التي أصبحت متاحة لك مدى الحياة">
              {purchases.length === 0 ? (
                <EmptyState
                  title="لم تشترِ أي وحدة بعد"
                  description="استخدم كود التفعيل بالأسفل لتفعيل وحدة من وحدات صفك."
                />
              ) : (
                <ul className="divide-y divide-border-muted">
                  {purchases.map((purchase) => {
                    const unit = units.find((candidate) => candidate.id === purchase.unit_id);
                    return (
                      <li key={purchase.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{purchase.unit_name}</p>
                          <p className="mt-0.5 text-xs text-foreground-subtle" dir="ltr">
                            {formatPrice(purchase.total_price)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="success">مدفوعة</Badge>
                          {unit ? (
                            <Link
                              to={`/student/curriculum?unit=${unit.id}`}
                              className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                              data-testid={`open-unit-${unit.id}`}
                            >
                              <PlayCircle aria-hidden="true" className="h-4 w-4" />
                              افتح الوحدة
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {lockedUnits.length > 0 ? (
              <Card title="وحدات متاحة" subtitle="فعّل الوحدة بكود أو تواصل مع الأستاذ لتفعيلها">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {lockedUnits.map((unit) => {
                    const price = priceById.get(unit.id);
                    if (!price) {
                      return null;
                    }
                    return (
                      <LockedUnitCard
                        key={unit.id}
                        unit={price}
                        whatsappNumber={settings?.whatsapp_number ?? null}
                        whatsappMessage={`${settings?.whatsapp_default_message ?? ''} — وحدة ${price.unit_name}`}
                      />
                    );
                  })}
                </div>
              </Card>
            ) : null}

            <Card
              title="تفعيل وحدة بكود"
              subtitle="أدخل كود التفعيل الذي حصلت عليه من الأستاذ"
            >
              <RedeemCodeForm
                onSubmit={(code) => handleRedeem(code)}
                busy={redeemBusy}
                error={redeemError}
                onSuccess={() => setRedeemError(null)}
              />
            </Card>
          </>
        )}
      </div>
    </LayoutShell>
  );
}
