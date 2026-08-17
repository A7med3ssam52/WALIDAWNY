// =====================================================================
// generate-unit-codes — Phase 2 | Edge Function
// IMPLEMENTATION-PLAN.md §4.3 / SECURITY.md §7 (EF security model).
// POST + JWT-verified (config.toml: [functions.generate-unit-codes]
// verify_jwt = true). STAFF-ONLY (admin / mr_walid / teacher): generates
// physical unit codes for the staff sale channel.
//
// Body:  { "unit_id": "<uuid>", "count": <int 1..500>, "note"?: "<text>" }
// Response (success): { ok: true, codes: string[] }
//   codes = the generated code strings only (WLDN-XXXXXXXXXXXX); the
//   internal unit_codes columns (id, unit_pricing_id, created_by, ...)
//   never reach the caller.
//
// Authorization: the caller's verified user JWT is forwarded AS-IS to the
// SECURITY DEFINER RPC public.create_unit_codes_for_staff (0028) — the
// DB re-checks the staff guard (is_admin() OR is_mr_walid() OR
// is_teacher()). A service-role key is NEVER used here.
//
// RPC errors are mirrored LITERALLY (§4.3):
//   unit_not_found  -> 404
//   unit_inactive   -> 422
//   invalid_count   -> 422
//   permission_denied -> 403 (defense in depth; EF already gates staff)
//   any other RPC error -> 502 code_generation_failed (raw message never
//                          surfaced)
//
// Error envelope: { error: { code, message } }:
//   unauthorized              -> 401
//   forbidden                 -> 403 (role insufficient / no profile /
//                                     inactive-deleted account)
//   invalid_json              -> 400 (malformed body)
//   validation_error          -> 422 (illegal unit_id / count / note)
//   code_generation_failed    -> 502 (RPC failure; no raw leak)
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';

export const MAX_CODES_PER_REQUEST = 500;
export const STAFF_ROLES: ReadonlySet<string> = new Set(['admin', 'mr_walid', 'teacher']);
const MAX_NOTE_LENGTH = 200;

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

export function parseBody(body: unknown):
  | { ok: true; unitId: string; count: number; note: string | null }
  | {
      ok: false;
      message: string;
    } {
  const b = (body ?? {}) as { unit_id?: unknown; count?: unknown; note?: unknown };
  if (typeof b.unit_id !== 'string' || !UUID_RE.test(b.unit_id)) {
    return { ok: false, message: 'unit_id must be a UUID.' };
  }
  if (typeof b.count !== 'number' || !Number.isInteger(b.count) || b.count < 1 || b.count > MAX_CODES_PER_REQUEST) {
    return {
      ok: false,
      message: `count must be an integer between 1 and ${MAX_CODES_PER_REQUEST}.`,
    };
  }
  let note: string | null = null;
  if (b.note !== undefined && b.note !== null) {
    if (typeof b.note !== 'string') {
      return { ok: false, message: 'note must be a string or null.' };
    }
    note = b.note;
  }
  if (note !== null && note.length > MAX_NOTE_LENGTH) {
    return { ok: false, message: `note must be at most ${MAX_NOTE_LENGTH} characters.` };
  }
  return { ok: true, unitId: b.unit_id, count: b.count, note };
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

  // --- 2) Staff + active/not-deleted profile check, re-derived from DB ---
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role,status,deleted_at')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('generate-unit-codes: profile query failed', profileError.code ?? 'unknown');
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
    return jsonResponse(
      { error: { code: 'forbidden', message: 'Unit code generation is available to staff only.' } },
      403,
    );
  }
  if (p.status !== 'active' || p.deleted_at !== null) {
    return jsonResponse(
      {
        error: { code: 'account_inactive_or_deleted', message: 'Account is disabled or deleted.' },
      },
      403,
    );
  }

  // --- 3) Body validation ---
  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return jsonResponse({ error: { code: 'invalid_json', message: 'Invalid JSON body.' } }, 400);
  }
  const parsed = parseBody(body);
  if (!parsed.ok) {
    return jsonResponse({ error: { code: 'validation_error', message: parsed.message } }, 422);
  }

  // --- 4) Forward the caller's JWT to the SECURITY DEFINER RPC ---
  const { data, error } = await client.rpc('create_unit_codes_for_staff', {
    p_unit_id: parsed.unitId,
    p_count: parsed.count,
    p_note: parsed.note,
  });
  if (error) {
    switch (error.code) {
      case 'unit_not_found':
        return jsonResponse(
          { error: { code: 'unit_not_found', message: 'Unit not found.' } },
          404,
        );
      case 'unit_inactive':
        return jsonResponse(
          { error: { code: 'unit_inactive', message: 'The unit has no active price.' } },
          422,
        );
      case 'invalid_count':
        return jsonResponse(
          { error: { code: 'invalid_count', message: 'Count is out of range.' } },
          422,
        );
      case 'permission_denied':
        return jsonResponse(
          { error: { code: 'permission_denied', message: 'Permission denied.' } },
          403,
        );
      default:
        console.error('generate-unit-codes: RPC failed', error.code ?? 'unknown');
        return jsonResponse(
          { error: { code: 'code_generation_failed', message: 'Failed to generate codes.' } },
          502,
        );
    }
  }

  const rows = (data ?? []) as Array<{ code: string }>;
  return jsonResponse(
    {
      ok: true,
      codes: rows.map((row) => row.code),
    },
    200,
  );
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
