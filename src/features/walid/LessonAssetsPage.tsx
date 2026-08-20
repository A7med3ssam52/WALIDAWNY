import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  FileUp,
  Image as ImageIcon,
  ImageUp,
  MessageSquareText,
  RefreshCw,
  Trash2,
  Video as VideoIcon,
} from 'lucide-react';

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
import { RoleNav } from '../../components/RoleNav';
import { useToast } from '../../components/Toast';
import { VideoPlayer } from '../../components/VideoPlayer';
import {
  addYoutubeVideo,
  cancelVideoUploadSession,
  createVideoUploadSession,
  deleteBoardUpload,
  deleteLessonVideo,
  deletePdfUpload,
  finalizeBoardUpload,
  finalizePdfUpload,
  getLessonById,
  getLessonBoardSignedUrls,
  getPlaybackUrl,
  getRpcErrorCode,
  getVideoThumbnailUrl,
  deleteLessonComment,
  listLessonBoards,
  listLessonComments,
  listLessonPdfs,
  listLessonVideos,
  reorderLessonBoards,
  uploadBoard,
  uploadBoardBytes,
  uploadPdf,
  uploadPdfBytes,
} from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import { uploadManager } from '../../upload/uploadManager';
import type { VideoUploadJob } from '../../upload/uploadManager';
import type {
  Lesson,
  LessonBoard,
  LessonBoardSignedUrl,
  LessonComment,
  LessonPdf,
  LessonVideo,
  VideoStatus,
} from '../../types/database';

const COMMENT_ERROR_MESSAGES: Record<string, string> = {
  comment_not_found: 'التعليق غير موجود',
  permission_denied: 'ليست لديك صلاحية',
  access_denied: 'ليست لديك صلاحية',
};

function commentErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && COMMENT_ERROR_MESSAGES[code]) {
    return COMMENT_ERROR_MESSAGES[code];
  }
  return 'تعذر تنفيذ العملية. حاول مرة أخرى';
}

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
  pdf_not_pending: 'الملف مكتمل ولا يمكن حذفه',
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
  video_not_found: 'الفيديو غير موجود',
  video_not_pending: 'جلسة الرفع لم تعد قيد الانتظار',
  session_cancel_failed: 'تعذر إلغاء جلسة الرفع. حاول مرة أخرى',
  upload_failed: 'فشل رفع الفيديو. حاول مرة أخرى',
  invalid_youtube_url: 'رابط يوتيوب غير صالح',
  youtube_video_duplicate: 'هذا الفيديو مضاف مسبقاً',
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

const BOARD_ERROR_MESSAGES: Record<string, string> = {
  lesson_not_found: 'الدرس غير موجود',
  lesson_deleted: 'الدرس محذوف',
  invalid_file_name: 'اسم الملف غير صالح',
  unsupported_image_type: 'صيغة الصورة غير مدعومة',
  file_too_large: 'حجم الصورة يتجاوز الحد المسموح (10 ميجابايت)',
  validation_error: 'بيانات غير صالحة',
  invalid_json: 'بيانات غير صالحة',
  board_not_found: 'الصورة غير موجودة',
  permission_denied: 'ليست لديك صلاحية',
  access_denied: 'ليست لديك صلاحية',
  forbidden: 'ليست لديك صلاحية',
  unauthorized: 'انتهت الجلسة — يرجى تسجيل الدخول مرة أخرى',
  account_inactive_or_deleted: 'الحساب غير نشط أو تم حذفه',
  function_error: 'تعذر تنفيذ العملية. حاول مرة أخرى',
  board_reservation_failed: 'فشل إنشاء سجل الصورة. حاول مرة أخرى',
  upload_url_failed: 'فشل إنشاء رابط الرفع. حاول مرة أخرى',
  board_upload_failed: 'فشل رفع الصورة إلى التخزين. حاول مرة أخرى',
  board_storage_missing: 'تعذر التحقق من الصورة في التخزين. حاول مرة أخرى',
  deletion_failed: 'فشل حذف الصورة. حاول مرة أخرى',
  storage_cleanup_failed: 'تعذر تنظيف الملفات القديمة. حاول مرة أخرى',
  wrong_lesson: 'الصورة لا تنتمي لهذا الدرس',
};

function boardErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && BOARD_ERROR_MESSAGES[code]) {
    return BOARD_ERROR_MESSAGES[code];
  }
  return 'تعذر تنفيذ العملية. حاول مرة أخرى';
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

function parseYoutubeVideoId(input: string): string | null {
  const value = input.trim();
  const patterns = [
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/(?:watch\?v=|embed\/|shorts\/)([\w-]{11})/,
    /^([\w-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

type UploadStage = 'idle' | 'requesting' | 'uploading' | 'finalizing';

const STAGE_LABELS: Record<Exclude<UploadStage, 'idle'>, string> = {
  requesting: 'جاري إنشاء رابط الرفع...',
  uploading: 'جاري رفع الملف...',
  finalizing: 'جاري تأكيد الملف...',
};

interface PreviewState {
  loading: boolean;
  url: string | null;
  error: string | null;
}

const MAX_PDF_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;
const MAX_BOARD_SIZE = 10 * 1024 * 1024;
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

  const [boards, setBoards] = useState<LessonBoard[] | null>(null);
  const [boardsError, setBoardsError] = useState(false);
  const [boardUrls, setBoardUrls] = useState<LessonBoardSignedUrl[] | null>(null);
  const [boardFile, setBoardFile] = useState<File | null>(null);
  const [boardUploadError, setBoardUploadError] = useState<string | null>(null);
  const [boardStage, setBoardStage] = useState<UploadStage>('idle');
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [previewBoard, setPreviewBoard] = useState<{ board: LessonBoard; url: string } | null>(
    null,
  );
  const [deleteBoard, setDeleteBoard] = useState<LessonBoard | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [stage, setStage] = useState<UploadStage>('idle');

  const [videos, setVideos] = useState<LessonVideo[] | null>(null);
  const [videosError, setVideosError] = useState(false);
  const [videoPickError, setVideoPickError] = useState<string | null>(null);
  const [managerJobs, setManagerJobs] = useState<VideoUploadJob[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [deleteVideo, setDeleteVideo] = useState<LessonVideo | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeTitle, setYoutubeTitle] = useState('');
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeSubmitting, setYoutubeSubmitting] = useState(false);

  const [comments, setComments] = useState<LessonComment[] | null>(null);
  const [commentsError, setCommentsError] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [cancellingVideoId, setCancellingVideoId] = useState<string | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [deletingPdfId, setDeletingPdfId] = useState<string | null>(null);

  const videoFileInputRef = useRef<HTMLInputElement | null>(null);

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

  const loadComments = useCallback(async () => {
    if (!lessonId) {
      return;
    }
    setCommentsError(false);
    try {
      setComments(await listLessonComments(lessonId));
    } catch {
      setCommentsError(true);
    }
  }, [lessonId]);

  const loadBoardUrls = useCallback(async () => {
    if (!lessonId) {
      return;
    }
    try {
      const rows = await getLessonBoardSignedUrls(lessonId);
      setBoardUrls(Array.isArray(rows) ? rows : []);
    } catch {
      // Signed URLs are best-effort: a failed fetch never breaks the list.
      setBoardUrls([]);
    }
  }, [lessonId]);

  const loadBoards = useCallback(async () => {
    if (!lessonId) {
      return;
    }
    setBoardsError(false);
    try {
      const rows = await listLessonBoards(lessonId);
      setBoards(rows);
      if (rows.some((board) => board.is_ready)) {
        void loadBoardUrls();
      } else {
        setBoardUrls([]);
      }
    } catch {
      setBoardsError(true);
      setBoardUrls([]);
    }
  }, [lessonId, loadBoardUrls]);

  const refreshBoards = useCallback(() => {
    void loadBoards();
    void loadBoardUrls();
  }, [loadBoards, loadBoardUrls]);

  const handleDeleteComment = async (comment: LessonComment) => {
    setDeletingCommentId(comment.id);
    try {
      await deleteLessonComment(comment.id);
      showToast('تم حذف التعليق');
      await loadComments();
    } catch (err) {
      showToast(commentErrorMessage(err), 'error');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleCancelPendingVideo = async (video: LessonVideo) => {
    if (!lessonId) {
      return;
    }
    setCancellingVideoId(video.id);
    try {
      await cancelVideoUploadSession(lessonId, video.id);
      showToast('تم إلغاء الرفع');
      await loadVideos();
    } catch (err) {
      showToast(videoErrorMessage(err), 'error');
    } finally {
      setCancellingVideoId(null);
    }
  };

  const handleDeletePdf = async (pdf: LessonPdf) => {
    if (!lessonId) {
      return;
    }
    setDeletingPdfId(pdf.id);
    try {
      await deletePdfUpload(lessonId, pdf.id);
      showToast('تم حذف الملف');
      await loadPdfs();
    } catch (err) {
      showToast(pdfErrorMessage(err), 'error');
    } finally {
      setDeletingPdfId(null);
    }
  };

  const handleBoardFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setBoardUploadError(null);
    if (!selected) {
      setBoardFile(null);
      return;
    }
    const hasImageExtension = /\.(jpe?g|png|webp)$/i.test(selected.name);
    const hasImageType = ['image/jpeg', 'image/png', 'image/webp'].includes(selected.type);
    if (!hasImageExtension || !hasImageType) {
      setBoardFile(null);
      setBoardUploadError('يجب اختيار صورة بصيغة JPG أو PNG أو WebP فقط');
      return;
    }
    if (selected.size > MAX_BOARD_SIZE) {
      setBoardFile(null);
      setBoardUploadError('حجم الصورة يتجاوز الحد المسموح (10 ميجابايت)');
      return;
    }
    setBoardFile(selected);
  };

  const handleBoardUpload = async () => {
    if (!lessonId || !boardFile) {
      return;
    }
    setBoardStage('requesting');
    setBoardUploadError(null);
    try {
      const session = await uploadBoard({
        lessonId,
        fileName: boardFile.name,
        fileSize: boardFile.size,
      });
      setBoardStage('uploading');
      await uploadBoardBytes(session.uploadUrl, boardFile);
      setBoardStage('finalizing');
      await finalizeBoardUpload(session.board_id);
      showToast('تم رفع الصورة بنجاح');
      await Promise.all([loadBoards(), loadBoardUrls()]);
    } catch (err) {
      showToast(boardErrorMessage(err), 'error');
    } finally {
      setBoardStage('idle');
      setBoardFile(null);
    }
  };

  const handleDeleteBoard = async (board: LessonBoard) => {
    if (!lessonId) {
      return;
    }
    setDeleteBoard(null);
    setDeletingBoardId(board.id);
    try {
      await deleteBoardUpload(lessonId, board.id);
      showToast('تم حذف الصورة');
      await Promise.all([loadBoards(), loadBoardUrls()]);
    } catch (err) {
      showToast(boardErrorMessage(err), 'error');
    } finally {
      setDeletingBoardId(null);
    }
  };

  const handleMoveBoard = async (index: number, direction: -1 | 1) => {
    if (!lessonId || !sortedBoards || !readyBoards || reordering) {
      return;
    }
    const board = sortedBoards[index];
    if (!board || !board.is_ready) {
      return;
    }
    const readyIndex = readyBoards.findIndex((item) => item.id === board.id);
    if (readyIndex < 0) {
      return;
    }
    const target = readyIndex + direction;
    if (target < 0 || target >= readyBoards.length) {
      return;
    }
    const next = [...readyBoards];
    [next[readyIndex], next[target]] = [next[target], next[readyIndex]];
    setReordering(true);
    try {
      await reorderLessonBoards(
        lessonId,
        next.map((item) => item.id),
      );
      await Promise.all([loadBoards(), loadBoardUrls()]);
    } catch (err) {
      showToast(boardErrorMessage(err), 'error');
    } finally {
      setReordering(false);
    }
  };

  useEffect(() => {
    void loadLesson();
    void loadPdfs();
    void loadVideos();
    void loadComments();
    void loadBoards();
  }, [loadLesson, loadPdfs, loadVideos, loadComments, loadBoards]);

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

  const sortedBoards = useMemo(() => {
    if (!boards) {
      return null;
    }
    return [...boards].sort(
      (a, b) =>
        a.sort_order - b.sort_order || String(a.created_at).localeCompare(String(b.created_at)),
    );
  }, [boards]);

  const readyBoards = useMemo(() => {
    if (!sortedBoards) {
      return null;
    }
    return sortedBoards.filter((board) => board.is_ready);
  }, [sortedBoards]);

  const boardUrlById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of boardUrls ?? []) {
      map.set(item.board_id, item.signed_url);
    }
    return map;
  }, [boardUrls]);

  const openBoardPreview = (board: LessonBoard) => {
    const url = boardUrlById.get(board.id);
    if (!url) {
      return;
    }
    setPreviewBoard({ board, url });
  };

  const closeBoardPreview = () => {
    setPreviewBoard(null);
  };

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

  const handleVideoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (event.target) {
      event.target.value = '';
    }
    if (!selected) {
      return;
    }
    if (!isVideoFile(selected)) {
      setVideoPickError('يجب اختيار ملف فيديو بصيغة MP4 أو WebM أو MOV فقط');
      return;
    }
    if (selected.size > MAX_VIDEO_SIZE) {
      setVideoPickError('حجم الملف يتجاوز الحد المسموح (2 جيجابايت)');
      return;
    }
    setVideoPickError(null);
    if (!lessonId) {
      return;
    }
    try {
      const session = await createVideoUploadSession(lessonId, 'create');
      await uploadManager.enqueueVideoUpload({ lessonId, file: selected, session });
      showToast('بدأ الرفع في الخلفية');
      void loadVideos();
    } catch (err) {
      showToast(videoErrorMessage(err), 'error');
    }
  };

  useEffect(() => {
    return uploadManager.subscribe((jobs) => {
      setManagerJobs(jobs.filter((job) => job.lessonId === lessonId));
    });
  }, [lessonId]);

  const handledJobIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const job of managerJobs) {
      if (handledJobIdsRef.current.has(job.jobId)) {
        continue;
      }
      if (job.stage === 'done') {
        handledJobIdsRef.current.add(job.jobId);
        showToast('تم رفع الفيديو — جاري المعالجة');
        void loadVideos();
      } else if (job.stage === 'failed') {
        handledJobIdsRef.current.add(job.jobId);
        showToast(VIDEO_ERROR_MESSAGES.upload_failed, 'error');
        void loadVideos();
      }
    }
  }, [managerJobs, loadVideos, showToast]);

  const handleDeleteVideo = async (video: LessonVideo) => {
    if (!lessonId) {
      return;
    }
    setDeleteVideo(null);
    setDeletingVideoId(video.id);
    try {
      await deleteLessonVideo(lessonId, video.id);
      showToast('تم حذف الفيديو');
      await loadVideos();
    } catch (err) {
      showToast(videoErrorMessage(err), 'error');
    } finally {
      setDeletingVideoId(null);
    }
  };

  const handleAddYoutubeVideo = async () => {
    if (!lessonId) {
      return;
    }
    const videoId = parseYoutubeVideoId(youtubeUrl);
    if (!videoId) {
      setYoutubeError('رابط يوتيوب غير صالح');
      return;
    }
    setYoutubeSubmitting(true);
    setYoutubeError(null);
    try {
      await addYoutubeVideo(lessonId, youtubeUrl.trim(), youtubeTitle.trim() || undefined);
      showToast('تمت إضافة الفيديو');
      setYoutubeUrl('');
      setYoutubeTitle('');
      await loadVideos();
    } catch (err) {
      setYoutubeError(videoErrorMessage(err));
    } finally {
      setYoutubeSubmitting(false);
    }
  };

  const openPreview = async (video: LessonVideo) => {
    if (!lessonId) {
      return;
    }
    setPreview({ loading: true, url: null, error: null });
    try {
      const response = await getPlaybackUrl(lessonId, video.id);
      setPreview({ loading: false, url: response.playback_url, error: null });
    } catch (err) {
      setPreview({ loading: false, url: null, error: videoErrorMessage(err) });
    }
  };

  const closePreview = () => {
    setPreview(null);
  };

  const uploadBusy = stage !== 'idle';
  const boardBusy = boardStage !== 'idle';

  return (
    <LayoutShell
      title="ملفات الدرس"
      subtitle="إدارة ملفات PDF وفيديوهات الدرس"
      variant="sidebar"
      nav={<RoleNav />}
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
          subtitle="أضف فيديو من جهازك (MP4 / WebM / MOV، بحد أقصى 2 جيجابايت) أو أضف فيديو من يوتيوب بالرابط"
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
                  {sortedVideos.map((video) => {
                    const job = managerJobs.find((item) => item.videoId === video.id);
                    const isBunnyReady =
                      video.source === 'bunny' && video.status === 'ready';
                    const isCancelling = cancellingVideoId === video.id;
                    const isDeleting = deletingVideoId === video.id;
                    const jobActive =
                      job && ['queued', 'uploading', 'paused'].includes(job.stage);
                    return (
                      <li
                        key={video.id}
                        data-testid={`video-row-${video.id}`}
                        className="glass-soft flex flex-wrap items-center justify-between gap-3 rounded-lg p-3"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          {isBunnyReady ? (
                            <VideoThumbnail videoId={video.id} isReady />
                          ) : null}
                          <div className="min-w-0">
                            {video.source === 'youtube' ? (
                              <p className="truncate text-sm font-medium text-foreground" dir="rtl">
                                {video.title ?? 'فيديو يوتيوب'}
                              </p>
                            ) : null}
                            <p className="text-xs text-foreground-subtle" dir="ltr">
                              {video.source === 'youtube'
                                ? (video.youtube_video_id ?? '')
                                : (video.bunny_video_id ?? '')}
                            </p>
                            <p className="mt-1 text-xs text-foreground-subtle">
                              أُضيف {formatDateTime(video.created_at)}
                              {video.duration_seconds !== null &&
                              video.duration_seconds !== undefined
                                ? ` — المدة ${formatDuration(video.duration_seconds)}`
                                : ''}
                            </p>
                            {video.status === 'failed' ? (
                              <p role="alert" className="mt-1 text-xs font-medium text-error">
                                {video.error_message ?? 'فشل معالجة الفيديو'} — حاول رفع الفيديو
                                مرة أخرى
                              </p>
                            ) : null}
                            {job && job.stage === 'failed' ? (
                              <p role="alert" className="mt-1 text-xs font-medium text-error">
                                {VIDEO_ERROR_MESSAGES.upload_failed}
                              </p>
                            ) : null}
                            {jobActive ? (
                              <div className="mt-2 flex max-w-md flex-col gap-1">
                                <p className="text-xs text-foreground-muted" role="status">
                                  جارٍ رفع الملف ({job.progress}%)...
                                </p>
                                <div
                                  role="progressbar"
                                  aria-valuenow={job.progress}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  className="h-2 w-full overflow-hidden rounded-full bg-border"
                                >
                                  <div
                                    className="h-full rounded-full bg-primary transition-all duration-500 ease-standard"
                                    style={{ width: `${job.progress}%` }}
                                  />
                                </div>
                                <p className="text-xs text-foreground-subtle">
                                  {formatMib(job.bytesSent)} من {formatMib(job.bytesTotal)}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <Badge variant={VIDEO_STATUS_BADGE_VARIANT[video.status]}>
                            {VIDEO_STATUS_LABELS[video.status]}
                          </Badge>
                          {video.is_primary ? <Badge variant="info">الأساسي</Badge> : null}
                          {video.source === 'youtube' ? (
                            <Badge
                              variant="info"
                              icon={
                                <ExternalLink aria-hidden="true" className="h-3 w-3" />
                              }
                            >
                              يوتيوب
                            </Badge>
                          ) : null}
                          {video.status === 'pending_upload' ? (
                            <Button
                              size="sm"
                              variant="danger"
                              icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                              onClick={() => void handleCancelPendingVideo(video)}
                              disabled={isCancelling}
                            >
                              {isCancelling ? 'جاري الإلغاء...' : 'إلغاء'}
                            </Button>
                          ) : null}
                          {isBunnyReady ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<Eye aria-hidden="true" className="h-4 w-4" />}
                              onClick={() => void openPreview(video)}
                            >
                              معاينة
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="danger"
                            icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                            onClick={() => setDeleteVideo(video)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? 'جاري الحذف...' : 'حذف'}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="glass-tile rounded-lg border border-dashed border-primary/25 p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      ref={videoFileInputRef}
                      id="video-file"
                      name="video-file"
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      aria-label="اختيار ملف الفيديو"
                      onChange={(event) => void handleVideoFileChange(event)}
                      className="hidden"
                    />
                    <Button
                      icon={<VideoIcon aria-hidden="true" className="h-4 w-4" />}
                      onClick={() => videoFileInputRef.current?.click()}
                    >
                      إضافة فيديو
                    </Button>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-xs text-foreground-subtle">
                        الرفع يستمر في الخلفية — يمكنك مغادرة الصفحة وسيكتمل الرفع تلقائياً
                      </p>
                      {videoPickError ? (
                        <p role="alert" className="text-xs font-medium text-error">
                          {videoPickError}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex min-w-56 flex-1 flex-col gap-1">
                        <label
                          htmlFor="youtube-url"
                          className="text-sm font-medium text-secondary-foreground"
                        >
                          إضافة فيديو من يوتيوب
                        </label>
                        <input
                          id="youtube-url"
                          name="youtube-url"
                          type="url"
                          dir="ltr"
                          placeholder="https://www.youtube.com/watch?v=..."
                          value={youtubeUrl}
                          onChange={(event) => setYoutubeUrl(event.target.value)}
                          className="block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:border-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong/40"
                        />
                      </div>
                      <div className="flex min-w-56 flex-1 flex-col gap-1">
                        <label
                          htmlFor="youtube-title"
                          className="text-sm font-medium text-secondary-foreground"
                        >
                          عنوان اختياري
                        </label>
                        <input
                          id="youtube-title"
                          name="youtube-title"
                          type="text"
                          placeholder="عنوان الفيديو"
                          value={youtubeTitle}
                          onChange={(event) => setYoutubeTitle(event.target.value)}
                          className="block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:border-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong/40"
                        />
                      </div>
                      <Button
                        loading={youtubeSubmitting}
                        disabled={!youtubeUrl.trim()}
                        onClick={() => void handleAddYoutubeVideo()}
                      >
                        إضافة
                      </Button>
                    </div>
                    {youtubeError ? (
                      <p role="alert" className="text-xs font-medium text-error">
                        {youtubeError}
                      </p>
                    ) : null}
                  </div>
                </div>
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

        <Card
          title="تعليقات الدرس"
          subtitle="راجع تعليقات الطلاب واحذف التعليقات المخالفة"
          actions={
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw aria-hidden="true" className="h-4 w-4" />}
              onClick={() => void loadComments()}
            >
              تحديث التعليقات
            </Button>
          }
        >
          {commentsError ? (
            <ErrorState
              message="تعذر تحميل التعليقات"
              onRetry={() => void loadComments()}
            />
          ) : comments === null ? (
            <ListSkeleton rows={2} />
          ) : comments.length === 0 ? (
            <EmptyState
              title="لا توجد تعليقات على هذا الدرس بعد"
              description="ستظهر هنا تعليقات الطلاب فور إضافتها."
              icon={<MessageSquareText className="h-6 w-6" />}
            />
          ) : (
            <ul className="flex flex-col gap-2" data-testid="staff-comment-list">
              {comments.map((comment) => {
                const isReply = Boolean(comment.parent_id);
                const isDeleting = deletingCommentId === comment.id;
                return (
                  <li
                    key={comment.id}
                    data-testid={`staff-comment-${comment.id}`}
                    className={`glass-soft flex flex-wrap items-start justify-between gap-3 rounded-lg p-3 ${
                      isReply ? 'ms-6 border-primary/15 bg-primary/5' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {comment.author_name}
                        </span>
                        <span className="text-xs text-foreground-subtle">
                          {formatDateTime(comment.created_at)}
                        </span>
                        {comment.status === 'removed' ? (
                          <Badge variant="error">محذوف</Badge>
                        ) : null}
                        {isReply ? <Badge variant="info">رد</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-foreground">
                        {comment.body}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                      onClick={() => void handleDeleteComment(comment)}
                      disabled={isDeleting || comment.status === 'removed'}
                      className="shrink-0 text-error hover:bg-rose-500/10 hover:text-error"
                    >
                      {isDeleting ? 'جاري الحذف...' : 'حذف'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="سبورة الدرس"
          subtitle="رفع صور السبورة للطلاب (JPG / PNG / WebP، بحد أقصى 10 ميجابايت)"
          actions={
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw aria-hidden="true" className="h-4 w-4" />}
              onClick={() => void refreshBoards()}
            >
              تحديث الصور
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            {boardsError ? (
              <ErrorState
                message="تعذر تحميل صور السبورة"
                onRetry={() => void refreshBoards()}
              />
            ) : boards === null ? (
              <ListSkeleton rows={3} />
            ) : sortedBoards === null || sortedBoards.length === 0 ? (
              <EmptyState
                title="لا توجد صور سبورة لهذا الدرس بعد"
                description="ارفع أول صورة من النموذج بالأسفل وستظهر هنا."
                icon={<ImageIcon className="h-6 w-6" />}
              />
            ) : (
              <div
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                data-testid="board-grid"
              >
                {sortedBoards.map((board, index) => {
                  const boardUrl = boardUrlById.get(board.id);
                  const isDeleting = deletingBoardId === board.id;
                  const readyIndex =
                    readyBoards?.findIndex((item) => item.id === board.id) ?? -1;
                  const isReady = board.is_ready;
                  const readyCount = readyBoards?.length ?? 0;
                  return (
                    <div
                      key={board.id}
                      data-testid={`board-card-${board.id}`}
                      className="glass-soft flex flex-col overflow-hidden rounded-lg"
                    >
                      <button
                        type="button"
                        onClick={() => openBoardPreview(board)}
                        disabled={!boardUrl}
                        aria-label={`معاينة ${board.original_name}`}
                        className="block w-full cursor-pointer text-start"
                      >
                        {boardUrl ? (
                          <img
                            src={boardUrl}
                            alt={board.original_name}
                            loading="lazy"
                            data-testid={`board-img-${board.id}`}
                            className="h-28 w-full rounded-t-lg object-cover"
                          />
                        ) : (
                          <span
                            data-testid={`board-img-${board.id}`}
                            className="flex h-28 w-full items-center justify-center rounded-t-lg bg-white/5"
                            aria-hidden="true"
                          >
                            <ImageIcon className="h-8 w-8 text-foreground-subtle" />
                          </span>
                        )}
                      </button>
                      <div className="flex flex-1 flex-col gap-2 p-3">
                        <p className="truncate text-sm font-medium text-foreground">
                          {board.original_name}
                        </p>
                        <p className="text-xs text-foreground-subtle">
                          {formatFileSize(board.size_bytes)}
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          {board.is_ready ? (
                            <Badge variant="success">جاهز</Badge>
                          ) : (
                            <Badge variant="warning">قيد الرفع</Badge>
                          )}
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<ChevronUp aria-hidden="true" className="h-4 w-4" />}
                              aria-label={`نقل ${board.original_name} لأعلى`}
                              data-testid={`board-move-up-${board.id}`}
                              disabled={!isReady || readyIndex === 0 || reordering}
                              onClick={() => void handleMoveBoard(index, -1)}
                            >
                              {''}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<ChevronDown aria-hidden="true" className="h-4 w-4" />}
                              aria-label={`نقل ${board.original_name} لأسفل`}
                              data-testid={`board-move-down-${board.id}`}
                              disabled={!isReady || readyIndex === readyCount - 1 || reordering}
                              onClick={() => void handleMoveBoard(index, 1)}
                            >
                              {''}
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Eye aria-hidden="true" className="h-4 w-4" />}
                            data-testid={`board-preview-${board.id}`}
                            disabled={!boardUrl}
                            onClick={() => openBoardPreview(board)}
                          >
                            معاينة
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                            data-testid={`board-delete-${board.id}`}
                            disabled={isDeleting}
                            onClick={() => setDeleteBoard(board)}
                          >
                            {isDeleting ? 'جاري الحذف...' : 'حذف'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="glass-tile rounded-lg border border-dashed border-primary/25 p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="board-file"
                    className="text-sm font-medium text-secondary-foreground"
                  >
                    اختيار صورة السبورة
                  </label>
                  <input
                    id="board-file"
                    name="board-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    aria-label="اختيار صورة السبورة"
                    data-testid="board-upload-input"
                    onChange={handleBoardFileChange}
                    className="block w-full max-w-md text-sm text-foreground-muted file:me-3 file:rounded-md file:border-0 file:bg-gradient-to-br file:from-primary file:to-accent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground file:shadow-[0_8px_18px_-6px_rgba(99,102,241,0.5)] file:transition-[filter] hover:file:brightness-110"
                  />
                </div>
                {boardUploadError ? (
                  <p role="alert" className="text-xs font-medium text-error">
                    {boardUploadError}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    loading={boardBusy}
                    disabled={!boardFile}
                    icon={<ImageUp aria-hidden="true" className="h-4 w-4" />}
                    data-testid="board-upload-button"
                    onClick={() => void handleBoardUpload()}
                  >
                    رفع الصورة
                  </Button>
                  {boardBusy ? (
                    <span className="text-sm text-foreground-muted" role="status">
                      {STAGE_LABELS[boardStage as Exclude<UploadStage, 'idle'>]}
                    </span>
                  ) : null}
                  {boardFile ? (
                    <span className="text-sm text-foreground-muted">
                      {boardFile.name} — {formatFileSize(boardFile.size)}
                    </span>
                  ) : null}
                </div>
              </div>
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
                    {!pdf.is_ready ? (
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                        onClick={() => void handleDeletePdf(pdf)}
                        disabled={deletingPdfId === pdf.id}
                      >
                        {deletingPdfId === pdf.id ? 'جاري الحذف...' : 'حذف'}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={deleteVideo !== null}
        title="تأكيد حذف الفيديو"
        description="سيتم حذف الفيديو نهائيًا من الدرس. هل تريد المتابعة؟"
        confirmLabel="حذف الفيديو"
        cancelLabel="إلغاء"
        danger
        loading={deletingVideoId !== null}
        onConfirm={() => {
          if (deleteVideo) {
            void handleDeleteVideo(deleteVideo);
          }
        }}
        onCancel={() => setDeleteVideo(null)}
      >
        {deleteVideo ? (
          <p className="mt-3 text-xs text-foreground-subtle" dir="ltr">
            {deleteVideo.source === 'youtube'
              ? (deleteVideo.youtube_video_id ?? '')
              : (deleteVideo.bunny_video_id ?? '')}{' '}
            — أُضيف {formatDateTime(deleteVideo.created_at)}
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
              <VideoPlayer src={preview.url} />
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={previewBoard !== null}
        title="معاينة الصورة"
        confirmLabel="إغلاق"
        cancelLabel="إغلاق"
        onConfirm={closeBoardPreview}
        onCancel={closeBoardPreview}
      >
        <div className="mt-4" data-testid="board-preview-modal">
          {previewBoard ? (
            <img
              src={previewBoard.url}
              alt={previewBoard.board.original_name}
              className="max-h-[70vh] w-full rounded-lg object-contain"
            />
          ) : null}
        </div>
      </Modal>

      <Modal
        open={deleteBoard !== null}
        title="تأكيد حذف الصورة"
        description="سيتم حذف صورة السبورة نهائيًا من الدرس. هل تريد المتابعة؟"
        confirmLabel="حذف الصورة"
        cancelLabel="إلغاء"
        danger
        loading={deletingBoardId !== null}
        onConfirm={() => {
          if (deleteBoard) {
            void handleDeleteBoard(deleteBoard);
          }
        }}
        onCancel={() => setDeleteBoard(null)}
      >
        {deleteBoard ? (
          <p className="mt-3 text-xs text-foreground-subtle">{deleteBoard.original_name}</p>
        ) : null}
      </Modal>
    </LayoutShell>
  );
}
