import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EyeOff, Pencil, Plus, Trash2, Upload } from 'lucide-react';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DirectionalArrow } from '../../components/DirectionalArrow';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { LessonStatusBadge } from '../../components/LessonStatusBadge';
import { Modal } from '../../components/Modal';
import { RoleNav } from '../../components/RoleNav';
import { useToast } from '../../components/Toast';
import {
  createLesson,
  getUnitById,
  hideLesson,
  listDeletedLessonsForUnit,
  listLessonsForUnit,
  publishLesson,
  restoreLesson,
  softDeleteLesson,
  updateLesson,
} from '../../data/rpc';
import type { Lesson, Unit } from '../../types/database';
import { ListSkeleton, OrderChip, curriculumErrorMessage } from './curriculumShared';

type PendingLessonEdit = { lesson: Lesson } | null;
type PendingLessonDelete = { lesson: Lesson } | null;

export function CurriculumLessonsPage() {
  const { gradeId, unitId } = useParams<{ gradeId: string; unitId: string }>();
  const { showToast } = useToast();

  const [unit, setUnit] = useState<Unit | null | undefined>(undefined);
  const [unitError, setUnitError] = useState(false);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [deletedLessons, setDeletedLessons] = useState<Lesson[] | null>(null);
  const [lessonsError, setLessonsError] = useState(false);
  const [showDeletedLessons, setShowDeletedLessons] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDescription, setLessonDescription] = useState('');
  const [lessonOrder, setLessonOrder] = useState('0');
  const [lessonIsTrial, setLessonIsTrial] = useState(false);
  const [lessonCreateError, setLessonCreateError] = useState<string | null>(null);
  const [lessonCreateBusy, setLessonCreateBusy] = useState(false);

  const [editingLesson, setEditingLesson] = useState<PendingLessonEdit>(null);
  const [editLessonTitle, setEditLessonTitle] = useState('');
  const [editLessonDescription, setEditLessonDescription] = useState('');
  const [editLessonOrder, setEditLessonOrder] = useState('0');
  const [editLessonIsTrial, setEditLessonIsTrial] = useState(false);
  const [editLessonError, setEditLessonError] = useState<string | null>(null);
  const [editLessonBusy, setEditLessonBusy] = useState(false);

  const [deletingLesson, setDeletingLesson] = useState<PendingLessonDelete>(null);
  const [deleteLessonBusy, setDeleteLessonBusy] = useState(false);
  const [togglingLessonId, setTogglingLessonId] = useState<string | null>(null);
  const [restoringLessonId, setRestoringLessonId] = useState<string | null>(null);

  const loadUnit = useCallback(async () => {
    if (!unitId) {
      setUnit(null);
      return;
    }
    setUnitError(false);
    try {
      setUnit(await getUnitById(unitId));
    } catch {
      setUnitError(true);
    }
  }, [unitId]);

  const loadLessons = useCallback(async () => {
    if (!unitId) {
      setLessons([]);
      setDeletedLessons([]);
      return;
    }
    setLessonsError(false);
    try {
      const [active, deleted] = await Promise.all([
        listLessonsForUnit(unitId),
        listDeletedLessonsForUnit(unitId),
      ]);
      setLessons(active);
      setDeletedLessons(deleted);
    } catch {
      setLessonsError(true);
    }
  }, [unitId]);

  useEffect(() => {
    void loadUnit();
    void loadLessons();
  }, [loadUnit, loadLessons]);

  const resetCreateForm = () => {
    setLessonTitle('');
    setLessonDescription('');
    setLessonOrder('0');
    setLessonIsTrial(false);
    setLessonCreateError(null);
  };

  const openCreate = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  const handleCreateLesson = async () => {
    const title = lessonTitle.trim();
    setLessonCreateError(null);
    if (!title) {
      setLessonCreateError('عنوان الدرس مطلوب');
      return;
    }
    if (!unitId) {
      setLessonCreateError('اختر وحدة أولاً');
      return;
    }
    setLessonCreateBusy(true);
    try {
      await createLesson({
        unitId,
        title,
        description: lessonDescription.trim() ? lessonDescription.trim() : null,
        sortOrder: Number(lessonOrder) || 0,
        isTrial: lessonIsTrial,
      });
      setCreateOpen(false);
      resetCreateForm();
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
    setEditLessonIsTrial(lesson.is_trial === true);
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
        isTrial: editLessonIsTrial,
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

  return (
    <LayoutShell
      title={unit ? `دروس ${unit.name}` : 'دروس الوحدة'}
      subtitle="أنشئ الدروس وأدر نشرها وإخفاءها، ثم أضف ملفاتها"
      variant="sidebar"
      nav={<RoleNav />}
      actions={
        <Link
          to={`/walid/curriculum/${gradeId ?? ''}`}
          className="glass-soft inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 sm:h-10"
        >
          <DirectionalArrow direction="back" />
          العودة إلى الوحدات
        </Link>
      }
    >
      {unitError ? (
        <ErrorState message="تعذر تحميل بيانات الوحدة" onRetry={() => void loadUnit()} />
      ) : unit === undefined ? (
        <ListSkeleton />
      ) : unit === null ? (
        <ErrorState message="الوحدة غير موجودة أو أنها محذوفة" />
      ) : (
        <Card
          title="دروس الوحدة"
          subtitle={`${unit.name} — اختر درسًا لإضافة ملفاته`}
          actions={
            <Button icon={<Plus aria-hidden="true" className="h-4 w-4" />} onClick={openCreate}>
              إضافة درس
            </Button>
          }
        >
          {lessonsError ? (
            <ErrorState message="تعذر تحميل الدروس" onRetry={() => void loadLessons()} />
          ) : lessons === null ? (
            <ListSkeleton />
          ) : lessons.length === 0 ? (
            <EmptyState title="لا توجد دروس بعد" description="أنشئ أول درس في هذه الوحدة." />
          ) : (
            <ul className="flex flex-col gap-3">
              {lessons.map((lesson) => (
                <li
                  key={lesson.id}
                  data-testid={`lesson-row-${lesson.id}`}
                  className="glass-soft group flex flex-col overflow-hidden rounded-2xl border border-white/8 transition-all duration-200 hover:border-sky-400/20 hover:shadow-[0_8px_24px_-12px_rgba(56,189,248,0.15)]"
                >
                  <div className="px-4 py-3.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <OrderChip order={lesson.sort_order} />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-5 text-foreground sm:flex-none">
                        {lesson.title}
                      </span>
                      {lesson.is_trial ? (
                        <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                          مجاني
                        </span>
                      ) : null}
                      <LessonStatusBadge status={lesson.status} />
                    </div>
                    {lesson.description ? (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-foreground-subtle sm:truncate">
                        {lesson.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2 border-t border-white/[0.06] bg-white/[0.02] px-2.5 py-2.5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-3">
                    <Link
                      to={`/walid/lessons/${lesson.id}`}
                      className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 px-4 text-sm font-bold text-white shadow-[0_4px_14px_-4px_rgba(56,189,248,0.5)] transition-all duration-200 hover:brightness-[1.07] hover:shadow-[0_6px_20px_-6px_rgba(56,189,248,0.6)] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 sm:h-9 sm:w-auto sm:px-3.5 sm:text-[13px]"
                    >
                      <Upload aria-hidden="true" className="h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" />
                      الملفات
                    </Link>
                    <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-1">
                      {lesson.status === 'published' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<EyeOff aria-hidden="true" className="h-3.5 w-3.5" />}
                          onClick={() => void handleToggleLessonStatus(lesson)}
                          disabled={togglingLessonId === lesson.id}
                          className="h-9 justify-center whitespace-nowrap rounded-xl border border-amber-400/15 bg-amber-500/5 px-0 text-xs font-semibold text-amber-300 hover:border-amber-400/25 hover:bg-amber-500/10 hover:text-amber-200 sm:h-8 sm:w-auto sm:px-3 sm:text-xs"
                        >
                          {togglingLessonId === lesson.id ? '...' : 'إخفاء'}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleToggleLessonStatus(lesson)}
                          disabled={togglingLessonId === lesson.id}
                          className="h-9 justify-center whitespace-nowrap rounded-xl border border-indigo-400/15 bg-indigo-500/5 px-0 text-xs font-semibold text-indigo-300 hover:border-indigo-400/25 hover:bg-indigo-500/10 hover:text-indigo-200 sm:h-8 sm:w-auto sm:px-3 sm:text-xs"
                        >
                          {togglingLessonId === lesson.id ? '...' : 'نشر'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil aria-hidden="true" className="h-3.5 w-3.5" />}
                        onClick={() => openEditLesson(lesson)}
                        className="h-9 justify-center whitespace-nowrap rounded-xl border border-white/8 bg-white/[0.03] px-0 text-xs font-semibold text-foreground-muted hover:border-white/12 hover:bg-white/8 hover:text-foreground sm:h-8 sm:w-auto sm:px-3 sm:text-xs"
                      >
                        تعديل
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />}
                        onClick={() => setDeletingLesson({ lesson })}
                        className="h-9 justify-center whitespace-nowrap rounded-xl border border-rose-400/10 bg-rose-500/5 px-0 text-xs font-semibold text-rose-300 hover:border-rose-400/20 hover:bg-rose-500/10 hover:text-rose-200 sm:h-8 sm:w-auto sm:px-3 sm:text-xs"
                      >
                        حذف
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowDeletedLessons((prev) => !prev)}
              className="inline-flex items-center rounded-lg px-2 py-1 text-sm font-semibold text-foreground-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1"
            >
              {showDeletedLessons
                ? 'إخفاء المحذوفة'
                : `عرض المحذوفة (${deletedLessons?.length ?? 0})`}
            </button>
            {showDeletedLessons ? (
              deletedLessons === null ? (
                <ListSkeleton rows={1} />
              ) : deletedLessons.length === 0 ? (
                <p className="mt-2 text-sm text-foreground-subtle">لا توجد دروس محذوفة.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {deletedLessons.map((lesson) => (
                    <li
                      key={lesson.id}
                      data-testid={`deleted-lesson-row-${lesson.id}`}
                      className="glass-soft flex items-center justify-between gap-3 rounded-xl border border-white/8 p-3"
                    >
                      <span className="truncate text-sm text-foreground-muted">{lesson.title}</span>
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
              )
            ) : null}
          </div>
        </Card>
      )}

      <Modal
        open={createOpen}
        title="إضافة درس جديد"
        description="أنشئ درسًا جديدًا في هذه الوحدة."
        confirmLabel="إضافة"
        loading={lessonCreateBusy}
        onConfirm={() => void handleCreateLesson()}
        onCancel={() => {
          if (!lessonCreateBusy) {
            setCreateOpen(false);
          }
        }}
      >
        <div className="mt-4 flex flex-col gap-3">
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
          />
          <Input
            label="الترتيب"
            name="lesson-sort-order"
            type="number"
            value={lessonOrder}
            onChange={(event) => setLessonOrder(event.target.value)}
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground-muted">
            <input
              type="checkbox"
              name="lesson-is-trial"
              checked={lessonIsTrial}
              onChange={(event) => setLessonIsTrial(event.target.checked)}
              className="h-4 w-4 rounded border-border accent-[#818cf8]"
            />
            درس مجاني (تجريبي) — فيديو واحد يُفتح للطلاب بدون شراء لكل باب
          </label>
        </div>
      </Modal>

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
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground-muted">
            <input
              type="checkbox"
              name="edit-lesson-is-trial"
              checked={editLessonIsTrial}
              onChange={(event) => setEditLessonIsTrial(event.target.checked)}
              className="h-4 w-4 rounded border-border accent-[#818cf8]"
            />
            درس مجاني (تجريبي) — يُفتح للطلاب بدون شراء (واحد لكل باب)
          </label>
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
