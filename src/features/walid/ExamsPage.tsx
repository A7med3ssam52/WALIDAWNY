import { ClipboardList } from 'lucide-react';

import { LayoutShell } from '../../components/LayoutShell';
import { StaffNav } from '../../components/StaffNav';

export function ExamsPage() {
  return (
    <LayoutShell
      title="الإختبارات"
      subtitle="إنشاء الإختبارات ومتابعة درجات الطلاب"
      variant="sidebar"
      nav={<StaffNav />}
    >
      <div className="glass-card flex flex-col items-center justify-center gap-5 px-6 py-16 text-center sm:py-20">
        <span className="relative inline-flex">
          <span
            aria-hidden="true"
            className="absolute inset-0 animate-pulse-soft rounded-2xl bg-gradient-to-br from-indigo-500/50 to-fuchsia-500/50 blur-xl"
          />
          <span
            aria-hidden="true"
            className="relative inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 text-white shadow-[0_0_34px_-6px_rgba(129,140,248,0.9)]"
          >
            <ClipboardList className="h-8 w-8" />
          </span>
        </span>

        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-3.5 py-1 text-xs font-bold text-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-glow opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-glow" />
          </span>
          قريباً
        </span>

        <div>
          <h2 className="text-xl font-bold text-foreground">إدارة الإختبارات في الطريق إليك</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-foreground-muted">
            قريباً ستتمكن من إنشاء الإختبارات وتصحيحها ومتابعة درجات طلابك من مكان واحد. تابعنا،
            فنحن نعمل على تجهيزها بعناية.
          </p>
        </div>
      </div>
    </LayoutShell>
  );
}
