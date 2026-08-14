// =====================================================================
// expire-subscriptions — Phase 3 | Edge Function | Scheduled job (J1)
// ARCHITECTURE.md §8.4 row J1 / §8.5 scheduling chain (MED-4, R4).
//
// Scheduled internal job — NOT a request function. config.toml sets
// verify_jwt = false for this function (per ARCHITECTURE §8.4/BLUEPRINT
// §14, job functions are internal endpoints, not JWT routes), so access
// control is enforced HERE: the caller must present the `x-internal-token`
// header equal to env INTERNAL_JOB_TOKEN, compared in constant time
// (crypto.subtle SHA-256 digests — never a plain ===).
//
// ALL THREE LINKS of the unified scheduling chain hit this same endpoint
// and MUST include the token in every request:
//   1. Managed schedule:  supabase functions schedule expire-subscriptions "0 3 * * *"
//                        (the managed scheduler signs requests with the
//                        service role; the token header is still required
//                        and must be provisioned via supabase secrets set)
//   2. Fallback:          pg_cron job -> pg_net.http_post() -> this endpoint, e.g.
//        SELECT net.http_post(
//          url := 'https://<project-ref>.functions.supabase.co/expire-subscriptions',
//          headers := jsonb_build_object(
//            'x-internal-token', current_setting('app.settings.internal_job_token'),
//            'Content-Type', 'application/json'),
//          body := '{}');
//   3. Final fallback:    external cron (GitHub Actions scheduled workflow)
//                        performing POST with the same header.
//
// DB contract: public.expire_subscriptions() RETURNS void
// (migrations/0008_rpc_system.sql) — there is NO row count in the RPC
// result, so the affected count is derived here as a before/after delta
// of subscriptions with status='active' AND expires_at <= now(). The RPC
// is idempotent by design: status flips are unconditional and all
// notifications are deduped (UNIQUE dedup_key + ON CONFLICT DO NOTHING),
// so a re-run inside the same window reports { expired: 0 }.
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse } from '../_shared/cors.ts';

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
}

export interface SvcClient {
  from(table: string): SvcFrom;
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: DbError | null }>;
}

export interface Deps {
  url: string;
  serviceRoleKey: string;
  getToken: () => string | null | undefined;
  makeClient: (url: string, serviceRoleKey: string) => SvcClient;
}

export function defaultDeps(): Deps {
  return {
    url: Deno.env.get('SUPABASE_URL') ?? '',
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    getToken: () => Deno.env.get('INTERNAL_JOB_TOKEN'),
    makeClient: (url, serviceRoleKey) =>
      createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SvcClient,
  };
}

/**
 * Constant-time comparison of two strings.
 *
 * Plain `===` leaks timing information (early exit on first differing
 * character/length); here both sides are reduced to fixed-size SHA-256
 * digests (always 32 bytes) and XOR-accumulated over the full digest, so
 * runtime is independent of where (or whether) the inputs differ. The
 * length of the token itself is not secret-relevant, but equality of the
 * two hash lengths is still checked implicitly by the fixed digest size.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const left = new Uint8Array(da);
  const right = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

export async function handle(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return jsonResponse(
      { error: { code: 'method_not_allowed', message: 'POST required.' } },
      405,
      true,
    );
  }
  if (req.method !== 'POST') {
    return jsonResponse(
      { error: { code: 'method_not_allowed', message: 'POST required.' } },
      405,
      true,
    );
  }

  // --- Internal token gate (constant-time compare) ---
  const expected = deps.getToken();
  if (!expected) {
    console.error('expire-subscriptions: INTERNAL_JOB_TOKEN is not configured');
    return jsonResponse(
      { error: { code: 'server_misconfigured', message: 'Job token is not configured.' } },
      500,
      true,
    );
  }
  const provided = req.headers.get('x-internal-token') ?? '';
  if (!provided) {
    return jsonResponse(
      { error: { code: 'missing_internal_token', message: 'Missing x-internal-token header.' } },
      401,
      true,
    );
  }
  if (!(await timingSafeEqual(provided, expected))) {
    return jsonResponse(
      { error: { code: 'invalid_internal_token', message: 'Invalid x-internal-token.' } },
      401,
      true,
    );
  }

  const client = deps.makeClient(deps.url, deps.serviceRoleKey);

  // --- Before snapshot: subscriptions due RIGHT NOW ---
  const { count: before, error: beforeError } = await client
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .lte('expires_at', new Date().toISOString());
  if (beforeError) {
    console.error('expire-subscriptions: before-count failed', beforeError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'expire_failed', message: 'Scheduled expiry job failed.' } },
      500,
      true,
    );
  }

  // --- Invoke the internal RPC (RETURNS void — see file header) ---
  const { error: rpcError } = await client.rpc('expire_subscriptions', {});
  if (rpcError) {
    console.error('expire-subscriptions: RPC failed', rpcError.code ?? rpcError.message);
    return jsonResponse(
      { error: { code: 'expire_failed', message: 'Scheduled expiry job failed.' } },
      500,
      true,
    );
  }

  // --- After snapshot: delta = subscriptions flipped by this run ---
  const { count: after, error: afterError } = await client
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .lte('expires_at', new Date().toISOString());
  if (afterError) {
    console.error('expire-subscriptions: after-count failed', afterError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'expire_failed', message: 'Scheduled expiry job failed.' } },
      500,
      true,
    );
  }

  const expired = Math.max(0, (before ?? 0) - (after ?? 0));
  return jsonResponse({ expired }, 200, true);
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
