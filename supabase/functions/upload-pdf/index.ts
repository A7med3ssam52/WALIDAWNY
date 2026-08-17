// =====================================================================
// upload-pdf — Phase 4 | Edge Function | Function 5
// ARCHITECTURE.md §8.4 row 5 / §8.3 (Supabase Storage) / SECURITY.md
// §7 (EF security model). POST, JWT-verified (config.toml:
// [functions.upload-pdf] verify_jwt = true).
//
// Starts the PDF upload flow for a lesson (ARCHITECTURE.md §8.2):
//   1. validates the request (lesson exists + not soft-deleted, sanitized
//      original filename, optional declared size cap),
//   2. reserves the pending lesson_pdfs row via the staff-guarded
//      SECURITY DEFINER RPC public.create_pdf_upload_record
//      (migrations/0015) — required because 0009 gives lesson_pdfs a
//      SELECT-only policy (staff branch / gated student branch) and
//      FORCE RLS blocks any caller-token INSERT; the wrapper generates
//      the storage_path as '{lesson_id}/{uuid}.pdf' server-side, so the
//      client NEVER supplies a path component (IDOR/path-traversal
//      impossible). lesson_pdfs has no created_by column (0002); the
//      actor is recorded in the audit row.
//   3. issues the short-lived signed upload URL on the private `pdfs`
//      bucket via createSignedUploadUrl (I4 — NOT createSignedUrl,
//      which is download-only) over the CALLER-token client. The
//      0015 pdfs_insert_row_backed storage.objects INSERT policy makes
//      issuance work over the caller token (Storage requires the caller
//      to satisfy an objects INSERT policy at issuance) and binds paths
//      to row-backed, caller-visible paths.
//   4. returns { uploadUrl, pdf_id, storage_path, expires_in }; the
//      client uploads bytes directly to uploadUrl, then calls
//      finalize_pdf_upload(pdf_id) (0007 — already works over the
//      caller token: SECURITY DEFINER + staff guard from request
//      claims, the same mechanism verified for create_codes_for_staff
//      in 0014) which marks is_ready=true and promotes to primary.
//
// File-name/MIME/size policy (pragmatic, per ARCHITECTURE.md §8.2):
//   * The EF validates the ORIGINAL filename: basename only (path
//     separators stripped — '../x.pdf' becomes 'x.pdf'), a strict
//     character allowlist (Arabic/Latin letters, digits, spaces, dots,
//     hyphens, underscores; control chars rejected), max length 255,
//     and a case-insensitive .pdf extension — the extension is the
//     only content hint available BEFORE the bytes exist.
//   * MIME: pinned to application/pdf — the signed upload URL is
//     issued with contentType 'application/pdf' and the row's
//     mime_type default is 'application/pdf' (0002). Detection at
//     finalize time is not needed: the extension gate + pinned
//     content type + row default keep the served metadata truthful.
//   * Size: the platform bucket limit (config.toml storage
//     file_size_limit = 50MiB) is the authoritative cap; the EF
//     additionally accepts an OPTIONAL declared file_size and fails
//     fast with file_too_large when it exceeds 50MiB (client-visible
//     UX; the platform still enforces the real bytes).
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
//                                  non-.pdf extension)
//   file_too_large            -> 422 (declared size > 50MiB)
//   lesson_not_found          -> 404
//   lesson_deleted            -> 422
//   permission_denied         -> 403 (wrapper guard)
//   pdf_reservation_failed    -> 502 (any other wrapper failure; raw
//                                  message never echoed)
//   upload_url_failed         -> 502 (signed-URL issuance failure)
//
// Success: { uploadUrl, pdf_id, storage_path, expires_in }.
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';

export const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024; // 50 MiB (config.toml file_size_limit)
export const MAX_FILE_NAME_LENGTH = 255;
export const PDF_BUCKET = 'pdfs';
export const UPLOAD_URL_TTL_SECONDS = 60; // platform default TTL for signed upload URLs
export const STAFF_ROLES: ReadonlySet<string> = new Set(['admin', 'mr_walid', 'teacher']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Arabic/Latin letters, digits, spaces, dots, hyphens, underscores.
const FILE_NAME_RE = /^[\p{L}\p{N} _.\-]+$/u;
const PDF_EXT_RE = /\.pdf$/i;

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
  lte(column: string, value: unknown): SvcQueryResult;
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

/** Basename + allowlist + length + .pdf extension. Returns the sanitized name. */
export function sanitizeFileName(raw: string):
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
  if (!PDF_EXT_RE.test(name)) {
    return { ok: false, message: 'file_name must end with .pdf.' };
  }
  return { ok: true, name };
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
  const cleaned = sanitizeFileName(typeof record.file_name === 'string' ? record.file_name : '');
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
    if (file_size > MAX_PDF_SIZE_BYTES) {
      return {
        ok: false,
        code: 'file_too_large',
        message: `file_size exceeds ${MAX_PDF_SIZE_BYTES} bytes.`,
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
    console.error('upload-pdf: profile query failed', profileError.code ?? 'unknown');
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
    console.error('upload-pdf: lesson query failed', lessonError.code ?? 'unknown');
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
  const { data: rows, error: rpcError } = await client.rpc('create_pdf_upload_record', {
    p_lesson_id: lessonId,
    p_original_name: fileName,
    p_size_bytes: fileSize ?? null,
  });
  if (rpcError) {
    console.error('upload-pdf: reservation RPC failed', rpcError.code ?? 'unknown');
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
    if (rpcError.code === 'invalid_pdf_size') {
      return jsonResponse(
        {
          error: {
            code: 'file_too_large',
            message: `file_size exceeds ${MAX_PDF_SIZE_BYTES} bytes.`,
          },
        },
        422,
      );
    }
    return jsonResponse(
      { error: { code: 'pdf_reservation_failed', message: 'Failed to reserve the upload.' } },
      502,
    );
  }
  const row = (Array.isArray(rows) ? rows[0] : null) as { id: string; storage_path: string } | null;
  if (!row?.id || !row.storage_path) {
    console.error('upload-pdf: reservation returned no row');
    return jsonResponse(
      { error: { code: 'pdf_reservation_failed', message: 'Failed to reserve the upload.' } },
      502,
    );
  }

  // --- 6) Short-lived signed upload URL (I4) on the pdfs bucket. The
  // 0015 pdfs_insert_row_backed storage.objects INSERT policy is what
  // lets the caller-token issuance succeed. ---
  const { data: signed, error: storageError } = await client.storage
    .from(PDF_BUCKET)
    .createSignedUploadUrl(row.storage_path, { contentType: 'application/pdf' });
  if (storageError || !signed?.signedUrl) {
    console.error('upload-pdf: createSignedUploadUrl failed', storageError?.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'upload_url_failed', message: 'Failed to create the upload URL.' } },
      502,
    );
  }

  return jsonResponse(
    {
      uploadUrl: signed.signedUrl,
      pdf_id: row.id,
      storage_path: row.storage_path,
      expires_in: UPLOAD_URL_TTL_SECONDS,
    },
    200,
  );
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
