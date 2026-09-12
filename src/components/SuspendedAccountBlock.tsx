import { FileText, Lock, MessageCircle, Phone, ShieldAlert, User } from 'lucide-react';

import { buildWhatsAppLink } from '../lib/format';

export const SUSPENSION_SUPPORT_NUMBER = '+201226771154';
const SUPPORT_DISPLAY = '01226771154';

export const DEFAULT_SUSPENSION_MESSAGE =
  'تم إيقاف الحساب بقرار إداري. يرجى التواصل مع الدعم لمراجعة حالتك.';

interface SuspendedAccountBlockProps {
  fullName: string;
  reason?: string | null;
}

export function SuspendedAccountBlock({ fullName, reason }: SuspendedAccountBlockProps) {
  const visibleReason = reason?.trim() ? reason.trim() : DEFAULT_SUSPENSION_MESSAGE;
  const inquiryMessage = `الاستفسار عن وقف حساب : ${fullName}`;
  const whatsappHref = buildWhatsAppLink(SUSPENSION_SUPPORT_NUMBER, inquiryMessage);

  return (
    <div className="glass-overlay fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="الحساب موقوف"
        data-testid="suspended-account-block"
        className="glass-panel my-auto w-full max-w-[340px] rounded-2xl p-5 text-center shadow-[0_30px_70px_-18px_rgba(251,113,133,0.45)]"
      >
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/30 to-red-600/20 text-rose-300">
          <ShieldAlert className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="font-display mt-3 text-lg font-bold text-foreground">تم إيقاف حسابك</h1>
        <p className="mt-1 text-[13px] leading-6 text-foreground-muted">
          تم إيقاف هذا الحساب مؤقتًا من قبل الإدارة، ولن تتمكن من المتابعة حتى يتم مراجعة حالتك.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-start text-rose-100">
            <p className="flex items-center gap-1.5 text-[11px] font-bold opacity-80">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              سبب الإيقاف
            </p>
            <p className="mt-1 text-[13px] font-semibold leading-6">{visibleReason}</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5 text-[13px] text-foreground-muted">
            <User className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">
              اسم الحساب: <strong className="text-foreground">{fullName}</strong>
            </span>
          </div>
        </div>
        <div className="mt-3">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-500 to-green-500 px-4 text-sm font-bold text-white shadow-[0_10px_30px_-10px_rgba(16,185,129,0.7)] transition-all active:scale-[0.98]"
          >
            <MessageCircle className="h-4.5 w-4.5" aria-hidden="true" />
            تواصل عبر واتساب
          </a>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            dir="ltr"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-emerald-300"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            {SUPPORT_DISPLAY}
          </a>
        </div>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-foreground-subtle">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          لا يمكن إغلاق هذه النافذة
        </p>
      </div>
    </div>
  );
}
