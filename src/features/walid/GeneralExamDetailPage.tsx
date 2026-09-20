import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Pencil, Plus, Sparkles, Timer, Trash2 } from 'lucide-react';

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
  createExamQuestion,
  deleteExamQuestion,
  generateExamQuestions,
  getExamImageSignedUrls,
  getExamQuestions,
  getGeneralExamLeaderboard,
  getProfileName,
  getRpcErrorCode,
  gradeExam,
  listAttemptAnswers,
  listExamAttempts,
  listGeneralExams,
  resetGeneralExamAttempt,
  updateExamQuestion,
  uploadExamImage,
  uploadExamImageBytes,
  type AiDifficulty,
  type AiGenerateMode,
} from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import { compressSuggestionImage } from '../../lib/imageCompress';
import type {
  ExamAnswer,
  ExamAttempt,
  ExamQuestion,
  GeneralExamLeaderboardRow,
  GeneralExamRow,
} from '../../types/database';
import { LeaderboardCard } from '../exams/LeaderboardCard';
import { generalExamErrorMessage } from '../exams/generalExamUtils';
import { clearPersisted, readPersisted, writePersisted } from '../../lib/usePersistedState';
import { useAuth } from '../auth/AuthContext';

const CHOICE_LABELS = ['أ', 'ب', 'ج', 'د'];
const EMPTY_CHOICES = ['', '', '', ''];
const EXAM_IMAGE_MAX_SIZE = 5 * 1024 * 1024;

/** Auto-saved new-question draft (text fields only — files can't persist). */
interface NewQuestionDraft {
  type: 'mcq' | 'essay';
  prompt: string;
  choices: string[];
  correct: string;
  score: string;
}

/** Guard restored drafts against malformed stored shapes. */
function normalizeDraftChoices(value: unknown): string[] {
  const list = Array.isArray(value) ? value.map((item) => String(item ?? '')) : [];
  return [...list, '', '', '', ''].slice(0, 4);
}

function normalizeDraftCorrect(value: unknown): string {
  return typeof value === 'string' && /^[0-3]$/.test(value) ? value : '0';
}

type Tab = 'questions' | 'attempts' | 'leaderboard';

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

export function GeneralExamDetailPage() {
  const { examId } = useParams<{ examId: string }>();
  const { showToast } = useToast();
  const draftKey = `ge-new-question:${examId ?? 'unknown'}`;
  const tabKey = `ge-tab:${examId ?? 'unknown'}`;
  const [exam, setExam] = useState<GeneralExamRow | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Active tab survives refresh so staff resume where they left off.
  const [tab, setTab] = useState<Tab>(() => {
    const saved = readPersisted<Tab>(`ge-tab:${examId ?? 'unknown'}`);
    return saved === 'attempts' || saved === 'leaderboard' ? saved : 'questions';
  });
  useEffect(() => {
    writePersisted(tabKey, tab);
  }, [tabKey, tab]);

  const [questions, setQuestions] = useState<ExamQuestion[] | null>(null);
  const [detailsError, setDetailsError] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, { promptUrl: string | null; choiceUrls: (string | null)[] | null }>>({});

  // New-question form: restored from the auto-saved draft (refresh-safe).
  // File inputs are NOT persistable — only text fields are restored.
  const [qType, setQType] = useState<'mcq' | 'essay'>(
    () => readPersisted<NewQuestionDraft>(draftKey)?.type ?? 'mcq',
  );
  const [qPrompt, setQPrompt] = useState(() => readPersisted<NewQuestionDraft>(draftKey)?.prompt ?? '');
  const [qChoices, setQChoices] = useState<string[]>(
    () => normalizeDraftChoices(readPersisted<NewQuestionDraft>(draftKey)?.choices),
  );
  const [qCorrect, setQCorrect] = useState(
    () => normalizeDraftCorrect(readPersisted<NewQuestionDraft>(draftKey)?.correct),
  );
  const [qScore, setQScore] = useState(() => readPersisted<NewQuestionDraft>(draftKey)?.score ?? '1');
  const [qBusy, setQBusy] = useState(false);
  const [qError, setQError] = useState<string | null>(null);
  const [qPromptFile, setQPromptFile] = useState<File | null>(null);
  const [qChoiceFiles, setQChoiceFiles] = useState<(File | null)[]>([null, null, null, null]);

  const [editingQ, setEditingQ] = useState<ExamQuestion | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editRemovePromptImage, setEditRemovePromptImage] = useState(false);
  const [deletingQ, setDeletingQ] = useState<ExamQuestion | null>(null);
  const [deleteQBusy, setDeleteQBusy] = useState(false);

  // Auto-save the unsent new-question draft on every keystroke (paused
  // while the edit modal borrows the same fields, so edits never clobber
  // the draft). Survives refresh + accidental navigation.
  useEffect(() => {
    if (editingQ) return;
    writePersisted(draftKey, {
      type: qType,
      prompt: qPrompt,
      choices: qChoices,
      correct: qCorrect,
      score: qScore,
    } satisfies NewQuestionDraft);
  }, [draftKey, editingQ, qType, qPrompt, qChoices, qCorrect, qScore]);

  // In-memory snapshot of the new-question form (incl. chosen files) taken
  // when the edit modal opens, restored when it closes — typing is never
  // lost by opening an edit.
  const createSnapshotRef = useRef<(NewQuestionDraft & { promptFile: File | null; choiceFiles: (File | null)[] }) | null>(null);

  // attempts
  const [attempts, setAttempts] = useState<ExamAttempt[] | null>(null);
  const [answersByAttempt, setAnswersByAttempt] = useState<Record<string, ExamAnswer[]>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [grading, setGrading] = useState<ExamAttempt | null>(null);
  const [gradingScores, setGradingScores] = useState<Record<string, string>>({});
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [gradingBusy, setGradingBusy] = useState(false);
  const [resetting, setResetting] = useState<ExamAttempt | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  // leaderboard
  const [board, setBoard] = useState<GeneralExamLeaderboardRow[] | null>(null);

  // AI generation — admin only (button hidden otherwise; the Edge Function
  // re-enforces admin-only server-side).
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMode, setAiMode] = useState<AiGenerateMode>('generate');
  const [aiTopic, setAiTopic] = useState('');
  const [aiContext, setAiContext] = useState('');
  const [aiRaw, setAiRaw] = useState('');
  const [aiMcq, setAiMcq] = useState('5');
  const [aiEssay, setAiEssay] = useState('1');
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('mixed');
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiProgress, setAiProgress] = useState<string | null>(null);

  const loadExam = useCallback(async () => {
    if (!examId) return;
    setLoadError(false);
    try {
      const rows = await listGeneralExams();
      const found = rows.find((row) => row.id === examId) ?? null;
      if (!found) {
        setLoadError(true);
        return;
      }
      setExam(found);
    } catch {
      setLoadError(true);
    }
  }, [examId]);

  const loadQuestions = useCallback(async () => {
    if (!examId) return;
    setDetailsError(false);
    try {
      const rows = await getExamQuestions(examId);
      setQuestions(rows);
      const hasImages = rows.some(
        (q) => q.prompt_image_path || (q.choice_image_paths && (q.choice_image_paths as unknown[]).some(Boolean)),
      );
      if (hasImages) {
        try {
          const signed = await getExamImageSignedUrls(examId);
          const map: Record<string, { promptUrl: string | null; choiceUrls: (string | null)[] | null }> = {};
          for (const img of signed) {
            map[img.question_id] = { promptUrl: img.prompt_image_url, choiceUrls: img.choice_image_urls };
          }
          setImageUrls(map);
        } catch {
          // best-effort
        }
      }
    } catch {
      setDetailsError(true);
    }
  }, [examId]);

  const loadAttempts = useCallback(async () => {
    if (!examId) return;
    try {
      const rows = await listExamAttempts(examId);
      setAttempts(rows);
      const groups = await Promise.all(rows.map((a) => listAttemptAnswers(a.id)));
      setAnswersByAttempt(Object.fromEntries(rows.map((a, i) => [a.id, groups[i]])));
      const uniqueStudents = [...new Set(rows.map((a) => a.student_id))];
      const namePairs = await Promise.all(uniqueStudents.map(async (id) => [id, await getProfileName(id)] as const));
      setNames(Object.fromEntries(namePairs));
    } catch {
      showToast('تعذر تحميل المحاولات', 'error');
    }
  }, [examId, showToast]);

  const loadBoard = useCallback(async () => {
    if (!examId) return;
    try {
      setBoard(await getGeneralExamLeaderboard(examId));
    } catch (error) {
      const code = getRpcErrorCode(error);
      if (code !== 'leaderboard_hidden') {
        showToast(generalExamErrorMessage(error), 'error');
      }
      setBoard([]);
    }
  }, [examId, showToast]);

  useEffect(() => {
    void loadExam();
  }, [loadExam]);
  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);
  useEffect(() => {
    if (tab === 'attempts') void loadAttempts();
    if (tab === 'leaderboard') void loadBoard();
  }, [tab, loadAttempts, loadBoard]);

  // Refetch on window focus: leaving and coming back never shows stale
  // questions/attempts (e.g. another staff member added questions).
  useEffect(() => {
    const onFocus = () => {
      void loadExam();
      if (tab === 'questions') void loadQuestions();
      else if (tab === 'attempts') void loadAttempts();
      else void loadBoard();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [tab, loadExam, loadQuestions, loadAttempts, loadBoard]);

  const resetQuestionForm = () => {
    setQPrompt('');
    setQChoices(EMPTY_CHOICES);
    setQCorrect('0');
    setQScore('1');
    setQPromptFile(null);
    setQChoiceFiles([null, null, null, null]);
    setQError(null);
    clearPersisted(draftKey);
  };

  /** Restore the new-question form stashed before an edit (never lose typing). */
  const restoreCreateSnapshot = () => {
    const snapshot = createSnapshotRef.current;
    createSnapshotRef.current = null;
    if (!snapshot) {
      resetQuestionForm();
      return;
    }
    setQType(snapshot.type);
    setQPrompt(snapshot.prompt);
    setQChoices(snapshot.choices);
    setQCorrect(snapshot.correct);
    setQScore(snapshot.score);
    setQPromptFile(snapshot.promptFile);
    setQChoiceFiles(snapshot.choiceFiles);
    setQError(null);
  };

  const handleCreateQuestion = async () => {
    if (!examId) return;
    if (!qPrompt.trim()) {
      setQError('اكتب نص السؤال');
      return;
    }
    if (qType === 'mcq') {
      const filled = qChoices.map((c) => c.trim());
      if (filled.some((c) => !c)) {
        setQError('اكتب الاختيارات الأربعة');
        return;
      }
    }
    if (qPromptFile) {
      const invalid = isValidExamImage(qPromptFile);
      if (invalid) {
        setQError(invalid);
        return;
      }
    }
    for (const file of qChoiceFiles) {
      if (file) {
        const invalid = isValidExamImage(file);
        if (invalid) {
          setQError(invalid);
          return;
        }
      }
    }
    const score = Number(qScore);
    if (!Number.isFinite(score) || score <= 0) {
      setQError('الدرجة يجب أن تكون أكبر من صفر');
      return;
    }
    setQBusy(true);
    setQError(null);
    try {
      let promptPath: string | null = null;
      if (qPromptFile) promptPath = await uploadImageFile(examId, qPromptFile);
      let choicePaths: (string | null)[] | null = null;
      if (qType === 'mcq' && qChoiceFiles.some(Boolean)) {
        choicePaths = await Promise.all(
          qChoiceFiles.map((file) => (file ? uploadImageFile(examId, file) : Promise.resolve(null))),
        );
      }
      await createExamQuestion({
        examId,
        type: qType,
        prompt: qPrompt.trim(),
        choices: qType === 'mcq' ? qChoices.map((c) => c.trim()) : null,
        correctIndex: qType === 'mcq' ? Number(qCorrect) : null,
        maxScore: score,
        sortOrder: (questions ?? []).reduce((max, q) => Math.max(max, q.sort_order ?? 0), 0) + 1,
        promptImagePath: promptPath,
        choiceImagePaths: choicePaths,
      });
      showToast('تمت إضافة السؤال', 'success');
      resetQuestionForm();
      await Promise.all([loadQuestions(), loadExam()]);
    } catch (error) {
      setQError(generalExamErrorMessage(error));
    } finally {
      setQBusy(false);
    }
  };

  const openEditQuestion = (question: ExamQuestion) => {
    // stash the unsent new-question form (incl. chosen files) first
    createSnapshotRef.current = {
      type: qType,
      prompt: qPrompt,
      choices: qChoices,
      correct: qCorrect,
      score: qScore,
      promptFile: qPromptFile,
      choiceFiles: qChoiceFiles,
    };
    setEditingQ(question);
    setEditRemovePromptImage(false);
    setEditError(null);
    setQType(question.type);
    setQPrompt(question.prompt);
    setQChoices(
      question.type === 'mcq'
        ? [...(question.choices ?? []), '', '', '', ''].slice(0, 4)
        : EMPTY_CHOICES,
    );
    setQCorrect(String(question.correct_index ?? 0));
    setQScore(String(question.max_score));
    setQPromptFile(null);
    setQChoiceFiles([null, null, null, null]);
  };

  const handleEditQuestion = async () => {
    if (!editingQ || !examId) return;
    if (!qPrompt.trim()) {
      setEditError('اكتب نص السؤال');
      return;
    }
    setEditBusy(true);
    setEditError(null);
    try {
      let promptPath = editingQ.prompt_image_path ?? null;
      if (editRemovePromptImage) {
        promptPath = null;
      } else if (qPromptFile) {
        const invalid = isValidExamImage(qPromptFile);
        if (invalid) throw new Error(invalid);
        promptPath = await uploadImageFile(examId, qPromptFile);
      }
      let choicePaths = editingQ.choice_image_paths ?? null;
      if (qType === 'mcq' && qChoiceFiles.some(Boolean)) {
        const uploaded = await Promise.all(
          qChoiceFiles.map((file, i) =>
            file ? uploadImageFile(examId, file) : Promise.resolve(choicePaths?.[i] ?? null),
          ),
        );
        choicePaths = uploaded;
      }
      await updateExamQuestion({
        questionId: editingQ.id,
        type: qType,
        prompt: qPrompt.trim(),
        choices: qType === 'mcq' ? qChoices.map((c) => c.trim()) : null,
        correctIndex: qType === 'mcq' ? Number(qCorrect) : null,
        maxScore: Number(qScore),
        promptImagePath: promptPath,
        choiceImagePaths: choicePaths,
      });
      showToast('تم حفظ السؤال', 'success');
      setEditingQ(null);
      restoreCreateSnapshot();
      await loadQuestions();
    } catch (error) {
      setEditError(error instanceof Error && error.message.includes('صورة') ? error.message : generalExamErrorMessage(error));
    } finally {
      setEditBusy(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!deletingQ) return;
    setDeleteQBusy(true);
    try {
      await deleteExamQuestion(deletingQ.id);
      showToast('تم حذف السؤال', 'success');
      setDeletingQ(null);
      await Promise.all([loadQuestions(), loadExam()]);
    } catch (error) {
      showToast(generalExamErrorMessage(error), 'error');
    } finally {
      setDeleteQBusy(false);
    }
  };

  const openGrading = (attempt: ExamAttempt) => {
    setGrading(attempt);
    setGradingError(null);
    const answers = answersByAttempt[attempt.id] ?? [];
    const initial: Record<string, string> = {};
    for (const answer of answers) {
      initial[answer.question_id] = answer.score != null ? String(answer.score) : '';
    }
    setGradingScores(initial);
  };

  const handleGrade = async () => {
    if (!grading) return;
    const essayQs = (questions ?? []).filter((q) => q.type === 'essay');
    const scores = essayQs.map((q) => ({
      questionId: q.id,
      score: Number(gradingScores[q.id] ?? ''),
    }));
    if (scores.some((s) => !Number.isFinite(s.score) || s.score < 0)) {
      setGradingError('أدخل درجة صالحة لكل سؤال مقالي');
      return;
    }
    const overMax = scores.some((s) => {
      const max = (questions ?? []).find((q) => q.id === s.questionId)?.max_score ?? 0;
      return s.score > max;
    });
    if (overMax) {
      setGradingError('إحدى الدرجات تتجاوز الدرجة العظمى للسؤال');
      return;
    }
    setGradingBusy(true);
    setGradingError(null);
    try {
      await gradeExam(grading.id, scores);
      showToast('تم تصحيح المحاولة', 'success');
      setGrading(null);
      await Promise.all([loadAttempts(), loadExam()]);
    } catch (error) {
      setGradingError(generalExamErrorMessage(error));
    } finally {
      setGradingBusy(false);
    }
  };

  const handleReset = async () => {
    if (!resetting || !examId) return;
    setResetBusy(true);
    try {
      await resetGeneralExamAttempt(examId, resetting.student_id);
      showToast('تمت إعادة المحاولة — يمكن للطالب الدخول من جديد', 'success');
      setResetting(null);
      await Promise.all([loadAttempts(), loadExam(), loadBoard()]);
    } catch (error) {
      showToast(generalExamErrorMessage(error), 'error');
    } finally {
      setResetBusy(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!examId || !exam) return;
    const mcq = Number(aiMcq);
    const essay = Number(aiEssay);
    if (aiMode === 'generate' && !aiTopic.trim()) {
      setAiError('اكتب موضوع الامتحان أولاً');
      return;
    }
    if (aiMode === 'format' && aiRaw.trim().length < 20) {
      setAiError('الصق نصاً كافياً (20 حرفاً على الأقل)');
      return;
    }
    if (
      !Number.isInteger(mcq) || !Number.isInteger(essay) ||
      mcq < 0 || mcq > 15 || essay < 0 || essay > 5 ||
      mcq + essay < 1 || mcq + essay > 20
    ) {
      setAiError('الأعداد غير صالحة — بحد أقصى 20 سؤالاً في المرة');
      return;
    }
    if (aiFiles.length > 3) {
      setAiError('بحد أقصى 3 صور في المرة الواحدة');
      return;
    }
    setAiBusy(true);
    setAiError(null);
    try {
      // 1) compress + upload attached images through the normal channel
      setAiProgress(aiFiles.length > 0 ? 'ضغط ورفع الصور...' : null);
      const paths: string[] = [];
      for (const file of aiFiles) {
        const invalid = isValidExamImage(file);
        if (invalid) throw new Error(invalid);
        const compressed = await compressSuggestionImage(file);
        const compact = new File([compressed], file.name, {
          type: compressed.type || file.type || 'image/jpeg',
        });
        paths.push(await uploadImageFile(examId, compact));
      }
      // 2) generate (draft questions only — nothing saved yet)
      setAiProgress('التوليد بالذكاء الاصطناعي...');
      const res = await generateExamQuestions({
        mode: aiMode,
        examId,
        topic: aiTopic.trim(),
        gradeName: exam.grade_name,
        mcqCount: mcq,
        essayCount: essay,
        difficulty: aiDifficulty,
        context: aiContext,
        rawText: aiRaw,
        imagePaths: paths,
      });
      // 3) direct save (admin decision: no preview step)
      const baseOrder = (questions ?? []).reduce((max, q) => Math.max(max, q.sort_order ?? 0), 0) + 1;
      let saved = 0;
      let needReview = 0;
      let failed = 0;
      for (let i = 0; i < res.questions.length; i += 1) {
        const generated = res.questions[i];
        setAiProgress(`حفظ الأسئلة ${i + 1}/${res.questions.length}...`);
        try {
          await createExamQuestion({
            examId,
            type: generated.type,
            prompt: generated.prompt,
            choices: generated.choices,
            correctIndex: generated.correct_index,
            maxScore: generated.max_score,
            sortOrder: baseOrder + i,
            promptImagePath: generated.prompt_image_path,
            choiceImagePaths: generated.choice_image_paths,
          });
          saved += 1;
          if (generated.needs_review) needReview += 1;
        } catch {
          failed += 1;
        }
      }
      await Promise.all([loadQuestions(), loadExam()]);
      if (failed === 0) {
        showToast(
          `تم توليد وحفظ ${saved} سؤال${needReview > 0 ? ` — ${needReview} منها يحتاج مراجعتك` : ''}`,
          needReview > 0 ? 'warning' : 'success',
        );
        setAiOpen(false);
        setAiTopic('');
        setAiContext('');
        setAiRaw('');
        setAiFiles([]);
      } else {
        setAiError(`تم حفظ ${saved} سؤال وفشل ${failed} — راجع القائمة ثم أعد المحاولة للباقي`);
      }
    } catch (error) {
      setAiError(generalExamErrorMessage(error));
    } finally {
      setAiBusy(false);
      setAiProgress(null);
    }
  };

  const totalScore = (questions ?? []).reduce((sum, q) => sum + Number(q.max_score ?? 0), 0);
  const essayQuestions = (questions ?? []).filter((q) => q.type === 'essay');
  const pendingAttempts = (attempts ?? []).filter((a) => a.status === 'submitted');

  if (loadError) {
    return (
      <LayoutShell title="تفاصيل الامتحان" variant="sidebar" nav={<RoleNav />}>
        <ErrorState message="تعذر تحميل الامتحان" onRetry={() => void loadExam()} />
      </LayoutShell>
    );
  }

  return (
    <LayoutShell
      title={exam?.title ?? 'تفاصيل الامتحان'}
      subtitle={exam ? `${exam.grade_name} • ${exam.question_count} سؤال • ${exam.attempt_count} محاولة` : undefined}
      variant="sidebar"
      nav={<RoleNav />}
      actions={
        <Link to="/walid/general-exams">
          <Button size="sm" variant="ghost" icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}>
            كل الامتحانات
          </Button>
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="tablist" aria-label="أقسام الامتحان" className="grid grid-cols-3 gap-2">
          {(
            [
              { id: 'questions', label: 'الأسئلة' },
              { id: 'attempts', label: `المحاولات${pendingAttempts.length ? ` (${pendingAttempts.length})` : ''}` },
              { id: 'leaderboard', label: 'الأوائل' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-xl px-3 py-3 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                tab === item.id
                  ? 'nav-pill-active text-white'
                  : 'glass-card text-foreground-muted hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'questions' ? (
          <div className="flex flex-col gap-4">
            {isAdmin ? (
              <div>
                <Button
                  variant="outline"
                  icon={<Sparkles aria-hidden="true" className="h-4 w-4" />}
                  onClick={() => {
                    setAiError(null);
                    setAiProgress(null);
                    setAiOpen(true);
                  }}
                >
                  توليد بالذكاء الاصطناعي
                </Button>
                <p className="mt-1 text-xs text-foreground-subtle">
                  متاح للأدمن فقط — التوليد يُحفظ مباشرة في الامتحان.
                </p>
              </div>
            ) : null}
            <Card title="سؤال جديد" subtitle="اختياري أو مقالي — مع صور اختيارية">
              {qPrompt.trim() ? (
                <p className="mb-3 rounded-xl border border-emerald-400/20 bg-emerald-400/8 px-3 py-2 text-xs font-bold text-emerald-300">
                  مسودتك محفوظة تلقائياً على هذا الجهاز — يمكنك الخروج والعودة لإكمالها.
                </p>
              ) : null}
              {detailsError ? (
                <ErrorState message="تعذر تحميل الأسئلة" onRetry={() => void loadQuestions()} />
              ) : (
                <div className="flex flex-col gap-3">
                  <Select label="نوع السؤال" value={qType} onChange={(e) => setQType(e.target.value as 'mcq' | 'essay')}>
                    <option value="mcq">اختياري (تصحيح تلقائي)</option>
                    <option value="essay">مقالي (تصحيح يدوي)</option>
                  </Select>
                  <Input
                    label="نص السؤال"
                    value={qPrompt}
                    onChange={(e) => setQPrompt(e.target.value)}
                    placeholder="اكتب السؤال هنا"
                  />
                  {qType === 'mcq' ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {qChoices.map((choice, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="general-correct"
                            aria-label={`الإجابة الصحيحة ${CHOICE_LABELS[i]}`}
                            checked={qCorrect === String(i)}
                            onChange={() => setQCorrect(String(i))}
                            className="h-5 w-5 shrink-0 accent-emerald-500"
                          />
                          <Input
                            label={`الاختيار ${CHOICE_LABELS[i]}`}
                            value={choice}
                            onChange={(e) =>
                              setQChoices((prev) => prev.map((c, j) => (j === i ? e.target.value : c)))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="الدرجة"
                      type="number"
                      inputMode="decimal"
                      min={0.5}
                      step={0.5}
                      value={qScore}
                      onChange={(e) => setQScore(e.target.value)}
                    />
                    <Input
                      label="صورة السؤال (اختياري)"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setQPromptFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  {qType === 'mcq' ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {CHOICE_LABELS.map((label, i) => (
                        <Input
                          key={label}
                          label={`صورة الاختيار ${label} (اختياري)`}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) =>
                            setQChoiceFiles((prev) => prev.map((f, j) => (j === i ? (e.target.files?.[0] ?? null) : f)))
                          }
                        />
                      ))}
                    </div>
                  ) : null}
                  {qError ? <p role="alert" className="text-sm font-bold text-rose-300">{qError}</p> : null}
                  <div>
                    <Button loading={qBusy} icon={<Plus aria-hidden="true" className="h-4 w-4" />} onClick={() => void handleCreateQuestion()}>
                      إضافة السؤال
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            {questions === null ? (
              <div className="flex flex-col gap-2" aria-hidden="true">
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            ) : questions.length === 0 ? (
              <EmptyState title="لا توجد أسئلة بعد" description="أضف أول سؤال من الأعلى — لن يُنشر الامتحان بدون أسئلة." />
            ) : (
              <ol className="flex flex-col gap-3">
                {questions.map((question, index) => (
                  <li key={question.id}>
                    <Card padding="sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-foreground">
                            {index + 1}. {question.prompt}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs">
                            <Badge variant={question.type === 'mcq' ? 'info' : 'warning'}>
                              {question.type === 'mcq' ? 'اختياري' : 'مقالي'}
                            </Badge>
                            <Badge variant="neutral">{question.max_score} درجة</Badge>
                            {question.prompt_image_path ? <Badge variant="success">صورة</Badge> : null}
                          </div>
                          {question.type === 'mcq' ? (
                            <ul className="mt-2 flex flex-col gap-1 text-sm">
                              {(question.choices ?? []).map((choice, i) => (
                                <li
                                  key={i}
                                  className={`rounded-lg px-2 py-1 ${
                                    i === question.correct_index
                                      ? 'bg-emerald-400/10 font-bold text-emerald-300'
                                      : 'text-foreground-muted'
                                  }`}
                                >
                                  {CHOICE_LABELS[i]}. {choice}
                                  {i === question.correct_index ? ' ✓' : ''}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {imageUrls[question.id]?.promptUrl ? (
                            <img
                              src={imageUrls[question.id].promptUrl ?? ''}
                              alt="صورة السؤال"
                              className="mt-2 max-h-48 rounded-xl border border-white/10"
                              loading="lazy"
                            />
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button size="sm" variant="ghost" icon={<Pencil aria-hidden="true" className="h-4 w-4" />} onClick={() => openEditQuestion(question)}>
                            تعديل
                          </Button>
                          <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden="true" className="h-4 w-4" />} onClick={() => setDeletingQ(question)}>
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
        ) : null}

        {tab === 'attempts' ? (
          <div className="flex flex-col gap-3">
            {attempts === null ? (
              <div className="flex flex-col gap-2" aria-hidden="true">
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </div>
            ) : attempts.length === 0 ? (
              <EmptyState title="لا توجد محاولات بعد" description="ستظهر محاولات الطلاب هنا فور دخولهم الامتحان." />
            ) : (
              <ol className="flex flex-col gap-3">
                {attempts.map((attempt) => {
                  // Never grade a never-submitted attempt (started the timer
                  // but sent no answers) — grading it would lock a 0 with no
                  // recourse. Staff can reset it instead.
                  const hasAnswers = (answersByAttempt[attempt.id] ?? []).length > 0;
                  return (
                  <li key={attempt.id}>
                    <Card padding="sm">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-foreground">{names[attempt.student_id] || 'طالب'}</p>
                          <Badge variant={attempt.status === 'graded' ? 'success' : 'warning'}>
                            {attempt.status === 'graded' ? `مصحح: ${attempt.final_score ?? 0}` : hasAnswers ? 'بانتظار التصحيح' : 'بدأ ولم يُرسل'}
                          </Badge>
                        </div>
                        <p className="text-xs text-foreground-subtle">
                          تلقائي: {attempt.auto_score ?? 0} • يدوي: {attempt.manual_score ?? '—'} • أُرسلت {formatDateTime(attempt.submitted_at)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {attempt.status !== 'graded' && essayQuestions.length > 0 && hasAnswers ? (
                            <Button size="sm" variant="secondary" onClick={() => openGrading(attempt)}>
                              تصحيح المقالي
                            </Button>
                          ) : null}
                          <Button size="sm" variant="ghost" icon={<Timer aria-hidden="true" className="h-4 w-4" />} onClick={() => setResetting(attempt)}>
                            إعادة المحاولة للطالب
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </li>
                  );
                })}
              </ol>
            )}
          </div>
        ) : null}

        {tab === 'leaderboard' ? (
          <LeaderboardCard rows={board} totalScore={totalScore || null} />
        ) : null}
      </div>

      <Modal
        open={editingQ !== null}
        title="تعديل السؤال"
        confirmLabel="حفظ"
        loading={editBusy}
        onConfirm={() => void handleEditQuestion()}
        onCancel={() => {
          setEditingQ(null);
          restoreCreateSnapshot();
        }}
      >
        <div className="flex flex-col gap-3">
          <Select label="نوع السؤال" value={qType} onChange={(e) => setQType(e.target.value as 'mcq' | 'essay')}>
            <option value="mcq">اختياري (تصحيح تلقائي)</option>
            <option value="essay">مقالي (تصحيح يدوي)</option>
          </Select>
          <Input label="نص السؤال" value={qPrompt} onChange={(e) => setQPrompt(e.target.value)} />
          {qType === 'mcq' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {qChoices.map((choice, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="general-edit-correct"
                    aria-label={`الإجابة الصحيحة ${CHOICE_LABELS[i]}`}
                    checked={qCorrect === String(i)}
                    onChange={() => setQCorrect(String(i))}
                    className="h-5 w-5 shrink-0 accent-emerald-500"
                  />
                  <Input
                    label={`الاختيار ${CHOICE_LABELS[i]}`}
                    value={choice}
                    onChange={(e) => setQChoices((prev) => prev.map((c, j) => (j === i ? e.target.value : c)))}
                  />
                </div>
              ))}
            </div>
          ) : null}
          <Input label="الدرجة" type="number" inputMode="decimal" min={0.5} step={0.5} value={qScore} onChange={(e) => setQScore(e.target.value)} />
          <Input
            label="استبدال صورة السؤال (اختياري)"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              setQPromptFile(e.target.files?.[0] ?? null);
              if (e.target.files?.[0]) setEditRemovePromptImage(false);
            }}
          />
          {editingQ?.prompt_image_path && !qPromptFile ? (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 text-sm font-bold">
              <span>إزالة الصورة الحالية</span>
              <input
                type="checkbox"
                checked={editRemovePromptImage}
                onChange={(event) => setEditRemovePromptImage(event.target.checked)}
                className="h-5 w-5 accent-rose-500"
              />
            </label>
          ) : null}
          {editError ? <p role="alert" className="text-sm font-bold text-rose-300">{editError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={deletingQ !== null}
        title="حذف السؤال؟"
        confirmLabel="حذف"
        danger
        loading={deleteQBusy}
        onConfirm={() => void handleDeleteQuestion()}
        onCancel={() => setDeletingQ(null)}
      />

      <Modal
        open={aiOpen}
        title="توليد أسئلة بالذكاء الاصطناعي"
        description="التوليد يُحفظ مباشرة في هذا الامتحان — راجع الأسئلة من القائمة بعد الحفظ."
        confirmLabel="توليد وحفظ مباشر"
        loading={aiBusy}
        onConfirm={() => void handleAiGenerate()}
        onCancel={() => setAiOpen(false)}
      >
        <div className="flex flex-col gap-3">
          <div role="tablist" aria-label="نمط التوليد" className="grid grid-cols-2 gap-2">
            {(
              [
                { id: 'generate', label: 'توليد من موضوع' },
                { id: 'format', label: 'تنسيق نص جاهز' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={aiMode === item.id}
                type="button"
                onClick={() => setAiMode(item.id)}
                className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                  aiMode === item.id
                    ? 'nav-pill-active text-white'
                    : 'glass-card text-foreground-muted hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {aiMode === 'generate' ? (
            <>
              <Input
                label="الموضوع"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder="مثال: قانون أوم — التيار والجهد والمقاومة"
                maxLength={300}
              />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-bold text-foreground">نص مرجعي (اختياري — يحسّن الدقة)</span>
                <textarea
                  value={aiContext}
                  onChange={(e) => setAiContext(e.target.value)}
                  rows={3}
                  placeholder="الصق نص الدرس أو الملزمة هنا ليولّد منها"
                  className="glass-input w-full rounded-xl border border-white/10 bg-white/4 px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  label="اختياري"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={15}
                  value={aiMcq}
                  onChange={(e) => setAiMcq(e.target.value)}
                />
                <Input
                  label="مقالي"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={5}
                  value={aiEssay}
                  onChange={(e) => setAiEssay(e.target.value)}
                />
                <Select
                  label="الصعوبة"
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value as AiDifficulty)}
                >
                  <option value="mixed">متنوعة</option>
                  <option value="easy">سهلة</option>
                  <option value="medium">متوسطة</option>
                  <option value="hard">صعبة</option>
                </Select>
              </div>
            </>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold text-foreground">النص الخام للأسئلة</span>
              <textarea
                value={aiRaw}
                onChange={(e) => setAiRaw(e.target.value)}
                rows={6}
                placeholder={'الصق الأسئلة هنا — مثال:\n1- وحدة قياس التيار؟ أ) فولت ب) أمبير ... الإجابة: أمبير'}
                className="glass-input w-full rounded-xl border border-white/10 bg-white/4 px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </label>
          )}

          <div className="flex flex-col gap-2">
            <Input
              label="صور مرفقة (اختياري — حتى 3)"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => setAiFiles(Array.from(e.target.files ?? []).slice(0, 3))}
            />
            {aiFiles.length > 0 ? (
              <ul className="flex flex-col gap-1 text-xs">
                {aiFiles.map((file, i) => (
                  <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/4 px-2 py-1.5">
                    <span className="truncate font-bold text-foreground-muted">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setAiFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 font-bold text-rose-300 hover:text-rose-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      إزالة
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-foreground-subtle">
              تُضغط الصور تلقائياً قبل الإرسال، والذكاء الاصطناعي يكتب أسئلة عنها ويربطها بها.
            </p>
          </div>

          {aiProgress ? (
            <p role="status" className="text-sm font-bold text-sky-300">{aiProgress}</p>
          ) : null}
          {aiError ? <p role="alert" className="text-sm font-bold text-rose-300">{aiError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={grading !== null}
        title="تصحيح المقالي"
        description={grading ? `الطالب: ${names[grading.student_id] || ''}` : undefined}
        confirmLabel="اعتماد التصحيح"
        loading={gradingBusy}
        onConfirm={() => void handleGrade()}
        onCancel={() => setGrading(null)}
      >
        <div className="flex flex-col gap-3">
          {(answersByAttempt[grading?.id ?? ''] ?? [])
            .filter((answer) => essayQuestions.some((q) => q.id === answer.question_id))
            .map((answer) => {
              const question = essayQuestions.find((q) => q.id === answer.question_id);
              return (
                <div key={answer.id} className="rounded-xl border border-white/8 bg-white/3 p-3">
                  <p className="text-sm font-bold text-foreground">{question?.prompt}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground-muted">{answer.answer_text}</p>
                  <div className="mt-2 max-w-40">
                    <Input
                      label={`الدرجة (العظمى ${question?.max_score})`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={Number(question?.max_score ?? 0)}
                      step={0.5}
                      value={gradingScores[answer.question_id] ?? ''}
                      onChange={(e) => setGradingScores((prev) => ({ ...prev, [answer.question_id]: e.target.value }))}
                    />
                  </div>
                </div>
              );
            })}
          {gradingError ? <p role="alert" className="text-sm font-bold text-rose-300">{gradingError}</p> : null}
          {grading ? (
            <p className="flex items-center gap-1 text-xs text-foreground-subtle">
              <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
              الاختياري مصحح تلقائياً ({grading.auto_score ?? 0}) — هنا المقال فقط.
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={resetting !== null}
        title="إعادة المحاولة للطالب؟"
        description="سيتم مسح إجابات هذه المحاولة نهائياً ليتمكن الطالب من الدخول من جديد."
        confirmLabel="إعادة"
        danger
        loading={resetBusy}
        onConfirm={() => void handleReset()}
        onCancel={() => setResetting(null)}
      />
    </LayoutShell>
  );
}
