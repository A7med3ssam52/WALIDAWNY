import { Headset } from 'lucide-react';

import { useAuth } from '../features/auth/AuthContext';
import { buildWhatsAppLink } from '../lib/format';

const TECHNICAL_SUPPORT_NUMBER = '01226771154';

export function TechnicalSupportFab() {
  const { profile, user } = useAuth();
  const displayName = profile?.full_name ?? user?.email ?? '';

  const message = `مرحبا، أواجه مشكلة تقنية في المنصة (تسجيل الدخول / تفعيل الكود / الدفع / تشغيل الفيديو). حسابي: ${displayName}`;
  const href = buildWhatsAppLink(TECHNICAL_SUPPORT_NUMBER, message);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="تواصل مع الدعم الفني عبر واتساب"
      data-testid="technical-support-fab"
      className="group fixed bottom-6 start-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elevated transition-all duration-200 hover:scale-105 hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Headset className="h-6 w-6" aria-hidden="true" />
      <span className="absolute -top-1 -end-1 flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-primary ring-2 ring-surface" />
      </span>
      <span className="pointer-events-none absolute bottom-16 start-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground shadow-elevated group-hover:block group-focus-visible:block">
        الدعم الفني — رد خلال دقائق
      </span>
    </a>
  );
}
