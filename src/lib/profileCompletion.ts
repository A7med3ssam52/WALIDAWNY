import type { Profile } from '../types/database';
import { validateArabicFullName } from './validation';

/**
 * اكتمال بيانات الطالب: اسم ثلاثي عربي + صورة شخصية.
 * غير الطلاب يُعتبرون مكتملين دائماً (خارج النطاق).
 */
export function isStudentNameComplete(profile: Pick<Profile, 'full_name'> | null | undefined): boolean {
  if (!profile) return false;
  return validateArabicFullName(profile.full_name) === null;
}

export function isProfileComplete(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.role !== 'student') return true;
  return isStudentNameComplete(profile) && Boolean(profile.avatar_path);
}
