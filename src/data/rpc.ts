import { getSupabaseClient } from '../lib/supabase';

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
  const candidate = (error as { message?: unknown }).message ?? (error as { code?: unknown }).code;
  if (typeof candidate !== 'string' || !candidate.trim()) {
    return null;
  }
  return candidate.trim().toLowerCase();
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

export async function listUnitsForGrade(gradeId: string): Promise<Unit[]> {
  const { data, error } = await getSupabaseClient()
    .from('units')
    .select('*')
    .eq('grade_id', gradeId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
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

export async function uploadPdfBytes(uploadUrl: string, file: Blob): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/pdf',
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error('pdf_upload_failed');
  }
}

export async function finalizePdfUpload(pdfId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('finalize_pdf_upload', { p_pdf_id: pdfId });
  if (error) {
    throw error;
  }
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
      'id,lesson_id,bunny_video_id,status,is_primary,duration_seconds,error_message,created_at,deleted_at',
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

export async function getPlaybackUrl(lessonId: string): Promise<PlaybackResponse> {
  return invokeFunction<PlaybackResponse>('get-video-playback-url', {
    method: 'GET',
    query: { lesson_id: lessonId },
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
  const { data, error } = await getSupabaseClient()
    .from('units')
    .select('*')
    .eq('id', unitId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data ?? null) as Unit | null;
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

export async function getMyLessonAccess(lessonId: string): Promise<LessonAccessInfo> {
  const { data, error } = await getSupabaseClient().rpc('get_my_lesson_access', {
    p_lesson_id: lessonId,
  });
  if (error) {
    throw error;
  }
  return (data ?? {}) as LessonAccessInfo;
}

export async function getPublicUnitPrices(): Promise<PublicUnitPrice[]> {
  const { data, error } = await getSupabaseClient().rpc('get_public_unit_prices');
  if (error) {
    throw error;
  }
  return (data ?? []) as PublicUnitPrice[];
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
  const { data, error } = await getSupabaseClient().rpc('list_unit_pricing');
  if (error) {
    throw error;
  }
  return (data ?? []) as UnitPricingWithUnit[];
}

export async function listCodesByUnit(unitId: string): Promise<UnitCodeWithUnit[]> {
  const { data, error } = await getSupabaseClient().rpc('list_codes_by_unit', {
    p_unit_id: unitId,
  });
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as UnitCode[];
  const { data: unit, error: unitError } = await getSupabaseClient()
    .from('units')
    .select('name')
    .eq('id', unitId)
    .maybeSingle();
  if (unitError) {
    throw unitError;
  }
  const unitName = unit?.name ?? '';
  return rows.map((row) => ({ ...row, unit_name: unitName }));
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

export async function invokeFunction<T = unknown>(
  name: string,
  options: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token ?? '';
  const query = options.query ? `?${new URLSearchParams(options.query).toString()}` : '';
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}${query}`;
  const response = await fetch(url, {
    method: options.method ?? 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
    const code = body?.error?.code ?? 'function_error';
    const error = new Error(code) as Error & { code?: string };
    error.code = code;
    throw error;
  }
  return (await response.json()) as T;
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
  const { error } = await getSupabaseClient()
    .from('exams')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', examId);
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
  const { error } = await getSupabaseClient()
    .from('exam_questions')
    .update(payload as Partial<ExamQuestion>)
    .eq('id', input.questionId);
  if (error) {
    throw error;
  }
}

export async function deleteExamQuestion(questionId: string): Promise<void> {
  const { error } = await getSupabaseClient().from('exam_questions').delete().eq('id', questionId);
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
