import { getSupabaseClient, supabasePublishableKey, supabaseUrl } from '../lib/supabase';

import type {
  AppNotification,
  AuditFilters,
  AuditLogRow,
  DashboardStats,
  Exam,
  ExamAnswer,
  ExamAttempt,
  ExamQuestion,
  Grade,
  Lesson,
  LessonAccessInfo,
  LessonBoard,
  LessonBoardSignedUrl,
  LessonComment,
  LessonPdf,
  LessonVideo,
  PdfAccessResponse,
  PlaybackResponse,
  Profile,
  Progress,
  PublicSettings,
  PublicUnitPrice,
  Unit,
  UnitCode,
  UnitCodeWithUnit,
  UnitPricingWithUnit,
  UnitPurchase,
  UnitPurchaseStats,
  UnitPurchaseWithUnit,
  UserRole,
  VideoUploadSession,
} from '../types/database';

/** Refresh tokens this many seconds before server-side expiry (gateway verify_jwt rejects expired JWTs). */
const TOKEN_REFRESH_MARGIN_SEC = 30;
const RPC_RETRY_ATTEMPTS = 2;
const RPC_RETRY_BASE_MS = 180;

async function withRpcRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= RPC_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const code = getRpcErrorCode(error);
      const retryable =
        code === 'network_error' ||
        code === 'internal_error' ||
        code === 'function_error' ||
        code === '429' ||
        code === '500' ||
        code === '502' ||
        code === '503' ||
        code === '504';
      if (!retryable || attempt === RPC_RETRY_ATTEMPTS) throw error;
      await new Promise((r) => setTimeout(r, RPC_RETRY_BASE_MS * (attempt + 1)));
    }
  }
  throw lastError;
}

export interface OwnProfileInput {
  fullName: string;
  phone: string;
  guardianPhone: string;
  address: string;
}

export interface ActiveGrade {
  id: string;
  name: string;
  sort_order: number;
}

export async function listActiveGrades(): Promise<ActiveGrade[]> {
  const { data, error } = await getSupabaseClient().rpc('list_active_grades');
  if (error) {
    throw error;
  }
  return (data ?? []) as ActiveGrade[];
}

export async function updateOwnProfile(input: OwnProfileInput): Promise<void> {
  const { error } = await getSupabaseClient().rpc('update_own_profile', {
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_guardian_phone: input.guardianPhone,
    p_address: input.address,
  });
  if (error) {
    throw error;
  }
}

export interface StaffProfileInput extends OwnProfileInput {
  studentId: string;
}

export async function updateStudentProfile(input: StaffProfileInput): Promise<void> {
  const { error } = await getSupabaseClient().rpc('update_student_profile', {
    p_student_id: input.studentId,
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_guardian_phone: input.guardianPhone,
    p_address: input.address,
  });
  if (error) {
    throw error;
  }
}

export async function setStudentGrade(studentId: string, gradeId: string | null): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_student_grade', {
    p_student_id: studentId,
    p_grade_id: gradeId,
  });
  if (error) {
    throw error;
  }
}

export async function disableStudent(studentId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('disable_student', { p_student_id: studentId });
  if (error) {
    throw error;
  }
}

export async function enableStudent(studentId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('enable_student', { p_student_id: studentId });
  if (error) {
    throw error;
  }
}

export async function softDeleteStudent(studentId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('soft_delete_student', {
    p_student_id: studentId,
  });
  if (error) {
    throw error;
  }
}

export async function restoreStudent(studentId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('restore_student', { p_student_id: studentId });
  if (error) {
    throw error;
  }
}

export async function listTrash(): Promise<Profile[]> {
  const { data, error } = await getSupabaseClient().rpc('list_trash');
  if (error) {
    throw error;
  }
  return (data ?? []) as Profile[];
}

export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_user_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (error) {
    throw error;
  }
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const { data, error } = await getSupabaseClient().rpc('get_public_settings');
  if (error) {
    throw error;
  }
  return (data ?? {}) as PublicSettings;
}

export async function listStudents(): Promise<Profile[]> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('*')
    .eq('role', 'student')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as Profile[];
}

export async function getProfileById(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data ?? null) as Profile | null;
}

export async function listGrades(): Promise<Grade[]> {
  const { data, error } = await getSupabaseClient()
    .from('grades')
    .select('*')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as Grade[];
}

export async function listDeletedGrades(): Promise<Grade[]> {
  const { data, error } = await getSupabaseClient()
    .from('grades')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as Grade[];
}

export async function listAllGrades(): Promise<Grade[]> {
  const { data, error } = await getSupabaseClient()
    .from('grades')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as Grade[];
}

export function getRpcErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const err = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const rawCode = typeof err.code === 'string' ? err.code.trim().toLowerCase() : '';
  const rawMessage = typeof err.message === 'string' ? err.message.trim().toLowerCase() : '';

  // For unique violation the message contains the constraint text — keep it for duplicate detection
  if (rawCode === '23505' && rawMessage) {
    return rawMessage;
  }
  if (rawMessage && rawMessage.includes('duplicate key value')) {
    return rawMessage;
  }
  // Postgres numeric codes (missing column 42703, undefined function 42883, permission 42501, etc.) — surface as-is
  if (rawCode && /^\d{5}$/.test(rawCode) && rawCode !== 'p0001') {
    return rawCode;
  }
  // PGRST codes from PostgREST — prefer message which carries the custom RAISE text
  if (rawCode.startsWith('pgrst')) {
    if (rawMessage) {
      // message is often the custom code like unit_is_free / unit_not_found
      const short = rawMessage.split(':')[0].split(' ')[0].trim();
      if (short && /^[a-z0-9_]+$/.test(short)) return short;
      return rawMessage;
    }
    return rawCode;
  }
  // For our own codeError('network_error') both code and message are the short code
  if (rawCode && /^[a-z0-9_]+$/.test(rawCode) && rawCode !== 'p0001') {
    // if code is a meaningful short code (network_error, unit_is_free) prefer it
    // but if message is also a short code and different, prefer message (RAISE case)
    if (rawMessage && /^[a-z0-9_]+$/.test(rawMessage) && rawMessage.length < 40) {
      return rawMessage;
    }
    return rawCode;
  }
  const candidate = rawMessage || rawCode;
  if (!candidate) return null;
  // For long messages like "column units.is_free does not exist" extract a usable token
  if (candidate.includes('does not exist') && candidate.includes('is_free')) return '42703';
  if (candidate.includes('does not exist')) return '42703';
  if (candidate.includes('not exist')) return '42703';
  // Duplicate grade is a special short phrase with a space — keep it
  if (candidate === 'duplicate grade') return candidate;
  // Take first segment before colon if message is a short code like "unit_not_found: ..."
  const short = candidate.split(':')[0].trim();
  if (short && short.length < 80 && /^[a-z0-9_ ]+$/.test(short)) return short;
  return candidate;
}

export function isMissingColumnError(error: unknown): boolean {
  const code = getRpcErrorCode(error);
  if (code === '42703' || code === '42883') return true;
  if (!error || typeof error !== 'object') return false;
  const msg = String((error as { message?: unknown }).message ?? '').toLowerCase();
  return msg.includes('is_free') && msg.includes('does not exist');
}

export function isNetworkErrorCode(error: unknown): boolean {
  const code = getRpcErrorCode(error);
  return code === 'network_error' || code === 'internal_error' || code === 'function_error';
}

export interface CreateGradeInput {
  name: string;
  sortOrder: number;
}

export async function createGrade(input: CreateGradeInput): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('create_grade', {
    p_name: input.name,
    p_sort_order: input.sortOrder,
  });
  if (error) {
    throw error;
  }
  return (data ?? '') as string;
}

export interface UpdateGradeInput {
  gradeId: string;
  name?: string | null;
  sortOrder?: number | null;
}

export async function updateGrade(input: UpdateGradeInput): Promise<void> {
  const { error } = await getSupabaseClient().rpc('update_grade', {
    p_grade_id: input.gradeId,
    p_name: input.name ?? null,
    p_sort_order: input.sortOrder ?? null,
  });
  if (error) {
    throw error;
  }
}

export async function deleteGrade(gradeId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('delete_grade', { p_grade_id: gradeId });
  if (error) {
    throw error;
  }
}

export async function restoreGrade(gradeId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('restore_grade', { p_grade_id: gradeId });
  if (error) {
    throw error;
  }
}

export interface CreateUnitInput {
  gradeId: string;
  name: string;
  sortOrder: number;
}

export async function createUnit(input: CreateUnitInput): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('create_unit', {
    p_grade_id: input.gradeId,
    p_name: input.name,
    p_sort_order: input.sortOrder,
  });
  if (error) {
    throw error;
  }
  return (data ?? '') as string;
}

export interface UpdateUnitInput {
  unitId: string;
  name?: string | null;
  sortOrder?: number | null;
}

export async function updateUnit(input: UpdateUnitInput): Promise<void> {
  const { error } = await getSupabaseClient().rpc('update_unit', {
    p_unit_id: input.unitId,
    p_name: input.name ?? null,
    p_sort_order: input.sortOrder ?? null,
  });
  if (error) {
    throw error;
  }
}

export async function deleteUnit(unitId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('delete_unit', { p_unit_id: unitId });
  if (error) {
    throw error;
  }
}

export async function restoreUnit(unitId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('restore_unit', { p_unit_id: unitId });
  if (error) {
    throw error;
  }
}

export async function publishUnit(unitId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('publish_unit', { p_unit_id: unitId });
  if (error) {
    throw error;
  }
}

export async function hideUnit(unitId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('hide_unit', { p_unit_id: unitId });
  if (error) {
    throw error;
  }
}

export async function listUnitsForGrade(gradeId: string): Promise<Unit[]> {
  const { data, error } = await getSupabaseClient()
    .from('units')
    .select('*')
    .eq('grade_id', gradeId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    const code = getRpcErrorCode(error);
    const msg = String((error as { message?: unknown }).message ?? '').toLowerCase();
    const isMissing = code === '42703' || code === '42883' || msg.includes('is_free');
    const isRecursion = code === '42p17' || msg.includes('infinite recursion');
    if (isMissing || isRecursion) {
      // Fallback for missing is_free column (DB without 0051) — retry without is_free
      if (isMissing) {
        try {
          const { data: retryData, error: retryErr } = await getSupabaseClient()
            .from('units')
            .select('id, grade_id, name, sort_order, status, deleted_at, created_at, updated_at')
            .eq('grade_id', gradeId)
            .is('deleted_at', null)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });
          if (!retryErr && retryData) {
            return (retryData as unknown as Unit[]).map((u) => ({ ...u, is_free: false } as Unit));
          }
        } catch {}
      }
      // Fallback 1: secure RPC that bypasses RLS (fix for 0052 recursion — handles both with/without 0052)
      try {
        const { data: fallback, error: fbErr } = await getSupabaseClient().rpc(
          'list_units_for_grade_secure' as never,
          { p_grade_id: gradeId } as never,
        );
        if (!fbErr && fallback) return (fallback as Unit[]).filter((u) => !u.deleted_at) as Unit[];
      } catch {}
      // Fallback 2: use public prices (security definer, no RLS) to reconstruct units
      try {
        const prices = await getPublicUnitPrices();
        const grade = await getGradeById(gradeId).catch(() => null);
        const filtered = prices.filter((p) => grade && p.grade_name === grade.name);
        if (filtered.length > 0) {
          return filtered.map((p) => ({
            id: p.unit_id,
            grade_id: gradeId,
            name: p.unit_name,
            sort_order: 0,
            status: 'published' as const,
            is_free: p.is_free,
            deleted_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })) as Unit[];
        }
      } catch {}
    }
    throw error;
  }
  return (data ?? []) as Unit[];
}

export async function listDeletedUnitsForGrade(gradeId: string): Promise<Unit[]> {
  const { data, error } = await getSupabaseClient()
    .from('units')
    .select('*')
    .eq('grade_id', gradeId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) {
    const code = getRpcErrorCode(error);
    const msg = String((error as { message?: unknown }).message ?? '').toLowerCase();
    const isMissing = code === '42703' || code === '42883' || msg.includes('is_free');
    const isRecursion = code === '42p17' || msg.includes('infinite recursion');
    if (isMissing || isRecursion) {
      if (isMissing) {
        try {
          const { data: retryData, error: retryErr } = await getSupabaseClient()
            .from('units')
            .select('id, grade_id, name, sort_order, status, deleted_at, created_at, updated_at')
            .eq('grade_id', gradeId)
            .not('deleted_at', 'is', null)
            .order('deleted_at', { ascending: false });
          if (!retryErr && retryData) {
            return (retryData as unknown as Unit[]).map((u) => ({ ...u, is_free: false } as Unit));
          }
        } catch {}
      }
      const { data: fallback, error: fbErr } = await getSupabaseClient().rpc(
        'list_deleted_units_for_grade_secure' as never,
        { p_grade_id: gradeId } as never,
      );
      if (!fbErr && fallback) return fallback as Unit[];
    }
    throw error;
  }
  return (data ?? []) as Unit[];
}

export interface CreateLessonInput {
  unitId: string;
  title: string;
  description?: string | null;
  sortOrder: number;
  isTrial?: boolean;
}

export async function createLesson(input: CreateLessonInput): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('create_lesson', {
    p_unit_id: input.unitId,
    p_title: input.title,
    p_description: input.description ?? null,
    p_sort_order: input.sortOrder,
    p_is_trial: input.isTrial ?? false,
  });
  if (error) {
    throw error;
  }
  return (data ?? '') as string;
}

export interface UpdateLessonInput {
  lessonId: string;
  title?: string | null;
  description?: string | null;
  sortOrder?: number | null;
  isTrial?: boolean | null;
}

export async function updateLesson(input: UpdateLessonInput): Promise<void> {
  const { error } = await getSupabaseClient().rpc('update_lesson', {
    p_lesson_id: input.lessonId,
    p_title: input.title ?? null,
    p_description: input.description ?? null,
    p_sort_order: input.sortOrder ?? null,
    p_is_trial: input.isTrial ?? null,
  });
  if (error) {
    throw error;
  }
}

export async function publishLesson(lessonId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('publish_lesson', { p_lesson_id: lessonId });
  if (error) {
    throw error;
  }
}

export async function hideLesson(lessonId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('hide_lesson', { p_lesson_id: lessonId });
  if (error) {
    throw error;
  }
}

export async function softDeleteLesson(lessonId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('soft_delete_lesson', { p_lesson_id: lessonId });
  if (error) {
    throw error;
  }
}

export async function restoreLesson(lessonId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('restore_lesson', { p_lesson_id: lessonId });
  if (error) {
    throw error;
  }
}

export async function listLessonsForUnit(unitId: string): Promise<Lesson[]> {
  const { data, error } = await getSupabaseClient()
    .from('lessons')
    .select('*')
    .eq('unit_id', unitId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as Lesson[];
}

export async function listDeletedLessonsForUnit(unitId: string): Promise<Lesson[]> {
  const { data, error } = await getSupabaseClient()
    .from('lessons')
    .select('*')
    .eq('unit_id', unitId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as Lesson[];
}

export async function getLessonById(lessonId: string): Promise<Lesson | null> {
  const { data, error } = await getSupabaseClient()
    .from('lessons')
    .select('*')
    .eq('id', lessonId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data ?? null) as Lesson | null;
}

export async function listLessonPdfs(lessonId: string): Promise<LessonPdf[]> {
  const { data, error } = await getSupabaseClient()
    .from('lesson_pdfs')
    .select('*')
    .eq('lesson_id', lessonId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as LessonPdf[];
}

export interface PdfUploadSession {
  uploadUrl: string;
  pdf_id: string;
  storage_path: string;
  expires_in: number;
}

export async function uploadPdf(input: {
  lessonId: string;
  fileName: string;
}): Promise<PdfUploadSession> {
  return invokeFunction<PdfUploadSession>('upload-pdf', {
    method: 'POST',
    body: { lesson_id: input.lessonId, file_name: input.fileName },
  });
}

export async function deletePdfUpload(lessonId: string, pdfId: string): Promise<void> {
  await invokeFunction<{ deleted: boolean }>('delete-pdf', {
    method: 'POST',
    body: { lesson_id: lessonId, pdf_id: pdfId },
  });
}

export async function uploadPdfBytes(uploadUrl: string, file: Blob): Promise<void> {
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/pdf',
      },
      body: file,
    });
  } catch {
    throw codeError('network_error');
  }
  if (!response.ok) {
    throw codeError(response.status >= 500 || response.status === 429 ? 'internal_error' : 'pdf_upload_failed');
  }
}

export async function finalizePdfUpload(pdfId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('finalize_pdf_upload', { p_pdf_id: pdfId });
  if (error) {
    throw error;
  }
}

export async function listLessonBoards(lessonId: string): Promise<LessonBoard[]> {
  const { data, error } = await getSupabaseClient()
    .from('lesson_boards')
    .select('*')
    .eq('lesson_id', lessonId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as LessonBoard[];
}

export interface BoardUploadSession {
  uploadUrl: string;
  board_id: string;
  storage_path: string;
}

export async function uploadBoard(input: {
  lessonId: string;
  fileName: string;
  fileSize?: number;
}): Promise<BoardUploadSession> {
  return invokeFunction<BoardUploadSession>('upload-board', {
    method: 'POST',
    body: {
      lesson_id: input.lessonId,
      file_name: input.fileName,
      ...(input.fileSize !== undefined ? { file_size: input.fileSize } : {}),
    },
  });
}

/**
 * Content type derived from the (already validated) image file name,
 * mirroring imageContentType in supabase/functions/upload-board/index.ts:
 * jpg/jpeg -> image/jpeg, png -> image/png, webp -> image/webp; unknown
 * extensions fall back to the File type or octet-stream.
 */
function boardImageContentType(file: File): string {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  if (ext === 'png') {
    return 'image/png';
  }
  if (ext === 'webp') {
    return 'image/webp';
  }
  if (ext === 'jpg' || ext === 'jpeg') {
    return 'image/jpeg';
  }
  return file.type || 'application/octet-stream';
}

export async function uploadBoardBytes(uploadUrl: string, file: File): Promise<void> {
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': boardImageContentType(file),
      },
      body: file,
    });
  } catch {
    throw codeError('network_error');
  }
  if (!response.ok) {
    throw codeError(response.status >= 500 || response.status === 429 ? 'internal_error' : 'board_upload_failed');
  }
}

export async function finalizeBoardUpload(boardId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('finalize_board_upload', {
    p_board_id: boardId,
  });
  if (error) {
    throw error;
  }
}

export async function deleteBoardUpload(lessonId: string, boardId: string): Promise<void> {
  await invokeFunction<{ deleted: boolean }>('delete-board', {
    method: 'POST',
    body: { lesson_id: lessonId, board_id: boardId },
  });
}

export async function reorderLessonBoards(lessonId: string, boardIds: string[]): Promise<void> {
  const { error } = await getSupabaseClient().rpc('reorder_boards', {
    p_lesson_id: lessonId,
    p_board_ids: boardIds,
  });
  if (error) {
    throw error;
  }
}

export async function getLessonBoardSignedUrls(
  lessonId: string,
): Promise<LessonBoardSignedUrl[]> {
  return invokeFunction<LessonBoardSignedUrl[]>('get-board-signed-urls', {
    method: 'POST',
    body: { lesson_id: lessonId },
  });
}

export async function createVideoUploadSession(
  lessonId: string,
  mode: 'create' | 'replace',
  oldVideoId?: string,
): Promise<VideoUploadSession> {
  return invokeFunction<VideoUploadSession>('create-video-upload-session', {
    method: 'POST',
    body: { lesson_id: lessonId, mode, ...(oldVideoId ? { old_video_id: oldVideoId } : {}) },
  });
}

export async function cancelVideoUploadSession(lessonId: string, videoId: string): Promise<void> {
  await invokeFunction<{ released: boolean }>('create-video-upload-session', {
    method: 'POST',
    body: { action: 'cancel', lesson_id: lessonId, video_id: videoId },
  });
}

export async function listLessonVideos(lessonId: string): Promise<LessonVideo[]> {
  const { data, error } = await getSupabaseClient()
    .from('lesson_videos')
    // thumbnail_url is deliberately excluded: it is an UNSIGNED Bunny CDN
    // URL (review finding MED-3) — thumbnails go through
    // get-video-thumbnail-url (short-lived IP-locked signed URLs) instead.
    .select(
      'id,lesson_id,source,bunny_video_id,youtube_video_id,title,status,is_primary,duration_seconds,error_message,created_at,deleted_at',
    )
    .eq('lesson_id', lessonId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as LessonVideo[];
}

// Add a YouTube video to the lesson by URL (id extraction is server-side).
export async function addYoutubeVideo(
  lessonId: string,
  url: string,
  title?: string,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc('add_youtube_video', {
    p_lesson_id: lessonId,
    p_youtube_url: url,
    p_title: title ?? null,
  });
  if (error) {
    throw error;
  }
}

// Soft-delete a lesson video (Bunny or YouTube).
export async function deleteLessonVideo(lessonId: string, videoId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('delete_lesson_video', {
    p_lesson_id: lessonId,
    p_video_id: videoId,
  });
  if (error) {
    throw error;
  }
}

export async function getPlaybackUrl(
  lessonId: string,
  videoId?: string,
): Promise<PlaybackResponse> {
  return invokeFunction<PlaybackResponse>('get-video-playback-url', {
    method: 'GET',
    query: { lesson_id: lessonId, ...(videoId ? { video_id: videoId } : {}) },
  });
}

export interface ThumbnailResponse {
  thumbnail_url: string;
  video_id: string;
  lesson_id: string;
}

export async function getVideoThumbnailUrl(videoId: string): Promise<ThumbnailResponse> {
  return invokeFunction<ThumbnailResponse>('get-video-thumbnail-url', {
    method: 'GET',
    query: { video_id: videoId },
  });
}

export async function getPdfSignedUrl(lessonId: string): Promise<PdfAccessResponse> {
  return invokeFunction<PdfAccessResponse>('get-pdf-signed-url', {
    method: 'POST',
    body: { lesson_id: lessonId },
  });
}

export async function getGradeById(gradeId: string): Promise<Grade | null> {
  const { data, error } = await getSupabaseClient()
    .from('grades')
    .select('*')
    .eq('id', gradeId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data ?? null) as Grade | null;
}

export async function getUnitById(unitId: string): Promise<Unit | null> {
  try {
    const { data, error } = await getSupabaseClient()
      .from('units')
      .select('*')
      .eq('id', unitId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as Unit | null;
  } catch (error) {
    const code = getRpcErrorCode(error);
    const msg = String((error as { message?: unknown })?.message ?? '').toLowerCase();
    if (code === '42p17' || msg.includes('infinite recursion') || code === '42703') {
      // Fallback: try secure RPC or return minimal stub from public prices
      try {
        const { data: fallback, error: fbErr } = await getSupabaseClient().rpc(
          'list_units_for_grade_secure' as never,
          { p_grade_id: '00000000-0000-0000-0000-000000000000' } as never,
        );
        // If secure RPC exists, try to find the unit in its result (will be empty for dummy grade, so fallback to price)
        if (!fbErr && Array.isArray(fallback)) {
          const found = (fallback as Unit[]).find((u) => u.id === unitId);
          if (found) return found as Unit | null;
        }
      } catch {}
      try {
        const prices = await getPublicUnitPrices();
        const p = prices.find((x) => x.unit_id === unitId);
        if (p) {
          return {
            id: p.unit_id,
            grade_id: '',
            name: p.unit_name,
            sort_order: 0,
            status: 'published',
            is_free: p.is_free,
            deleted_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as Unit;
        }
      } catch {}
      return null;
    }
    throw error;
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function upsertProgress(
  lessonId: string,
  positionSeconds: number,
  percent: number,
): Promise<Progress> {
  const { data, error } = await getSupabaseClient().rpc('upsert_progress', {
    p_lesson_id: lessonId,
    p_position_seconds: Math.max(0, Math.floor(positionSeconds)),
    p_percent: Math.min(100, Math.max(0, percent)),
  });
  if (error) {
    throw error;
  }
  return data as Progress;
}

export async function toggleLessonCompleted(
  lessonId: string,
  completed: boolean,
): Promise<Progress> {
  const { data, error } = await getSupabaseClient().rpc('toggle_lesson_completed', {
    p_lesson_id: lessonId,
    p_completed: completed,
  });
  if (error) {
    throw error;
  }
  return data as Progress;
}

export async function getMyProgress(lessonId: string): Promise<Progress | null> {
  const userId = await currentUserId();
  if (!userId) {
    return null;
  }
  const { data, error } = await getSupabaseClient()
    .from('progress')
    .select('*')
    .eq('student_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data ?? null) as Progress | null;
}

export async function listMyProgress(): Promise<Progress[]> {
  const userId = await currentUserId();
  if (!userId) {
    return [];
  }
  const { data, error } = await getSupabaseClient()
    .from('progress')
    .select('*')
    .eq('student_id', userId)
    .order('updated_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as Progress[];
}

export async function listMyNotifications(): Promise<AppNotification[]> {
  const userId = await currentUserId();
  if (!userId) {
    return [];
  }
  const { data, error } = await getSupabaseClient()
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as AppNotification[];
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('mark_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) {
    throw error;
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await getSupabaseClient().rpc('mark_all_notifications_read');
  if (error) {
    throw error;
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await getSupabaseClient().rpc('get_dashboard_stats');
  if (error) {
    throw error;
  }
  return data as DashboardStats;
}

export interface FinancialReportFilters {
  from?: string | null;
  to?: string | null;
  gradeId?: string | null;
  unitId?: string | null;
}

export async function getFinancialReports(filters: FinancialReportFilters = {}): Promise<import('../types/database').FinancialReports> {
  const { data, error } = await getSupabaseClient().rpc('get_financial_reports', {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_grade_id: filters.gradeId ?? null,
    p_unit_id: filters.unitId ?? null,
  });
  if (error) throw error;
  return data as import('../types/database').FinancialReports;
}

export async function addPlatformExpense(input: { amount: number; category: string; description?: string | null; spentAt?: string | null }): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('add_platform_expense', {
    p_amount: input.amount,
    p_category: input.category,
    p_description: input.description ?? null,
    p_spent_at: input.spentAt ?? null,
  });
  if (error) throw error;
  return (data ?? '') as string;
}

export async function listPlatformExpenses(filters: { from?: string | null; to?: string | null } = {}): Promise<import('../types/database').PlatformExpense[]> {
  const { data, error } = await getSupabaseClient().rpc('list_platform_expenses', {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
  });
  if (error) throw error;
  return (data ?? []) as import('../types/database').PlatformExpense[];
}

export async function addPlatformPayout(input: { amount: number; note?: string | null; paidAt?: string | null }): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('add_platform_payout', {
    p_amount: input.amount,
    p_note: input.note ?? null,
    p_paid_at: input.paidAt ?? null,
  });
  if (error) throw error;
  return (data ?? '') as string;
}

export async function listPlatformPayouts(filters: { from?: string | null; to?: string | null } = {}): Promise<import('../types/database').PlatformPayout[]> {
  const { data, error } = await getSupabaseClient().rpc('list_platform_payouts', {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
  });
  if (error) throw error;
  return (data ?? []) as import('../types/database').PlatformPayout[];
}

export async function listAuditLogs(
  filters: AuditFilters = {},
  pagination: { limit?: number; offset?: number } = {},
): Promise<AuditLogRow[]> {
  const { data, error } = await getSupabaseClient().rpc('list_audit_logs', {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_action: filters.action ?? null,
    p_entity_type: filters.entityType ?? null,
    p_actor_id: filters.actorId ?? null,
    p_limit: pagination.limit ?? 50,
    p_offset: pagination.offset ?? 0,
  });
  if (error) {
    throw error;
  }
  return (data ?? []) as AuditLogRow[];
}

export async function countAuditLogs(filters: AuditFilters = {}): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc('count_audit_logs', {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_action: filters.action ?? null,
    p_entity_type: filters.entityType ?? null,
    p_actor_id: filters.actorId ?? null,
  });
  if (error) {
    throw error;
  }
  return (data ?? 0) as number;
}

export async function exportAuditLog(filters: AuditFilters = {}): Promise<string> {
  const payload = await invokeFunction<{ url: string }>('export-audit-log', {
    method: 'POST',
    body: {
      from: filters.from ?? null,
      to: filters.to ?? null,
      action: filters.action ?? null,
      entity_type: filters.entityType ?? null,
      actor_id: filters.actorId ?? null,
    },
  });
  return payload.url;
}

async function fetchGradeNames(gradeIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(gradeIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) {
    return new Map();
  }
  const { data, error } = await getSupabaseClient().from('grades').select('id, name').in('id', ids);
  if (error) {
    throw error;
  }
  return new Map((data ?? []).map((grade) => [grade.id, grade.name]));
}

export async function redeemUnitCode(code: string): Promise<UnitPurchase> {
  const { data, error } = await getSupabaseClient().rpc('redeem_unit_code', {
    p_code: code,
  });
  if (error) {
    throw error;
  }
  return data as UnitPurchase;
}

export async function getMyUnitPurchases(): Promise<UnitPurchaseWithUnit[]> {
  const { data, error } = await getSupabaseClient().rpc('get_my_unit_purchases');
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as UnitPurchase[];
  if (rows.length === 0) {
    return [];
  }
  const unitIds = [...new Set(rows.map((row) => row.unit_id))];
  const { data: units, error: unitsError } = await getSupabaseClient()
    .from('units')
    .select('id, name, grade_id')
    .in('id', unitIds);
  if (unitsError) {
    throw unitsError;
  }
  const unitsById = new Map(
    (units ?? []).map((unit) => [unit.id, { name: unit.name, gradeId: unit.grade_id }]),
  );
  const gradeIds = [...new Set([...unitsById.values()].map((unit) => unit.gradeId))];
  const gradeNames = await fetchGradeNames(gradeIds);
  return rows.map((row) => {
    const unit = unitsById.get(row.unit_id);
    return {
      ...row,
      unit_name: unit?.name ?? row.unit_id,
      grade_name: unit ? (gradeNames.get(unit.gradeId) ?? null) : null,
    };
  });
}

/**
 * Student lesson gate: returns has_access / has_purchase / is_trial / is_free / price.
 * has_access is authoritative (can_access_lesson: trial OR free OR purchase). Callers
 * must gate on has_access, never on has_purchase, so trial/free lessons open
 * without a purchase for any active student. No client-side filtering here.
 */
export async function getMyLessonAccess(lessonId: string): Promise<LessonAccessInfo> {
  try {
    const { data, error } = await getSupabaseClient().rpc('get_my_lesson_access', {
      p_lesson_id: lessonId,
    });
    if (error) throw error;
    const result = (data ?? {}) as LessonAccessInfo;
    // Backward compat: old RPC without is_free
    if (typeof result.is_free === 'undefined') {
      (result as LessonAccessInfo).is_free = false;
    }
    return result;
  } catch (error) {
    if (isMissingColumnError(error)) {
      // Fallback: treat as not free, compute has_access via trial/purchase only
      try {
        const { data, error: err2 } = await getSupabaseClient().rpc('get_my_lesson_access', {
          p_lesson_id: lessonId,
        } as never);
        if (err2) throw err2;
        const fallback = (data ?? {}) as LessonAccessInfo;
        (fallback as LessonAccessInfo).is_free = false;
        return fallback;
      } catch {
        // If still fails, return no access but don't crash page
        return {
          has_access: false,
          has_purchase: false,
          is_trial: false,
          is_free: false,
          unit_id: null,
          unit_name: null,
          price: null,
        } as LessonAccessInfo;
      }
    }
    if (isNetworkErrorCode(error)) {
      return withRpcRetry(async () => {
        const { data, error: err2 } = await getSupabaseClient().rpc('get_my_lesson_access', {
          p_lesson_id: lessonId,
        });
        if (err2) throw err2;
        return (data ?? {}) as LessonAccessInfo;
      });
    }
    throw error;
  }
}

export interface TrialLessonRow {
  lesson_id: string;
  lesson_title: string;
  lesson_description: string | null;
  lesson_sort_order: number;
  unit_id: string;
  unit_name: string;
  grade_id: string;
  grade_name: string;
}

/**
 * Cross-grade free lessons for any active student. No grade or purchase
 * filter on the client — the RPC already enforces published + active
 * grade + active profile. Returns [] for anon/disabled.
 */
export async function getTrialLessons(): Promise<TrialLessonRow[]> {
  const { data, error } = await getSupabaseClient().rpc('get_trial_lessons');
  if (error) throw error;
  return (data ?? []) as TrialLessonRow[];
}

export async function getPublicUnitPrices(): Promise<PublicUnitPrice[]> {
  try {
    const { data, error } = await getSupabaseClient().rpc('get_public_unit_prices');
    if (error) throw error;
    return (data ?? []) as PublicUnitPrice[];
  } catch (error) {
    const _code = getRpcErrorCode(error);
    const _msg = String((error as { message?: unknown }).message ?? '').toLowerCase();
    const isUnifiedFallback =
      _code === '42703' ||
      _code === '42p17' ||
      _code === '42883' ||
      _msg.includes('is_free') ||
      _msg.includes('infinite recursion') ||
      isMissingColumnError(error);
    if (isUnifiedFallback) {
      // Fallback for DBs without 0051 — build prices without is_free
      try {
        const { data: pricing, error: pErr } = await getSupabaseClient()
          .from('unit_pricing')
          .select('unit_id, base_price, platform_fee, total_price, is_active');
        if (pErr) throw pErr;
        const unitIds = [...new Set((pricing ?? []).map((p) => p.unit_id))];
        if (unitIds.length === 0) return [];
        const { data: units, error: uErr } = await getSupabaseClient()
          .from('units')
          .select('id, name, grade_id')
          .in('id', unitIds)
          .eq('status', 'published')
          .is('deleted_at', null);
        if (uErr) throw uErr;
        const gradeIds = [...new Set((units ?? []).map((u) => u.grade_id))];
        const gradeMap = await fetchGradeNames(gradeIds);
        const activePricing = (pricing ?? []).filter((p) => p.is_active !== false);
        return activePricing
          .map((p) => {
            const unit = (units ?? []).find((u) => u.id === p.unit_id);
            if (!unit) return null;
            return {
              unit_id: p.unit_id,
              unit_name: unit.name,
              grade_name: gradeMap.get(unit.grade_id) ?? null,
              base_price: Number(p.base_price),
              platform_fee: Number(p.platform_fee),
              total_price: Number(p.total_price),
              is_free: false,
            } as PublicUnitPrice;
          })
          .filter(Boolean) as PublicUnitPrice[];
      } catch {
        // if fallback also fails, rethrow original
        throw error;
      }
    }
    throw error;
  }
}

export interface UnitPriceInput {
  unitId: string;
  basePrice: number;
}

export async function setUnitPrice(input: UnitPriceInput): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_unit_price', {
    p_unit_id: input.unitId,
    p_base_price: input.basePrice,
  });
  if (error) {
    throw error;
  }
}

export async function setUnitFree(unitId: string, isFree: boolean): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_unit_free', {
    p_unit_id: unitId,
    p_is_free: isFree,
  });
  if (error) {
    throw error;
  }
}

export async function setPlatformFee(fee: number): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_platform_fee', {
    p_fee: fee,
  });
  if (error) {
    throw error;
  }
}

export async function getPlatformFee(): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc('get_platform_fee');
  if (error) {
    throw error;
  }
  return (data ?? 0) as number;
}

export async function listUnitPricing(): Promise<UnitPricingWithUnit[]> {
  try {
    const { data, error } = await getSupabaseClient().rpc('list_unit_pricing');
    if (error) throw error;
    return (data ?? []) as UnitPricingWithUnit[];
  } catch (error) {
    if (isMissingColumnError(error)) {
      // Fallback: old RPC without is_free — enrich with false
      try {
        const { data, error: err2 } = await getSupabaseClient().rpc('list_unit_pricing' as never);
        if (err2) throw err2;
        return ((data ?? []) as UnitPricingWithUnit[]).map((row) => ({ ...row, is_free: false }));
      } catch {
        throw error;
      }
    }
    // Retry for transient network errors
    if (isNetworkErrorCode(error)) {
      return withRpcRetry(async () => {
        const { data, error: err2 } = await getSupabaseClient().rpc('list_unit_pricing');
        if (err2) throw err2;
        return (data ?? []) as UnitPricingWithUnit[];
      });
    }
    throw error;
  }
}

export async function listCodesByUnit(unitId: string): Promise<UnitCodeWithUnit[]> {
  const { data, error } = await getSupabaseClient().rpc('list_codes_by_unit', {
    p_unit_id: unitId,
  });
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as (UnitCode & { used_by_name: string | null })[];
  // Unit name is non-critical — don't let its RLS recursion (42P17) break the whole codes list
  try {
    const { data: unit, error: unitError } = await getSupabaseClient()
      .from('units')
      .select('name')
      .eq('id', unitId)
      .maybeSingle();
    if (unitError) throw unitError;
    const unitName = unit?.name ?? '';
    return rows.map((row) => ({ ...row, unit_name: unitName }));
  } catch (unitErr) {
    const code = getRpcErrorCode(unitErr);
    const msg = String((unitErr as { message?: unknown })?.message ?? '').toLowerCase();
    if (code === '42p17' || msg.includes('infinite recursion') || code === '42703') {
      // Fallback: return codes with empty unit name — still usable
      return rows.map((row) => ({ ...row, unit_name: '' }));
    }
    // For other errors, still return codes with empty name rather than failing the page
    return rows.map((row) => ({ ...row, unit_name: '' }));
  }
}

export async function revokeUnitCode(codeId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('revoke_unit_code', {
    p_code_id: codeId,
  });
  if (error) {
    throw error;
  }
}

export async function createUnitCodesForStaff(
  unitId: string,
  count: number,
  note?: string | null,
): Promise<UnitCode[]> {
  const { data, error } = await getSupabaseClient().rpc('create_unit_codes_for_staff', {
    p_unit_id: unitId,
    p_count: count,
    p_note: note ?? null,
  });
  if (error) {
    throw error;
  }
  return (data ?? []) as UnitCode[];
}

export async function listAllUnitPurchases(
  studentId?: string | null,
): Promise<UnitPurchaseWithUnit[]> {
  const { data, error } = await getSupabaseClient().rpc('list_all_unit_purchases', {
    p_student_id: studentId ?? null,
  });
  if (error) {
    throw error;
  }
  return (data ?? []) as UnitPurchaseWithUnit[];
}

export async function unitPurchaseStats(): Promise<UnitPurchaseStats> {
  const { data, error } = await getSupabaseClient().rpc('unit_purchase_stats');
  if (error) {
    throw error;
  }
  return (data ?? {}) as UnitPurchaseStats;
}

function codeError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code?: string };
  error.code = code;
  return error as Error & { code: string };
}

/**
 * Normalizes a non-OK Edge Function response into a stable error code.
 * Handles both the EF envelope ({ error: { code } }) and the platform
 * gateway envelope ({ code, message }) emitted when verify_jwt rejects
 * a request before it reaches the function body.
 */
async function functionErrorFromResponse(response: Response): Promise<Error> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    try {
      const text = await response.text();
      if (text.trim().startsWith('{')) {
        body = JSON.parse(text);
      }
    } catch {
      body = null;
    }
  }
  const efCode = (body as { error?: { code?: unknown } } | null)?.error?.code;
  if (typeof efCode === 'string' && efCode.trim()) {
    return codeError(efCode.trim().toLowerCase());
  }
  const gwCode = (body as { code?: unknown } | null)?.code;
  if (typeof gwCode === 'string' && gwCode.trim()) {
    const normalized = gwCode.trim().toLowerCase();
    if (normalized.startsWith('unauthorized')) {
      return codeError('unauthorized');
    }
    return codeError(normalized);
  }
  if (response.status === 401) {
    return codeError('unauthorized');
  }
  if (response.status === 403) {
    return codeError('forbidden');
  }
  if (response.status >= 500 || response.status === 429) {
    return codeError('internal_error');
  }
  return codeError('function_error');
}

/** Refresh the session when it is missing or about to expire; returns a usable token (possibly unchanged). */
async function ensureFreshAccessToken(): Promise<string> {
  const auth = getSupabaseClient().auth;
  let token = '';
  let expiresAtSec = 0;
  try {
    const { data } = await auth.getSession();
    token = data.session?.access_token ?? '';
    expiresAtSec = data.session?.expires_at ?? 0;
  } catch {
    return '';
  }
  const fresh = token && expiresAtSec > Math.floor(Date.now() / 1000) + TOKEN_REFRESH_MARGIN_SEC;
  if (fresh) {
    return token;
  }
  try {
    const { data: refreshed } = await auth.refreshSession();
    return refreshed.session?.access_token || token;
  } catch {
    return token;
  }
}

export async function invokeFunction<T = unknown>(
  name: string,
  options: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const query = options.query ? `?${new URLSearchParams(options.query).toString()}` : '';
  const url = `${supabaseUrl}/functions/v1/${name}${query}`;

  const send = async (token: string): Promise<Response> => {
    try {
      return await fetch(url, {
        method: options.method ?? 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabasePublishableKey,
          ...(options.method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        },
        body: options.method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
      });
    } catch {
      throw codeError('network_error');
    }
  };

  return withRpcRetry(async () => {
    let response = await send(await ensureFreshAccessToken());
    if (response.status === 401) {
      // The gateway may reject a token that supabase-js still considers valid
      // (server-side expiry, rotated signing keys). Refresh once and retry.
      try {
        const { data } = await getSupabaseClient().auth.refreshSession();
        const retryToken = data.session?.access_token;
        if (retryToken) {
          response = await send(retryToken);
        }
      } catch {
        // keep the original 401 response
      }
    }
    if (!response.ok) {
      const err = await functionErrorFromResponse(response);
      const code = getRpcErrorCode(err);
      // Retryable EF errors: internal/429 will be retried by withRpcRetry
      if (code === 'internal_error' || code === 'function_error') throw err;
      throw err;
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw codeError('internal_error');
    }
  });
}

export async function listExams(lessonId: string): Promise<Exam[]> {
  const { data, error } = await getSupabaseClient().rpc('list_exams', {
    p_lesson_id: lessonId,
  });
  if (error) {
    throw error;
  }
  return (data ?? []) as Exam[];
}

export async function getExamQuestions(examId: string): Promise<ExamQuestion[]> {
  const { data, error } = await getSupabaseClient().rpc('get_exam_questions', {
    p_exam_id: examId,
  });
  if (error) {
    throw error;
  }
  return (data ?? []) as ExamQuestion[];
}

export async function getMyExamAttempt(examId: string): Promise<ExamAttempt | null> {
  const { data, error } = await getSupabaseClient().rpc('get_my_exam_attempt', {
    p_exam_id: examId,
  });
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as ExamAttempt[];
  return rows[0] ?? null;
}

export interface ExamAnswerInput {
  questionId: string;
  choiceIndex?: number | null;
  answerText?: string | null;
}

export async function submitExam(examId: string, answers: ExamAnswerInput[]): Promise<ExamAttempt> {
  const { data, error } = await getSupabaseClient().rpc('submit_exam_attempt', {
    p_exam_id: examId,
    p_answers: answers.map((answer) => ({
      question_id: answer.questionId,
      choice_index: answer.choiceIndex ?? null,
      answer_text: answer.answerText ?? null,
    })),
  });
  if (error) {
    throw error;
  }
  return data as ExamAttempt;
}

export interface ExamScoreInput {
  questionId: string;
  score: number;
}

export async function gradeExam(attemptId: string, scores: ExamScoreInput[]): Promise<ExamAttempt> {
  const { data, error } = await getSupabaseClient().rpc('grade_exam_attempt', {
    p_attempt_id: attemptId,
    p_scores: scores.map((score) => ({ question_id: score.questionId, score: score.score })),
  });
  if (error) {
    throw error;
  }
  return data as ExamAttempt;
}

export interface CreateExamInput {
  lessonId: string;
  title: string;
  sortOrder?: number;
  passingScore?: number;
}

export async function createExam(input: CreateExamInput): Promise<string> {
  const { data, error } = await getSupabaseClient()
    .from('exams')
    .insert({
      lesson_id: input.lessonId,
      title: input.title,
      sort_order: input.sortOrder ?? 0,
      passing_score: input.passingScore ?? 50,
    })
    .select('id')
    .single();
  if (error) {
    throw error;
  }
  return (data?.id ?? '') as string;
}

export interface UpdateExamInput {
  examId: string;
  title?: string | null;
  sortOrder?: number | null;
  passingScore?: number | null;
}

export async function updateExam(input: UpdateExamInput): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (input.title !== undefined) {
    payload.title = input.title;
  }
  if (input.sortOrder !== undefined) {
    payload.sort_order = input.sortOrder;
  }
  if (input.passingScore !== undefined) {
    payload.passing_score = input.passingScore;
  }
  const { error } = await getSupabaseClient()
    .from('exams')
    .update(payload as Partial<Exam>)
    .eq('id', input.examId);
  if (error) {
    throw error;
  }
}

export async function deleteExam(examId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('delete_exam', { p_exam_id: examId });
  if (error) {
    throw error;
  }
}

export interface CreateExamQuestionInput {
  examId: string;
  type: 'mcq' | 'essay';
  prompt: string;
  choices?: string[] | null;
  correctIndex?: number | null;
  maxScore?: number;
  sortOrder?: number;
  promptImagePath?: string | null;
  choiceImagePaths?: (string | null)[] | null;
}

export async function createExamQuestion(input: CreateExamQuestionInput): Promise<string> {
  const { data, error } = await getSupabaseClient()
    .from('exam_questions')
    .insert({
      exam_id: input.examId,
      type: input.type,
      prompt: input.prompt,
      choices: input.type === 'mcq' ? (input.choices ?? []) : null,
      correct_index: input.type === 'mcq' ? (input.correctIndex ?? null) : null,
      max_score: input.maxScore ?? 1,
      sort_order: input.sortOrder ?? 0,
      prompt_image_path: input.promptImagePath ?? null,
      choice_image_paths: input.choiceImagePaths ?? null,
    })
    .select('id')
    .single();
  if (error) {
    throw error;
  }
  return (data?.id ?? '') as string;
}

export interface UpdateExamQuestionInput {
  questionId: string;
  type?: 'mcq' | 'essay' | null;
  prompt?: string | null;
  choices?: string[] | null;
  correctIndex?: number | null;
  maxScore?: number | null;
  sortOrder?: number | null;
  promptImagePath?: string | null;
  choiceImagePaths?: (string | null)[] | null;
}

export async function updateExamQuestion(input: UpdateExamQuestionInput): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (input.type !== undefined) {
    payload.type = input.type;
  }
  if (input.prompt !== undefined) {
    payload.prompt = input.prompt;
  }
  if (input.choices !== undefined) {
    payload.choices = input.choices;
  }
  if (input.correctIndex !== undefined) {
    payload.correct_index = input.correctIndex;
  }
  if (input.maxScore !== undefined) {
    payload.max_score = input.maxScore;
  }
  if (input.sortOrder !== undefined) {
    payload.sort_order = input.sortOrder;
  }
  if (input.promptImagePath !== undefined) {
    payload.prompt_image_path = input.promptImagePath;
  }
  if (input.choiceImagePaths !== undefined) {
    payload.choice_image_paths = input.choiceImagePaths;
  }
  const { error } = await getSupabaseClient()
    .from('exam_questions')
    .update(payload as Partial<ExamQuestion>)
    .eq('id', input.questionId);
  if (error) {
    throw error;
  }
}

// ---------------------------------------------------------------------
// Exam image helpers (Phase 12)
// ---------------------------------------------------------------------
export interface ExamImageUploadSession {
  uploadUrl: string;
  storage_path: string;
  exam_id: string;
}

export async function uploadExamImage(input: {
  examId: string;
  fileName: string;
  fileSize?: number;
}): Promise<ExamImageUploadSession> {
  return invokeFunction<ExamImageUploadSession>('upload-exam-image', {
    method: 'POST',
    body: {
      exam_id: input.examId,
      file_name: input.fileName,
      ...(input.fileSize !== undefined ? { file_size: input.fileSize } : {}),
    },
  });
}

function examImageContentType(file: File): string {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return file.type || 'application/octet-stream';
}

export async function uploadExamImageBytes(uploadUrl: string, file: File): Promise<void> {
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': examImageContentType(file) },
      body: file,
    });
  } catch {
    throw codeError('network_error');
  }
  if (!response.ok) {
    throw codeError(response.status >= 500 || response.status === 429 ? 'internal_error' : 'exam_image_upload_failed');
  }
}

export type ExamQuestionImageUrls = {
  question_id: string;
  prompt_image_url: string | null;
  choice_image_urls: (string | null)[] | null;
};

export async function getExamImageSignedUrls(examId: string): Promise<ExamQuestionImageUrls[]> {
  const res = await invokeFunction<{ exam_id: string; images: ExamQuestionImageUrls[] }>(
    'get-exam-image-signed-urls',
    {
      method: 'POST',
      body: { exam_id: examId },
    },
  );
  return Array.isArray(res.images) ? res.images : [];
}

export async function deleteExamQuestion(questionId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('delete_exam_question', {
    p_question_id: questionId,
  });
  if (error) {
    throw error;
  }
}

export async function listExamAttempts(examId: string): Promise<ExamAttempt[]> {
  const { data, error } = await getSupabaseClient()
    .from('exam_attempts')
    .select('*')
    .eq('exam_id', examId)
    .order('submitted_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as ExamAttempt[];
}

export async function listAttemptAnswers(attemptId: string): Promise<ExamAnswer[]> {
  const { data, error } = await getSupabaseClient()
    .from('exam_answers')
    .select('*')
    .eq('attempt_id', attemptId)
    .order('id', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as ExamAnswer[];
}

export async function getProfileName(userId: string): Promise<string> {
  const profile = await getProfileById(userId);
  return profile?.full_name ?? '';
}

export async function listLessonComments(lessonId: string): Promise<LessonComment[]> {
  const { data, error } = await getSupabaseClient().rpc('list_lesson_comments', {
    p_lesson_id: lessonId,
  });
  if (error) {
    throw error;
  }
  return (data ?? []) as LessonComment[];
}

export async function addLessonComment(
  lessonId: string,
  body: string,
  parentId?: string | null,
): Promise<LessonComment> {
  const { data, error } = await getSupabaseClient().rpc('add_lesson_comment', {
    p_lesson_id: lessonId,
    p_body: body,
    p_parent_id: parentId ?? null,
  });
  if (error) {
    throw error;
  }
  return data as LessonComment;
}

export async function deleteLessonComment(commentId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('delete_lesson_comment', {
    p_comment_id: commentId,
  });
  if (error) {
    throw error;
  }
}

// ---------------------------------------------------------------------
// Presence — student heartbeat & admin live monitoring (0055)
// ---------------------------------------------------------------------
export type OnlineStudent = import('../types/database').OnlineStudent;
export type PresenceHistoryRow = import('../types/database').PresenceHistoryRow;
export type MostActiveStudent = import('../types/database').MostActiveStudent;

export async function touchPresence(input: {
  path?: string | null;
  lessonId?: string | null;
  isVisible?: boolean;
  closing?: boolean;
} = {}): Promise<{ session_id: string | null; throttled: boolean } | null> {
  const { data, error } = await getSupabaseClient().rpc('touch_presence', {
    p_path: input.path ?? null,
    p_lesson_id: input.lessonId ?? null,
    p_is_visible: input.isVisible ?? true,
    p_closing: input.closing ?? false,
  });
  if (error) {
    throw error;
  }
  return (data as { session_id: string | null; throttled: boolean } | null) ?? null;
}

export async function getOnlineStudents(): Promise<OnlineStudent[]> {
  const { data, error } = await getSupabaseClient().rpc('get_online_students');
  if (error) {
    throw error;
  }
  return (data ?? []) as OnlineStudent[];
}

export async function getStudentPresenceHistory(
  studentId: string,
  filters: { from?: string | null; to?: string | null; limit?: number; offset?: number } = {},
): Promise<PresenceHistoryRow[]> {
  const { data, error } = await getSupabaseClient().rpc('get_student_presence_history', {
    p_student_id: studentId,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_limit: filters.limit ?? 50,
    p_offset: filters.offset ?? 0,
  });
  if (error) {
    throw error;
  }
  return (data ?? []) as PresenceHistoryRow[];
}

export async function getMostActiveStudents(filters: {
  from?: string | null;
  to?: string | null;
  limit?: number;
} = {}): Promise<MostActiveStudent[]> {
  const { data, error } = await getSupabaseClient().rpc('get_most_active_students', {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_limit: filters.limit ?? 20,
  });
  if (error) {
    throw error;
  }
  return (data ?? []) as MostActiveStudent[];
}

export async function getDailyActiveStudents(input: {
  date: string;
  limit?: number;
  offset?: number;
}): Promise<import('../types/database').DailyActiveStudent[]> {
  const { data, error } = await getSupabaseClient().rpc('get_daily_active_students', {
    p_date: input.date,
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
  });
  if (error) {
    throw error;
  }
  return (data ?? []) as import('../types/database').DailyActiveStudent[];
}

export async function getPresenceDailyCounts(input: {
  from?: string | null;
  to?: string | null;
} = {}): Promise<import('../types/database').PresenceDailyCount[]> {
  const { data, error } = await getSupabaseClient().rpc('get_presence_daily_counts', {
    p_from: input.from ?? null,
    p_to: input.to ?? null,
  });
  if (error) {
    throw error;
  }
  return (data ?? []) as import('../types/database').PresenceDailyCount[];
}
