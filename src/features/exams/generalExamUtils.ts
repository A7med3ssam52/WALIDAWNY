import { getRpcErrorCode } from '../../data/rpc';
import type { GeneralExamRow } from '../../types/database';

export type GeneralExamTimeState =
  | 'draft'
  | 'archived'
  | 'upcoming'
  | 'live'
  | 'ended'
  | 'open';

/**
 * Student-facing time state of a general exam.
 * - draft/archived mirror the staff status (never shown to students).
 * - upcoming: published but starts_at is in the future.
 * - live: inside [starts_at, ends_at] (open bounds count as satisfied).
 * - ended: ends_at passed.
 * - open: published with no window at all.
 */
export function getGeneralExamTimeState(
  exam: Pick<GeneralExamRow, 'status' | 'starts_at' | 'ends_at'>,
  nowMs: number = Date.now(),
): GeneralExamTimeState {
  if (exam.status === 'draft') return 'draft';
  if (exam.status === 'archived') return 'archived';
  const rawStart = exam.starts_at ? Date.parse(exam.starts_at) : null;
  const rawEnd = exam.ends_at ? Date.parse(exam.ends_at) : null;
  // Corrupt date strings must not masquerade as a live exam.
  const start = rawStart !== null && Number.isFinite(rawStart) ? rawStart : null;
  const end = rawEnd !== null && Number.isFinite(rawEnd) ? rawEnd : null;
  if (start !== null && nowMs < start) return 'upcoming';
  if (end !== null && nowMs > end) return 'ended';
  if (start === null && end === null) return 'open';
  return 'live';
}

export const GENERAL_EXAM_TIME_LABELS: Record<GeneralExamTimeState, string> = {
  draft: 'مسودة',
  archived: 'مؤرشف',
  upcoming: 'قادم',
  live: 'جاري الآن',
  ended: 'انتهى',
  open: 'مفتوح',
};

/**
 * Effective submit deadline (ms epoch) for an attempt.
 * The earlier of (started_at + duration) and ends_at wins.
 * Returns null when neither bound exists (window-less exam).
 */
export function getAttemptDeadlineMs(
  startedAt: string | null | undefined,
  durationMinutes: number | null | undefined,
  endsAt: string | null | undefined,
): number | null {
  const candidates: number[] = [];
  if (startedAt && durationMinutes != null && durationMinutes > 0) {
    const start = Date.parse(startedAt);
    if (Number.isFinite(start)) {
      candidates.push(start + durationMinutes * 60_000);
    }
  }
  if (endsAt) {
    const end = Date.parse(endsAt);
    if (Number.isFinite(end)) {
      candidates.push(end);
    }
  }
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

export function getRemainingMs(deadlineMs: number | null, nowMs: number = Date.now()): number | null {
  if (deadlineMs === null) return null;
  return Math.max(0, deadlineMs - nowMs);
}

/** 02:05:09 -> "02:05:09", 5m 3s -> "05:03". */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/** ISO instant -> "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
export function toDateTimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (local) -> ISO instant, or null when empty. */
export function fromDateTimeLocalValue(local: string): string | null {
  if (!local.trim()) return null;
  const ms = Date.parse(local);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export const GENERAL_EXAM_ERROR_MESSAGES: Record<string, string> = {
  exam_not_found: 'الاختبار غير موجود',
  not_general_exam: 'هذا الاختبار غير متاح هنا',
  access_denied: 'لا تملك صلاحية الوصول لهذا الاختبار',
  permission_denied: 'ليست لديك صلاحية',
  exam_not_started: 'الامتحان لم يبدأ بعد',
  exam_ended: 'انتهى ميعاد الامتحان',
  not_started: 'ابدأ الامتحان أولاً',
  time_expired: 'انتهى الوقت المخصص للمحاولة',
  attempt_already_exists: 'لقد أرسلت إجابتك من قبل',
  invalid_answers: 'يرجى الإجابة على جميع الأسئلة قبل الإرسال',
  invalid_title: 'عنوان الامتحان غير صالح',
  invalid_grade: 'الصف المحدد غير متاح',
  invalid_window: 'ميعاد النهاية يجب أن يكون بعد ميعاد البداية',
  invalid_duration: 'المدة يجب أن تكون بين 5 و 480 دقيقة',
  invalid_passing_score: 'درجة النجاح يجب أن تكون بين 0 و 100',
  invalid_status: 'الحالة غير صالحة',
  exam_empty: 'أضف سؤالاً واحداً على الأقل قبل النشر',
  answers_not_released: 'الإجابات الصحيحة ستظهر بعد انتهاء ميعاد الامتحان',
  leaderboard_hidden: 'قايمة الأوائل مخفية لهذا الامتحان',
  no_attempt: 'يجب دخول الامتحان أولاً',
  attempt_not_found: 'المحاولة غير موجودة',
  auth_required: 'سجل الدخول أولاً',
};

export function generalExamErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && GENERAL_EXAM_ERROR_MESSAGES[code]) {
    return GENERAL_EXAM_ERROR_MESSAGES[code];
  }
  return 'تعذر تنفيذ العملية. حاول مرة أخرى';
}
