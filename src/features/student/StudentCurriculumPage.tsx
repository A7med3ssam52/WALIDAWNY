import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GraduationCap, PlayCircle, Lock, PackageOpen, Check } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { GridCard } from '../../components/GridCard';
import { LayoutShell } from '../../components/LayoutShell';
import { LockedUnitCard } from '../../components/LockedUnitCard';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { StudentNav } from '../../components/StudentNav';
import { useToast } from '../../components/Toast';
import {
  getGradeById,
  getMyUnitPurchases,
  getPublicSettings,
  getPublicUnitPrices,
  getTrialLessons,
  listLessonsForUnit,
  listMyProgress,
  listUnitsForGrade,
  redeemUnitCode,
} from '../../data/rpc';
import type { TrialLessonRow } from '../../data/rpc';
import { cn } from '../../lib/cn';
import type {
  Grade,
  Lesson,
  Progress,
  PublicSettings,
  PublicUnitPrice,
  Unit,
  UnitPurchaseWithUnit,
} from '../../types/database';
import { useAuth } from '../auth/AuthContext';
import { redeemErrorMessage } from './redeemErrors';

interface UnitWithLessons extends Unit {
  lessons: Lesson[];
}

function LessonProgressBadge({ progress }: { progress: Progress | undefined }) {
  if (!progress) {
    return <Badge variant="neutral" outline>جديد</Badge>;
  }
  if (progress.is_completed) {
    return <Badge variant="success">مكتمل</Badge>;
  }
  return <Badge variant="warning">{Math.round(progress.percent_completed)}٪</Badge>;
}

function CurriculumSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <GridCard>
        <div className="flex items-center gap-3">
          <Skeleton className="h-2 w-48 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
      </GridCard>
      {[0, 1, 2].map((index) => (
        <GridCard key={index}>
          <Skeleton className="h-6 w-1/2 mb-4" />
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        </GridCard>
      ))}
    </div>
  );
}

export function StudentCurriculumPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [grade, setGrade] = useState<Grade | null | undefined>(undefined);
  const [units, setUnits] = useState<UnitWithLessons[]>([]);
  const [purchases, setPurchases] = useState<UnitPurchaseWithUnit[]>([]);
  const [prices, setPrices] = useState<PublicUnitPrice[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [progressByLesson, setProgressByLesson] = useState<Map<string, Progress>>(new Map());
  const [trialLessons, setTrialLessons] = useState<TrialLessonRow[]>([]);
  const [error, setError] = useState(false);
  // Split-board navigation: one active unit at a time (sidebar on desktop,
  // horizontal chips on mobile) instead of the old accordion expansion.
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [redeemByUnit, setRedeemByUnit] = useState<Record<string, { busy: boolean; error: string | null }>>({});

  const load = useCallback(async () => {
    // Legacy students may have grade_id = null. We still show cross-grade
    // trial lessons via getTrialLessons() (SECURITY DEFINER, no grade filter)
    // so free content is never hidden behind a missing grade assignment.
    if (!profile?.grade_id) {
      setGrade(null);
      setUnits([]);
      try {
        const results = await Promise.allSettled([getTrialLessons(), listMyProgress()]);
        const trials = results[0].status === 'fulfilled' ? results[0].value : [];
        const progressRows = results[1].status === 'fulfilled' ? results[1].value : [];
        setTrialLessons(trials);
        setProgressByLesson(new Map(progressRows.map((row) => [row.lesson_id, row])));
      } catch {
        setTrialLessons([]);
      }
      return;
    }
    setError(false);
    try {
      const gradeRow = await getGradeById(profile.grade_id);
      const settled = await Promise.allSettled([
        listUnitsForGrade(profile.grade_id as string),
        listMyProgress(),
        getMyUnitPurchases(),
        getPublicUnitPrices(),
        getPublicSettings(),
        getTrialLessons(),
      ]);
      const allUnits = settled[0].status === 'fulfilled' ? settled[0].value : [];
      const progressRows = settled[1].status === 'fulfilled' ? settled[1].value : [];
      const purchasesResult = settled[2].status === 'fulfilled' ? settled[2].value : [];
      const pricesResult = settled[3].status === 'fulfilled' ? settled[3].value : [];
      const settingsResult = settled[4].status === 'fulfilled' ? (settled[4].value as typeof settings) : null;
      const trialRows = settled[5].status === 'fulfilled' ? settled[5].value : [];

      // If the critical units fetch failed, show error but keep other data
      if (settled[0].status === 'rejected') {
        setError(true);
      }

      const publishedUnits = allUnits
        .filter((unit) => unit.status === 'published')
        .sort((a, b) => a.sort_order - b.sort_order);
      const withLessonsSettled = await Promise.allSettled(
        publishedUnits.map(async (unit) => {
          try {
            const lessons = (await listLessonsForUnit(unit.id))
              .filter((lesson) => lesson.status === 'published')
              .sort((a, b) => a.sort_order - b.sort_order);
            return { ...unit, lessons };
          } catch {
            return { ...unit, lessons: [] as typeof unit extends { lessons: infer L } ? L : never };
          }
        }),
      );
      const withLessons = withLessonsSettled
        .filter((r): r is PromiseFulfilledResult<UnitWithLessons> => r.status === 'fulfilled')
        .map((r) => r.value);
      setGrade(gradeRow);
      setUnits(withLessons);
      setProgressByLesson(new Map(progressRows.map((row) => [row.lesson_id, row])));
      setPurchases(purchasesResult);
      setPrices(pricesResult);
      if (settingsResult) setSettings(settingsResult);
      setTrialLessons(trialRows);
    } catch {
      setError(true);
    }
  }, [profile?.grade_id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await load();
      if (cancelled) return;
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Fix #13 — إبطال cache المنهج بعد toggle/upsert: إعادة تحميل التقدم فقط
  // عند حدث lesson-progress-updated (بدون إعادة تحميل الوحدات كاملة).
  useEffect(() => {
    const handler = () => {
      listMyProgress()
        .then((rows) => setProgressByLesson(new Map(rows.map((row) => [row.lesson_id, row]))))
        .catch(() => {
          // best-effort
        });
    };
    window.addEventListener('lesson-progress-updated', handler);
    return () => window.removeEventListener('lesson-progress-updated', handler);
  }, []);

  const focusUnitId = searchParams.get('unit');

  // Default selection: focused unit from ?unit=, else first unit.
  // Keeps the previous accordion's "deep link into a unit" behavior.
  useEffect(() => {
    if (units.length === 0) {
      return;
    }
    if (focusUnitId && units.some((unit) => unit.id === focusUnitId)) {
      setActiveUnitId(focusUnitId);
      return;
    }
    setActiveUnitId((prev) => (prev && units.some((unit) => unit.id === prev) ? prev : units[0].id));
  }, [focusUnitId, units]);

  useEffect(() => {
    if (!focusUnitId || units.length === 0) {
      return;
    }
    // Defer one frame so the detail panel for the focused unit is mounted.
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`unit-${focusUnitId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusUnitId, units, activeUnitId]);

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

  if (error) {
    return (
      <LayoutShell title="المنهج الدراسي" variant="sidebar" nav={<StudentNav />}>
        <div className="flex flex-col gap-6">
          <PageHeader title="المنهج الدراسي" icon={<GraduationCap className="h-5 w-5" />} />
          <ErrorState message="تعذر تحميل المنهج الدراسي" onRetry={() => void load()} />
        </div>
      </LayoutShell>
    );
  }

  if (grade === undefined) {
    return (
      <LayoutShell title="المنهج الدراسي" variant="sidebar" nav={<StudentNav />}>
        <div className="flex flex-col gap-6">
          <PageHeader title="المنهج الدراسي" icon={<GraduationCap className="h-5 w-5" />} />
          <CurriculumSkeleton />
        </div>
      </LayoutShell>
    );
  }

  if (grade === null) {
    const groupedForNull = trialLessons.reduce((acc, cur) => {
      const gradeKey = cur.grade_name || 'غير مصنف';
      const unitKey = cur.unit_name || 'وحدة غير معروفة';
      if (!acc.has(gradeKey)) acc.set(gradeKey, new Map<string, TrialLessonRow[]>());
      const unitMap = acc.get(gradeKey)!;
      if (!unitMap.has(unitKey)) unitMap.set(unitKey, []);
      unitMap.get(unitKey)!.push(cur);
      return acc;
    }, new Map<string, Map<string, TrialLessonRow[]>>());
    return (
      <LayoutShell title="المنهج الدراسي" variant="sidebar" nav={<StudentNav />}>
        <div className="flex flex-col gap-6">
          <PageHeader title="المنهج الدراسي" icon={<GraduationCap className="h-5 w-5" />} />
          <GridCard className="text-center py-12">
            <EmptyState
              icon={<GraduationCap className="h-10 w-10 mx-auto text-foreground-subtle" />}
              title="لم يتم تحديد صفك الدراسي"
              description="تواصل مع الأستاذ لتحديد الصف الدراسي الخاص بك ثم حاول مرة أخرى."
            />
          </GridCard>
          {trialLessons.length > 0 && (
            <GridCard data-testid="trial-lessons-section">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <PlayCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">دروس مجانية للجميع</h3>
                  <p className="text-xs text-foreground-muted">متاحة بدون تفعيل — من جميع الصفوف</p>
                </div>
                <Badge variant="info" className="ms-auto">مجاني</Badge>
              </div>
              <div className="space-y-4">
                {[...groupedForNull.entries()].map(([gradeName, unitMap]) => (
                  <div key={gradeName} className="space-y-3">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />
                      {gradeName}
                    </p>
                    {[...unitMap.entries()].map(([unitName, lessons]) => (
                      <div key={`${gradeName}-${unitName}`} className="rounded-xl border border-border bg-surface-muted overflow-hidden">
                        <div className="px-3 py-2 bg-surface border-b border-border-muted">
                          <p className="text-sm font-medium text-foreground">{unitName}</p>
                        </div>
                        <ul className="divide-y divide-border-muted">
                          {lessons
                            .slice()
                            .sort((a, b) => a.lesson_sort_order - b.lesson_sort_order)
                            .map((lesson) => (
                              <li key={lesson.lesson_id}>
                                <Link
                                  to={`/student/lessons/${lesson.lesson_id}`}
                                  className="flex min-h-[3.75rem] items-center gap-2.5 px-3 py-3 transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong sm:gap-3"
                                  data-testid={`trial-lesson-${lesson.lesson_id}`}
                                >
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                                    <PlayCircle className="h-4 w-4" />
                                  </div>
                                  <span className="min-w-0 flex-1">
                                    <span className="block break-words text-sm font-bold leading-6 text-foreground">{lesson.lesson_title}</span>
                                    <Badge variant="info" className="mt-1">مجاني</Badge>
                                  </span>
                                  <span className="shrink-0">
                                    <LessonProgressBadge progress={progressByLesson.get(lesson.lesson_id)} />
                                  </span>
                                </Link>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </GridCard>
          )}
        </div>
      </LayoutShell>
    );
  }

  const purchasedUnitIds = new Set(purchases.map((purchase) => purchase.unit_id));
  const priceById = new Map(prices.map((price) => [price.unit_id, price]));
  const isUnitAccessible = (unit: Unit) =>
    purchasedUnitIds.has(unit.id) || priceById.get(unit.id)?.is_free === true;
  // Fix #6 — نسبة المنهج على الوحدات المفعلة فقط (مشتراة + مجانية +
  // تجريبي ظاهر)، لا كل الوحدات المنشورة.
  const existingLessonIdsForRatio = new Set(units.flatMap((u) => u.lessons.map((l) => l.id)));
  const visibleTrialForRatio = trialLessons.filter((t) => !existingLessonIdsForRatio.has(t.lesson_id));
  const accessibleUnits = units.filter((u) => isUnitAccessible(u));
  const totalLessons =
    accessibleUnits.reduce((sum, unit) => sum + unit.lessons.length, 0) +
    visibleTrialForRatio.length;
  const completedLessons =
    accessibleUnits.reduce(
      (sum, unit) =>
        sum + unit.lessons.filter((lesson) => progressByLesson.get(lesson.id)?.is_completed).length,
      0,
    ) +
    visibleTrialForRatio.filter((t) => progressByLesson.get(t.lesson_id)?.is_completed).length;
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // trial: deduplicate lessons already present in own-grade units, keep published filter (RPC already does)
  const existingLessonIds = new Set(units.flatMap((u) => u.lessons.map((l) => l.id)));
  const filteredTrials = trialLessons.filter((t) => !existingLessonIds.has(t.lesson_id));
  const groupedTrials = filteredTrials.reduce((acc, cur) => {
    const gradeKey = cur.grade_name || 'غير مصنف';
    const unitKey = cur.unit_name || 'وحدة غير معروفة';
    if (!acc.has(gradeKey)) acc.set(gradeKey, new Map<string, TrialLessonRow[]>());
    const unitMap = acc.get(gradeKey)!;
    if (!unitMap.has(unitKey)) unitMap.set(unitKey, []);
    unitMap.get(unitKey)!.push(cur);
    return acc;
  }, new Map<string, Map<string, TrialLessonRow[]>>());

  const activeUnit = units.find((unit) => unit.id === activeUnitId) ?? null;

  const unitStats = (unit: UnitWithLessons) => {
    const done = unit.lessons.filter((lesson) => progressByLesson.get(lesson.id)?.is_completed).length;
    const total = unit.lessons.length;
    return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
  };

  // Mobile: after tapping a unit, scroll the detail panel into view
  // (desktop shows list + detail side by side, no scroll needed).
  const selectUnitOnMobile = (unitId: string) => {
    setActiveUnitId(unitId);
    window.requestAnimationFrame(() => {
      document.getElementById(`unit-${unitId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <LayoutShell
      title="المنهج الدراسي"
      subtitle={`${grade.name} — ${totalLessons} درسًا`}
      variant="sidebar"
      nav={<StudentNav />}
    >
      <div className="flex flex-col gap-6">
        <PageHeader
          title="المنهج الدراسي"
          subtitle={`${grade.name} — ${units.length} وحدة، ${totalLessons} درسًا`}
          icon={<GraduationCap className="h-5 w-5" />}
        />

        {/* Progress Overview */}
        <GridCard>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-foreground">تقدمك الكلي</h3>
                <p className="text-sm text-foreground-muted" data-testid="curriculum-progress-label">{completedLessons} من {totalLessons} درسًا مكتمل</p>
              </div>
            </div>
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="h-2 flex-1 max-w-xs overflow-hidden rounded-full bg-surface-muted" data-testid="curriculum-progress-bar">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${progressPercent}%` }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={totalLessons}
                  aria-valuenow={completedLessons}
                  aria-label="تقدمك في المنهج"
                />
              </div>
              <span className="text-lg font-display font-bold text-foreground shrink-0">
                {progressPercent}%
              </span>
            </div>
          </div>
        </GridCard>

        {/* Trial lessons: free for all grades (cross-grade), grouped by grade/unit */}
        {filteredTrials.length > 0 && (
          <GridCard data-testid="trial-lessons-section">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <PlayCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-foreground">دروس مجانية للجميع</h3>
                <p className="text-xs text-foreground-muted">متاحة بدون تفعيل — من جميع الصفوف</p>
              </div>
              <Badge variant="info" className="ms-auto">مجاني</Badge>
            </div>
            <div className="space-y-4">
              {[...groupedTrials.entries()].map(([gradeName, unitMap]) => (
                <div key={gradeName} className="space-y-3">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />
                    {gradeName}
                  </p>
                  {[...unitMap.entries()].map(([unitName, lessons]) => (
                    <div key={`${gradeName}-${unitName}`} className="rounded-xl border border-border bg-surface-muted overflow-hidden">
                      <div className="px-3 py-2 bg-surface border-b border-border-muted">
                        <p className="text-sm font-medium text-foreground">{unitName}</p>
                      </div>
                      <ul className="divide-y divide-border-muted">
                        {lessons
                          .slice()
                          .sort((a, b) => a.lesson_sort_order - b.lesson_sort_order)
                          .map((lesson) => {
                            const progress = progressByLesson.get(lesson.lesson_id);
                            return (
                              <li key={lesson.lesson_id}>
                                <Link
                                  to={`/student/lessons/${lesson.lesson_id}`}
                                  className="flex min-h-[3.75rem] items-center gap-2.5 px-3 py-3 transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong sm:gap-3"
                                  data-testid={`trial-lesson-${lesson.lesson_id}`}
                                >
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                                    <PlayCircle className="h-4 w-4" />
                                  </div>
                                  <span className="min-w-0 flex-1">
                                    <span className="block break-words text-sm font-bold leading-6 text-foreground">{lesson.lesson_title}</span>
                                    <Badge variant="info" className="mt-1">مجاني</Badge>
                                  </span>
                                  <span className="shrink-0">
                                    <LessonProgressBadge progress={progress} />
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </GridCard>
        )}

        {units.length === 0 ? (
          <GridCard className="text-center py-12">
            <EmptyState
              title="لا توجد دروس بعد"
              description="لم يتم نشر أي وحدات في صفك الدراسي حتى الآن."
            />
          </GridCard>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Mobile: full-width compact unit list (no horizontal scroll,
                names + progress stay readable on narrow screens) */}
            <div
              className="flex flex-col gap-2 lg:hidden"
              role="tablist"
              aria-label="الوحدات"
            >
              {units.map((unit) => {
                const purchased = purchasedUnitIds.has(unit.id) || priceById.get(unit.id)?.is_free === true;
                const price = priceById.get(unit.id);
                const isFree = price?.is_free === true;
                const stats = unitStats(unit);
                const selected = unit.id === activeUnit?.id;
                return (
                  <button
                    key={unit.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    data-testid={`unit-chip-${unit.id}`}
                    onClick={() => selectUnitOnMobile(unit.id)}
                    className={cn(
                      'flex min-h-[4rem] items-center gap-3 rounded-2xl border p-3 text-start transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong',
                      selected
                        ? 'border-primary-strong bg-primary-soft'
                        : 'border-border bg-surface active:bg-surface-muted',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                        purchased ? 'bg-primary-soft text-primary' : 'bg-surface-muted text-foreground-subtle',
                      )}
                    >
                      {purchased ? <PackageOpen className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-foreground">
                        {unit.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-foreground-muted">
                        {purchased ? `${stats.done}/${stats.total} دروس · ${stats.percent}٪` : 'مقفولة — تحتاج تفعيل'}
                        {isFree ? ' · مجانية' : ''}
                      </span>
                      {purchased && stats.total > 0 ? (
                        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${stats.percent}%` }} />
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 lg:gap-4 lg:grid-cols-[300px_1fr] lg:items-start">
              {/* Desktop: unit list sidebar */}
              <nav aria-label="قائمة الوحدات" className="hidden lg:flex lg:flex-col lg:gap-2">
                <div role="tablist" aria-label="الوحدات" className="flex flex-col gap-2">
                  {units.map((unit) => {
                    const purchased = purchasedUnitIds.has(unit.id) || priceById.get(unit.id)?.is_free === true;
                    const price = priceById.get(unit.id);
                    const isFree = price?.is_free === true;
                    const stats = unitStats(unit);
                    const selected = unit.id === activeUnit?.id;
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        data-testid={`unit-tab-${unit.id}`}
                        onClick={() => setActiveUnitId(unit.id)}
                        className={cn(
                          'flex items-center gap-3 rounded-2xl border p-3.5 text-start transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong',
                          selected
                            ? 'border-primary-strong bg-primary-soft'
                            : 'border-border bg-surface hover:border-primary/40',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                            purchased ? 'bg-primary-soft text-primary' : 'bg-surface-muted text-foreground-subtle',
                          )}
                        >
                          {purchased ? <PackageOpen className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-foreground">
                            {unit.name}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-foreground-muted">
                            {purchased ? `${stats.done}/${stats.total} دروس · ${stats.percent}٪` : 'مقفولة — تحتاج تفعيل'}
                            {isFree ? ' · مجانية' : ''}
                          </span>
                          {purchased && stats.total > 0 ? (
                            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                              <span className="block h-full rounded-full bg-primary" style={{ width: `${stats.percent}%` }} />
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-2xl border border-dashed border-border bg-surface-muted/50 p-4 text-center text-[11px] leading-5 text-foreground-subtle">
                  فعّل وحدة جديدة بكود من الأستاذ — تظهر هنا فورًا
                </div>
              </nav>

              {/* Detail panel */}
              {activeUnit ? (
                <UnitDetailPanel
                  key={activeUnit.id}
                  unit={activeUnit}
                  purchasedUnitIds={purchasedUnitIds}
                  priceById={priceById}
                  settings={settings}
                  progressByLesson={progressByLesson}
                  redeemState={redeemByUnit[activeUnit.id]}
                  onRedeem={(code) => handleRedeemUnit(activeUnit.id, code)}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </LayoutShell>
  );
}

function UnitDetailPanel({
  unit,
  purchasedUnitIds,
  priceById,
  settings,
  progressByLesson,
  redeemState,
  onRedeem,
}: {
  unit: UnitWithLessons;
  purchasedUnitIds: Set<string>;
  priceById: Map<string, PublicUnitPrice>;
  settings: PublicSettings | null;
  progressByLesson: Map<string, Progress>;
  redeemState: { busy: boolean; error: string | null } | undefined;
  onRedeem: (code: string) => Promise<boolean>;
}) {
  const isPurchased = purchasedUnitIds.has(unit.id) || priceById.get(unit.id)?.is_free === true;
  const price = priceById.get(unit.id);
  const isFree = price?.is_free === true;
  const unitLessons = unit.lessons;
  const unitCompleted = unitLessons.filter((l) => progressByLesson.get(l.id)?.is_completed).length;
  const unitTotal = unitLessons.length;
  const unitProgress = unitTotal > 0 ? Math.round((unitCompleted / unitTotal) * 100) : 0;

  if (!isPurchased) {
    // Trial lessons must remain accessible even inside a locked unit
    // and even when the student has zero unit_purchases. Filtering
    // is by is_trial only — never by has_purchase — so a free
    // lesson opens via can_access_lesson even cross-grade.
    const trialLessons = unitLessons.filter((lesson) => lesson.is_trial);
    return (
      <section aria-label={unit.name} data-testid={`unit-detail-${unit.id}`} id={`unit-${unit.id}`} className="scroll-mt-6">
        <GridCard>
          <h3 className="sr-only">{unit.name}</h3>
          <LockedUnitCard
            unit={price ?? null}
            unitName={unit.name}
            gradeName={price?.grade_name}
            whatsappNumber={settings?.whatsapp_number ?? null}
            whatsappMessage={`${settings?.whatsapp_default_message ?? ''} — وحدة ${unit.name}`}
            onRedeem={onRedeem}
            redeemBusy={redeemState?.busy ?? false}
            redeemError={redeemState?.error ?? null}
          />
          {trialLessons.length > 0 ? (
            <div className="mt-4 border-t border-border-muted pt-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <PlayCircle className="h-4 w-4 text-primary" aria-hidden="true" />
                درس مجاني متاح بدون تفعيل
              </p>
              <ul className="divide-y divide-border-muted overflow-hidden rounded-xl border border-border bg-surface-muted">
                {trialLessons.map((lesson) => {
                  const progress = progressByLesson.get(lesson.id);
                  return (
                    <li key={lesson.id}>
                      <Link
                        to={`/student/lessons/${lesson.id}`}
                        className="flex min-h-[3.75rem] items-center gap-2.5 px-3 py-3 transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong sm:gap-3"
                        data-testid={`curriculum-lesson-${lesson.id}`}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                          <PlayCircle className="h-4 w-4" />
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-bold leading-6 text-foreground">{lesson.title}</span>
                          <Badge variant="info" className="mt-1">مجاني</Badge>
                        </span>
                        <span className="shrink-0">
                          <LessonProgressBadge progress={progress} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </GridCard>
      </section>
    );
  }

  return (
    <section
      aria-label={unit.name}
      data-testid={`unit-detail-${unit.id}`}
      id={`unit-${unit.id}`}
      className="scroll-mt-6 overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <div className="border-b border-border-muted p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <PackageOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display min-w-0 flex-1 break-words text-lg font-bold leading-8 text-foreground">{unit.name}</h3>
              {isFree ? <Badge variant="success" className="shrink-0 text-xs">مجاني</Badge> : null}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-foreground-muted">
              <span>{unitCompleted} / {unitTotal} دروس</span>
              <span className="font-bold tabular-nums text-primary">{unitProgress}%</span>
            </div>
          </div>
        </div>
        {unitTotal > 0 ? (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${unitProgress}%` }} />
          </div>
        ) : null}
      </div>
      {unitLessons.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-foreground-subtle">لا توجد دروس منشورة في هذه الوحدة بعد.</p>
      ) : (
        <ul className="divide-y divide-border-muted">
          {unitLessons.map((lesson) => {
            const progress = progressByLesson.get(lesson.id);
            return (
              <li key={lesson.id}>
                <Link
                  to={`/student/lessons/${lesson.id}`}
                  className="flex min-h-[3.75rem] items-center gap-2.5 px-3 py-3 transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong sm:gap-3 sm:px-4"
                  data-testid={`curriculum-lesson-${lesson.id}`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-foreground-muted">
                    <PlayCircle className="h-4 w-4" />
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-bold leading-6 text-foreground">{lesson.title}</span>
                    {lesson.is_trial ? (
                      <Badge variant="info" className="mt-1">مجاني</Badge>
                    ) : null}
                  </span>
                  <span className="shrink-0">
                    <LessonProgressBadge progress={progress} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
