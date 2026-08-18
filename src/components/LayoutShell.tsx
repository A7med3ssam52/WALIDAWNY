import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

import { useAuth } from '../features/auth/AuthContext';
import { BrandIcon } from './BrandIcon';
import { Button } from './Button';
import { useToast } from './Toast';

interface LayoutShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  nav?: ReactNode;
  children: ReactNode;
  variant?: 'top' | 'sidebar';
  bottomNav?: ReactNode;
}

const roleLabels: Record<string, string> = {
  student: 'طالب',
  teacher: 'مدرس',
  mr_walid: 'أ. وليد',
  admin: 'مدير',
};

function Brand() {
  return (
    <Link
      to="/"
      className="group inline-flex items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <BrandIcon className="h-9 w-9 transition-shadow duration-300 group-hover:shadow-[0_0_30px_-2px_rgba(129,140,248,0.9)]" />
      <span className="hidden min-w-0 truncate font-display text-base font-bold text-foreground min-[480px]:inline">
        منصة وليد عونى التعليمية
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
}: LayoutShellProps) {
  const { profile, role, user, signOut } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const displayName = profile?.full_name ?? user?.email ?? '';
  const roleLabel = role ? (roleLabels[role] ?? role) : '';
  const hasSidebar = variant === 'sidebar' && nav !== undefined;

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
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[300] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-indigo-700 focus:shadow-elevated"
      >
        تخطي إلى المحتوى الرئيسي
      </a>

      <header className="glass-nav sticky top-0 z-40">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {hasSidebar ? (
              <button
                type="button"
                aria-label="فتح القائمة"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-white/6 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:h-10 sm:w-10 lg:hidden"
                onClick={() => setDrawerOpen(true)}
              >
                <Menu aria-hidden="true" className="h-5 w-5" />
              </button>
            ) : null}
            <Brand />
            {roleLabel ? (
              <span className="hidden rounded-full bg-gradient-to-r from-indigo-500/20 to-purple-500/20 px-2.5 py-0.5 text-xs font-medium text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_16px_-6px_rgba(129,140,248,0.6)] sm:inline">
                {roleLabel}
              </span>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <span className="max-w-[26vw] truncate text-sm text-foreground-muted sm:max-w-[30vw] lg:max-w-[40vw]">
              {displayName}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void handleSignOut()} className="shrink-0">
              تسجيل الخروج
            </Button>
          </div>
        </div>
      </header>

      {hasSidebar ? (
        <aside className="glass-card fixed inset-y-20 start-4 z-40 hidden w-60 overflow-y-auto rounded-2xl p-0 lg:block">
          {nav}
        </aside>
      ) : null}

      {hasSidebar && drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="glass-overlay absolute inset-0 animate-fade-in" onClick={() => setDrawerOpen(false)} />
          <div className="glass-panel absolute inset-y-0 start-0 flex w-72 max-w-[82vw] animate-slide-in-start flex-col">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/8 px-4">
              <Brand />
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="إغلاق القائمة"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-white/6 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:h-10 sm:w-10"
                onClick={() => setDrawerOpen(false)}
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto" onClick={() => setDrawerOpen(false)}>
              {nav}
            </div>
          </div>
        </div>
      ) : null}

      {variant === 'top' && nav ? (
        <div className="border-b border-white/6 bg-white/3">{nav}</div>
      ) : null}

      <div className={hasSidebar ? 'lg:ps-72' : ''}>
        <main
          id="main-content"
          className={`mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 ${variant === 'top' && nav ? 'pb-24 md:pb-0' : ''}`}
        >
          <div className="rise mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
                {title}
              </h1>
              {subtitle ? <p className="mt-1 text-sm text-foreground-subtle">{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          </div>
          {children}
        </main>
      </div>

      {bottomNav ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/8 bg-[rgba(8,6,22,0.85)] backdrop-blur-[24px] lg:hidden">
          {bottomNav}
        </div>
      ) : null}
    </div>
  );
}
