// =====================================================================
// get-video-thumbnail-url â€” Phase 5 | Edge Function | Function 6
// ARCHITECTURE.md آ§8.4 row 3 / آ§7.2 (Bunny video pipeline) / SECURITY.md
// آ§7 (EF security model). GET/HEAD, JWT-verified (config.toml:
// [functions.get-video-thumbnail-url] verify_jwt = true).
//
// Returns a short-lived signed thumbnail URL for a lesson video:
//
//   https://<pull_zone>/<videoId>/thumbnail.jpg
//     ?token=HS256-1-<b64url>&expires=<e>&token_path=%2F<videoId>%2F
//
// The thumbnail lives in the video's Bunny directory
// (`/{videoId}/thumbnail.jpg`) and is covered by the same IP-locked
// DIRECTORY token as the HLS chain â€” verified against the real pull zone
// by scripts/smoke-bunny.mjs (thumbnail.jpg returned 200 with the
// directory token). This EF exists because the raw thumbnail_url column
// on lesson_videos is UNSIGNED and must never reach the client
// (review finding MED-3: unsigned CDN URL = content leak + token bypass);
// the frontend renders thumbnails through this EF exclusively.
//
// Access control mirrors get-video-playback-url exactly (same profile,
// lesson-reachability and lesson-access gates; SECURITY.md section 4):
//   * STAFF (admin/mr_walid): may fetch a thumbnail for any non-deleted
//     video of a live lesson (missing lesson -> lesson_not_found 404,
//     soft-deleted -> lesson_deleted 422).
//   * STUDENT: the lesson must be reachable (published, own live grade)
//     and the student must have access to the lesson â€” a lifetime unit
//     purchase OR an active trial lesson (public.get_my_lesson_access,
//     0028; replaces the old A33 access gate); the video must be
//     the READY PRIMARY row (the 0009 lesson_videos SELECT policy yields
//     exactly that set; an explicit status/is_primary filter is applied
//     as well). Any failure -> access_denied 403.
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized                 -> 401
//   forbidden                    -> 403 (role insufficient / no profile)
//   account_inactive_or_deleted  -> 403
//   validation_error             -> 422 (missing/illegal video_id)
//   video_not_found              -> 404 (missing/soft-deleted video)
//   lesson_not_found             -> 404 (staff only)
//   lesson_deleted               -> 422 (staff only; student sees 403)
//   access_denied                -> 403 (student gate: lesson access)
//   client_ip_unavailable        -> 500 (no cf-connecting-ip / x-forwarded-for)
//   internal_error               -> 500 (query/URL-build failures; raw
//                                   message never echoed)
//
// Success: { thumbnail_url, video_id, lesson_id }.
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';
import { buildSignedObjectUrl } from '../_shared/bunny.ts';
import {
  DEFAULT_TTL_SECONDS,
  STAFF_ROLES,
  clientIpFromHeaders,
} from '../get-video-playback-url/index.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  gt(column: string, value: unknown): SvcQueryResult;
  maybeSingle(): Promise<{ data: unknown; error: DbError | null }>;
}

export interface SvcClient {
  auth: {
    getUser(jwt?: string): Promise<{
      data: { user: { id: string } | null };
      error: { message: string } | null;
    }>;
  };
  from(table: string): SvcFrom;
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: DbError | null }>;
}

export interface Deps {
  url: string;
  /** Caller-scoped client: anon key in the key slot, caller JWT in Authorization. */
  makeClient: (url: string, jwt: string) => SvcClient;
  bunnySigningKey: string;
  bunnyHostname: string;
  ttlSeconds?: number;
  /** Unix seconds (injectable for deterministic URL vectors). */
  nowUnix?: () => number;
  /** Client IP for token locking (injectable for deterministic vectors). */
  getClientIp?: (req: Request) => string | null;
}

/** Default dependency wiring: env-driven clients (hosted Edge Runtime / local serve). */
export function defaultDeps(): Deps {
  return {
    url: Deno.env.get('SUPABASE_URL') ?? '',
    makeClient: (url, jwt) =>
      createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SvcClient,
    bunnySigningKey: Deno.env.get('BUNNY_SIGNING_KEY') ?? '',
    bunnyHostname: Deno.env.get('BUNNY_PULL_ZONE_HOSTNAME') ?? '',
    getClientIp: clientIpFromHeaders,
  };
}

function parseVideoId(searchParams: URLSearchParams):
  | { ok: true; videoId: string }
  | {
      ok: false;
      message: string;
    } {
  const videoId = searchParams.get('video_id');
  if (typeof videoId !== 'string' || !UUID_RE.test(videoId)) {
    return { ok: false, message: 'video_id query parameter must be a UUID.' };
  }
  return { ok: true, videoId };
}

export async function handle(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  if (req.method === 'OPTIONS') return preflightResponse();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return jsonResponse(
      { error: { code: 'method_not_allowed', message: 'GET or HEAD required.' } },
      405,
    );
  }

  // --- 1) JWT verification (never trust decoded claims alone) ---
  const authHeader = req.headers.get('Authorization');
  const jwt = authHeader?.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!jwt) {
    return jsonResponse(
      { error: { code: 'unauthorized', message: 'Missing or invalid Authorization header.' } },
      401,
    );
  }

  const client = deps.makeClient(deps.url, jwt);
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser(jwt);
  if (authError || !user?.id) {
    return jsonResponse(
      { error: { code: 'unauthorized', message: 'Invalid or expired token.' } },
      401,
    );
  }

  // --- 2) Role + active/not-deleted profile check, re-derived from DB ---
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role,status,deleted_at')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('get-video-thumbnail-url: profile query failed', profileError.code ?? 'unknown');
    return jsonResponse({ error: { code: 'forbidden', message: 'Unable to verify caller.' } }, 403);
  }
  const p = profile as { role: string; status: string; deleted_at: string | null } | null;
  if (!p) {
    return jsonResponse(
      { error: { code: 'forbidden', message: 'Caller profile not found.' } },
      403,
    );
  }
  if (p.status !== 'active' || p.deleted_at !== null) {
    return jsonResponse(
      {
        error: { code: 'account_inactive_or_deleted', message: 'Account is disabled or deleted.' },
      },
      403,
    );
  }
  const isStaff = STAFF_ROLES.has(p.role);

  // --- 3) video_id query parameter ---
  const parsed = parseVideoId(new URL(req.url).searchParams);
  if (!parsed.ok) {
    return jsonResponse({ error: { code: 'validation_error', message: parsed.message } }, 422);
  }
  const videoId = parsed.videoId;

  // --- 4) The video row (RLS-scoped; students only see the READY PRIMARY
  // row of an accessible lesson â€” the 0009 SELECT policy). The explicit
  // filters keep the staff branch to the same contract. ---
  const { data: video, error: videoError } = await client
    .from('lesson_videos')
    .select('id,lesson_id,bunny_video_id,status,is_primary,deleted_at')
    .eq('id', videoId)
    .is('deleted_at', null)
    .maybeSingle();
  if (videoError) {
    console.error('get-video-thumbnail-url: video query failed', videoError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to resolve the video.' } },
      500,
    );
  }
  const videoRow = video as {
    id: string;
    lesson_id: string;
    bunny_video_id: string;
    status: string;
    is_primary: boolean;
    deleted_at: string | null;
  } | null;
  if (!videoRow) {
    return jsonResponse({ error: { code: 'video_not_found', message: 'Video not found.' } }, 404);
  }
  if (!isStaff && (videoRow.status !== 'ready' || !videoRow.is_primary)) {
    // students may only see the thumbnail of the READY PRIMARY video
    return jsonResponse({ error: { code: 'video_not_found', message: 'Video not found.' } }, 404);
  }

  // --- 5) Lesson reachability (RLS-scoped; see playback EF header) ---
  const { data: lesson, error: lessonError } = await client
    .from('lessons')
    .select('id,deleted_at')
    .eq('id', videoRow.lesson_id)
    .maybeSingle();
  if (lessonError) {
    console.error('get-video-thumbnail-url: lesson query failed', lessonError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate lesson.' } },
      500,
    );
  }
  const lessonRow = lesson as { id: string; deleted_at: string | null } | null;
  if (isStaff) {
    if (!lessonRow) {
      return jsonResponse(
        { error: { code: 'lesson_not_found', message: 'Lesson not found.' } },
        404,
      );
    }
    if (lessonRow.deleted_at !== null) {
      return jsonResponse(
        { error: { code: 'lesson_deleted', message: 'Lesson is soft-deleted.' } },
        422,
      );
    }
  } else if (!lessonRow || lessonRow.deleted_at !== null) {
    return jsonResponse(
      { error: { code: 'access_denied', message: 'Lesson is not accessible.' } },
      403,
    );
  }

  // --- 6) Student lesson-access gate (lifetime purchase OR trial lesson;
  // staff previews skip it) ---
  if (!isStaff) {
    const { data: access, error: accessError } = await client.rpc('get_my_lesson_access', {
      p_lesson_id: videoRow.lesson_id,
    });
    if (accessError) {
      console.error(
        'get-video-thumbnail-url: lesson access check failed',
        accessError.code ?? 'unknown',
      );
      return jsonResponse(
        { error: { code: 'internal_error', message: 'Failed to validate lesson access.' } },
        500,
      );
    }
    const accessInfo = access as { has_access: boolean } | null;
    if (!accessInfo || accessInfo.has_access !== true) {
      return jsonResponse(
        { error: { code: 'access_denied', message: 'Lesson access is required.' } },
        403,
      );
    }
  }

  // --- 7) Short-lived signed thumbnail URL (IP-locked HS256 directory token) ---
  try {
    const clientIp = deps.getClientIp ? deps.getClientIp(req) : clientIpFromHeaders(req);
    if (!clientIp) {
      console.error('get-video-thumbnail-url: no client IP header available');
      return jsonResponse(
        {
          error: {
            code: 'client_ip_unavailable',
            message: 'Unable to determine the client IP for thumbnail signing.',
          },
        },
        500,
      );
    }
    const { url } = await buildSignedObjectUrl({
      hostname: deps.bunnyHostname,
      signingKey: deps.bunnySigningKey,
      videoId: videoRow.bunny_video_id,
      objectName: 'thumbnail.jpg',
      ttlSeconds: deps.ttlSeconds ?? DEFAULT_TTL_SECONDS,
      nowUnix: deps.nowUnix?.(),
      ip: clientIp,
    });
    return jsonResponse(
      {
        thumbnail_url: url,
        video_id: videoRow.id,
        lesson_id: videoRow.lesson_id,
      },
      200,
    );
  } catch (error) {
    console.error('get-video-thumbnail-url: URL build failed', String(error));
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to build the thumbnail URL.' } },
      500,
    );
  }
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
