import { useEffect, useState } from 'react';

import { getSupabaseClient } from './supabase';

/**
 * Authoritative server clock (0084).
 * The device clock is user-controlled, so deadline math never uses
 * Date.now() directly: we fetch the server time once per session, keep
 * the offset, and derive every "now" from it. If the fetch fails the
 * caller must fail closed (treat the deadline as passed).
 */

let cachedOffsetMs: number | null = null;
let inflight: Promise<number> | null = null;

export function resetServerTimeCache(): void {
  cachedOffsetMs = null;
  inflight = null;
}

/** Milliseconds to add to Date.now() to get server time. Fetched once. */
export async function fetchServerOffsetMs(): Promise<number> {
  if (cachedOffsetMs !== null) {
    return cachedOffsetMs;
  }
  if (inflight) {
    return inflight;
  }
  inflight = (async () => {
    const { data, error } = await getSupabaseClient().rpc('get_server_time');
    if (error || !data) {
      throw error ?? new Error('server_time_failed');
    }
    const serverMs = Date.parse(String(data));
    if (Number.isNaN(serverMs)) {
      throw new Error('server_time_invalid');
    }
    cachedOffsetMs = serverMs - Date.now();
    return cachedOffsetMs;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Current server timestamp in ms. Falls back to the device clock only
 *  when no offset was ever fetched (callers needing guarantees must
 *  await fetchServerOffsetMs first and fail closed on error). */
export function serverNowMs(): number {
  return Date.now() + (cachedOffsetMs ?? 0);
}

export interface ServerTimeState {
  ready: boolean;
  failed: boolean;
  /** Live server "now", ticking every second once ready. */
  nowMs: number | null;
}

/** React hook: resolves the server offset once, then ticks locally. */
export function useServerTime(enabled = true): ServerTimeState {
  const [offset, setOffset] = useState<number | null>(() => cachedOffsetMs);
  const [failed, setFailed] = useState(false);
  const [, setTick] = useState(0);
  const hasOffset = offset !== null;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let active = true;
    void fetchServerOffsetMs()
      .then((value) => {
        if (active) setOffset(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!hasOffset) {
      return;
    }
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [hasOffset]);

  return {
    ready: hasOffset,
    failed,
    nowMs: offset === null ? null : Date.now() + offset,
  };
}
