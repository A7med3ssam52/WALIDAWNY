import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  ChevronLeft,
  EyeOff,
  Layers,
  Pencil,
  Plus,
  Radar,
  Trash2,
  Upload,
} from 'lucide-react';

import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { LessonStatusBadge } from '../../components/LessonStatusBadge';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { Skeleton } from '../../components/Skeleton';
import { StaffNav } from '../../components/StaffNav';
import { useToast } from '../../components/Toast';
import {
  createLesson,
  createUnit,
  deleteUnit,
  getRpcErrorCode,
  hideLesson,
  listDeletedLessonsForUnit,
  listDeletedUnitsForGrade,
  listGrades,
  listLessonsForUnit,
  listUnitsForGrade,
  publishLesson,
  restoreLesson,
  restoreUnit,
  softDeleteLesson,
  updateLesson,
  updateUnit,
} from '../../data/rpc';
import type { Grade, Lesson, Unit } from '../../types/database';

const CURRICULUM_ERROR_MESSAGES: Record<string, string> = {
  unit_not_found: 'الوحدة غير موجودة',
  lesson_not_found: 'الدرس غير موجود',
  access_denied: 'ليست لديك صلاحية',
  permission_denied: 'ليست لديك صلاحية',
};

function curriculumErrorMessage(error: unknown, unitContext = true): string {
  const code = getRpcErrorCode(error);
  if (code && CURRICULUM_ERROR_MESSAGES[code]) {
    return CURRICULUM_ERROR_MESSAGES[code];
  }
  if (code && code.includes('duplicate key value')) {
    return unitContext ? 'يوجد وحدة بنفس الاسم في هذا الصف' : 'تعذر تنفيذ العملية. حاول مرة أخرى';
  }
  return 'تعذر تنفيذ العملية. حاول مرة أخرى';
}

type PendingUnitEdit = { unit: Unit } | null;
type PendingUnitDelete = { unit: Unit } | null;
type PendingLessonEdit = { lesson: Lesson } | null;
type PendingLessonDelete = { lesson: Lesson } | null;

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-md" />
      ))}
    </div>
  );
}

const METRIC_TONES = {
  indigo: 'text-indigo-300',
  emerald: 'text-emerald-300',
  sky: 'text-sky-300',
  rose: 'text-rose-300',
} as const;

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: keyof typeof METRIC_TONES;
}) {
  return (
    <div className="glass-soft rounded-xl border border-white/8 p-3">
      <p className="text-[0.7rem] font-medium text-foreground-subtle">{label}</p>
      <p className={`mt-0.5 font-mono text-lg font-bold ${METRIC_TONES[tone]}`} dir="ltr">
        {value}
      </p>
    </div>
  );
}

function StepChip({ index, label, active }: { index: number; label: string; active: boolean }) {
  return (
    <li
      className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-indigo-400/40 bg-indigo-500/15 text-indigo-200'
          : 'border-white/10 bg-white/4 text-foreground-subtle'
      }`}
    >
      <span
        aria-hidden="true"
        className={`font-mono text-[0.65rem] font-bold ${
          active ? 'text-indigo-300' : 'text-foreground-subtle/70'
        }`}
      >
        {index}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </li>
  );
}

function StepArrow() {
  return (
    <li aria-hidden="true" className="shrink-0 text-foreground-subtle/40">
      <ChevronLeft className="h-4 w-4" />
    </li>
  );
}

function OrderChip({ order, active = false }: { order: number; active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold ${
        active
          ? 'border-indigo-400/40 bg-indigo-500/20 text-indigo-200'
          : 'border-white/10 bg-white/5 text-foreground-subtle'
      }`}
    >
      {order}
    </span>
  );
}

function PanelHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/25 text-indigo-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_20px_-6px_rgba(99,102,241,0.5)]"
        >
          {icon}
        </span>
        <div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          {subtitle ? <p className="text-xs text-foreground-subtle">{subtitle}</p> : null}
        </div>
      </div>
      {actions}
    </header>
  );
}

export function CurriculumPage() {
  const { showToast } = useToast();
  const [grades, setGrades] = useState<Grade[] | null>(null);
  const [gradesError, setGradesError] = useState(false);
  const [selectedGradeId, setSelectedGradeId] = useState('');

  const [units, setUnits] = useState<Unit[] | null>(null);
  const [deletedUnits, setDeletedUnits] = useState<Unit[] | null>(null);
  const [unitsError, setUnitsError] = useState(false);
  const [showDeletedUnits, setShowDeletedUnits] = useState(false);

  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [deletedLessons, setDeletedLessons] = useState<Lesson[] | null>(null);
  const [lessonsError, setLessonsError] = useState(false);
  const [showDeletedLessons, setShowDeletedLessons] = useState(false);

  const [unitName, setUnitName] = useState('');
  const [unitOrder, setUnitOrder] = useState('0');
  const [unitCreateError, setUnitCreateError] = useState<string | null>(null);
  const [unitCreateBusy, setUnitCreateBusy] = useState(false);

  const [editingUnit, setEditingUnit] = useState<PendingUnitEdit>(null);
  const [editUnitName, setEditUnitName] = useState('');
  const [editUnitOrder, setEditUnitOrder] = useState('0');
  const [editUnitError, setEditUnitError] = useState<string | null>(null);
  const [editUnitBusy, setEditUnitBusy] = useState(false);

  const [deletingUnit, setDeletingUnit] = useState<PendingUnitDelete>(null);
  const [deleteUnitBusy, setDeleteUnitBusy] = useState(false);
  const [restoringUnitId, setRestoringUnitId] = useState<string | null>(null);

  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDescription, setLessonDescription] = useState('');
  const [lessonOrder, setLessonOrder] = useState('0');
  const [lessonCreateError, setLessonCreateError] = useState<string | null>(null);
  const [lessonCreateBusy, setLessonCreateBusy] = useState(false);

  const [editingLesson, setEditingLesson] = useState<PendingLessonEdit>(null);
  const [editLessonTitle, setEditLessonTitle] = useState('');
  const [editLessonDescription, setEditLessonDescription] = useState('');
  const [editLessonOrder, setEditLessonOrder] = useState('0');
  const [editLessonError, setEditLessonError] = useState<string | null>(null);
  const [editLessonBusy, setEditLessonBusy] = useState(false);

  const [deletingLesson, setDeletingLesson] = useState<PendingLessonDelete>(null);
  const [deleteLessonBusy, setDeleteLessonBusy] = useState(false);
  const [togglingLessonId, setTogglingLessonId] = useState<string | null>(null);
  const [restoringLessonId, setRestoringLessonId] = useState<string | null>(null);

  const loadGrades = useCallback(async () => {
    setGradesError(false);
    try {
      const active = await listGrades();
      setGrades(active);
      setSelectedGradeId((prev) => {
        if (active.some((grade) => grade.id === prev)) {
          return prev;
        }
        return active[0]?.id ?? '';
      });
    } catch {
      setGradesError(true);
    }
  }, []);

  useEffect(() => {
    void loadGrades();
  }, [loadGrades]);

  const loadUnits = useCallback(async () => {
    if (!selectedGradeId) {
      setUnits([]);
      setDeletedUnits([]);
      return;
    }
    setUnitsError(false);
    try {
      const [active, deleted] = await Promise.all([
        listUnitsForGrade(selectedGradeId),
        listDeletedUnitsForGrade(selectedGradeId),
      ]);
      setUnits(active);
      setDeletedUnits(deleted);
    } catch {
      setUnitsError(true);
    }
  }, [selectedGradeId]);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  const loadLessons = useCallback(async () => {
    if (!selectedUnitId) {
      setLessons([]);
      setDeletedLessons([]);
      return;
    }
    setLessonsError(false);
    try {
      const [active, deleted] = await Promise.all([
        listLessonsForUnit(selectedUnitId),
        listDeletedLessonsForUnit(selectedUnitId),
      ]);
      setLessons(active);
      setDeletedLessons(deleted);
    } catch {
      setLessonsError(true);
    }
  }, [selectedUnitId]);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  const handleCreateUnit = async () => {
    const name = unitName.trim();
    setUnitCreateError(null);
    if (!name) {
      setUnitCreateError('اسم الوحدة مطلوب');
      return;
    }
    if (!selectedGradeId) {
      setUnitCreateError('اختر صفًا أولاً');
      return;
    }
    setUnitCreateBusy(true);
    try {
      await createUnit({ gradeId: selectedGradeId, name, sortOrder: Number(unitOrder) || 0 });
      setUnitName('');
      showToast('تم إنشاء الوحدة بنجاح');
      await loadUnits();
    } catch (err) {
      setUnitCreateError(curriculumErrorMessage(err, true));
    } finally {
      setUnitCreateBusy(false);
    }
  };

  const openEditUnit = (unit: Unit) => {
    setEditingUnit({ unit });
    setEditUnitName(unit.name);
    setEditUnitOrder(String(unit.sort_order));
    setEditUnitError(null);
  };

  const handleEditUnit = async () => {
    if (!editingUnit) {
      return;
    }
    setEditUnitBusy(true);
    setEditUnitError(null);
    try {
      await updateUnit({
        unitId: editingUnit.unit.id,
        name: editUnitName.trim() ? editUnitName.trim() : null,
        sortOrder: editUnitOrder.trim() ? Number(editUnitOrder) : null,
      });
      showToast('تم تحديث الوحدة بنجاح');
      setEditingUnit(null);
      await loadUnits();
    } catch (err) {
      setEditUnitError(curriculumErrorMessage(err, true));
    } finally {
      setEditUnitBusy(false);
    }
  };

  const handleDeleteUnit = async () => {
    if (!deletingUnit) {
      return;
    }
    setDeleteUnitBusy(true);
    try {
      await deleteUnit(deletingUnit.unit.id);
      showToast('تم نقل الوحدة إلى المحذوفات');
      setDeletingUnit(null);
      if (selectedUnitId === deletingUnit.unit.id) {
        setSelectedUnitId(null);
      }
      await loadUnits();
    } catch (err) {
      showToast(curriculumErrorMessage(err, true), 'error');
      setDeletingUnit(null);
    } finally {
      setDeleteUnitBusy(false);
    }
  };

  const handleRestoreUnit = async (unit: Unit) => {
    setRestoringUnitId(unit.id);
    try {
      await restoreUnit(unit.id);
      showToast('تمت استعادة الوحدة');
      await loadUnits();
    } catch (err) {
      showToast(curriculumErrorMessage(err, true), 'error');
    } finally {
      setRestoringUnitId(null);
    }
  };

  const handleCreateLesson = async () => {
    const title = lessonTitle.trim();
    setLessonCreateError(null);
    if (!title) {
      setLessonCreateError('عنوان الدرس مطلوب');
      return;
    }
    if (!selectedUnitId) {
      setLessonCreateError('اختر وحدة أولاً');
      return;
    }
    setLessonCreateBusy(true);
    try {
      await createLesson({
        unitId: selectedUnitId,
        title,
        description: lessonDescription.trim() ? lessonDescription.trim() : null,
        sortOrder: Number(lessonOrder) || 0,
      });
      setLessonTitle('');
      setLessonDescription('');
      showToast('تم إنشاء الدرس بنجاح');
      await loadLessons();
    } catch (err) {
      setLessonCreateError(curriculumErrorMessage(err, false));
    } finally {
      setLessonCreateBusy(false);
    }
  };

  const openEditLesson = (lesson: Lesson) => {
    setEditingLesson({ lesson });
    setEditLessonTitle(lesson.title);
    setEditLessonDescription(lesson.description ?? '');
    setEditLessonOrder(String(lesson.sort_order));
    setEditLessonError(null);
  };

  const handleEditLesson = async () => {
    if (!editingLesson) {
      return;
    }
    setEditLessonBusy(true);
    setEditLessonError(null);
    try {
      await updateLesson({
        lessonId: editingLesson.lesson.id,
        title: editLessonTitle.trim() ? editLessonTitle.trim() : null,
        description: editLessonDescription.trim() ? editLessonDescription.trim() : null,
        sortOrder: editLessonOrder.trim() ? Number(editLessonOrder) : null,
      });
      showToast('تم تحديث الدرس بنجاح');
      setEditingLesson(null);
      await loadLessons();
    } catch (err) {
      setEditLessonError(curriculumErrorMessage(err, false));
    } finally {
      setEditLessonBusy(false);
    }
  };

  const handleDeleteLesson = async () => {
    if (!deletingLesson) {
      return;
    }
    setDeleteLessonBusy(true);
    try {
      await softDeleteLesson(deletingLesson.lesson.id);
      showToast('تم نقل الدرس إلى المحذوفات');
      setDeletingLesson(null);
      await loadLessons();
    } catch (err) {
      showToast(curriculumErrorMessage(err, false), 'error');
      setDeletingLesson(null);
    } finally {
      setDeleteLessonBusy(false);
    }
  };

  const handleRestoreLesson = async (lesson: Lesson) => {
    setRestoringLessonId(lesson.id);
    try {
      await restoreLesson(lesson.id);
      showToast('تمت استعادة الدرس');
      await loadLessons();
    } catch (err) {
      showToast(curriculumErrorMessage(err, false), 'error');
    } finally {
      setRestoringLessonId(null);
    }
  };

  const handleToggleLessonStatus = async (lesson: Lesson) => {
    setTogglingLessonId(lesson.id);
    try {
      if (lesson.status === 'published') {
        await hideLesson(lesson.id);
        showToast('تم إخفاء الدرس');
      } else {
        await publishLesson(lesson.id);
        showToast('تم نشر الدرس');
      }
      await loadLessons();
    } catch (err) {
      showToast(curriculumErrorMessage(err, false), 'error');
    } finally {
      setTogglingLessonId(null);
    }
  };

  const selectedGradeName = grades?.find((grade) => grade.id === selectedGradeId)?.name;
  const publishedLessonsCount = lessons?.filter((lesson) => lesson.status === 'published').length;
  const metricValue = (value: number | undefined | null) =>
    value === null || value === undefined ? '…' : value;

  return (
    <LayoutShell
      title="إدارة المنهج"
      subtitle="مركز عمليات — جهّز الصف، أدر الوحدات، انشر الدروس"
      variant="sidebar"
      nav={<StaffNav />}
    >
      <div className="flex flex-col gap-4">
        <section className="glass-card spotlight-card rise relative overflow-hidden p-4 sm:p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -end-24 -top-28 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-28 -start-24 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl"
          />

          <div className="relative flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 text-white shadow-[0_0_26px_-6px_rgba(129,140,248,0.85)]"
                >
                  <Radar className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-base font-bold text-foreground sm:text-lg">
                    إدارة الصفوف والوحدات
                  </h2>
                  <p className="text-xs text-foreground-subtle sm:text-sm">
                    تحكم كامل في الصفوف والوحدات والدروس
                  </p>
                </div>
              </div>
            </div>

            {gradesError ? (
              <ErrorState message="تعذر تحميل الصفوف" onRetry={() => void loadGrades()} />
            ) : grades === null ? (
              <div className="space-y-3" aria-hidden="true">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full max-w-sm" />
              </div>
            ) : grades.length === 0 ? (
              <EmptyState
                title="لا توجد صفوف نشطة"
                description="أنشئ صفًا أولاً من صفحة إدارة الصفوف لبدء بناء المنهج."
              />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Select
                    label="الصف"
                    name="curriculum-grade"
                    value={selectedGradeId}
                    onChange={(event) => {
                      setSelectedGradeId(event.target.value);
                      setSelectedUnitId(null);
                    }}
                    className="w-full sm:max-w-xs"
                  >
                    {grades.map((grade) => (
                      <option key={grade.id} value={grade.id}>
                        {grade.name}
                      </option>
                    ))}
                  </Select>

                  <ol aria-label="مسار التحكم" className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                    <StepChip
                      index={1}
                      label={selectedGradeName ?? 'الصف المختار'}
                      active={Boolean(selectedGradeId)}
                    />
                    <StepArrow />
                    <StepChip
                      index={2}
                      label={selectedUnitId ? 'الوحدة المحددة' : 'اختر وحدة'}
                      active={Boolean(selectedUnitId)}
                    />
                    <StepArrow />
                    <StepChip index={3} label="الدرس" active={Boolean(selectedUnitId)} />
                  </ol>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MetricTile label="وحدات نشطة" value={metricValue(units?.length)} tone="indigo" />
                  <MetricTile label="وحدات محذوفة" value={metricValue(deletedUnits?.length)} tone="rose" />
                  <MetricTile label="دروس" value={metricValue(lessons?.length)} tone="sky" />
                  <MetricTile
                    label="دروس منشورة"
                    value={metricValue(publishedLessonsCount)}
                    tone="emerald"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <section className="glass-card spotlight-card rise relative overflow-hidden p-4 sm:p-6">
            <PanelHeader
              icon={<Layers aria-hidden="true" className="h-5 w-5" />}
              title="وحدات الصف المختار"
              subtitle="أنشئ الوحدات وأعد تسميتها وترتيبها"
              actions={
                grades && grades.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowDeletedUnits((prev) => !prev)}
                    className="inline-flex items-center rounded-lg px-2 py-3 text-sm font-semibold text-foreground-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1"
                  >
                    {showDeletedUnits
                      ? 'إخفاء المحذوفة'
                      : `عرض المحذوفة (${deletedUnits?.length ?? 0})`}
                  </button>
                ) : undefined
              }
            />
            {!selectedGradeId || grades?.length === 0 ? (
              <EmptyState title="اختر صفًا لعرض وحداته" />
            ) : unitsError ? (
              <ErrorState message="تعذر تحميل الوحدات" onRetry={() => void loadUnits()} />
            ) : units === null ? (
              <ListSkeleton />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="glass-soft rounded-xl border border-indigo-400/15 bg-indigo-400/[0.04] p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="اسم الوحدة"
                      name="unit-name"
                      placeholder="مثال: الوحدة الأولى"
                      value={unitName}
                      error={unitCreateError ?? undefined}
                      onChange={(event) => setUnitName(event.target.value)}
                    />
                    <Input
                      label="الترتيب"
                      name="unit-sort-order"
                      type="number"
                      value={unitOrder}
                      onChange={(event) => setUnitOrder(event.target.value)}
                    />
                  </div>
                  <Button
                    loading={unitCreateBusy}
                    icon={<Plus aria-hidden="true" className="h-4 w-4" />}
                    onClick={() => void handleCreateUnit()}
                    className="mt-3 w-full sm:w-auto"
                  >
                    إضافة وحدة
                  </Button>
                </div>

                {units.length === 0 ? (
                  <EmptyState title="لا توجد وحدات بعد" description="أنشئ أول وحدة في هذا الصف." />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {units.map((unit) => {
                      const isSelected = selectedUnitId === unit.id;
                      return (
                        <li
                          key={unit.id}
                          data-testid={`unit-row-${unit.id}`}
                          className={`relative overflow-hidden rounded-xl border p-3 transition-all duration-200 ${
                            isSelected
                              ? 'border-indigo-400/40 bg-gradient-to-br from-indigo-500/[0.16] to-fuchsia-500/[0.12] shadow-[0_0_30px_-12px_rgba(99,102,241,0.6)]'
                              : 'glass-soft border-white/8 hover:border-indigo-400/20'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setSelectedUnitId(unit.id)}
                              className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1"
                            >
                              <OrderChip order={unit.sort_order} active={isSelected} />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-foreground">
                                  {unit.name}
                                </span>
                                <span className="mt-0.5 block text-xs text-foreground-subtle">
                                  {isSelected
                                    ? 'الوحدة المحددة — أدر دروسها في اللوحة التالية'
                                    : 'اضغط لاختيار هذه الوحدة'}
                                </span>
                              </span>
                            </button>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedUnitId(unit.id)}
                                className="text-primary-strong hover:bg-primary-soft hover:text-primary-strong"
                              >
                                اختر
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Pencil aria-hidden="true" className="h-4 w-4" />}
                                onClick={() => openEditUnit(unit)}
                              >
                                تعديل
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                                onClick={() => setDeletingUnit({ unit })}
                                className="text-error hover:bg-rose-500/10 hover:text-error"
                              >
                                حذف
                              </Button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {showDeletedUnits ? (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-foreground-muted">
                      الوحدات المحذوفة
                    </h3>
                    {deletedUnits === null ? (
                      <ListSkeleton rows={1} />
                    ) : deletedUnits.length === 0 ? (
                      <p className="text-sm text-foreground-subtle">لا توجد وحدات محذوفة.</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {deletedUnits.map((unit) => (
                          <li
                            key={unit.id}
                            data-testid={`deleted-unit-row-${unit.id}`}
                            className="glass-soft flex items-center justify-between gap-3 rounded-xl border border-white/8 p-3"
                          >
                            <span className="truncate text-sm text-foreground-muted">
                              {unit.name}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleRestoreUnit(unit)}
                              disabled={restoringUnitId === unit.id}
                              className="shrink-0 text-primary-strong hover:bg-primary-soft hover:text-primary-strong"
                            >
                              {restoringUnitId === unit.id ? 'جاري الاستعادة...' : 'استعادة'}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="glass-card spotlight-card rise relative overflow-hidden p-4 sm:p-6">
            <PanelHeader
              icon={<BookOpen aria-hidden="true" className="h-5 w-5" />}
              title="دروس الوحدة المختارة"
              subtitle="أنشئ الدروس وأدر نشرها وإخفاءها"
              actions={
                selectedUnitId ? (
                  <button
                    type="button"
                    onClick={() => setShowDeletedLessons((prev) => !prev)}
                    className="inline-flex items-center rounded-lg px-2 py-3 text-sm font-semibold text-foreground-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1"
                  >
                    {showDeletedLessons
                      ? 'إخفاء المحذوفة'
                      : `عرض المحذوفة (${deletedLessons?.length ?? 0})`}
                  </button>
                ) : undefined
              }
            />
            {!selectedUnitId ? (
              <EmptyState title="اختر وحدة لعرض دروسها" />
            ) : lessonsError ? (
              <ErrorState message="تعذر تحميل الدروس" onRetry={() => void loadLessons()} />
            ) : lessons === null ? (
              <ListSkeleton />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="glass-soft rounded-xl border border-sky-400/15 bg-sky-400/[0.04] p-3">
                  <Input
                    label="عنوان الدرس"
                    name="lesson-title"
                    placeholder="مثال: الدرس الأول"
                    value={lessonTitle}
                    error={lessonCreateError ?? undefined}
                    onChange={(event) => setLessonTitle(event.target.value)}
                  />
                  <Input
                    label="الوصف"
                    name="lesson-description"
                    value={lessonDescription}
                    onChange={(event) => setLessonDescription(event.target.value)}
                    className="mt-3"
                  />
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input
                      label="الترتيب"
                      name="lesson-sort-order"
                      type="number"
                      value={lessonOrder}
                      onChange={(event) => setLessonOrder(event.target.value)}
                    />
                    <div className="sm:mt-6">
                      <Button
                        loading={lessonCreateBusy}
                        icon={<Plus aria-hidden="true" className="h-4 w-4" />}
                        onClick={() => void handleCreateLesson()}
                        className="w-full sm:w-auto"
                      >
                        إضافة درس
                      </Button>
                    </div>
                  </div>
                </div>

                {lessons.length === 0 ? (
                  <EmptyState title="لا توجد دروس بعد" description="أنشئ أول درس في هذه الوحدة." />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {lessons.map((lesson) => (
                      <li
                        key={lesson.id}
                        data-testid={`lesson-row-${lesson.id}`}
                        className="glass-soft rounded-xl border border-white/8 p-3 transition-all duration-200 hover:border-sky-400/20"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <OrderChip order={lesson.sort_order} />
                              <span className="truncate text-sm font-medium text-foreground">
                                {lesson.title}
                              </span>
                              <LessonStatusBadge status={lesson.status} />
                            </div>
                            <p className="mt-1 text-xs text-foreground-subtle">
                              ترتيب {lesson.sort_order}
                              {lesson.description ? ` — ${lesson.description}` : ''}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              {lesson.status === 'published' ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<EyeOff aria-hidden="true" className="h-4 w-4" />}
                                  onClick={() => void handleToggleLessonStatus(lesson)}
                                  disabled={togglingLessonId === lesson.id}
                                  className="text-warning hover:bg-amber-500/10 hover:text-warning"
                                >
                                  {togglingLessonId === lesson.id ? 'جاري...' : 'إخفاء'}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void handleToggleLessonStatus(lesson)}
                                  disabled={togglingLessonId === lesson.id}
                                  className="text-primary-strong hover:bg-primary-soft hover:text-primary-strong"
                                >
                                  {togglingLessonId === lesson.id ? 'جاري...' : 'نشر'}
                                </Button>
                              )}
                              <Link
                                to={`/walid/lessons/${lesson.id}`}
                                className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-info transition-colors hover:bg-sky-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 sm:h-10"
                              >
                                <Upload aria-hidden="true" className="h-4 w-4" />
                                الملفات
                              </Link>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Pencil aria-hidden="true" className="h-4 w-4" />}
                                onClick={() => openEditLesson(lesson)}
                              >
                                تعديل
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                                onClick={() => setDeletingLesson({ lesson })}
                                className="text-error hover:bg-rose-500/10 hover:text-error"
                              >
                                حذف
                              </Button>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {showDeletedLessons ? (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-foreground-muted">
                      الدروس المحذوفة
                    </h3>
                    {deletedLessons === null ? (
                      <ListSkeleton rows={1} />
                    ) : deletedLessons.length === 0 ? (
                      <p className="text-sm text-foreground-subtle">لا توجد دروس محذوفة.</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {deletedLessons.map((lesson) => (
                          <li
                            key={lesson.id}
                            data-testid={`deleted-lesson-row-${lesson.id}`}
                            className="glass-soft flex items-center justify-between gap-3 rounded-xl border border-white/8 p-3"
                          >
                            <span className="truncate text-sm text-foreground-muted">
                              {lesson.title}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleRestoreLesson(lesson)}
                              disabled={restoringLessonId === lesson.id}
                              className="shrink-0 text-primary-strong hover:bg-primary-soft hover:text-primary-strong"
                            >
                              {restoringLessonId === lesson.id ? 'جاري الاستعادة...' : 'استعادة'}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>

      <Modal
        open={editingUnit !== null}
        title={editingUnit ? `تعديل الوحدة: ${editingUnit.unit.name}` : ''}
        description="قم بتعديل اسم الوحدة أو ترتيبها."
        confirmLabel="حفظ"
        loading={editUnitBusy}
        onConfirm={() => void handleEditUnit()}
        onCancel={() => {
          if (!editUnitBusy) {
            setEditingUnit(null);
          }
        }}
      >
        <div className="mt-4 flex flex-col gap-3">
          <Input
            label="اسم الوحدة"
            name="edit-unit-name"
            value={editUnitName}
            error={editUnitError ?? undefined}
            onChange={(event) => setEditUnitName(event.target.value)}
          />
          <Input
            label="الترتيب"
            name="edit-unit-order"
            type="number"
            value={editUnitOrder}
            onChange={(event) => setEditUnitOrder(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={deletingUnit !== null}
        title={deletingUnit ? `حذف الوحدة: ${deletingUnit.unit.name}` : ''}
        description="سيتم نقل الوحدة ودروسها إلى المحذوفات ولن تظهر في المنهج، ويمكنك استعادتها لاحقًا."
        confirmLabel="نعم، حذف"
        danger
        loading={deleteUnitBusy}
        onConfirm={() => void handleDeleteUnit()}
        onCancel={() => {
          if (!deleteUnitBusy) {
            setDeletingUnit(null);
          }
        }}
      />

      <Modal
        open={editingLesson !== null}
        title={editingLesson ? `تعديل الدرس: ${editingLesson.lesson.title}` : ''}
        description="قم بتعديل عنوان الدرس أو وصفه أو ترتيبه."
        confirmLabel="حفظ"
        loading={editLessonBusy}
        onConfirm={() => void handleEditLesson()}
        onCancel={() => {
          if (!editLessonBusy) {
            setEditingLesson(null);
          }
        }}
      >
        <div className="mt-4 flex flex-col gap-3">
          <Input
            label="عنوان الدرس"
            name="edit-lesson-title"
            value={editLessonTitle}
            error={editLessonError ?? undefined}
            onChange={(event) => setEditLessonTitle(event.target.value)}
          />
          <Input
            label="الوصف"
            name="edit-lesson-description"
            value={editLessonDescription}
            onChange={(event) => setEditLessonDescription(event.target.value)}
          />
          <Input
            label="الترتيب"
            name="edit-lesson-order"
            type="number"
            value={editLessonOrder}
            onChange={(event) => setEditLessonOrder(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={deletingLesson !== null}
        title={deletingLesson ? `حذف الدرس: ${deletingLesson.lesson.title}` : ''}
        description="سيتم نقل الدرس وملفاته إلى المحذوفات ولن يظهر للطلاب، ويمكنك استعادته لاحقًا."
        confirmLabel="نعم، حذف"
        danger
        loading={deleteLessonBusy}
        onConfirm={() => void handleDeleteLesson()}
        onCancel={() => {
          if (!deleteLessonBusy) {
            setDeletingLesson(null);
          }
        }}
      />
    </LayoutShell>
  );
}
