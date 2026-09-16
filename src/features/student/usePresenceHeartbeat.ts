import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { touchPresence } from '../../data/rpc';
import { getSupabaseClient } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';

const HEARTBEAT_INTERVAL_MS = 30_000;
const VISIBILITY_DEBOUNCE_MS = 400;

function isStudentRole(role: string | null): boolean {
  return role === 'student';
}

export function extractLessonId(path: string): string | null {
  // Fix #12 — ريجيكس متسامح: يقبل UUID أو أي slug بعد /student/lessons/.
  // يتوقف عند ? أو # أو / التالية.
  const m = path.match(/\/student\/lessons\/([^/?#\s]+)/);
  if (!m) return null;
  const raw = decodeURIComponent(m[1]).trim().replace(/\/+$/, '');
  if (!raw || raw === 'null' || raw === 'undefined') return null;
  return raw;
}

/**
 * Tracks online presence for students.
 * - heartbeat every 30s (single fixed interval, stable deps)
 * - immediate send on route change / visibility change (single sources)
 * - page_view is logged server-side ONLY on real change (touch_presence 0072)
 * - leaving a lesson sends lessonId=null so current_lesson_id is cleared
 * - closing uses a synchronously-cached token + keepalive fetch (no async
 *   getSession on unload)
 */
export function usePresenceHeartbeat() {
  const { role } = useAuth();
  const location = useLocation();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentPathRef = useRef<string>('');
  const lastSentLessonRef = useRef<string | null>(null);
  const lastSentVisibleRef = useRef<boolean>(true);
  const tokenRef = useRef<string>('');
  const visibilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActiveStudent = isStudentRole(role);

  const sendHeartbeat = async (opts: {
    path?: string | null;
    lessonId?: string | null;
    isVisible?: boolean;
    closing?: boolean;
  }) => {
    if (!isActiveStudent) return;
    try {
      const res = await touchPresence({
        path: opts.path ?? null,
        lessonId: opts.lessonId ?? null,
        isVisible: opts.isVisible ?? !document.hidden,
        closing: opts.closing ?? false,
      });
      void res;
      // Cache the token synchronously for the unload path.
      try {
        const { data } = await getSupabaseClient().auth.getSession();
        const token = data.session?.access_token;
        if (token) tokenRef.current = token;
      } catch {
        // ignore — closing falls back to last cached token
      }
      if (opts.path !== undefined && opts.path !== null) {
        lastSentPathRef.current = opts.path;
      }
      if (opts.lessonId !== undefined) {
        lastSentLessonRef.current = opts.lessonId;
      }
      if (opts.isVisible !== undefined) {
        lastSentVisibleRef.current = opts.isVisible;
      }
    } catch (_err) {
      void _err;
    }
  };

  // Prime the cached token as soon as the hook activates.
  useEffect(() => {
    if (!isActiveStudent) return;
    let cancelled = false;
    getSupabaseClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled && data.session?.access_token) {
          tokenRef.current = data.session.access_token;
        }
      })
      .catch(() => {
        // ignore
      });
    return () => {
      cancelled = true;
    };
  }, [isActiveStudent]);

  // Route change -> immediate heartbeat (single source).
  // Fix #8: فرّق بين null وليس-في-درس: خارج الدرس نرسل lessonId=null
  // صراحةً فيمسح السيرفر current_lesson_id عند تغير المسار.
  useEffect(() => {
    if (!isActiveStudent) return;
    const path = location.pathname + location.search;
    const lessonId = extractLessonId(path);
    const isVisible = typeof document !== 'undefined' ? !document.hidden : true;
    if (
      path === lastSentPathRef.current &&
      lessonId === lastSentLessonRef.current &&
      isVisible === lastSentVisibleRef.current
    ) {
      return;
    }
    void sendHeartbeat({ path, lessonId, isVisible });
  }, [location.pathname, location.search, isActiveStudent]);

  // Interval heartbeat — FIXED interval with stable deps (single source).
  // Reads the live location each tick; skips the send when nothing changed
  // except the 30s liveness bump handled server-side via throttling.
  useEffect(() => {
    if (!isActiveStudent) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const p = window.location.pathname + window.location.search;
      const lessonId = extractLessonId(p);
      const isVisible = !document.hidden;
      // Always send the liveness tick, but the server only logs page_view
      // on real change (0072). Clearing works because lessonId=null is
      // explicit when we left the lesson page.
      void sendHeartbeat({ path: p, lessonId, isVisible });
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [isActiveStudent]);

  // Visibility change (debounced, single source).
  useEffect(() => {
    if (!isActiveStudent) return;
    const handler = () => {
      if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current);
      visibilityTimerRef.current = setTimeout(() => {
        const p = window.location.pathname + window.location.search;
        void sendHeartbeat({ path: p, lessonId: extractLessonId(p), isVisible: !document.hidden });
      }, VISIBILITY_DEBOUNCE_MS);
    };
    document.addEventListener('visibilitychange', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current);
    };
  }, [isActiveStudent]);

  // Close session on page hide / beforeunload via keepalive fetch with the
  // synchronously-cached token (fix #8 — توكن مخزن، لا getSession م assync).
  useEffect(() => {
    if (!isActiveStudent) return;

    const sendClosingBeacon = () => {
      try {
        const token = tokenRef.current;
        const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
        const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
        if (!token || !base || !base.startsWith('http') || !apikey) return;
        const path = window.location.pathname + window.location.search;
        const url = `${base}/rest/v1/rpc/touch_presence`;
        const body = JSON.stringify({
          p_path: path,
          p_lesson_id: extractLessonId(path),
          p_is_visible: false,
          p_closing: true,
        });
        // Prefer sendBeacon with a blob when available (survives unload);
        // auth goes via apikey header equivalent is impossible in beacons,
        // so use keepalive fetch with Authorization (also survives unload).
        try {
          void fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey,
              Authorization: `Bearer ${token}`,
            },
            body,
            keepalive: true,
          }).catch(() => {
            // unload path — ignore
          });
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('pagehide', sendClosingBeacon);
    window.addEventListener('beforeunload', sendClosingBeacon);
    return () => {
      window.removeEventListener('pagehide', sendClosingBeacon);
      window.removeEventListener('beforeunload', sendClosingBeacon);
    };
  }, [isActiveStudent]);
}
