import { useEffect, useRef, useState } from 'react';
import { Camera, HelpCircle, ShieldCheck } from 'lucide-react';

import { getAvatarSignedUrl, setMyAvatar, updateOwnProfile, uploadMyAvatar } from '../data/rpc';
import { compressAvatarImage, validateAvatarImage } from '../lib/imageCompress';
import { formatDateTime } from '../lib/format';
import { isProfileComplete, isStudentNameComplete } from '../lib/profileCompletion';
import { validateArabicFullName } from '../lib/validation';
import { useAuth } from '../features/auth/AuthContext';
import { useToast } from './Toast';
import { Button } from './Button';

/**
 * Student tracking review modal: shows the full account record and
 * requires a triple Arabic name plus a profile photo.
 * إجباري وفوري: يظهر من أول دخول لأي طالب ناقص البيانات،
 * ولا يمكن إغلاقه بأي طريقة — يختفي فقط بعد اكتمال الحفظ.
 * Mounted by LayoutShell for student roles only, and enforced by
 * ProfileCompletionGate on every /student/* route.
 */
export function ProfileCompletionModal() {
  const { profile, user, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [draftName, setDraftName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameBusy, setNameBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nameComplete = isStudentNameComplete(profile);
  const needsAvatar = !profile?.avatar_path;
  const incomplete = !isProfileComplete(profile);

  useEffect(() => {
    if (profile) {
      setDraftName((current) => (current === null ? profile.full_name : current));
    }
  }, [profile]);

  useEffect(() => {
    let active = true;
    setPhotoUrl(null);
    const path = profile?.avatar_path;
    if (!path) {
      return;
    }
    void getAvatarSignedUrl(path)
      .then((signed) => {
        if (active && signed) setPhotoUrl(signed);
      })
      .catch(() => {
        // Keep the initial fallback.
      });
    return () => {
      active = false;
    };
  }, [profile?.avatar_path]);

  // Lock background scroll while the mandatory modal is open.
  useEffect(() => {
    if (!incomplete) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [incomplete]);

  if (!profile || profile.role !== 'student' || !incomplete) {
    return null;
  }

  const handleSaveName = async () => {
    const next = (draftName ?? '').trim();
    const validationError = validateArabicFullName(next);
    if (validationError) {
      setNameError(validationError);
      return;
    }
    if (!profile) {
      return;
    }
    setNameError(null);
    setNameBusy(true);
    try {
      await updateOwnProfile({
        fullName: next,
        phone: profile.phone,
        guardianPhone: profile.guardian_phone,
        address: profile.address,
      });
      await refreshProfile();
      showToast('تم حفظ الاسم بنجاح');
    } catch {
      setNameError('تعذر حفظ الاسم. حاول مرة أخرى لاحقًا');
    } finally {
      setNameBusy(false);
    }
  };

  const handlePhotoFile = async (file: File | null) => {
    if (!file || photoBusy) {
      return;
    }
    if (!user) {
      showToast('تعذر تحديد الحساب. حاول مرة أخرى لاحقًا', 'error');
      return;
    }
    const validationError = validateAvatarImage(file);
    if (validationError) {
      setPhotoError(validationError);
      return;
    }
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const blob = await compressAvatarImage(file);
      const path = await uploadMyAvatar(user.id, blob);
      await setMyAvatar(path);
      await refreshProfile();
      showToast('تم رفع الصورة الشخصية بنجاح');
    } catch {
      setPhotoError('تعذر رفع الصورة. حاول مرة أخرى لاحقًا');
    } finally {
      setPhotoBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-[rgb(10_12_10/0.6)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="مراجعة بيانات الملف"
      data-testid="profile-completion-modal"
    >
      <div className="glass-panel my-auto w-full max-w-lg rounded-[20px] p-5 text-start sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong"
            >
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-lg font-black text-foreground">مراجعة بيانات الملف</p>
              <p className="mt-0.5 text-xs text-foreground-subtle">
                إكمال البيانات إجباري ولا يمكن إغلاق هذه النافذة أو استخدام المنصة قبل الحفظ
              </p>
            </div>
          </div>
        </div>

        <dl className="mt-4 flex flex-col gap-2 rounded-2xl border border-border bg-surface-muted p-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0 text-xs font-bold text-foreground-subtle">البريد الإلكتروني</dt>
            <dd className="truncate font-semibold text-foreground" dir="ltr">
              {user?.email ?? '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0 text-xs font-bold text-foreground-subtle">رقم الهاتف</dt>
            <dd className="font-semibold tabular-nums text-foreground" dir="ltr">
              {profile.phone}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0 text-xs font-bold text-foreground-subtle">هاتف ولي الأمر</dt>
            <dd className="font-semibold tabular-nums text-foreground" dir="ltr">
              {profile.guardian_phone || '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0 text-xs font-bold text-foreground-subtle">العنوان</dt>
            <dd className="truncate font-semibold text-foreground">{profile.address || '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0 text-xs font-bold text-foreground-subtle">تاريخ التسجيل</dt>
            <dd className="font-semibold text-foreground">{formatDateTime(profile.created_at)}</dd>
          </div>
        </dl>

        <div
          data-testid="profile-completion-why"
          className="mt-4 rounded-2xl border border-primary/30 bg-primary-soft/40 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-black text-foreground">
            <HelpCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-strong" />
            ليه بنطلب البيانات كاملة؟
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-xs leading-6 text-foreground-muted">
            <li>التعرف عليك ومنع انتحال الحسابات — الاسم الثلاثي والصورة هويتك داخل المنصة.</li>
            <li>التواصل معك ومع ولي أمرك عند الحاجة — لذلك أرقام الهواتف إجبارية وصحيحة.</li>
            <li>متابعة تقدمك ونتائجك بدقة لكل طالب في سيستم المتابعة.</li>
            <li>أي سجلات أو إثباتات مستقبلية تحتاج اسمك الكامل الصحيح.</li>
          </ul>
          <p className="mt-3 flex items-center gap-2 text-sm font-black text-foreground">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-strong" />
            قواعد قبول البيانات
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-xs leading-6 text-foreground-muted">
            <li>الاسم ثلاثي على الأقل (مثال: أحمد محمد علي) وباللغة العربية فقط — لا يمكن الحفظ بدونه.</li>
            <li>صورة شخصية واضحة — تُعرض في شريط لوحة التحكم.</li>
            <li>لا يمكن إغلاق هذه النافذة أو استخدام المنصة قبل إكمال الاسم والصورة معاً.</li>
          </ul>
        </div>

        <div className="mt-4">
          <label htmlFor="profile-completion-name" className="mb-1.5 block text-sm font-bold text-foreground">
            الاسم الثلاثي <span className="font-medium text-foreground-subtle">(بالعربية فقط)</span>
          </label>
          <div className="flex gap-2">
            <input
              id="profile-completion-name"
              type="text"
              value={draftName ?? ''}
              onChange={(event) => {
                setDraftName(event.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="مثال: أحمد محمد علي"
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-input px-3 text-sm text-foreground placeholder:text-foreground-subtle/60 focus:border-primary-strong focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button size="sm" loading={nameBusy} onClick={() => void handleSaveName()}>
              حفظ الاسم
            </Button>
          </div>
          {nameError ? (
            <p role="alert" className="mt-1.5 animate-fade-in text-xs font-medium text-error">
              {nameError}
            </p>
          ) : null}
          {nameComplete ? (
            <p className="mt-1.5 text-xs font-medium text-success">الاسم مطابق للقواعد ✓</p>
          ) : null}
        </div>

        <div className="mt-4 flex items-center gap-3">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="معاينة الصورة الشخصية"
              draggable={false}
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xl font-black text-primary-strong"
            >
              {(profile.full_name.trim().charAt(0) || 'ط')}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="text-xs text-foreground-muted">
              {needsAvatar ? 'لا توجد صورة شخصية بعد — رفعها إجباري.' : 'الصورة الشخصية محفوظة ✓'}
            </p>
            {photoError ? (
              <p role="alert" className="text-xs font-medium text-error">
                {photoError}
              </p>
            ) : null}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="رفع الصورة الشخصية"
                className="sr-only"
                onChange={(event) => void handlePhotoFile(event.target.files?.[0] ?? null)}
              />
              <Button
                variant="secondary"
                size="sm"
                icon={<Camera aria-hidden="true" className="h-4 w-4" />}
                loading={photoBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                {needsAvatar ? 'رفع الصورة' : 'تغيير الصورة'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
