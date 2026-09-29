import { useEffect, useRef, useState } from 'react';
import { Camera, HelpCircle, ShieldCheck, Timer, X } from 'lucide-react';

import { getAvatarSignedUrl, setMyAvatar, updateOwnProfile, uploadMyAvatar } from '../data/rpc';
import { compressAvatarImage, validateAvatarImage } from '../lib/imageCompress';
import { formatDateTime } from '../lib/format';
import { useServerTime } from '../lib/serverTime';
import { validateArabicFullName } from '../lib/validation';
import { useAuth } from '../features/auth/AuthContext';
import { useToast } from './Toast';
import { Button } from './Button';

const DISMISS_KEY = 'profile-completion-dismissed';
const GRACE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function deadlineOf(createdAt: string | null | undefined): number {
  const stamp = createdAt ? Date.parse(createdAt) : Number.NaN;
  if (Number.isNaN(stamp)) {
    // Unknown join date: require completion immediately (tracking-safe).
    return 0;
  }
  return stamp + GRACE_DAYS * MS_PER_DAY;
}

function isDismissedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function dismissThisSession(): void {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Private mode: the modal simply reappears on next render.
  }
}

function pluralUnit(value: number, one: string, two: string, many: string): string {
  if (value === 1) return `1 ${one}`;
  if (value === 2) return `2 ${two}`;
  return `${value} ${many}`;
}

/** Arabic countdown text, e.g. "5 أيام و3 ساعات و12 دقيقة و40 ثانية". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(pluralUnit(days, 'يوم', 'يومان', 'أيام'));
  if (hours > 0 || days > 0) parts.push(pluralUnit(hours, 'ساعة', 'ساعتان', 'ساعات'));
  parts.push(pluralUnit(minutes, 'دقيقة', 'دقيقتان', 'دقائق'));
  parts.push(pluralUnit(seconds, 'ثانية', 'ثانيتان', 'ثوانٍ'));
  return parts.join(' و');
}

/**
 * Student tracking review modal: shows the full account record and
 * requires a triple Arabic name plus a profile photo.
 * The 7-day grace countdown runs on the SERVER clock (anti-tamper);
 * dismissible once per session during grace, then mandatory forever.
 * Mounted by LayoutShell for student roles only.
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
  const [dismissed, setDismissed] = useState(isDismissedThisSession);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const announcedBucket = useRef('');
  const [announcement, setAnnouncement] = useState('');

  const { ready: clockReady, failed: clockFailed, nowMs } = useServerTime(!!profile);

  const nameInvalid = profile ? validateArabicFullName(profile.full_name) !== null : false;
  const needsAvatar = !profile?.avatar_path;
  const incomplete = Boolean(profile && profile.role === 'student' && (nameInvalid || needsAvatar));
  const deadline = profile ? deadlineOf(profile.created_at) : 0;
  // Fail closed: without an authoritative clock reading, the deadline
  // counts as passed (device clock is never trusted).
  const overdue = profile ? nowMs === null || nowMs > deadline : false;
  const remainingMs = nowMs === null ? 0 : Math.max(0, deadline - nowMs);

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

  // Screen-reader announcements only when crossing hour/day thresholds,
  // so the ticking timer stays silent.
  useEffect(() => {
    if (overdue || nowMs === null) {
      return;
    }
    const bucket = `${Math.floor(remainingMs / 3600000)}`;
    if (bucket !== announcedBucket.current) {
      announcedBucket.current = bucket;
      setAnnouncement(`متبقي على الموعد النهائي ${formatCountdown(remainingMs)}`);
    }
  });

  if (!profile || profile.role !== 'student' || !incomplete) {
    return null;
  }
  if (!clockReady && !clockFailed) {
    // Wait for the authoritative server clock; never trust the device.
    return null;
  }
  if (dismissed && !overdue) {
    return null;
  }

  const handleDismiss = () => {
    dismissThisSession();
    setDismissed(true);
  };

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
                {overdue
                  ? 'المهلة انتهت — إكمال البيانات إجباري ولا يمكن إغلاق هذه النافذة'
                  : 'يمكنك الإغلاق الآن — بعد انتهاء المهلة يصبح الإكمال إجباريًا'}
              </p>
            </div>
          </div>
          {!overdue ? (
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="إغلاق"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground-subtle transition-colors hover:bg-surface-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        {!overdue ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-warning/30 bg-warning/[0.07] px-4 py-2.5">
            <Timer aria-hidden="true" className="h-5 w-5 shrink-0 text-warning" />
            <p
              aria-hidden="true"
              data-testid="profile-completion-countdown"
              className="text-sm font-black tabular-nums text-foreground"
            >
              متبقي {formatCountdown(remainingMs)}
            </p>
            <p aria-live="polite" className="sr-only">
              {announcement}
            </p>
          </div>
        ) : null}

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
            <li>الاسم ثلاثي على الأقل (مثال: أحمد محمد علي) وباللغة العربية فقط.</li>
            <li>صورة شخصية واضحة — تُعرض في شريط لوحة التحكم.</li>
            <li>الإكمال قبل انتهاء العد التنازلي، وبعدها لا يمكن إغلاق هذه النافذة.</li>
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
          {nameInvalid ? null : (
            <p className="mt-1.5 text-xs font-medium text-success">الاسم مطابق للقواعد ✓</p>
          )}
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
              {needsAvatar ? 'لا توجد صورة شخصية بعد.' : 'الصورة الشخصية محفوظة ✓'}
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

        {!overdue ? (
          <Button variant="ghost" size="sm" className="mt-5 w-full" onClick={handleDismiss}>
            تذكيري لاحقاً
          </Button>
        ) : null}
      </div>
    </div>
  );
}
