import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileText, Lock } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { DirectionalArrow } from '../../components/DirectionalArrow';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { RedeemCodeForm } from '../../components/RedeemCodeForm';
import { Skeleton } from '../../components/Skeleton';
import { Spinner } from '../../components/Spinner';
import { StudentNav } from '../../components/StudentNav';
import { VideoPlayer } from '../../components/VideoPlayer';
import { useToast } from '../../components/Toast';
import { WhatsAppIcon } from '../../components/WhatsAppIcon';
import { useAuth } from '../auth/AuthContext';
import { StudentLessonCommentsTab } from './StudentLessonCommentsTab';
import { StudentLessonExamsTab } from './StudentLessonExamsTab';
import {
  getLessonById,
  getMyLessonAccess,
  getMyProgress,
  getPdfSignedUrl,
  getPlaybackUrl,
  getPublicSettings,
  getRpcErrorCode,
  getUnitById,
  listLessonPdfs,
  listLessonsForUnit,
  listLessonVideos,
  redeemUnitCode,
  upsertProgress,
} from '../../data/rpc';
import { buildWhatsAppLink, formatPrice } from '../../lib/format';
import type {
  Lesson,
  LessonAccessInfo,
  LessonPdf,
  LessonVideo,
  PdfAccessResponse,
  PlaybackResponse,
  Progress,
  PublicSettings,
  Unit,
} from '../../types/database';

const PROGRESS_SAVE_INTERVAL_MS = 5000;
const COMPLETION_PERCENT = 90;

type LessonTab = 'lesson' | 'exams' | 'comments';

const REDEEM_ERROR_MESSAGES: Record<string, string> = {
  code_not_found: 'الكود غير صالح',
  code_already_used: 'تم استخدام هذا الكود بالفعل',
  code_revoked: 'تم إلغاء هذا الكود',
  unit_not_found: 'الوحدة المطلوبة غير موجودة',
  unit_inactive: 'هذه الوحدة غير متاحة حاليًا',
  unit_purchased: 'لقد قمت بشراء هذه الوحدة بالفعل',
  no_grade_assigned: 'لم يتم تحديد صفك الدراسي بعد — تواصل مع الأستاذ',
};

function redeemErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && REDEEM_ERROR_MESSAGES[code]) {
    return REDEEM_ERROR_MESSAGES[code];
  }
  return 'تعذر تفعيل الوحدة. حاول مرة أخرى';
}

function errorCode(error: unknown): string | null {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) {
      return code;
    }
  }
  return null;
}

function LessonPageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-6 w-2/3" />
      <div className="glass-card aspect-video w-full overflow-hidden rounded-2xl p-0">
        <Skeleton className="h-full w-full rounded-none" />
      </div>
      <div className="glass-card space-y-3 p-4 sm:p-6">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

const tabs: Array<{ id: LessonTab; label: string }> = [
  { id: 'lesson', label: 'الدرس' },
  { id: 'exams', label: 'الامتحان' },
  { id: 'comments', label: 'الأسئلة' },
];

export function StudentLessonPage() {
  const { lessonId = '' } = useParams();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [lesson, setLesson] = useState<Lesson | null | undefined>(undefined);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [siblings, setSiblings] = useState<Lesson[]>([]);
  const [access, setAccess] = useState<LessonAccessInfo | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [primaryVideo, setPrimaryVideo] = useState<LessonVideo | null>(null);
  const [primaryPdf, setPrimaryPdf] = useState<LessonPdf | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [playback, setPlayback] = useState<PlaybackResponse | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [pdfAccess, setPdfAccess] = useState<PdfAccessResponse | null>(null);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<LessonTab>('lesson');
  const lastSaveRef = useRef(0);
  const savingRef = useRef(false);
  const lastPositionRef = useRef(0);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLesson(undefined);
    setAccess(null);
    setUnit(null);
    setSiblings([]);
    setPrimaryVideo(null);
    setPrimaryPdf(null);
    setProgress(null);
    setProgressLoaded(false);
    setPlayback(null);
    setPlaybackError(null);
    setPdfAccess(null);
    setPdfFailed(false);
    setLoadError(false);
    setActiveTab('lesson');
    try {
      const [lessonRow, settingsRow] = await Promise.all([
        getLessonById(lessonId),
        getPublicSettings(),
      ]);
      if (requestIdRef.current !== requestId) {
        return;
      }
      setSettings(settingsRow);
      if (!lessonRow) {
        setLesson(null);
        return;
      }
      setLesson(lessonRow);
      const accessResult = await getMyLessonAccess(lessonId);
      if (requestIdRef.current !== requestId) {
        return;
      }
      setAccess(accessResult);
      if (!accessResult.has_access) {
        return;
      }
      const [unitRow, lessonRows, videos, pdfs, progressRow] = await Promise.all([
        getUnitById(lessonRow.unit_id),
        listLessonsForUnit(lessonRow.unit_id),
        listLessonVideos(lessonRow.id),
        listLessonPdfs(lessonRow.id),
        getMyProgress(lessonRow.id),
      ]);
      if (requestIdRef.current !== requestId) {
        return;
      }
      setUnit(unitRow);
      setSiblings(
        lessonRows
          .filter((row) => row.status === 'published')
          .sort((a, b) => a.sort_order - b.sort_order),
      );
      setPrimaryVideo(
        videos.find((video) => video.is_primary && video.status === 'ready') ?? null,
      );
      setPrimaryPdf(pdfs.find((pdf) => pdf.is_primary && pdf.is_ready) ?? null);
      setProgress(progressRow);
      setProgressLoaded(true);
    } catch {
      if (requestIdRef.current === requestId) {
        setLoadError(true);
      }
    }
  }, [lessonId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lesson || !primaryVideo) {
      return;
    }
    let active = true;
    getPlaybackUrl(lesson.id)
      .then((value) => {
        if (active) {
          setPlayback(value);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setPlaybackError(errorCode(error) ?? 'playback_failed');
        }
      });
    return () => {
      active = false;
    };
  }, [lesson, primaryVideo]);

  useEffect(() => {
    if (!lesson || !primaryPdf) {
      return;
    }
    let active = true;
    getPdfSignedUrl(lesson.id)
      .then((value) => {
        if (active) {
          setPdfAccess(value);
        }
      })
      .catch(() => {
        if (active) {
          setPdfFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [lesson, primaryPdf]);

  const saveProgress = useCallback(
    async (position: number, percent: number) => {
      if (!lesson) {
        return;
      }
      const now = Date.now();
      if (now - lastSaveRef.current < PROGRESS_SAVE_INTERVAL_MS && percent < COMPLETION_PERCENT) {
        return;
      }
      lastSaveRef.current = now;
      if (savingRef.current) {
        return;
      }
      savingRef.current = true;
      try {
        const updated = await upsertProgress(lesson.id, position, percent);
        const wasCompleted = progress?.is_completed ?? false;
        setProgress(updated);
        if (updated.is_completed && !wasCompleted) {
          showToast('أحسنت! تم إكمال الدرس', 'success');
        }
      } catch {
        // progress is best-effort; a failed save never blocks playback
      } finally {
        savingRef.current = false;
      }
    },
    [lesson, progress?.is_completed, showToast],
  );

  const handleProgress = useCallback(
    (position: number, percent: number) => {
      lastPositionRef.current = position;
      void saveProgress(position, percent);
    },
    [saveProgress],
  );

  const handleComplete = useCallback(() => {
    void saveProgress(lastPositionRef.current, 100);
  }, [saveProgress]);

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

  if (loadError) {
    return (
      <LayoutShell title="الدرس" variant="sidebar" nav={<StudentNav />}>
        <ErrorState message="تعذر تحميل الدرس" onRetry={() => void load()} />
      </LayoutShell>
    );
  }

  if (lesson === undefined) {
    return (
      <LayoutShell title="الدرس" variant="sidebar" nav={<StudentNav />}>
        <LessonPageSkeleton />
      </LayoutShell>
    );
  }

  if (lesson === null) {
    return (
      <LayoutShell title="الدرس" variant="sidebar" nav={<StudentNav />}>
        <EmptyState title="الدرس غير موجود" description="ربما تم حذف هذا الدرس أو لم يعد متاحًا." />
      </LayoutShell>
    );
  }

  const hasAccess = access?.has_access === true;

  if (!hasAccess) {
    return (
      <LayoutShell title={lesson.title} subtitle={unit?.name ?? undefined} variant="sidebar" nav={<StudentNav />}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/student/curriculum"
              className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary-strong transition-colors hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
            >
              <DirectionalArrow direction="back" size={16} />
              المنهج الدراسي
            </Link>
          </div>
          <Card title="هذه الوحدة غير مفعّلة">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning"
                  >
                    <Lock className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">
                      {access?.unit_name ?? lesson.title}
                    </p>
                    <p className="mt-0.5 text-sm text-foreground-muted">
                      تحتاج تفعيل الوحدة بكود أو التواصل مع الأستاذ لمتابعة هذا الدرس.
                    </p>
                  </div>
                </div>
                {access?.price != null ? (
                  <span className="text-sm font-semibold text-foreground" dir="ltr">
                    {formatPrice(access.price)}
                  </span>
                ) : null}
              </div>
              {settings?.whatsapp_number ? (
                <a
                  href={buildWhatsAppLink(
                    settings.whatsapp_number,
                    `${settings.whatsapp_default_message ?? ''} — وحدة ${access?.unit_name ?? lesson.title}`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary inline-flex w-fit items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                >
                  <WhatsAppIcon size={18} />
                  تواصل عبر واتساب لتفعيل الوحدة
                </a>
              ) : null}
              <RedeemCodeForm
                onSubmit={(code) => handleRedeem(code)}
                busy={redeemBusy}
                error={redeemError}
              />
            </div>
          </Card>
        </div>
      </LayoutShell>
    );
  }

  const currentIndex = siblings.findIndex((row) => row.id === lesson.id);
  const prevLesson = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const nextLesson =
    currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

  return (
    <LayoutShell title={lesson.title} subtitle={unit?.name ?? undefined} variant="sidebar" nav={<StudentNav />}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/student/curriculum"
            className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary-strong transition-colors hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
          >
            <DirectionalArrow direction="back" size={16} />
            المنهج الدراسي
          </Link>
          {access?.is_trial ? (
            <Badge variant="info" data-testid="trial-lesson-badge">
              درس تجريبي
            </Badge>
          ) : null}
          {progress?.is_completed ? (
            <Badge variant="success" data-testid="lesson-completed-badge">
              مكتمل
            </Badge>
          ) : progress && progress.percent_completed > 0 ? (
            <Badge variant="warning" data-testid="lesson-percent-badge">
              {Math.round(progress.percent_completed)}٪
            </Badge>
          ) : null}
        </div>

        {lesson.description ? (
          <p className="text-sm text-foreground-muted">{lesson.description}</p>
        ) : null}

        <div
          role="tablist"
          aria-label="محتوى الدرس"
          className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/4 p-1"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                activeTab === tab.id
                  ? 'nav-pill-active font-bold text-white'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
              data-testid={`lesson-tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'exams' ? (
          <StudentLessonExamsTab lessonId={lesson.id} />
        ) : activeTab === 'comments' ? (
          <StudentLessonCommentsTab lessonId={lesson.id} userId={user?.id ?? ''} />
        ) : (
          <>
            {primaryVideo ? (
              <Card title="الفيديو">
                {playback && progressLoaded ? (
                  <VideoPlayer
                    src={playback.playback_url}
                    initialPosition={progress?.position_seconds ?? 0}
                    onProgress={handleProgress}
                    onComplete={handleComplete}
                  />
                ) : playbackError === 'access_denied' ? (
                  <div className="glass-tile-warning rounded-lg border p-4">
                    <p className="text-sm font-medium text-amber-300">هذا الدرس غير متاح حاليًا</p>
                    <p className="mt-1 text-sm text-amber-200">
                      قد لا تكون الوحدة مفعّلة بعد. فعّل الوحدة من صفحة وحداتي للمتابعة.
                    </p>
                    <Link
                      to="/student/units"
                      className="mt-3 inline-block rounded-lg border border-warning/40 bg-white/5 px-4 py-2.5 text-sm font-semibold text-warning transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                      data-testid="units-link"
                    >
                      الانتقال إلى وحداتي
                    </Link>
                  </div>
                ) : playbackError === 'video_not_ready' ? (
                  <p className="text-sm text-foreground-muted">
                    الفيديو قيد التجهيز، حاول مرة أخرى لاحقًا.
                  </p>
                ) : playbackError ? (
                  <p className="text-sm text-foreground-muted">
                    تعذر تحميل الفيديو. حاول مرة أخرى لاحقًا.
                  </p>
                ) : (
                  <Spinner />
                )}
              </Card>
            ) : null}

            {primaryPdf ? (
              <Card
                title="ملف الدرس"
                actions={<FileText aria-hidden="true" className="h-5 w-5 text-foreground-subtle" />}
              >
                {pdfAccess ? (
                  <div className="flex flex-col gap-3">
                    <iframe
                      src={pdfAccess.pdf_url}
                      title="ملف الدرس"
                      className="h-[500px] w-full rounded-lg border border-white/15 bg-white/5"
                      data-testid="lesson-pdf-frame"
                    />
                    <a
                      href={pdfAccess.pdf_url}
                      download={pdfAccess.original_name ?? 'lesson.pdf'}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-primary inline-flex w-fit items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                      data-testid="lesson-pdf-download"
                    >
                      <Download aria-hidden="true" className="h-4 w-4" />
                      تحميل الملف
                    </a>
                  </div>
                ) : pdfFailed ? (
                  <p className="text-sm text-foreground-muted">
                    تعذر تحميل ملف الدرس. حاول مرة أخرى لاحقًا.
                  </p>
                ) : (
                  <Spinner />
                )}
              </Card>
            ) : null}

            {!primaryVideo && !primaryPdf ? (
              <Card title="محتوى الدرس">
                <p className="text-sm text-foreground-muted">لم يتم إضافة محتوى لهذا الدرس بعد.</p>
              </Card>
            ) : null}

            <div className="flex items-center justify-between gap-3" data-testid="lesson-nav">
              {prevLesson ? (
                <Link
                  to={`/student/lessons/${prevLesson.id}`}
                  className="glass-soft inline-flex items-center gap-1.5 rounded-lg px-4 py-3 text-sm font-medium text-foreground-muted transition-colors hover:bg-white/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                  data-testid="prev-lesson"
                >
                  <DirectionalArrow direction="back" size={16} />
                  الدرس السابق: {prevLesson.title}
                </Link>
              ) : (
                <span />
              )}
              {nextLesson ? (
                <Link
                  to={`/student/lessons/${nextLesson.id}`}
                  className="glass-soft inline-flex items-center gap-1.5 rounded-lg px-4 py-3 text-sm font-medium text-foreground-muted transition-colors hover:bg-white/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                  data-testid="next-lesson"
                >
                  الدرس التالي: {nextLesson.title}
                  <DirectionalArrow direction="forward" size={16} />
                </Link>
              ) : null}
            </div>
          </>
        )}
      </div>
    </LayoutShell>
  );
}
