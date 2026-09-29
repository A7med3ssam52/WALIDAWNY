import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  BarChart3,
  BookOpen,
  ChevronDown,
  GraduationCap,
  HelpCircle,
  Menu,
  MessageCircle,
  Play,
  Rocket,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';

import { BrandIcon } from '../../components/BrandIcon';
import { ErrorState } from '../../components/ErrorState';
import { PhysicsBackground } from '../../components/PhysicsBackground';
import { SeoHead } from '../../components/SeoHead';
import { Spinner } from '../../components/Spinner';
import { WhatsAppIcon } from '../../components/WhatsAppIcon';
import { getPublicSettings, getPublicUnitPrices } from '../../data/rpc';
import { buildWhatsAppLink, formatPrice } from '../../lib/format';
import { LANDING_FAQS, SEO, SITE_URL } from '../../lib/seo';
import type { PublicSettings, PublicUnitPrice } from '../../types/database';

const marqueeItems = [
  { icon: BookOpen, text: 'منهج منظم' },
  { icon: BarChart3, text: 'متابعة التقدم' },
  { icon: GraduationCap, text: 'دروس مصورة' },
  { icon: MessageCircle, text: 'دعم مباشر' },
  { icon: Award, text: 'جودة عالية' },
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

export function LandingPage() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const [prices, setPrices] = useState<PublicUnitPrice[]>([]);
  const [pricesError, setPricesError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<string | null>(LANDING_FAQS[0]?.question ?? null);
  const [gradeFilter, setGradeFilter] = useState('الكل');
  const firstMenuLinkRef = useRef<HTMLAnchorElement>(null);

  const loadSettings = useCallback(async () => {
    setSettingsError(false);
    setPricesError(false);
    const settled = await Promise.allSettled([getPublicSettings(), getPublicUnitPrices()]);
    const settingsRow = settled[0].status === 'fulfilled' ? settled[0].value : null;
    const pricesRow = settled[1].status === 'fulfilled' ? settled[1].value : [];
    if (settled[0].status === 'fulfilled') {
      setSettings(settingsRow);
    } else {
      setSettingsError(true);
    }
    if (settled[1].status === 'fulfilled') {
      setPrices(pricesRow);
    } else {
      setPricesError(true);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    firstMenuLinkRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const whatsappNumber = settings?.whatsapp_number;
  const whatsappHref =
    settings !== null && whatsappNumber
      ? buildWhatsAppLink(whatsappNumber, settings.whatsapp_default_message)
      : null;

  const grades = [
    'الكل',
    ...Array.from(new Set(prices.map((price) => price.grade_name).filter(Boolean))),
  ];
  const visiblePrices =
    gradeFilter === 'الكل' ? prices : prices.filter((price) => price.grade_name === gradeFilter);

  return (
    <div
      dir="rtl"
      data-testid="landing-manara"
      className="flex min-h-screen flex-col bg-background text-foreground"
    >
      <SeoHead
        title={SEO.home.title}
        description={SEO.home.description}
        keywords={SEO.home.keywords}
        canonicalPath="/"
        faqs={LANDING_FAQS}
        breadcrumbs={[]}
      />

      {/* Announcement bar — dark confirmation strip with lime accent */}
      <div className="health-dark-card rounded-none border-0">
        <Link
          to="/pricing"
          className="mx-auto flex w-full max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center text-xs font-black text-white sm:px-6 sm:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <Award aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
          <span>فعّل وحدتك بكود WLDN — مدى الحياة بدون اشتراك شهري</span>
          <ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        </Link>
      </div>

      {/* Header */}
      <header className="glass-nav sticky top-0 z-40">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:h-[60px] sm:px-6">
          <Link
            to="/"
            aria-label="وليد عونى"
            className="flex min-w-0 items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
          >
            <BrandIcon className="h-9 w-9" />
            <span className="hidden truncate font-display text-base font-black text-foreground sm:inline">
              وليد عونى
            </span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex" aria-label="القائمة الرئيسية">
            <Link
              to="/subjects"
              className="flex h-10 items-center text-sm font-bold text-foreground-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
            >
              المواد
            </Link>
            <Link
              to="/pricing"
              className="flex h-10 items-center text-sm font-bold text-foreground-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
            >
              الأسعار
            </Link>
            <Link
              to="/faq"
              className="flex h-10 items-center text-sm font-bold text-foreground-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
            >
              الأسئلة
            </Link>
            <Link
              to="/contact"
              className="flex h-10 items-center text-sm font-bold text-foreground-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
            >
              تواصل
            </Link>
            <Link
              to="/login"
              className="flex h-10 items-center text-sm font-bold text-foreground-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
            >
              تسجيل الدخول
            </Link>
            <Link
              to="/register"
              className="btn-primary flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-black focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
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
              onClick={() => setMenuOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
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
            className="absolute inset-y-0 start-0 flex w-72 max-w-[85%] flex-col border-e border-border bg-surface"
          >
            <div className="flex items-center justify-between border-b border-border-muted px-4 py-3">
              <span className="inline-flex items-center gap-2 font-display text-sm font-black text-foreground">
                <BrandIcon className="h-8 w-8" />
                وليد عونى
              </span>
              <button
                type="button"
                aria-label="إغلاق القائمة"
                onClick={() => setMenuOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-muted text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-3" aria-label="القائمة الرئيسية">
              <Link
                ref={firstMenuLinkRef}
                to="/"
                className="flex h-11 items-center rounded-xl px-3 text-sm font-bold text-foreground-muted hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                onClick={() => setMenuOpen(false)}
              >
                الرئيسية
              </Link>
              <Link
                to="/subjects"
                className="flex h-11 items-center rounded-xl px-3 text-sm font-bold text-foreground-muted hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                onClick={() => setMenuOpen(false)}
              >
                المواد
              </Link>
              <Link
                to="/pricing"
                className="flex h-11 items-center rounded-xl px-3 text-sm font-bold text-foreground-muted hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                onClick={() => setMenuOpen(false)}
              >
                الأسعار
              </Link>
              <Link
                to="/faq"
                className="flex h-11 items-center rounded-xl px-3 text-sm font-bold text-foreground-muted hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                onClick={() => setMenuOpen(false)}
              >
                الأسئلة الشائعة
              </Link>
              <Link
                to="/contact"
                className="flex h-11 items-center rounded-xl px-3 text-sm font-bold text-foreground-muted hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                onClick={() => setMenuOpen(false)}
              >
                تواصل
              </Link>
              <Link
                to="/login"
                className="flex h-11 items-center rounded-xl px-3 text-sm font-bold text-foreground-muted hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                onClick={() => setMenuOpen(false)}
              >
                تسجيل الدخول
              </Link>
              <Link
                to="/register"
                className="btn-primary mt-1 flex h-11 items-center justify-center rounded-full px-3 text-center text-sm font-black focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                onClick={() => setMenuOpen(false)}
              >
                إنشاء حساب
              </Link>
            </nav>
          </div>
        </div>
      ) : null}

      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        {/* ===== Hero — خلفية فيزيائية حيّة خفيفة (Canvas بدون مكتبات) ===== */}
        <section
          aria-labelledby="hero-title"
          className="relative grid gap-6 overflow-hidden py-10 sm:py-14 lg:grid-cols-2 lg:items-center"
        >
          <PhysicsBackground />
          <div className="relative z-10 text-center lg:text-start">
            <p className="health-lime-card inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              منصة تعليمية متكاملة
            </p>
            <h1
              id="hero-title"
              className="mt-4 font-display text-3xl font-black leading-[1.4] text-balance text-foreground sm:text-5xl"
            >
              منصة وليد عوني لطلاب ثانوية عامة
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-foreground-muted sm:text-lg lg:mx-0">
              متابعة الصفوف الدراسية والتواصل مع الأستاذ في مكان واحد — وحدات مدى الحياة بكود WLDN،
              ملازم PDF وسبورات تفاعلية
            </p>
            <div className="mt-6 flex flex-col items-stretch justify-center gap-2 sm:flex-row lg:justify-start">
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
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 text-sm font-bold text-white transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 sm:text-base"
                  >
                    <WhatsAppIcon className="h-5 w-5" />
                    فتح محادثة واتساب
                  </a>
                  <Link
                    to="/register"
                    className="btn-primary inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-6 text-sm font-black sm:text-base"
                  >
                    <Rocket aria-hidden="true" className="h-4 w-4" />
                    ابدأ رحلتك الآن
                  </Link>
                </>
              ) : (
                <p className="text-sm text-foreground-muted">لا يوجد رقم تواصل متاح حاليًا</p>
              )}
            </div>
            <nav
              aria-label="روابط سريعة"
              className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start"
            >
              <Link
                to="/subjects"
                className="rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-bold text-foreground-muted hover:text-foreground"
              >
                المواد
              </Link>
              <Link
                to="/pricing"
                className="rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-bold text-foreground-muted hover:text-foreground"
              >
                الأسعار
              </Link>
              <Link
                to="/how-it-works"
                className="rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-bold text-foreground-muted hover:text-foreground"
              >
                كيف أبدأ
              </Link>
              <Link
                to="/faq"
                className="rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-bold text-foreground-muted hover:text-foreground"
              >
                الأسئلة الشائعة
              </Link>
            </nav>
          </div>

          <div className="relative z-10">
            <Link
              to="/subjects"
              aria-label="تصفح المواد الدراسية"
              className="glass-card glass-card-hover group block overflow-hidden p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
            >
              <span
                aria-hidden="true"
                className="health-dark-card flex aspect-video items-center justify-center rounded-[20px]"
              >
                <span className="health-lime-card flex h-16 w-16 items-center justify-center rounded-full transition-transform group-hover:scale-105">
                  <Play aria-hidden="true" className="h-7 w-7" />
                </span>
              </span>
              <span className="flex items-center justify-between gap-3 p-2 pt-4">
                <span>
                  <span className="block text-sm font-black text-foreground">منهج منظم لكل صف</span>
                  <span className="mt-0.5 block text-xs text-foreground-muted">
                    وحدات مدى الحياة — اضغط للتصفح
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="relative flex h-16 w-16 shrink-0 items-center justify-center"
                >
                  <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full -rotate-90">
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke="var(--color-chart-track)"
                      strokeWidth="8"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke="var(--color-chart-1)"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray="163.3"
                      strokeDashoffset="45.7"
                    />
                  </svg>
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-sm font-black text-foreground">
                    {prices.length > 0 ? prices.length.toLocaleString('ar-EG') : '…'}
                  </span>
                </span>
              </span>
            </Link>
            {prices.length > 0 ? (
              <dl className="mt-4 grid grid-cols-3 gap-3">
                <div className="glass-card p-3 text-center">
                  <dt className="mt-1 text-xs font-bold text-foreground-muted">وحدة متاحة</dt>
                  <dd className="font-display text-xl font-black text-foreground sm:text-2xl">
                    {prices.length.toLocaleString('ar-EG')}
                  </dd>
                </div>
                <div className="glass-card p-3 text-center">
                  <dt className="mt-1 text-xs font-bold text-foreground-muted">صفوف دراسية</dt>
                  <dd className="font-display text-xl font-black text-foreground sm:text-2xl">
                    {new Set(
                      prices.map((price) => price.grade_name).filter(Boolean),
                    ).size.toLocaleString('ar-EG')}
                  </dd>
                </div>
                <div className="health-lime-card rounded-[20px] p-3 text-center">
                  <dt className="mt-1 text-xs font-bold opacity-70">تفعيل واحد</dt>
                  <dd className="font-display text-xl font-black sm:text-2xl">مدى الحياة</dd>
                </div>
              </dl>
            ) : null}
          </div>
        </section>

        {/* ===== Marquee trust strip ===== */}
        <section aria-label="شريط المميزات" className="overflow-hidden border-y border-border py-4">
          <div className="flex w-max gap-3 motion-safe:animate-marquee hover:[animation-play-state:paused]">
            {[...marqueeItems, ...marqueeItems].map((item, index) => (
              <span
                key={`${item.text}-${index}`}
                aria-hidden={index >= marqueeItems.length}
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-xs font-bold text-foreground-muted"
              >
                <item.icon aria-hidden="true" className="h-3.5 w-3.5 text-primary-strong" />
                {item.text}
              </span>
            ))}
          </div>
        </section>

        {/* ===== Unit prices — H2 (real data) ===== */}
        <section className="py-10 sm:py-14" aria-labelledby="pricing-heading">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="pricing-heading"
                className="font-display text-2xl font-black text-foreground sm:text-3xl"
              >
                أسعار الوحدات
              </h2>
              <p className="mt-1 text-sm text-foreground-muted">
                اشترِ الوحدة مرة واحدة وافتحها مدى الحياة — أو فعّل بكود من الأستاذ
              </p>
            </div>
            <Link
              to="/pricing"
              className="flex h-11 items-center gap-1 self-start rounded-xl px-3 text-sm font-bold text-primary-strong hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong sm:h-10"
            >
              عرض كل الأسعار بالتفصيل
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
          {pricesError ? (
            <div className="mt-8">
              <ErrorState message="تعذر تحميل أسعار الوحدات" onRetry={() => void loadSettings()} />
            </div>
          ) : prices.length > 0 ? (
            <>
              <div role="group" aria-label="فلتر الصفوف" className="mt-5 flex flex-wrap gap-2">
                {grades.map((grade) => (
                  <button
                    key={grade ?? 'all'}
                    type="button"
                    data-testid={`landing-filter-${grade}`}
                    aria-pressed={gradeFilter === grade}
                    onClick={() => setGradeFilter(grade ?? 'الكل')}
                    className={`flex h-11 items-center rounded-full border px-4 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong ${
                      gradeFilter === grade
                        ? 'health-dark-card border-transparent'
                        : 'border-border bg-surface text-foreground-muted hover:border-primary/50'
                    }`}
                  >
                    {grade}
                  </button>
                ))}
              </div>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {visiblePrices.map((price) => (
                  <article
                    key={price.unit_id}
                    data-testid={`landing-unit-${price.unit_id}`}
                    className="glass-card glass-card-hover flex h-full flex-col overflow-hidden"
                  >
                    <div
                      aria-hidden="true"
                      className="health-shell flex aspect-video items-center justify-center rounded-[20px]"
                    >
                      <span className="card-chip flex h-12 w-12 items-center justify-center rounded-full">
                        <BookOpen aria-hidden="true" className="h-5 w-5" />
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="text-xs font-black text-primary-strong">
                        {price.grade_name ?? ''}
                      </p>
                      <h3 className="mt-1 line-clamp-2 min-h-12 text-sm font-black leading-6 text-foreground">
                        {price.unit_name}
                      </h3>
                      {price.is_free ? (
                        <>
                          <p className="mt-1 font-display text-2xl font-extrabold text-success">
                            مجاني
                          </p>
                          <p className="text-xs text-success">متاح لجميع الطلاب بدون كود</p>
                        </>
                      ) : (
                        <>
                          <p
                            className="mt-1 font-display text-2xl font-extrabold text-foreground"
                            dir="ltr"
                          >
                            {formatPrice(price.total_price)} <span className="text-sm">ج.م</span>
                          </p>
                          <p className="text-xs text-foreground-subtle">
                            سعر الوحدة {formatPrice(price.base_price)} + رسوم منصة{' '}
                            {formatPrice(price.platform_fee)}
                          </p>
                        </>
                      )}
                      <div className="mt-auto pt-3 [margin-top:auto]">
                        {whatsappNumber && !price.is_free ? (
                          <a
                            href={buildWhatsAppLink(
                              whatsappNumber,
                              `${settings?.whatsapp_default_message ?? ''} — وحدة ${price.unit_name}`,
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-bold text-white transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                          >
                            <WhatsAppIcon className="h-4 w-4" /> تواصل لتفعيل الوحدة
                          </a>
                        ) : price.is_free ? (
                          <Link
                            to="/register"
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                          >
                            افتح مجاناً — سجّل الآن
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <p aria-live="polite" className="mt-3 text-xs font-bold text-foreground-subtle">
                عدد الوحدات المعروضة: {visiblePrices.length.toLocaleString('ar-EG')}
              </p>
            </>
          ) : null}
        </section>

        {/* ===== Dark band (real counts) ===== */}
        <section
          aria-labelledby="band-heading"
          className="health-dark-card overflow-hidden rounded-[20px] p-6 sm:p-10"
        >
          <div className="grid items-center gap-6 lg:grid-cols-2">
            <div>
              <h2 id="band-heading" className="font-display text-2xl font-black sm:text-3xl">
                وحداتك كلها مدى الحياة
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-7 text-white/80 sm:text-base">
                {prices.length > 0
                  ? `${prices.length.toLocaleString('ar-EG')} وحدة متاحة الآن — اشترِ مرة واحدة بدون اشتراك شهري، أو فعّل بكود من الأستاذ`
                  : 'اشترِ الوحدة مرة واحدة بدون اشتراك شهري، أو فعّل بكود من الأستاذ'}
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Link
                  to="/pricing"
                  className="btn-primary inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-6 text-sm font-black focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  عرض الأسعار
                </Link>
                <Link
                  to="/subjects"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-white/25 px-6 text-sm font-bold text-white transition-colors hover:border-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  تصفح المواد
                </Link>
              </div>
            </div>
            <div aria-hidden="true" className="grid grid-cols-3 gap-3">
              {[
                {
                  value: prices.length > 0 ? prices.length.toLocaleString('ar-EG') : '…',
                  label: 'وحدة',
                },
                { value: 'WLDN', label: 'كود التفعيل' },
                { value: '∞', label: 'مدى الحياة' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/15 bg-white/5 p-4 text-center"
                >
                  <p className="font-display text-2xl font-black text-primary" dir="ltr">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-[11px] text-white/80">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== How to start ===== */}
        <section className="py-10 sm:py-14" aria-labelledby="steps-heading">
          <h2
            id="steps-heading"
            className="font-display text-2xl font-black text-foreground sm:text-3xl"
          >
            كيف تبدأ رحلتك التعليمية؟
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            ثلاث خطوات فقط —{' '}
            <Link to="/how-it-works" className="font-bold text-primary-strong hover:underline">
              اعرف التفاصيل كاملة عن كود WLDN
            </Link>
          </p>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="glass-card p-5">
                <p aria-hidden="true" className="font-display text-3xl font-black text-primary">
                  {['٠١', '٠٢', '٠٣'][index]}
                </p>
                <h3 className="mt-2 text-base font-black text-foreground">{step.title}</h3>
                <p className="mt-1 text-sm leading-7 text-foreground-muted">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ===== Long-tail paragraph (SEO) ===== */}
        <section
          className="pb-10 sm:pb-14"
          aria-labelledby="learn-heading"
          style={{ contentVisibility: 'auto' }}
        >
          <div className="glass-card p-6 sm:p-8">
            <h2
              id="learn-heading"
              className="font-display text-xl font-black text-foreground sm:text-2xl"
            >
              ماذا ستتعلم في منصة وليد عونى؟
            </h2>
            <p className="mt-3 text-sm leading-7 text-foreground-muted">
              منصة وليد عوني لطلاب ثانوية عامة تغطي{' '}
              <strong className="text-foreground">منهج الصف الثالث الثانوي</strong> و
              <strong className="text-foreground">الصف الثاني الثانوي</strong> و
              <strong className="text-foreground">الصف الأول الثانوي</strong> بشكل منظم — كل صف مقسم
              إلى وحدات مدى الحياة تُفتح مرة واحدة بكود تفعيل{' '}
              <strong className="text-foreground">WLDN-XXXX</strong> بدون اشتراك شهري. ستجد{' '}
              <strong className="text-foreground">شرح مبسط</strong> لكل درس عبر فيديوهات مصورة عالية
              الجودة، مع <strong className="text-foreground">ملازم PDF</strong> تلخيصية و
              <strong className="text-foreground">سبورات</strong> تفاعلية ترسم الفكرة أمامك خطوة
              بخطوة. تابع تقدمك لحظياً في لوحة الطالب، وأعد مشاهدة أي درس بلا حدود. سواء تبحث عن{' '}
              <strong className="text-foreground">شرح منهج تالتة ثانوي</strong> أو مراجعة تانية
              ثانوي أو تأسيس أولى ثانوي، ستجد منهج منظم، أسعار واضحة، ودعم واتساب مباشر يجيبك خلال
              دقائق.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/subjects/third-secondary"
                className="text-xs font-bold text-primary-strong hover:underline"
              >
                تالتة ثانوي ←
              </Link>
              <Link
                to="/subjects/second-secondary"
                className="text-xs font-bold text-primary-strong hover:underline"
              >
                تانية ثانوي ←
              </Link>
              <Link
                to="/subjects/first-secondary"
                className="text-xs font-bold text-primary-strong hover:underline"
              >
                أولى ثانوي ←
              </Link>
              <Link
                to="/subjects"
                className="text-xs font-bold text-foreground-muted hover:text-foreground"
              >
                كل الصفوف ←
              </Link>
            </div>
          </div>
        </section>

        {/* ===== FAQ mini (real data) ===== */}
        <section
          className="pb-10 sm:pb-14"
          aria-labelledby="faq-heading"
          style={{ contentVisibility: 'auto' }}
        >
          <div className="glass-card p-6 sm:p-8">
            <h2
              id="faq-heading"
              className="flex items-center justify-center gap-2 font-display text-2xl font-black text-foreground sm:text-3xl"
            >
              <HelpCircle aria-hidden="true" className="h-6 w-6 text-primary-strong" /> الأسئلة
              الشائعة
            </h2>
            <p className="mt-2 text-center text-sm text-foreground-muted">
              إجابات سريعة لأهم أسئلة الطلاب — والمزيد في صفحة الأسئلة الكاملة
            </p>
            <div className="mt-6 space-y-3">
              {LANDING_FAQS.map((faq) => {
                const isOpen = faqOpen === faq.question;
                return (
                  <div
                    key={faq.question}
                    className="overflow-hidden rounded-xl border border-border bg-surface-muted"
                  >
                    <button
                      type="button"
                      onClick={() => setFaqOpen(isOpen ? null : faq.question)}
                      className="flex w-full items-center justify-between gap-3 p-4 text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-strong"
                      aria-expanded={isOpen}
                    >
                      <h3 className="text-sm font-bold text-foreground">{faq.question}</h3>
                      <ChevronDown
                        aria-hidden="true"
                        className={`h-4 w-4 shrink-0 text-foreground-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {isOpen ? (
                      <div className="border-t border-border bg-surface px-4 pb-4 pt-3">
                        <p className="text-sm leading-6 text-foreground-muted">{faq.answer}</p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-6 text-center">
              <Link
                to="/faq"
                className="inline-flex text-sm font-bold text-primary-strong hover:underline"
              >
                اعرض كل الأسئلة (12) ←
              </Link>
            </div>
          </div>
        </section>

        {/* ===== Final CTA — lime highlight ===== */}
        <section
          aria-labelledby="cta-heading"
          className="health-lime-card mb-10 overflow-hidden rounded-[20px] p-6 text-center sm:mb-14 sm:p-10"
        >
          <h2 id="cta-heading" className="font-display text-2xl font-black sm:text-3xl">
            جاهز تبدأ رحلتك؟
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm font-bold opacity-70">
            أنشئ حسابك مجاناً وفعّل أول وحدة بكود WLDN — مدى الحياة
          </p>
          <Link
            to="/register"
            className="health-dark-card mt-5 inline-flex h-11 items-center gap-1.5 rounded-full px-8 text-sm font-black transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
          >
            <Rocket aria-hidden="true" className="h-4 w-4 text-primary" />
            أنشئ حسابك مجاناً
          </Link>
        </section>
      </main>

      {settings !== null && whatsappHref ? (
        <div className="fixed inset-x-3 bottom-3 z-40 md:hidden">
          <div className="flex items-center gap-2 rounded-[20px] border border-border bg-surface p-2 shadow-elevated">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              aria-label="تواصل عبر واتساب"
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-[rgba(127,191,142,0.3)] bg-[rgba(127,191,142,0.12)] text-sm font-bold text-success transition-all active:scale-95"
            >
              <WhatsAppIcon className="h-5 w-5" /> واتساب
            </a>
            <Link
              to="/register"
              className="btn-primary inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-black active:scale-95"
            >
              اشترك الآن
            </Link>
          </div>
        </div>
      ) : null}

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 pb-28 sm:px-6 md:pb-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <h2 className="font-display text-sm font-black text-foreground">المنصة</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link to="/" className="text-foreground-muted hover:text-foreground">
                    الرئيسية
                  </Link>
                </li>
                <li>
                  <Link to="/about" className="text-foreground-muted hover:text-foreground">
                    عن وليد عونى
                  </Link>
                </li>
                <li>
                  <Link to="/how-it-works" className="text-foreground-muted hover:text-foreground">
                    كيف تبدأ
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="font-display text-sm font-black text-foreground">التعلم</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link to="/subjects" className="text-foreground-muted hover:text-foreground">
                    المواد
                  </Link>
                </li>
                <li>
                  <Link
                    to="/subjects/third-prep"
                    className="text-foreground-muted hover:text-foreground"
                  >
                    تالتة إعدادي
                  </Link>
                </li>
                <li>
                  <Link to="/pricing" className="text-foreground-muted hover:text-foreground">
                    الأسعار
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="font-display text-sm font-black text-foreground">الدعم</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link to="/faq" className="text-foreground-muted hover:text-foreground">
                    الأسئلة الشائعة
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="text-foreground-muted hover:text-foreground">
                    تواصل
                  </Link>
                </li>
                {whatsappHref ? (
                  <li>
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground-muted hover:text-success"
                    >
                      واتساب مباشر
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
            <div>
              <h2 className="font-display text-sm font-black text-foreground">قانوني</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link to="/privacy" className="text-foreground-muted hover:text-foreground">
                    سياسة الخصوصية
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="text-foreground-muted hover:text-foreground">
                    الشروط والأحكام
                  </Link>
                </li>
                <li>
                  <a
                    href={SITE_URL + '/sitemap.xml'}
                    className="text-foreground-muted hover:text-foreground"
                  >
                    خريطة الموقع
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border-muted pt-6 sm:flex-row">
            <p className="text-xs text-foreground-subtle">
              © {new Date().getFullYear()} وليد عونى. جميع الحقوق محفوظة — منصة تعليمية مصرية لكل
              الصفوف.
            </p>
            <nav className="flex items-center gap-4 text-sm" aria-label="روابط سريعة">
              <Link to="/" className="text-foreground-muted hover:text-foreground">
                الرئيسية
              </Link>
              {whatsappHref ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="تواصل عبر واتساب"
                  className="text-foreground-muted hover:text-success"
                >
                  <WhatsAppIcon className="h-5 w-5" />
                </a>
              ) : null}
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
