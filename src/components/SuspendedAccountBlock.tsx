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
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[rgb(10_12_10/0.6)] p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="الحساب موقوف"
        data-testid="suspended-account-block"
        className="my-auto w-full max-w-[340px] rounded-[20px] border border-border bg-surface p-5 text-center shadow-elevated"
      >
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(232,139,139,0.08)] text-error">
          <ShieldAlert className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="font-display mt-3 text-lg font-bold text-foreground">تم إيقاف حسابك</h1>
        <p className="mt-1 text-[13px] leading-6 text-foreground-muted">
          تم إيقاف هذا الحساب مؤقتًا من قبل الإدارة، ولن تتمكن من المتابعة حتى يتم مراجعة حالتك.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <div className="rounded-xl border border-[rgba(232,139,139,0.22)] bg-[rgba(232,139,139,0.06)] p-3 text-start text-error">
            <p className="flex items-center gap-1.5 text-[11px] font-bold opacity-80">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              سبب الإيقاف
            </p>
            <p className="mt-1 text-[13px] font-semibold leading-6">{visibleReason}</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-surface-muted px-3 py-2.5 text-[13px] text-foreground-muted">
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
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-strong"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            تواصل عبر واتساب
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
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-foreground-subtle">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          لا يمكن إغلاق هذه النافذة
        </p>
      </div>
    </div>
  );
}
