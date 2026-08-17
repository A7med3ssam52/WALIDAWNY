// =====================================================================
// get-video-playback-url â€” Phase 5 | Edge Function | Function 3
// ARCHITECTURE.md آ§8.4 row 3 / آ§7.2 (Bunny video pipeline) / SECURITY.md
// آ§7 (EF security model). GET/HEAD, JWT-verified (config.toml:
// [functions.get-video-playback-url] verify_jwt = true).
//
// Returns a short-lived signed HLS master playlist URL for a lesson's
// PRIMARY ready video:
//
//   https://<pull_zone>/<videoId>/playlist.m3u8
//     ?token=HS256-1-<b64url>&expires=<e>&token_path=%2F<videoId>%2F
//
// The master playlist path is the documented Bunny storage structure
// `/{videoId}/playlist.m3u8` (docs.bunny.net/stream/storage-structure).
// The token is an Advanced (HS256) DIRECTORY token for `/<videoId>/`
// (message = tokenPath + expires + clientIpBytes + "token_path=" + raw
// tokenPath), IP-locked to the CALLER's address and valid for 20 minutes
// by default â€” players request every HLS segment under that directory
// during playback, so a directory token is required (a file token would
// 403 the segments). This exact formula was verified against the real
// pull zone by scripts/smoke-bunny.mjs (Token IP Validation is enabled
// on the zone, so the IP-locked QUERY form is mandatory; the docs'
// bcdn_token path form returns 403).
//
// The caller's IP is read from cf-connecting-ip, else the first
// x-forwarded-for entry (set by the hosting platform in front of the
// Edge Runtime). IPv6 addresses are masked to /64 per the official
// BunnyCDN.TokenAuthentication token.js. If no IP header is present the
// request fails with client_ip_unavailable (a URL signed without the IP
// lock would be rejected by the zone anyway).
//
// Access control (mirrors public.can_access_lesson, 0003 â€” the single
// content-access gate; SECURITY.md section 4):
//   * STAFF (admin/mr_walid): may preview any lesson's video (the phase
//     brief binds this to the staff QA preview â€” SECURITY.md row B5).
//     Missing lesson -> lesson_not_found (404); soft-deleted lesson ->
//     lesson_deleted (422).
//   * STUDENT: the lesson must be reachable â€” lesson published, unit
//     published, own live grade, grade active AND not soft-deleted (B8),
//     lesson not soft-deleted â€” and the student needs access to THIS
//     lesson: a lifetime unit purchase OR an active trial lesson
//     (public.get_my_lesson_access, 0028; replaces the old time-limited
//     gate). The gate is evaluated by calling the RPC
//     get_my_lesson_access(p_lesson_id) with the caller's own JWT; if
//     has_access = false -> access_denied (403). Staff previews skip the
//     gate.
//
// The primary ready video lookup is RLS-scoped as well: the
// lesson_videos SELECT policy (0009) lets staff see all rows and
// students only the READY PRIMARY row of an accessible lesson â€” the
// same filter is applied explicitly here (is_primary + ready +
// not deleted) so BOTH roles resolve exactly one candidate.
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized              -> 401
//   forbidden                 -> 403 (role insufficient / no profile)
//   account_inactive_or_deleted -> 403
//   validation_error          -> 422 (missing/illegal lesson_id)
//   lesson_not_found          -> 404 (staff only)
//   lesson_deleted            -> 422 (staff only; student sees 403)
//   access_denied             -> 403 (student gate: lesson access)
//   video_not_ready           -> 409 (no primary ready video yet)
//   client_ip_unavailable     -> 500 (no cf-connecting-ip / x-forwarded-for)
//   internal_error            -> 500 (query/URL-build failures; raw
//                                  message never echoed)
//
// Success: { playback_url, video_id, lesson_id }.
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';
import { buildPlaybackUrl } from '../_shared/bunny.ts';

export const DEFAULT_TTL_SECONDS = 1200; // 20 minutes
export const STAFF_ROLES: ReadonlySet<string> = new Set(['admin', 'mr_walid']);

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

/**
 * Caller IP as the pull zone sees it: cf-connecting-ip, else the first
 * x-forwarded-for entry. Both are platform-controlled headers in front
 * of the Supabase Edge Runtime.
 */
export function clientIpFromHeaders(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return null;
}

function parseLessonId(searchParams: URLSearchParams):
  | { ok: true; lessonId: string }
  | {
      ok: false;
      message: string;
    } {
  const lessonId = searchParams.get('lesson_id');
  if (typeof lessonId !== 'string' || !UUID_RE.test(lessonId)) {
    return { ok: false, message: 'lesson_id query parameter must be a UUID.' };
  }
  return { ok: true, lessonId };
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

  // Request-scoped client: anon key in the key slot, caller JWT in
  // Authorization. Never a service-role client â€” see header.
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
    console.error('get-video-playback-url: profile query failed', profileError.code ?? 'unknown');
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

  // --- 3) lesson_id query parameter ---
  const parsed = parseLessonId(new URL(req.url).searchParams);
  if (!parsed.ok) {
    return jsonResponse({ error: { code: 'validation_error', message: parsed.message } }, 422);
  }
  const lessonId = parsed.lessonId;

  // --- 4) Lesson reachability (RLS-scoped; see header) ---
  const { data: lesson, error: lessonError } = await client
    .from('lessons')
    .select('id,deleted_at')
    .eq('id', lessonId)
    .maybeSingle();
  if (lessonError) {
    console.error('get-video-playback-url: lesson query failed', lessonError.code ?? 'unknown');
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
    // student: an invisible or soft-deleted lesson is a denied lesson
    return jsonResponse(
      { error: { code: 'access_denied', message: 'Lesson is not accessible.' } },
      403,
    );
  }

  // --- 5) Student lesson-access gate (lifetime purchase OR trial lesson;
  // staff previews skip it) ---
  if (!isStaff) {
    const { data: access, error: accessError } = await client.rpc('get_my_lesson_access', {
      p_lesson_id: lessonId,
    });
    if (accessError) {
      console.error(
        'get-video-playback-url: lesson access check failed',
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

  // --- 6) The PRIMARY READY video (explicit filter; the 0009 policy
  // additionally gates the student branch on can_access_lesson) ---
  const { data: video, error: videoError } = await client
    .from('lesson_videos')
    .select('id,bunny_video_id')
    .eq('lesson_id', lessonId)
    .eq('is_primary', true)
    .eq('status', 'ready')
    .is('deleted_at', null)
    .maybeSingle();
  if (videoError) {
    console.error('get-video-playback-url: video query failed', videoError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to resolve the video.' } },
      500,
    );
  }
  if (!video) {
    return jsonResponse(
      {
        error: {
          code: 'video_not_ready',
          message: 'The primary video for this lesson is not ready yet.',
        },
      },
      409,
    );
  }
  const videoRow = video as { id: string; bunny_video_id: string };

  // --- 7) Short-lived signed HLS URL (IP-locked HS256 directory token) ---
  try {
    const clientIp = deps.getClientIp ? deps.getClientIp(req) : clientIpFromHeaders(req);
    if (!clientIp) {
      console.error('get-video-playback-url: no client IP header available');
      return jsonResponse(
        {
          error: {
            code: 'client_ip_unavailable',
            message: 'Unable to determine the client IP for playback signing.',
          },
        },
        500,
      );
    }
    const { url } = await buildPlaybackUrl({
      hostname: deps.bunnyHostname,
      signingKey: deps.bunnySigningKey,
      videoId: videoRow.bunny_video_id,
      ttlSeconds: deps.ttlSeconds ?? DEFAULT_TTL_SECONDS,
      nowUnix: deps.nowUnix?.(),
      ip: clientIp,
    });
    return jsonResponse(
      {
        playback_url: url,
        video_id: videoRow.id,
        lesson_id: lessonId,
      },
      200,
    );
  } catch (error) {
    console.error('get-video-playback-url: URL build failed', String(error));
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to build the playback URL.' } },
      500,
    );
  }
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
