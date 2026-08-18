import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageOpen, PlayCircle, KeyRound, RefreshCw } from 'lucide-react';

import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { GridCard } from '../../components/GridCard';
import { LayoutShell } from '../../components/LayoutShell';
import { LockedUnitCard } from '../../components/LockedUnitCard';
import { PageHeader } from '../../components/PageHeader';
import { RedeemCodeForm } from '../../components/RedeemCodeForm';
import { Skeleton } from '../../components/Skeleton';
import { StudentNav } from '../../components/StudentNav';
import { UnitCard } from '../../components/UnitCard';
import { useToast } from '../../components/Toast';
import {
  getMyUnitPurchases,
  getPublicSettings,
  getPublicUnitPrices,
  listUnitsForGrade,
  redeemUnitCode,
} from '../../data/rpc';
import type {
  PublicSettings,
  PublicUnitPrice,
  Unit,
  UnitPurchaseWithUnit,
} from '../../types/database';
import { useAuth } from '../auth/AuthContext';
import { redeemErrorMessage } from './redeemErrors';

function UnitsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <GridCard padding="md">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      </GridCard>
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
  const [redeemByUnit, setRedeemByUnit] = useState<Record<string, { busy: boolean; error: string | null }>>({});
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
  const purchasedUnits = (units ?? []).filter((unit) => purchasedUnitIds.has(unit.id));

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

  const handleRedeemUnit = async (unitId: string, code: string): Promise<boolean> => {
    setRedeemByUnit((prev) => ({ ...prev, [unitId]: { busy: true, error: null } }));
    try {
      await redeemUnitCode(code);
      showToast('تم تفعيل الوحدة بنجاح');
      await load();
      setRedeemByUnit((prev) => ({ ...prev, [unitId]: { busy: false, error: null } }));
      return true;
    } catch (err) {
      setRedeemByUnit((prev) => ({
        ...prev,
        [unitId]: { busy: false, error: redeemErrorMessage(err) },
      }));
      return false;
    }
  };

  return (
    <LayoutShell
      title="وحداتي"
      subtitle="الوحدات المشتراة والوحدات المتاحة في صفك"
      variant="sidebar"
      nav={<StudentNav />}
    >
      <div className="flex flex-col gap-6">
        <PageHeader
          title="وحداتي"
          subtitle="إدارة الوحدات المشتراة وتفعيل الوحدات الجديدة"
          icon={<PackageOpen className="h-5 w-5" />}
          actions={
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => void load()}
              className="gap-1.5"
            >
              تحديث
            </Button>
          }
        />

        {error ? (
          <ErrorState message="تعذر تحميل الوحدات" onRetry={() => void load()} />
        ) : units === null ? (
          <UnitsSkeleton />
        ) : !profile?.grade_id ? (
          <GridCard className="text-center py-12">
            <EmptyState
              icon={<PackageOpen className="h-10 w-10 mx-auto text-foreground-subtle" />}
              title="لم يتم تحديد صفك الدراسي"
              description="تواصل مع الأستاذ لتحديد الصف الدراسي الخاص بك ثم حاول مرة أخرى."
            />
          </GridCard>
        ) : (
          <>
            {/* Purchased Units */}
            <GridCard>
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="font-display text-lg font-bold text-foreground">
                  وحداتي المشتراة
                  <span className="ml-2 text-sm font-normal text-foreground-muted">({purchasedUnits.length})</span>
                </h2>
                <Link
                  to="/student/curriculum"
                  className="text-sm font-medium text-primary-strong hover:underline"
                >
                  عرض المنهج الكامل
                </Link>
              </div>

              {purchasedUnits.length === 0 ? (
                <div className="text-center py-8">
                  <PackageOpen className="h-10 w-10 mx-auto text-foreground-subtle" aria-hidden="true" />
                  <p className="mt-3 text-foreground-muted">لم تشترِ أي وحدة بعد</p>
                  <p className="mt-1 text-sm text-foreground-subtle">استخدم كود التفعيل بالأسفل لتفعيل وحدة من وحدات صفك</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {purchasedUnits.map((unit) => {
                    const price = priceById.get(unit.id);
                    return (
                      <UnitCard
                        key={unit.id}
                        name={unit.name}
                        gradeName={price?.grade_name}
                        price={price?.total_price}
                        isPurchased={true}
                        onAction={() => {
                          const link = `/student/curriculum?unit=${unit.id}`;
                          window.location.href = link;
                        }}
                        actionLabel="افتح الوحدة"
                        actionIcon={<PlayCircle className="h-4 w-4" />}
                      />
                    );
                  })}
                </div>
              )}
            </GridCard>

            {/* Available Units */}
            {lockedUnits.length > 0 ? (
              <GridCard>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="font-display text-lg font-bold text-foreground">
                    وحدات متاحة للتفعيل
                    <span className="ml-2 text-sm font-normal text-foreground-muted">({lockedUnits.length})</span>
                  </h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {lockedUnits.map((unit) => {
                    const price = priceById.get(unit.id);
                    return (
                      <LockedUnitCard
                        key={unit.id}
                        unit={price ?? null}
                        unitName={unit.name}
                        gradeName={price?.grade_name}
                        whatsappNumber={settings?.whatsapp_number ?? null}
                        whatsappMessage={`${settings?.whatsapp_default_message ?? ''} — وحدة ${unit.name}`}
                        onRedeem={(code) => handleRedeemUnit(unit.id, code)}
                        redeemBusy={redeemByUnit[unit.id]?.busy ?? false}
                        redeemError={redeemByUnit[unit.id]?.error ?? null}
                      />
                    );
                  })}
                </div>
              </GridCard>
            ) : null}

            {/* Redeem Code Section */}
            <GridCard className="glass-accent-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">تفعيل وحدة بكود</h3>
                  <p className="text-sm text-foreground-muted">أدخل كود التفعيل الذي حصلت عليه من الأستاذ</p>
                </div>
              </div>
              <RedeemCodeForm
                onSubmit={(code) => handleRedeem(code)}
                busy={redeemBusy}
                error={redeemError}
                onSuccess={() => setRedeemError(null)}
              />
            </GridCard>
          </>
        )}
      </div>
    </LayoutShell>
  );
}