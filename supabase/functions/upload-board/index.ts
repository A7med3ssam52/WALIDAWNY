// =====================================================================
// upload-board — Phase 8 | Edge Function | Lesson Boards (feature F-11)
// ARCHITECTURE.md §8.3 (Supabase Storage) / SECURITY.md §7 (EF security
// model). POST, JWT-verified (config.toml: [functions.upload-board]
// verify_jwt = true).
//
// Starts the lesson-board (whiteboard photo) upload flow:
//   1. validates the request (lesson exists + not soft-deleted, sanitized
//      original filename, optional declared size cap),
//   2. reserves the pending lesson_boards row via the staff-guarded
//      SECURITY DEFINER RPC public.create_board_upload_record
//      (migrations/0036) — required because the lesson_boards RLS
//      policies are SELECT-only + FORCE RLS blocks any caller-token
//      INSERT; the wrapper generates the storage_path server-side as
//      '{lesson_id}/{uuid}.{ext}', so the client NEVER supplies a path
//      component (IDOR/path-traversal impossible),
//   3. issues the short-lived signed upload URL on the private `boards`
//      bucket via createSignedUploadUrl (I4 — NOT createSignedUrl,
//      which is download-only) over the CALLER-token client,
//   4. returns { uploadUrl, board_id, storage_path, expires_in }; the
//      client uploads bytes directly to uploadUrl, then calls
//      finalize_board_upload(board_id) (0036) which marks is_ready=true.
//
// File-name/MIME/size policy (pragmatic, per the PDF pattern):
//   * The EF validates the ORIGINAL filename: basename only (path
//     separators stripped — '../x.jpg' becomes 'x.jpg'), a strict
//     character allowlist (Arabic/Latin letters, digits, spaces, dots,
//     hyphens, underscores; control chars rejected), max length 255,
//     and a case-insensitive .jpg/.jpeg/.png/.webp extension — the
//     extension is the only content hint available BEFORE the bytes
//     exist.
//   * MIME: derived from the sanitized file name (jpg/jpeg ->
//     image/jpeg, png -> image/png, webp -> image/webp) and pinned on
//     the signed upload URL.
//   * Size: the platform bucket limit (config.toml
//     [storage.buckets.boards] file_size_limit = 10MiB) is the
//     authoritative cap; the EF additionally accepts an OPTIONAL
//     declared file_size and fails fast with file_too_large when it
//     exceeds 10MiB (client-visible UX; the platform still enforces the
//     real bytes).
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
//   validation_error          -> 422 (bad lesson_id / bad file_size)
//   invalid_file_name         -> 422 (missing/illegal chars/too long/
//                                  non-image extension)
//   file_too_large            -> 422 (declared size > 10MiB)
//   lesson_not_found          -> 404
//   lesson_deleted            -> 422
//   permission_denied         -> 403 (wrapper guard)
//   board_reservation_failed  -> 502 (any other wrapper failure; raw
//                                  message never echoed)
//   upload_url_failed         -> 502 (signed-URL issuance failure)
//
// Success: { uploadUrl, board_id, storage_path, expires_in }.
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';

export const MAX_BOARD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB (config.toml file_size_limit)
export const MAX_FILE_NAME_LENGTH = 255;
export const BOARDS_BUCKET = 'boards';
export const UPLOAD_URL_TTL_SECONDS = 60; // platform default TTL for signed upload URLs
export const STAFF_ROLES: ReadonlySet<string> = new Set(['admin', 'mr_walid', 'teacher']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Arabic/Latin letters, digits, spaces, dots, hyphens, underscores.
const FILE_NAME_RE = /^[\p{L}\p{N} _.\-]+$/u;
const IMAGE_EXT_RE = /\.(jpe?g|png|webp)$/i;

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

export interface SvcStorageFrom {
  createSignedUploadUrl(
    path: string,
    options?: { contentType?: string },
  ): Promise<{
    data: { signedUrl: string; path: string; token: string } | null;
    error: DbError | null;
  }>;
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
    from(bucket: string): SvcStorageFrom;
  };
}

export interface Deps {
  url: string;
  /** Caller-scoped client: anon key in the key slot, caller JWT in Authorization. */
  makeClient: (url: string, jwt: string) => SvcClient;
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
  };
}

interface UploadBody {
  lesson_id: string;
  file_name: string;
  file_size?: number;
}

/** Basename + allowlist + length + image extension. Returns the sanitized name. */
export function sanitizeImageFileName(raw: string):
  | { ok: true; name: string }
  | {
      ok: false;
      message: string;
    } {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, message: 'file_name is required.' };
  }
  // Strip path separators (both / and \) so traversal is impossible.
  const segments = raw.split(/[\\/]+/);
  const name = segments[segments.length - 1].trim();
  if (name === '') {
    return { ok: false, message: 'file_name must not be empty.' };
  }
  // Control characters must be rejected without a control-char regex
  // (deno lint no-control-regex); a manual scan is equivalent and clear.
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
  if (!IMAGE_EXT_RE.test(name)) {
    return { ok: false, message: 'file_name must end with .jpg, .jpeg, .png or .webp.' };
  }
  return { ok: true, name };
}

/**
 * Content type derived from the (already validated) image file name:
 * jpg/jpeg -> image/jpeg, png -> image/png, webp -> image/webp.
 */
export function imageContentType(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg'; // jpg / jpeg (or an unreachable fallback)
}

function parseUploadBody(raw: unknown):
  | { ok: true; body: UploadBody }
  | {
      ok: false;
      code: string;
      message: string;
    } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, code: 'validation_error', message: 'Request body must be a JSON object.' };
  }
  const record = raw as Record<string, unknown>;

  if (typeof record.lesson_id !== 'string' || !UUID_RE.test(record.lesson_id)) {
    return { ok: false, code: 'validation_error', message: 'lesson_id must be a UUID.' };
  }
  const cleaned = sanitizeImageFileName(
    typeof record.file_name === 'string' ? record.file_name : '',
  );
  if (!cleaned.ok) {
    return { ok: false, code: 'invalid_file_name', message: cleaned.message };
  }

  let file_size: number | undefined;
  if (record.file_size !== undefined && record.file_size !== null) {
    if (
      typeof record.file_size !== 'number' ||
      !Number.isInteger(record.file_size) ||
      record.file_size < 0
    ) {
      return {
        ok: false,
        code: 'validation_error',
        message: 'file_size must be a non-negative integer.',
      };
    }
    file_size = record.file_size;
    if (file_size > MAX_BOARD_SIZE_BYTES) {
      return {
        ok: false,
        code: 'file_too_large',
        message: `file_size exceeds ${MAX_BOARD_SIZE_BYTES} bytes.`,
      };
    }
  }

  return { ok: true, body: { lesson_id: record.lesson_id, file_name: cleaned.name, file_size } };
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
    console.error('upload-board: profile query failed', profileError.code ?? 'unknown');
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

  // --- 3) Body validation (lesson_id, sanitized file_name, declared size) ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse(
      { error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } },
      400,
    );
  }
  const parsed = parseUploadBody(rawBody);
  if (!parsed.ok) {
    return jsonResponse({ error: { code: parsed.code, message: parsed.message } }, 422);
  }
  const { lesson_id: lessonId, file_name: fileName, file_size: fileSize } = parsed.body;

  // --- 4) Lesson must exist and must not be soft-deleted ---
  const { data: lesson, error: lessonError } = await client
    .from('lessons')
    .select('id,deleted_at')
    .eq('id', lessonId)
    .maybeSingle();
  if (lessonError) {
    console.error('upload-board: lesson query failed', lessonError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate lesson.' } },
      500,
    );
  }
  if (!lesson) {
    return jsonResponse({ error: { code: 'lesson_not_found', message: 'Lesson not found.' } }, 404);
  }
  if ((lesson as { deleted_at: string | null }).deleted_at !== null) {
    return jsonResponse(
      { error: { code: 'lesson_deleted', message: 'Lesson is soft-deleted.' } },
      422,
    );
  }

  // --- 5) Reserve the pending row through the staff-guarded wrapper ---
  const { data: rows, error: rpcError } = await client.rpc('create_board_upload_record', {
    p_lesson_id: lessonId,
    p_original_name: fileName,
    p_size_bytes: fileSize ?? null,
  });
  if (rpcError) {
    console.error('upload-board: reservation RPC failed', rpcError.code ?? 'unknown');
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
    if (rpcError.code === 'invalid_board_size') {
      return jsonResponse(
        {
          error: {
            code: 'file_too_large',
            message: `file_size exceeds ${MAX_BOARD_SIZE_BYTES} bytes.`,
          },
        },
        422,
      );
    }
    if (rpcError.code === 'invalid_file_extension') {
      return jsonResponse(
        { error: { code: 'invalid_file_name', message: 'Unsupported image type.' } },
        422,
      );
    }
    return jsonResponse(
      { error: { code: 'board_reservation_failed', message: 'Failed to reserve the upload.' } },
      502,
    );
  }
  const row = (Array.isArray(rows) ? rows[0] : null) as
    | { id: string; storage_path: string }
    | null;
  if (!row?.id || !row.storage_path) {
    console.error('upload-board: reservation returned no row');
    return jsonResponse(
      { error: { code: 'board_reservation_failed', message: 'Failed to reserve the upload.' } },
      502,
    );
  }

  // --- 6) Short-lived signed upload URL (I4) on the boards bucket. The
  // content type is derived from the validated original file name and
  // pinned on the upload URL so the served metadata stays truthful. ---
  const contentType = imageContentType(fileName);
  const { data: signed, error: storageError } = await client.storage
    .from(BOARDS_BUCKET)
    .createSignedUploadUrl(row.storage_path, { contentType });
  if (storageError || !signed?.signedUrl) {
    console.error('upload-board: createSignedUploadUrl failed', storageError?.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'upload_url_failed', message: 'Failed to create the upload URL.' } },
      502,
    );
  }

  return jsonResponse(
    {
      uploadUrl: signed.signedUrl,
      board_id: row.id,
      storage_path: row.storage_path,
      expires_in: UPLOAD_URL_TTL_SECONDS,
    },
    200,
  );
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
