import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Upload as TusUpload } from 'tus-js-client';
import { Eye, FileUp, RefreshCw, Replace, Video as VideoIcon } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DirectionalArrow } from '../../components/DirectionalArrow';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { LessonStatusBadge } from '../../components/LessonStatusBadge';
import { Modal } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';
import { Spinner } from '../../components/Spinner';
import { StaffNav } from '../../components/StaffNav';
import { useToast } from '../../components/Toast';
import {
  cancelVideoUploadSession,
  createVideoUploadSession,
  finalizePdfUpload,
  getLessonById,
  getPlaybackUrl,
  getRpcErrorCode,
  getVideoThumbnailUrl,
  listLessonPdfs,
  listLessonVideos,
  uploadPdf,
  uploadPdfBytes,
} from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type {
  Lesson,
  LessonPdf,
  LessonVideo,
  VideoStatus,
  VideoUploadSession,
} from '../../types/database';

const PDF_ERROR_MESSAGES: Record<string, string> = {
  lesson_not_found: 'الدرس غير موجود',
  lesson_deleted: 'الدرس محذوف',
  invalid_file_name: 'اسم الملف غير صالح',
  validation_error: 'بيانات غير صالحة',
  invalid_json: 'بيانات غير صالحة',
  file_too_large: 'حجم الملف يتجاوز الحد المسموح (50 ميجابايت)',
  function_error: 'تعذر تنفيذ العملية. حاول مرة أخرى',
  unauthorized: 'انتهت الجلسة — يرجى تسجيل الدخول مرة أخرى',
  account_inactive_or_deleted: 'الحساب غير نشط أو تم حذفه',
  access_denied: 'ليست لديك صلاحية',
  permission_denied: 'ليست لديك صلاحية',
  pdf_not_found: 'ملف PDF غير موجود',
  pdf_upload_failed: 'فشل رفع الملف إلى التخزين. حاول مرة أخرى',
  upload_url_failed: 'فشل إنشاء رابط الرفع. حاول مرة أخرى',
  pdf_reservation_failed: 'فشل إنشاء سجل الملف. حاول مرة أخرى',
};

const VIDEO_ERROR_MESSAGES: Record<string, string> = {
  permission_denied: 'ليست لديك صلاحية',
  account_inactive_or_deleted: 'الحساب غير نشط أو تم حذفه',
  lesson_not_found: 'الدرس غير موجود',
  lesson_deleted: 'الدرس محذوف',
  lesson_has_pending_upload: 'يوجد رفع قيد التنفيذ بالفعل لهذا الدرس',
  old_video_not_found: 'الفيديو القديم غير موجود',
  wrong_lesson: 'الفيديو لا ينتمي لهذا الدرس',
  bunny_create_failed: 'فشل إنشاء جلسة الرفع. حاول مرة أخرى',
  video_not_ready: 'الفيديو غير جاهز بعد',
  video_not_found: 'جلسة الرفع غير موجودة',
  video_not_pending: 'جلسة الرفع لم تعد قيد الانتظار',
  session_cancel_failed: 'تعذر إلغاء جلسة الرفع. حاول مرة أخرى',
  upload_failed: 'فشل رفع الفيديو. حاول مرة أخرى',
  function_error: 'تعذر تنفيذ العملية. حاول مرة أخرى',
  unauthorized: 'انتهت الجلسة — يرجى تسجيل الدخول مرة أخرى',
};

const VIDEO_STATUS_LABELS: Record<VideoStatus, string> = {
  pending_upload: 'قيد الرفع',
  uploading: 'قيد الرفع',
  processing: 'قيد المعالجة',
  ready: 'جاهز',
  failed: 'فشل',
  replaced: 'مستبدل',
};

const VIDEO_STATUS_BADGE_VARIANT: Record<
  VideoStatus,
  'success' | 'warning' | 'info' | 'neutral' | 'error'
> = {
  pending_upload: 'warning',
  uploading: 'warning',
  processing: 'info',
  ready: 'success',
  failed: 'error',
  replaced: 'neutral',
};

function pdfErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && PDF_ERROR_MESSAGES[code]) {
    return PDF_ERROR_MESSAGES[code];
  }
  return 'تعذر رفع الملف. حاول مرة أخرى';
}

function videoErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && VIDEO_ERROR_MESSAGES[code]) {
    return VIDEO_ERROR_MESSAGES[code];
  }
  return 'تعذر تنفيذ العملية. حاول مرة أخرى';
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) {
    return '—';
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
}

function formatMib(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) {
    return '';
  }
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function isVideoFile(file: File): boolean {
  const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
  return videoTypes.includes(file.type) || /\.(mp4|webm|mov)$/i.test(file.name);
}

type UploadStage = 'idle' | 'requesting' | 'uploading' | 'finalizing';

const STAGE_LABELS: Record<Exclude<UploadStage, 'idle'>, string> = {
  requesting: 'جاري إنشاء رابط الرفع...',
  uploading: 'جاري رفع الملف...',
  finalizing: 'جاري تأكيد الملف...',
};

type VideoUploadStage = 'idle' | 'requesting' | 'uploading' | 'done' | 'failed';

interface VideoUploadState {
  stage: VideoUploadStage;
  file: File | null;
  error: string | null;
  progress: number;
  bytesSent: number;
  bytesTotal: number;
  session: VideoUploadSession | null;
  mode: 'create' | 'replace';
  oldVideoId: string | null;
}

const INITIAL_VIDEO_UPLOAD: VideoUploadState = {
  stage: 'idle',
  file: null,
  error: null,
  progress: 0,
  bytesSent: 0,
  bytesTotal: 0,
  session: null,
  mode: 'create',
  oldVideoId: null,
};

interface PreviewState {
  loading: boolean;
  url: string | null;
  error: string | null;
}

const MAX_PDF_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;
const VIDEO_CHUNK_SIZE = 8 * 1024 * 1024;
const VIDEO_POLL_INTERVAL_MS = 4000;

function isVideoActive(video: LessonVideo): boolean {
  return video.status !== 'ready' && video.status !== 'failed' && video.status !== 'replaced';
}

/**
 * Thumbnail fetched through get-video-thumbnail-url: the lesson_videos
 * thumbnail_url column is an UNSIGNED CDN URL and is deliberately not
 * exposed to the client (review finding MED-3); every render goes
 * through the EF which returns a short-lived IP-locked signed URL.
 * Rendered only for ready videos; hidden silently on any error.
 */
function VideoThumbnail({ videoId, isReady }: { videoId: string; isReady: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!isReady) {
      return;
    }
    setUrl(null);
    getVideoThumbnailUrl(videoId)
      .then((res) => {
        if (!cancelled) {
          setUrl(res.thumbnail_url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUrl(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [videoId, isReady]);
  if (!url) {
    return null;
  }
  return (
    <img
      src={url}
      alt="صورة مصغرة للفيديو"
      loading="lazy"
      className="h-16 w-28 shrink-0 rounded-md object-cover"
    />
  );
}

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-md" />
      ))}
    </div>
  );
}

export function LessonAssetsPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const { showToast } = useToast();

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [lessonLoading, setLessonLoading] = useState(true);
  const [lessonError, setLessonError] = useState(false);

  const [pdfs, setPdfs] = useState<LessonPdf[] | null>(null);
  const [pdfsError, setPdfsError] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [stage, setStage] = useState<UploadStage>('idle');

  const [videos, setVideos] = useState<LessonVideo[] | null>(null);
  const [videosError, setVideosError] = useState(false);
  const [videoUpload, setVideoUpload] = useState<VideoUploadState>(INITIAL_VIDEO_UPLOAD);
  const [replaceVideo, setReplaceVideo] = useState<LessonVideo | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const videoFileInputRef = useRef<HTMLInputElement | null>(null);
  const tusUploadRef = useRef<TusUpload | null>(null);

  const loadLesson = useCallback(async () => {
    if (!lessonId) {
      setLessonError(true);
      setLessonLoading(false);
      return;
    }
    setLessonError(false);
    setLessonLoading(true);
    try {
      setLesson(await getLessonById(lessonId));
    } catch {
      setLessonError(true);
    } finally {
      setLessonLoading(false);
    }
  }, [lessonId]);

  const loadPdfs = useCallback(async () => {
    if (!lessonId) {
      return;
    }
    setPdfsError(false);
    try {
      setPdfs(await listLessonPdfs(lessonId));
    } catch {
      setPdfsError(true);
    }
  }, [lessonId]);

  const loadVideos = useCallback(async () => {
    if (!lessonId) {
      return;
    }
    setVideosError(false);
    try {
      setVideos(await listLessonVideos(lessonId));
    } catch {
      setVideosError(true);
    }
  }, [lessonId]);

  useEffect(() => {
    void loadLesson();
    void loadPdfs();
    void loadVideos();
  }, [loadLesson, loadPdfs, loadVideos]);

  const anyVideoActive = useMemo(() => (videos ?? []).some(isVideoActive), [videos]);

  useEffect(() => {
    if (!lessonId || !anyVideoActive) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadVideos();
    }, VIDEO_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [lessonId, anyVideoActive, loadVideos]);

  const sortedVideos = useMemo(() => {
    if (!videos) {
      return null;
    }
    return [...videos].sort((a, b) => {
      if (a.is_primary !== b.is_primary) {
        return a.is_primary ? -1 : 1;
      }
      return String(a.created_at).localeCompare(String(b.created_at));
    });
  }, [videos]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setUploadError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    const isPdf = selected.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setFile(null);
      setUploadError('يجب اختيار ملف بصيغة PDF فقط');
      return;
    }
    if (selected.size > MAX_PDF_SIZE) {
      setFile(null);
      setUploadError('حجم الملف يتجاوز الحد المسموح (50 ميجابايت)');
      return;
    }
    setFile(selected);
  };

  const handleUpload = async () => {
    if (!lessonId || !file) {
      return;
    }
    setStage('requesting');
    setUploadError(null);
    try {
      const session = await uploadPdf({ lessonId, fileName: file.name });
      setStage('uploading');
      await uploadPdfBytes(session.uploadUrl, file);
      setStage('finalizing');
      await finalizePdfUpload(session.pdf_id);
      showToast('تم رفع ملف PDF بنجاح');
      await loadPdfs();
    } catch (err) {
      showToast(pdfErrorMessage(err), 'error');
    } finally {
      setStage('idle');
      setFile(null);
    }
  };

  const handleVideoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      return;
    }
    if (!isVideoFile(selected)) {
      setVideoUpload((prev) => ({
        ...prev,
        file: null,
        error: 'يجب اختيار ملف فيديو بصيغة MP4 أو WebM أو MOV فقط',
      }));
      return;
    }
    if (selected.size > MAX_VIDEO_SIZE) {
      setVideoUpload((prev) => ({
        ...prev,
        file: null,
        error: 'حجم الملف يتجاوز الحد المسموح (2 جيجابايت)',
      }));
      return;
    }
    setVideoUpload((prev) => ({ ...prev, file: selected, error: null }));
  };

  const startTusUpload = useCallback(
    (session: VideoUploadSession, file: File, resume: boolean) => {
      const baseOptions = {
        headers: { ...session.tus_headers },
        metadata: { ...session.metadata },
        chunkSize: VIDEO_CHUNK_SIZE,
        retryDelays: [0, 1000, 3000, 5000],
        removeFingerprintOnSuccess: true,
        onProgress: (bytesSent: number, bytesTotal: number) => {
          const percent =
            bytesTotal > 0 ? Math.min(100, Math.round((bytesSent / bytesTotal) * 100)) : 0;
          setVideoUpload((prev) => ({ ...prev, progress: percent, bytesSent, bytesTotal }));
        },
        onSuccess: () => {
          tusUploadRef.current = null;
          setVideoUpload((prev) => ({ ...prev, stage: 'done', progress: 100 }));
          showToast('تم رفع الفيديو — جاري المعالجة');
          void loadVideos();
        },
        onError: () => {
          tusUploadRef.current = null;
          setVideoUpload((prev) => ({
            ...prev,
            stage: 'failed',
            error: VIDEO_ERROR_MESSAGES.upload_failed,
          }));
        },
      };
      const upload = resume
        ? new TusUpload(file, { ...baseOptions, uploadUrl: session.upload_url })
        : new TusUpload(file, { ...baseOptions, endpoint: session.upload_url });
      tusUploadRef.current = upload;
      upload.start();
    },
    [loadVideos, showToast],
  );

  const startVideoUpload = useCallback(async () => {
    if (
      !lessonId ||
      !videoUpload.file ||
      videoUpload.stage === 'uploading' ||
      videoUpload.stage === 'requesting'
    ) {
      return;
    }
    const { file, mode, oldVideoId } = videoUpload;
    setVideoUpload((prev) => ({ ...prev, stage: 'requesting', error: null }));
    try {
      const session = await createVideoUploadSession(lessonId, mode, oldVideoId ?? undefined);
      setVideoUpload((prev) => ({ ...prev, stage: 'uploading', session }));
      startTusUpload(session, file, false);
    } catch (err) {
      setVideoUpload((prev) => ({ ...prev, stage: 'failed', error: videoErrorMessage(err) }));
    }
  }, [lessonId, videoUpload, startTusUpload]);

  const retryVideoUpload = () => {
    const { file, session } = videoUpload;
    if (!file) {
      return;
    }
    if (session) {
      setVideoUpload((prev) => ({
        ...prev,
        stage: 'uploading',
        error: null,
        progress: 0,
        bytesSent: 0,
        bytesTotal: 0,
      }));
      startTusUpload(session, file, true);
    } else {
      void startVideoUpload();
    }
  };

  const cancelVideoUpload = async () => {
    await tusUploadRef.current?.abort().catch(() => undefined);
    tusUploadRef.current = null;
    const { session } = videoUpload;
    setVideoUpload(INITIAL_VIDEO_UPLOAD);
    if (lessonId && session) {
      try {
        await cancelVideoUploadSession(lessonId, session.video_id);
        showToast('تم إلغاء الرفع');
      } catch {
        showToast('تم إلغاء الرفع لكن تعذر تحرير جلسة الرفع على الخادم');
      }
    } else {
      showToast('تم إلغاء الرفع');
    }
  };

  const openNewVideoPicker = () => {
    setVideoUpload((prev) => ({ ...prev, mode: 'create', oldVideoId: null, error: null }));
    videoFileInputRef.current?.click();
  };

  const confirmReplace = () => {
    if (!replaceVideo || videoUpload.stage !== 'idle') {
      return;
    }
    setReplaceVideo(null);
    setVideoUpload((prev) => ({
      ...prev,
      mode: 'replace',
      oldVideoId: replaceVideo.id,
      error: null,
    }));
    videoFileInputRef.current?.click();
  };

  const openPreview = async () => {
    if (!lessonId) {
      return;
    }
    setPreview({ loading: true, url: null, error: null });
    try {
      const response = await getPlaybackUrl(lessonId);
      setPreview({ loading: false, url: response.playback_url, error: null });
    } catch (err) {
      setPreview({ loading: false, url: null, error: videoErrorMessage(err) });
    }
  };

  const closePreview = () => {
    setPreview(null);
  };

  const uploadBusy = stage !== 'idle';

  return (
    <LayoutShell
      title="ملفات الدرس"
      subtitle="إدارة ملفات PDF وفيديوهات الدرس"
      variant="sidebar"
      nav={<StaffNav />}
      actions={
        <Link
          to="/walid/curriculum"
          className="glass-soft inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 sm:h-10"
        >
          <DirectionalArrow direction="back" />
          العودة إلى المنهج
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        <Card title="بيانات الدرس">
          {lessonLoading ? (
            <div className="space-y-3" aria-hidden="true">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-full max-w-sm" />
            </div>
          ) : lessonError ? (
            <ErrorState message="تعذر تحميل بيانات الدرس" onRetry={() => void loadLesson()} />
          ) : !lesson ? (
            <ErrorState message="الدرس غير موجود أو أنه محذوف" onRetry={() => void loadLesson()} />
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-foreground">{lesson.title}</h2>
                  <LessonStatusBadge status={lesson.status} />
                </div>
                {lesson.description ? (
                  <p className="mt-1 text-sm text-foreground-muted">{lesson.description}</p>
                ) : null}
                <p className="mt-2 text-xs text-foreground-subtle">
                  ترتيب {lesson.sort_order}
                  {lesson.published_at
                    ? ` — نُشر في ${formatDateTime(lesson.published_at)}`
                    : ' — لم يُنشر بعد'}
                </p>
              </div>
            </div>
          )}
        </Card>

        <Card
          title="فيديوهات الدرس"
          subtitle="رفع فيديو جديد أو استبدال فيديو موجود (MP4 / WebM / MOV، بحد أقصى 2 جيجابايت)"
          actions={
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw aria-hidden="true" className="h-4 w-4" />}
              onClick={() => void loadVideos()}
            >
              تحديث
            </Button>
          }
        >
          {videosError ? (
            <ErrorState message="تعذر تحميل قائمة الفيديوهات" onRetry={() => void loadVideos()} />
          ) : videos === null ? (
            <div className="flex flex-col gap-3">
              <p role="status" className="text-sm text-foreground-subtle">
                جاري تحميل الفيديوهات
              </p>
              <ListSkeleton rows={3} />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {sortedVideos === null || sortedVideos.length === 0 ? (
                <EmptyState
                  title="لا توجد فيديوهات لهذا الدرس بعد"
                  description="ارفع أول فيديو من الزر بالأسفل وسيظهر هنا."
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {sortedVideos.map((video) => (
                    <li
                      key={video.id}
                      data-testid={`video-row-${video.id}`}
                      className="glass-soft flex flex-wrap items-center justify-between gap-3 rounded-lg p-3"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <VideoThumbnail videoId={video.id} isReady={video.status === 'ready'} />
                        <div className="min-w-0">
                          <p className="text-xs text-foreground-subtle" dir="ltr">
                            {video.bunny_video_id}
                          </p>
                          <p className="mt-1 text-xs text-foreground-subtle">
                            أُضيف {formatDateTime(video.created_at)}
                            {video.duration_seconds !== null && video.duration_seconds !== undefined
                              ? ` — المدة ${formatDuration(video.duration_seconds)}`
                              : ''}
                          </p>
                          {video.status === 'failed' ? (
                            <p role="alert" className="mt-1 text-xs font-medium text-error">
                              {video.error_message ?? 'فشل معالجة الفيديو'} — حاول رفع الفيديو مرة
                              أخرى
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Badge variant={VIDEO_STATUS_BADGE_VARIANT[video.status]}>
                          {VIDEO_STATUS_LABELS[video.status]}
                        </Badge>
                        {video.is_primary ? <Badge variant="info">الأساسي</Badge> : null}
                        {video.status === 'ready' ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<Eye aria-hidden="true" className="h-4 w-4" />}
                              onClick={() => void openPreview()}
                            >
                              معاينة
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<Replace aria-hidden="true" className="h-4 w-4" />}
                              onClick={() => setReplaceVideo(video)}
                            >
                              استبدال
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="glass-tile rounded-lg border border-dashed border-primary/25 p-4">
                <input
                  ref={videoFileInputRef}
                  id="video-file"
                  name="video-file"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  aria-label="اختيار ملف الفيديو"
                  onChange={handleVideoFileChange}
                  className="hidden"
                />
                {videoUpload.stage === 'idle' || videoUpload.stage === 'failed' ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        icon={<VideoIcon aria-hidden="true" className="h-4 w-4" />}
                        onClick={openNewVideoPicker}
                      >
                        رفع فيديو جديد
                      </Button>
                      {videoUpload.file ? (
                        <span className="text-sm text-foreground-muted">
                          {videoUpload.file.name} — {formatFileSize(videoUpload.file.size)}
                        </span>
                      ) : null}
                      {videoUpload.mode === 'replace' && videoUpload.oldVideoId ? (
                        <Badge variant="warning">استبدال الفيديو الحالي بالفيديو المرفوع</Badge>
                      ) : null}
                    </div>
                    {videoUpload.file ? (
                      <div className="flex items-center gap-3">
                        <Button onClick={() => void startVideoUpload()}>رفع الفيديو</Button>
                        {videoUpload.stage === 'failed' ? (
                          <>
                            <Button variant="secondary" onClick={retryVideoUpload}>
                              إعادة المحاولة
                            </Button>
                            <Button variant="ghost" onClick={() => void cancelVideoUpload()}>
                              إلغاء
                            </Button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    {videoUpload.error ? (
                      <p role="alert" className="text-xs font-medium text-error">
                        {videoUpload.error}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-foreground">
                        {videoUpload.file?.name ?? ''} —{' '}
                        {formatFileSize(videoUpload.file?.size ?? 0)}
                      </p>
                      {videoUpload.stage === 'uploading' ? (
                        <Button size="sm" variant="danger" onClick={() => void cancelVideoUpload()}>
                          إلغاء الرفع
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-sm text-foreground-muted" role="status">
                      {videoUpload.stage === 'requesting'
                        ? 'جارٍ إنشاء جلسة الرفع...'
                        : videoUpload.stage === 'done'
                          ? 'تم الرفع — جاري المعالجة'
                          : `جارٍ رفع الملف (${videoUpload.progress}%)...`}
                    </p>
                    <div
                      role="progressbar"
                      aria-valuenow={videoUpload.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-2 w-full max-w-md overflow-hidden rounded-full bg-border"
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500 ease-standard"
                        style={{ width: `${videoUpload.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-foreground-subtle">
                      {formatMib(videoUpload.bytesSent)} من {formatMib(videoUpload.bytesTotal)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card title="رفع ملف PDF جديد" subtitle="صيغة PDF فقط، بحد أقصى 50 ميجابايت">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="pdf-file" className="text-sm font-medium text-secondary-foreground">
                اختيار الملف
              </label>
              <input
                id="pdf-file"
                name="pdf-file"
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => handleFileChange(event)}
                className="block w-full max-w-md text-sm text-foreground-muted file:me-3 file:rounded-md file:border-0 file:bg-gradient-to-br file:from-primary file:to-accent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground file:shadow-[0_8px_18px_-6px_rgba(99,102,241,0.5)] file:transition-[filter] hover:file:brightness-110"
              />
            </div>
            {uploadError ? (
              <p role="alert" className="text-xs font-medium text-error">
                {uploadError}
              </p>
            ) : null}
            <div className="flex items-center gap-3">
              <Button
                loading={uploadBusy}
                disabled={!file}
                icon={<FileUp aria-hidden="true" className="h-4 w-4" />}
                onClick={() => void handleUpload()}
              >
                رفع الملف
              </Button>
              {uploadBusy ? (
                <span className="text-sm text-foreground-muted">
                  {STAGE_LABELS[stage as Exclude<UploadStage, 'idle'>]}
                </span>
              ) : null}
            </div>
          </div>
        </Card>

        <Card title="ملفات PDF الحالية">
          {pdfsError ? (
            <ErrorState message="تعذر تحميل قائمة الملفات" onRetry={() => void loadPdfs()} />
          ) : pdfs === null ? (
            <ListSkeleton rows={2} />
          ) : pdfs.length === 0 ? (
            <EmptyState
              title="لا توجد ملفات PDF لهذا الدرس بعد"
              description="ارفع أول ملف PDF من النموذج بالأسفل وسيظهر هنا."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {pdfs.map((pdf) => (
                <li
                  key={pdf.id}
                  data-testid={`pdf-row-${pdf.id}`}
                  className="glass-soft flex flex-wrap items-center justify-between gap-3 rounded-lg p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground" dir="rtl">
                      {pdf.original_name}
                    </p>
                    <p className="mt-1 text-xs text-foreground-subtle">
                      {formatFileSize(pdf.size_bytes)} — أُضيف {formatDateTime(pdf.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {pdf.is_primary ? <Badge variant="info">الأساسي</Badge> : null}
                    {pdf.is_ready ? (
                      <Badge variant="success">جاهز</Badge>
                    ) : (
                      <Badge variant="warning">قيد الرفع</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={replaceVideo !== null}
        title="تأكيد استبدال الفيديو"
        description="سيتم استبدال الفيديو الحالي بالفيديو الجديد، وسيظهر الفيديو القديم كمستبدل بعد اكتمال الرفع. هل تريد المتابعة؟"
        confirmLabel="متابعة الاستبدال"
        cancelLabel="إلغاء"
        onConfirm={confirmReplace}
        onCancel={() => setReplaceVideo(null)}
      >
        {replaceVideo ? (
          <p className="mt-3 text-xs text-foreground-subtle" dir="ltr">
            {replaceVideo.bunny_video_id} — أُضيف {formatDateTime(replaceVideo.created_at)}
          </p>
        ) : null}
      </Modal>

      <Modal
        open={preview !== null}
        title="معاينة الفيديو"
        confirmLabel="إغلاق"
        cancelLabel="إغلاق"
        onConfirm={closePreview}
        onCancel={closePreview}
      >
        <div className="mt-4">
          {preview?.loading ? (
            <Spinner label="جاري تجهيز الفيديو" />
          ) : preview?.error ? (
            <p role="alert" className="text-sm font-medium text-error">
              {preview.error}
            </p>
          ) : preview?.url ? (
            <div className="glass-card overflow-hidden rounded-2xl border-white/15 p-1.5">
              <video
                controls
                src={preview.url}
                className="aspect-video w-full rounded-xl bg-gradient-to-br from-indigo-950 via-[#312e81] to-violet-950"
              />
            </div>
          ) : null}
        </div>
      </Modal>
    </LayoutShell>
  );
}
