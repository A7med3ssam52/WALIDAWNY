import { Link } from 'react-router-dom';
import { Compass, GraduationCap } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4" dir="rtl">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute left-1/4 top-1/4 h-72 w-72 animate-orb rounded-full bg-indigo-600/25 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-80 w-80 animate-orb rounded-full bg-fuchsia-600/20 blur-3xl [animation-delay:2.5s]" />
      </div>

      <div className="conic-ring spotlight-card glass-card relative w-full max-w-md p-8 text-center">
        <span
          aria-hidden="true"
          className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 text-white shadow-[0_0_34px_-6px_rgba(129,140,248,0.9)]"
        >
          <GraduationCap className="h-7 w-7" />
        </span>
        <h1 className="mt-6 font-display text-6xl font-extrabold leading-tight sm:text-7xl">
          <span className="text-gradient text-glow">404</span>
        </h1>
        <p className="mt-3 text-base text-foreground-muted">
          الصفحة التي تبحث عنها غير موجودة
        </p>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-foreground-subtle">
          ربما انتقلت إلى مكان آخر أو تم حذفها. يمكنك العودة إلى الرئيسية والمتابعة من حيث توقفت
        </p>
        <Link
          to="/"
          className="btn-primary mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-white sm:text-base"
        >
          <Compass aria-hidden="true" className="h-4 w-4" />
          العودة إلى الرئيسية
        </Link>
      </div>
    </div>
  );
}
