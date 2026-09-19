import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ClipboardList, Pencil, Plus, Trash2, Trophy } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { Modal } from '../../components/Modal';
import { RoleNav } from '../../components/RoleNav';
import { Select } from '../../components/Select';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import {
  createGeneralExam,
  deleteExam,
  getRpcErrorCode,
  listGeneralExams,
  listGrades,
  publishGeneralExam,
  updateGeneralExam,
} from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type { GeneralExamRow, Grade } from '../../types/database';
import {
  GENERAL_EXAM_TIME_LABELS,
  fromDateTimeLocalValue,
  generalExamErrorMessage,
  getGeneralExamTimeState,
  toDateTimeLocalValue,
} from '../exams/generalExamUtils';

function statusBadge(exam: GeneralExamRow) {
  if (exam.status === 'draft') return <Badge variant="warning">مسودة</Badge>;
  if (exam.status === 'archived') return <Badge variant="neutral">مؤرشف</Badge>;
  const state = getGeneralExamTimeState(exam);
  if (state === 'upcoming') return <Badge variant="info">قادم</Badge>;
  if (state === 'live') return <Badge variant="success">جاري الآن</Badge>;
  if (state === 'ended') return <Badge variant="neutral">انتهى</Badge>;
  return <Badge variant="info">مفتوح</Badge>;
}

interface ExamFormState {
  title: string;
  gradeId: string;
  startsAt: string;
  endsAt: string;
  duration: string;
  passing: string;
  showLeaderboard: boolean;
}

const EMPTY_FORM: ExamFormState = {
  title: '',
  gradeId: '',
  startsAt: '',
  endsAt: '',
  duration: '60',
  passing: '50',
  showLeaderboard: true,
};

export function GeneralExamsPage() {
  const { showToast } = useToast();
  const [grades, setGrades] = useState<Grade[] | null>(null);
  const [filterGradeId, setFilterGradeId] = useState('');
  const [exams, setExams] = useState<GeneralExamRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<ExamFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const [editing, setEditing] = useState<GeneralExamRow | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [publishing, setPublishing] = useState<GeneralExamRow | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [deleting, setDeleting] = useState<GeneralExamRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const loadGrades = useCallback(async () => {
    try {
      const rows = await listGrades();
      setGrades(rows);
      setForm((prev) => (prev.gradeId ? prev : { ...prev, gradeId: rows[0]?.id ?? '' }));
    } catch {
      // non-fatal: filter simply stays "all"
    }
  }, []);

  const loadExams = useCallback(async () => {
    setLoadError(false);
    try {
      setExams(await listGeneralExams(filterGradeId || null));
    } catch {
      setExams(null);
      setLoadError(true);
    }
  }, [filterGradeId]);

  useEffect(() => {
    void loadGrades();
  }, [loadGrades]);
  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  const validateForm = (state: ExamFormState): string | null => {
    if (!state.title.trim()) return 'اكتب عنوان الامتحان';
    if (!state.gradeId) return 'اختر الصف';
    const starts = state.startsAt ? fromDateTimeLocalValue(state.startsAt) : null;
    const ends = state.endsAt ? fromDateTimeLocalValue(state.endsAt) : null;
    if (state.startsAt && !starts) return 'ميعاد البداية غير صالح';
    if (state.endsAt && !ends) return 'ميعاد النهاية غير صالح';
    if (starts && ends && ends <= starts) return 'ميعاد النهاية يجب أن يكون بعد ميعاد البداية';
    if (state.duration.trim()) {
      const duration = Number(state.duration);
      if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
        return 'المدة يجب أن تكون بين 5 و 480 دقيقة';
      }
    }
    const passing = Number(state.passing);
    if (!Number.isFinite(passing) || passing < 0 || passing > 100) {
      return 'درجة النجاح يجب أن تكون بين 0 و 100';
    }
    return null;
  };

  const handleCreate = async () => {
    const validation = validateForm(form);
    if (validation) {
      setFormError(validation);
      return;
    }
    setFormBusy(true);
    setFormError(null);
    try {
      await createGeneralExam({
        gradeId: form.gradeId,
        title: form.title.trim(),
        startsAt: form.startsAt ? fromDateTimeLocalValue(form.startsAt) : null,
        endsAt: form.endsAt ? fromDateTimeLocalValue(form.endsAt) : null,
        durationMinutes: form.duration.trim() ? Number(form.duration) : null,
        passingScore: Number(form.passing),
        showLeaderboard: form.showLeaderboard,
      });
      showToast('تم إنشاء الامتحان كمسودة', 'success');
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      await loadExams();
    } catch (error) {
      setFormError(generalExamErrorMessage(error));
    } finally {
      setFormBusy(false);
    }
  };

  const openEdit = (exam: GeneralExamRow) => {
    setEditing(exam);
    setEditError(null);
    setForm({
      title: exam.title,
      gradeId: exam.grade_id,
      startsAt: toDateTimeLocalValue(exam.starts_at),
      endsAt: toDateTimeLocalValue(exam.ends_at),
      duration: exam.duration_minutes != null ? String(exam.duration_minutes) : '',
      passing: String(exam.passing_score),
      showLeaderboard: exam.show_leaderboard,
    });
  };

  const handleEdit = async () => {
    if (!editing) return;
    const validation = validateForm(form);
    if (validation) {
      setEditError(validation);
      return;
    }
    setEditBusy(true);
    setEditError(null);
    try {
      await updateGeneralExam({
        examId: editing.id,
        title: form.title.trim(),
        startsAt: form.startsAt ? fromDateTimeLocalValue(form.startsAt) : null,
        endsAt: form.endsAt ? fromDateTimeLocalValue(form.endsAt) : null,
        durationMinutes: form.duration.trim() ? Number(form.duration) : null,
        passingScore: Number(form.passing),
        showLeaderboard: form.showLeaderboard,
        clearWindow: !form.startsAt && !form.endsAt,
      });
      showToast('تم حفظ التعديلات', 'success');
      setEditing(null);
      await loadExams();
    } catch (error) {
      setEditError(generalExamErrorMessage(error));
    } finally {
      setEditBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!publishing) return;
    setPublishBusy(true);
    try {
      await publishGeneralExam(publishing.id);
      showToast('تم نشر الامتحان وإشعار طلاب الصف', 'success');
      setPublishing(null);
      await loadExams();
    } catch (error) {
      const code = getRpcErrorCode(error);
      showToast(
        code === 'exam_empty'
          ? 'أضف سؤالاً واحداً على الأقل قبل النشر (من صفحة الامتحان)'
          : generalExamErrorMessage(error),
        'error',
      );
    } finally {
      setPublishBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteExam(deleting.id);
      showToast('تم حذف الامتحان', 'success');
      setDeleting(null);
      await loadExams();
    } catch (error) {
      showToast(generalExamErrorMessage(error), 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleArchiveToggle = async (exam: GeneralExamRow) => {
    setRowBusyId(exam.id);
    try {
      await updateGeneralExam({
        examId: exam.id,
        status: exam.status === 'archived' ? 'draft' : 'archived',
      });
      showToast(exam.status === 'archived' ? 'تمت إعادة الامتحان للمسودات' : 'تم أرشفة الامتحان', 'success');
      await loadExams();
    } catch (error) {
      showToast(generalExamErrorMessage(error), 'error');
    } finally {
      setRowBusyId(null);
    }
  };

  const renderFormFields = (error: string | null) => (
    <div className="flex flex-col gap-3">
      <Input
        label="عنوان الامتحان"
        value={form.title}
        onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
        placeholder="مثال: امتحان شامل — الفصل الأول"
        maxLength={120}
      />
      <Select
        label="الصف"
        value={form.gradeId}
        onChange={(event) => setForm((prev) => ({ ...prev, gradeId: event.target.value }))}
        disabled={editing !== null}
      >
        {(grades ?? []).map((grade) => (
          <option key={grade.id} value={grade.id}>
            {grade.name}
          </option>
        ))}
      </Select>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="ميعاد البداية"
          type="datetime-local"
          value={form.startsAt}
          onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))}
        />
        <Input
          label="ميعاد النهاية"
          type="datetime-local"
          value={form.endsAt}
          onChange={(event) => setForm((prev) => ({ ...prev, endsAt: event.target.value }))}
          hint="بعدها تظهر الإجابات الصحيحة للطلاب"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="المدة بالدقائق (اختياري)"
          type="number"
          inputMode="numeric"
          min={5}
          max={480}
          value={form.duration}
          onChange={(event) => setForm((prev) => ({ ...prev, duration: event.target.value }))}
          hint="المؤقت يُحسب من سيرفر المنصة"
        />
        <Input
          label="درجة النجاح %"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          value={form.passing}
          onChange={(event) => setForm((prev) => ({ ...prev, passing: event.target.value }))}
        />
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-3 text-sm font-bold">
        <span className="flex items-center gap-2">
          <Trophy aria-hidden="true" className="h-4 w-4 text-amber-300" />
          إظهار قايمة الأوائل للطلاب
        </span>
        <input
          type="checkbox"
          checked={form.showLeaderboard}
          onChange={(event) => setForm((prev) => ({ ...prev, showLeaderboard: event.target.checked }))}
          className="h-5 w-5 accent-indigo-500"
        />
      </label>
      {error ? <p role="alert" className="text-sm font-bold text-rose-300">{error}</p> : null}
    </div>
  );

  return (
    <LayoutShell
      title="الامتحانات العامة"
      subtitle="امتحانات مستقلة لكل صف بميعاد ومؤقت وقايمة أوائل"
      variant="sidebar"
      nav={<RoleNav />}
      actions={
        <Button
          size="sm"
          icon={<Plus aria-hidden="true" className="h-4 w-4" />}
          onClick={() => {
            setForm({ ...EMPTY_FORM, gradeId: filterGradeId || grades?.[0]?.id || '' });
            setFormError(null);
            setCreateOpen(true);
          }}
        >
          امتحان جديد
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <section className="glass-card spotlight-card relative overflow-hidden p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 text-white shadow-[0_0_26px_-6px_rgba(129,140,248,0.85)]"
              >
                <ClipboardList className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-base font-bold text-foreground sm:text-lg">امتحانات الصفوف</h2>
                <p className="text-xs text-foreground-subtle sm:text-sm">أنشئ مسودة، أضف الأسئلة، ثم انشر لطلاب الصف</p>
              </div>
            </div>
            <div className="w-full sm:w-64">
              <Select
                label="فلتر الصف"
                value={filterGradeId}
                onChange={(event) => setFilterGradeId(event.target.value)}
              >
                <option value="">كل الصفوف</option>
                {(grades ?? []).map((grade) => (
                  <option key={grade.id} value={grade.id}>
                    {grade.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </section>

        {loadError ? (
          <ErrorState message="تعذر تحميل الامتحانات" onRetry={() => void loadExams()} />
        ) : exams === null ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </div>
        ) : exams.length === 0 ? (
          <EmptyState
            title="لا توجد امتحانات عامة"
            description="أنشئ أول امتحان لصف من زر «امتحان جديد» بالأعلى."
            action={
              <Button
                size="sm"
                icon={<Plus aria-hidden="true" className="h-4 w-4" />}
                onClick={() => {
                  setForm({ ...EMPTY_FORM, gradeId: filterGradeId || grades?.[0]?.id || '' });
                  setFormError(null);
                  setCreateOpen(true);
                }}
              >
                امتحان جديد
              </Button>
            }
          />
        ) : (
          <ol className="flex flex-col gap-3">
            {exams.map((exam) => (
              <li key={exam.id}>
                <Card padding="sm">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-display text-base font-bold text-foreground">{exam.title}</p>
                        <p className="mt-0.5 text-xs text-foreground-subtle">
                          {exam.grade_name} • {GENERAL_EXAM_TIME_LABELS[getGeneralExamTimeState(exam)]}
                        </p>
                      </div>
                      {statusBadge(exam)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-muted">
                      <span className="flex items-center gap-1">
                        <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
                        {exam.starts_at ? formatDateTime(exam.starts_at) : 'بدون بداية'}
                        {' ← '}
                        {exam.ends_at ? formatDateTime(exam.ends_at) : 'بدون نهاية'}
                      </span>
                      <span>المدة: {exam.duration_minutes != null ? `${exam.duration_minutes} دقيقة` : 'مفتوحة'}</span>
                      <span>{exam.question_count} سؤال • {exam.attempt_count} محاولة</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link to={`/walid/general-exams/${exam.id}`}>
                        <Button size="sm" variant="secondary">فتح وإضافة الأسئلة</Button>
                      </Link>
                      {exam.status === 'draft' ? (
                        <Button size="sm" variant="outline" onClick={() => setPublishing(exam)}>
                          نشر لطلاب الصف
                        </Button>
                      ) : null}
                      {exam.status !== 'draft' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={rowBusyId === exam.id}
                          onClick={() => void handleArchiveToggle(exam)}
                        >
                          {exam.status === 'archived' ? 'إعادة للمسودات' : 'أرشفة'}
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" icon={<Pencil aria-hidden="true" className="h-4 w-4" />} onClick={() => openEdit(exam)}>
                          تعديل
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden="true" className="h-4 w-4" />} onClick={() => setDeleting(exam)}>
                        حذف
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Modal
        open={createOpen}
        title="امتحان عام جديد"
        description="سيُنشأ كمسودة — أضف الأسئلة من صفحة الامتحان ثم انشره."
        confirmLabel="إنشاء المسودة"
        loading={formBusy}
        onConfirm={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
      >
        {renderFormFields(formError)}
      </Modal>

      <Modal
        open={editing !== null}
        title="تعديل الامتحان"
        confirmLabel="حفظ"
        loading={editBusy}
        onConfirm={() => void handleEdit()}
        onCancel={() => setEditing(null)}
      >
        {renderFormFields(editError)}
      </Modal>

      <Modal
        open={publishing !== null}
        title="نشر الامتحان؟"
        description={
          publishing
            ? `سيظهر «${publishing.title}» لكل طلاب ${publishing.grade_name} وسيصلهم إشعار.`
            : undefined
        }
        confirmLabel="نشر"
        loading={publishBusy}
        onConfirm={() => void handlePublish()}
        onCancel={() => setPublishing(null)}
      />

      <Modal
        open={deleting !== null}
        title="حذف الامتحان؟"
        description={deleting ? `سيتم حذف «${deleting.title}» نهائياً من قوائم الطلاب.` : undefined}
        confirmLabel="حذف"
        danger
        loading={deleteBusy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </LayoutShell>
  );
}
