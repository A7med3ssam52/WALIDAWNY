// =====================================================================
// bunny-video-webhook — Phase 5 | Edge Function | Function 2
// ARCHITECTURE.md §8.4 row 2 / §7.2 (Bunny video pipeline) / SECURITY.md
// §7 (EF security model). POST only; config.toml sets verify_jwt = false
// (Bunny does not send a JWT) — access control is enforced HERE.
//
// Consumes Bunny Stream webhooks and drives the lesson_videos state
// machine through the internal SECURITY DEFINER RPC public.set_video_status
// (migrations/0008, NO client grants — this function runs it with the
// service-role key).
//
// Auth: the webhook is authenticated with the shared webhook token —
// query param `token` or the `x-webhook-token` header — compared in
// constant time (crypto.subtle SHA-256 digests). There is NO Bunny-side
// signature secret in this project's env, so the token is provisioned
// via `supabase secrets set`
// BUNNY_WEBHOOK_TOKEN=<random> and pasted into the Bunny Stream webhook
// URL as ?token=<value>. (SECURITY.md documents this fallback.)
//
// Payload: the CURRENT Bunny webhook payload is
// { VideoLibraryId, VideoGuid, Status } with NUMERIC statuses
// (docs.bunny.net/stream/webhooks): 0 Queued, 1 Processing,
// 2 Encoding, 3 Finished, 4 Resolution finished, 5 Failed,
// 6 PresignedUploadStarted, 7 PresignedUploadFinished,
// 8 PresignedUploadFailed, 9 CaptionsGenerated,
// 10 TitleOrDescriptionGenerated.
//
// DEVIATION from the phase brief: the brief describes legacy
// EventType strings (VideoUploaded / VideoQueued / ...). The current
// API sends numeric Status instead, so this function maps NUMERIC
// statuses (mapWebhookStatus in _shared/bunny.ts). A payload without a
// numeric Status is logged and answered 200 { status: 'ignored' } (a
// webhook without an actionable event must not trigger retries).
//
// Mapping (status -> state-machine action -> set_video_status chain):
//   3 Finished                    -> ready       (chain: pending_upload ->
//                                                  uploading -> processing ->
//                                                  ready; metadata fetched)
//   1/2/4 Processing/Encoding/    -> processing  (chain to 'processing')
//        Resolution finished
//   6/7 PresignedUploadStarted/   -> uploading   (chain to 'uploading')
//        Finished
//   5/8 Failed / Presigned        -> failed      (chain to 'failed' with
//        UploadFailed                           error_message)
//   0/9/10 Queued / Captions /    -> none        (200 ignored)
//        Title
//
// Illegal transitions (e.g. failed for an already-ready video) are
// answered 200 { status: 'ignored' } — never retried, logged only.
// A RACE (webhook vs. recheck-video-states) surfaces as
// invalid_video_transition and is also answered 200 ignored: the state
// machine is the source of truth and the other runner already advanced.
//
// On 'ready': the EF fetches the video metadata from the Bunny API
// (length/thumbnail — GET /library/{id}/videos/{guid} with the AccessKey
// header) and passes it to set_video_status. A metadata fetch failure is
// a 502 bunny_metadata_failed — Bunny retries webhooks, so the final
// transition is NOT burned without its metadata. After a full ready
// chain the EF calls notify_new_content(lesson_id) (0008): deduped and
// only fires for published lessons — students of published lessons get
// the new-content notification exactly when the primary video becomes
// playable.
//
// DB contract: set_video_status RETURNS void; the EF chains the
// intermediate transitions sequentially, tolerating
// invalid_video_transition (already advanced). Video resolution:
// the payload carries the BUNNY id (guid), so the EF first resolves the
// local lesson_videos row by bunny_video_id (service-role SELECT).
//
// Error envelope: { error: { code, message } } with stable codes:
//   missing_webhook_token  -> 401
//   invalid_webhook_token  -> 401
//   server_misconfigured   -> 500 (BUNNY_WEBHOOK_TOKEN not set)
//   invalid_json           -> 400
//   payload_too_large      -> 413 (> 64 KiB)
//   validation_error       -> 400 (no video id in payload)
//   bunny_metadata_failed  -> 502 (Bunny will retry)
//   webhook_failed         -> 500 (any other DB failure; message never echoed)
// Non-actionable events answer 200 { status: 'ignored' } (no error body).
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse } from '../_shared/cors.ts';

// Server-to-server endpoint (Bunny calls it; no browser origin). All
// responses are CORS-free: no permissive surface is advertised.
const json = (body: unknown, status = 200): Response => jsonResponse(body, status, true);
import {
  BUNNY_API_TIMEOUT_MS,
  BUNNY_LIBRARY_API_BASE,
  mapWebhookStatus,
  transitionChain,
  type BunnyAction,
  type VideoState,
} from '../_shared/bunny.ts';

export const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;
const STATUS_TEXT: Record<number, string> = {
  0: 'queued',
  1: 'processing',
  2: 'encoding',
  3: 'finished',
  4: 'resolution finished',
  5: 'failed',
  6: 'presigned upload started',
  7: 'presigned upload finished',
  8: 'presigned upload failed',
  9: 'captions generated',
  10: 'title or description generated',
};

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
  maybeSingle(): Promise<{ data: unknown; error: DbError | null }>;
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
  getWebhookToken: () => string | null | undefined;
  makeClient: (url: string, serviceRoleKey: string) => SvcClient;
  bunnyApiKey: string;
  bunnyLibraryId: string;
  /** Video metadata from the Bunny API; null on ANY fetch failure (404 too). */
  bunnyGetVideo: (
    libraryId: string,
    apiKey: string,
    videoId: string,
  ) => Promise<{ length: number | null; thumbnailUrl: string | null } | null>;
  maxBodyBytes?: number;
}

/** Default dependency wiring: env-driven clients (hosted Edge Runtime / local serve). */
export function defaultDeps(): Deps {
  const apiKey = Deno.env.get('BUNNY_API_KEY') ?? '';
  const libraryId = Deno.env.get('BUNNY_LIBRARY_ID') ?? '';
  return {
    url: Deno.env.get('SUPABASE_URL') ?? '',
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    getWebhookToken: () => Deno.env.get('BUNNY_WEBHOOK_TOKEN'),
    makeClient: (url, serviceRoleKey) =>
      createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SvcClient,
    bunnyApiKey: apiKey,
    bunnyLibraryId: libraryId,
    bunnyGetVideo: async (lib: string, key: string, videoId: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), BUNNY_API_TIMEOUT_MS);
      try {
        const res = await fetch(`${BUNNY_LIBRARY_API_BASE}/${lib}/videos/${videoId}`, {
          method: 'GET',
          headers: { Accept: 'application/json', AccessKey: key },
          signal: controller.signal,
        });
        if (!res.ok) {
          console.error('bunny-video-webhook: metadata fetch failed', res.status);
          return null;
        }
        const body = (await res.json()) as { length?: number | null; thumbnailUrl?: string | null };
        return { length: body.length ?? null, thumbnailUrl: body.thumbnailUrl ?? null };
      } catch (error) {
        console.error('bunny-video-webhook: metadata fetch error', String(error));
        return null;
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

interface WebhookPayload {
  videoId: string;
  status: number;
  action: BunnyAction;
}

/** Parse + normalize a webhook body. Current shape: numeric Status. */
export function parseWebhookPayload(raw: unknown): WebhookPayload | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const videoId =
    typeof record.VideoGuid === 'string' && record.VideoGuid !== ''
      ? record.VideoGuid
      : typeof record.VideoId === 'string' && record.VideoId !== ''
        ? record.VideoId
        : null;
  // Numeric Status is the current documented contract. Legacy
  // EventType-only payloads are treated as non-actionable (documented
  // deviation in the file header).
  const status = typeof record.Status === 'number' ? record.Status : null;
  if (status === null || videoId === null) {
    return null;
  }
  return { videoId, status, action: mapWebhookStatus(status) };
}

const VIDEO_STATE: Record<BunnyAction, VideoState | null> = {
  uploading: 'uploading',
  processing: 'processing',
  ready: 'ready',
  failed: 'failed',
  none: null,
};

export async function handle(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return json({ error: { code: 'method_not_allowed', message: 'POST required.' } }, 405);
  }
  if (req.method !== 'POST') {
    return json({ error: { code: 'method_not_allowed', message: 'POST required.' } }, 405);
  }

  // --- 1) Webhook token gate (constant-time compare) ---
  const expected = deps.getWebhookToken();
  if (!expected) {
    console.error('bunny-video-webhook: BUNNY_WEBHOOK_TOKEN is not configured');
    return json(
      { error: { code: 'server_misconfigured', message: 'Webhook token is not configured.' } },
      500,
    );
  }
  const url = new URL(req.url);
  const provided = url.searchParams.get('token') ?? req.headers.get('x-webhook-token') ?? '';
  if (!provided) {
    return json(
      { error: { code: 'missing_webhook_token', message: 'Missing webhook token.' } },
      401,
    );
  }
  if (!(await timingSafeEqual(provided, expected))) {
    return json(
      { error: { code: 'invalid_webhook_token', message: 'Invalid webhook token.' } },
      401,
    );
  }

  // --- 2) Body size cap (webhooks are tiny; 64 KiB is generous) ---
  const maxBytes = deps.maxBodyBytes ?? MAX_WEBHOOK_BODY_BYTES;
  const rawText = await req.text();
  if (rawText.length > maxBytes) {
    return json(
      { error: { code: 'payload_too_large', message: 'Webhook payload too large.' } },
      413,
    );
  }

  // --- 3) Parse + normalize ---
  let payload: WebhookPayload | null = null;
  try {
    payload = parseWebhookPayload(JSON.parse(rawText));
  } catch {
    return json(
      { error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } },
      400,
    );
  }
  if (!payload) {
    console.warn('bunny-video-webhook: payload without actionable video id / numeric status');
    return json({ status: 'ignored' }, 200);
  }

  // --- 4) Library match: ignore webhooks for other libraries ---
  const parsedBody = JSON.parse(rawText) as Record<string, unknown>;
  if (
    parsedBody.VideoLibraryId !== undefined &&
    String(parsedBody.VideoLibraryId) !== deps.bunnyLibraryId
  ) {
    return json({ status: 'ignored' }, 200);
  }

  // --- 5) Non-actionable events (queued / captions / title) ---
  const target = VIDEO_STATE[payload.action];
  if (target === null) {
    return json({ status: 'ignored' }, 200);
  }

  const client = deps.makeClient(deps.url, deps.serviceRoleKey);

  // --- 6) Resolve the local row by the BUNNY id (the webhook never
  // carries the local uuid) ---
  const { data: video, error: videoError } = await client
    .from('lesson_videos')
    .select('id,lesson_id,status')
    .eq('bunny_video_id', payload.videoId)
    .maybeSingle();
  if (videoError) {
    console.error('bunny-video-webhook: video lookup failed', videoError.code ?? 'unknown');
    return json({ error: { code: 'webhook_failed', message: 'Webhook processing failed.' } }, 500);
  }
  if (!video) {
    return json({ status: 'ignored' }, 200);
  }
  const row = video as { id: string; lesson_id: string; status: VideoState };

  // --- 7) Legal chain from the CURRENT state to the target ---
  const chain = transitionChain(row.status, target);
  if (chain === null || chain.length === 0) {
    // already there, or target unreachable (e.g. failed for a ready
    // video): the state machine is the source of truth — no-op.
    return json({ status: 'ignored' }, 200);
  }

  // --- 8) Metadata for the final ready step (fetched BEFORE the
  // transition; a fetch failure is a 502 so Bunny retries and the
  // transition is not burned without metadata) ---
  let metadata: { length: number | null; thumbnailUrl: string | null } | null = null;
  if (target === 'ready') {
    metadata = await deps.bunnyGetVideo(deps.bunnyLibraryId, deps.bunnyApiKey, payload.videoId);
    if (!metadata) {
      return json(
        { error: { code: 'bunny_metadata_failed', message: 'Failed to fetch video metadata.' } },
        502,
      );
    }
  }

  // --- 9) Apply the chain via set_video_status (internal RPC) ---
  const errorMessage =
    target === 'failed'
      ? `Bunny status ${payload.status} (${STATUS_TEXT[payload.status ?? 5] ?? 'unknown'})`
      : undefined;

  for (let i = 0; i < chain.length; i += 1) {
    const step = chain[i];
    const isLast = i === chain.length - 1;
    const { error: rpcError } = await client.rpc('set_video_status', {
      p_video_id: row.id,
      p_new_status: step,
      p_duration_seconds: isLast && target === 'ready' ? (metadata?.length ?? null) : null,
      p_thumbnail_url: isLast && target === 'ready' ? metadata?.thumbnailUrl : null,
      p_error_message: isLast && target === 'failed' ? errorMessage : null,
    });
    if (rpcError) {
      if (rpcError.code === 'video_not_found' || rpcError.code === 'invalid_video_transition') {
        // race (webhook vs. recheck) or row deleted: already handled
        return json({ status: 'ignored' }, 200);
      }
      console.error('bunny-video-webhook: set_video_status failed', rpcError.code ?? 'unknown');
      return json(
        { error: { code: 'webhook_failed', message: 'Webhook processing failed.' } },
        500,
      );
    }
  }

  // --- 10) Published-lesson fan-out when the video became ready (0008:
  // deduped; only fires for published lessons) ---
  if (target === 'ready') {
    const { error: notifyError } = await client.rpc('notify_new_content', {
      p_lesson_id: row.lesson_id,
    });
    if (notifyError) {
      console.error(
        'bunny-video-webhook: notify_new_content failed',
        notifyError.code ?? 'unknown',
      );
    }
  }

  return json(
    { status: 'ok', action: payload.action, video_id: row.id, lesson_id: row.lesson_id },
    200,
  );
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
