// =====================================================================
// suggestion-image-signed-url — Phase 13 | Edge Function | Suggestions
// (Cloudinary, 0091). POST + JWT
// (config.toml: [functions.suggestion-image-signed-url] verify_jwt = true).
//
// Serves suggestion image reads for the OWNER student and ADMINS only
// (admin-only inbox, 0075): the client passes a
// platform_suggestions.image_path pointer (never a raw public_id — the
// server parses and pins it), and the server returns a signed
// Cloudinary delivery URL for the `authenticated`-type asset:
//
//   POST { "path": "cloudinary:suggestion-images/<sug>/<uuid>.<ext>:<v>" }
//   -> { "signed_url": "https://res.cloudinary.com/.../s--...--/..." }
//
// Access control (mirrors the 0075 storage SELECT policy):
//   * OWNER: the student whose id matches the suggestion row's
//     student_id (suggestion_id segment must equal the row id).
//   * ADMIN: may view any suggestion image (inbox moderation).
//   * Any other role (teacher/mr_walid/assistant included) -> 403.
//   * Inactive or soft-deleted accounts rejected first.
//   * Legacy Supabase paths (`<uid>/<sug>.jpg`) are NOT served —
//     cutover is immediate (0091); rejected with validation_error.
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized              -> 401
//   forbidden                 -> 403 (role insufficient / foreign image)
//   account_inactive_or_deleted -> 403
//   invalid_json              -> 400
//   validation_error          -> 422 (missing/malformed/legacy path)
//   suggestion_not_found      -> 404 (pointer well-formed but row gone)
//   misconfigured             -> 500 (Cloudinary env secrets missing)
//
// Success: { signed_url }.
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';
import {
  buildAuthenticatedDeliveryUrl,
  parseSuggestionImagePointer,
  signDeliveryUrl,
  SUGGESTION_IMAGE_DELIVERY_TRANSFORMATION,
} from '../_shared/cloudinary.ts';

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

  // --- 2) Role + active/not-deleted profile check, re-derived from DB ---
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role,status,deleted_at')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('suggestion-image-signed-url: profile query failed', profileError.code ?? 'unknown');
    return jsonResponse({ error: { code: 'forbidden', message: 'Unable to verify caller.' } }, 403);
  }
  const p = profile as { role: string; status: string; deleted_at: string | null } | null;
  if (!p) {
    return jsonResponse(
      { error: { code: 'forbidden', message: 'Caller profile not found.' } },
      403,
    );
  }
  const isAdmin = p.role === 'admin';
  const isOwnerRole = p.role === 'student';
  if (!isAdmin && !isOwnerRole) {
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

  // --- 3) Pointer from the JSON body (never a raw public_id) ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse(
      { error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } },
      400,
    );
  }
  const path = (rawBody as { path?: unknown } | null)?.path;
  const parsed = parseSuggestionImagePointer(path);
  if (!parsed) {
    return jsonResponse(
      {
        error: {
          code: 'validation_error',
          message:
            'path must be a cloudinary:suggestion-images/<suggestion>/<uuid>.<ext>:<version> pointer.',
        },
      },
      422,
    );
  }

  // --- 4) Owner-or-admin gate on the suggestion row ---
  const { data: suggestion, error: suggestionError } = await client
    .from('platform_suggestions')
    .select('id,student_id,image_path')
    .eq('id', parsed.suggestionId)
    .maybeSingle();
  if (suggestionError) {
    console.error(
      'suggestion-image-signed-url: suggestion query failed',
      suggestionError.code ?? 'unknown',
    );
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate suggestion.' } },
      500,
    );
  }
  const row = suggestion as { id: string; student_id: string; image_path: string | null } | null;
  if (!row) {
    return jsonResponse(
      { error: { code: 'suggestion_not_found', message: 'Suggestion not found.' } },
      404,
    );
  }
  if (!isAdmin && row.student_id !== user.id) {
    return jsonResponse({ error: { code: 'forbidden', message: 'Insufficient privileges.' } }, 403);
  }

  // --- 5) Server configuration (never echoed, never logged) ---
  const { cloudName, apiSecret } = deps.cloudinary;
  if (!cloudName || !apiSecret) {
    console.error('suggestion-image-signed-url: Cloudinary env secrets missing');
    return jsonResponse(
      { error: { code: 'misconfigured', message: 'Suggestion image viewing is not configured.' } },
      500,
    );
  }

  // --- 6) Signed delivery URL (fixed transformation + stored version) ---
  const publicId = `suggestion-images/${parsed.suggestionId}/${parsed.imageId}`;
  const toSign =
    `${SUGGESTION_IMAGE_DELIVERY_TRANSFORMATION}/v${parsed.version}/${publicId}.${parsed.format}`;
  const signature = await signDeliveryUrl(toSign, apiSecret);
  const signedUrl = buildAuthenticatedDeliveryUrl({
    cloudName,
    publicId,
    format: parsed.format,
    version: parsed.version,
    transformation: SUGGESTION_IMAGE_DELIVERY_TRANSFORMATION,
    signature,
  });

  return jsonResponse({ signed_url: signedUrl }, 200);
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
