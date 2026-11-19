import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  FileText,
  Lock,
  MessageCircle,
  Phone,
  Scale,
  SearchCheck,
  ShieldAlert,
  UserCheck,
  UserX,
} from 'lucide-react';

import { getPublicSettings } from '../../data/rpc';
import { buildWhatsAppLink } from '../../lib/format';
import type { PublicSettings } from '../../types/database';

/** Fixed security-lockdown support line (same number as the suspension flow). */
const SUPPORT_NUMBER = '+201226771154';
const SUPPORT_DISPLAY = '01226771154';
const FALLBACK_PLATFORM_NAME = 'وليداوني';
const INQUIRY_MESSAGE = 'استفسار بخصوص الإغلاق الأمني للمنصة';

/**
 * Full-screen security notice shown while the platform is locked via
 * VITE_MAINTENANCE_MODE=true. There is intentionally no way to dismiss,
 * navigate away from, or bypass this screen — every route renders it
 * (see App.tsx), and the Supabase API is not the enforcement layer here.
 */
export function MaintenancePage() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicSettings()
      .then((data) => {
        if (!cancelled) {
          setSettings(data);
        }
      })
      .catch(() => {
        // Keep fallbacks — the notice must render even with the backend unreachable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const platformName = settings?.platform_name?.trim() || FALLBACK_PLATFORM_NAME;
  const whatsappHref = buildWhatsAppLink(SUPPORT_NUMBER, INQUIRY_MESSAGE);

  return (
    <div
      dir="rtl"
      className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-background p-4 sm:p-6"
    >
      {/* Ambient glows — decorative only */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 right-1/2 h-96 w-96 translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(232,139,139,0.14),transparent_70%)] blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(232,139,139,0.08),transparent_70%)] blur-2xl"
      />

      <main role="main" aria-labelledby="maintenance-title" className="relative w-full max-w-2xl py-6">
        <div className="glass-card overflow-hidden rounded-3xl border border-border shadow-elevated">
          {/* ── Header band ─────────────────────────────────────────── */}
          <div className="border-b border-border bg-[rgba(232,139,139,0.06)] px-6 py-6 text-center sm:px-10">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(232,139,139,0.28)] bg-[rgba(232,139,139,0.10)] text-error">
              <ShieldAlert className="h-8 w-8" aria-hidden="true" />
            </span>
            <p className="mt-4 text-[11px] font-black uppercase tracking-[0.35em] text-error/90">
              إخطار أمني عاجل
            </p>
            <h1
              id="maintenance-title"
              className="font-display mt-2 text-2xl font-black leading-snug text-foreground sm:text-3xl"
            >
              الإغلاق المؤقت للمنصة
            </h1>
            <p className="mt-3 text-sm font-semibold leading-7 text-foreground-muted">
              بموجب قرار إداري حازم، تقرر <strong className="text-foreground">الإغلاق المؤقت الكامل</strong>{' '}
              لمنصة {platformName} أمام جميع المستخدمين دون استثناء، اعتباراً من الآن
              <strong className="text-error"> وحتى إشعار آخر</strong>، وذلك في إطار{' '}
              <strong className="text-foreground">
                أعمال المراجعة والتحليل الأمني السيبراني الشامل لقوائم الطلاب المسجلين خلال الفترة السابقة
              </strong>
              .
            </p>
          </div>

          <div className="space-y-6 px-6 py-6 sm:px-10">
            {/* ── ماذا حدث؟ ─────────────────────────────────────────── */}
            <section aria-labelledby="maintenance-what-happened">
              <h2
                id="maintenance-what-happened"
                className="flex items-center gap-2 text-sm font-black text-foreground"
              >
                <SearchCheck className="h-4 w-4 text-error" aria-hidden="true" />
                ماذا حدث؟
              </h2>
              <p className="mt-2 text-[13px] leading-7 text-foreground-muted">
                منذ فترة، رصدت الإدارة عدداً من <strong className="text-foreground">الحسابات الوهمية</strong>{' '}
                والبيانات المضللة بين المسجلين. ولم تتعامل معها الإدارة بتسرّع ولا اكتفت بشطبها، بل جرى
                التعامل معها بمنهجية أمنية محترفة: تم تفعيل{' '}
                <strong className="text-foreground">مصيدة رقمية عبر واجهات برمجة التطبيقات (API)</strong>{' '}
                الخاصة بتلك الحسابات، وتم تسجيل ورصد كل اتصال يتم من خلالها، والمعلومات التقنية المصاحبة
                لكل اتصال، ثم جمع هذه البيانات وتحليلها. وبذلك أصبحت{' '}
                <strong className="text-foreground">
                  هوية القائمين على تلك الحسابات، والأطراف المرتبطة بهم، تحت تصرف الإدارة منذ ذلك الحين
                </strong>
                .
              </p>
            </section>

            {/* ── ما المطلوب منك الآن؟ ──────────────────────────────── */}
            <section aria-labelledby="maintenance-what-now">
              <h2
                id="maintenance-what-now"
                className="flex items-center gap-2 text-sm font-black text-foreground"
              >
                <AlertTriangle className="h-4 w-4 text-error" aria-hidden="true" />
                ما المطلوب منك الآن؟
              </h2>
              <ul className="mt-2 space-y-2 text-[13px] leading-7 text-foreground-muted">
                <li className="flex items-start gap-2 rounded-xl border border-[rgba(232,139,139,0.22)] bg-[rgba(232,139,139,0.06)] px-3 py-2.5">
                  <Ban className="mt-1 h-4 w-4 shrink-0 text-error" aria-hidden="true" />
                  <span>
                    يُحظر حظراً تاماً محاولة تسجيل الدخول أو إنشاء حسابات أو استخدام أي وسيلة تقنية لتجاوز
                    هذا الإغلاق.{' '}
                    <strong className="text-foreground">
                      أي محاولة وصول خلال فترة الإغلاق تُرصد وتُسجَّل وتُضاف إلى ملف التحقيق الجاري كمحاولة
                      اختراق مكتملة الأركان.
                    </strong>
                  </span>
                </li>
                <li className="flex items-start gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2.5">
                  <UserCheck className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    <strong className="text-foreground">
                      الطالب صاحب الحساب الحقيقي الذي لم يرتكب أي مخالفة:
                    </strong>{' '}
                    بياناتك وحقوقك محفوظة بالكامل، وستصلك إشعارات فور انتهاء التحليل وإعادة فتح المنصة.
                  </span>
                </li>
                <li className="flex items-start gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2.5">
                  <UserX className="mt-1 h-4 w-4 shrink-0 text-error" aria-hidden="true" />
                  <span>
                    <strong className="text-foreground">أما صاحب الحساب الوهمي أو البيانات المضللة:</strong>{' '}
                    فالأوراق في أيدينا بالفعل. المبادرة الآن بالتواصل مع الإدارة فوراً لتسوية وضعك أفضل من
                    الانتظار حتى يكتمل الملف.
                  </span>
                </li>
              </ul>
            </section>

            {/* ── ما الذي سيحدث؟ ────────────────────────────────────── */}
            <section aria-labelledby="maintenance-what-next">
              <h2
                id="maintenance-what-next"
                className="flex items-center gap-2 text-sm font-black text-foreground"
              >
                <FileText className="h-4 w-4 text-error" aria-hidden="true" />
                ما الذي سيحدث؟
              </h2>
              <ul className="mt-2 list-disc space-y-1.5 pe-5 text-[13px] leading-7 text-foreground-muted marker:text-error">
                <li>فحص ومطابقة شاملة لكل الحسابات المسجلة خلال الفترة السابقة.</li>
                <li>
                  <strong className="text-foreground">شطب نهائي دون استثناء</strong> للحسابات الوهمية،
                  وإلغاء الاشتراكات والأكواد والمميزات المرتبطة بها،{' '}
                  <strong className="text-foreground">ودون استرداد أي مبالغ مدفوعة</strong>.
                </li>
                <li>
                  اتخاذ الإجراءات النظامية والقانونية اللازمة ضد القائمين على هذه الحسابات، بما في ذلك
                  إبلاغ الجهات المختصة والمطالبة بالتعويض عن الأضرار.
                </li>
                <li>
                  <strong className="text-foreground">لا يوجد موعد معلن لإعادة الفتح</strong>؛ سيتم الإعلان
                  رسمياً عند انتهاء التحليل.
                </li>
              </ul>
            </section>

            {/* ── الخلاصة + التواصل ──────────────────────────────────── */}
            <div className="rounded-2xl border border-[rgba(232,139,139,0.28)] bg-[rgba(232,139,139,0.08)] px-4 py-4 text-center">
              <p className="flex items-center justify-center gap-2 text-[13px] font-black leading-7 text-foreground">
                <Scale className="h-4 w-4 shrink-0 text-error" aria-hidden="true" />
                هذا الإغلاق ليس عطلاً تقنياً ولا صيانة روتينية — إنه قرار أمني حازم لحماية بيانات الطلاب
                الحقيقيين وحقوقهم.
              </p>

              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="btn-primary mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-bold transition-colors"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                تواصل مع الإدارة فوراً عبر واتساب
              </a>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                dir="ltr"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-primary-strong"
              >
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {SUPPORT_DISPLAY}
              </a>
            </div>

            <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-foreground-subtle">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              أي محاولة وصول خلال فترة الإغلاق تُرصد وتُسجَّل — إدارة المنصة
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
