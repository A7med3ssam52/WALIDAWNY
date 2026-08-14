// =====================================================================
// generate-subscription-codes — Phase 3 | Edge Function | Function 6
// ARCHITECTURE.md §8.4 row 6 / SECURITY.md §7 (EF security model).
//
// POST, JWT-verified (config.toml: verify_jwt = true — the default).
// Generates single-use subscription codes via the authenticated-facing
// SECURITY DEFINER RPC public.create_codes_for_staff(p_plan_id, p_count,
// p_note) (migrations/0014). That wrapper enforces is_admin() OR
// is_mr_walid() from the request's JWT claims and delegates to
// generate_codes_internal (migrations/0007). The browser NEVER holds the
// service-role key and NEVER sees raw codes except through this endpoint.
//
// Authorization (SECURITY.md §7 common rules):
//   1. supabase.auth.getUser() on the Bearer JWT — never trust decoded
//      claims alone.
//   2. Role + active-profile check re-derived from DB: is_admin() OR
//      is_mr_walid() on public.profiles, AND status = 'active' AND
//      deleted_at IS NULL (A34 defense-in-depth, ARCHITECTURE §2.3.5).
//   3. Plan validation: exists (404 plan_not_found), is_active and not
//      deactivated (422 plan_inactive). pricing_plans has no deleted_at
//      column — deactivation (is_active = false) is its only soft-delete
//      equivalent (BP B7 / ARCHITECTURE §7.2).
//   4. Count cap 1..500 (blueprint A-flagged; the wrapper raises
//      invalid_count outside the same bounds — MED-6).
//
// Actor plumbing: a service-role JWT carries no sub claim (cannot pass
// the wrapper guard) and PostgREST exposes no per-request GUC channel,
// so the generation step runs through a REQUEST-SCOPED client built from
// the caller's own Bearer token — the exact token string already passed
// to getUser(), reused verbatim in the anon-key position (the token
// overrides the key for that request). The same client also carries
// auth.getUser() (explicit token argument) and the profile/plan
// re-derivation reads, which RLS permits for staff callers.
//
// RPC error mapping (stable DB error codes; messages never echoed):
//   permission_denied       -> 403 {error:{code:"permission_denied"}}
//   plan_not_found          -> 404 {error:{code:"plan_not_found"}}
//   invalid_count           -> 422 {error:{code:"validation_error"}}
//   system_actor_required   -> 502 guard: logged, never surfaced,
//                              treated as code_generation_failed
//   any other RPC failure   -> 502 {error:{code:"code_generation_failed"}}
//
// Response: { codes: [{ code, plan, status, created_at, note }] } —
// the caller is the ONLY party that ever sees raw codes. Pass-through
// rows are restricted to these five fields (created_by/used_* stay
// server-side).
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';

export const MAX_CODES_PER_REQUEST = 500;
export const STAFF_ROLES: ReadonlySet<string> = new Set(['admin', 'mr_walid']);

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
  lte(column: string, value: unknown): SvcQueryResult;
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

export interface Deps {
  url: string;
  /** key is the caller's Bearer token (request-scoped); anon-key position. */
  makeClient: (url: string, jwt: string) => SvcClient;
}

/** Default dependency wiring: env-driven clients (hosted Edge Runtime / local serve). */
export function defaultDeps(): Deps {
  return {
    url: Deno.env.get('SUPABASE_URL') ?? '',
    makeClient: (url, jwt) =>
      createClient(url, jwt, {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SvcClient,
  };
}

interface GenerateBody {
  plan_id: string;
  count: number;
  note?: string;
}

function parseGenerateBody(raw: unknown):
  | { ok: true; body: GenerateBody }
  | {
      ok: false;
      code: string;
      message: string;
    } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, code: 'validation_error', message: 'Request body must be a JSON object.' };
  }
  const record = raw as Record<string, unknown>;
  const { plan_id, count } = record;

  if (typeof plan_id !== 'string' || !UUID_RE.test(plan_id)) {
    return { ok: false, code: 'validation_error', message: 'plan_id must be a UUID.' };
  }
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_CODES_PER_REQUEST
  ) {
    return {
      ok: false,
      code: 'validation_error',
      message: `count must be an integer between 1 and ${MAX_CODES_PER_REQUEST}.`,
    };
  }
  const note = typeof record.note === 'string' ? (record.note as string).trim() : undefined;
  return { ok: true, body: { plan_id, count, note: note === '' ? undefined : note } };
}

export async function handle(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  if (req.method === 'OPTIONS') return preflightResponse();
  if (req.method !== 'POST') {
    return jsonResponse({ error: { code: 'method_not_allowed', message: 'POST required.' } }, 405);
  }

  // --- 1) JWT verification (SECURITY.md §7: never trust decoded claims) ---
  const authHeader = req.headers.get('Authorization');
  const jwt = authHeader?.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!jwt) {
    return jsonResponse(
      { error: { code: 'unauthorized', message: 'Missing or invalid Authorization header.' } },
      401,
    );
  }

  // Request-scoped client: the caller's own token (anon-key position; the
  // token overrides the key). Never a service-role client — see header.
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
    console.error(
      'generate-subscription-codes: profile query failed',
      profileError.code ?? 'unknown',
    );
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

  // --- 3) Body + plan validation ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse(
      { error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } },
      400,
    );
  }
  const parsed = parseGenerateBody(rawBody);
  if (!parsed.ok) {
    return jsonResponse({ error: { code: parsed.code, message: parsed.message } }, 422);
  }
  const { plan_id: planId, count, note } = parsed.body;

  const { data: plan, error: planError } = await client
    .from('pricing_plans')
    .select('is_active')
    .eq('id', planId)
    .maybeSingle();
  if (planError) {
    console.error('generate-subscription-codes: plan query failed', planError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate pricing plan.' } },
      500,
    );
  }
  if (!plan) {
    return jsonResponse(
      { error: { code: 'plan_not_found', message: 'Pricing plan not found.' } },
      404,
    );
  }
  if ((plan as { is_active: boolean }).is_active !== true) {
    return jsonResponse(
      { error: { code: 'plan_inactive', message: 'Pricing plan is inactive.' } },
      422,
    );
  }

  // --- 4) Generation via the authenticated wrapper RPC (caller-scoped
  // client; the ONLY party that ever sees raw codes is the caller) ---
  const { data: rows, error: rpcError } = await client.rpc('create_codes_for_staff', {
    p_plan_id: planId,
    p_count: count,
    p_note: note ?? null,
  });
  if (rpcError) {
    // Stable DB error codes are safe to log/surface; messages are not echoed.
    console.error('generate-subscription-codes: RPC failed', rpcError.code ?? 'unknown');
    if (rpcError.code === 'permission_denied') {
      return jsonResponse(
        { error: { code: 'permission_denied', message: 'Insufficient privileges.' } },
        403,
      );
    }
    if (rpcError.code === 'plan_not_found') {
      return jsonResponse(
        { error: { code: 'plan_not_found', message: 'Pricing plan not found.' } },
        404,
      );
    }
    if (rpcError.code === 'invalid_count') {
      return jsonResponse(
        {
          error: {
            code: 'validation_error',
            message: `count must be an integer between 1 and ${MAX_CODES_PER_REQUEST}.`,
          },
        },
        422,
      );
    }
    if (rpcError.code === 'system_actor_required') {
      // Wrapper always supplies an actor for real staff tokens; reaching
      // here is an infra/plumbing failure — never surface this code.
      return jsonResponse(
        { error: { code: 'code_generation_failed', message: 'Failed to generate codes.' } },
        502,
      );
    }
    return jsonResponse(
      { error: { code: 'code_generation_failed', message: 'Failed to generate codes.' } },
      502,
    );
  }

  const codes = (Array.isArray(rows) ? rows : []).map((r: Record<string, unknown>) => ({
    code: r.code ?? null,
    plan: r.pricing_plan_id ?? null,
    status: r.status ?? null,
    created_at: r.created_at ?? null,
    note: r.note ?? null,
  }));

  return jsonResponse({ codes }, 200);
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
