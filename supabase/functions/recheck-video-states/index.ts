// =====================================================================
// recheck-video-states — Phase 5 | Edge Function | Scheduled job (J2)
// ARCHITECTURE.md §8.4 row J2 / §8.5 scheduling chain / SECURITY.md §7
// (EF security model). POST only; config.toml sets verify_jwt = false
// (per ARCHITECTURE §8.4/BLUEPRINT §14, job functions are internal
// endpoints), so access control is enforced HERE: the caller must
// present the `x-internal-token` header equal to env INTERNAL_JOB_TOKEN,
// compared in constant time (crypto.subtle SHA-256 digests — never a
// plain ===).
//
// Reconciliation job for the Bunny video pipeline (ARCHITECTURE.md §7.2):
// Bunny webhooks are the primary driver of set_video_status (see
// bunny-video-webhook, Function 2) but webhooks can be missed or
// delayed — this job is the safety net. It picks up lesson_videos rows
// STUCK in a pre-ready state (pending_upload / uploading / processing,
// not soft-deleted) OLDER than the stale threshold (30 minutes by
// default — documented in ARCHITECTURE.md §8.6) and reconciles them
// against the LIVE Bunny video status:
//
//   Bunny status (docs.bunny.net/stream/webhooks):
//     3 Finished                 -> chain to 'ready' (with length +
//                                   thumbnail from the same fetch)
//     1/2/4 Processing/Encoding/ -> chain to 'processing'
//          Resolution finished
//     7 PresignedUploadFinished  -> chain to 'uploading'
//     5/6/8 Failed / Presigned   -> chain to 'failed'
//          UploadStarted/UploadFailed  (error_message records the state)
//     0/9/10 Queued/Captions/    -> no-op (still in flight / irrelevant)
//          Title
//     404 (video gone)           -> chain to 'failed'
//                                   ('video not found on Bunny')
//     fetch error (transient)    -> skip; the next run retries
//
// Each reconciliation drives set_video_status (0008 — internal RPC, NO
// client grants; run here with the service-role key), chaining through
// the legal transitions (transitionChain in _shared/bunny.ts). A video
// that races the webhook surfaces invalid_video_transition and counts
// as already-advanced (not an error). Re-runs are idempotent: once a
// row leaves the stuck set it is not examined again.
//
// Scheduled like J1 (ARCHITECTURE §8.5 — all three links of the unified
// scheduling chain MUST include the token in every request):
//   supabase functions schedule recheck-video-states "0 6 * * *"
//   (managed) / pg_net.http_post fallback / external cron.
//
// Error envelope: { error: { code, message } }:
//   missing_internal_token -> 401, invalid_internal_token -> 401,
//   server_misconfigured   -> 500 (INTERNAL_JOB_TOKEN not set),
//   recheck_failed         -> 500 (DB failure; message never echoed)
// Success: { checked, updated }.
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse } from '../_shared/cors.ts';
import {
  BUNNY_API_TIMEOUT_MS,
  BUNNY_LIBRARY_API_BASE,
  BUNNY_STATUS,
  transitionChain,
  type VideoState,
} from '../_shared/bunny.ts';

export const STALE_THRESHOLD_MINUTES = 30;

export type DbError = { message: string; code?: string; details?: string };

export interface SvcFrom {
  select(columns: string, opts?: { count?: 'exact'; head?: boolean }): SvcQueryResult;
}

export interface SvcQueryResult extends Promise<{
  data: unknown;
  count?: number | null;
  error: DbError | null;
}> {
  eq(column: string, value: unknown): SvcQueryResult;
  is(column: string, value: unknown): SvcQueryResult;
  lt(column: string, value: unknown): SvcQueryResult;
  in(column: string, values: unknown[]): SvcQueryResult;
}

export interface SvcClient {
  from(table: string): SvcFrom;
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: DbError | null }>;
}

export interface Deps {
  url: string;
  serviceRoleKey: string;
  getToken: () => string | null | undefined;
  makeClient: (url: string, serviceRoleKey: string) => SvcClient;
  bunnyApiKey: string;
  bunnyLibraryId: string;
  /** Live status of a Bunny video; kind:'error' = transient fetch failure. */
  bunnyVideoStatus: (
    libraryId: string,
    apiKey: string,
    videoId: string,
  ) => Promise<
    | { kind: 'error' }
    | { kind: 'missing' }
    | { kind: 'video'; status: number; length: number | null; thumbnailUrl: string | null }
  >;
  staleThresholdMinutes?: number;
  now?: () => number;
}

/** Default dependency wiring: env-driven clients (hosted Edge Runtime / local serve). */
export function defaultDeps(): Deps {
  const apiKey = Deno.env.get('BUNNY_API_KEY') ?? '';
  const libraryId = Deno.env.get('BUNNY_LIBRARY_ID') ?? '';
  return {
    url: Deno.env.get('SUPABASE_URL') ?? '',
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    getToken: () => Deno.env.get('INTERNAL_JOB_TOKEN'),
    makeClient: (url, serviceRoleKey) =>
      createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SvcClient,
    bunnyApiKey: apiKey,
    bunnyLibraryId: libraryId,
    bunnyVideoStatus: async (lib: string, key: string, videoId: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), BUNNY_API_TIMEOUT_MS);
      try {
        const res = await fetch(`${BUNNY_LIBRARY_API_BASE}/${lib}/videos/${videoId}`, {
          method: 'GET',
          headers: { Accept: 'application/json', AccessKey: key },
          signal: controller.signal,
        });
        if (res.status === 404) {
          return { kind: 'missing' };
        }
        if (!res.ok) {
          console.error('recheck-video-states: status fetch failed', res.status);
          return { kind: 'error' };
        }
        const body = (await res.json()) as {
          status?: number | null;
          length?: number | null;
          thumbnailUrl?: string | null;
        };
        return {
          kind: 'video',
          status: body.status ?? 0,
          length: body.length ?? null,
          thumbnailUrl: body.thumbnailUrl ?? null,
        };
      } catch (error) {
        console.error('recheck-video-states: status fetch error', String(error));
        return { kind: 'error' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Constant-time comparison (SHA-256 digests; never a plain ===). */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const left = new Uint8Array(da);
  const right = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

export const STUCK_STATES: VideoState[] = ['pending_upload', 'uploading', 'processing'];

const STATUS_TEXT: Record<number, string> = {
  5: 'failed',
  6: 'presigned upload started but never finished',
  8: 'presigned upload failed',
};

/**
 * Decide the reconciliation target for a stuck row from the live Bunny
 * status. Mirrors the webhook mapping (mapWebhookStatus) plus the
 * missing-video case; returns null for no-op states.
 */
export function targetForBunnyStatus(status: number): VideoState | null {
  switch (status) {
    case BUNNY_STATUS.finished:
      return 'ready';
    case BUNNY_STATUS.processing:
    case BUNNY_STATUS.encoding:
    case BUNNY_STATUS.resolutionFinished:
      return 'processing';
    case BUNNY_STATUS.presignedUploadFinished:
      return 'uploading';
    case BUNNY_STATUS.failed:
    case BUNNY_STATUS.presignedUploadStarted:
    case BUNNY_STATUS.presignedUploadFailed:
      return 'failed';
    default:
      return null;
  }
}

export async function handle(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return jsonResponse(
      { error: { code: 'method_not_allowed', message: 'POST required.' } },
      405,
      true,
    );
  }
  if (req.method !== 'POST') {
    return jsonResponse(
      { error: { code: 'method_not_allowed', message: 'POST required.' } },
      405,
      true,
    );
  }

  // --- Internal token gate (constant-time compare) ---
  const expected = deps.getToken();
  if (!expected) {
    console.error('recheck-video-states: INTERNAL_JOB_TOKEN is not configured');
    return jsonResponse(
      { error: { code: 'server_misconfigured', message: 'Job token is not configured.' } },
      500,
      true,
    );
  }
  const provided = req.headers.get('x-internal-token') ?? '';
  if (!provided) {
    return jsonResponse(
      { error: { code: 'missing_internal_token', message: 'Missing x-internal-token header.' } },
      401,
      true,
    );
  }
  if (!(await timingSafeEqual(provided, expected))) {
    return jsonResponse(
      { error: { code: 'invalid_internal_token', message: 'Invalid x-internal-token.' } },
      401,
      true,
    );
  }

  const client = deps.makeClient(deps.url, deps.serviceRoleKey);

  // --- Stuck candidates: pre-ready, not soft-deleted, stale ---
  const thresholdMinutes = deps.staleThresholdMinutes ?? STALE_THRESHOLD_MINUTES;
  const cutoff = new Date((deps.now?.() ?? Date.now()) - thresholdMinutes * 60_000).toISOString();
  const { data: rows, error: listError } = await client
    .from('lesson_videos')
    .select('id,lesson_id,status,bunny_video_id')
    .in('status', STUCK_STATES)
    .is('deleted_at', null)
    .lt('created_at', cutoff);
  if (listError) {
    console.error('recheck-video-states: candidate query failed', listError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'recheck_failed', message: 'Reconciliation job failed.' } },
      500,
      true,
    );
  }

  const candidates =
    (rows as Array<{
      id: string;
      lesson_id: string;
      status: VideoState;
      bunny_video_id: string;
    }> | null) ?? [];

  let checked = 0;
  let updated = 0;

  for (const row of candidates) {
    checked += 1;
    const live = await deps.bunnyVideoStatus(
      deps.bunnyLibraryId,
      deps.bunnyApiKey,
      row.bunny_video_id,
    );
    if (live.kind === 'error') {
      continue; // transient fetch failure: retry on the next run
    }

    let target: VideoState | null;
    let errorMessage: string | undefined;
    let metadata: { length: number | null; thumbnailUrl: string | null } | null = null;

    if (live.kind === 'missing') {
      target = 'failed';
      errorMessage = 'video not found on Bunny';
    } else {
      target = targetForBunnyStatus(live.status);
      if (target === 'failed') {
        errorMessage = `Bunny status ${live.status} (${STATUS_TEXT[live.status] ?? 'unknown'})`;
      } else if (target === 'ready') {
        metadata = { length: live.length, thumbnailUrl: live.thumbnailUrl };
      }
    }

    if (target === null) {
      continue; // still in flight (queued/captions/title) — next run
    }

    // --- Chain to the target through the legal transitions ---
    const chain = transitionChain(row.status, target);
    if (chain === null || chain.length === 0) {
      continue;
    }

    let appliedAny = false;
    for (let i = 0; i < chain.length; i += 1) {
      const step = chain[i];
      const isLast = i === chain.length - 1;
      const { error: rpcError } = await client.rpc('set_video_status', {
        p_video_id: row.id,
        p_new_status: step,
        p_duration_seconds: isLast && target === 'ready' ? (metadata?.length ?? null) : null,
        p_thumbnail_url: isLast && target === 'ready' ? metadata?.thumbnailUrl : null,
        p_error_message: isLast && target === 'failed' ? (errorMessage ?? null) : null,
      });
      if (rpcError) {
        if (rpcError.code === 'invalid_video_transition') {
          // the webhook already advanced this row: stop here
          break;
        }
        console.error('recheck-video-states: set_video_status failed', rpcError.code ?? 'unknown');
        break;
      }
      appliedAny = true;
    }
    if (appliedAny) {
      updated += 1;
    }
  }

  return jsonResponse({ checked, updated }, 200, true);
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
