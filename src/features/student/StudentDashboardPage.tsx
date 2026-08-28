import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, KeyRound, PackageOpen, User, TrendingUp, Headset, GraduationCap, MessageCircle, Clock } from 'lucide-react';

import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { Skeleton } from '../../components/Skeleton';
import { StatCard } from '../../components/StatCard';
import { GridCard } from '../../components/GridCard';
import { PageHeader } from '../../components/PageHeader';
import { StudentNav } from '../../components/StudentNav';
import { TechnicalSupportFab } from '../../components/TechnicalSupportFab';
import { WhatsAppIcon } from '../../components/WhatsAppIcon';
import {
  getMyUnitPurchases,
  getPublicSettings,
  getPublicUnitPrices,
  listMyNotifications,
  listUnitsForGrade,
} from '../../data/rpc';
import { buildWhatsAppLink, formatPrice } from '../../lib/format';
import type { PublicSettings, PublicUnitPrice, Unit, UnitPurchaseWithUnit } from '../../types/database';
import { useAuth } from '../auth/AuthContext';

function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <StatCard key={i} title="جاري التحميل" value={<Skeleton className="h-8 w-24" />} />
      ))}
    </div>
  );
}

export function StudentDashboardPage() {
  const { profile, user } = useAuth();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const [purchases, setPurchases] = useState<UnitPurchaseWithUnit[] | null>(null);
  const [purchasesError, setPurchasesError] = useState(false);
  const [gradeUnits, setGradeUnits] = useState<Unit[] | null>(null);
  const [gradeUnitsError, setGradeUnitsError] = useState(false);
  const [prices, setPrices] = useState<PublicUnitPrice[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    let active = true;
    listMyNotifications()
      .then((rows) => {
        if (active) {
          setUnreadNotifications(rows.filter((row) => !row.is_read).length);
        }
      })
      .catch(() => {
        // non-fatal
      });
    return () => {
      active = false;
    };
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsError(false);
    try {
      setSettings(await getPublicSettings());
    } catch {
      setSettingsError(true);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const loadPurchases = useCallback(async () => {
    setPurchasesError(false);
    setPurchases(null);
    try {
      setPurchases(await getMyUnitPurchases());
    } catch {
      setPurchasesError(true);
    }
  }, []);

  useEffect(() => {
    void loadPurchases();
  }, [loadPurchases]);

  const loadGradeUnits = useCallback(async () => {
    setGradeUnitsError(false);
    if (!profile?.grade_id) {
      setGradeUnits([]);
      return;
    }
    setGradeUnits(null);
    try {
      const [unitsResult, pricesResult] = await Promise.all([
        listUnitsForGrade(profile.grade_id),
        getPublicUnitPrices(),
      ]);
      setGradeUnits(unitsResult.filter((unit) => unit.status === 'published'));
      setPrices(pricesResult);
    } catch {
      setGradeUnitsError(true);
    }
  }, [profile?.grade_id]);

  useEffect(() => {
    void loadGradeUnits();
  }, [loadGradeUnits]);

  const displayName = profile?.full_name ?? user?.email ?? '';
  const totalSpent = (purchases ?? []).reduce((sum, purchase) => sum + purchase.total_price, 0);
  const unitsCount = purchases?.length ?? 0;
  const priceById = new Map(prices.map((price) => [price.unit_id, price]));
  const purchasedUnitIds = new Set((purchases ?? []).map((purchase) => purchase.unit_id));

  const isLoading = purchases === null || settings === null;

  return (
    <LayoutShell
      title="لوحة الطالب"
      subtitle={displayName ? `مرحبًا، ${displayName}` : undefined}
      variant="sidebar"
      nav={<StudentNav />}
    >
      <div className="flex flex-col gap-6">
        <PageHeader
          title="لوحة التحكم"
          subtitle="متابعة تقدمك وإدارة وحداتك بكل سهولة"
          icon={<TrendingUp className="h-5 w-5" />}
        />

        {/* === قسم الدعم البارز — فني + أكاديمي === */}
        <section
          aria-label="مركز الدعم"
          className="grid gap-4 md:grid-cols-2"
          data-testid="support-section"
        >
          <div className="glass-card conic-ring spotlight-card relative overflow-hidden p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-[0_8px_20px_-8px_rgba(99,102,241,0.6)]">
                <Headset className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-base font-bold text-foreground">الدعم الفني</h3>
                <p className="mt-1 text-sm leading-6 text-foreground-muted">
                  مشاكل تسجيل الدخول، تفعيل الكود، الدفع، أو تشغيل الفيديو — نرد خلال دقائق في ساعات العمل
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground-subtle">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>يومياً 10ص – 10م</span>
                  <span className="h-1 w-1 rounded-full bg-white/20" aria-hidden="true" />
                  <span>رد سريع</span>
                </div>
              </div>
            </div>
            <a
              href={buildWhatsAppLink(
                '01226771154',
                'مرحبا، أواجه مشكلة تقنية في المنصة (تسجيل الدخول / تفعيل الكود / الدفع / الفيديو). حسابي: ' + (profile?.full_name ?? user?.email ?? ''),
              )}
              target="_blank"
              rel="noreferrer"
              data-testid="support-technical-link"
              className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white sm:w-auto"
            >
              <WhatsAppIcon className="h-4 w-4" />
              تواصل واتساب — دعم فني
            </a>
          </div>

          <div className="glass-card relative overflow-hidden border-amber-500/20 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-[0_8px_20px_-8px_rgba(245,158,11,0.5)]">
                <GraduationCap className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-base font-bold text-foreground">الدعم الأكاديمي</h3>
                <p className="mt-1 text-sm leading-6 text-foreground-muted">
                  أسئلة عن الشرح، المنهج، الواجبات والامتحانات — المدرس يرد عليك مباشرة
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground-subtle">
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>رد خلال ساعات</span>
                  <span className="h-1 w-1 rounded-full bg-white/20" aria-hidden="true" />
                  <span>متابعة يومية</span>
                </div>
              </div>
            </div>
            {settings?.whatsapp_number ? (
              <a
                href={buildWhatsAppLink(
                  settings.whatsapp_number,
                  'مرحبا أستاذ وليد، لدي سؤال أكاديمي عن المنهج. حسابي: ' + (profile?.full_name ?? user?.email ?? '') + ' — ',
                )}
                target="_blank"
                rel="noreferrer"
                data-testid="support-academic-link"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-500/15 sm:w-auto"
              >
                <WhatsAppIcon className="h-4 w-4" />
                تواصل واتساب — دعم أكاديمي
              </a>
            ) : (
              <p className="mt-4 text-xs text-foreground-subtle">رقم الدعم غير متاح حالياً</p>
            )}
          </div>
        </section>

        {isLoading ? (
          <StatsSkeleton />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="الوحدات المشتراة"
              value={unitsCount}
              icon={<PackageOpen className="h-5 w-5" />}
              variant="primary"
              trend={{ label: 'إجمالي الوحدات', value: unitsCount, positive: true }}
            />
            <StatCard
              title="إجمالي المدفوع"
              value={formatPrice(totalSpent)}
              icon={<TrendingUp className="h-5 w-5" />}
              variant="success"
              trend={unitsCount > 0 ? { label: 'من مشترياتك', value: unitsCount, positive: true } : undefined}
            />
            <StatCard
              title="الإشعارات غير المقروءة"
              value={unreadNotifications}
              icon={<Bell className="h-5 w-5" />}
              variant={unreadNotifications > 0 ? 'warning' : 'default'}
              trend={unreadNotifications > 0 ? { label: 'جديد', value: unreadNotifications, positive: true } : undefined}
            />
            <StatCard
              title="حالة الحساب"
              value={profile?.status === 'disabled' ? 'موقوف' : 'نشط'}
              icon={<User className="h-5 w-5" />}
              variant={profile?.status === 'disabled' ? 'warning' : 'info'}
            />
          </div>
        )}

        <div data-testid="grade-units-section">
          <GridCard>
          {gradeUnitsError ? (
            <ErrorState
              message="تعذر تحميل وحدات صفك"
              onRetry={() => void loadGradeUnits()}
            />
          ) : gradeUnits === null ? (
            <div className="flex flex-col gap-3" aria-hidden="true">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : !profile?.grade_id ? (
            <div className="text-center py-8">
              <PackageOpen className="h-10 w-10 mx-auto text-foreground-subtle" aria-hidden="true" />
              <p className="mt-3 text-foreground-muted">لم يتم تحديد صفك الدراسي — تواصل مع الأستاذ</p>
            </div>
          ) : gradeUnits.length === 0 ? (
            <div className="text-center py-8">
              <PackageOpen className="h-10 w-10 mx-auto text-foreground-subtle" aria-hidden="true" />
              <p className="mt-3 text-foreground-muted">لا توجد وحدات متاحة في صفك بعد</p>
              <Link
                to="/student/units"
                className="mt-4 btn-primary inline-flex items-center gap-2"
              >
                <PackageOpen className="h-4 w-4" />
                تصفح الوحدات المتاحة
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="font-display text-lg font-bold text-foreground">
                  وحدات صفك
                  <span className="ms-2 text-sm font-normal text-foreground-muted">
                    ({gradeUnits.length})
                  </span>
                </h2>
                <Link
                  to="/student/units"
                  className="text-sm font-medium text-primary-strong hover:underline transition-colors"
                >
                  عرض الكل
                </Link>
              </div>
              <div className="space-y-2">
                {gradeUnits.map((unit) => {
                  const price = priceById.get(unit.id);
                  const isPurchased = purchasedUnitIds.has(unit.id);
                  return (
                    <div
                      key={unit.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/3 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                          <PackageOpen className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{unit.name}</p>
                          <p className="text-xs text-foreground-muted">
                            {price?.total_price != null
                              ? formatPrice(price.total_price)
                              : 'لا يوجد سعر بعد'}
                          </p>
                        </div>
                      </div>
                      {isPurchased ? (
                        <Link
                          to={`/student/curriculum?unit=${unit.id}`}
                          className="btn-primary text-xs px-3 py-1.5 shrink-0"
                          data-testid={`open-grade-unit-${unit.id}`}
                        >
                          افتح
                        </Link>
                      ) : (
                        <Link
                          to="/student/units"
                          className="glass-soft inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-white/10 shrink-0"
                        >
                          تفعيل
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          </GridCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <GridCard className="lg:col-span-2">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-display text-lg font-bold text-foreground">وحداتي المشتراة</h2>
              <Link
                to="/student/units"
                className="text-sm font-medium text-primary-strong hover:underline transition-colors"
              >
                عرض الكل
              </Link>
            </div>
            {purchasesError ? (
              <ErrorState message="تعذر تحميل وحداتك المشتراة" onRetry={() => void loadPurchases()} />
            ) : purchases === null ? (
              <div className="flex flex-col gap-3" aria-hidden="true">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : purchases.length === 0 ? (
              <div className="text-center py-8">
                <PackageOpen className="h-10 w-10 mx-auto text-foreground-subtle" aria-hidden="true" />
                <p className="mt-3 text-foreground-muted">لم تشترِ أي وحدة بعد</p>
                <p className="mt-1 text-sm text-foreground-subtle">ابدأ رحلتك التعليمية بتفعيل وحدتك الأولى</p>
                <Link
                  to="/student/units"
                  className="mt-4 btn-primary inline-flex items-center gap-2"
                >
                  <PackageOpen className="h-4 w-4" />
                  تصفح الوحدات المتاحة
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {purchases.slice(0, 3).map((purchase) => (
                  <div key={purchase.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/3 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                        <PackageOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{purchase.unit_name}</p>
                        <p className="text-xs text-foreground-muted" dir="ltr">{formatPrice(purchase.total_price)}</p>
                      </div>
                    </div>
                    <Link
                      to={`/student/curriculum?unit=${purchase.unit_id}`}
                      className="btn-primary text-xs px-3 py-1.5 shrink-0"
                      data-testid={`open-unit-${purchase.unit_id}`}
                    >
                      افتح
                    </Link>
                  </div>
                ))}
                {purchases.length > 3 && (
                  <Link
                    to="/student/units"
                    className="block text-center text-sm font-medium text-primary-strong hover:underline py-2"
                  >
                    و {purchases.length - 3} وحدة أخرى...
                  </Link>
                )}
              </div>
            )}
          </GridCard>

          <GridCard>
            <h2 className="font-display text-lg font-bold text-foreground mb-4">روابط سريعة</h2>
            <div className="flex flex-col gap-2">
              <Link
                to="/student/notifications"
                data-testid="notifications-link"
                className="relative flex items-center gap-3 rounded-lg p-3 bg-white/3 hover:bg-white/5 transition-colors group"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Bell className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">الإشعارات</p>
                  <p className="text-xs text-foreground-muted">متابعة جديد المنصة</p>
                </div>
                {unreadNotifications > 0 && (
                  <span
                    data-testid="unread-count"
                    className="absolute -top-1 -end-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-xs font-bold text-white"
                  >
                    {unreadNotifications}
                  </span>
                )}
              </Link>
              <Link
                to="/student/profile"
                className="flex items-center gap-3 rounded-lg p-3 bg-white/3 hover:bg-white/5 transition-colors"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-foreground">تعديل الملف الشخصي</p>
                  <p className="text-xs text-foreground-muted">تحديث بياناتك</p>
                </div>
              </Link>
              <Link
                to="/student/password"
                className="flex items-center gap-3 rounded-lg p-3 bg-white/3 hover:bg-white/5 transition-colors"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-foreground">تغيير كلمة المرور</p>
                  <p className="text-xs text-foreground-muted">تعزيز أمان حسابك</p>
                </div>
              </Link>
              <Link
                to="/student/units"
                className="flex items-center gap-3 rounded-lg p-3 bg-white/3 hover:bg-white/5 transition-colors"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/20 text-success">
                  <PackageOpen className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-foreground">وحداتي المتاحة</p>
                  <p className="text-xs text-foreground-muted">تصفح وتفعيل الوحدات</p>
                </div>
              </Link>
            </div>
          </GridCard>
        </div>

        {settingsError ? (
          <ErrorState message="تعذر تحميل إعدادات المنصة" onRetry={() => void loadSettings()} />
        ) : settings?.whatsapp_number ? (
          <GridCard className="glass-accent-border">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success/20 text-success">
                  <WhatsAppIcon size={24} />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">تواصل مع الأستاذ</h3>
                  <p className="text-sm text-foreground-muted">لأي استفسار يمكنك التواصل مباشرة عبر واتساب</p>
                </div>
              </div>
              <a
                href={buildWhatsAppLink(settings.whatsapp_number, settings.whatsapp_default_message)}
                target="_blank"
                rel="noreferrer"
                className="btn-primary inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shrink-0"
              >
                <WhatsAppIcon size={18} />
                فتح محادثة واتساب
              </a>
            </div>
          </GridCard>
        ) : null}
      </div>
      <TechnicalSupportFab />
    </LayoutShell>
  );
}