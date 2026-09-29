import { Settings } from 'lucide-react';

export function ConfigErrorScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="glass-card p-8 text-center">
          <span
            aria-hidden="true"
            className="health-lime-card mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl"
          >
            <Settings className="h-7 w-7" />
          </span>
          <h1 className="mt-6 font-display text-xl font-bold text-foreground">
            تعذر تشغيل التطبيق
          </h1>
          <p className="mt-3 text-sm leading-6 text-foreground-muted">
            لم يتم إعداد الاتصال بـ Supabase. انسخ ملف .env.example إلى .env.local واملأ القيم
            التالية:
          </p>
          <ul className="mt-4 space-y-2 text-start">
            <li
              className="rounded-xl border border-border bg-surface-muted px-4 py-2.5 font-mono text-sm text-foreground break-all"
              dir="ltr"
            >
              VITE_SUPABASE_URL
            </li>
            <li
              className="rounded-xl border border-border bg-surface-muted px-4 py-2.5 font-mono text-sm text-foreground break-all"
              dir="ltr"
            >
              VITE_SUPABASE_PUBLISHABLE_KEY
            </li>
          </ul>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary mt-6 inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-bold"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    </div>
  );
}
