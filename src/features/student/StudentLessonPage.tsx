import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  ListVideo,
  Lock,
  Play,
  Wallet,
  CreditCard,
  ExternalLink,
  Send,
  Receipt,
} from 'lucide-react';

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
import { YouTubeEmbed } from '../../components/YouTubeEmbed';
import { useToast } from '../../components/Toast';
import { WhatsAppIcon } from '../../components/WhatsAppIcon';
import { useAuth } from '../auth/AuthContext';
import { StudentLessonCommentsTab } from './StudentLessonCommentsTab';
import { StudentLessonExamsTab } from './StudentLessonExamsTab';
import {
  getLessonBoardSignedUrls,
  getLessonById,
  getMyLessonAccess,
  getMyProgress,
  getPdfSignedUrl,
  getPlaybackUrl,
  getPublicSettings,
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
  LessonBoardSignedUrl,
  LessonPdf,
  LessonVideo,
  PdfAccessResponse,
  PlaybackResponse,
  Progress,
  PublicSettings,
  Unit,
} from '../../types/database';
import { redeemErrorMessage } from './redeemErrors';

const PROGRESS_SAVE_INTERVAL_MS = 5000;
const COMPLETION_PERCENT = 90;

const WALLET_NUMBER = '01554416004';
const INSTAPAY_URL = 'https://ipn.eg/S/walidawny888/instapay/6a8lU0';
const WHATSAPP_RECEIPT_NUMBER = '+201205161216';
const WHATSAPP_RECEIPT_MESSAGE =
  'السلام عليكم مستر وليد، قمت بتحويل قيمة الوحدة وأريد استلام كود التفعيل. هذا هو إيصال التحويل:';

type LessonTab = 'exams' | 'comments';

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
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}

const tabs: Array<{ id: LessonTab; label: string }> = [
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
  const [extraVideos, setExtraVideos] = useState<LessonVideo[]>([]);
  const [primaryPdf, setPrimaryPdf] = useState<LessonPdf | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [contentLoading, setContentLoading] = useState(true);
  const [playback, setPlayback] = useState<PlaybackResponse | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [pdfAccess, setPdfAccess] = useState<PdfAccessResponse | null>(null);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [boards, setBoards] = useState<LessonBoardSignedUrl[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<LessonTab | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const lastSaveRef = useRef(0);
  const savingRef = useRef(false);
  const lastPositionRef = useRef(0);
  const requestIdRef = useRef(0);

  const allVideos = useMemo<LessonVideo[]>(() => {
    const list: LessonVideo[] = [];
    if (primaryVideo) list.push(primaryVideo);
    list.push(...extraVideos);
    return list;
  }, [primaryVideo, extraVideos]);

  const activeVideo = useMemo<LessonVideo | null>(() => {
    if (allVideos.length === 0) return null;
    if (activeVideoId) {
      const found = allVideos.find((v) => v.id === activeVideoId);
      if (found) return found;
    }
    return allVideos[0] ?? null;
  }, [allVideos, activeVideoId]);

  // Keep activeVideoId in sync when videos load
  useEffect(() => {
    if (allVideos.length === 0) {
      setActiveVideoId(null);
      return;
    }
    if (!activeVideoId || !allVideos.some((v) => v.id === activeVideoId)) {
      setActiveVideoId(allVideos[0].id);
    }
  }, [allVideos, activeVideoId]);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLesson(undefined);
    setAccess(null);
    setUnit(null);
    setSiblings([]);
    setPrimaryVideo(null);
    setExtraVideos([]);
    setPrimaryPdf(null);
    setProgress(null);
    setProgressLoaded(false);
    setContentLoading(true);
    setPlayback(null);
    setPlaybackError(null);
    setPdfAccess(null);
    setPdfFailed(false);
    setBoards(null);
    setLoadError(false);
    setActiveTab(null);
    setPdfPreviewOpen(false);
    setIsPlaylistOpen(false);
    setActiveVideoId(null);
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
        if (requestIdRef.current === requestId) {
          setContentLoading(false);
        }
        return;
      }
      setLesson(lessonRow);
      const accessResult = await getMyLessonAccess(lessonId);
      if (requestIdRef.current !== requestId) {
        return;
      }
      setAccess(accessResult);
      if (!accessResult.has_access) {
        if (requestIdRef.current === requestId) {
          setContentLoading(false);
        }
        return;
      }
      // Boards are best-effort: a failed fetch never breaks the lesson page.
      // Fired in parallel with the main content Promise.all below.
      void getLessonBoardSignedUrls(lessonRow.id)
        .then((rows) => {
          if (requestIdRef.current === requestId) {
            setBoards(Array.isArray(rows) ? rows : []);
          }
        })
        .catch(() => {
          if (requestIdRef.current === requestId) {
            setBoards([]);
          }
        });
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
      const readyVideos = videos.filter((video) => video.status === 'ready');
      setPrimaryVideo(readyVideos.find((video) => video.is_primary) ?? null);
      setExtraVideos(readyVideos.filter((video) => !video.is_primary));
      setPrimaryPdf(pdfs.find((pdf) => pdf.is_primary && pdf.is_ready) ?? null);
      setProgress(progressRow);
      setProgressLoaded(true);
      if (requestIdRef.current === requestId) {
        setContentLoading(false);
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setLoadError(true);
        setContentLoading(false);
      }
    }
  }, [lessonId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lesson || !activeVideo || activeVideo.source === 'youtube') {
      // For youtube we don't need playback fetch; clear stale state
      if (activeVideo?.source === 'youtube') {
        setPlayback(null);
        setPlaybackError(null);
      }
      return;
    }
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    setPlayback(null);
    setPlaybackError(null);
    const fetchWithRetry = (isRetry: boolean) => {
      getPlaybackUrl(lesson.id, activeVideo.id)
        .then((value) => {
          if (active) {
            setPlayback(value);
            setPlaybackError(null);
          }
        })
        .catch((error: unknown) => {
          if (!active) return;
          const code = errorCode(error) ?? 'playback_failed';
          // When the authoritative gate says has_access=true but the
          // Edge Function still returns access_denied, it's likely a
          // transient propagation / token lag. Don't flash the
          // "not subscribed" card — keep a neutral spinner and retry
          // once, then fall back to a generic retry UI.
          if (code === 'access_denied' && access?.has_access === true) {
            if (!isRetry) {
              setPlaybackError('access_checking');
              retryTimer = setTimeout(() => {
                if (active) fetchWithRetry(true);
              }, 350);
              return;
            }
            setPlaybackError('access_denied');
            return;
          }
          setPlaybackError(code);
        });
    };
    fetchWithRetry(false);
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [lesson, activeVideo, access]);

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

  const handlePdfDownload = useCallback(async () => {
    if (!pdfAccess || pdfDownloading) {
      return;
    }
    setPdfDownloading(true);
    try {
      const response = await fetch(pdfAccess.pdf_url);
      if (!response.ok) {
        throw new Error('pdf_download_failed');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = pdfAccess.original_name ?? 'lesson.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      // Last-resort fallback: open the signed URL directly; the browser
      // may render it inline instead of saving it.
      window.open(pdfAccess.pdf_url, '_blank', 'noopener,noreferrer');
    } finally {
      setPdfDownloading(false);
    }
  }, [pdfAccess, pdfDownloading]);

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

  // Access is still loading — show skeleton instead of flashing the lock screen.
  // This is especially important for trial lessons (is_trial): has_access will be
  // true after the DB fix via can_access_lesson even without a purchase, but
  // we must not render the lock state while the getMyLessonAccess RPC is in flight.
  if (access === null) {
    return (
      <LayoutShell title={lesson.title} variant="sidebar" nav={<StudentNav />}>
        <LessonPageSkeleton />
      </LayoutShell>
    );
  }

  // Authoritative gate: uses has_access (trial-aware via can_access_lesson),
  // never has_purchase. has_access already short-circuits true for is_trial.
  const hasAccess = access.has_access === true;

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

              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <h4 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                  <Receipt className="h-4 w-4 text-primary" />
                  طريقة الحصول على كود التفعيل
                </h4>
                <p className="mt-2 text-sm leading-6 text-foreground-muted">
                  حوّل قيمة الوحدة بإحدى الطريقتين التاليتين، ثم أرسل صورة الإيصال للمستر على
                  واتساب ليُرسل لك كود التفعيل{' '}
                  <span className="font-mono font-semibold text-foreground">WLDN-XXXX</span> مباشرة.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground-muted">
                      <Wallet className="h-3.5 w-3.5" />
                      تحويل على المحفظة
                    </span>
                    <span dir="ltr" className="font-mono text-base font-bold tracking-wider text-foreground">
                      {WALLET_NUMBER}
                    </span>
                    <a
                      href={`tel:${WALLET_NUMBER}`}
                      dir="ltr"
                      className="text-xs font-medium text-primary-strong hover:underline"
                    >
                      {WALLET_NUMBER}
                    </a>
                  </div>
                  <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground-muted">
                      <CreditCard className="h-3.5 w-3.5" />
                      تحويل عبر إنستاباي
                    </span>
                    <a
                      href={INSTAPAY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      dir="ltr"
                      className="inline-flex items-center gap-1.5 break-all text-sm font-medium text-primary-strong hover:underline"
                    >
                      <span>ipn.eg/S/walidawny888/instapay/6a8lU0</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                    <a
                      href={INSTAPAY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center gap-1 rounded-md border border-white/12 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-white/10"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      فتح رابط إنستاباي
                    </a>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-2 text-sm font-medium text-emerald-100">
                    <Send className="h-4 w-4 shrink-0" />
                    بعد التحويل، أرسل الإيصال على واتساب ليصلك الكود
                  </p>
                  <a
                    href={buildWhatsAppLink(WHATSAPP_RECEIPT_NUMBER, WHATSAPP_RECEIPT_MESSAGE)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    إرسال الإيصال على واتساب
                  </a>
                </div>
                <p className="mt-3 text-xs text-foreground-subtle">
                  رقم واتساب المستر لاستلام الكود:{' '}
                  <span dir="ltr" className="font-mono font-semibold text-foreground">
                    {WHATSAPP_RECEIPT_NUMBER}
                  </span>
                </p>
              </div>

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/student/curriculum"
            className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary-strong transition-colors hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
          >
            <DirectionalArrow direction="back" size={16} />
            المنهج الدراسي
          </Link>
          <div className="flex flex-wrap items-center gap-2">
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
        </div>

        {lesson.description ? (
          <p className="text-sm text-foreground-muted">{lesson.description}</p>
        ) : null}

        {/* === Course-style single player + playlist dropdown === */}
        {contentLoading ? (
          <div className="glass-card flex justify-center rounded-2xl p-8" data-testid="lesson-video-loading">
            <Spinner />
          </div>
        ) : allVideos.length > 0 && activeVideo ? (
          <div className="flex flex-col gap-3">
            {/* Main player: shows the currently selected video */}
            <div data-testid="active-video-player">
              {activeVideo.source === 'youtube' && activeVideo.youtube_video_id ? (
                <YouTubeEmbed
                  videoId={activeVideo.youtube_video_id}
                  title={activeVideo.title ?? 'فيديو الدرس'}
                />
              ) : playback && progressLoaded ? (
                <VideoPlayer
                  key={activeVideo.id}
                  src={playback.playback_url}
                  initialPosition={progress?.position_seconds ?? 0}
                  onProgress={handleProgress}
                  onComplete={handleComplete}
                />
              ) : playbackError === 'access_checking' ? (
                <div
                  className="glass-card flex flex-col items-center gap-3 rounded-2xl p-8"
                  data-testid="video-access-checking"
                >
                  <Spinner />
                  <p className="text-sm text-foreground-muted">جاري تأكيد الاشتراك...</p>
                </div>
              ) : playbackError === 'access_denied' ? (
                <div className="glass-card glass-tile-warning rounded-lg border p-4">
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
                <div className="glass-card rounded-2xl p-4" data-testid="video-not-ready">
                  <p className="text-sm text-foreground-muted">
                    الفيديو قيد التجهيز، حاول مرة أخرى لاحقًا.
                  </p>
                </div>
              ) : playbackError ? (
                <div className="glass-card rounded-2xl p-4" data-testid="video-error">
                  <p className="text-sm text-foreground-muted">
                    تعذر تحميل الفيديو. حاول مرة أخرى لاحقاً.
                  </p>
                </div>
              ) : (
                <div className="glass-card flex justify-center rounded-2xl p-8">
                  <Spinner />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                الآن يعرض: {activeVideo.title ?? 'فيديو الدرس'}
              </span>
            </div>

            {/* Playlist dropdown — visible only when there is more than one video */}
            {allVideos.length > 1 ? (
              <div
                className="glass-card overflow-hidden p-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
                data-testid="lesson-extra-videos"
              >
                <button
                  type="button"
                  onClick={() => setIsPlaylistOpen((value) => !value)}
                  aria-expanded={isPlaylistOpen}
                  data-testid="lesson-playlist-toggle"
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-start transition-colors hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset sm:px-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
                      <ListVideo className="h-5 w-5" />
                    </span>
                    <div className="text-start">
                      <h3 className="font-display text-sm font-bold leading-5 text-foreground sm:text-[15px]">
                        محتوى الدرس
                      </h3>
                      <p className="mt-0.5 text-xs leading-4 text-foreground-muted">
                        {allVideos.length} فيديو · {isPlaylistOpen ? 'اضغط للإخفاء' : 'اختر فيديو للمشاهدة'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="info" className="hidden sm:inline-flex">
                      {allVideos.length} فيديو
                    </Badge>
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full border bg-white/5 text-foreground-muted transition-transform duration-200 ${isPlaylistOpen ? 'rotate-180 border-primary/20 bg-primary/15 text-primary' : 'border-white/10'}`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </div>
                </button>

                {isPlaylistOpen ? (
                  <div
                    className="border-t border-white/10 bg-white/[0.02] p-2 sm:p-3"
                    data-testid="extra-video-list"
                  >
                    <ol className="flex flex-col gap-2">
                      {allVideos.map((video, idx) => {
                        const isActive = video.id === activeVideo.id;
                        const num = String(idx + 1).padStart(2, '0');
                        return (
                          <li key={video.id}>
                            <button
                              type="button"
                              onClick={() => setActiveVideoId(video.id)}
                              aria-current={isActive ? 'true' : undefined}
                              data-testid={`playlist-item-${video.id}`}
                              // keep legacy ids for backwards compat where possible
                              data-legacy-testid={`extra-video-toggle-${video.id}`}
                              className={`group flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-start transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:px-4 ${
                                isActive
                                  ? 'border-primary/30 bg-primary/[0.08] shadow-[0_4px_16px_rgba(16,185,129,0.15)]'
                                  : 'border-white/10 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]'
                              }`}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <span
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold tabular-nums transition-colors ${
                                    isActive
                                      ? 'border-primary/30 bg-primary text-white shadow-sm'
                                      : 'border-primary/20 bg-primary/15 text-primary'
                                  }`}
                                >
                                  {isActive ? <Play className="h-3.5 w-3.5 fill-current" /> : num}
                                </span>
                                <div className="min-w-0 flex-1 text-start">
                                  <p
                                    className={`truncate text-sm font-semibold leading-5 ${isActive ? 'text-foreground' : 'text-foreground'}`}
                                  >
                                    {video.title ?? 'فيديو الدرس'}
                                  </p>
                                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-foreground-muted">
                                    <Play className="h-3 w-3 shrink-0 fill-current text-primary" />
                                    <span>درس {idx + 1}</span>
                                    {isActive ? (
                                      <span className="inline-flex items-center gap-1 font-medium text-primary">
                                        · قيد التشغيل
                                      </span>
                                    ) : (
                                      <span className="hidden sm:inline">· اضغط للمشاهدة</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <Badge
                                  variant={isActive ? 'success' : 'neutral'}
                                  className="hidden text-[11px] sm:inline-flex"
                                >
                                  {isActive ? 'يعرض الآن' : 'فيديو'}
                                </Badge>
                                <span
                                  className={`hidden h-2 w-2 shrink-0 rounded-full sm:inline-block ${isActive ? 'bg-primary shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-white/20'}`}
                                  aria-hidden="true"
                                />
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {!contentLoading && !primaryVideo && extraVideos.length === 0 && !primaryPdf ? (
          <div className="glass-card rounded-2xl p-4">
            <p className="text-sm text-foreground-muted">لم يتم إضافة محتوى لهذا الدرس بعد.</p>
          </div>
        ) : null}

        {primaryPdf ? (
          <Card
            title="ملف الدرس"
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPdfPreviewOpen((open) => !open)}
                  aria-expanded={pdfPreviewOpen}
                  className="glass-soft inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                  data-testid="lesson-pdf-toggle"
                >
                  {pdfPreviewOpen ? (
                    <EyeOff aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <Eye aria-hidden="true" className="h-4 w-4" />
                  )}
                  {pdfPreviewOpen ? 'إخفاء المعاينة' : 'معاينة'}
                </button>
                {pdfAccess ? (
                  <a
                    href={pdfAccess.pdf_url}
                    download={pdfAccess.original_name ?? 'lesson.pdf'}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => {
                      event.preventDefault();
                      void handlePdfDownload();
                    }}
                    className="btn-primary inline-flex w-fit items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                    data-testid="lesson-pdf-download"
                  >
                    <Download aria-hidden="true" className="h-4 w-4" />
                    {pdfDownloading ? 'جاري التحضير...' : 'تحميل الملف'}
                  </a>
                ) : null}
              </div>
            }
          >
            {pdfAccess ? (
              <div className="flex flex-col gap-3">
                {pdfPreviewOpen ? (
                  <iframe
                    src={pdfAccess.pdf_url}
                    title="ملف الدرس"
                    className="h-72 w-full rounded-lg border border-white/15 bg-white/5 sm:h-96"
                    data-testid="lesson-pdf-frame"
                  />
                ) : null}
                <p className="text-sm text-foreground-muted">
                  {pdfAccess.original_name ?? 'ملف الدرس'}
                </p>
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

        {boards && boards.length > 0 ? (
          <Card title="سبورة الدرس">
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
              data-testid="board-grid"
            >
              {boards.map((board) => (
                <img
                  key={board.board_id}
                  src={board.signed_url}
                  alt={board.original_name}
                  loading="lazy"
                  className="aspect-video w-full rounded-lg border border-white/15 bg-white/5 object-cover transition-transform duration-300 hover:scale-[1.03]"
                  data-testid={`board-image-${board.board_id}`}
                />
              ))}
            </div>
          </Card>
        ) : null}

        <div
          role="tablist"
          aria-label="أنشطة الدرس"
          className="flex w-full flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/4 p-1 sm:w-fit"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(activeTab === tab.id ? null : tab.id)}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:flex-none ${
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
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2" data-testid="lesson-nav">
          {prevLesson ? (
            <Link
              to={`/student/lessons/${prevLesson.id}`}
              className="glass-soft inline-flex items-center justify-start gap-1.5 rounded-lg px-4 py-3 text-sm font-medium text-foreground-muted transition-colors hover:bg-white/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
              data-testid="prev-lesson"
            >
              <DirectionalArrow direction="back" size={16} />
              الدرس السابق: {prevLesson.title}
            </Link>
          ) : null}
          {nextLesson ? (
            <Link
              to={`/student/lessons/${nextLesson.id}`}
              className="glass-soft inline-flex items-center justify-end gap-1.5 rounded-lg px-4 py-3 text-sm font-medium text-foreground-muted transition-colors hover:bg-white/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong sm:justify-start"
              data-testid="next-lesson"
            >
              الدرس التالي: {nextLesson.title}
              <DirectionalArrow direction="forward" size={16} />
            </Link>
          ) : null}
        </div>
      </div>
    </LayoutShell>
  );
}
