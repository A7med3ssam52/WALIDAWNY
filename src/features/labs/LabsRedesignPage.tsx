import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  FlaskConical,
  Headphones,
  Menu,
  MessageCircle,
  Play,
  Search,
  Smartphone,
  UserPlus,
  Wifi,
  X,
} from 'lucide-react';

import { BrandIcon } from '../../components/BrandIcon';
import { SeoHead } from '../../components/SeoHead';
import type { RedesignUnit } from './labsRedesignData';
import {
  REDESIGN_QUOTES,
  REDESIGN_STATS,
  REDESIGN_STEPS,
  REDESIGN_TOP_STUDENTS,
  REDESIGN_UNITS,
} from './labsRedesignData';

const NAV_LINKS = [
  { to: '/subjects', label: 'المواد' },
  { to: '/pricing', label: 'الأسعار' },
  { to: '/how-it-works', label: 'كيف تبدأ' },
  { to: '/faq', label: 'الأسئلة الشائعة' },
];

const APP_FEATURES = [
  { icon: Wifi, text: 'تعلّم بدون إنترنت بعد التحميل' },
  { icon: Play, text: 'مقاطع قصيرة مركزة' },
  { icon: Headphones, text: 'استمع والدروس تعمل في الخلفية' },
];

/** Numeric targets for the animated hero stats (third stat stays static text). */
const STAT_TARGETS: (number | null)[] = [24, 180, null];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function useCountUp(target: number, started: boolean): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!started) return;
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    const duration = 1200;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, target]);
  return value;
}

function StatItem({
  label,
  target,
  staticValue,
  started,
}: {
  label: string;
  target: number | null;
  staticValue: string;
  started: boolean;
}) {
  const value = useCountUp(target ?? 0, started && target !== null);
  const isCounting = target !== null && started && value !== target;
  return (
    <div className="rounded-2xl border border-[#333B33] bg-surface p-3 text-center shadow-sm">
      <dt className="order-2 mt-1 text-xs font-bold text-foreground-muted">{label}</dt>
      <dd
        className="font-display text-xl font-black text-[#E8E6DA] sm:text-2xl"
        aria-hidden={isCounting || undefined}
      >
        {target !== null ? value.toLocaleString('ar-EG') : staticValue}
      </dd>
    </div>
  );
}

function SectionHeading({
  id,
  title,
  description,
  action,
}: {
  id: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 id={id} className="font-display text-2xl font-black sm:text-3xl">
          {title}
        </h2>
        <p className="mt-1 text-sm text-foreground-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

function UnitCard({ unit }: { unit: RedesignUnit }) {
  return (
    <article
      data-testid={unit.id}
      className="flex h-full flex-col overflow-hidden rounded-[20px] border border-[#333B33] bg-surface shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
    >
      <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-[#20261F] to-[#3A423B]">
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90">
          <Play aria-hidden="true" className="h-5 w-5 text-[#1E2A5A]" />
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black text-[#C6A94F]">{unit.category}</p>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black ${
              unit.status === 'متاحة'
                ? 'border-[rgba(127,191,142,0.4)] bg-[rgba(127,191,142,0.1)] text-[#7FBF8E]'
                : 'border-slate-400 bg-slate-200 text-slate-700'
            }`}
          >
            {unit.status}
          </span>
        </div>
        <h3 className="mt-2 line-clamp-2 min-h-12 text-sm font-black leading-6">{unit.title}</h3>
        <p className="mt-2 flex items-center gap-3 text-xs text-foreground-subtle">
          <span className="flex items-center gap-1">
            <Clock aria-hidden="true" className="h-3.5 w-3.5" />
            {unit.duration}
          </span>
          <span className="flex items-center gap-1">
            <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
            {unit.lessons}
          </span>
        </p>
        <p className="mt-auto flex items-center gap-2 border-t border-[#333B33] pt-3 [margin-top:auto]">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#29312B] text-xs font-black text-[#E8E6DA]">
            {unit.initials}
          </span>
          <span className="text-xs font-bold text-foreground-muted">{unit.instructor}</span>
        </p>
      </div>
    </article>
  );
}

/**
 * /labs/redesign — "Manara" concept preview (UI only).
 * Isolated light theme, mock data, no backend, no persistence, noindex.
 */
export function LabsRedesignPage() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [statsStarted, setStatsStarted] = useState(false);
  const [statsDone, setStatsDone] = useState(false);
  const [filter, setFilter] = useState('الكل');
  const statsRef = useRef<HTMLDListElement>(null);
  const quotesRef = useRef<HTMLDivElement>(null);
  const demoCloseRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const demoOpenRef = useRef<HTMLButtonElement>(null);
  const demoModalRef = useRef<HTMLDivElement>(null);

  // Header shadow on scroll.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Stats count up once visible.
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setStatsStarted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setStatsStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Stats count-up completion (single polite announcement, no per-tick live updates).
  useEffect(() => {
    if (!statsStarted) return;
    if (prefersReducedMotion()) {
      setStatsDone(true);
      return;
    }
    const timer = window.setTimeout(() => setStatsDone(true), 1300);
    return () => window.clearTimeout(timer);
  }, [statsStarted]);

  // Lock body scroll + Escape closes only the topmost open layer.
  useEffect(() => {
    if (!menuOpen && !demoOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (demoOpen) {
          setDemoOpen(false);
        } else if (menuOpen) {
          setMenuOpen(false);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, demoOpen]);

  // Drawer: initial focus, simple Tab trap, return focus to the menu button.
  useEffect(() => {
    if (!menuOpen) return;
    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLElement>('button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !drawer) return;
      const focusables = Array.from(
        drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      );
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);

  // Demo modal: initial focus, simple Tab trap, return focus to the open button.
  useEffect(() => {
    if (!demoOpen) return;
    demoCloseRef.current?.focus();
    const modal = demoModalRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !modal) return;
      const focusables = Array.from(
        modal.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      );
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      demoOpenRef.current?.focus();
    };
  }, [demoOpen]);

  const categories = useMemo(
    () => ['الكل', ...Array.from(new Set(REDESIGN_UNITS.map((unit) => unit.category)))],
    [],
  );
  const visibleUnits = filter === 'الكل' ? REDESIGN_UNITS : REDESIGN_UNITS.filter((unit) => unit.category === filter);

  const scrollQuotes = (direction: 1 | -1) => {
    const el = quotesRef.current;
    if (!el) return;
    const closestDir = el.closest('[dir]')?.getAttribute('dir');
    const docDir = typeof document !== 'undefined' ? document.dir : 'ltr';
    const isRTL = (closestDir ?? docDir ?? 'ltr') === 'rtl';
    el.scrollBy({
      left: direction * 320 * (isRTL ? -1 : 1),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  return (
    <div dir="rtl" data-testid="labs-redesign" data-theme="health" className="min-h-screen bg-[#1B201C] text-[#E8E6DA]">
      <SeoHead
        title="معمل إعادة التصميم | وليد عونى"
        description="صفحة تجريبية معزولة لمعاينة اتجاه تصميم جديد للصفحة الأولى — بدون بيانات حقيقية."
        canonicalPath="/labs/redesign"
        noIndex
      />
      <a
        href="#redesign-main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-[#29312B] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        تخطَّ إلى المحتوى
      </a>

      {/* Labs badge bar */}
      <div className="border-b border-[#333B33] bg-[#29312B] text-[#E8E6DA]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <Link
            to="/"
            className="flex h-11 items-center gap-1 text-sm font-bold text-white/90 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E] sm:h-10"
          >
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
            الرئيسية
          </Link>
          <span className="flex items-center gap-1.5 rounded-full border border-[#B89B4E]/50 bg-[#B89B4E]/15 px-3 py-1 text-xs font-black text-[#D6BE7E]">
            <FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />
            وضع تجريبي — لا تُحفظ أي بيانات
          </span>
        </div>
      </div>

      {/* Announcement bar */}
      <div className="bg-[#B89B4E] text-[#182016]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center text-xs font-black sm:px-6 sm:text-sm">
          <Award aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>شريط تجريبي — سطر واحد لإعلان ثابت أعلى الصفحة</span>
          <ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
        </div>
      </div>

      {/* Header */}
      <header
        className={`sticky top-0 z-40 border-b border-[#333B33] bg-[#1B201C]/90 backdrop-blur transition-shadow ${
          scrolled ? 'shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)]' : ''
        }`}
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:h-[60px] sm:px-6">
          <Link
            to="/labs/redesign"
            aria-current={pathname === '/labs/redesign' ? 'page' : undefined}
            className="flex min-w-0 items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E]"
          >
            <BrandIcon className="h-9 w-9" />
            <span className="truncate font-display text-lg font-black text-[#E8E6DA]">وليد عونى — معاينة</span>
          </Link>
          <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-6 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                aria-current={pathname === link.to ? 'page' : undefined}
                className="flex h-10 items-center text-sm font-bold text-foreground-muted transition-colors hover:text-[#E8E6DA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E]"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="بحث تجريبي"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#333B33] bg-surface text-[#E8E6DA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E] sm:h-10 sm:w-10"
            >
              <Search aria-hidden="true" className="h-5 w-5" />
            </button>
            <Link
              to="/login"
              className="hidden h-10 items-center rounded-xl px-4 text-sm font-bold text-foreground-muted hover:text-[#E8E6DA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E] sm:flex"
            >
              تسجيل الدخول
            </Link>
            <Link
              to="/register"
              data-testid="redesign-signup"
              className="hidden h-10 items-center gap-1.5 rounded-xl bg-[#B89B4E] px-4 text-sm font-black text-[#182016] shadow-[0_8px_20px_-10px_rgba(0,0,0,0.5)] transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#93B884] sm:flex"
            >
              <UserPlus aria-hidden="true" className="h-4 w-4" />
              ابدأ مجاناً
            </Link>
            <button
              ref={menuButtonRef}
              type="button"
              aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#333B33] bg-surface text-[#E8E6DA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E] md:hidden"
            >
              {menuOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menuOpen ? (
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="قائمة الموبايل"
            data-testid="redesign-drawer"
            className="fixed inset-0 z-50 flex flex-col bg-[#1B201C] p-4 md:hidden"
          >
            <div className="flex h-14 items-center justify-between">
              <span className="font-display text-lg font-black">القائمة</span>
              <button
                type="button"
                aria-label="إغلاق القائمة"
                onClick={() => setMenuOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#333B33] bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E]"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <nav aria-label="قائمة الموبايل" className="mt-2 flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMenuOpen(false)}
                  className="flex h-11 items-center rounded-xl px-3 text-base font-bold hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E]"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/register"
                onClick={() => setMenuOpen(false)}
                className="mt-2 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#B89B4E] text-base font-black text-[#182016] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#93B884]"
              >
                <UserPlus aria-hidden="true" className="h-4 w-4" />
                ابدأ مجاناً
              </Link>
            </nav>
          </div>
        ) : null}
      </header>

      <main id="redesign-main" className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <section data-testid="redesign-hero" aria-labelledby="redesign-hero-title" className="grid gap-6 py-10 sm:py-14 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-[#B89B4E]/50 bg-[#B89B4E]/10 px-3 py-1 text-xs font-black text-[#C6A94F]">
              <Award aria-hidden="true" className="h-3.5 w-3.5" />
              اتجاه تجريبي — منارة
            </p>
            <h1 id="redesign-hero-title" className="mt-4 font-display text-3xl font-black leading-[1.4] text-balance sm:text-5xl">
              عنوان تجريبي ضخم
              <span className="text-[#C6A94F]"> بسطرين فقط</span>
            </h1>
            <p className="mt-3 max-w-xl text-base leading-8 text-foreground-muted sm:text-lg">
              سطر تجريبي واحد يشرح الفكرة — لا محتوى حقيقي هنا، الشكل فقط هو المقصود بالمعاينة.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link
                to="/register"
                className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-[#B89B4E] px-6 text-base font-black text-[#182016] shadow-[0_12px_28px_-10px_rgba(0,0,0,0.5)] transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#93B884]"
              >
                ابدأ مجاناً
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link
                to="/subjects"
                className="flex h-11 items-center justify-center rounded-2xl border border-[#93B884]/25 bg-transparent px-6 text-base font-bold text-[#E8E6DA] transition-colors hover:border-[#93B884]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E]"
              >
                تصفح المواد
              </Link>
            </div>
            <dl ref={statsRef} className="mt-8 grid grid-cols-3 gap-3">
              {REDESIGN_STATS.map((stat, index) => (
                <StatItem
                  key={stat.id}
                  label={stat.label}
                  target={STAT_TARGETS[index] ?? null}
                  staticValue={stat.value}
                  started={statsStarted}
                />
              ))}
            </dl>
            <p aria-live="polite" className="sr-only">
              {statsDone
                ? `الإحصائيات النهائية: ${REDESIGN_STATS[0].value} ${REDESIGN_STATS[0].label}، ${REDESIGN_STATS[1].value} ${REDESIGN_STATS[1].label}، ${REDESIGN_STATS[2].value} ${REDESIGN_STATS[2].label}`
                : ''}
            </p>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-[20px] border border-[#333B33] bg-surface shadow-sm">
              <button
                ref={demoOpenRef}
                type="button"
                data-testid="redesign-demo-open"
                onClick={() => setDemoOpen(true)}
                aria-label="تشغيل معاينة تجريبية"
                className="group flex aspect-video w-full items-center justify-center bg-gradient-to-br from-[#20261F] to-[#3A423B] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B89B4E]"
              >
                <span
                  aria-hidden="true"
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-105"
                >
                  <Play aria-hidden="true" className="h-7 w-7 text-[#1E2A5A]" />
                </span>
              </button>
              <div className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-black">بطاقة عائمة تجريبية</p>
                  <p className="mt-0.5 text-xs text-foreground-subtle">سطر وصفي واحد فقط</p>
                </div>
                <div
                  aria-hidden="true"
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'conic-gradient(#B89B4E 0 72%, #2A312B 72% 100%)' }}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-sm font-black text-[#E8E6DA]">
                    ٧٢٪
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-center text-xs font-bold text-foreground-muted">التوقيع البصري: حلقة التقدم الذهبية</p>
          </div>
        </section>

        {/* Top students marquee */}
        <section aria-label="شريط تجريبي متحرك" className="overflow-hidden border-y border-[#333B33] py-4">
          <div className="flex w-max gap-3 motion-safe:animate-marquee hover:[animation-play-state:paused]">
            {[...REDESIGN_TOP_STUDENTS, ...REDESIGN_TOP_STUDENTS].map((name, index) => (
              <span
                key={`${name}-${index}`}
                aria-hidden={index >= REDESIGN_TOP_STUDENTS.length}
                className="flex items-center gap-1.5 rounded-full border border-[#333B33] bg-surface px-4 py-2 text-xs font-bold text-foreground-subtle"
              >
                <Award aria-hidden="true" className="h-3.5 w-3.5 text-[#C6A94F]" />
                {name}
              </span>
            ))}
          </div>
        </section>

        {/* Units grid */}
        <section data-testid="redesign-units" aria-labelledby="redesign-units-title" className="py-10 sm:py-14">
          <SectionHeading
            id="redesign-units-title"
            title="شبكة تجريبية للوحدات"
            description="٨ بطاقات موحدة — الشكل فقط، بدون أسعار حقيقية."
            action={
              <Link
                to="/subjects"
                className="flex h-11 items-center gap-1 self-start rounded-xl px-3 text-sm font-bold text-[#E8E6DA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E] sm:h-10"
              >
                عرض الكل
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              </Link>
            }
          />
          <div role="group" aria-label="فلتر تجريبي للصفوف" className="mt-5 flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={filter === category}
                data-testid={`redesign-filter-${category}`}
                onClick={() => setFilter(category)}
                className={`flex h-11 items-center rounded-full border px-4 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E] ${
                  filter === category
                    ? 'border-[#93B884] bg-[#29312B] text-[#E8E6DA]'
                    : 'border-[#333B33] bg-surface text-foreground-muted hover:border-[#3d453d]'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {visibleUnits.map((unit) => (
              <UnitCard key={unit.id} unit={unit} />
            ))}
          </div>
          <p aria-live="polite" className="mt-3 text-xs font-bold text-foreground-muted">
            عدد البطاقات المعروضة: {visibleUnits.length.toLocaleString('ar-EG')}
          </p>
        </section>

        {/* Bundle band */}
        <section data-testid="redesign-bundle" aria-labelledby="redesign-bundle-title" className="overflow-hidden rounded-[20px] bg-[#29312B] p-6 text-[#E8E6DA] sm:p-10">
          <div className="grid items-center gap-6 lg:grid-cols-2">
            <div>
              <h2 id="redesign-bundle-title" className="font-display text-2xl font-black sm:text-3xl">بطاقة تجريبية كبيرة مقلوبة الألوان</h2>
              <p className="mt-2 max-w-lg text-sm leading-7 text-white/80 sm:text-base">
                مقطع تجريبي واحد لكسر الإيقاع البصري — خلفية كحلية ونص أبيض وزر ذهبي واحد فقط.
              </p>
              <Link
                to="/pricing"
                className="mt-5 inline-flex h-11 items-center gap-1.5 rounded-2xl bg-[#B89B4E] px-6 text-sm font-black text-[#182016] transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                عرض تجريبي
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
            <div aria-hidden="true" className="grid grid-cols-3 gap-3">
              {['٧٢٪', '٠٣', '٢٤'].map((value) => (
                <div key={value} className="rounded-2xl border border-white/15 bg-white/5 p-4 text-center">
                  <p className="font-display text-2xl font-black text-[#D6BE7E]">{value}</p>
                  <p className="mt-1 text-[11px] text-white/80">مؤشر شكلي</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Steps */}
        <section aria-labelledby="redesign-steps-title" className="py-10 sm:py-14">
          <SectionHeading
            id="redesign-steps-title"
            title="ثلاث خطوات تجريبية"
            description="خط زمني أفقي على الديسكتوب وعمودي على الموبايل."
          />
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {REDESIGN_STEPS.map((step) => (
              <li key={step.id} className="rounded-[20px] border border-[#333B33] bg-surface p-5 shadow-sm">
                <p aria-hidden="true" className="font-display text-3xl font-black text-[#C6A94F]">{step.number}</p>
                <h3 className="mt-2 text-base font-black">{step.title}</h3>
                <p className="mt-1 text-sm leading-7 text-foreground-muted">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Quotes slider on mobile, grid on desktop */}
        <section data-testid="redesign-quotes" aria-labelledby="redesign-quotes-title" className="pb-10 sm:pb-14">
          <SectionHeading
            id="redesign-quotes-title"
            title="آراء تجريبية"
            description="سحب أفقي على الموبايل وشبكة على الديسكتوب."
            action={
              <div className="flex gap-2 md:hidden">
                <button
                  type="button"
                  data-testid="redesign-quotes-prev"
                  onClick={() => scrollQuotes(-1)}
                  aria-label="الرأي السابق"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#333B33] bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E]"
                >
                  <ChevronRight aria-hidden="true" className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  data-testid="redesign-quotes-next"
                  onClick={() => scrollQuotes(1)}
                  aria-label="الرأي التالي"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#333B33] bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E]"
                >
                  <ChevronLeft aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
            }
          />
          <div
            ref={quotesRef}
            className="mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible md:pb-0"
          >
            {REDESIGN_QUOTES.map((quote) => (
              <figure
                key={quote.id}
                className="w-[85%] shrink-0 snap-center rounded-[20px] border border-[#333B33] bg-surface p-5 shadow-sm sm:w-[60%] md:w-auto"
              >
                <p aria-hidden="true" className="font-display text-4xl font-black leading-none text-[#C6A94F]">“</p>
                <blockquote className="mt-1 text-sm leading-7 text-foreground-muted">{quote.text}</blockquote>
                <figcaption className="mt-3 border-t border-[#333B33] pt-3 text-xs font-bold text-foreground-subtle">
                  {quote.name} • {quote.context}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* App */}
        <section data-testid="redesign-app" aria-labelledby="redesign-app-title" className="grid items-center gap-6 rounded-[20px] border border-[#333B33] bg-surface p-6 shadow-sm sm:p-10 lg:grid-cols-2">
          <div>
            <h2 id="redesign-app-title" className="font-display text-2xl font-black sm:text-3xl">قسم تجريبي للتطبيق</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {APP_FEATURES.map((feature) => (
                <li key={feature.text} className="flex items-center gap-3 text-sm font-bold text-foreground-muted">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#B89B4E]/15 text-[#C6A94F]">
                    <feature.icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  {feature.text}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <span className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-[#29312B] px-5 text-sm font-black text-[#E8E6DA]">
                <Smartphone aria-hidden="true" className="h-4 w-4" />
                زر تجريبي
              </span>
              <span className="flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-[#93B884]/25 px-5 text-sm font-bold">
                <MessageCircle aria-hidden="true" className="h-4 w-4" />
                زر تجريبي ثانٍ
              </span>
            </div>
          </div>
          <div aria-hidden="true" className="mx-auto flex w-full max-w-xs items-center justify-center rounded-[28px] border border-[#333B33] bg-gradient-to-b from-[#20261F] to-[#3A423B] p-6">
            <div className="w-full rounded-2xl bg-white/95 p-4">
              <div className="mx-auto h-2 w-16 rounded-full bg-[#2A312B]" />
              <div className="mt-4 aspect-video rounded-xl bg-[#1B201C]" />
              <div className="mt-3 h-3 rounded-full bg-[#2A312B]" />
              <div className="mt-2 h-3 w-2/3 rounded-full bg-[#2A312B]" />
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section data-testid="redesign-cta" aria-labelledby="redesign-cta-title" className="mt-6 overflow-hidden rounded-[20px] bg-[#B89B4E] p-6 text-center text-[#182016] sm:p-10">
          <h2 id="redesign-cta-title" className="font-display text-2xl font-black sm:text-3xl">دعوة تجريبية أخيرة</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm font-bold text-foreground-muted">سطر تجريبي واحد قبل الزر — لا محتوى حقيقي.</p>
          <Link
            to="/register"
            className="mt-5 inline-flex h-11 items-center gap-1.5 rounded-2xl bg-[#29312B] px-8 text-sm font-black text-[#E8E6DA] transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            ابدأ مجاناً
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-10 border-t border-[#333B33] bg-surface">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-4">
          <div>
            <p className="flex items-center gap-2 font-display text-base font-black">
              <BrandIcon className="h-8 w-8" />
              وليد عونى — معاينة
            </p>
            <p className="mt-2 text-xs leading-6 text-foreground-subtle">سطر تجريبي واحد لوصف الفوتر.</p>
          </div>
          {[
            { title: 'روابط', links: [{ to: '/subjects', label: 'المواد' }, { to: '/pricing', label: 'الأسعار' }] },
            { title: 'مساعدة', links: [{ to: '/faq', label: 'الأسئلة الشائعة' }, { to: '/contact', label: 'تواصل' }] },
            { title: 'تعريفية', links: [{ to: '/about', label: 'عن المنصة' }, { to: '/how-it-works', label: 'كيف تبدأ' }] },
          ].map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="text-sm font-black">{col.title}</h3>
              <ul className="mt-2 flex flex-col gap-1">
                {col.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="flex h-10 items-center text-sm text-foreground-muted hover:text-[#E8E6DA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-[#333B33] bg-[#1B201C]">
          <p className="mx-auto w-full max-w-6xl px-4 py-4 text-center text-xs text-foreground-muted sm:px-6">
            صفحة معاينة تجريبية — لا تُحفظ أي بيانات • ‎© 2026
          </p>
        </div>
      </footer>

      {/* Support FAB */}
      <button
        type="button"
        aria-label="دعم تجريبي"
        className="fixed bottom-5 end-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-[#B89B4E]/40 bg-[#B89B4E] text-[#182016] shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#93B884]"
      >
        <MessageCircle aria-hidden="true" className="h-5 w-5" />
      </button>

      {/* Demo modal */}
      {demoOpen ? (
        <div
          ref={demoModalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="redesign-demo-title"
          data-testid="redesign-demo-modal"
          onClick={() => setDemoOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#29312B]/60 p-4"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-[20px] border border-[#333B33] bg-surface p-6 shadow-xl"
          >
            <h2 id="redesign-demo-title" className="font-display text-xl font-black">
              معاينة تجريبية
            </h2>
            <p className="mt-2 text-sm leading-7 text-foreground-muted">
              نافذة شكلية فقط — هنا سيظهر مشغل الفيديو في التصميم النهائي. لا يتم تحميل أي بيانات.
            </p>
            <div className="mt-4 flex aspect-video items-center justify-center rounded-2xl bg-gradient-to-br from-[#20261F] to-[#3A423B]">
              <Play aria-hidden="true" className="h-10 w-10 text-white/90" />
            </div>
            <button
              ref={demoCloseRef}
              type="button"
              data-testid="redesign-demo-close"
              onClick={() => setDemoOpen(false)}
              className="mt-4 flex h-11 w-full items-center justify-center rounded-2xl bg-[#29312B] text-sm font-black text-[#E8E6DA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89B4E]"
            >
              إغلاق المعاينة
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
