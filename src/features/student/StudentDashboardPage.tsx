import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Bell,
  HeartPulse,
  KeyRound,
  PackageOpen,
  User,
  TrendingUp,
  Headset,
  GraduationCap,
  MessageCircle,
  Clock,
} from 'lucide-react';

import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { Skeleton } from '../../components/Skeleton';
import { StatCard } from '../../components/StatCard';
import { GridCard } from '../../components/GridCard';
import { PageHeader } from '../../components/PageHeader';
import { StudentNav } from '../../components/StudentNav';
import { SuggestionsCta } from '../../components/SuggestionsCta';
import { TechnicalSupportFab } from '../../components/TechnicalSupportFab';
import { WhatsAppIcon } from '../../components/WhatsAppIcon';
import { LiveExamCard } from './LiveExamCard';
import {
  getMyUnitPurchases,
  getPublicSettings,
  getPublicUnitPrices,
  listMyNotifications,
  listMyProgress,
  listUnitsForGrade,
} from '../../data/rpc';
import { buildWhatsAppLink, formatPrice } from '../../lib/format';
import type {
  Progress,
  PublicSettings,
  PublicUnitPrice,
  Unit,
  UnitPurchaseWithUnit,
} from '../../types/database';
import { useAuth } from '../auth/AuthContext';

const DONUT_COMPLETED = 'var(--color-chart-2)';
const DONUT_ACTIVE = 'var(--color-chart-3)';
const DONUT_REMAINING = 'var(--color-chart-1)';
const DONUT_TRACK = 'var(--color-chart-track)';

function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <StatCard key={i} title="جاري التحميل" value={<Skeleton className="h-8 w-24" />} />
      ))}
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flat-card glass-card p-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mx-auto mt-4 h-36 w-36 rounded-full" />
          <Skeleton className="mt-4 h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Donut بثلاث شرائح: مكتمل (بنفسجي) / جاري (أسود) / متبقي (لايم) — من بيانات التقدم الحقيقية. */
function ProgressDonut({
  completed,
  active,
  remaining,
}: {
  completed: number;
  active: number;
  remaining: number;
}) {
  const total = completed + active + remaining;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const segments = useMemo(() => {
    if (total <= 0) return [];
    const raw = [
      { value: completed, color: DONUT_COMPLETED },
      { value: active, color: DONUT_ACTIVE },
      { value: remaining, color: DONUT_REMAINING },
    ];
    let offset = 0;
    return raw
      .filter((seg) => seg.value > 0)
      .map((seg) => {
        const fraction = seg.value / total;
        const item = { ...seg, dash: fraction * circumference, offset };
        offset += fraction * circumference;
        return item;
      });
  }, [completed, active, remaining, total, circumference]);

  return (
    <div
      className="relative mx-auto h-40 w-40"
      data-testid="health-donut"
      role="img"
      aria-label={`تقدم الوحدات: ${completed} مكتمل، ${active} جاري، ${remaining} متبقي`}
    >
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={radius} fill="none" stroke={DONUT_TRACK} strokeWidth="22" />
        {segments.map((seg, index) => (
          <circle
            key={index}
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth="22"
            strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
            strokeDashoffset={-seg.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-extrabold tabular-nums text-foreground">
          {completed}
        </span>
        <span className="text-xs font-bold text-foreground-muted">مكتمل</span>
      </div>
    </div>
  );
}

/** شبكة التزام: نقاط بنفسجي/لايم حسب النسبة المحسوبة من الداتا، والباقي رمادي. */
function CommitmentDots({ percent }: { percent: number }) {
  const total = 30;
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * total);
  const purpleCount = Math.round(filled * 0.65);
  return (
    <div className="grid grid-cols-6 gap-2" aria-hidden="true" data-testid="health-commitment-dots">
      {Array.from({ length: total }, (_, i) => {
        const color =
          i < filled
            ? i < purpleCount
              ? DONUT_COMPLETED
              : DONUT_REMAINING
            : 'var(--color-chart-track)';
        return (
          <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        );
      })}
    </div>
  );
}

type RangeKey = 'month' | 'week' | 'all';

function inRange(row: Progress, range: RangeKey): boolean {
  if (range === 'all') return true;
  const stamp = row.last_watched_at ?? row.updated_at;
  const time = stamp ? Date.parse(stamp) : NaN;
  if (Number.isNaN(time)) return true;
  const days = range === 'week' ? 7 : 30;
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
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
  const [progressRows, setProgressRows] = useState<Progress[] | null>(null);
  const [range, setRange] = useState<RangeKey>('month');

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
    listMyProgress()
      .then((rows) => {
        if (active) setProgressRows(rows);
      })
      .catch(() => {
        if (active) setProgressRows([]);
      });
    const handler = () => {
      listMyProgress()
        .then((rows) => {
          if (active) setProgressRows(rows);
        })
        .catch(() => {
          // best-effort
        });
    };
    window.addEventListener('lesson-progress-updated', handler);
    return () => {
      active = false;
      window.removeEventListener('lesson-progress-updated', handler);
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
  // ملخص تقدم من بيانات التقدم الحقيقية.
  const completedLessonsCount = (progressRows ?? []).filter((p) => p.is_completed).length;
  const inProgressCount = (progressRows ?? []).filter(
    (p) => !p.is_completed && Number(p.percent_completed) > 0,
  ).length;
  const trackedTotal = progressRows?.length ?? 0;
  const trackedRemaining = Math.max(0, trackedTotal - completedLessonsCount - inProgressCount);
  const priceById = new Map(prices.map((price) => [price.unit_id, price]));
  const purchasedUnitIds = new Set((purchases ?? []).map((purchase) => purchase.unit_id));
  const unpurchasedUnitsCount = Math.max(0, (gradeUnits?.length ?? 0) - unitsCount);
  // شريحة "متبقي" من الداتا الحقيقية: المتبقي المتتبع، أو وحدات الصف غير المفعلة عند غياب التقدم.
  const remainingCount = trackedTotal > 0 ? trackedRemaining : unpurchasedUnitsCount;
  const donutTotal = completedLessonsCount + inProgressCount + remainingCount;
  const progressPercent =
    trackedTotal > 0 ? Math.round((completedLessonsCount / trackedTotal) * 100) : 0;
  // مؤشر الالتزام من الداتا: نسبة الإكمال، أو نسبة التفعيل عند غياب التقدم.
  const activationPercent =
    (gradeUnits?.length ?? 0) > 0 ? Math.round((unitsCount / (gradeUnits?.length ?? 1)) * 100) : 0;
  const commitment = trackedTotal > 0 ? progressPercent : activationPercent;
  const rangedRows = (progressRows ?? []).filter((row) => inRange(row, range));
  const chartRows = rangedRows.slice(0, 12);

  const isLoading = purchases === null || settings === null;

  return (
    <LayoutShell
      title="لوحة الطالب"
      subtitle={displayName ? `مرحبًا، ${displayName}` : undefined}
      variant="sidebar"
      nav={<StudentNav />}
      wide
    >
      <div className="flex flex-col gap-6">
        <PageHeader
          title="نظرة عامة على التعلم"
          subtitle="متابعة تقدمك وإدارة وحداتك بكل سهولة"
          icon={<TrendingUp className="h-5 w-5" />}
        />

        {/* === مقترحات التحديث القادم — بانر دائم أعلى الدعم (0075) === */}
        <SuggestionsCta />

        {/* === امتحان عام جارٍ — يظهر فقط أثناء وجود امتحان حي === */}
        <LiveExamCard />

        {/* === الصف الأول: نظرة عامة (Donut + النشاط + الالتزام) === */}
        {progressRows === null ? (
          <HealthSkeleton />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="flat-card glass-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="health-kpi-label">تقدم الوحدات</p>
                  <p className="mt-1 font-display text-xl font-extrabold tabular-nums text-foreground">
                    {donutTotal}{' '}
                    <span className="text-xs font-bold text-foreground-muted">درس</span>
                  </p>
                </div>
              </div>
              <div className="mt-2">
                <ProgressDonut
                  completed={completedLessonsCount}
                  active={inProgressCount}
                  remaining={remainingCount}
                />
              </div>
              <ul className="mt-4 flex flex-col gap-2 text-sm">
                <li className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-bold text-foreground">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: DONUT_COMPLETED }}
                      aria-hidden="true"
                    />
                    مكتمل
                  </span>
                  <span className="font-bold tabular-nums text-foreground">
                    {completedLessonsCount}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-bold text-foreground">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: DONUT_ACTIVE }}
                      aria-hidden="true"
                    />
                    جاري
                  </span>
                  <span className="font-bold tabular-nums text-foreground">{inProgressCount}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-bold text-foreground">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: DONUT_REMAINING }}
                      aria-hidden="true"
                    />
                    متبقي
                  </span>
                  <span className="font-bold tabular-nums text-foreground">{remainingCount}</span>
                </li>
              </ul>
            </div>

            <div className="flat-card glass-card flex flex-col p-4" data-testid="health-activity">
              <p className="health-kpi-label">معدل الإنجاز</p>
              <div className="flex items-center gap-2">
                <HeartPulse aria-hidden="true" className="h-5 w-5 shrink-0 text-accent-strong" />
                <p className="font-display text-3xl font-extrabold tabular-nums text-foreground">
                  {progressPercent}
                  <span className="text-base font-bold text-foreground-muted">٪</span>
                </p>
              </div>
              <p className="mt-1 text-xs text-foreground-muted">
                {trackedTotal > 0
                  ? `${completedLessonsCount} درسًا مكتملًا من ${trackedTotal}`
                  : 'ابدأ أول درس لحساب معدل إنجازك'}
              </p>
              <div className="my-4 border-t border-border-muted" />
              <p className="health-kpi-label">النشاط</p>
              <div className="flex items-center gap-2">
                <Activity aria-hidden="true" className="h-5 w-5 shrink-0 text-primary-strong" />
                <p className="font-display text-3xl font-extrabold tabular-nums text-foreground">
                  {inProgressCount + completedLessonsCount}
                </p>
              </div>
              <p className="mt-1 text-xs text-foreground-muted">
                {inProgressCount} قيد المشاهدة · {unitsCount} وحدة مفعلة
              </p>
            </div>

            <div className="flat-card glass-card flex flex-col p-4" data-testid="health-commitment">
              <p className="health-kpi-label">مؤشر الالتزام</p>
              <p className="font-display text-3xl font-extrabold tabular-nums text-foreground">
                {commitment}
                <span className="text-base font-bold text-foreground-muted">٪</span>
              </p>
              <div className="mt-4 flex-1">
                <CommitmentDots percent={commitment} />
              </div>
              <p className="mt-4 text-xs leading-6 text-foreground-muted">
                {trackedTotal > 0
                  ? 'محسوب من دروسك المكتملة مقابل إجمالي الدروس المتتبعة'
                  : unitsCount > 0
                    ? 'محسوب من وحداتك المفعلة مقابل وحدات صفك — ابدأ المذاكرة لرفعه'
                    : 'فعّل وحدتك وابدأ أول درس لقياس التزامك'}
              </p>
            </div>
          </div>
        )}

        {/* === الصف الثاني: تقدم الدروس + تحليل الأداء === */}
        {progressRows !== null ? (
          <div className="grid gap-4 lg:grid-cols-5">
            <GridCard className="lg:col-span-3" data-testid="dashboard-progress-summary">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-base font-bold text-foreground">تقدم الدروس</h2>
                  <p className="mt-0.5 text-sm text-foreground-muted">
                    {`${completedLessonsCount} درسًا مكتملًا${inProgressCount > 0 ? ` · ${inProgressCount} قيد المشاهدة` : ''}`}
                  </p>
                </div>
                <Link
                  to="/student/curriculum"
                  className="text-sm font-medium text-primary-strong hover:underline"
                >
                  متابعة المنهج
                </Link>
              </div>
              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-foreground">مكتمل</span>
                    <span className="font-bold tabular-nums text-foreground">
                      {completedLessonsCount}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        backgroundColor: DONUT_COMPLETED,
                        width: `${donutTotal > 0 ? Math.round((completedLessonsCount / donutTotal) * 100) : 0}%`,
                      }}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={donutTotal}
                      aria-valuenow={completedLessonsCount}
                      aria-label="تقدم الدروس"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-foreground">جاري</span>
                    <span className="font-bold tabular-nums text-foreground">
                      {inProgressCount}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        backgroundColor: DONUT_ACTIVE,
                        width: `${donutTotal > 0 ? Math.round((inProgressCount / donutTotal) * 100) : 0}%`,
                      }}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={donutTotal}
                      aria-valuenow={inProgressCount}
                      aria-label="دروس جارية"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-foreground">متبقي</span>
                    <span className="font-bold tabular-nums text-foreground">{remainingCount}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        backgroundColor: DONUT_REMAINING,
                        width: `${donutTotal > 0 ? Math.round((remainingCount / donutTotal) * 100) : 0}%`,
                      }}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={donutTotal}
                      aria-valuenow={remainingCount}
                      aria-label="دروس متبقية"
                    />
                  </div>
                </div>
              </div>
            </GridCard>

            <div
              className="flat-card glass-card p-4 lg:col-span-2"
              data-testid="health-performance"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-foreground">تحليل الأداء</h2>
                <select
                  aria-label="النطاق الزمني"
                  value={range}
                  onChange={(event) => setRange(event.target.value as RangeKey)}
                  className="rounded-full border border-border-muted bg-surface-muted px-3 py-1.5 text-xs font-bold text-foreground"
                >
                  <option value="month">شهري</option>
                  <option value="week">أسبوعي</option>
                  <option value="all">الكل</option>
                </select>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <p className="font-display text-3xl font-extrabold tabular-nums text-primary-strong">
                  {progressPercent}
                  <span className="text-base font-bold text-foreground-subtle">٪</span>
                </p>
                <span className="h-8 w-px bg-border" aria-hidden="true" />
                <p className="text-sm font-bold text-foreground">
                  {completedLessonsCount}/{trackedTotal}{' '}
                  <span className="font-normal text-foreground-subtle">درس</span>
                </p>
              </div>
              {chartRows.length > 0 ? (
                <div
                  className="mt-4 flex h-28 items-end gap-2"
                  role="img"
                  aria-label="رسم أداء الدروس"
                >
                  {chartRows.map((row) => {
                    const value = Math.min(100, Math.max(0, Number(row.percent_completed) || 0));
                    return (
                      <div
                        key={row.id}
                        className="flex-1 rounded-sm"
                        title={`${Math.round(value)}٪`}
                        style={{
                          height: `${Math.max(8, value)}%`,
                          backgroundColor: 'var(--color-chart-1)',
                          opacity: row.is_completed ? 1 : 0.35 + 0.5 * (value / 100),
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-sm text-foreground-subtle">
                  {range === 'all'
                    ? 'لا يوجد نشاط بعد — ابدأ أول درس وستظهر أعمدتك هنا'
                    : 'لا يوجد نشاط في هذه الفترة — جرّب نطاقًا آخر'}
                </p>
              )}
              <p className="mt-3 text-xs text-foreground-subtle">
                {unreadNotifications > 0
                  ? `لديك ${unreadNotifications} إشعار غير مقروء بانتظارك`
                  : 'أعمدة الرسم = نسب مشاهدتك للدروس من بيانات تقدمك'}
              </p>
            </div>
          </div>
        ) : null}

        {/* === قسم الدعم البارز — فني + أكاديمي === */}
        <section
          aria-label="مركز الدعم"
          className="grid gap-4 md:grid-cols-2"
          data-testid="support-section"
        >
          <div className="flat-card glass-card p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <Headset aria-hidden="true" className="h-6 w-6 shrink-0 text-accent-strong" />
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-base font-bold text-foreground">الدعم الفني</h3>
                <p className="mt-1 text-sm leading-6 text-foreground-muted">
                  مشاكل تسجيل الدخول، تفعيل الكود، الدفع، أو تشغيل الفيديو — نرد خلال دقائق في ساعات
                  العمل
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground-subtle">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>يومياً 10ص – 10م</span>
                  <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
                  <span>رد سريع</span>
                </div>
              </div>
            </div>
            <a
              href={buildWhatsAppLink(
                '01226771154',
                'مرحبا، أواجه مشكلة تقنية في المنصة (تسجيل الدخول / تفعيل الكود / الدفع / الفيديو). حسابي: ' +
                  (profile?.full_name ?? user?.email ?? ''),
              )}
              target="_blank"
              rel="noreferrer"
              data-testid="support-technical-link"
              className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold sm:w-auto"
            >
              <WhatsAppIcon className="h-4 w-4" />
              تواصل واتساب — دعم فني
            </a>
          </div>

          <div className="flat-card glass-card p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <GraduationCap aria-hidden="true" className="h-6 w-6 shrink-0 text-warning" />
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-base font-bold text-foreground">
                  الدعم الأكاديمي
                </h3>
                <p className="mt-1 text-sm leading-6 text-foreground-muted">
                  أسئلة عن الشرح، المنهج، الواجبات والامتحانات — المدرس يرد عليك مباشرة
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground-subtle">
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>رد خلال ساعات</span>
                  <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
                  <span>متابعة يومية</span>
                </div>
              </div>
            </div>
            {settings?.whatsapp_number ? (
              <a
                href={buildWhatsAppLink(
                  settings.whatsapp_number,
                  'مرحبا أستاذ وليد، لدي سؤال أكاديمي عن المنهج. حسابي: ' +
                    (profile?.full_name ?? user?.email ?? '') +
                    ' — ',
                )}
                target="_blank"
                rel="noreferrer"
                data-testid="support-academic-link"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-5 py-3 text-sm font-bold text-warning transition-colors hover:bg-warning/15 sm:w-auto"
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
              trend={
                unitsCount > 0
                  ? { label: 'من مشترياتك', value: unitsCount, positive: true }
                  : undefined
              }
            />
            <StatCard
              title="الإشعارات غير المقروءة"
              value={unreadNotifications}
              icon={<Bell className="h-5 w-5" />}
              variant={unreadNotifications > 0 ? 'warning' : 'default'}
              trend={
                unreadNotifications > 0
                  ? { label: 'جديد', value: unreadNotifications, positive: true }
                  : undefined
              }
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
              <ErrorState message="تعذر تحميل وحدات صفك" onRetry={() => void loadGradeUnits()} />
            ) : gradeUnits === null ? (
              <div className="flex flex-col gap-3" aria-hidden="true">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : !profile?.grade_id ? (
              <div className="text-center py-8">
                <PackageOpen
                  className="h-10 w-10 mx-auto text-foreground-subtle"
                  aria-hidden="true"
                />
                <p className="mt-3 text-foreground-muted">
                  لم يتم تحديد صفك الدراسي — تواصل مع الأستاذ
                </p>
              </div>
            ) : gradeUnits.length === 0 ? (
              <div className="text-center py-8">
                <PackageOpen
                  className="h-10 w-10 mx-auto text-foreground-subtle"
                  aria-hidden="true"
                />
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
                <div className="grid gap-3 sm:grid-cols-2">
                  {gradeUnits.map((unit) => {
                    const price = priceById.get(unit.id);
                    const isPurchased = purchasedUnitIds.has(unit.id);
                    return (
                      <div
                        key={unit.id}
                        className="group flex items-center justify-between gap-3 rounded-xl border border-border-muted bg-surface-muted p-3.5 transition-colors hover:border-border"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <PackageOpen
                            aria-hidden="true"
                            className="h-5 w-5 shrink-0 text-accent-strong"
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-foreground truncate">{unit.name}</p>
                            <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-surface border border-border-muted px-2 py-0.5 text-[11px] font-medium text-foreground-subtle">
                              {price?.total_price != null ? (
                                <span dir="ltr">{formatPrice(price.total_price)}</span>
                              ) : (
                                'لا يوجد سعر بعد'
                              )}
                            </p>
                          </div>
                        </div>
                        {isPurchased ? (
                          <Link
                            to={`/student/curriculum?unit=${unit.id}`}
                            className="btn-primary shrink-0 rounded-xl px-4 py-2 text-xs font-bold"
                            data-testid={`open-grade-unit-${unit.id}`}
                          >
                            افتح
                          </Link>
                        ) : (
                          <Link
                            to="/student/units"
                            className="glass-soft inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-foreground transition-colors hover:bg-border-muted"
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
              <ErrorState
                message="تعذر تحميل وحداتك المشتراة"
                onRetry={() => void loadPurchases()}
              />
            ) : purchases === null ? (
              <div className="flex flex-col gap-3" aria-hidden="true">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : purchases.length === 0 ? (
              <div className="text-center py-8">
                <PackageOpen
                  className="h-10 w-10 mx-auto text-foreground-subtle"
                  aria-hidden="true"
                />
                <p className="mt-3 text-foreground-muted">لم تشترِ أي وحدة بعد</p>
                <p className="mt-1 text-sm text-foreground-subtle">
                  ابدأ رحلتك التعليمية بتفعيل وحدتك الأولى
                </p>
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
                  <div
                    key={purchase.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-muted transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <PackageOpen
                        aria-hidden="true"
                        className="h-5 w-5 shrink-0 text-primary-strong"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{purchase.unit_name}</p>
                        <p className="text-xs text-foreground-muted" dir="ltr">
                          {formatPrice(purchase.total_price)}
                        </p>
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
                className="relative flex items-center gap-3 rounded-lg p-3 bg-surface-muted transition-colors group"
              >
                <Bell aria-hidden="true" className="h-5 w-5 shrink-0 text-primary-strong" />
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
                className="flex items-center gap-3 rounded-lg p-3 bg-surface-muted transition-colors"
              >
                <User aria-hidden="true" className="h-5 w-5 shrink-0 text-accent-strong" />
                <div>
                  <p className="font-medium text-foreground">تعديل الملف الشخصي</p>
                  <p className="text-xs text-foreground-muted">تحديث بياناتك</p>
                </div>
              </Link>
              <Link
                to="/student/password"
                className="flex items-center gap-3 rounded-lg p-3 bg-surface-muted transition-colors"
              >
                <KeyRound aria-hidden="true" className="h-5 w-5 shrink-0 text-warning" />
                <div>
                  <p className="font-medium text-foreground">تغيير كلمة المرور</p>
                  <p className="text-xs text-foreground-muted">تعزيز أمان حسابك</p>
                </div>
              </Link>
              <Link
                to="/student/units"
                className="flex items-center gap-3 rounded-lg p-3 bg-surface-muted transition-colors"
              >
                <PackageOpen aria-hidden="true" className="h-5 w-5 shrink-0 text-success" />
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
          <GridCard>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <WhatsAppIcon size={24} className="shrink-0 text-success" />
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">
                    تواصل مع الأستاذ
                  </h3>
                  <p className="text-sm text-foreground-muted">
                    لأي استفسار يمكنك التواصل مباشرة عبر واتساب
                  </p>
                </div>
              </div>
              <a
                href={buildWhatsAppLink(
                  settings.whatsapp_number,
                  settings.whatsapp_default_message,
                )}
                target="_blank"
                rel="noreferrer"
                className="btn-primary inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold shrink-0"
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
