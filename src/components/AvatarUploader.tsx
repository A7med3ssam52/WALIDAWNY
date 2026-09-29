import { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';

import { removeMyAvatar, setMyAvatar, uploadMyAvatar } from '../data/rpc';
import { compressAvatarImage, validateAvatarImage } from '../lib/imageCompress';
import { useToast } from './Toast';
import { useAuth } from '../features/auth/AuthContext';
import { AvatarImage } from './AvatarImage';
import { Button } from './Button';

/**
 * Student avatar upload/remove block (0082).
 * Shared by the profile page and the avatar-required lock screen.
 * All strings are kept stable for tests.
 */
export function AvatarUploader() {
  const { profile, user, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarInitial = (profile?.full_name ?? user?.email ?? 'ط').trim().charAt(0) || 'ط';

  const handleAvatarFile = async (file: File | null) => {
    if (!file || avatarBusy) {
      return;
    }
    if (!user) {
      showToast('تعذر تحديد الحساب. حاول مرة أخرى لاحقًا', 'error');
      return;
    }
    const validationError = validateAvatarImage(file);
    if (validationError) {
      setAvatarError(validationError);
      return;
    }
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      const blob = await compressAvatarImage(file);
      const path = await uploadMyAvatar(user.id, blob);
      await setMyAvatar(path);
      await refreshProfile();
      showToast('تم تحديث صورتك الشخصية بنجاح');
    } catch {
      setAvatarError('تعذر رفع الصورة. حاول مرة أخرى لاحقًا');
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAvatarRemove = async () => {
    if (avatarBusy) {
      return;
    }
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      await removeMyAvatar();
      await refreshProfile();
      showToast('تم حذف صورتك الشخصية');
    } catch {
      setAvatarError('تعذر حذف الصورة. حاول مرة أخرى لاحقًا');
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <AvatarImage
        path={profile?.avatar_path}
        alt="الصورة الشخصية"
        className="h-24 w-24 rounded-full ring-2 ring-border"
        fallback={
          <span
            aria-hidden="true"
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-primary-soft text-3xl font-black text-primary-strong"
          >
            {avatarInitial}
          </span>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm text-foreground-muted">
          {profile?.avatar_path
            ? 'لديك صورة شخصية ظاهرة في الهيدر.'
            : 'لا توجد صورة بعد — سيظهر الحرف الأول من اسمك.'}
        </p>
        {avatarError ? (
          <p role="alert" className="text-xs font-medium text-error">
            {avatarError}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="اختيار صورة شخصية"
            className="sr-only"
            onChange={(event) => void handleAvatarFile(event.target.files?.[0] ?? null)}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={<Camera aria-hidden="true" className="h-4 w-4" />}
            loading={avatarBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            {profile?.avatar_path ? 'تغيير الصورة' : 'إضافة صورة'}
          </Button>
          {profile?.avatar_path ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
              loading={avatarBusy}
              onClick={() => void handleAvatarRemove()}
            >
              حذف الصورة
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
