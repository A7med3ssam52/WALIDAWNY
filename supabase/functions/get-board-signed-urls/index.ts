// =====================================================================
// get-board-signed-urls — Phase 8 | Edge Function | Lesson Boards
// (feature F-11) / ARCHITECTURE.md §8.3 (Supabase Storage) / SECURITY.md
// §7. POST + JWT (config.toml: [functions.get-board-signed-urls]
// verify_jwt = true). Serves the lesson page's board (whiteboard photo)
// gallery for BOTH students and staff (staff preview).
//
// Accepts `lesson_id` ONLY (the client never passes a storage path —
// MED-7); the server resolves the READY, non-deleted boards of the
// lesson and signs each one:
//
//   POST { "lesson_id": "<uuid>" }
//   -> [ { board_id, original_name, sort_order, signed_url }, ... ]
//
// Each `signed_url` is a Supabase Storage short-lived signed URL
// (service-role `createSignedUrl`, TTL 15 minutes) on the PRIVATE
// `boards` bucket — content only ever leaves via this EF.
//
// Access control:
//   * STUDENT: the lesson must be reachable (not soft-deleted) AND the
//     student needs access to THIS lesson (lifetime unit purchase or an
//     active trial lesson — public.get_my_lesson_access, 0028). The gate
//     is evaluated by calling the RPC with the caller's own JWT; if
//     has_access != true -> access_denied (403).
//   * STAFF (admin / mr_walid / teacher): allowed directly (preview).
//   * Any other role -> forbidden (403).
//   * Inactive or soft-deleted accounts are rejected before any access
//     decision (account_inactive_or_deleted).
//
// Only READY, non-deleted rows are returned. Ordering: the response is
// sorted by sort_order ascending; the shared test stub (StubBuilder in
// _test_helpers.ts, out of scope for this module) has no order() chain,
// so the ordering is applied client-side in JS on the fetched rows — the
// response contract is identical to a server-ordered query.
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized              -> 401
//   forbidden                 -> 403 (role insufficient / no profile)
//   account_inactive_or_deleted -> 403
//   invalid_json              -> 400
//   validation_error          -> 422 (missing/illegal lesson_id)
//   access_denied             -> 403 (student gate / lesson visibility)
//   internal_error            -> 500 (query/URL-build failures; raw
//                                  message never echoed)
//
// Success: an array of { board_id, original_name, sort_order,
// signed_url } ([] when the lesson has no ready boards — not an error).
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';

export const DEFAULT_TTL_SECONDS = 900; // 15 minutes
export const BOARDS_BUCKET = 'boards';
export const STAFF_ROLES: ReadonlySet<string> = new Set(['admin', 'mr_walid', 'teacher']);

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
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): Promise<{
        data: { signedUrl: string; path: string } | null;
        error: DbError | null;
      }>;
    };
  };
}

export interface Deps {
  url: string;
  /** Caller-scoped client: anon key in the key slot, caller JWT in Authorization. */
  makeClient: (url: string, jwt: string) => SvcClient;
  /** service-role client (hosted env secret) for storage signing. */
  makeServiceClient: (url: string) => SvcClient;
  ttlSeconds?: number;
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
    makeServiceClient: (url) =>
      createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SvcClient,
  };
}

export function parseLessonId(body: unknown):
  | { ok: true; lessonId: string }
  | {
      ok: false;
      message: string;
    } {
  const lessonId = (body as { lesson_id?: unknown } | null)?.lesson_id;
  if (typeof lessonId !== 'string' || !UUID_RE.test(lessonId)) {
    return { ok: false, message: 'lesson_id must be a UUID.' };
  }
  return { ok: true, lessonId };
}

interface BoardRow {
  id: string;
  storage_path: string;
  original_name: string | null;
  sort_order: number | null;
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
  // Authorization (never a service-role client) — see header.
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
    console.error('get-board-signed-urls: profile query failed', profileError.code ?? 'unknown');
    return jsonResponse({ error: { code: 'forbidden', message: 'Unable to verify caller.' } }, 403);
  }
  const p = profile as { role: string; status: string; deleted_at: string | null } | null;
  if (!p) {
    return jsonResponse(
      { error: { code: 'forbidden', message: 'Caller profile not found.' } },
      403,
    );
  }
  const isStudent = p.role === 'student';
  if (!isStudent && !STAFF_ROLES.has(p.role)) {
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

  // --- 3) lesson_id from the JSON body (never a storage path) ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse(
      { error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } },
      400,
    );
  }
  const parsed = parseLessonId(rawBody);
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
    console.error('get-board-signed-urls: lesson query failed', lessonError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate lesson.' } },
      500,
    );
  }
  const lessonRow = lesson as { id: string; deleted_at: string | null } | null;
  if (!lessonRow || lessonRow.deleted_at !== null) {
    // a student-invisible or soft-deleted lesson is a denied lesson
    return jsonResponse(
      { error: { code: 'access_denied', message: 'Lesson is not accessible.' } },
      403,
    );
  }

  // --- 5) Student lesson-access gate (lifetime purchase OR trial lesson);
  // staff previews skip the gate. ---
  if (isStudent) {
    const { data: access, error: accessError } = await client.rpc('get_my_lesson_access', {
      p_lesson_id: lessonId,
    });
    if (accessError) {
      console.error(
        'get-board-signed-urls: lesson access check failed',
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

  // --- 6) READY, non-deleted boards of the lesson. The response is
  // sorted by sort_order ascending (client-side, see header). ---
  const { data: rows, error: boardsError } = await client
    .from('lesson_boards')
    .select('id,storage_path,original_name,sort_order')
    .eq('lesson_id', lessonId)
    .eq('is_ready', true)
    .is('deleted_at', null);
  if (boardsError) {
    console.error('get-board-signed-urls: boards query failed', boardsError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to resolve the boards.' } },
      500,
    );
  }
  const boards = (rows as BoardRow[] | null) ?? [];
  boards.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // --- 7) Short-lived signed URL on the private bucket (service role) ---
  try {
    const service = deps.makeServiceClient(deps.url);
    const ttl = deps.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const result: Array<{
      board_id: string;
      original_name: string | null;
      sort_order: number | null;
      signed_url: string;
    }> = [];
    for (const row of boards) {
      const { data: signed, error: storageError } = await service.storage
        .from(BOARDS_BUCKET)
        .createSignedUrl(row.storage_path, ttl);
      if (storageError || !signed?.signedUrl) {
        console.error(
          'get-board-signed-urls: createSignedUrl failed',
          storageError?.code ?? 'unknown',
        );
        return jsonResponse(
          { error: { code: 'internal_error', message: 'Failed to build the signed URL.' } },
          500,
        );
      }
      result.push({
        board_id: row.id,
        original_name: row.original_name,
        sort_order: row.sort_order,
        signed_url: signed.signedUrl,
      });
    }
    return jsonResponse(result, 200);
  } catch (error) {
    console.error('get-board-signed-urls: storage signing failed', String(error));
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to build the signed URL.' } },
      500,
    );
  }
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
