import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Lightbulb, Lock } from 'lucide-react';

import { Skeleton } from './Skeleton';
import { getPublicSettings, listMySuggestions } from '../data/rpc';

const SUBMITTED_FLAG = 'suggestions-submitted';

function readSubmittedFlag(): boolean {
  try {
    return localStorage.getItem(SUBMITTED_FLAG) === '1';
  } catch {
    return false;
  }
}

/**
 * Persistent call-to-action above the student dashboard (0075).
 * No dismiss button by design: after the first submission it collapses
 * into a slim thanks strip with an "add more" link.
 */
export function SuggestionsCta() {
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(() => readSubmittedFlag());

  const load = useCallback(async () => {
    try {
      const [settings, mine] = await Promise.all([
        getPublicSettings(),
        listMySuggestions().catch(() => null),
      ]);
      setIsOpen(settings.suggestions_open !== false);
      setBannerMessage(settings.suggestions_banner_message?.trim() || null);
      setClosedMessage(settings.suggestions_closed_message?.trim() || null);
      if (mine && mine.length > 0) {
        setHasSubmitted(true);
        try {
          localStorage.setItem(SUBMITTED_FLAG, '1');
        } catch {
          // private mode — non-fatal
        }
      }
    } catch {
      // non-fatal: hide the CTA rather than break the dashboard
      setIsOpen(false);
      setBannerMessage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const handler = () => {
      setHasSubmitted(true);
    };
    window.addEventListener('suggestions-submitted', handler);
    return () => window.removeEventListener('suggestions-submitted', handler);
  }, [load]);

  if (loading) {
    return <Skeleton className="h-28 w-full rounded-2xl" data-testid="suggestions-cta-loading" />;
  }

  if (!isOpen) {
    if (!closedMessage) return null;
    return (
      <div
        className="glass-card flex items-center gap-3 border-white/8 p-4"
        data-testid="suggestions-cta-closed"
      >
        <Lock className="h-5 w-5 shrink-0 text-foreground-subtle" aria-hidden="true" />
        <p className="text-sm text-foreground-muted">{closedMessage}</p>
      </div>
    );
  }

  if (hasSubmitted) {
    return (
      <div
        className="glass-card flex flex-col gap-2 border-emerald-400/20 bg-emerald-500/5 p-4 sm:flex-row sm:items-center sm:justify-between"
        data-testid="suggestions-cta-thanks"
      >
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          شكرًا — وصلت مشاركتك وهنراجعها ضمن التحديث القادم
        </p>
        <Link
          to="/student/suggestions"
          className="text-sm font-bold text-primary-strong hover:underline"
        >
          إضافة مشاركة أخرى
        </Link>
      </div>
    );
  }

  return (
    <section
      aria-label="شارك في التحديث القادم"
      className="glass-card conic-ring relative overflow-hidden border-indigo-400/25 bg-gradient-to-br from-indigo-500/15 via-fuchsia-500/10 to-transparent p-5 sm:p-6"
      data-testid="suggestions-cta"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-white shadow-[0_8px_20px_-8px_rgba(99,102,241,0.6)]">
            <Lightbulb className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-foreground sm:text-lg">
              ساعدنا نخطط التحديث القادم
            </h2>
            <p className="mt-1 text-sm leading-7 text-foreground-muted">
              {bannerMessage ??
                'بنحصر دلوقتي كل المشاكل والاقتراحات — لو حاجة بتضايقك في المنصة أو عندك فكرة جديدة، اكتبها وهيتم مراجعتها قبل الإطلاق.'}
            </p>
          </div>
        </div>
        <Link
          to="/student/suggestions"
          data-testid="suggestions-cta-link"
          className="btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
        >
          <Lightbulb className="h-4 w-4" aria-hidden="true" />
          اكتب مقترحك
        </Link>
      </div>
    </section>
  );
}
