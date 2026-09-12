import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  FileText,
  Headset,
  Lock,
  MessageCircle,
  Phone,
  ShieldAlert,
  User,
} from 'lucide-react';

import { Card } from '../../components/Card';
import { LayoutShell } from '../../components/LayoutShell';
import { RoleNav } from '../../components/RoleNav';
import { buildWhatsAppLink } from '../../lib/format';

// --- mock data (preview only) ---
const MOCK_NAME = 'أحمد محمد أحمد';
const MOCK_REASON = 'مشاركة الحساب مع أكثر من جهاز بما يخالف سياسة المنصة';
const SUPPORT_NUMBER = '+201226771154';
const SUPPORT_DISPLAY = '01226771154';
const INQUIRY_MESSAGE = `الاستفسار عن وقف حساب : ${MOCK_NAME}`;
const WHATSAPP_HREF = buildWhatsAppLink(SUPPORT_NUMBER, INQUIRY_MESSAGE);

type Variant =
  | 'shield'
  | 'topbar'
  | 'fullscreen'
  | 'bottomsheet'
  | 'ticket'
  | 'minimal'
  | 'glow'
  | 'steps'
  | 'vault'
  | 'chat';

const variants: Array<{ id: Variant; label: string; desc: string }> = [
  { id: 'shield', label: '1- الدرع الزجاجي', desc: 'Glass كلاسيك — أيقونة درع حمراء وسبب بارز' },
  { id: 'topbar', label: '2- الشريط العلوي', desc: 'شريط أحمر علوي + صفوف مضغوطة موبايل-first' },
  { id: 'fullscreen', label: '3- القفل الكامل', desc: 'Takeover بملء الشاشة — بلا كارت، قفل تام' },
  { id: 'bottomsheet', label: '4- الدرج السفلي', desc: 'Bottom-sheet — مقبض علوي وCTA ثابت أسفل' },
  { id: 'ticket', label: '5- التذكرة', desc: 'Ticket بفاصل متقطع — الحساب فوق والسبب تحت' },
  { id: 'minimal', label: '6- الفاتح البسيط', desc: 'كارت أبيض فاتح — تباين عالٍ وخط عريض' },
  { id: 'glow', label: '7- التوهج', desc: 'Conic-ring متوهج + أفاتار أول حرف' },
  { id: 'steps', label: '8- الخطوات', desc: '3 خطوات مرقمة: السبب ثم الحساب ثم التواصل' },
  { id: 'vault', label: '9- الخزنة', desc: 'قفل ضخم داكن + رقم الدعم بخط mono' },
  { id: 'chat', label: '10- المحادثة', desc: 'هيدر واتساب أخضر + فقاعات شات' },
];

function LockNote({ light = false }: { light?: boolean }) {
  return (
    <p
      className={`mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold ${
        light ? 'text-slate-500' : 'text-foreground-subtle'
      }`}
    >
      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      لا يمكن إغلاق هذه النافذة
    </p>
  );
}

function ReasonBox({ tone = 'rose' }: { tone?: 'rose' | 'amber' | 'slate' }) {
  const tones = {
    rose: 'border-rose-400/20 bg-rose-500/10 text-rose-100',
    amber: 'border-amber-400/20 bg-amber-500/10 text-amber-100',
    slate: 'border-slate-300 bg-slate-100 text-slate-800',
  } as const;
  return (
    <div className={`rounded-xl border p-3 text-start ${tones[tone]}`}>
      <p
        className={`flex items-center gap-1.5 text-[11px] font-bold ${tone === 'slate' ? 'text-slate-500' : 'opacity-80'}`}
      >
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        سبب الإيقاف
      </p>
      <p className="mt-1 text-[13px] font-semibold leading-6">{MOCK_REASON}</p>
    </div>
  );
}

function AccountRow({ light = false }: { light?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] ${
        light ? 'bg-slate-100 text-slate-700' : 'bg-white/[0.04] text-foreground-muted'
      }`}
    >
      <User className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">
        اسم الحساب:{' '}
        <strong className={light ? 'text-slate-900' : 'text-foreground'}>{MOCK_NAME}</strong>
      </span>
    </div>
  );
}

function WhatsAppCta({ variant = 'green' }: { variant?: 'green' | 'dark' | 'light' }) {
  const styles = {
    green:
      'bg-gradient-to-l from-emerald-500 to-green-500 text-white shadow-[0_10px_30px_-10px_rgba(16,185,129,0.7)]',
    dark: 'bg-white text-slate-900',
    light: 'bg-slate-900 text-white',
  } as const;
  return (
    <a
      href={WHATSAPP_HREF}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-all active:scale-[0.98] ${styles[variant]}`}
    >
      <MessageCircle className="h-4.5 w-4.5" aria-hidden="true" />
      تواصل عبر واتساب
    </a>
  );
}

function SupportLine({ light = false }: { light?: boolean }) {
  return (
    <a
      href={WHATSAPP_HREF}
      target="_blank"
      rel="noreferrer"
      dir="ltr"
      className={`mt-2 inline-flex items-center gap-1.5 text-xs font-bold tracking-wide ${
        light ? 'text-emerald-700' : 'text-emerald-300'
      }`}
    >
      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
      {SUPPORT_DISPLAY}
    </a>
  );
}

// ---------- 1: shield ----------
function ShieldPopup() {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="الحساب موقوف"
      className="glass-panel w-full max-w-[340px] rounded-2xl p-5 text-center shadow-[0_30px_70px_-18px_rgba(251,113,133,0.45)]"
    >
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/30 to-red-600/20 text-rose-300">
        <ShieldAlert className="h-7 w-7" aria-hidden="true" />
      </span>
      <h3 className="font-display mt-3 text-lg font-bold text-foreground">تم إيقاف حسابك</h3>
      <p className="mt-1 text-[13px] leading-6 text-foreground-muted">
        تم إيقاف هذا الحساب مؤقتًا من قبل الإدارة، ولن تتمكن من المتابعة حتى يتم مراجعة حالتك.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <ReasonBox />
        <AccountRow />
      </div>
      <div className="mt-3">
        <WhatsAppCta />
        <SupportLine />
      </div>
      <LockNote />
    </div>
  );
}

// ---------- 2: topbar ----------
function TopbarPopup() {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="الحساب موقوف"
      className="w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#121022] text-center"
    >
      <div
        aria-hidden="true"
        className="h-1.5 w-full bg-gradient-to-l from-rose-500 via-red-500 to-orange-400"
      />
      <div className="p-5">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-bold text-rose-300">
          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
          الحساب موقوف
        </p>
        <h3 className="font-display mt-2 text-lg font-bold text-foreground">
          لا يمكنك المتابعة حاليًا
        </h3>
        <p className="mt-1 text-xs leading-6 text-foreground-muted">
          حسابك موقوف بقرار إداري. راجع السبب بالأسفل وتواصل مع الدعم لمراجعة حالتك.
        </p>
        <div className="mt-3 flex flex-col gap-2 text-start">
          <ReasonBox tone="amber" />
          <AccountRow />
        </div>
        <div className="mt-3">
          <WhatsAppCta />
          <SupportLine />
        </div>
        <LockNote />
      </div>
    </div>
  );
}

// ---------- 3: fullscreen ----------
function FullscreenPopup() {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="الحساب موقوف"
      className="flex w-full max-w-[340px] flex-col items-center rounded-2xl border border-rose-400/20 bg-gradient-to-b from-[#2a0f18] via-[#150a14] to-[#0a0714] p-6 text-center"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-rose-400/30 bg-rose-500/15 text-rose-200">
        <Lock className="h-8 w-8" aria-hidden="true" />
      </span>
      <p className="mt-3 text-[11px] font-bold tracking-[0.2em] text-rose-300">SUSPENDED</p>
      <h3 className="font-display mt-1 text-xl font-black text-white">الحساب موقوف</h3>
      <p className="mt-2 text-[13px] leading-6 text-white/70">
        تم حظر الدخول إلى المنصة مؤقتًا. القفل شامل ولا توجد طريقة لتجاوزه من داخل الحساب.
      </p>
      <div className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-start">
        <p className="text-[11px] font-bold text-white/60">سبب الإيقاف</p>
        <p className="mt-1 text-[13px] font-semibold leading-6 text-white">{MOCK_REASON}</p>
        <p className="mt-2 truncate border-t border-white/10 pt-2 text-xs text-white/60">
          اسم الحساب: <strong className="text-white">{MOCK_NAME}</strong>
        </p>
      </div>
      <div className="mt-4 w-full">
        <WhatsAppCta />
        <SupportLine />
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-white/50">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        قفل كامل — بلا إغلاق وبلا تسجيل خروج
      </p>
    </div>
  );
}

// ---------- 4: bottomsheet ----------
function BottomsheetPopup() {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="الحساب موقوف"
      className="w-full max-w-[340px] overflow-hidden rounded-3xl border border-white/10 bg-[#14121f]"
    >
      <div aria-hidden="true" className="flex justify-center pt-3">
        <span className="h-1.5 w-12 rounded-full bg-white/15" />
      </div>
      <div className="p-5 pt-3">
        <div className="flex items-center gap-3 text-start">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">
            <Ban className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display truncate text-base font-bold text-foreground">
              تم إيقاف حسابك
            </h3>
            <p className="text-xs text-foreground-muted">اسحب؟ لا — الدرج ثابت ولا يُغلق</p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <ReasonBox />
          <AccountRow />
        </div>
        <div className="sticky bottom-0 mt-4 bg-gradient-to-t from-[#14121f] via-[#14121f] to-transparent pt-2">
          <WhatsAppCta />
          <div className="flex justify-center">
            <SupportLine />
          </div>
        </div>
        <LockNote />
      </div>
    </div>
  );
}

// ---------- 5: ticket ----------
function TicketPopup() {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="الحساب موقوف"
      className="w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#121022]"
    >
      <div className="p-5 text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-bold text-rose-300">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          تذكرة إيقاف
        </p>
        <h3 className="font-display mt-2 text-lg font-bold text-foreground">{MOCK_NAME}</h3>
        <p className="mt-1 text-xs leading-6 text-foreground-muted">
          هذا الحساب موقوف حاليًا ولا يمكنه الدخول للمنصة
        </p>
      </div>
      <div aria-hidden="true" className="relative flex items-center">
        <span className="absolute -start-2 h-5 w-5 rounded-full border border-white/10 bg-[#070513]" />
        <span className="w-full border-t border-dashed border-white/15" />
        <span className="absolute -end-2 h-5 w-5 rounded-full border border-white/10 bg-[#070513]" />
      </div>
      <div className="p-5">
        <ReasonBox />
        <div className="mt-3">
          <WhatsAppCta />
          <div className="flex justify-center">
            <SupportLine />
          </div>
        </div>
        <LockNote />
      </div>
    </div>
  );
}

// ---------- 6: minimal (light) ----------
function MinimalPopup() {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="الحساب موقوف"
      className="w-full max-w-[340px] rounded-2xl bg-white p-5 text-center shadow-xl"
    >
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="font-display mt-3 text-xl font-black text-slate-900">الحساب موقوف</h3>
      <p className="mt-1 text-[13px] leading-6 text-slate-600">
        عزيزي <strong className="text-slate-900">{MOCK_NAME}</strong>، تم إيقاف حسابك مؤقتًا. يرجى
        مراجعة السبب والتواصل مع الدعم.
      </p>
      <div className="mt-3 flex flex-col gap-2 text-start">
        <ReasonBox tone="slate" />
        <AccountRow light />
      </div>
      <div className="mt-3">
        <WhatsAppCta variant="light" />
        <SupportLine light />
      </div>
      <LockNote light />
    </div>
  );
}

// ---------- 7: glow ----------
function GlowPopup() {
  return (
    <div className="w-full max-w-[340px] rounded-[1.4rem] bg-gradient-to-br from-rose-500 via-violet-500 to-indigo-500 p-[1.5px] shadow-[0_20px_60px_-15px_rgba(168,85,247,0.6)]">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="الحساب موقوف"
        className="rounded-[1.3rem] bg-[#0d0b18] p-5 text-center"
      >
        <div className="flex items-center justify-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-black text-white">
            {MOCK_NAME.trim().charAt(0)}
          </span>
          <div className="text-start">
            <p className="truncate text-sm font-bold text-foreground">{MOCK_NAME}</p>
            <p className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-300">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              موقوف
            </p>
          </div>
        </div>
        <h3 className="font-display mt-3 text-lg font-bold text-foreground">
          تم إيقاف حسابك مؤقتًا
        </h3>
        <p className="mt-1 text-xs leading-6 text-foreground-muted">
          الوصول متوقف تمامًا حتى مراجعة الإدارة. هذه النافذة لا تُغلق بأي طريقة.
        </p>
        <div className="mt-3">
          <ReasonBox />
        </div>
        <div className="mt-3">
          <WhatsAppCta />
          <SupportLine />
        </div>
        <LockNote />
      </div>
    </div>
  );
}

// ---------- 8: steps ----------
function StepsPopup() {
  const steps = [
    { n: '1', title: 'سبب الإيقاف', body: MOCK_REASON },
    { n: '2', title: 'الحساب المعني', body: `الاستفسار عن وقف حساب : ${MOCK_NAME}` },
    { n: '3', title: 'التواصل', body: `واتساب الدعم ${SUPPORT_DISPLAY} — اضغط الزر بالأسفل` },
  ];
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="الحساب موقوف"
      className="glass-card w-full max-w-[340px] rounded-2xl p-5"
    >
      <h3 className="font-display flex items-center gap-2 text-base font-bold text-foreground">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </span>
        حسابك موقوف — اعرف ليه وتعمل إيه
      </h3>
      <ol className="mt-3 flex flex-col gap-2">
        {steps.map((s) => (
          <li
            key={s.n}
            className="flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black text-foreground">
              {s.n}
            </span>
            <div className="min-w-0 text-start">
              <p className="text-[13px] font-bold text-foreground">{s.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-foreground-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3">
        <WhatsAppCta />
        <div className="flex justify-center">
          <SupportLine />
        </div>
      </div>
      <LockNote />
    </div>
  );
}

// ---------- 9: vault ----------
function VaultPopup() {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="الحساب موقوف"
      className="w-full max-w-[340px] rounded-2xl border border-white/10 bg-black/60 p-6 text-center backdrop-blur-xl"
    >
      <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-b from-white/10 to-white/[0.02] text-foreground">
        <Lock className="h-10 w-10" aria-hidden="true" />
      </span>
      <h3 className="font-display mt-4 text-lg font-black tracking-tight text-foreground">
        مغلق — الحساب موقوف
      </h3>
      <p className="mt-1 text-xs leading-6 text-foreground-muted">
        لا خروج ولا إغلاق ولا رجوع. الطريق الوحيد هو مراجعة الدعم.
      </p>
      <div className="mt-3 rounded-xl bg-white/[0.04] p-3 text-start">
        <p className="text-[11px] font-bold text-foreground-subtle">سبب الإيقاف</p>
        <p className="mt-1 text-[13px] font-semibold leading-6 text-foreground">{MOCK_REASON}</p>
      </div>
      <p className="mt-2 truncate text-xs text-foreground-muted">
        <User className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />
        {MOCK_NAME}
      </p>
      <div className="mt-3">
        <WhatsAppCta />
        <p dir="ltr" className="mt-2 font-mono text-xs font-bold tracking-widest text-emerald-300">
          {SUPPORT_NUMBER}
        </p>
      </div>
      <LockNote />
    </div>
  );
}

// ---------- 10: chat ----------
function ChatPopup() {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="الحساب موقوف"
      className="w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#0e141b]"
    >
      <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white">
          <Headset className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 text-start">
          <p className="truncate text-sm font-bold text-white">دعم المنصة</p>
          <p dir="ltr" className="text-[11px] text-white/80">
            {SUPPORT_DISPLAY} • متصل
          </p>
        </div>
        <Lock className="h-4 w-4 shrink-0 text-white/70" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-2 bg-[#0b141a] bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:18px_18px] p-4">
        <div className="max-w-[90%] self-start rounded-2xl rounded-ss-sm bg-[#1f2c34] p-3 text-start">
          <p className="text-[13px] font-bold text-rose-300">تم إيقاف حسابك ⛔</p>
          <p className="mt-1 text-xs leading-6 text-white/85">
            مرحبًا {MOCK_NAME}، حسابك موقوف مؤقتًا ولا يمكنك المتابعة. النافذة دي ثابتة ولا تُغلق.
          </p>
        </div>
        <div className="max-w-[90%] self-start rounded-2xl rounded-ss-sm bg-[#1f2c34] p-3 text-start">
          <p className="text-[11px] font-bold text-white/60">سبب الإيقاف من الإدارة</p>
          <p className="mt-1 text-xs leading-6 text-white">{MOCK_REASON}</p>
        </div>
        <div className="max-w-[90%] self-start rounded-2xl rounded-ss-sm bg-[#1f2c34] p-3 text-start">
          <p className="text-xs leading-6 text-white/85">
            للاستفسار ابعتلنا: <strong>الاستفسار عن وقف حساب : {MOCK_NAME}</strong>
          </p>
        </div>
        <a
          href={WHATSAPP_HREF}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#25d366] px-4 text-sm font-black text-[#062e1f] transition-all active:scale-[0.98]"
        >
          <MessageCircle className="h-4.5 w-4.5" aria-hidden="true" />
          افتح محادثة واتساب
        </a>
        <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-white/50">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          لا يمكن إغلاق هذه النافذة نهائيًا
        </p>
      </div>
    </div>
  );
}

// ---------- stage: unclosable popup preview (full height, no clipping frame) ----------
function PreviewStage({ variant }: { variant: Variant }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur-sm sm:p-6">
      {/* no onClick, no Escape, no X — static preview of the locked popup */}
      <div data-testid={`stop-variant-${variant}`} className="flex w-full justify-center">
        {variant === 'shield' && <ShieldPopup />}
        {variant === 'topbar' && <TopbarPopup />}
        {variant === 'fullscreen' && <FullscreenPopup />}
        {variant === 'bottomsheet' && <BottomsheetPopup />}
        {variant === 'ticket' && <TicketPopup />}
        {variant === 'minimal' && <MinimalPopup />}
        {variant === 'glow' && <GlowPopup />}
        {variant === 'steps' && <StepsPopup />}
        {variant === 'vault' && <VaultPopup />}
        {variant === 'chat' && <ChatPopup />}
      </div>
    </div>
  );
}

export function StopPreviewPage() {
  const [active, setActive] = useState<Variant>('shield');
  const current = variants.find((v) => v.id === active);

  return (
    <LayoutShell
      title="معاينة إيقاف الحساب"
      subtitle="10 تصاميم POP-UP غير قابلة للإغلاق — موبايل-first — اختر للمعاينة"
      variant="sidebar"
      nav={<RoleNav />}
    >
      <div
        className="mb-4 flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="تصاميم الإيقاف"
      >
        {variants.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={active === v.id}
            onClick={() => setActive(v.id)}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
              active === v.id
                ? 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-lg'
                : 'glass-soft text-foreground-muted hover:text-foreground'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <Card title={current?.label} subtitle={current?.desc}>
        <div className="mx-auto w-full max-w-[420px]">
          <PreviewStage variant={active} />
        </div>

        <dl className="mx-auto mt-4 grid w-full max-w-[420px] grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-xl bg-white/[0.03] p-3">
            <dt className="text-foreground-subtle">الحساب</dt>
            <dd className="mt-1 truncate font-bold text-foreground">{MOCK_NAME}</dd>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3">
            <dt className="text-foreground-subtle">الدعم</dt>
            <dd dir="ltr" className="mt-1 font-mono font-bold text-emerald-300">
              {SUPPORT_NUMBER}
            </dd>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3">
            <dt className="text-foreground-subtle">الرسالة</dt>
            <dd className="mt-1 truncate font-semibold text-foreground-muted">{INQUIRY_MESSAGE}</dd>
          </div>
        </dl>

        <div className="mx-auto mt-3 w-full max-w-[420px] rounded-xl border border-rose-400/15 bg-rose-500/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-rose-200">
            <Lock className="h-4 w-4" aria-hidden="true" />
            قواعد القفل المطبقة في المعاينة
          </p>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-xs leading-6 text-foreground-muted">
            <li>بلا زر إغلاق (X) وبلا زر إلغاء وبلا تسجيل خروج — قفل كامل.</li>
            <li>الضغط على الخلفية لا يغلق — ولا يوجد onClick للإغلاق.</li>
            <li>زر Escape معطل في التنفيذ الحقيقي — المعاينة ثابتة.</li>
            <li>زر واتساب يفتح {SUPPORT_DISPLAY} بالرسالة الجاهزة.</li>
          </ul>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <a
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              تجربة رابط الواتساب
            </a>
            <Link
              to="/preview/cards"
              className="glass-soft inline-flex h-10 flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold text-foreground-muted hover:text-foreground"
            >
              → معاينة البطاقات
            </Link>
          </div>
        </div>
      </Card>
    </LayoutShell>
  );
}
