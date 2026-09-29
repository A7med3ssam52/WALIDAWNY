import { useEffect, useState, type ReactElement } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { fetchActiveAnnouncement, type Announcement, type AnnouncementVariant } from '../lib/announcements';
import { safeJsonParseObject, safeSetJson } from '../lib/safeStorage';

const VARIANT_STYLES: Record<AnnouncementVariant, string> = {
  info: 'bg-[rgba(127,184,217,0.1)] border-[rgba(127,184,217,0.3)]',
  warning: 'bg-[rgba(217,167,95,0.1)] border-[rgba(217,167,95,0.3)]',
  success: 'bg-[rgba(127,191,142,0.1)] border-[rgba(127,191,142,0.3)]',
  error: 'bg-[rgba(232,139,139,0.1)] border-[rgba(232,139,139,0.3)]',
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
          className={`relative flex items-center gap-3 rounded-xl border px-4 py-3 shadow-medium text-foreground ${variantClass}`}
          dir="rtl"
        >
          <span className="flex-shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted" aria-hidden="true">
            {Icon}
          </span>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-snug">{announcement.title}</p>
            <p className="mt-0.5 text-sm text-foreground-muted leading-snug">{announcement.body}</p>
          </div>

          {announcement.link_url && announcement.link_label && /^https:\/\//.test(announcement.link_url) && (
            <a
              href={announcement.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {announcement.link_label}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}

          {announcement.dismissible && (
            <button
              type="button"
              onClick={handleDismiss}
              className="flex-shrink-0 rounded-lg p-1.5 text-foreground-subtle transition-colors hover:bg-surface-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label="إخفاء الإعلان"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
