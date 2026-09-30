// =====================================================================
// upload-suggestion-image — Phase 13 | Edge Function | Suggestion Images
// (Cloudinary, 0091 — Supabase Storage cut over).
// POST, JWT-verified (config.toml: [functions.upload-suggestion-image]
// verify_jwt = true).
//
// Starts the suggestion image upload flow for ONE student-owned,
// image-less suggestion:
//   1. validates the request (suggestion_id UUID, sanitized original
//      filename, optional declared size cap),
//   2. checks the caller is an ACTIVE STUDENT who owns the suggestion
//      and the suggestion has no image yet (single-image rule),
//   3. mints an image id server-side and signs a Cloudinary upload
//      grant for public_id `suggestion-images/<suggestion_id>/<uuid>`
//      (type=authenticated — private delivery; client NEVER supplies a
//      path component),
//   4. returns { upload_url, cloud_name, api_key, timestamp, signature,
//      public_id, suggestion_id, image_id }.
//   The client uploads bytes directly to upload_url, then binds the
//   pointer `cloudinary:suggestion-images/<suggestion_id>/<uuid>.<ext>:<version>`
//   (format + version from the upload response) via
//   attach_suggestion_image().
//
// File-name/size policy mirrors the legacy flow:
//   * original filename: basename only, max 255, .jpg/.jpeg/.png/.webp
//     (extension validated; stored format comes from Cloudinary).
//   * Size: 5MiB fail-fast on the declared file_size (platform cap);
//     Cloudinary still enforces the real bytes.
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized, forbidden, account_inactive_or_deleted, invalid_json,
//   validation_error, invalid_file_name, file_too_large,
//   suggestion_not_found, suggestion_image_exists, misconfigured
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';
import {
  SUGGESTION_IMAGE_UPLOAD_MAX_BYTES,
  suggestionImagePublicId,
  signUploadParams,
  uploadEndpoint,
} from '../_shared/cloudinary.ts';

export const MAX_SUGGESTION_IMAGE_SIZE_BYTES = SUGGESTION_IMAGE_UPLOAD_MAX_BYTES; // 5 MiB (platform cap)
export const MAX_FILE_NAME_LENGTH = 255;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_NAME_RE = /^[\p{L}\p{N} _.\-()\[\]+,@&'!~]+$/u;
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

export interface CloudinaryEnv {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export interface Deps {
  url: string;
  makeClient: (url: string, jwt: string) => SvcClient;
  cloudinary: CloudinaryEnv;
  nowSec?: () => number;
  newImageId?: () => string;
}

export function defaultDeps(): Deps {
  return {
    url: Deno.env.get('SUPABASE_URL') ?? '',
    makeClient: (url, jwt) =>
      createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SvcClient,
    cloudinary: {
      cloudName: Deno.env.get('CLOUDINARY_CLOUD_NAME') ?? '',
      apiKey: Deno.env.get('CLOUDINARY_API_KEY') ?? '',
      apiSecret: Deno.env.get('CLOUDINARY_API_SECRET') ?? '',
    },
    newImageId: () => crypto.randomUUID(),
  };
}

interface UploadBody {
  suggestion_id: string;
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

function parseUploadBody(raw: unknown):
  | { ok: true; body: UploadBody }
  | { ok: false; code: string; message: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, code: 'validation_error', message: 'Request body must be a JSON object.' };
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.suggestion_id !== 'string' || !UUID_RE.test(record.suggestion_id)) {
    return { ok: false, code: 'validation_error', message: 'suggestion_id must be a UUID.' };
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
    if (file_size > MAX_SUGGESTION_IMAGE_SIZE_BYTES) {
      return {
        ok: false,
        code: 'file_too_large',
        message: `file_size exceeds ${MAX_SUGGESTION_IMAGE_SIZE_BYTES} bytes.`,
      };
    }
  }
  return { ok: true, body: { suggestion_id: record.suggestion_id, file_name: cleaned.name, file_size } };
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

  // Active-student gate (mirrors public.is_student() in 0091).
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role,status,deleted_at')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('upload-suggestion-image: profile query failed', profileError.code ?? 'unknown');
    return jsonResponse({ error: { code: 'forbidden', message: 'Unable to verify caller.' } }, 403);
  }
  const p = profile as { role: string; status: string; deleted_at: string | null } | null;
  if (!p) {
    return jsonResponse({ error: { code: 'forbidden', message: 'Caller profile not found.' } }, 403);
  }
  if (p.role !== 'student') {
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
    const status = parsed.code === 'validation_error' || parsed.code === 'invalid_file_name' ? 422 : 422;
    return jsonResponse({ error: { code: parsed.code, message: parsed.message } }, status);
  }
  const { suggestion_id: suggestionId } = parsed.body;

  // Ownership + single-image gate: the suggestion must belong to the
  // caller and carry no image yet (mirrors attach_suggestion_image).
  const { data: suggestion, error: suggestionError } = await client
    .from('platform_suggestions')
    .select('id,student_id,image_path')
    .eq('id', suggestionId)
    .maybeSingle();
  if (suggestionError) {
    console.error('upload-suggestion-image: suggestion query failed', suggestionError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate suggestion.' } },
      500,
    );
  }
  const row = suggestion as { id: string; student_id: string; image_path: string | null } | null;
  if (!row || row.student_id !== user.id) {
    return jsonResponse(
      { error: { code: 'suggestion_not_found', message: 'Suggestion not found.' } },
      404,
    );
  }
  if (row.image_path !== null) {
    return jsonResponse(
      { error: { code: 'suggestion_image_exists', message: 'Suggestion already has an image.' } },
      422,
    );
  }

  const { cloudName, apiKey, apiSecret } = deps.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    console.error('upload-suggestion-image: Cloudinary env secrets missing');
    return jsonResponse(
      { error: { code: 'misconfigured', message: 'Suggestion image uploads are not configured.' } },
      500,
    );
  }

  const imageId = (deps.newImageId ?? (() => crypto.randomUUID()))();
  if (!UUID_RE.test(imageId)) {
    console.error('upload-suggestion-image: minted image id is not a UUID');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to prepare the upload.' } },
      500,
    );
  }
  const publicId = suggestionImagePublicId(suggestionId, imageId);
  const timestamp = String((deps.nowSec ?? (() => Math.floor(Date.now() / 1000)))());
  const params: Record<string, string> = {
    invalidate: 'true',
    overwrite: 'true',
    public_id: publicId,
    timestamp,
    type: 'authenticated',
  };
  const signature = await signUploadParams(params, apiSecret);

  return jsonResponse(
    {
      upload_url: uploadEndpoint(cloudName),
      cloud_name: cloudName,
      api_key: apiKey,
      timestamp,
      signature,
      public_id: publicId,
      suggestion_id: suggestionId,
      image_id: imageId,
    },
    200,
  );
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
