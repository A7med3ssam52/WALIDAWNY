import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { CheckCircle2, ClipboardList, Pencil, Plus, Timer, Trash2 } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { Skeleton } from '../../components/Skeleton';
import { RoleNav } from '../../components/RoleNav';
import { useToast } from '../../components/Toast';
import {
  createExam,
  createExamQuestion,
  deleteExam,
  deleteExamQuestion,
  getExamImageSignedUrls,
  getExamQuestions,
  getProfileName,
  getRpcErrorCode,
  gradeExam,
  listAttemptAnswers,
  listExamAttempts,
  listExams,
  listGrades,
  listLessonsForUnit,
  listUnitsForGrade,
  updateExam,
  updateExamQuestion,
  uploadExamImage,
  uploadExamImageBytes,
} from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type {
  Exam,
  ExamAnswer,
  ExamAttempt,
  ExamQuestion,
  Grade,
  Lesson,
  Unit,
} from '../../types/database';

const EXAM_ERROR_MESSAGES: Record<string, string> = {
  exam_not_found: 'الاختبار غير موجود',
  question_not_found: 'السؤال غير موجود',
  attempt_not_found: 'المحاولة غير موجودة',
  already_graded: 'تم تصحيح هذه المحاولة من قبل',
  invalid_scores: 'الدرجات المدخلة غير صالحة',
  access_denied: 'ليست لديك صلاحية',
  permission_denied: 'ليست لديك صلاحية',
};

function examErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && EXAM_ERROR_MESSAGES[code]) {
    return EXAM_ERROR_MESSAGES[code];
  }
  return 'تعذر تنفيذ العملية. حاول مرة أخرى';
}

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-md" />
      ))}
    </div>
  );
}

const CHOICE_LABELS = ['أ', 'ب', 'ج', 'د'];

type PendingExamEdit = { exam: Exam } | null;
type PendingExamDelete = { exam: Exam } | null;
type PendingQuestionEdit = { question: ExamQuestion } | null;
type PendingQuestionDelete = { question: ExamQuestion } | null;
type PendingGrade = { attempt: ExamAttempt } | null;

const EMPTY_CHOICES = ['', '', '', ''];

const EXAM_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
const EXAM_IMAGE_ERROR_MESSAGES: Record<string, string> = {
  file_too_large: 'حجم الصورة يتجاوز الحد المسموح (5 ميجابايت)',
  invalid_file_name: 'صيغة الصورة غير مدعومة (JPG/PNG/WebP فقط)',
  exam_not_found: 'الاختبار غير موجود',
  exam_deleted: 'الاختبار محذوف',
  upload_url_failed: 'فشل إنشاء رابط الرفع',
  exam_image_upload_failed: 'فشل رفع الصورة',
  network_error: 'تعذر الاتصال بالخادم',
  internal_error: 'حدث خطأ في الخادم',
};

function examImageErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && EXAM_IMAGE_ERROR_MESSAGES[code]) return EXAM_IMAGE_ERROR_MESSAGES[code];
  return 'تعذر رفع الصورة. حاول مرة أخرى';
}

async function uploadImageFile(examId: string, file: File): Promise<string> {
  const session = await uploadExamImage({ examId, fileName: file.name, fileSize: file.size });
  await uploadExamImageBytes(session.uploadUrl, file);
  return session.storage_path;
}

function isValidExamImage(file: File): string | null {
  const extOk = /\.(jpe?g|png|webp)$/i.test(file.name);
  const typeOk = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (!extOk || !typeOk) return 'يجب اختيار صورة بصيغة JPG أو PNG أو WebP فقط';
  if (file.size > EXAM_IMAGE_MAX_SIZE) return 'حجم الصورة يتجاوز الحد المسموح (5 ميجابايت)';
  return null;
}

export function ExamsPage() {
  const { showToast } = useToast();
  const [grades, setGrades] = useState<Grade[] | null>(null);
  const [gradesError, setGradesError] = useState(false);
  const [selectedGradeId, setSelectedGradeId] = useState('');
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [unitsError, setUnitsError] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [lessonsError, setLessonsError] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState('');

  const [exams, setExams] = useState<Exam[] | null>(null);
  const [examsError, setExamsError] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState('');

  const [questions, setQuestions] = useState<ExamQuestion[] | null>(null);
  const [attempts, setAttempts] = useState<ExamAttempt[] | null>(null);
  const [answersByAttempt, setAnswersByAttempt] = useState<Record<string, ExamAnswer[]>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [detailsError, setDetailsError] = useState(false);

  const [examTitle, setExamTitle] = useState('');
  const [examPassing, setExamPassing] = useState('50');
  const [examOrder, setExamOrder] = useState('0');
  const [examCreateError, setExamCreateError] = useState<string | null>(null);
  const [examCreateBusy, setExamCreateBusy] = useState(false);

  const [editingExam, setEditingExam] = useState<PendingExamEdit>(null);
  const [editExamTitle, setEditExamTitle] = useState('');
  const [editExamPassing, setEditExamPassing] = useState('50');
  const [editExamOrder, setEditExamOrder] = useState('0');
  const [editExamError, setEditExamError] = useState<string | null>(null);
  const [editExamBusy, setEditExamBusy] = useState(false);

  const [deletingExam, setDeletingExam] = useState<PendingExamDelete>(null);
  const [deleteExamBusy, setDeleteExamBusy] = useState(false);

  const [questionType, setQuestionType] = useState<'mcq' | 'essay'>('mcq');
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [questionChoices, setQuestionChoices] = useState<string[]>(EMPTY_CHOICES);
  const [questionCorrectIndex, setQuestionCorrectIndex] = useState('0');
  const [questionMaxScore, setQuestionMaxScore] = useState('1');
  const [questionOrder, setQuestionOrder] = useState('0');
  const [questionCreateError, setQuestionCreateError] = useState<string | null>(null);
  const [questionCreateBusy, setQuestionCreateBusy] = useState(false);
  const [questionPromptImageFile, setQuestionPromptImageFile] = useState<File | null>(null);
  const [questionChoiceImageFiles, setQuestionChoiceImageFiles] = useState<(File | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  const [editingQuestion, setEditingQuestion] = useState<PendingQuestionEdit>(null);
  const [editQuestionType, setEditQuestionType] = useState<'mcq' | 'essay'>('mcq');
  const [editQuestionPrompt, setEditQuestionPrompt] = useState('');
  const [editQuestionChoices, setEditQuestionChoices] = useState<string[]>(EMPTY_CHOICES);
  const [editQuestionCorrectIndex, setEditQuestionCorrectIndex] = useState('0');
  const [editQuestionMaxScore, setEditQuestionMaxScore] = useState('1');
  const [editQuestionOrder, setEditQuestionOrder] = useState('0');
  const [editQuestionError, setEditQuestionError] = useState<string | null>(null);
  const [editQuestionBusy, setEditQuestionBusy] = useState(false);
  const [editQuestionPromptImageFile, setEditQuestionPromptImageFile] = useState<File | null>(null);
  const [editQuestionPromptImagePath, setEditQuestionPromptImagePath] = useState<string | null>(null);
  const [editQuestionChoiceImageFiles, setEditQuestionChoiceImageFiles] = useState<(File | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const [editQuestionChoiceImagePaths, setEditQuestionChoiceImagePaths] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const [imageUrlsByQuestion, setImageUrlsByQuestion] = useState<
    Record<string, { promptUrl: string | null; choiceUrls: (string | null)[] | null }>
  >({});

  const [deletingQuestion, setDeletingQuestion] = useState<PendingQuestionDelete>(null);
  const [deleteQuestionBusy, setDeleteQuestionBusy] = useState(false);

  const [grading, setGrading] = useState<PendingGrade>(null);
  const [gradingScores, setGradingScores] = useState<Record<string, string>>({});
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [gradingBusy, setGradingBusy] = useState(false);

  const loadGrades = useCallback(async () => {
    setGradesError(false);
    try {
      const active = await listGrades();
      setGrades(active);
      setSelectedGradeId((prev) => (active.some((grade) => grade.id === prev) ? prev : (active[0]?.id ?? '')));
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
      return;
    }
    setUnitsError(false);
    try {
      setUnits(await listUnitsForGrade(selectedGradeId));
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
      return;
    }
    setLessonsError(false);
    try {
      const rows = await listLessonsForUnit(selectedUnitId);
      setLessons(rows.filter((row) => row.status === 'published'));
    } catch {
      setLessonsError(true);
    }
  }, [selectedUnitId]);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  const loadExams = useCallback(async () => {
    if (!selectedLessonId) {
      setExams([]);
      setQuestions([]);
      setAttempts([]);
      setSelectedExamId('');
      return;
    }
    setExamsError(false);
    try {
      const rows = await listExams(selectedLessonId);
      setExams(rows);
      setSelectedExamId((prev) => (rows.some((exam) => exam.id === prev) ? prev : (rows[0]?.id ?? '')));
    } catch {
      setExamsError(true);
    }
  }, [selectedLessonId]);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  const loadDetails = useCallback(async () => {
    if (!selectedExamId) {
      setQuestions([]);
      setAttempts([]);
      setAnswersByAttempt({});
      return;
    }
    setDetailsError(false);
    try {
      const [questionRows, attemptRows] = await Promise.all([
        getExamQuestions(selectedExamId),
        listExamAttempts(selectedExamId),
      ]);
      setQuestions(questionRows);
      setAttempts(attemptRows);
      // fetch signed URLs for question images (best-effort, never breaks the page)
      try {
        if (questionRows.some((q) => q.prompt_image_path || (q.choice_image_paths && q.choice_image_paths.some(Boolean)))) {
          const signed = await getExamImageSignedUrls(selectedExamId);
          const map: Record<string, { promptUrl: string | null; choiceUrls: (string | null)[] | null }> = {};
          for (const img of signed) {
            map[img.question_id] = { promptUrl: img.prompt_image_url, choiceUrls: img.choice_image_urls };
          }
          setImageUrlsByQuestion(map);
        } else {
          setImageUrlsByQuestion({});
        }
      } catch {
        setImageUrlsByQuestion({});
      }
      const [answerGroups, nameRows] = await Promise.all([
        Promise.all(attemptRows.map((attempt) => listAttemptAnswers(attempt.id))),
        Promise.all(attemptRows.map((attempt) => getProfileName(attempt.student_id))),
      ]);
      setAnswersByAttempt(
        Object.fromEntries(attemptRows.map((attempt, index) => [attempt.id, answerGroups[index]])),
      );
      setNames((prev) => {
        const next = { ...prev };
        attemptRows.forEach((attempt, index) => {
          next[attempt.student_id] = nameRows[index];
        });
        return next;
      });
    } catch {
      setDetailsError(true);
    }
  }, [selectedExamId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const handleCreateExam = async () => {
    const title = examTitle.trim();
    setExamCreateError(null);
    if (!title) {
      setExamCreateError('عنوان الاختبار مطلوب');
      return;
    }
    if (!selectedLessonId) {
      setExamCreateError('اختر درسًا أولاً');
      return;
    }
    setExamCreateBusy(true);
    try {
      await createExam({
        lessonId: selectedLessonId,
        title,
        sortOrder: Number(examOrder) || 0,
        passingScore: Math.max(0, Number(examPassing) || 0),
      });
      setExamTitle('');
      showToast('تم إنشاء الاختبار بنجاح');
      await loadExams();
    } catch (err) {
      setExamCreateError(examErrorMessage(err));
    } finally {
      setExamCreateBusy(false);
    }
  };

  const openEditExam = (exam: Exam) => {
    setEditingExam({ exam });
    setEditExamTitle(exam.title);
    setEditExamPassing(String(exam.passing_score));
    setEditExamOrder(String(exam.sort_order));
    setEditExamError(null);
  };

  const handleEditExam = async () => {
    if (!editingExam) {
      return;
    }
    setEditExamBusy(true);
    setEditExamError(null);
    try {
      await updateExam({
        examId: editingExam.exam.id,
        title: editExamTitle.trim() ? editExamTitle.trim() : null,
        sortOrder: editExamOrder.trim() ? Number(editExamOrder) : null,
        passingScore: editExamPassing.trim() ? Number(editExamPassing) : null,
      });
      showToast('تم تحديث الاختبار بنجاح');
      setEditingExam(null);
      await loadExams();
    } catch (err) {
      setEditExamError(examErrorMessage(err));
    } finally {
      setEditExamBusy(false);
    }
  };

  const handleDeleteExam = async () => {
    if (!deletingExam) {
      return;
    }
    const examId = deletingExam.exam.id;
    setDeleteExamBusy(true);
    try {
      await deleteExam(examId);
      showToast('تم حذف الاختبار');
      setDeletingExam(null);
      setImageUrlsByQuestion((prev) => {
        const next = { ...prev };
        delete next[examId];
        return next;
      });
      if (selectedExamId === examId) {
        setSelectedExamId('');
        setQuestions([]);
        setAttempts([]);
        setAnswersByAttempt({});
      }
      await loadExams();
    } catch (err) {
      showToast(examErrorMessage(err), 'error');
    } finally {
      setDeleteExamBusy(false);
    }
  };

  const handleChoiceChange = (
    index: number,
    value: string,
    setter: Dispatch<SetStateAction<string[]>>,
  ) => {
    setter((prev) => prev.map((choice, choiceIndex) => (choiceIndex === index ? value : choice)));
  };

  const validateQuestion = (
    type: 'mcq' | 'essay',
    prompt: string,
    choices: string[],
    correctIndex: string,
    maxScore: string,
  ): string | null => {
    if (!prompt.trim()) {
      return 'نص السؤال مطلوب';
    }
    if (type === 'mcq') {
      const filled = choices.map((choice) => choice.trim()).filter(Boolean);
      if (filled.length < 2) {
        return 'أضف خيارين على الأقل';
      }
      const index = Number(correctIndex);
      if (!Number.isInteger(index) || index < 0 || index >= choices.length) {
        return 'اختر الإجابة الصحيحة';
      }
      if (!choices[index]?.trim()) {
        return 'الإجابة الصحيحة لا يمكن أن تكون فارغة';
      }
    }
    if (!Number.isFinite(Number(maxScore)) || Number(maxScore) < 0) {
      return 'أدخل درجة صحيحة';
    }
    return null;
  };

  const handleCreateQuestion = async () => {
    setQuestionCreateError(null);
    if (!selectedExamId) {
      setQuestionCreateError('اختر اختبارًا أولاً');
      return;
    }
    const validationError = validateQuestion(
      questionType,
      questionPrompt,
      questionChoices,
      questionCorrectIndex,
      questionMaxScore,
    );
    if (validationError) {
      setQuestionCreateError(validationError);
      return;
    }
    if (questionPromptImageFile) {
      const imageError = isValidExamImage(questionPromptImageFile);
      if (imageError) {
        setQuestionCreateError(imageError);
        return;
      }
    }
    if (questionType === 'mcq') {
      for (let i = 0; i < questionChoiceImageFiles.length; i += 1) {
        const file = questionChoiceImageFiles[i];
        if (file) {
          const imageError = isValidExamImage(file);
          if (imageError) {
            setQuestionCreateError(`صورة الخيار ${CHOICE_LABELS[i]}: ${imageError}`);
            return;
          }
        }
      }
    }
    setQuestionCreateBusy(true);
    try {
      let promptImagePath: string | null = null;
      if (questionPromptImageFile) {
        try {
          promptImagePath = await uploadImageFile(selectedExamId, questionPromptImageFile);
        } catch (e) {
          setQuestionCreateError(examImageErrorMessage(e));
          return;
        }
      }
      let choiceImagePaths: (string | null)[] | null = null;
      if (questionType === 'mcq') {
        choiceImagePaths = [null, null, null, null];
        for (let i = 0; i < 4; i += 1) {
          const file = questionChoiceImageFiles[i];
          if (file) {
            try {
              choiceImagePaths[i] = await uploadImageFile(selectedExamId, file);
            } catch (e) {
              setQuestionCreateError(examImageErrorMessage(e));
              return;
            }
          }
        }
        // only keep paths for non-empty choices? keep array length 4 for simplicity, but trim to choices length
        if (choiceImagePaths.every((p) => p === null)) choiceImagePaths = null;
      }
      await createExamQuestion({
        examId: selectedExamId,
        type: questionType,
        prompt: questionPrompt.trim(),
        choices: questionType === 'mcq' ? questionChoices.map((choice) => choice.trim()) : null,
        correctIndex: questionType === 'mcq' ? Number(questionCorrectIndex) : null,
        maxScore: Number(questionMaxScore) || 0,
        sortOrder: Number(questionOrder) || 0,
        promptImagePath: promptImagePath,
        choiceImagePaths: choiceImagePaths,
      });
      setQuestionPrompt('');
      setQuestionChoices(EMPTY_CHOICES);
      setQuestionCorrectIndex('0');
      setQuestionMaxScore('1');
      setQuestionPromptImageFile(null);
      setQuestionChoiceImageFiles([null, null, null, null]);
      showToast('تم إضافة السؤال بنجاح');
      await loadDetails();
    } catch (err) {
      setQuestionCreateError(examErrorMessage(err));
    } finally {
      setQuestionCreateBusy(false);
    }
  };

  const openEditQuestion = (question: ExamQuestion) => {
    setEditingQuestion({ question });
    setEditQuestionType(question.type);
    setEditQuestionPrompt(question.prompt);
    setEditQuestionChoices(
      question.type === 'mcq' ? [...(question.choices ?? []), ...EMPTY_CHOICES].slice(0, 4) : EMPTY_CHOICES,
    );
    setEditQuestionCorrectIndex(String(question.correct_index ?? 0));
    setEditQuestionMaxScore(String(question.max_score));
    setEditQuestionOrder(String(question.sort_order));
    setEditQuestionPromptImageFile(null);
    setEditQuestionPromptImagePath(question.prompt_image_path ?? null);
    const existingChoicePaths = (question.choice_image_paths ?? []) as (string | null)[];
    setEditQuestionChoiceImagePaths(
      [...existingChoicePaths, null, null, null, null].slice(0, 4) as (string | null)[],
    );
    setEditQuestionChoiceImageFiles([null, null, null, null]);
    setEditQuestionError(null);
  };

  const handleEditQuestion = async () => {
    if (!editingQuestion) {
      return;
    }
    if (editQuestionPromptImageFile) {
      const imageError = isValidExamImage(editQuestionPromptImageFile);
      if (imageError) {
        setEditQuestionError(imageError);
        return;
      }
    }
    if (editQuestionType === 'mcq') {
      for (let i = 0; i < editQuestionChoiceImageFiles.length; i += 1) {
        const file = editQuestionChoiceImageFiles[i];
        if (file) {
          const imageError = isValidExamImage(file);
          if (imageError) {
            setEditQuestionError(`صورة الخيار ${CHOICE_LABELS[i]}: ${imageError}`);
            return;
          }
        }
      }
    }
    setEditQuestionBusy(true);
    setEditQuestionError(null);
    try {
      let promptImagePath: string | null | undefined = undefined;
      if (editQuestionPromptImageFile) {
        try {
          promptImagePath = await uploadImageFile(editingQuestion.question.exam_id, editQuestionPromptImageFile);
        } catch (e) {
          setEditQuestionError(examImageErrorMessage(e));
          setEditQuestionBusy(false);
          return;
        }
      } else if (editQuestionPromptImagePath === null && editingQuestion.question.prompt_image_path) {
        // user removed existing image
        promptImagePath = null;
      }
      let choiceImagePaths: (string | null)[] | null | undefined = undefined;
      if (editQuestionType === 'mcq') {
        const nextPaths: (string | null)[] = [null, null, null, null];
        let hasAny = false;
        for (let i = 0; i < 4; i += 1) {
          const file = editQuestionChoiceImageFiles[i];
          if (file) {
            try {
              nextPaths[i] = await uploadImageFile(editingQuestion.question.exam_id, file);
              hasAny = true;
            } catch (e) {
              setEditQuestionError(examImageErrorMessage(e));
              setEditQuestionBusy(false);
              return;
            }
          } else if (editQuestionChoiceImagePaths[i]) {
            nextPaths[i] = editQuestionChoiceImagePaths[i];
            hasAny = true;
          }
        }
        if (hasAny) choiceImagePaths = nextPaths;
        else if (editingQuestion.question.choice_image_paths) choiceImagePaths = null;
      } else {
        // essay -> clear choice images if existed
        if (editingQuestion.question.choice_image_paths) choiceImagePaths = null;
      }
      await updateExamQuestion({
        questionId: editingQuestion.question.id,
        type: editQuestionType,
        prompt: editQuestionPrompt.trim() ? editQuestionPrompt.trim() : null,
        choices:
          editQuestionType === 'mcq' ? editQuestionChoices.map((choice) => choice.trim()) : null,
        correctIndex: editQuestionType === 'mcq' ? Number(editQuestionCorrectIndex) : null,
        maxScore: Number(editQuestionMaxScore) || 0,
        sortOrder: Number(editQuestionOrder) || 0,
        ...(promptImagePath !== undefined ? { promptImagePath } : {}),
        ...(choiceImagePaths !== undefined ? { choiceImagePaths } : {}),
      });
      showToast('تم تحديث السؤال بنجاح');
      setEditingQuestion(null);
      await loadDetails();
    } catch (err) {
      setEditQuestionError(examErrorMessage(err));
    } finally {
      setEditQuestionBusy(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!deletingQuestion) {
      return;
    }
    setDeleteQuestionBusy(true);
    try {
      await deleteExamQuestion(deletingQuestion.question.id);
      showToast('تم حذف السؤال');
      setDeletingQuestion(null);
      await loadDetails();
    } catch (err) {
      showToast(examErrorMessage(err), 'error');
    } finally {
      setDeleteQuestionBusy(false);
    }
  };

  const openGrading = (attempt: ExamAttempt) => {
    const essayQuestions = (questions ?? []).filter((question) => question.type === 'essay');
    const scores: Record<string, string> = {};
    essayQuestions.forEach((question) => {
      scores[question.id] = '';
    });
    setGradingScores(scores);
    setGradingError(null);
    setGrading({ attempt });
  };

  const handleGrade = async () => {
    if (!grading) {
      return;
    }
    const essayQuestions = (questions ?? []).filter((question) => question.type === 'essay');
    const scores = essayQuestions.map((question) => ({
      questionId: question.id,
      score: Number(gradingScores[question.id] ?? 0),
    }));
    if (essayQuestions.some((_, index) => Number.isNaN(scores[index].score) || scores[index].score < 0)) {
      setGradingError('أدخل درجات صحيحة لكل سؤال');
      return;
    }
    setGradingBusy(true);
    setGradingError(null);
    try {
      await gradeExam(grading.attempt.id, scores);
      showToast('تم تصحيح المحاولة بنجاح');
      setGrading(null);
      await loadDetails();
    } catch (err) {
      setGradingError(examErrorMessage(err));
    } finally {
      setGradingBusy(false);
    }
  };

  const selectedLessonName = lessons?.find((lesson) => lesson.id === selectedLessonId)?.title;
  const essayQuestions = (questions ?? []).filter((question) => question.type === 'essay');

  return (
    <LayoutShell
      title="الإختبارات"
      subtitle="إنشاء الإختبارات ومتابعة درجات الطلاب"
      variant="sidebar"
      nav={<RoleNav />}
    >
      <div className="flex flex-col gap-4">
        <section className="glass-card spotlight-card rise relative overflow-hidden p-4 sm:p-6">
          <div className="relative flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 text-white shadow-[0_0_26px_-6px_rgba(129,140,248,0.85)]"
              >
                <ClipboardList className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-base font-bold text-foreground sm:text-lg">
                  إنشاء وإدارة الاختبارات
                </h2>
                <p className="text-xs text-foreground-subtle sm:text-sm">
                  اختر الصف ثم الوحدة ثم الدرس لإدارة اختباراته
                </p>
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
              <EmptyState title="لا توجد صفوف نشطة" description="أنشئ صفًا أولاً من صفحة إدارة الصفوف." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <Select
                  label="الصف"
                  name="exam-grade"
                  value={selectedGradeId}
                  onChange={(event) => {
                    setSelectedGradeId(event.target.value);
                    setSelectedUnitId('');
                    setSelectedLessonId('');
                  }}
                >
                  {grades.map((grade) => (
                    <option key={grade.id} value={grade.id}>
                      {grade.name}
                    </option>
                  ))}
                </Select>

                <Select
                  label="الوحدة"
                  name="exam-unit"
                  value={selectedUnitId}
                  disabled={!selectedGradeId}
                  onChange={(event) => {
                    setSelectedUnitId(event.target.value);
                    setSelectedLessonId('');
                  }}
                >
                  <option value="">اختر وحدة</option>
                  {unitsError ? <option disabled>تعذر التحميل</option> : null}
                  {units === null && selectedGradeId ? <option disabled>جاري التحميل...</option> : null}
                  {(units ?? []).map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </Select>

                <Select
                  label="الدرس"
                  name="exam-lesson"
                  value={selectedLessonId}
                  disabled={!selectedUnitId}
                  onChange={(event) => setSelectedLessonId(event.target.value)}
                >
                  <option value="">اختر درسًا</option>
                  {lessonsError ? <option disabled>تعذر التحميل</option> : null}
                  {lessons === null && selectedUnitId ? <option disabled>جاري التحميل...</option> : null}
                  {(lessons ?? []).map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.title}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <section className="glass-card spotlight-card rise relative overflow-hidden p-4 sm:p-6">
            <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground">اختبارات الدرس المختار</h2>
                <p className="mt-1 text-xs text-foreground-subtle">
                  {selectedLessonName ? `الدرس: ${selectedLessonName}` : 'اختر درسًا لعرض اختباراته'}
                </p>
              </div>
            </header>

            {!selectedLessonId ? (
              <EmptyState title="اختر درسًا لعرض اختباراته" />
            ) : examsError ? (
              <ErrorState message="تعذر تحميل الاختبارات" onRetry={() => void loadExams()} />
            ) : exams === null ? (
              <ListSkeleton />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="glass-soft rounded-xl border border-indigo-400/15 bg-indigo-400/[0.04] p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input
                      label="عنوان الاختبار"
                      name="exam-title"
                      placeholder="مثال: اختبار الوحدة الأولى"
                      value={examTitle}
                      error={examCreateError ?? undefined}
                      onChange={(event) => setExamTitle(event.target.value)}
                    />
                    <Input
                      label="درجة النجاح"
                      name="exam-passing"
                      type="number"
                      value={examPassing}
                      onChange={(event) => setExamPassing(event.target.value)}
                    />
                    <Input
                      label="الترتيب"
                      name="exam-order"
                      type="number"
                      value={examOrder}
                      onChange={(event) => setExamOrder(event.target.value)}
                    />
                  </div>
                  <Button
                    loading={examCreateBusy}
                    icon={<Plus aria-hidden="true" className="h-4 w-4" />}
                    onClick={() => void handleCreateExam()}
                    className="mt-3 w-full sm:w-auto"
                  >
                    إضافة اختبار
                  </Button>
                </div>

                {exams.length === 0 ? (
                  <EmptyState title="لا توجد اختبارات بعد" description="أنشئ أول اختبار لهذا الدرس." />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {exams.map((exam) => {
                      const isSelected = selectedExamId === exam.id;
                      return (
                        <li
                          key={exam.id}
                          data-testid={`exam-row-${exam.id}`}
                          className={`relative overflow-hidden rounded-xl border p-3 transition-all duration-200 ${
                            isSelected
                              ? 'border-indigo-400/40 bg-gradient-to-br from-indigo-500/[0.16] to-fuchsia-500/[0.12] shadow-[0_0_30px_-12px_rgba(99,102,241,0.6)]'
                              : 'glass-soft border-white/8 hover:border-indigo-400/20'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setSelectedExamId(exam.id)}
                              className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-foreground">
                                  {exam.title}
                                </span>
                                <span className="mt-0.5 block text-xs text-foreground-subtle">
                                  درجة النجاح {exam.passing_score} — ترتيب {exam.sort_order}
                                </span>
                              </span>
                            </button>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedExamId(exam.id)}
                                className="text-primary-strong hover:bg-primary-soft hover:text-primary-strong"
                              >
                                اختر
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Pencil aria-hidden="true" className="h-4 w-4" />}
                                onClick={() => openEditExam(exam)}
                              >
                                تعديل
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                                onClick={() => setDeletingExam({ exam })}
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
              </div>
            )}
          </section>

          <section className="glass-card spotlight-card rise relative overflow-hidden p-4 sm:p-6">
            <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground">أسئلة الاختبار المختار</h2>
                <p className="mt-1 text-xs text-foreground-subtle">
                  {selectedExamId ? 'أضف الأسئلة وحدد الإجابة الصحيحة' : 'اختر اختبارًا لإدارة أسئلته'}
                </p>
              </div>
            </header>

            {!selectedExamId ? (
              <EmptyState title="اختر اختبارًا لإدارة أسئلته" />
            ) : detailsError ? (
              <ErrorState message="تعذر تحميل تفاصيل الاختبار" onRetry={() => void loadDetails()} />
            ) : questions === null || attempts === null ? (
              <ListSkeleton />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="glass-soft rounded-xl border border-fuchsia-400/15 bg-fuchsia-400/[0.04] p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Select
                      label="نوع السؤال"
                      name="question-type"
                      value={questionType}
                      onChange={(event) =>
                        setQuestionType(event.target.value as 'mcq' | 'essay')
                      }
                      className="w-full sm:w-40"
                    >
                      <option value="mcq">اختيار من متعدد</option>
                      <option value="essay">مقالي</option>
                    </Select>
                    <div className="flex-1 min-w-[240px]">
                      <Input
                        label="نص السؤال"
                        name="question-prompt"
                        placeholder="مثال: ما عاصمة مصر؟"
                        value={questionPrompt}
                        error={questionCreateError ?? undefined}
                        onChange={(event) => setQuestionPrompt(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label htmlFor="question-prompt-image" className="text-sm font-medium text-secondary-foreground">
                      صورة السؤال (اختياري - JPG/PNG/WebP ≤5MB)
                    </label>
                    <input
                      id="question-prompt-image"
                      name="question-prompt-image"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => setQuestionPromptImageFile(event.target.files?.[0] ?? null)}
                      className="mt-1 block w-full max-w-md text-sm text-foreground-muted file:me-3 file:rounded-md file:border-0 file:bg-gradient-to-br file:from-primary file:to-accent file:px-4 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground"
                    />
                    {questionPromptImageFile ? (
                      <p className="mt-1 text-xs text-foreground-subtle">تم اختيار: {questionPromptImageFile.name}</p>
                    ) : null}
                  </div>
                  {questionType === 'mcq' ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {questionChoices.map((choice, index) => (
                        <div key={index} className="flex flex-col gap-1">
                          <Input
                            label={`الخيار ${CHOICE_LABELS[index]}`}
                            name={`question-choice-${index}`}
                            value={choice}
                            onChange={(event) =>
                              handleChoiceChange(index, event.target.value, setQuestionChoices)
                            }
                          />
                          <input
                            id={`question-choice-image-${index}`}
                            name={`question-choice-image-${index}`}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null;
                              setQuestionChoiceImageFiles((prev) => prev.map((f, i) => (i === index ? file : f)));
                            }}
                            className="block w-full text-xs text-foreground-muted file:me-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs"
                          />
                          {questionChoiceImageFiles[index] ? (
                            <span className="text-xs text-foreground-subtle truncate">{questionChoiceImageFiles[index]?.name}</span>
                          ) : null}
                        </div>
                      ))}
                      <Select
                        label="الإجابة الصحيحة"
                        name="question-correct"
                        value={questionCorrectIndex}
                        onChange={(event) => setQuestionCorrectIndex(event.target.value)}
                      >
                        {questionChoices.map((_, index) => (
                          <option key={index} value={index}>
                            {CHOICE_LABELS[index]}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : null}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input
                      label="الدرجة القصوى"
                      name="question-max-score"
                      type="number"
                      value={questionMaxScore}
                      onChange={(event) => setQuestionMaxScore(event.target.value)}
                    />
                    <Input
                      label="الترتيب"
                      name="question-order"
                      type="number"
                      value={questionOrder}
                      onChange={(event) => setQuestionOrder(event.target.value)}
                    />
                  </div>
                  <Button
                    loading={questionCreateBusy}
                    icon={<Plus aria-hidden="true" className="h-4 w-4" />}
                    onClick={() => void handleCreateQuestion()}
                    className="mt-3 w-full sm:w-auto"
                  >
                    إضافة سؤال
                  </Button>
                </div>

                {questions.length === 0 ? (
                  <EmptyState title="لا توجد أسئلة بعد" description="أضف أول سؤال لهذا الاختبار." />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {questions.map((question, index) => (
                      <li
                        key={question.id}
                        data-testid={`question-row-${question.id}`}
                        className="glass-soft rounded-xl border border-white/8 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={question.type === 'mcq' ? 'info' : 'neutral'}>
                                {question.type === 'mcq' ? 'اختياري' : 'مقالي'}
                              </Badge>
                              <Badge variant="neutral">الدرجة: {question.max_score}</Badge>
                            </div>
                            <p className="mt-1.5 text-sm font-medium text-foreground">
                              {index + 1}. {question.prompt}
                            </p>
                            {imageUrlsByQuestion[question.id]?.promptUrl ? (
                              <img
                                src={imageUrlsByQuestion[question.id].promptUrl!}
                                alt={`صورة السؤال ${index + 1}`}
                                loading="lazy"
                                data-testid={`question-prompt-image-${question.id}`}
                                className="mt-2 max-h-48 w-full max-w-sm rounded-lg border border-white/10 object-contain"
                              />
                            ) : null}
                            {question.type === 'mcq' ? (
                              <ul className="mt-1.5 flex flex-wrap gap-2 text-xs text-foreground-muted">
                                {(question.choices ?? []).map((choice, choiceIndex) => (
                                  <li key={choiceIndex} className="flex flex-col items-start gap-1">
                                    <span>
                                      {CHOICE_LABELS[choiceIndex]}) {choice}
                                      {question.correct_index === choiceIndex ? ' ✓' : ''}
                                    </span>
                                    {imageUrlsByQuestion[question.id]?.choiceUrls?.[choiceIndex] ? (
                                      <img
                                        src={imageUrlsByQuestion[question.id].choiceUrls![choiceIndex]!}
                                        alt={`صورة الخيار ${CHOICE_LABELS[choiceIndex]}`}
                                        loading="lazy"
                                        data-testid={`question-choice-image-${question.id}-${choiceIndex}`}
                                        className="h-20 w-20 rounded-md border border-white/10 object-cover"
                                      />
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Pencil aria-hidden="true" className="h-4 w-4" />}
                                onClick={() => openEditQuestion(question)}
                              >
                                تعديل
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                                onClick={() => setDeletingQuestion({ question })}
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
              </div>
            )}
          </section>
        </div>

        <section className="glass-card spotlight-card rise relative overflow-hidden p-4 sm:p-6">
          <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">محاولات الطلاب</h2>
              <p className="mt-1 text-xs text-foreground-subtle">
                {selectedExamId ? 'راجع إجابات الطلاب وصحح الأسئلة المقالية' : 'اختر اختبارًا لعرض المحاولات'}
              </p>
            </div>
          </header>

          {!selectedExamId ? (
            <EmptyState title="اختر اختبارًا لعرض المحاولات" />
          ) : attempts === null ? (
            <ListSkeleton />
          ) : attempts.length === 0 ? (
            <EmptyState title="لا توجد محاولات بعد" description="ستظهر هنا إجابات الطلاب فور إرسالها." />
          ) : (
            <ul className="flex flex-col gap-2">
              {attempts.map((attempt) => {
                const essayCount = essayQuestions.length;
                const needsGrading = attempt.status === 'submitted' && essayCount > 0;
                const answers = answersByAttempt[attempt.id] ?? [];
                return (
                  <li
                    key={attempt.id}
                    data-testid={`attempt-row-${attempt.id}`}
                    className="glass-soft rounded-xl border border-white/8 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {names[attempt.student_id] || attempt.student_id}
                          </span>
                          {attempt.status === 'graded' ? (
                            <Badge variant="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                              تم التصحيح
                            </Badge>
                          ) : (
                            <Badge variant="warning" icon={<Timer className="h-3.5 w-3.5" />}>
                              بانتظار التصحيح
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-foreground-subtle">
                          أُرسلت في {formatDateTime(attempt.submitted_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {attempt.final_score != null ? (
                          <span className="text-sm font-semibold text-foreground">
                            النتيجة: {attempt.final_score}
                          </span>
                        ) : null}
                        {needsGrading ? (
                          <Button size="sm" onClick={() => openGrading(attempt)}>
                            تصحيح
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {answers.length > 0 ? (
                      <div className="mt-3 flex flex-col gap-1.5 border-t border-white/8 pt-3">
                        {answers.map((answer) => {
                          const question = questions?.find((item) => item.id === answer.question_id);
                          if (!question) {
                            return null;
                          }
                          const preview =
                            question.type === 'mcq'
                              ? question.choices?.[answer.choice_index ?? -1] ?? '—'
                              : answer.answer_text || '—';
                          return (
                            <div key={answer.id} className="text-xs text-foreground-muted">
                              <span className="font-medium text-foreground">
                                {question.type === 'mcq' ? 'اختياري' : 'مقالي'}:
                              </span>{' '}
                              {preview}
                              {answer.score != null ? (
                                <span className="ms-2 font-semibold text-emerald-300">
                                  ({answer.score})
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <Modal
        open={editingExam !== null}
        title={editingExam ? `تعديل الاختبار: ${editingExam.exam.title}` : ''}
        description="قم بتعديل عنوان الاختبار أو درجة النجاح أو ترتيبه."
        confirmLabel="حفظ"
        loading={editExamBusy}
        onConfirm={() => void handleEditExam()}
        onCancel={() => {
          if (!editExamBusy) {
            setEditingExam(null);
          }
        }}
      >
        <div className="mt-4 flex flex-col gap-3">
          <Input
            label="عنوان الاختبار"
            name="edit-exam-title"
            value={editExamTitle}
            error={editExamError ?? undefined}
            onChange={(event) => setEditExamTitle(event.target.value)}
          />
          <Input
            label="درجة النجاح"
            name="edit-exam-passing"
            type="number"
            value={editExamPassing}
            onChange={(event) => setEditExamPassing(event.target.value)}
          />
          <Input
            label="الترتيب"
            name="edit-exam-order"
            type="number"
            value={editExamOrder}
            onChange={(event) => setEditExamOrder(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={deletingExam !== null}
        title={deletingExam ? `حذف الاختبار: ${deletingExam.exam.title}` : ''}
        description="سيتم حذف الاختبار وأسئلته ولن يظهر للطلاب."
        confirmLabel="نعم، حذف"
        danger
        loading={deleteExamBusy}
        onConfirm={() => void handleDeleteExam()}
        onCancel={() => {
          if (!deleteExamBusy) {
            setDeletingExam(null);
          }
        }}
      />

      <Modal
        open={editingQuestion !== null}
        title={editingQuestion ? 'تعديل السؤال' : ''}
        description="قم بتعديل نص السؤال والخيارات والإجابة الصحيحة."
        confirmLabel="حفظ"
        loading={editQuestionBusy}
        onConfirm={() => void handleEditQuestion()}
        onCancel={() => {
          if (!editQuestionBusy) {
            setEditingQuestion(null);
          }
        }}
      >
        <div className="mt-4 flex flex-col gap-3">
          <Select
            label="نوع السؤال"
            name="edit-question-type"
            value={editQuestionType}
            onChange={(event) => setEditQuestionType(event.target.value as 'mcq' | 'essay')}
          >
            <option value="mcq">اختيار من متعدد</option>
            <option value="essay">مقالي</option>
          </Select>
          <Input
            label="نص السؤال"
            name="edit-question-prompt"
            value={editQuestionPrompt}
            error={editQuestionError ?? undefined}
            onChange={(event) => setEditQuestionPrompt(event.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-question-prompt-image" className="text-sm font-medium text-secondary-foreground">
              صورة السؤال (اختياري)
            </label>
            {editQuestionPromptImagePath ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-foreground-subtle truncate">صورة موجودة</span>
                {imageUrlsByQuestion[editingQuestion!.question.id]?.promptUrl ? (
                  <img
                    src={imageUrlsByQuestion[editingQuestion!.question.id]!.promptUrl!}
                    alt="صورة السؤال الحالية"
                    className="h-12 w-12 rounded object-cover border border-white/10"
                  />
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditQuestionPromptImagePath(null);
                    setEditQuestionPromptImageFile(null);
                  }}
                  className="text-error"
                >
                  إزالة
                </Button>
              </div>
            ) : null}
            <input
              id="edit-question-prompt-image"
              name="edit-question-prompt-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setEditQuestionPromptImageFile(event.target.files?.[0] ?? null)}
              className="block w-full text-xs text-foreground-muted file:me-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs"
            />
            {editQuestionPromptImageFile ? (
              <span className="text-xs text-foreground-subtle">{editQuestionPromptImageFile.name}</span>
            ) : null}
          </div>
          {editQuestionType === 'mcq' ? (
            <>
              {editQuestionChoices.map((choice, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <Input
                    label={`الخيار ${CHOICE_LABELS[index]}`}
                    name={`edit-question-choice-${index}`}
                    value={choice}
                    onChange={(event) =>
                      handleChoiceChange(index, event.target.value, setEditQuestionChoices)
                    }
                  />
                  {editQuestionChoiceImagePaths[index] ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-foreground-subtle">صورة موجودة</span>
                      {imageUrlsByQuestion[editingQuestion!.question.id]?.choiceUrls?.[index] ? (
                        <img
                          src={imageUrlsByQuestion[editingQuestion!.question.id]!.choiceUrls![index]!}
                          alt={`صورة الخيار ${CHOICE_LABELS[index]}`}
                          className="h-10 w-10 rounded object-cover border border-white/10"
                        />
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditQuestionChoiceImagePaths((prev) => prev.map((p, i) => (i === index ? null : p)));
                          setEditQuestionChoiceImageFiles((prev) => prev.map((f, i) => (i === index ? null : f)));
                        }}
                        className="text-error"
                      >
                        إزالة
                      </Button>
                    </div>
                  ) : null}
                  <input
                    id={`edit-question-choice-image-${index}`}
                    name={`edit-question-choice-image-${index}`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setEditQuestionChoiceImageFiles((prev) => prev.map((f, i) => (i === index ? file : f)));
                    }}
                    className="block w-full text-xs text-foreground-muted file:me-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs"
                  />
                  {editQuestionChoiceImageFiles[index] ? (
                    <span className="text-xs text-foreground-subtle">{editQuestionChoiceImageFiles[index]?.name}</span>
                  ) : null}
                </div>
              ))}
              <Select
                label="الإجابة الصحيحة"
                name="edit-question-correct"
                value={editQuestionCorrectIndex}
                onChange={(event) => setEditQuestionCorrectIndex(event.target.value)}
              >
                {editQuestionChoices.map((_, index) => (
                  <option key={index} value={index}>
                    {CHOICE_LABELS[index]}
                  </option>
                ))}
              </Select>
            </>
          ) : null}
          <Input
            label="الدرجة القصوى"
            name="edit-question-max-score"
            type="number"
            value={editQuestionMaxScore}
            onChange={(event) => setEditQuestionMaxScore(event.target.value)}
          />
          <Input
            label="الترتيب"
            name="edit-question-order"
            type="number"
            value={editQuestionOrder}
            onChange={(event) => setEditQuestionOrder(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={deletingQuestion !== null}
        title={deletingQuestion ? 'حذف السؤال' : ''}
        description="سيتم حذف هذا السؤال من الاختبار."
        confirmLabel="نعم، حذف"
        danger
        loading={deleteQuestionBusy}
        onConfirm={() => void handleDeleteQuestion()}
        onCancel={() => {
          if (!deleteQuestionBusy) {
            setDeletingQuestion(null);
          }
        }}
      />

      <Modal
        open={grading !== null}
        title={grading ? `تصحيح محاولة: ${names[grading.attempt.student_id] || ''}` : ''}
        description="أدخل درجة كل سؤال مقالي ثم احفظ النتيجة."
        confirmLabel="حفظ التصحيح"
        loading={gradingBusy}
        onConfirm={() => void handleGrade()}
        onCancel={() => {
          if (!gradingBusy) {
            setGrading(null);
          }
        }}
      >
        <div className="mt-4 flex flex-col gap-3">
          {essayQuestions.length === 0 ? (
            <p className="text-sm text-foreground-muted">لا توجد أسئلة مقالية لهذا الاختبار.</p>
          ) : (
            essayQuestions.map((question, index) => (
              <Input
                key={question.id}
                label={`السؤال ${index + 1}: ${question.prompt}`}
                name={`grade-score-${question.id}`}
                type="number"
                hint={`الدرجة القصوى: ${question.max_score}`}
                value={gradingScores[question.id] ?? ''}
                onChange={(event) =>
                  setGradingScores((prev) => ({ ...prev, [question.id]: event.target.value }))
                }
              />
            ))
          )}
          {gradingError ? (
            <p role="alert" className="text-sm font-medium text-error">
              {gradingError}
            </p>
          ) : null}
        </div>
      </Modal>
    </LayoutShell>
  );
}
