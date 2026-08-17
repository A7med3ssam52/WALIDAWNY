export const PASSWORD_MIN_LENGTH = 6;

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function normalizePhone(value: string): string {
  return value
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '')
    .replace(/^0020/, '20');
}

export function isValidEgyptianPhone(value: string): boolean {
  const normalized = normalizePhone(value);
  return /^(20|0)1[0-9]{9}$/.test(normalized);
}

export function toCanonicalPhone(value: string): string {
  const normalized = normalizePhone(value);
  if (normalized.startsWith('0')) {
    return `+20${normalized.slice(1)}`;
  }
  if (normalized.startsWith('20')) {
    return `+${normalized}`;
  }
  return normalized;
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export interface RegisterFormValues {
  fullName: string;
  email: string;
  phone: string;
  guardianPhone: string;
  address: string;
  gradeId: string;
  password: string;
  confirmPassword: string;
}

export function validateRegister(values: RegisterFormValues): FieldErrors<RegisterFormValues> {
  const errors: FieldErrors<RegisterFormValues> = {};

  if (!values.fullName.trim()) {
    errors.fullName = 'الاسم الكامل مطلوب';
  }
  if (!values.email.trim()) {
    errors.email = 'البريد الإلكتروني مطلوب';
  } else if (!isValidEmail(values.email)) {
    errors.email = 'صيغة البريد الإلكتروني غير صحيحة';
  }
  if (!values.phone.trim()) {
    errors.phone = 'رقم الهاتف مطلوب';
  } else if (!isValidEgyptianPhone(values.phone)) {
    errors.phone = 'رقم الهاتف يجب أن يبدأ بـ 01 أو +20';
  }
  if (!values.guardianPhone.trim()) {
    errors.guardianPhone = 'رقم ولي الأمر مطلوب';
  } else if (!isValidEgyptianPhone(values.guardianPhone)) {
    errors.guardianPhone = 'رقم ولي الأمر يجب أن يبدأ بـ 01 أو +20';
  }
  if (!values.address.trim()) {
    errors.address = 'العنوان مطلوب';
  }
  if (!values.gradeId) {
    errors.gradeId = 'يجب اختيار الصف الدراسي';
  }
  if (!values.password) {
    errors.password = 'كلمة المرور مطلوبة';
  } else if (values.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `كلمة المرور يجب أن تكون ${PASSWORD_MIN_LENGTH} أحرف على الأقل`;
  }
  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'تأكيد كلمة المرور غير مطابق';
  }

  return errors;
}

export function validateLogin(
  email: string,
  password: string,
): FieldErrors<{ email: string; password: string }> {
  const errors: FieldErrors<{ email: string; password: string }> = {};

  if (!email.trim()) {
    errors.email = 'البريد الإلكتروني مطلوب';
  } else if (!isValidEmail(email)) {
    errors.email = 'صيغة البريد الإلكتروني غير صحيحة';
  }
  if (!password) {
    errors.password = 'كلمة المرور مطلوبة';
  }

  return errors;
}

export interface ProfileFormValues {
  fullName: string;
  phone: string;
  guardianPhone: string;
  address: string;
}

export function validateProfileForm(values: ProfileFormValues): FieldErrors<ProfileFormValues> {
  const errors: FieldErrors<ProfileFormValues> = {};

  if (!values.fullName.trim()) {
    errors.fullName = 'الاسم الكامل مطلوب';
  }
  if (!values.phone.trim()) {
    errors.phone = 'رقم الهاتف مطلوب';
  } else if (!isValidEgyptianPhone(values.phone)) {
    errors.phone = 'رقم الهاتف يجب أن يبدأ بـ 01 أو +20';
  }
  if (values.guardianPhone.trim() && !isValidEgyptianPhone(values.guardianPhone)) {
    errors.guardianPhone = 'صيغة رقم ولي الأمر غير صحيحة';
  }
  if (!values.address.trim()) {
    errors.address = 'العنوان مطلوب';
  }

  return errors;
}

export interface PasswordChangeValues {
  newPassword: string;
  confirmPassword: string;
}

export function validatePasswordChange(
  values: PasswordChangeValues,
): FieldErrors<PasswordChangeValues> {
  const errors: FieldErrors<PasswordChangeValues> = {};

  if (!values.newPassword) {
    errors.newPassword = 'كلمة المرور الجديدة مطلوبة';
  } else if (values.newPassword.length < PASSWORD_MIN_LENGTH) {
    errors.newPassword = `كلمة المرور يجب أن تكون ${PASSWORD_MIN_LENGTH} أحرف على الأقل`;
  }
  if (values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = 'تأكيد كلمة المرور غير مطابق';
  }

  return errors;
}
