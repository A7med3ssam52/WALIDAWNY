// =====================================================================
// export-audit-log -- Phase 8 | Edge Function | ARchITECTURE.md §8.4
// row 7 / BLUEPRINT.md §14 row 7 / SECURITY.md §9.
//
// POST + JWT (config.toml: [functions.export-audit-log] verify_jwt =
// true). ADMIN-ONLY: the caller must be an active, not-deleted `admin`
// profile (re-derived from DB, never trusted from the token alone).
//
// Filters (all optional; date kept strict-inclusive on the DB side):
//
//   POST {
//     from?: string (ISO), to?: string (ISO),
//     action?: string,     // case-insensitive substring
//     entity_type?: string // case-insensitive substring
//     actor_id?: uuid
//   }
//   -> { url, rows, expiresAt }
//
// Pipeline: query v_audit_log (RLS admin-only SELECT enforces the
// admin gate server-side too) with date-range + actor constraints, then
// apply the action/entity substring filters in-function; build a CSV with
// a UTF-8 BOM (Excel/Arabic interoperability); upload it to the PRIVATE
// `audit-exports` bucket via the service-role client; return a
// short-lived signed URL (TTL 600 s, per SECURITY.md §9 "audit export
// ~10 min"). Raw CSV content never leaves the server without a signer.
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized                 -> 401
//   forbidden                    -> 403 (role insufficient / no profile)
//   account_inactive_or_deleted  -> 403
//   validation_error             -> 422 (bad JSON / illegal filter)
//   no_matching_rows             -> 404 (optional; disabled by default)
//   internal_error               -> 500 (query/upload/sign failures;
//                                  raw message never echoed)
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';

export const AUDIT_EXPORTS_BUCKET = 'audit-exports';
export const EXPORT_TTL_SECONDS = 600;
export const MAX_ROWS = 50_000;
export const MAX_ACTION_LEN = 100;
export const MAX_ENTITY_LEN = 64;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export type DbError = { message: string; code?: string; details?: string };

export interface SvcStorageObject {
  upload(
    path: string,
    content: string,
    opts?: { contentType?: string },
  ): Promise<{ data: { path: string } | null; error: DbError | null }>;
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): Promise<{
    data: { signedUrl: string; path: string } | null;
    error: DbError | null;
  }>;
}

export interface SvcFrom {
  select(columns: string, opts?: { count?: 'exact'; head?: boolean }): SvcQueryResult;
}

export interface SvcQueryResult extends Promise<{
  data: unknown;
  error: DbError | null;
}> {
  eq(column: string, value: unknown): SvcQueryResult;
  gt(column: string, value: unknown): SvcQueryResult;
  lt(column: string, value: unknown): SvcQueryResult;
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
  storage: { from(bucket: string): SvcStorageObject };
}

export interface Deps {
  url: string;
  makeClient: (url: string, jwt: string) => SvcClient;
  makeServiceClient: (url: string) => SvcClient;
  ttlSeconds?: number;
  nowUnix?: () => number;
  randomPath?: (now: number) => string;
}

export function defaultDeps(): Deps {
  return {
    url: Deno.env.get('SUPABASE_URL') ?? '',
    makeClient: (url, jwt) =>
      createClient(url, jwt, {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SvcClient,
    makeServiceClient: (url) =>
      createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SvcClient,
  };
}

interface AuditFilters {
  from?: string;
  to?: string;
  action?: string;
  entityType?: string;
  actorId?: string;
}

function parseFilters(
  body: unknown,
): { ok: true; filters: AuditFilters } | { ok: false; message: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Body must be a JSON object with optional filters.' };
  }
  const input = body as Record<string, unknown>;
  const result: AuditFilters = {};
  if (input.from !== null && input.from !== undefined) {
    if (typeof input.from !== 'string' || !ISO_RE.test(input.from)) {
      return { ok: false, message: 'from must be an ISO-8601 timestamp.' };
    }
    result.from = input.from;
  }
  if (input.to !== null && input.to !== undefined) {
    if (typeof input.to !== 'string' || !ISO_RE.test(input.to)) {
      return { ok: false, message: 'to must be an ISO-8601 timestamp.' };
    }
    result.to = input.to;
  }
  if (input.action !== null && input.action !== undefined) {
    if (typeof input.action !== 'string' || input.action.length > MAX_ACTION_LEN) {
      return { ok: false, message: 'action must be a short string.' };
    }
    result.action = input.action.trim().toLowerCase();
  }
  if (input.entity_type !== null && input.entity_type !== undefined) {
    if (typeof input.entity_type !== 'string' || input.entity_type.length > MAX_ENTITY_LEN) {
      return { ok: false, message: 'entity_type must be a short string.' };
    }
    result.entityType = input.entity_type.trim().toLowerCase();
  }
  if (input.actor_id !== null && input.actor_id !== undefined) {
    if (typeof input.actor_id !== 'string' || !UUID_RE.test(input.actor_id)) {
      return { ok: false, message: 'actor_id must be a UUID.' };
    }
    result.actorId = input.actor_id;
  }
  return { ok: true, filters: result };
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function buildCsv(rows: AuditRow[]): string {
  const header = [
    'created_at',
    'actor_id',
    'actor_name',
    'actor_role',
    'action',
    'entity_type',
    'entity_id',
    'ip_address',
    'metadata',
  ]
    .map(csvCell)
    .join(',');
  const lines = rows.map((row) =>
    [
      row.created_at,
      row.actor_id,
      row.actor_name,
      row.actor_role,
      row.action,
      row.entity_type,
      row.entity_id,
      row.ip_address,
      row.metadata === null || row.metadata === undefined ? '' : JSON.stringify(row.metadata),
    ]
      .map(csvCell)
      .join(','),
  );
  return `\uFEFF${[header, ...lines].join('\r\n')}`;
}

type AuditRow = Record<string, unknown> & {
  created_at: string;
  action: string;
  entity_type: string;
};

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
    console.error('export-audit-log: profile query failed', profileError.code ?? 'unknown');
    return jsonResponse({ error: { code: 'forbidden', message: 'Unable to verify caller.' } }, 403);
  }
  const p = profile as { role: string; status: string; deleted_at: string | null } | null;
  if (!p) {
    return jsonResponse(
      { error: { code: 'forbidden', message: 'Caller profile not found.' } },
      403,
    );
  }
  if (p.role !== 'admin') {
    return jsonResponse(
      { error: { code: 'forbidden', message: 'Audit export is available to admins only.' } },
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

  const body: unknown = await req.json().catch(() => null);
  const parsed = parseFilters(body);
  if (!parsed.ok) {
    return jsonResponse({ error: { code: 'validation_error', message: parsed.message } }, 422);
  }
  const { filters } = parsed;

  // --- Query v_audit_log (RLS-scoped admin SELECT) then substring-filter ---
  let query = client.from('v_audit_log').select('*');
  if (filters.from) query = query.gt('created_at', filters.from);
  if (filters.to) query = query.lt('created_at', filters.to);
  if (filters.actorId) query = query.eq('actor_id', filters.actorId);

  const { data: rows, error: logError } = await query;
  if (logError) {
    console.error('export-audit-log: audit query failed', logError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to read the audit log.' } },
      500,
    );
  }

  const all = (Array.isArray(rows) ? rows : []) as unknown[];
  const lower = (value: unknown): string => String(value ?? '').toLowerCase();
  const filtered = all
    .filter((row) => {
      const r = row as Record<string, unknown>;
      if (filters.action && !lower(r.action).includes(filters.action)) return false;
      if (filters.entityType && !lower(r.entity_type).includes(filters.entityType)) return false;
      return true;
    })
    .slice(0, MAX_ROWS) as AuditRow[];

  const csv = buildCsv(filtered);
  const now = deps.nowUnix?.() ?? Math.floor(Date.now() / 1000);
  const path = deps.randomPath
    ? deps.randomPath(now)
    : `audit-log-${now}-${crypto.randomUUID()}.csv`;
  const ttl = deps.ttlSeconds ?? EXPORT_TTL_SECONDS;

  const service = deps.makeServiceClient(deps.url);
  const uploaded = await service.storage.from(AUDIT_EXPORTS_BUCKET).upload(path, csv, {
    contentType: 'text/csv; charset=utf-8',
  });
  if (uploaded.error || !uploaded.data) {
    console.error('export-audit-log: upload failed', uploaded.error?.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to store the export.' } },
      500,
    );
  }

  const signed = await service.storage.from(AUDIT_EXPORTS_BUCKET).createSignedUrl(path, ttl);
  if (signed.error || !signed.data) {
    console.error('export-audit-log: sign failed', signed.error?.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to sign the export URL.' } },
      500,
    );
  }

  return jsonResponse(
    {
      url: signed.data.signedUrl,
      rows: filtered.length,
      expiresAt: new Date((now + ttl) * 1000).toISOString(),
    },
    200,
  );
}
