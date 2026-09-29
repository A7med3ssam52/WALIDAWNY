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
    <div dir="rtl" className="flex min-h-screen flex-col bg-background">
      <h1 className="sr-only">وليد عونى</h1>
      <div className="mx-auto w-full max-w-md px-4 pt-6 sm:px-6 lg:hidden">
        <div className="flex items-center justify-center gap-2.5">
          <BrandMark className="h-10 w-10" />
          <span className="font-display text-base font-bold text-foreground">
            وليد عونى
          </span>
        </div>
      </div>

      <div className="flex flex-1">
        <aside className="health-sidebar relative m-4 hidden w-[45%] max-w-xl flex-col justify-between overflow-hidden rounded-[20px] p-10 lg:flex">
          <div className="relative flex items-center gap-3">
            <BrandMark className="h-11 w-11" />
            <div>
              <span className="block font-display text-lg font-bold text-white">
                وليد عونى
              </span>
              <span className="health-sidebar-muted mt-0.5 block text-xs">
                تعلّم. تابع. تواصل.
              </span>
            </div>
          </div>

          <ul className="relative flex flex-col gap-6">
            {valueProps.map((item) => (
              <li key={item.title} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="health-lime-card mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                >
                  <item.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-white">{item.title}</span>
                  <span className="health-sidebar-muted mt-1 block text-sm leading-6">
                    {item.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="relative">
            <span className="health-lime-card inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              تجربة تعليمية متكاملة
            </span>
            <p className="health-sidebar-muted mt-4 text-xs">
              © {new Date().getFullYear()} وليد عونى. جميع الحقوق محفوظة
            </p>
          </div>
        </aside>

        <main className="relative flex flex-1 items-center justify-center p-4 sm:p-8">
          <div className="health-shell w-full max-w-md rounded-[20px] border border-border p-4 animate-scale-in sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
