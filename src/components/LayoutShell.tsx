import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Menu, X, Zap } from 'lucide-react';

import { useAuth } from '../features/auth/AuthContext';
import { AvatarImage } from './AvatarImage';
import { BrandIcon } from './BrandIcon';
import { Button } from './Button';
import { ProfileCompletionModal } from './ProfileCompletionModal';
import { useToast } from './Toast';
import { ThemePicker } from '../theme/ThemePicker';

interface LayoutShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  nav?: ReactNode;
  children: ReactNode;
  variant?: 'top' | 'sidebar';
  bottomNav?: ReactNode;
  /** Full-screen mode: removes the outer frame padding and all max-width
      caps so content uses the full viewport width. Defaults to true so
      every dashboard/control panel is full-screen on all pages.
      Pass `wide={false}` explicitly to opt back into the old boxed frame. */
  wide?: boolean;
}

const roleLabels: Record<string, string> = {
  student: 'طالب',
  teacher: 'مدرس',
  mr_walid: 'أ. وليد',
  admin: 'مدير',
};

function notificationsTarget(role: string | null): string {
  if (role === 'student') return '/student/notifications';
  if (role === 'admin') return '/admin/suggestions';
  return '/walid/announcements';
}

function SidebarBrand() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2.5 rounded-full px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      aria-label="وليد عونى — الرئيسية"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Zap aria-hidden="true" className="h-5 w-5" strokeWidth={2.4} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-bold text-sidebar-foreground">وليد عونى</span>
      </span>
    </Link>
  );
}

function TopBrand() {
  return (
    <Link
      to="/"
      className="inline-flex shrink-0 items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      aria-label="وليد عونى — الرئيسية"
    >
      <BrandIcon className="h-9 w-9" />
      <span className="hidden min-w-0 truncate text-base font-bold text-foreground min-[480px]:inline">
        وليد عونى
      </span>
    </Link>
  );
}

export function LayoutShell({
  title,
  subtitle,
  actions,
  nav,
  children,
  variant = 'top',
  bottomNav,
  wide = true,
}: LayoutShellProps) {
  const { profile, role, user, signOut } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const displayName = profile?.full_name ?? user?.email ?? '';
  const roleLabel = role ? (roleLabels[role] ?? role) : '';
  const hasSidebar = variant === 'sidebar' && nav !== undefined;
  const avatarInitial = displayName.trim().charAt(0) || 'و';
  const todayLabel = new Intl.DateTimeFormat('ar', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      showToast('تعذر تسجيل الخروج. حاول مرة أخرى لاحقًا', 'error');
    }
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  return (
    <div dir="rtl" className={wide ? 'min-h-screen bg-background' : 'min-h-screen bg-background p-2 sm:p-4'}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[300] focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-strong"
      >
        تخطي إلى المحتوى الرئيسي
      </a>

      <div
        className={
          wide
            ? 'mx-auto flex min-h-screen w-full items-stretch gap-3 bg-shell p-3'
            : 'mx-auto flex min-h-[calc(100vh-1rem)] w-full max-w-[1400px] items-stretch gap-3 rounded-[24px] bg-shell p-3 shadow-[0_20px_44px_-20px_rgb(0_0_0/0.5)] sm:min-h-[calc(100vh-2rem)]'
        }
      >
        {hasSidebar ? (
          <aside
            aria-label="الشريط الجانبي"
            className={`sticky hidden w-60 shrink-0 flex-col overflow-y-auto rounded-[20px] bg-sidebar p-3 text-sidebar-foreground lg:flex ${
              wide ? 'top-3 max-h-[calc(100vh-1.5rem)]' : 'top-6 max-h-[calc(100vh-3.5rem)]'
            }`}
          >
            <SidebarBrand />
            <div className="mt-2 flex-1">{nav}</div>
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="rounded-[20px] border border-border bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.25)]">
            <div className="flex min-h-16 flex-wrap items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
              {hasSidebar ? (
                <button
                  type="button"
                  aria-label="فتح القائمة"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-foreground transition-colors hover:bg-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 lg:hidden"
                  onClick={() => setDrawerOpen(true)}
                >
                  <Menu aria-hidden="true" className="h-5 w-5" />
                </button>
              ) : (
                <TopBrand />
              )}

              <div className="ms-auto flex min-w-0 items-center gap-2">
                <span className="hidden text-xs font-medium text-foreground-subtle xl:inline">{todayLabel}</span>
                <span className="hidden rounded-full border border-border bg-surface-muted px-3 py-1.5 text-xs font-bold text-foreground sm:inline">
                  اليوم
                </span>
                <button
                  type="button"
                  aria-label="الإشعارات"
                  onClick={() => navigate(notificationsTarget(role))}
                  className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-foreground transition-colors hover:bg-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <Bell aria-hidden="true" className="h-5 w-5" />
                  <span
                    aria-hidden="true"
                    className="absolute end-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-surface"
                  />
                </button>
                <AvatarImage
                  path={profile?.avatar_path}
                  alt={displayName || 'الصورة الشخصية'}
                  className="h-10 w-10 shrink-0 rounded-full"
                  fallback={
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                    >
                      {avatarInitial}
                    </span>
                  }
                />
                <span className="hidden min-w-0 leading-tight md:block">
                  <span className="block max-w-[12rem] truncate text-sm font-bold text-foreground">
                    {displayName}
                  </span>
                  {roleLabel ? (
                    <span className="block text-[11px] font-medium text-foreground-subtle">{roleLabel}</span>
                  ) : null}
                </span>
                {roleLabel ? (
                  <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-bold text-primary-strong md:hidden">
                    {roleLabel}
                  </span>
                ) : null}
                <ThemePicker />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleSignOut()}
                  className="shrink-0 rounded-full border border-border"
                >
                  تسجيل الخروج
                </Button>
              </div>
            </div>
          </header>

          {variant === 'top' && nav ? (
            <div className="mt-3 rounded-[20px] border border-border bg-surface px-2 py-1">{nav}</div>
          ) : null}

          <main
            id="main-content"
            className={
              wide
                ? `w-full flex-1 px-2 py-5 sm:px-4 ${bottomNav ? 'pb-24 lg:pb-8' : ''}`
                : `mx-auto w-full max-w-5xl flex-1 px-1 py-5 sm:px-3 ${bottomNav ? 'pb-24 lg:pb-8' : ''}`
            }
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
                {subtitle ? <p className="mt-1 text-sm text-foreground-subtle">{subtitle}</p> : null}
              </div>
              {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
            </div>
            {children}
          </main>
        </div>
      </div>

      {hasSidebar && drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-[rgb(10_12_10/0.6)]"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 start-0 flex w-72 max-w-[82vw] animate-slide-in-start flex-col overflow-y-auto rounded-e-[20px] bg-sidebar p-3 text-sidebar-foreground">
            <div className="flex shrink-0 items-center justify-between">
              <SidebarBrand />
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="إغلاق القائمة"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-sidebar-muted transition-colors hover:bg-white/10 hover:text-sidebar-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                onClick={() => setDrawerOpen(false)}
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-2 flex-1" onClick={() => setDrawerOpen(false)}>
              {nav}
            </div>
          </div>
        </div>
      ) : null}

      {bottomNav ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.5)] lg:hidden">
          {bottomNav}
        </div>
      ) : null}

      {role === 'student' ? <ProfileCompletionModal /> : null}
    </div>
  );
}
