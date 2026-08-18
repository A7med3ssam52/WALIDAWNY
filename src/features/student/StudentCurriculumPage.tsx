import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GraduationCap, PlayCircle, ChevronDown, PackageOpen } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { GridCard } from '../../components/GridCard';
import { LayoutShell } from '../../components/LayoutShell';
import { LockedUnitCard } from '../../components/LockedUnitCard';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { StudentNav } from '../../components/StudentNav';
import {
  getGradeById,
  getMyUnitPurchases,
  getPublicSettings,
  getPublicUnitPrices,
  listLessonsForUnit,
  listMyProgress,
  listUnitsForGrade,
} from '../../data/rpc';
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
  const [searchParams] = useSearchParams();
  const [grade, setGrade] = useState<Grade | null | undefined>(undefined);
  const [units, setUnits] = useState<UnitWithLessons[]>([]);
  const [purchases, setPurchases] = useState<UnitPurchaseWithUnit[]>([]);
  const [prices, setPrices] = useState<PublicUnitPrice[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [progressByLesson, setProgressByLesson] = useState<Map<string, Progress>>(new Map());
  const [error, setError] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!profile?.grade_id) {
      setGrade(null);
      setUnits([]);
      return;
    }
    setError(false);
    try {
      const gradeRow = await getGradeById(profile.grade_id);
      const [allUnits, progressRows, purchasesResult, pricesResult, settingsResult] =
        await Promise.all([
          listUnitsForGrade(profile.grade_id as string),
          listMyProgress(),
          getMyUnitPurchases(),
          getPublicUnitPrices(),
          getPublicSettings(),
        ]);
      const publishedUnits = allUnits
        .filter((unit) => unit.status === 'published')
        .sort((a, b) => a.sort_order - b.sort_order);
      const withLessons = await Promise.all(
        publishedUnits.map(async (unit) => {
          const lessons = (await listLessonsForUnit(unit.id))
            .filter((lesson) => lesson.status === 'published')
            .sort((a, b) => a.sort_order - b.sort_order);
          return { ...unit, lessons };
        }),
      );
      setGrade(gradeRow);
      setUnits(withLessons);
      setProgressByLesson(new Map(progressRows.map((row) => [row.lesson_id, row])));
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

  const focusUnitId = searchParams.get('unit');
  useEffect(() => {
    if (!focusUnitId) {
      return;
    }
    const element = document.getElementById(`unit-${focusUnitId}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setExpandedUnits((prev) => new Set(prev).add(focusUnitId));
  }, [focusUnitId, units]);

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
        </div>
      </LayoutShell>
    );
  }

  const totalLessons = units.reduce((sum, unit) => sum + unit.lessons.length, 0);
  const completedLessons = units.reduce(
    (sum, unit) =>
      sum + unit.lessons.filter((lesson) => progressByLesson.get(lesson.id)?.is_completed).length,
    0,
  );
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const purchasedUnitIds = new Set(purchases.map((purchase) => purchase.unit_id));
  const priceById = new Map(prices.map((price) => [price.unit_id, price]));

  const toggleUnit = (unitId: string) => {
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  };

  const isExpanded = (unitId: string) => expandedUnits.has(unitId);

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
        <GridCard className="glass-accent-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-foreground">تقدمك الكلي</h3>
                <p className="text-sm text-foreground-muted">{completedLessons} من {totalLessons} درسًا مكتمل</p>
              </div>
            </div>
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="h-2 flex-1 max-w-xs overflow-hidden rounded-full bg-white/10 shadow-[inset_0_1px_2px_rgba(2,1,10,0.6)]">
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

        {units.length === 0 ? (
          <GridCard className="text-center py-12">
            <EmptyState
              title="لا توجد دروس بعد"
              description="لم يتم نشر أي وحدات في صفك الدراسي حتى الآن."
            />
          </GridCard>
        ) : (
          <div className="space-y-4">
            {units.map((unit) => {
              const isPurchased = purchasedUnitIds.has(unit.id);
              const price = priceById.get(unit.id);
              const unitLessons = unit.lessons;
              const unitCompleted = unitLessons.filter((l) => progressByLesson.get(l.id)?.is_completed).length;
              const unitTotal = unitLessons.length;
              const unitProgress = unitTotal > 0 ? Math.round((unitCompleted / unitTotal) * 100) : 0;
              const expanded = isExpanded(unit.id);

              if (!isPurchased) {
                return (
                  <GridCard key={unit.id}>
                    <LockedUnitCard
                      unit={price ?? null}
                      unitName={unit.name}
                      gradeName={price?.grade_name}
                      whatsappNumber={settings?.whatsapp_number ?? null}
                      whatsappMessage={`${settings?.whatsapp_default_message ?? ''} — وحدة ${unit.name}`}
                    />
                  </GridCard>
                );
              }

              return (
                <GridCard
                  key={unit.id}
                  className="overflow-hidden"
                >
                  <button
                    type="button"
                    id={`unit-${unit.id}`}
                    onClick={() => toggleUnit(unit.id)}
                    className="w-full flex items-center justify-between gap-3 p-4 -mx-4 -my-4 rounded-lg hover:bg-white/3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                    aria-expanded={expanded}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                        <PackageOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display text-lg font-bold text-foreground truncate">{unit.name}</h3>
                        <div className="flex items-center gap-2 mt-1 text-sm text-foreground-muted">
                          <span>{unitCompleted} / {unitTotal} دروس</span>
                          <span className="text-primary">{unitProgress}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${unitProgress}%` }}
                        />
                      </div>
                      <ChevronDown
                        className={cn(
                          'h-5 w-5 text-foreground-muted transition-transform',
                          expanded && 'rotate-180'
                        )}
                        aria-hidden="true"
                      />
                    </div>
                  </button>

                  {expanded && (
                    <div className="animate-slide-in-top px-4 pb-4 border-t border-white/5">
                      <ul className="divide-y divide-border-muted">
                        {unitLessons.map((lesson) => {
                          const progress = progressByLesson.get(lesson.id);
                          return (
                            <li key={lesson.id}>
                              <Link
                                to={`/student/lessons/${lesson.id}`}
                                className="flex items-center justify-between gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                                data-testid={`curriculum-lesson-${lesson.id}`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-foreground-muted">
                                    <PlayCircle className="h-4 w-4" />
                                  </div>
                                  <span className="text-sm text-foreground truncate">{lesson.title}</span>
                                </div>
                                <LessonProgressBadge progress={progress} />
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </GridCard>
              );
            })}
          </div>
        )}
      </div>
    </LayoutShell>
  );
}