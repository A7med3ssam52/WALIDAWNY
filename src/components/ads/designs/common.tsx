import { ExternalLink } from 'lucide-react';

import type { AdContent } from '../types';
import { VARIANT_THEME } from '../variantTheme';

export function AdCta({ content, className = '' }: { content: AdContent; className?: string }) {
  if (!content.link_url || !content.link_label) return null;
  // للأمان: روابط خارجية https فقط (نفس قاعدة AnnouncementBanner)
  if (!/^https:\/\//.test(content.link_url)) return null;
  const theme = VARIANT_THEME[content.variant];
  return (
    <a
      href={content.link_url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${theme.primaryBtn} ${className}`}
    >
      {content.link_label}
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}

export function AdGhostButton({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="inline-flex h-11 items-center justify-center rounded-xl border border-white/12 bg-white/5 px-5 text-sm font-bold text-foreground-muted backdrop-blur transition-colors hover:bg-white/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      {label}
    </button>
  );
}

export function AdBadge({ content }: { content: AdContent }) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold ${theme.badge}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {theme.label}
    </span>
  );
}
