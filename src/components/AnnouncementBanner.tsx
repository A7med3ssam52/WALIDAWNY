import { useEffect, useState, type ReactElement } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { fetchActiveAnnouncement, type Announcement, type AnnouncementVariant } from '../lib/announcements';
import { safeJsonParseObject, safeSetJson } from '../lib/safeStorage';

const VARIANT_STYLES: Record<AnnouncementVariant, string> = {
  info: 'bg-gradient-to-r from-blue-500/90 to-blue-600/90 border-blue-400/30',
  warning: 'bg-gradient-to-r from-amber-500/90 to-amber-600/90 border-amber-400/30',
  success: 'bg-gradient-to-r from-emerald-500/90 to-emerald-600/90 border-emerald-400/30',
  error: 'bg-gradient-to-r from-red-500/90 to-red-600/90 border-red-400/30',
};

const VARIANT_ICONS: Record<AnnouncementVariant, ReactElement> = {
  info: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" strokeWidth="2"/><path d="M12 16v-4M12 8h.01" strokeWidth="2" strokeLinecap="round"/></svg>,
  warning: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeWidth="2"/><path d="M12 9v4M12 17h.01" strokeWidth="2" strokeLinecap="round"/></svg>,
  success: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeWidth="2"/><polyline points="22 4 12 14.01 9 11.01" strokeWidth="2"/></svg>,
  error: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" strokeWidth="2"/><line x1="15" y1="9" x2="9" y2="15" strokeWidth="2"/><line x1="9" y1="9" x2="15" y2="15" strokeWidth="2"/></svg>,
};

interface DismissedState {
  [announcementId: string]: boolean;
}

function getDismissedState(): DismissedState {
  return safeJsonParseObject<DismissedState>('announcement-dismissed', {});
}

function setDismissedState(state: DismissedState): void {
  safeSetJson('announcement-dismissed', state);
}

export function AnnouncementBanner() {
  const location = useLocation();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState<DismissedState>(() => getDismissedState());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchActiveAnnouncement(location.pathname)
      .then((ann) => {
        if (active) {
          setAnnouncement(ann);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [location.pathname]);

  useEffect(() => {
    setDismissed(getDismissedState());
  }, []);

  if (loading || !announcement) {
    return null;
  }

  if (dismissed && typeof dismissed === 'object' && (dismissed as DismissedState)[announcement.id]) {
    return null;
  }

  const variantClass = VARIANT_STYLES[announcement.variant] ?? VARIANT_STYLES.info;
  const Icon = VARIANT_ICONS[announcement.variant] ?? VARIANT_ICONS.info;

  const handleDismiss = () => {
    const safeDismissed =
      dismissed && typeof dismissed === 'object' && !Array.isArray(dismissed)
        ? dismissed
        : {};
    const next = { ...safeDismissed, [announcement.id]: true };
    setDismissed(next);
    setDismissedState(next);
  };

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] pointer-events-none"
      role="region"
      aria-label="إعلان النظام"
      data-testid="announcement-banner"
    >
      <div className="pointer-events-auto mx-auto w-full max-w-5xl px-4">
        <div
          className={`relative flex items-center gap-3 rounded-xl border px-4 py-3 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.4)] text-white ${variantClass}`}
          dir="rtl"
        >
          <span className="flex-shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/15" aria-hidden="true">
            {Icon}
          </span>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-snug">{announcement.title}</p>
            <p className="mt-0.5 text-sm text-white/90 leading-snug">{announcement.body}</p>
          </div>

          {announcement.link_url && announcement.link_label && /^https:\/\//.test(announcement.link_url) && (
            <a
              href={announcement.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              {announcement.link_label}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}

          {announcement.dismissible && (
            <button
              type="button"
              onClick={handleDismiss}
              className="flex-shrink-0 rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="إخفاء الإعلان"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 hidden md:block">
            <svg className="h-3 w-3 text-current" fill="currentColor" viewBox="0 0 10 6" aria-hidden="true">
              <path d="M5 0L10 6H0Z" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}