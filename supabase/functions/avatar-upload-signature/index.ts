// =====================================================================
// avatar-upload-signature — Phase 10 | Edge Function | Cloudinary
// avatars (0089). POST + JWT (config.toml:
// [functions.avatar-upload-signature] verify_jwt = true).
//
// Issues a short-lived signed-upload grant so an ACTIVE STUDENT can
// upload their own avatar DIRECTLY to Cloudinary (browser -> Cloudinary,
// bytes never touch Supabase):
//   1. verifies the caller (JWT -> active, non-deleted student profile),
//   2. optionally validates a declared content_type / file_size
//      (client-visible UX; Cloudinary still enforces the real bytes),
//   3. signs { invalidate, overwrite, public_id, timestamp, type } with
//      the server-side CLOUDINARY_API_SECRET and returns the grant.
//
// The public_id is ALWAYS `avatars/<caller-uid>/avatar` (server-built —
// the client never supplies a path component, so IDOR is impossible),
// type is ALWAYS `authenticated` (private delivery), overwrite=true +
// invalidate=true (one asset per student, CDN cache busted on replace).
// Only the owner can obtain a signature for their own public_id, which
// is why set_my_avatar() (0089) can trust a well-formed
// cloudinary:<own-uid>/... pointer without a storage.objects row.
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized              -> 401
//   forbidden                 -> 403 (non-student / no profile)
//   account_inactive_or_deleted -> 403
//   invalid_json              -> 400
//   invalid_file_type         -> 422 (declared content_type not image)
//   file_too_large            -> 422 (declared size > 8MiB)
//   misconfigured             -> 500 (Cloudinary env secrets missing)
//
// Success: { upload_url, cloud_name, api_key, timestamp, signature,
//            public_id }. The browser POSTs a multipart form
// (file + api_key + timestamp + public_id + type + overwrite +
// invalidate + signature) to upload_url, then binds the returned
// format/version via set_my_avatar('cloudinary:<uid>/avatar.<f>:<v>').
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';
import {
  AVATAR_UPLOAD_MAX_BYTES,
  avatarPublicId,
  signUploadParams,
  uploadEndpoint,
} from '../_shared/cloudinary.ts';

export const AVATAR_SIGNATURE_TTL_SECONDS = 3600;

const SUPPORTED_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

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
  /** Caller-scoped client: anon key in the key slot, caller JWT in Authorization. */
  makeClient: (url: string, jwt: string) => SvcClient;
  cloudinary: CloudinaryEnv;
  nowSec?: () => number;
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
    cloudinary: {
      cloudName: Deno.env.get('CLOUDINARY_CLOUD_NAME') ?? '',
      apiKey: Deno.env.get('CLOUDINARY_API_KEY') ?? '',
      apiSecret: Deno.env.get('CLOUDINARY_API_SECRET') ?? '',
    },
  };
}

interface SignatureBody {
  content_type?: string;
  file_size?: number;
}

function parseBody(raw: unknown):
  | { ok: true; body: SignatureBody }
  | { ok: false; code: string; message: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, code: 'invalid_json', message: 'Request body must be a JSON object.' };
  }
  const record = raw as Record<string, unknown>;
  let content_type: string | undefined;
  if (record.content_type !== undefined && record.content_type !== null) {
    if (typeof record.content_type !== 'string' || !SUPPORTED_CONTENT_TYPES.has(record.content_type)) {
      return {
        ok: false,
        code: 'invalid_file_type',
        message: 'content_type must be image/jpeg, image/png or image/webp.',
      };
    }
    content_type = record.content_type;
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
        code: 'file_too_large',
        message: 'file_size must be a non-negative integer.',
      };
    }
    if (record.file_size > AVATAR_UPLOAD_MAX_BYTES) {
      return {
        ok: false,
        code: 'file_too_large',
        message: `file_size exceeds ${AVATAR_UPLOAD_MAX_BYTES} bytes.`,
      };
    }
    file_size = record.file_size;
  }
  return { ok: true, body: { content_type, file_size } };
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

  // --- 2) Active-student gate (mirrors public.is_student() in 0089) ---
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role,status,deleted_at')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('avatar-upload-signature: profile query failed', profileError.code ?? 'unknown');
    return jsonResponse({ error: { code: 'forbidden', message: 'Unable to verify caller.' } }, 403);
  }
  const p = profile as { role: string; status: string; deleted_at: string | null } | null;
  if (!p) {
    return jsonResponse(
      { error: { code: 'forbidden', message: 'Caller profile not found.' } },
      403,
    );
  }
  if (p.role !== 'student') {
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

  // --- 3) Optional declared upload hints (fail fast for bad clients) ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse(
      { error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } },
      400,
    );
  }
  const parsed = parseBody(rawBody);
  if (!parsed.ok) {
    const status = parsed.code === 'invalid_json' ? 400 : 422;
    return jsonResponse({ error: { code: parsed.code, message: parsed.message } }, status);
  }

  // --- 4) Server configuration (never echoed, never logged) ---
  const { cloudName, apiKey, apiSecret } = deps.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    console.error('avatar-upload-signature: Cloudinary env secrets missing');
    return jsonResponse(
      { error: { code: 'misconfigured', message: 'Avatar uploads are not configured.' } },
      500,
    );
  }

  // --- 5) Sign the fixed owner-only public_id ---
  const publicId = avatarPublicId(user.id);
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
    },
    200,
  );
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
