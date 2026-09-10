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

/**
 * Tracks online presence for students.
 * - sends heartbeat every 30s
 * - sends immediately on route change / visibility change
 * - uses sendBeacon on pagehide/beforeunload to close session
 */
export function usePresenceHeartbeat() {
  const { role } = useAuth();
  const location = useLocation();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPathRef = useRef<string>('');
  const visibilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActiveStudent = isStudentRole(role);

  // extract lessonId from path like /student/lessons/:lessonId
  const getLessonId = (path: string): string | null => {
    const m = path.match(/\/student\/lessons\/([0-9a-fA-F-]{36})/);
    return m ? m[1] : null;
  };

  const sendHeartbeat = async (opts: {
    path?: string | null;
    lessonId?: string | null;
    isVisible?: boolean;
    closing?: boolean;
  }) => {
    if (!isActiveStudent) return;
    try {
      await touchPresence({
        path: opts.path ?? null,
        lessonId: opts.lessonId ?? null,
        isVisible: opts.isVisible ?? !document.hidden,
        closing: opts.closing ?? false,
      });
    } catch (_err) {
      void _err;
    }
  };

  // Route change -> immediate heartbeat
  useEffect(() => {
    if (!isActiveStudent) return;
    const path = location.pathname + location.search;
    if (path === lastPathRef.current) return;
    lastPathRef.current = path;
    void sendHeartbeat({ path, lessonId: getLessonId(path), isVisible: !document.hidden });
  }, [location.pathname, location.search, isActiveStudent]);

  // Interval heartbeat
  useEffect(() => {
    if (!isActiveStudent) return;
    // initial
    const path = location.pathname + location.search;
    void sendHeartbeat({ path, lessonId: getLessonId(path) });

    intervalRef.current = setInterval(() => {
      const p = window.location.pathname + window.location.search;
      void sendHeartbeat({ path: p, lessonId: getLessonId(p), isVisible: !document.hidden });
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActiveStudent, location.pathname, location.search]);

  // Visibility change
  useEffect(() => {
    if (!isActiveStudent) return;
    const handler = () => {
      if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current);
      visibilityTimerRef.current = setTimeout(() => {
        const p = window.location.pathname + window.location.search;
        void sendHeartbeat({ path: p, lessonId: getLessonId(p), isVisible: !document.hidden });
      }, VISIBILITY_DEBOUNCE_MS);
    };
    document.addEventListener('visibilitychange', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current);
    };
  }, [isActiveStudent]);

  // Close session on page hide / beforeunload via sendBeacon
  useEffect(() => {
    if (!isActiveStudent) return;

    const sendClosingBeacon = () => {
      try {
        const client = getSupabaseClient();
        const path = window.location.pathname + window.location.search;
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/touch_presence`;
        client.auth.getSession().then(({ data }) => {
          const token = data.session?.access_token;
          if (!token || !url.startsWith('http')) return;
          try {
            fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                p_path: path,
                p_lesson_id: getLessonId(path),
                p_is_visible: false,
                p_closing: true,
              }),
              keepalive: true,
            }).catch((_e) => {
              void _e;
            });
          } catch (_e) {
            void _e;
          }
        });
      } catch (_e) {
        void _e;
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
