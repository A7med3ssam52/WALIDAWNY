import type { BadgeVariant } from '../../components/Badge';
import type { SuggestionKind, SuggestionStatus } from '../../types/database';

export const SUGGESTION_KIND_LABELS: Record<SuggestionKind, string> = {
  issue: 'مشكلة',
  suggestion: 'اقتراح',
  other: 'أخرى',
};

export const SUGGESTION_STATUS_LABELS: Record<SuggestionStatus, string> = {
  new: 'جديد',
  reviewed: 'قيد المراجعة',
  planned: 'مخطط للتحديث',
  done: 'تم التنفيذ',
  rejected: 'مرفوض',
};

export const SUGGESTION_STATUS_VARIANTS: Record<SuggestionStatus, BadgeVariant> = {
  new: 'neutral',
  reviewed: 'warning',
  planned: 'info',
  done: 'success',
  rejected: 'error',
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  permission_denied: 'لا تملك صلاحية تنفيذ هذا الإجراء',
  suggestions_closed: 'انتهت فترة جمع المقترحات لهذا التحديث',
  invalid_kind: 'اختر نوع المشاركة',
  invalid_title: 'العنوان مطلوب (حتى 100 حرف)',
  invalid_body: 'النص مطلوب — اكتب 10 أحرف على الأقل (حتى 1000)',
  invalid_image: 'مسار الصورة غير صالح',
  invalid_status: 'الحالة المختارة غير صالحة',
  suggestion_not_found: 'المشاركة غير موجودة',
  suggestion_image_exists: 'تم إرفاق صورة لهذه المشاركة من قبل',
  suggestion_image_missing: 'تعذر العثور على الصورة المرفوعة',
};

export function suggestionErrorMessage(code: string | null): string {
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code];
  }
  return 'حدث خطأ غير متوقع. حاول مرة أخرى';
}
