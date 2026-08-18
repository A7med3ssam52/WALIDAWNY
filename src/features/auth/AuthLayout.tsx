import type { ReactNode } from 'react';
import { BarChart3, Sparkles, Video } from 'lucide-react';

import { BrandIcon } from '../../components/BrandIcon';
import { WhatsAppIcon } from '../../components/WhatsAppIcon';

const valueProps = [
  {
    title: 'دروس مصورة بجودة عالية',
    description: 'محتوى حصري منشور بعناية لمتابعة المذاكرة خطوة بخطوة',
    icon: Video,
  },
  {
    title: 'متابعة مستمرة للتقدم',
    description: 'اعرف نسبة إنجازك في كل درس ووحدة بمجرد فتح المنصة',
    icon: BarChart3,
  },
  {
    title: 'تواصل مباشر مع الأستاذ',
    description: 'أي استفسار؟ الأستاذ بجانبك دائمًا عبر واتساب',
    icon: WhatsAppIcon,
  },
];

function BrandMark({ className }: { className?: string }) {
  return <BrandIcon className={className} />;
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="flex min-h-screen flex-col">
      <h1 className="sr-only">منصة مستر وليد عونى التعليمية</h1>
      <div className="mx-auto w-full max-w-md px-4 pt-6 sm:px-6 lg:hidden">
        <div className="flex items-center justify-center gap-2.5">
          <span className="relative inline-flex">
            <span
              aria-hidden="true"
              className="conic-ring absolute -inset-1 rounded-2xl opacity-80"
            />
            <BrandMark className="relative h-10 w-10" />
          </span>
          <span className="font-display text-base font-bold text-foreground">
            منصة مستر وليد عونى التعليمية
          </span>
        </div>
      </div>

      <div className="flex flex-1">
        <aside className="relative hidden w-[45%] max-w-xl flex-col justify-between overflow-hidden border-e border-white/8 p-10 lg:flex">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
          >
            <div className="absolute -start-24 -top-24 h-80 w-80 animate-orb rounded-full bg-indigo-600/30 blur-3xl" />
            <div className="absolute -bottom-32 -end-20 h-96 w-96 animate-orb rounded-full bg-fuchsia-600/25 blur-3xl [animation-delay:2s]" />
            <div className="absolute start-1/3 top-1/2 h-72 w-72 animate-pulse-soft rounded-full bg-cyan-500/15 blur-3xl" />
          </div>

          <div className="relative flex items-center gap-3">
            <BrandMark className="h-11 w-11" />
            <div>
              <span className="block font-display text-lg font-bold text-foreground">
                منصة مستر وليد عونى التعليمية
              </span>
              <span className="mt-0.5 block text-xs text-foreground-subtle">
                تعلّم. تابع. تواصل.
              </span>
            </div>
          </div>

          <ul className="relative flex flex-col gap-6">
            {valueProps.map((item) => (
              <li key={item.title} className="group flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/25 text-indigo-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_24px_-6px_rgba(129,140,248,0.6)] transition-transform duration-300 group-hover:scale-110"
                >
                  <item.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-foreground">{item.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-foreground-muted">
                    {item.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="relative">
            <span className="glass-soft inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold text-indigo-300 shadow-[0_0_24px_-8px_rgba(129,140,248,0.8)]">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-fuchsia-300" />
              تجربة تعليمية متكاملة
            </span>
            <p className="mt-4 text-xs text-foreground-subtle">
              © {new Date().getFullYear()} منصة مستر وليد عونى التعليمية. جميع الحقوق محفوظة
            </p>
          </div>
        </aside>

        <main className="relative flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
          >
            <div className="conic-ring absolute start-1/2 top-6 h-72 w-72 -translate-x-1/2 rounded-full opacity-40 blur-[1px]" />
            <div className="absolute start-10 top-10 h-56 w-56 animate-orb rounded-full bg-purple-600/15 blur-3xl" />
            <div className="absolute bottom-10 end-10 h-64 w-64 animate-orb rounded-full bg-indigo-600/15 blur-3xl [animation-delay:3s]" />
          </div>
          <div className="relative w-full max-w-md animate-scale-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
