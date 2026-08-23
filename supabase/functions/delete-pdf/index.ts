// =====================================================================
// delete-pdf — Phase 4 | Edge Function
// ARCHITECTURE.md §8.3 (Supabase Storage) / SECURITY.md §7 (EF security
// model). POST, JWT-verified (config.toml: [functions.delete-pdf]
// verify_jwt = true).
//
// Deletes a lesson_pdfs row (pending ghost row OR finalized/ready PDF)
// together with its Storage object, so staff can clean failed uploads
// and remove outdated course material from the staff UI (0043 extended
// deletion to ready rows):
//   1. validates the request (lesson_id + pdf_id UUIDs),
//   2. checks the caller role over the caller-token client
//      (STAFF_ROLES: admin / mr_walid / teacher),
//   3. reads the row with id + lesson_id + deleted_at IS NULL → when
//      absent -> 404 pdf_not_found (the pre-check for UX),
//   4. removes the Storage object best-effort
//      (client.storage.from('pdfs').remove([storage_path])) → an
//      object without a row is orphaned storage; a removal failure
//      must not fail the operation,
//   5. hard-deletes the row through the staff-guarded SECURITY DEFINER
//      RPC public.delete_pdf_upload_record (migrations/0037+0043) →
//      authoritative backstop, audited ('pdf.upload_cancelled' for
//      non-ready rows, 'pdf.deleted' for ready ones),
//   6. returns { deleted: true, pdf_id }.
//
// Actor plumbing: request-scoped client with the anon key in the key slot
// and the caller's JWT in Authorization — never a
// service-role client (Phase 3 pattern, 0014).
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized              -> 401
//   forbidden                 -> 403 (role insufficient / no profile)
//   account_inactive_or_deleted -> 403
//   invalid_json              -> 400
//   validation_error          -> 422 (bad lesson_id / pdf_id)
//   pdf_not_found             -> 404
//   wrong_lesson              -> 422 (wrapper backstop)
//   permission_denied         -> 403 (wrapper guard)
//   function_error            -> 502 (any other wrapper failure; raw
//                                  message never echoed)
//
// Success: { deleted: true, pdf_id }.
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';

export const STAFF_ROLES: ReadonlySet<string> = new Set(['admin', 'mr_walid', 'teacher']);
export const PDF_BUCKET = 'pdfs';

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
  is(column: string, value: unknown): SvcQueryResult;
  maybeSingle(): Promise<{ data: unknown; error: DbError | null }>;
}

export interface SvcStorageFrom {
  remove(paths: string[]): Promise<{ data: { path: string }[] | null; error: DbError | null }>;
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

interface DeletePdfBody {
  lesson_id: string;
  pdf_id: string;
}

function parseDeleteBody(raw: unknown):
  | { ok: true; body: DeletePdfBody }
  | {
      ok: false;
      code: string;
      message: string;
    } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, code: 'validation_error', message: 'Request body must be a JSON object.' };
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.lesson_id !== 'string' || !UUID_RE.test(record.lesson_id)) {
    return { ok: false, code: 'validation_error', message: 'lesson_id must be a UUID.' };
  }
  if (typeof record.pdf_id !== 'string' || !UUID_RE.test(record.pdf_id)) {
    return { ok: false, code: 'validation_error', message: 'pdf_id must be a UUID.' };
  }
  return { ok: true, body: { lesson_id: record.lesson_id, pdf_id: record.pdf_id } };
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

  // --- 2) Role + active/not-deleted profile check, re-derived from DB ---
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role,status,deleted_at')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('delete-pdf: profile query failed', profileError.code ?? 'unknown');
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

  // --- 3) Body validation ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse(
      { error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } },
      400,
    );
  }
  const parsed = parseDeleteBody(rawBody);
  if (!parsed.ok) {
    return jsonResponse({ error: { code: parsed.code, message: parsed.message } }, 422);
  }
  const { lesson_id: lessonId, pdf_id: pdfId } = parsed.body;

  // --- 4) The row must exist, belong to the lesson and not be soft-deleted.
  // Pre-check over the caller token; the 0037/0043 wrapper re-validates
  // atomically (authoritative). ---
  const { data: pdf, error: pdfError } = await client
    .from('lesson_pdfs')
    .select('id,lesson_id,deleted_at,storage_path')
    .eq('id', pdfId)
    .eq('lesson_id', lessonId)
    .is('deleted_at', null)
    .maybeSingle();
  if (pdfError) {
    console.error('delete-pdf: pdf query failed', pdfError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate the pdf row.' } },
      500,
    );
  }
  const row = pdf as {
    id: string;
    lesson_id: string;
    deleted_at: string | null;
    storage_path: string;
  } | null;
  if (!row) {
    return jsonResponse({ error: { code: 'pdf_not_found', message: 'PDF row not found.' } }, 404);
  }

  // --- 5) Storage object removed best-effort (an object without a row
  // is orphaned storage; a removal failure must not fail the delete) ---
  const { error: storageError } = await client.storage.from(PDF_BUCKET).remove([row.storage_path]);
  if (storageError) {
    console.error('delete-pdf: storage remove failed', storageError.code ?? 'unknown');
  }

  // --- 6) Hard-delete through the staff-guarded wrapper ---
  const { error: rpcError } = await client.rpc('delete_pdf_upload_record', {
    p_lesson_id: lessonId,
    p_pdf_id: pdfId,
  });
  if (rpcError) {
    console.error('delete-pdf: delete RPC failed', rpcError.code ?? 'unknown');
    if (rpcError.code === 'permission_denied') {
      return jsonResponse(
        { error: { code: 'permission_denied', message: 'Insufficient privileges.' } },
        403,
      );
    }
    if (rpcError.code === 'pdf_not_found') {
      return jsonResponse({ error: { code: 'pdf_not_found', message: 'PDF row not found.' } }, 404);
    }
    if (rpcError.code === 'wrong_lesson') {
      return jsonResponse(
        { error: { code: 'wrong_lesson', message: 'PDF belongs to another lesson.' } },
        422,
      );
    }
    return jsonResponse(
      { error: { code: 'function_error', message: 'Failed to delete the PDF row.' } },
      502,
    );
  }

  return jsonResponse({ deleted: true, pdf_id: pdfId }, 200);
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}