import { Outlet } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

import { useAuth } from '../features/auth/AuthContext';
import { isProfileComplete } from '../lib/profileCompletion';
import { Button } from './Button';
import { Card } from './Card';
import { ProfileCompletionModal } from './ProfileCompletionModal';

/**
 * Locks every nested /student/* route until the profile is complete
 * (triple Arabic name + avatar photo). Renders the completion modal
 * itself because the blocked page (and its LayoutShell) never mounts.
 * Sign-out stays reachable from ... actually the header is also blocked,
 * so a sign-out button is included here to avoid trapping anyone.
 */
export function ProfileCompletionGate() {
  const { profile, profileLoading, signOut } = useAuth();

  if (profileLoading) {
    return <Outlet />;
  }
  if (profile?.role === 'student' && !isProfileComplete(profile)) {
    return (
      <>
        <ProfileCompletionModal />
        <div className="flex min-h-screen items-center justify-center bg-background p-4" dir="rtl">
          <Card
            title="استكمال البيانات مطلوب"
            subtitle="ارفع صورتك الشخصية واحفظ اسمك الثلاثي بالعربية لفتح أقسام المنصة"
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <span
                aria-hidden="true"
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong"
              >
                <ShieldCheck className="h-7 w-7" />
              </span>
              <p className="text-sm leading-7 text-foreground-muted" data-testid="profile-gate-message">
                حسابك مسجل الدخول بنجاح، لكن لا يمكن عرض أي صفحة قبل إكمال البيانات في النافذة
                الظاهرة أمامك — الاسم الثلاثي العربي والصورة الشخصية إجباريان.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    document.getElementById('profile-completion-name')?.focus();
                  }}
                >
                  الذهاب لاستكمال البيانات
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void signOut()}
                >
                  تسجيل الخروج
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </>
    );
  }
  return <Outlet />;
}
