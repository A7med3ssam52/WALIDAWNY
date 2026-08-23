// =====================================================================
// upload-exam-image — Phase 12 | Edge Function | Exam Question Images
// POST, JWT-verified (config.toml: [functions.upload-exam-image]
// verify_jwt = true).
//
// Starts the exam image upload flow for a specific exam:
//   1. validates the request (exam exists + not soft-deleted, sanitized
//      original filename, optional declared size cap),
//   2. checks the caller is staff (admin / mr_walid / teacher) + active,
//   3. generates storage_path server-side as '{exam_id}/{uuid}.{ext}'
//      (client NEVER supplies a path component),
//   4. issues short-lived signed upload URL on the private `exam-images`
//      bucket via service-role createSignedUploadUrl,
//   5. returns { uploadUrl, storage_path, exam_id }.
//   The client uploads bytes directly to uploadUrl, then stores
//   storage_path in exam_questions.prompt_image_path or
//   exam_questions.choice_image_paths via the normal question DML
//   (staff RLS on exam_questions).
//
// File-name/MIME/size policy mirrors upload-board:
//   * original filename: basename only, Arabic/Latin letters, digits,
//     spaces, dots, hyphens, underscores, max 255, .jpg/.jpeg/.png/.webp
//   * MIME derived from extension and pinned on signed upload URL
//   * Size: bucket limit 5MiB (config.toml), EF fails fast if declared
//     file_size > 5MiB
//
// Actor plumbing: caller-scoped client for auth/DB checks, service-role
// client for storage signing (bypasses RLS — exam-images has no row-backed
// INSERT policy).
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized, forbidden, account_inactive_or_deleted, invalid_json,
//   validation_error, invalid_file_name, file_too_large, exam_not_found,
//   exam_deleted, upload_url_failed
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';

export const MAX_EXAM_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const MAX_FILE_NAME_LENGTH = 255;
export const EXAM_IMAGES_BUCKET = 'exam-images';
export const STAFF_ROLES: ReadonlySet<string> = new Set(['admin', 'mr_walid', 'teacher']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  makeClient: (url: string, jwt: string) => SvcClient;
  makeServiceClient: (url: string) => SvcClient;
}

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

interface UploadBody {
  exam_id: string;
  file_name: string;
  file_size?: number;
}

export function sanitizeImageFileName(raw: string):
  | { ok: true; name: string }
  | { ok: false; message: string } {
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
  if (!IMAGE_EXT_RE.test(name)) {
    return { ok: false, message: 'file_name must end with .jpg, .jpeg, .png or .webp.' };
  }
  return { ok: true, name };
}

export function imageContentType(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function parseUploadBody(raw: unknown):
  | { ok: true; body: UploadBody }
  | { ok: false; code: string; message: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, code: 'validation_error', message: 'Request body must be a JSON object.' };
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.exam_id !== 'string' || !UUID_RE.test(record.exam_id)) {
    return { ok: false, code: 'validation_error', message: 'exam_id must be a UUID.' };
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
    if (file_size > MAX_EXAM_IMAGE_SIZE_BYTES) {
      return {
        ok: false,
        code: 'file_too_large',
        message: `file_size exceeds ${MAX_EXAM_IMAGE_SIZE_BYTES} bytes.`,
      };
    }
  }
  return { ok: true, body: { exam_id: record.exam_id, file_name: cleaned.name, file_size } };
}

export async function handle(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  if (req.method === 'OPTIONS') return preflightResponse();
  if (req.method !== 'POST') {
    return jsonResponse({ error: { code: 'method_not_allowed', message: 'POST required.' } }, 405);
  }

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

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role,status,deleted_at')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('upload-exam-image: profile query failed', profileError.code ?? 'unknown');
    return jsonResponse({ error: { code: 'forbidden', message: 'Unable to verify caller.' } }, 403);
  }
  const p = profile as { role: string; status: string; deleted_at: string | null } | null;
  if (!p) {
    return jsonResponse({ error: { code: 'forbidden', message: 'Caller profile not found.' } }, 403);
  }
  if (!STAFF_ROLES.has(p.role)) {
    return jsonResponse({ error: { code: 'forbidden', message: 'Insufficient privileges.' } }, 403);
  }
  if (p.status !== 'active' || p.deleted_at !== null) {
    return jsonResponse(
      { error: { code: 'account_inactive_or_deleted', message: 'Account is disabled or deleted.' } },
      403,
    );
  }

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
  const { exam_id: examId, file_name: fileName } = parsed.body;

  const { data: exam, error: examError } = await client
    .from('exams')
    .select('id,deleted_at')
    .eq('id', examId)
    .maybeSingle();
  if (examError) {
    console.error('upload-exam-image: exam query failed', examError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate exam.' } },
      500,
    );
  }
  if (!exam) {
    return jsonResponse({ error: { code: 'exam_not_found', message: 'Exam not found.' } }, 404);
  }
  if ((exam as { deleted_at: string | null }).deleted_at !== null) {
    return jsonResponse({ error: { code: 'exam_deleted', message: 'Exam is deleted.' } }, 422);
  }

  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  const path = `${examId}/${crypto.randomUUID()}.${ext}`;
  const contentType = imageContentType(fileName);

  const service = deps.makeServiceClient(deps.url);
  const { data: signed, error: storageError } = await service.storage
    .from(EXAM_IMAGES_BUCKET)
    .createSignedUploadUrl(path, { contentType });
  if (storageError || !signed?.signedUrl) {
    console.error('upload-exam-image: createSignedUploadUrl failed', storageError?.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'upload_url_failed', message: 'Failed to create the upload URL.' } },
      502,
    );
  }

  return jsonResponse(
    {
      uploadUrl: signed.signedUrl,
      storage_path: path,
      exam_id: examId,
    },
    200,
  );
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
