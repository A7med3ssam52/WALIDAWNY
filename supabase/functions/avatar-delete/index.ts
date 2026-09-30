// =====================================================================
// avatar-delete — Phase 10 | Edge Function | Cloudinary avatars (0089).
// POST + JWT (config.toml: [functions.avatar-delete] verify_jwt = true).
//
// Destroys the CALLER's own avatar asset on Cloudinary
// (`avatars/<caller-uid>/avatar`, type `authenticated`) via the Upload
// API destroy endpoint (server-side secret — never exposed).
//
// The frontend calls this right BEFORE remove_my_avatar(): binding
// cleared in Postgres + bytes destroyed on Cloudinary = the same
// best-effort parity remove_my_avatar() historically provided for
// Supabase objects. Destroying a non-existent asset succeeds
// (idempotent), so double-deletes and delete-without-upload are safe.
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized              -> 401
//   forbidden                 -> 403 (non-student / no profile)
//   account_inactive_or_deleted -> 403
//   destroy_failed            -> 502 (Cloudinary destroy call failed)
//   misconfigured             -> 500 (Cloudinary env secrets missing)
//
// Success: { deleted: true }.
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';
import {
  avatarPublicId,
  destroyAvatarAsset,
  type CloudinaryFetch,
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
  nowSec?: () => number;
  /** Injectable Cloudinary transport (global fetch in production). */
  cloudinaryFetch?: CloudinaryFetch;
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
    cloudinaryFetch: (url, init) =>
      fetch(url, init).then((res) => ({ status: res.status, json: () => res.json() })),
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

  // --- 2) Active-student gate (mirrors public.is_student() in 0089) ---
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role,status,deleted_at')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('avatar-delete: profile query failed', profileError.code ?? 'unknown');
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

  // --- 3) Server configuration (never echoed, never logged) ---
  const { cloudName, apiKey, apiSecret } = deps.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    console.error('avatar-delete: Cloudinary env secrets missing');
    return jsonResponse(
      { error: { code: 'misconfigured', message: 'Avatar deletion is not configured.' } },
      500,
    );
  }
  if (!deps.cloudinaryFetch) {
    console.error('avatar-delete: Cloudinary transport missing');
    return jsonResponse(
      { error: { code: 'misconfigured', message: 'Avatar deletion is not configured.' } },
      500,
    );
  }

  // --- 4) Destroy the caller's own asset (idempotent) ---
  try {
    const timestamp = (deps.nowSec ?? (() => Math.floor(Date.now() / 1000)))();
    const { deleted } = await destroyAvatarAsset({
      cloudName,
      apiKey,
      apiSecret,
      publicId: avatarPublicId(user.id),
      timestamp,
      fetchFn: deps.cloudinaryFetch,
    });
    if (!deleted) {
      console.error('avatar-delete: Cloudinary destroy reported failure');
      return jsonResponse(
        { error: { code: 'destroy_failed', message: 'Failed to delete the avatar.' } },
        502,
      );
    }
  } catch (error) {
    console.error('avatar-delete: Cloudinary destroy threw', String(error));
    return jsonResponse(
      { error: { code: 'destroy_failed', message: 'Failed to delete the avatar.' } },
      502,
    );
  }

  return jsonResponse({ deleted: true }, 200);
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
