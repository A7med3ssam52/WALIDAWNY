// =====================================================================
// create-video-upload-session — Phase 5 | Edge Function | Function 1
// ARCHITECTURE.md §8.4 row 1 / §7.2 (Bunny video pipeline) / SECURITY.md
// §7 (EF security model). POST, JWT-verified (config.toml:
// [functions.create-video-upload-session] verify_jwt = true).
//
// Two actions, selected by the body field `action`:
//
//   action = "create" | "replace" (default; `mode` kept as alias):
//   starts a Bunny Stream upload session for a lesson:
//     1. validates the request: lesson exists + not soft-deleted, mode
//        'create' | 'replace', old_video_id required for replace (must be
//        a ready video of the SAME lesson), optional sanitized file_name
//        (becomes the video title when present; otherwise the lesson title
//        is used) — all pre-checked over the caller token,
//     2. enforces the Phase 1 orphan rule: at most one pending_upload row
//        per lesson (lesson_has_pending_upload),
//     3. creates the video object on Bunny: POST
//        https://video.bunnycdn.com/library/{libraryId}/videos with the
//        AccessKey header, body { title } (verified against
//        docs.bunny.net/stream/tus-resumable-uploads),
//     4. reserves the pending lesson_videos row via the staff-guarded
//        SECURITY DEFINER RPC public.create_video_upload_record
//        (migrations/0016) — required because 0009 gives lesson_videos a
//        SELECT-only policy + FORCE RLS, so a caller-token INSERT is
//        blocked; the wrapper re-validates every rule atomically (the
//        authoritative backstop),
//     5. on wrapper failure the freshly created Bunny video is deleted
//        best-effort (no orphan objects on the library),
//     6. computes the TUS upload headers (AuthorizationSignature =
//        SHA-256 hex of libraryId+apiKey+expire+videoId — verified docs)
//        and returns { video_id, bunny_video_id, upload_url,
//        tus_headers, metadata, expires_in }; the client then uploads
//        bytes via TUS to upload_url and Bunny fires the
//        bunny-video-webhook on progress/finish.
//
//   action = "cancel":
//   releases an abandoned/cancelled upload session so the lesson can
//   start a new one (an aborted TUS upload never fires a webhook and
//   recheck-video-states treats Bunny status 0 as a no-op, so without
//   this the pending row would block the lesson forever — Phase 5
//   review MED-2):
//     1. the video row must exist, belong to the lesson and still be
//        'pending_upload' (video_not_found / wrong_lesson /
//        video_not_pending),
//     2. the row is hard-deleted through the staff-guarded SECURITY
//        DEFINER RPC public.delete_video_upload_record
//        (migrations/0017; the only lesson_videos delete surface) —
//        authoritative backstop, audited,
//     3. the Bunny video object is deleted best-effort (an orphaned
//        object without a row is invisible to the app but occupies
//        library storage),
//     4. returns { released: true, video_id }.
//
// Actor plumbing: request-scoped client with the anon key in the key slot
// and the caller's JWT in Authorization — never a
// service-role client (Phase 3 pattern, 0014).
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized              -> 401
//   forbidden                 -> 403 (role insufficient / no profile)
//   account_inactive_or_deleted -> 403
//   invalid_json              -> 400
//   validation_error          -> 422 (bad lesson_id / mode / action /
//                                  video_id / file_name / old_video)
//   invalid_file_name         -> 422 (missing/illegal chars/too long)
//   lesson_not_found          -> 404
//   lesson_deleted            -> 422
//   old_video_not_found       -> 404
//   wrong_lesson              -> 422 (old/video row of another lesson)
//   lesson_has_pending_upload -> 422 (orphan rule)
//   video_not_found           -> 404 (cancel target unknown/deleted)
//   video_not_pending         -> 409 (cancel target already advanced)
//   permission_denied         -> 403 (wrapper guard)
//   bunny_create_failed       -> 502 (Bunny create-video call failed)
//   session_reservation_failed -> 502 (create/reserve wrapper failure;
//                                  raw message never echoed)
//   session_cancel_failed     -> 502 (cancel wrapper failure)
//
// Success (create/replace): { video_id, bunny_video_id, upload_url,
// tus_headers, metadata, expires_in }.
// Success (cancel): { released: true, video_id }.
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';
import {
  BUNNY_API_TIMEOUT_MS,
  BUNNY_LIBRARY_API_BASE,
  BUNNY_TUS_ENDPOINT,
  tusAuthorizationSignature,
} from '../_shared/bunny.ts';

export const TUS_SIGNATURE_TTL_SECONDS = 86400; // 24 hour upload window
export const MAX_FILE_NAME_LENGTH = 255;
export const STAFF_ROLES: ReadonlySet<string> = new Set(['admin', 'mr_walid', 'teacher']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Arabic/Latin letters, digits, spaces, dots, hyphens, underscores.
const FILE_NAME_RE = /^[\p{L}\p{N} _.\-]+$/u;

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
  bunnyApiKey: string;
  bunnyLibraryId: string;
  /** Creates the video object on Bunny; resolves null on any failure. */
  bunnyCreateVideo: (title: string) => Promise<{ guid: string } | null>;
  /** Best-effort cleanup of a Bunny video object; must not throw. */
  bunnyDeleteVideo: (guid: string) => Promise<void>;
  /** Unix seconds (injectable for deterministic signature vectors). */
  nowUnix: () => number;
}

/** Default dependency wiring: env-driven clients (hosted Edge Runtime / local serve). */
export function defaultDeps(): Deps {
  const apiKey = Deno.env.get('BUNNY_API_KEY') ?? '';
  const libraryId = Deno.env.get('BUNNY_LIBRARY_ID') ?? '';
  return {
    url: Deno.env.get('SUPABASE_URL') ?? '',
    makeClient: (url, jwt) =>
      createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SvcClient,
    bunnyApiKey: apiKey,
    bunnyLibraryId: libraryId,
    bunnyCreateVideo: async (title: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), BUNNY_API_TIMEOUT_MS);
      try {
        const res = await fetch(`${BUNNY_LIBRARY_API_BASE}/${libraryId}/videos`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            AccessKey: apiKey,
          },
          body: JSON.stringify({ title }),
          signal: controller.signal,
        });
        if (!res.ok) {
          console.error('create-video-upload-session: bunny create-video failed', res.status);
          return null;
        }
        const body = (await res.json()) as { guid?: string };
        return body.guid ? { guid: body.guid } : null;
      } catch (error) {
        console.error('create-video-upload-session: bunny create-video error', String(error));
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
    bunnyDeleteVideo: async (guid: string) => {
      try {
        await fetch(`${BUNNY_LIBRARY_API_BASE}/${libraryId}/videos/${guid}`, {
          method: 'DELETE',
          headers: { Accept: 'application/json', AccessKey: apiKey },
        });
      } catch (error) {
        console.error('create-video-upload-session: bunny cleanup failed', String(error));
      }
    },
    nowUnix: () => Math.floor(Date.now() / 1000),
  };
}

export interface SessionBody {
  action: 'create' | 'replace' | 'cancel';
  lesson_id: string;
  old_video_id: string | null;
  file_name: string | null;
  video_id: string | null;
}

/** Filetype declared in Upload-Metadata, derived from the file extension. */
export function detectVideoFileType(fileName: string | null): string {
  const name = fileName ?? '';
  if (/\.webm$/i.test(name)) return 'video/webm';
  if (/\.mov$/i.test(name)) return 'video/quicktime';
  return 'video/mp4';
}

/** Basename + allowlist + length (no extension requirement — it is a TITLE). */
export function sanitizeTitle(raw: string):
  | { ok: true; title: string }
  | {
      ok: false;
      message: string;
    } {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, message: 'file_name is required.' };
  }
  const segments = raw.split(/[\\/]+/);
  const name = segments[segments.length - 1].trim();
  if (name === '') {
    return { ok: false, message: 'file_name must not be empty.' };
  }
  for (let i = 0; i < name.length; i += 1) {
    const code = name.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return { ok: false, message: 'file_name contains control characters.' };
    }
  }
  if (!FILE_NAME_RE.test(name)) {
    return { ok: false, message: 'file_name contains unsupported characters.' };
  }
  if (name.length > MAX_FILE_NAME_LENGTH) {
    return { ok: false, message: `file_name exceeds ${MAX_FILE_NAME_LENGTH} characters.` };
  }
  return { ok: true, title: name };
}

export function parseSessionBody(raw: unknown):
  | { ok: true; body: SessionBody }
  | {
      ok: false;
      code: string;
      message: string;
    } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, code: 'validation_error', message: 'Request body must be a JSON object.' };
  }
  const record = raw as Record<string, unknown>;

  if (record.action === 'cancel') {
    if (typeof record.lesson_id !== 'string' || !UUID_RE.test(record.lesson_id)) {
      return { ok: false, code: 'validation_error', message: 'lesson_id must be a UUID.' };
    }
    if (typeof record.video_id !== 'string' || !UUID_RE.test(record.video_id)) {
      return {
        ok: false,
        code: 'validation_error',
        message: 'video_id must be a UUID in cancel action.',
      };
    }
    return {
      ok: true,
      body: {
        action: 'cancel',
        lesson_id: record.lesson_id,
        old_video_id: null,
        file_name: null,
        video_id: record.video_id,
      },
    };
  }

  if (typeof record.lesson_id !== 'string' || !UUID_RE.test(record.lesson_id)) {
    return { ok: false, code: 'validation_error', message: 'lesson_id must be a UUID.' };
  }
  const mode = record.mode ?? record.action;
  if (mode !== 'create' && mode !== 'replace') {
    return { ok: false, code: 'validation_error', message: "mode must be 'create' or 'replace'." };
  }
  if (mode === 'replace') {
    if (typeof record.old_video_id !== 'string' || !UUID_RE.test(record.old_video_id)) {
      return {
        ok: false,
        code: 'validation_error',
        message: 'old_video_id must be a UUID in replace mode.',
      };
    }
  } else if (record.old_video_id !== undefined && record.old_video_id !== null) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'old_video_id is only allowed in replace mode.',
    };
  }

  let file_name: string | null = null;
  if (record.file_name !== undefined && record.file_name !== null) {
    if (typeof record.file_name !== 'string') {
      return { ok: false, code: 'validation_error', message: 'file_name must be a string.' };
    }
    const cleaned = sanitizeTitle(record.file_name);
    if (!cleaned.ok) {
      return { ok: false, code: 'invalid_file_name', message: cleaned.message };
    }
    file_name = cleaned.title;
  }

  return {
    ok: true,
    body: {
      action: mode,
      lesson_id: record.lesson_id,
      old_video_id: mode === 'replace' ? (record.old_video_id as string) : null,
      file_name,
      video_id: null,
    },
  };
}

export async function handle(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  if (req.method === 'OPTIONS') return preflightResponse();
  if (req.method !== 'POST') {
    return jsonResponse({ error: { code: 'method_not_allowed', message: 'POST required.' } }, 405);
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
  // Authorization. Never a service-role client — see header.
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
    console.error(
      'create-video-upload-session: profile query failed',
      profileError.code ?? 'unknown',
    );
    return jsonResponse({ error: { code: 'forbidden', message: 'Unable to verify caller.' } }, 403);
  }
  const p = profile as { role: string; status: string; deleted_at: string | null } | null;
  if (!p) {
    return jsonResponse(
      { error: { code: 'forbidden', message: 'Caller profile not found.' } },
      403,
    );
  }
  if (!STAFF_ROLES.has(p.role)) {
    return jsonResponse({ error: { code: 'forbidden', message: 'Insufficient privileges.' } }, 403);
  }
  if (p.status !== 'active' || p.deleted_at !== null) {
    return jsonResponse(
      {
        error: { code: 'account_inactive_or_deleted', message: 'Account is disabled or deleted.' },
      },
      403,
    );
  }

  // --- 3) Body validation ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse(
      { error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } },
      400,
    );
  }
  const parsed = parseSessionBody(rawBody);
  if (!parsed.ok) {
    return jsonResponse({ error: { code: parsed.code, message: parsed.message } }, 422);
  }
  const {
    lesson_id: lessonId,
    action,
    old_video_id: oldVideoId,
    file_name: fileName,
    video_id: videoId,
  } = parsed.body;
  const mode = action; // 'create' | 'replace' here (cancel branched below)

  // --- 4) Lesson must exist and must not be soft-deleted ---
  const { data: lesson, error: lessonError } = await client
    .from('lessons')
    .select('id,title,deleted_at')
    .eq('id', lessonId)
    .maybeSingle();
  if (lessonError) {
    console.error(
      'create-video-upload-session: lesson query failed',
      lessonError.code ?? 'unknown',
    );
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate lesson.' } },
      500,
    );
  }
  if (!lesson) {
    return jsonResponse({ error: { code: 'lesson_not_found', message: 'Lesson not found.' } }, 404);
  }
  const lessonRow = lesson as { id: string; title: string | null; deleted_at: string | null };
  if (lessonRow.deleted_at !== null) {
    return jsonResponse(
      { error: { code: 'lesson_deleted', message: 'Lesson is soft-deleted.' } },
      422,
    );
  }

  // --- 4a) CANCEL action: release an abandoned upload session. An aborted
  // TUS upload never fires a webhook and recheck-video-states treats Bunny
  // status 0 (queued) as a no-op, so without this the pending row would
  // permanently lock the lesson (orphan rule). Pre-checks over the caller
  // token; the 0017 wrapper re-validates atomically (authoritative). ---
  if (action === 'cancel') {
    const { data: video, error: vError } = await client
      .from('lesson_videos')
      .select('id,lesson_id,status,deleted_at,bunny_video_id')
      .eq('id', videoId)
      .maybeSingle();
    if (vError) {
      console.error(
        'create-video-upload-session: cancel video query failed',
        vError.code ?? 'unknown',
      );
      return jsonResponse(
        { error: { code: 'internal_error', message: 'Failed to validate the upload session.' } },
        500,
      );
    }
    const v = video as {
      lesson_id: string;
      status: string;
      deleted_at: string | null;
      bunny_video_id: string;
    } | null;
    if (!v || v.deleted_at !== null) {
      return jsonResponse(
        { error: { code: 'video_not_found', message: 'Upload session not found.' } },
        404,
      );
    }
    if (v.lesson_id !== lessonId) {
      return jsonResponse(
        { error: { code: 'wrong_lesson', message: 'Upload session belongs to another lesson.' } },
        422,
      );
    }
    if (v.status !== 'pending_upload') {
      return jsonResponse(
        {
          error: {
            code: 'video_not_pending',
            message: 'This upload session is no longer pending.',
          },
        },
        409,
      );
    }
    const { error: relError } = await client.rpc('delete_video_upload_record', {
      p_lesson_id: lessonId,
      p_video_id: videoId,
    });
    if (relError) {
      console.error('create-video-upload-session: release RPC failed', relError.code ?? 'unknown');
      if (relError.code === 'permission_denied') {
        return jsonResponse(
          { error: { code: 'permission_denied', message: 'Insufficient privileges.' } },
          403,
        );
      }
      if (relError.code === 'video_not_found') {
        return jsonResponse(
          { error: { code: 'video_not_found', message: 'Upload session not found.' } },
          404,
        );
      }
      if (relError.code === 'wrong_lesson') {
        return jsonResponse(
          { error: { code: 'wrong_lesson', message: 'Upload session belongs to another lesson.' } },
          422,
        );
      }
      if (relError.code === 'video_not_pending') {
        return jsonResponse(
          {
            error: {
              code: 'video_not_pending',
              message: 'This upload session is no longer pending.',
            },
          },
          409,
        );
      }
      return jsonResponse(
        {
          error: {
            code: 'session_cancel_failed',
            message: 'Failed to release the upload session.',
          },
        },
        502,
      );
    }
    // row released first; the Bunny object is cleaned up best-effort
    // (an orphaned object without a row is invisible to the app)
    await deps.bunnyDeleteVideo(v.bunny_video_id);
    return jsonResponse({ released: true, video_id: videoId }, 200);
  }

  // --- 5) Orphan rule (Phase 1): at most one pending upload per lesson.
  // Pre-checked here for UX; the 0016 wrapper re-enforces it atomically. ---
  const { count: pendingCount, error: pendingError } = await client
    .from('lesson_videos')
    .select('id', { count: 'exact', head: true })
    .eq('lesson_id', lessonId)
    .eq('status', 'pending_upload');
  if (pendingError) {
    console.error(
      'create-video-upload-session: pending-count failed',
      pendingError.code ?? 'unknown',
    );
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate upload state.' } },
      500,
    );
  }
  if ((pendingCount ?? 0) > 0) {
    return jsonResponse(
      {
        error: {
          code: 'lesson_has_pending_upload',
          message: 'This lesson already has a pending upload.',
        },
      },
      422,
    );
  }

  // --- 6) Replace mode: old video must be a ready video of this lesson ---
  if (mode === 'replace') {
    const { data: oldVideo, error: oldError } = await client
      .from('lesson_videos')
      .select('id,lesson_id,status,deleted_at')
      .eq('id', oldVideoId)
      .maybeSingle();
    if (oldError) {
      console.error(
        'create-video-upload-session: old-video query failed',
        oldError.code ?? 'unknown',
      );
      return jsonResponse(
        { error: { code: 'internal_error', message: 'Failed to validate the old video.' } },
        500,
      );
    }
    if (!oldVideo || (oldVideo as { deleted_at: string | null }).deleted_at !== null) {
      return jsonResponse(
        { error: { code: 'old_video_not_found', message: 'Old video not found.' } },
        404,
      );
    }
    if ((oldVideo as { lesson_id: string }).lesson_id !== lessonId) {
      return jsonResponse(
        { error: { code: 'wrong_lesson', message: 'Old video belongs to another lesson.' } },
        422,
      );
    }
    if ((oldVideo as { status: string }).status !== 'ready') {
      return jsonResponse(
        {
          error: { code: 'validation_error', message: 'Only a ready video can be replaced.' },
        },
        422,
      );
    }
  }

  // --- 7) Create the video object on Bunny (title = file_name or lesson title) ---
  const title = fileName ?? lessonRow.title ?? 'Lesson video';
  const created = await deps.bunnyCreateVideo(title);
  if (!created) {
    return jsonResponse(
      { error: { code: 'bunny_create_failed', message: 'Failed to create the video on Bunny.' } },
      502,
    );
  }

  // --- 8) Reserve the pending row through the staff-guarded wrapper.
  // On failure the freshly created Bunny object is cleaned up
  // best-effort so no orphan accumulates on the library. ---
  const { data: rows, error: rpcError } = await client.rpc('create_video_upload_record', {
    p_lesson_id: lessonId,
    p_bunny_video_id: created.guid,
    p_bunny_library_id: deps.bunnyLibraryId,
    p_title: title,
    p_mode: mode,
    p_old_video_id: oldVideoId ?? null,
  });
  if (rpcError) {
    console.error(
      'create-video-upload-session: reservation RPC failed',
      rpcError.code ?? 'unknown',
    );
    await deps.bunnyDeleteVideo(created.guid);
    if (rpcError.code === 'permission_denied') {
      return jsonResponse(
        { error: { code: 'permission_denied', message: 'Insufficient privileges.' } },
        403,
      );
    }
    if (rpcError.code === 'lesson_not_found') {
      return jsonResponse(
        { error: { code: 'lesson_not_found', message: 'Lesson not found.' } },
        404,
      );
    }
    if (rpcError.code === 'lesson_deleted') {
      return jsonResponse(
        { error: { code: 'lesson_deleted', message: 'Lesson is soft-deleted.' } },
        422,
      );
    }
    if (rpcError.code === 'lesson_has_pending_upload') {
      return jsonResponse(
        {
          error: {
            code: 'lesson_has_pending_upload',
            message: 'This lesson already has a pending upload.',
          },
        },
        422,
      );
    }
    if (rpcError.code === 'old_video_not_found') {
      return jsonResponse(
        { error: { code: 'old_video_not_found', message: 'Old video not found.' } },
        404,
      );
    }
    if (rpcError.code === 'wrong_lesson') {
      return jsonResponse(
        { error: { code: 'wrong_lesson', message: 'Old video belongs to another lesson.' } },
        422,
      );
    }
    if (rpcError.code === 'old_video_not_ready') {
      return jsonResponse(
        {
          error: { code: 'validation_error', message: 'Only a ready video can be replaced.' },
        },
        422,
      );
    }
    return jsonResponse(
      {
        error: {
          code: 'session_reservation_failed',
          message: 'Failed to reserve the upload session.',
        },
      },
      502,
    );
  }
  const row = (Array.isArray(rows) ? rows[0] : null) as { id: string; is_primary: boolean } | null;
  if (!row?.id) {
    console.error('create-video-upload-session: reservation returned no row');
    await deps.bunnyDeleteVideo(created.guid);
    return jsonResponse(
      {
        error: {
          code: 'session_reservation_failed',
          message: 'Failed to reserve the upload session.',
        },
      },
      502,
    );
  }

  // --- 9) TUS upload credentials (SHA-256 hex — docs-bunny formula) ---
  const expire = deps.nowUnix() + TUS_SIGNATURE_TTL_SECONDS;
  const signature = await tusAuthorizationSignature(
    deps.bunnyLibraryId,
    deps.bunnyApiKey,
    expire,
    created.guid,
  );

  return jsonResponse(
    {
      video_id: row.id,
      bunny_video_id: created.guid,
      upload_url: BUNNY_TUS_ENDPOINT,
      tus_headers: {
        AuthorizationSignature: signature,
        AuthorizationExpire: expire,
        LibraryId: deps.bunnyLibraryId,
        VideoId: created.guid,
      },
      metadata: {
        filetype: detectVideoFileType(fileName),
        title,
      },
      expires_in: TUS_SIGNATURE_TTL_SECONDS,
    },
    200,
  );
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
