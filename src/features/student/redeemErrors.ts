import { getRpcErrorCode } from '../../data/rpc';

const REDEEM_ERROR_MESSAGES: Record<string, string> = {
  code_not_found: 'الكود غير صالح',
  code_already_used: 'تم استخدام هذا الكود بالفعل',
  code_revoked: 'تم إلغاء هذا الكود',
  unit_not_found: 'الوحدة المطلوبة غير موجودة',
  unit_inactive: 'هذه الوحدة غير متاحة حاليًا',
  no_grade_assigned: 'لم يتم تحديد صفك الدراسي بعد — تواصل مع الأستاذ',
  unit_not_in_student_grade: 'هذه الوحدة ليست ضمن صفك الدراسي',
  unit_already_purchased: 'لقد قمت بتفعيل هذه الوحدة بالفعل',
  access_denied: 'ليست لديك صلاحية للتفعيل — تأكد من تفعيل حسابك',
};

export function redeemErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && REDEEM_ERROR_MESSAGES[code]) {
    return REDEEM_ERROR_MESSAGES[code];
  }
  return 'تعذر تفعيل الوحدة. حاول مرة أخرى';
}