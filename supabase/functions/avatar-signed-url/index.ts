// =====================================================================
// avatar-signed-url — Phase 10 | Edge Function | Cloudinary avatars
// (0089). POST + JWT (config.toml: [functions.avatar-signed-url]
// verify_jwt = true).
//
// Serves avatar reads for BOTH the owner and staff: the client passes a
// profiles.avatar_path pointer (never a raw public_id — the server
// parses and pins it), and the server returns a signed Cloudinary
// delivery URL for the `authenticated`-type asset:
//
//   POST { "path": "cloudinary:<uid>/avatar.<ext>:<version>" }
//   -> { "signed_url": "https://res.cloudinary.com/.../s--...--/..." }
//
// Access control (mirrors the 0082 storage SELECT policy):
//   * OWNER: any caller may view the avatar whose uid segment equals
//     their own id (students viewing their own photo, header included).
//   * STAFF (admin / mr_walid / teacher): may view any student's avatar
//     (student lists + detail + preview dialog).
//   * Any other role -> forbidden (403).
//   * Inactive or soft-deleted accounts are rejected before any access
//     decision (account_inactive_or_deleted).
//   * Legacy Supabase paths (`<uid>/avatar.ext`) are NOT served here —
//     the frontend resolves those straight from Supabase Storage
//     (dual-read window); they are rejected with validation_error.
//
// The signed URL carries the single fixed transformation
// (AVATAR_DELIVERY_TRANSFORMATION) and the stored version, so every
// re-upload (version bump) invalidates previously issued URLs. See
// _shared/cloudinary.ts for the URL-lifetime note.
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized              -> 401
//   forbidden                 -> 403 (role insufficient / foreign path)
//   account_inactive_or_deleted -> 403
//   invalid_json              -> 400
//   validation_error          -> 422 (missing/malformed/legacy path)
//   misconfigured             -> 500 (Cloudinary env secrets missing)
//
// Success: { signed_url }.
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';
import {
  AVATAR_DELIVERY_TRANSFORMATION,
  buildAuthenticatedDeliveryUrl,
  parseAvatarPath,
  signDeliveryUrl,
} from '../_shared/cloudinary.ts';

export const STAFF_ROLES: ReadonlySet<string> = new Set(['admin', 'mr_walid', 'teacher']);

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
    console.error('avatar-signed-url: profile query failed', profileError.code ?? 'unknown');
    return jsonResponse({ error: { code: 'forbidden', message: 'Unable to verify caller.' } }, 403);
  }
  const p = profile as { role: string; status: string; deleted_at: string | null } | null;
  if (!p) {
    return jsonResponse(
      { error: { code: 'forbidden', message: 'Caller profile not found.' } },
      403,
    );
  }
  const isStaff = STAFF_ROLES.has(p.role);
  if (p.role !== 'student' && !isStaff) {
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
  const parsed = parseAvatarPath(path);
  if (!parsed) {
    return jsonResponse(
      {
        error: {
          code: 'validation_error',
          message: 'path must be a cloudinary:<uid>/avatar.<ext>:<version> pointer.',
        },
      },
      422,
    );
  }

  // --- 4) Owner-or-staff gate on the uid segment ---
  if (!isStaff && parsed.uid !== user.id) {
    return jsonResponse(
      { error: { code: 'forbidden', message: 'Insufficient privileges.' } },
      403,
    );
  }

  // --- 5) Server configuration (never echoed, never logged) ---
  const { cloudName, apiSecret } = deps.cloudinary;
  if (!cloudName || !apiSecret) {
    console.error('avatar-signed-url: Cloudinary env secrets missing');
    return jsonResponse(
      { error: { code: 'misconfigured', message: 'Avatar viewing is not configured.' } },
      500,
    );
  }

  // --- 6) Signed delivery URL (fixed transformation + stored version) ---
  const publicId = `avatars/${parsed.uid}/avatar`;
  const toSign =
    `${AVATAR_DELIVERY_TRANSFORMATION}/v${parsed.version}/${publicId}.${parsed.format}`;
  const signature = await signDeliveryUrl(toSign, apiSecret);
  const signedUrl = buildAuthenticatedDeliveryUrl({
    cloudName,
    publicId,
    format: parsed.format,
    version: parsed.version,
    signature,
  });

  return jsonResponse({ signed_url: signedUrl }, 200);
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
