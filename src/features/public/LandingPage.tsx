import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  GraduationCap,
  Lock,
  Menu,
  MessageCircle,
  Play,
  Rocket,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';

import { ErrorState } from '../../components/ErrorState';
import { BrandIcon } from '../../components/BrandIcon';
import { Spinner } from '../../components/Spinner';
import { WhatsAppIcon } from '../../components/WhatsAppIcon';
import { getPublicSettings, getPublicUnitPrices } from '../../data/rpc';
import { buildWhatsAppLink, formatPrice } from '../../lib/format';
import type { PublicSettings, PublicUnitPrice } from '../../types/database';

const benefits = [
  {
    title: 'منهج منظم',
    description: 'صفوف ووحدات ودروس مرتبة تسهل المتابعة خطوة بخطوة حتى النهاية',
    icon: BookOpen,
  },
  {
    title: 'متابعة التقدم',
    description: 'تابع نسبة إنجاز كل درس وأكمل من حيث توقفت في أي وقت',
    icon: BarChart3,
  },
  {
    title: 'محتوى حصري',
    description: 'فيديوهات وملفات حصرية للمشتركين في المنصة فقط',
    icon: Lock,
  },
];

const steps = [
  {
    title: 'أنشئ حسابك',
    description: 'سجّل بياناتك في أقل من دقيقة وابدأ رحلتك التعليمية',
  },
  {
    title: 'فعّل وحدتك',
    description: 'افتح كود التفعيل أو تواصل مع الأستاذ لتفعيل وحدتك مدى الحياة',
  },
  {
    title: 'تابع دروسك',
    description: 'شاهد الفيديوهات وتتبع تقدمك خطوة بخطوة',
  },
];

const marqueeItems = [
  { icon: BookOpen, text: 'منهج منظم' },
  { icon: BarChart3, text: 'متابعة التقدم' },
  { icon: Lock, text: 'محتوى حصري' },
  { icon: GraduationCap, text: 'دروس مصورة' },
  { icon: MessageCircle, text: 'دعم مباشر' },
  { icon: BadgeCheck, text: 'جودة عالية' },
];

const floatingChips = [
  { icon: GraduationCap, className: 'end-[6%] top-10', delay: 'animate-float-slow' },
  { icon: Play, className: 'start-[7%] top-28', delay: 'animate-float-slower' },
  { icon: MessageCircle, className: 'end-[15%] top-44', delay: 'animate-float-slower' },
  { icon: BookOpen, className: 'start-[13%] top-10', delay: 'animate-float-slow' },
  { icon: BarChart3, className: 'start-[22%] top-52', delay: 'animate-float-slower' },
];

/* Deterministic particle field for the hero ambience */
const particles = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 7.3 + 2) % 98}%`,
  top: `${(i * 13.7 + 4) % 92}%`,
  size: 2 + (i % 3) * 2,
  delay: `${(i % 7) * 1.1}s`,
  duration: `${7 + (i % 5) * 2}s`,
  tone:
    i % 3 === 0
      ? 'bg-cyan-300 shadow-[0_0_10px_2px_rgba(34,211,238,0.5)]'
      : i % 3 === 1
        ? 'bg-indigo-300 shadow-[0_0_10px_2px_rgba(129,140,248,0.5)]'
        : 'bg-fuchsia-300 shadow-[0_0_10px_2px_rgba(217,70,239,0.5)]',
}));

export function LandingPage() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const [prices, setPrices] = useState<PublicUnitPrice[]>([]);
  const [pricesError, setPricesError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const firstMenuLinkRef = useRef<HTMLAnchorElement>(null);

  const loadSettings = useCallback(async () => {
    setSettingsError(false);
    setPricesError(false);
    try {
      const [settingsRow, pricesRow] = await Promise.all([
        getPublicSettings(),
        getPublicUnitPrices(),
      ]);
      setSettings(settingsRow);
      setPrices(pricesRow);
    } catch {
      setSettingsError(true);
      setPricesError(true);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    firstMenuLinkRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const platformName = settings?.platform_name ?? 'منصة وليد عونى التعليمية';
  const whatsappNumber = settings?.whatsapp_number;
  const whatsappHref =
    settings !== null && whatsappNumber
      ? buildWhatsAppLink(whatsappNumber, settings.whatsapp_default_message)
      : null;

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip" dir="rtl">
      <header className="glass-nav sticky top-0 z-40">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            aria-label="منصة وليد عونى التعليمية"
            className="group inline-flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <BrandIcon className="h-9 w-9 shadow-[0_0_24px_-4px_rgba(129,140,248,0.85)] transition-shadow duration-300 group-hover:shadow-[0_0_34px_-2px_rgba(129,140,248,1)]" />
            <span className="hidden font-display text-base font-bold text-foreground sm:inline">
              منصة وليد عونى التعليمية
            </span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex" aria-label="القائمة الرئيسية">
            <Link
              to="/"
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground-muted transition-colors hover:bg-white/6 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              الرئيسية
            </Link>
            <Link
              to="/login"
              className="glass-input inline-flex h-10 items-center justify-center border border-white/12 px-4 text-sm font-semibold text-foreground-muted transition-colors hover:border-primary/40 hover:bg-white/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              تسجيل الدخول
            </Link>
            <Link
              to="/register"
              className="btn-primary inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <UserPlus aria-hidden="true" className="h-4 w-4" />
              إنشاء حساب
            </Link>
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              aria-label="فتح القائمة"
              aria-expanded={menuOpen}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-white/6 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:h-10 sm:w-10"
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            className="glass-overlay absolute inset-0 h-full w-full"
            onClick={() => setMenuOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="القائمة الرئيسية"
            className="glass-panel absolute inset-y-0 start-0 flex w-72 max-w-[85%] flex-col"
          >
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <span className="inline-flex items-center gap-2 font-display text-sm font-bold text-foreground">
                <BrandIcon className="h-8 w-8" />
                منصة وليد عونى التعليمية
              </span>
              <button
                type="button"
                aria-label="إغلاق القائمة"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-white/6 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                onClick={() => setMenuOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-3" aria-label="القائمة الرئيسية">
              <Link
                ref={firstMenuLinkRef}
                to="/"
                className="rounded-xl px-3 py-3 text-sm font-medium text-foreground-muted transition-colors hover:bg-white/6 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                onClick={() => setMenuOpen(false)}
              >
                الرئيسية
              </Link>
              <Link
                to="/login"
                className="rounded-xl px-3 py-3 text-sm font-medium text-foreground-muted transition-colors hover:bg-white/6 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                onClick={() => setMenuOpen(false)}
              >
                تسجيل الدخول
              </Link>
              <Link
                to="/register"
                className="btn-primary mt-1 rounded-xl px-3 py-3 text-center text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                onClick={() => setMenuOpen(false)}
              >
                إنشاء حساب
              </Link>
            </nav>
          </div>
        </div>
      ) : null}

      <main id="main-content" className="flex-1 pb-28 md:pb-0">
        {/* ===== Hero ===== */}
        <section className="relative mx-auto w-full max-w-6xl px-4 pb-14 pt-12 text-center sm:px-6 sm:pt-24">
          {/* Ambient rings + orbs */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 flex h-[30rem] items-start justify-center sm:h-[38rem]"
          >
            <span className="conic-ring absolute top-4 h-80 w-80 animate-orb rounded-full opacity-70 blur-[1px] sm:h-[24rem] sm:w-[24rem]" />
            <span className="absolute top-10 h-80 w-80 animate-orb rounded-full bg-gradient-to-br from-indigo-600/40 via-purple-600/35 to-fuchsia-600/30 blur-3xl sm:h-[26rem] sm:w-[26rem]" />
            <span className="absolute top-20 h-[22rem] w-[22rem] animate-spin-slower rounded-full border border-dashed border-indigo-400/25 sm:h-[28rem] sm:w-[28rem]" />
            <span className="absolute top-36 h-64 w-64 animate-pulse-soft rounded-full border border-purple-400/20 sm:h-96 sm:w-96" />
            <span className="absolute bottom-0 h-56 w-56 animate-orb rounded-full bg-cyan-500/15 blur-3xl" />
          </div>

          {/* Floating particles */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {particles.map((p, i) => (
              <span
                key={i}
                className={`particle ${p.tone}`}
                style={{
                  left: p.left,
                  top: p.top,
                  width: p.size,
                  height: p.size,
                  animationDelay: p.delay,
                  animationDuration: p.duration,
                }}
              />
            ))}
          </div>

          <div className="relative">
            <span className="rise glass-soft inline-flex items-center gap-2 rounded-full border-primary/30 px-4 py-1.5 text-xs font-bold text-indigo-300 shadow-[0_0_24px_-8px_rgba(129,140,248,0.8)]">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5 animate-pulse-soft text-fuchsia-300" />
              منصة تعليمية متكاملة
            </span>

            <h1 className="rise mx-auto mt-5 max-w-3xl font-display text-[2.6rem] font-extrabold leading-[1.15] tracking-tight sm:text-6xl lg:text-7xl [animation-delay:80ms]">
              <span className="text-gradient text-glow">{platformName}</span>
            </h1>
            <p className="rise mx-auto mt-4 max-w-xl text-base text-foreground-muted sm:text-lg [animation-delay:160ms]">
              متابعة الصفوف الدراسية والتواصل مع الأستاذ في مكان واحد
            </p>

            <div className="rise mx-auto mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row [animation-delay:240ms]">
              {settingsError ? (
                <ErrorState
                  message="تعذر تحميل إعدادات المنصة"
                  onRetry={() => void loadSettings()}
                />
              ) : settings === null ? (
                <Spinner label="جاري تحميل بيانات المنصة" />
              ) : whatsappHref ? (
                <>
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-500 to-green-500 px-6 text-sm font-bold text-white shadow-[0_14px_36px_-12px_rgba(16,185,129,0.85),inset_0_1px_0_rgba(255,255,255,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_48px_-12px_rgba(16,185,129,1)] active:scale-[0.97] sm:w-auto sm:text-base"
                  >
                    <WhatsAppIcon className="h-5 w-5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
                    فتح محادثة واتساب
                  </a>
                  <Link
                    to="/register"
                    className="btn-primary animate-cta-pulse inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-6 text-sm font-bold text-white sm:w-auto sm:text-base"
                  >
                    <Rocket aria-hidden="true" className="h-4 w-4" />
                    ابدأ رحلتك الآن
                  </Link>
                </>
              ) : (
                <p className="text-sm text-foreground-muted">لا يوجد رقم تواصل متاح حاليًا</p>
              )}
            </div>

            <div className="rise mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 [animation-delay:320ms]">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground-muted">
                <BadgeCheck aria-hidden="true" className="h-4 w-4 text-emerald-300" />
                فيديوهات عالية الجودة
              </span>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground-muted">
                <BadgeCheck aria-hidden="true" className="h-4 w-4 text-emerald-300" />
                متابعة التقدم لحظة بلحظة
              </span>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground-muted">
                <BadgeCheck aria-hidden="true" className="h-4 w-4 text-emerald-300" />
                دعم مباشر عبر واتساب
              </span>
            </div>
          </div>

          {/* Floating glass chips */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-16 hidden h-full md:block"
          >
            {floatingChips.map((chip, index) => {
              const Icon = chip.icon;
              return (
                <span key={index} className={`absolute ${chip.className} ${chip.delay}`}>
                  <span className="glass-card inline-flex h-12 w-12 items-center justify-center rounded-2xl shadow-[0_12px_32px_-8px_rgba(99,102,241,0.45)]">
                    <Icon className="h-5 w-5 text-indigo-300" />
                  </span>
                </span>
              );
            })}
          </div>
        </section>

        {/* ===== Marquee trust strip ===== */}
        <section
          aria-hidden="true"
          className="relative overflow-hidden py-4"
        >
          <div className="pointer-events-none absolute inset-y-0 start-0 z-10 w-16 bg-gradient-to-r from-background to-transparent sm:w-28" />
          <div className="pointer-events-none absolute inset-y-0 end-0 z-10 w-16 bg-gradient-to-l from-background to-transparent sm:w-28" />
          <div className="overflow-hidden" dir="ltr">
            <div className="flex w-max animate-marquee gap-4 pe-4">
              {[...marqueeItems, ...marqueeItems].map((item, index) => {
                const Icon = item.icon;
                return (
                  <span
                    key={index}
                    className="glass-soft inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-foreground-muted"
                  >
                    <Icon className="h-3.5 w-3.5 text-indigo-300" />
                    {item.text}
                  </span>
                );
              })}
            </div>
          </div>
        </section>

        {/* ===== Benefits ===== */}
        <section className="py-10 sm:py-14">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-4 sm:px-6 md:grid-cols-3 md:gap-6">
            {benefits.map((benefit, index) => (
              <div
                key={benefit.title}
                className="rise glass-card glass-card-hover conic-ring spotlight-card group flex flex-col items-center gap-3 p-7 text-center"
                style={{ animationDelay: `${index * 120}ms` }}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/25 text-indigo-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_26px_-6px_rgba(129,140,248,0.6)] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                >
                  <benefit.icon className="h-5 w-5" />
                </span>
                <h2 className="font-display text-base font-bold text-foreground">
                  {benefit.title}
                </h2>
                <p className="text-sm leading-6 text-foreground-muted">{benefit.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== How to start ===== */}
        <section className="py-8 sm:py-12">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="rise conic-ring spotlight-card glass-card relative overflow-hidden p-6 sm:p-12">
              <div
                aria-hidden="true"
                className="absolute -end-24 -top-24 h-64 w-64 rounded-full bg-purple-600/20 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="absolute -bottom-28 -start-20 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl"
              />
              <h2 className="relative text-center font-display text-2xl font-bold text-foreground sm:text-3xl">
                كيف تبدأ <span className="text-gradient">رحلتك التعليمية؟</span>
              </h2>
              <div className="relative mt-10 grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
                {steps.map((step, index) => (
                  <div
                    key={step.title}
                    className="relative flex items-start gap-4 text-start md:flex-col md:items-center md:gap-4 md:text-center"
                  >
                    {index < steps.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="absolute top-10 start-[22px] h-[calc(100%-3rem)] w-px bg-gradient-to-b from-indigo-400/60 to-fuchsia-400/20 md:top-6 md:start-full md:h-px md:w-10 md:bg-gradient-to-l"
                      />
                    ) : null}
                    <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 font-display text-base font-bold text-white shadow-[0_0_30px_-6px_rgba(129,140,248,0.9)]">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-foreground sm:text-base">
                        {step.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-6 text-foreground-muted">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== Unit prices ===== */}
        <section className="py-8 sm:py-12">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <h2 className="text-center font-display text-2xl font-bold text-foreground sm:text-3xl">
              أسعار <span className="text-gradient">الوحدات</span>
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-center text-sm text-foreground-muted">
              اشترِ الوحدة مرة واحدة وافتحها مدى الحياة — أو فعّل بكود من الأستاذ
            </p>
            {pricesError ? (
              <div className="mt-8">
                <ErrorState message="تعذر تحميل أسعار الوحدات" onRetry={() => void loadSettings()} />
              </div>
            ) : prices.length > 0 ? (
              <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {prices.map((price, index) => (
                  <div
                    key={price.unit_id}
                    className="rise glass-card glass-card-hover conic-ring spotlight-card group flex flex-col items-center gap-2 p-6 text-center"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/25 text-indigo-300"
                    >
                      <BookOpen className="h-5 w-5" />
                    </span>
                    <h3 className="font-display text-base font-bold text-foreground">
                      {price.unit_name}
                    </h3>
                    <p className="text-xs text-foreground-subtle">{price.grade_name ?? ''}</p>
                    <p className="mt-1 font-display text-2xl font-extrabold text-gradient" dir="ltr">
                      {formatPrice(price.total_price)} <span className="text-sm">ج.م</span>
                    </p>
                    <p className="text-xs text-foreground-subtle">
                      سعر الوحدة {formatPrice(price.base_price)} + رسوم منصة{' '}
                      {formatPrice(price.platform_fee)}
                    </p>
                    {whatsappNumber ? (
                      <a
                        href={buildWhatsAppLink(
                          whatsappNumber,
                          `${settings?.whatsapp_default_message ?? ''} — وحدة ${price.unit_name}`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-500 to-green-500 px-4 text-sm font-bold text-white transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.97]"
                      >
                        <WhatsAppIcon className="h-4 w-4" />
                        تواصل لتفعيل الوحدة
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </main>

      {/* ===== Sticky mobile CTA bar ===== */}
      {settings !== null && whatsappHref ? (
        <div className="fixed inset-x-3 bottom-3 z-40 md:hidden">
          <div className="float-tabbar flex items-center gap-2 rounded-3xl p-2">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              aria-label="تواصل عبر واتساب"
              className="glass-soft inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-bold text-emerald-300 transition-all active:scale-95"
            >
              <WhatsAppIcon className="h-5 w-5" />
              واتساب
            </a>
            <Link
              to="/register"
              className="btn-primary inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-bold text-white active:scale-95"
            >
              اشترك الآن
            </Link>
          </div>
        </div>
      ) : null}

      <footer className="border-t border-white/8 bg-white/3 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 pb-28 sm:flex-row sm:px-6 md:pb-8">
          <p className="text-xs text-foreground-subtle">
            © {new Date().getFullYear()} منصة وليد عونى التعليمية. جميع الحقوق محفوظة
          </p>
          <nav className="flex items-center gap-4 text-sm" aria-label="روابط سريعة">
            <Link
              to="/"
              className="text-foreground-muted transition-colors hover:text-indigo-300"
            >
              الرئيسية
            </Link>
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                aria-label="تواصل عبر واتساب"
                className="text-foreground-muted transition-colors hover:text-emerald-300"
              >
                <WhatsAppIcon className="h-5 w-5" />
              </a>
            ) : null}
          </nav>
        </div>
      </footer>
    </div>
  );
}
