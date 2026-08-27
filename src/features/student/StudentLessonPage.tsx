import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, Eye, EyeOff, Lock, Wallet, CreditCard, ExternalLink, Send, Receipt } from 'lucide-react';

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

function ExtraVideoRow({ lessonId, video }: { lessonId: string; video: LessonVideo }) {
  if (video.source === 'youtube' && video.youtube_video_id) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{video.title ?? 'فيديو الدرس'}</p>
          <Badge variant="info">يوتيوب</Badge>
        </div>
        <YouTubeEmbed videoId={video.youtube_video_id} title={video.title ?? 'فيديو الدرس'} />
      </div>
    );
  }
  return <ExtraBunnyVideoRow lessonId={lessonId} video={video} />;
}

function ExtraBunnyVideoRow({ lessonId, video }: { lessonId: string; video: LessonVideo }) {
  const [playback, setPlayback] = useState<PlaybackResponse | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getPlaybackUrl(lessonId, video.id)
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
  }, [lessonId, video.id]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{video.title ?? 'فيديو الدرس'}</p>
        <Badge variant="info">Bunny</Badge>
      </div>
      {playback ? (
        <VideoPlayer src={playback.playback_url} />
      ) : playbackError === 'video_not_ready' ? (
        <div className="glass-card rounded-2xl p-4">
          <p className="text-sm text-foreground-muted">الفيديو قيد التجهيز</p>
        </div>
      ) : playbackError ? (
        <div className="glass-card rounded-2xl p-4">
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
  );
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
    setExtraVideos([]);
    setPrimaryPdf(null);
    setProgress(null);
    setProgressLoaded(false);
    setPlayback(null);
    setPlaybackError(null);
    setPdfAccess(null);
    setPdfFailed(false);
    setBoards(null);
    setLoadError(false);
    setActiveTab(null);
    setPdfPreviewOpen(false);
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
    if (!lesson || !primaryVideo || primaryVideo.source === 'youtube') {
      return;
    }
    let active = true;
    getPlaybackUrl(lesson.id, primaryVideo.id)
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

        {primaryVideo ? (
          primaryVideo.source === 'youtube' && primaryVideo.youtube_video_id ? (
            <YouTubeEmbed
              videoId={primaryVideo.youtube_video_id}
              title={primaryVideo.title ?? 'فيديو الدرس'}
            />
          ) : playback && progressLoaded ? (
            <VideoPlayer
              src={playback.playback_url}
              initialPosition={progress?.position_seconds ?? 0}
              onProgress={handleProgress}
              onComplete={handleComplete}
            />
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
            <div className="glass-card rounded-2xl p-4">
              <p className="text-sm text-foreground-muted">
                الفيديو قيد التجهيز، حاول مرة أخرى لاحقًا.
              </p>
            </div>
          ) : playbackError ? (
            <div className="glass-card rounded-2xl p-4">
              <p className="text-sm text-foreground-muted">
                تعذر تحميل الفيديو. حاول مرة أخرى لاحقًا.
              </p>
            </div>
          ) : (
            <div className="glass-card flex justify-center rounded-2xl p-8">
              <Spinner />
            </div>
          )
        ) : null}

        {extraVideos.length > 0 ? (
          <Card title="فيديوهات الدرس" data-testid="lesson-extra-videos">
            <div className="flex flex-col gap-4" data-testid="extra-video-list">
              {extraVideos.map((video) => (
                <ExtraVideoRow key={video.id} lessonId={lesson.id} video={video} />
              ))}
            </div>
          </Card>
        ) : null}

        {!primaryVideo && !primaryPdf ? (
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
