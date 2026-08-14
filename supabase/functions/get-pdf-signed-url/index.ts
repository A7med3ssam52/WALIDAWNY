// =====================================================================
// get-pdf-signed-url — Phase 6 | Edge Function | Function 4
// ARCHITECTURE.md §8.4 row 4 / BLUEPRINT.md §14 row 4 / SECURITY.md §7.
// POST + JWT (config.toml: [functions.get-pdf-signed-url] verify_jwt =
// true). STUDENT-ONLY (S7): staff previews are out of scope for PDFs —
// this EF serves the student lesson page's PDF viewer.
//
// Accepts `lesson_id` ONLY (client never passes a storage path — MED-7);
// the server resolves the PRIMARY READY pdf of the lesson:
//
//   POST { "lesson_id": "<uuid>" }
//   -> { pdf_url, pdf_id, lesson_id, original_name, expires_at }
//
// `pdf_url` is a Supabase Storage short-lived signed URL (service-role
// `createSignedUrl`, TTL 15 minutes) on the PRIVATE `pdfs` bucket
// (0011_storage_and_seeds.sql: private, no anon/authenticated object
// policies — content only ever leaves via this EF).
//
// Access control mirrors get-video-playback-url (the same single
// content-access gate, public.can_access_lesson 0003):
//   * STUDENT: lesson must be reachable — lesson published, unit
//     published, own live grade, grade active AND not soft-deleted (B8),
//     lesson not soft-deleted — and the student needs an ACTIVE,
//     UNEXPIRED subscription (A33). Evaluated with RLS-scoped SELECTs
//     over the caller token (the four RLS-policy helpers are not part of
//     the PostgREST RPC surface; the lessons SELECT policy 0009 already
//     filters published/own-grade/live-grade rows). Any failure ->
//     access_denied (403).
//   * STAFF and other roles -> forbidden (403): PDFs are student-facing
//     only.
//
// The primary ready PDF lookup is RLS-scoped as well: the lesson_pdfs
// SELECT policy (0009) lets students see only the READY PRIMARY row of an
// accessible lesson — the same filter is applied explicitly here
// (is_primary + is_ready + not deleted), so exactly one candidate is
// resolved.
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized              -> 401
//   forbidden                 -> 403 (role insufficient / no profile)
//   account_inactive_or_deleted -> 403
//   validation_error          -> 422 (missing/illegal lesson_id)
//   access_denied             -> 403 (student gate: lesson/subscription)
//   pdf_not_ready             -> 409 (no primary ready PDF yet)
//   internal_error            -> 500 (query/URL-build failures; raw
//                                  message never echoed)
//
// No secrets are logged anywhere in this module.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';

export const DEFAULT_TTL_SECONDS = 900; // 15 minutes
export const PDFS_BUCKET = 'pdfs';

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
  gt(column: string, value: unknown): SvcQueryResult;
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
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): Promise<{
        data: { signedUrl: string; path: string } | null;
        error: DbError | null;
      }>;
    };
  };
}

export interface Deps {
  url: string;
  /** key is the caller's Bearer token (request-scoped); anon-key position. */
  makeClient: (url: string, jwt: string) => SvcClient;
  /** service-role client (hosted env secret) for storage signing. */
  makeServiceClient: (url: string) => SvcClient;
  ttlSeconds?: number;
  /** Unix seconds (injectable for deterministic expires_at). */
  nowUnix?: () => number;
}

/** Default dependency wiring: env-driven clients (hosted Edge Runtime / local serve). */
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

export function parseLessonId(body: unknown):
  | { ok: true; lessonId: string }
  | {
      ok: false;
      message: string;
    } {
  const lessonId = (body as { lesson_id?: unknown } | null)?.lesson_id;
  if (typeof lessonId !== 'string' || !UUID_RE.test(lessonId)) {
    return { ok: false, message: 'lesson_id must be a UUID.' };
  }
  return { ok: true, lessonId };
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
    console.error('get-pdf-signed-url: profile query failed', profileError.code ?? 'unknown');
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
    return jsonResponse(
      { error: { code: 'forbidden', message: 'PDF access is available to students only.' } },
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

  // --- 3) lesson_id from the JSON body (never a storage path) ---
  const body: unknown = await req.json().catch(() => null);
  const parsed = parseLessonId(body);
  if (!parsed.ok) {
    return jsonResponse({ error: { code: 'validation_error', message: parsed.message } }, 422);
  }
  const lessonId = parsed.lessonId;

  // --- 4) Lesson reachability (RLS-scoped; see header) ---
  const { data: lesson, error: lessonError } = await client
    .from('lessons')
    .select('id,deleted_at')
    .eq('id', lessonId)
    .maybeSingle();
  if (lessonError) {
    console.error('get-pdf-signed-url: lesson query failed', lessonError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate lesson.' } },
      500,
    );
  }
  const lessonRow = lesson as { id: string; deleted_at: string | null } | null;
  if (!lessonRow || lessonRow.deleted_at !== null) {
    // a student-invisible or soft-deleted lesson is a denied lesson
    return jsonResponse(
      { error: { code: 'access_denied', message: 'Lesson is not accessible.' } },
      403,
    );
  }

  // --- 5) Student subscription gate (A33) ---
  const { data: subscription, error: subError } = await client
    .from('subscriptions')
    .select('id')
    .eq('student_id', user.id)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (subError) {
    console.error('get-pdf-signed-url: subscription query failed', subError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate subscription.' } },
      500,
    );
  }
  if (!subscription) {
    return jsonResponse(
      { error: { code: 'access_denied', message: 'An active subscription is required.' } },
      403,
    );
  }

  // --- 6) The PRIMARY READY PDF (explicit filter; the 0009 policy
  // additionally gates the student branch on can_access_lesson) ---
  const { data: pdf, error: pdfError } = await client
    .from('lesson_pdfs')
    .select('id,storage_path,original_name')
    .eq('lesson_id', lessonId)
    .eq('is_primary', true)
    .eq('is_ready', true)
    .eq('deleted_at', null)
    .maybeSingle();
  if (pdfError) {
    console.error('get-pdf-signed-url: pdf query failed', pdfError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to resolve the pdf.' } },
      500,
    );
  }
  if (!pdf) {
    return jsonResponse(
      {
        error: {
          code: 'pdf_not_ready',
          message: 'The primary pdf for this lesson is not ready yet.',
        },
      },
      409,
    );
  }
  const pdfRow = pdf as { id: string; storage_path: string; original_name: string | null };

  // --- 7) Short-lived signed URL on the private bucket (service role) ---
  try {
    const service = deps.makeServiceClient(deps.url);
    const { data: signed, error: storageError } = await service.storage
      .from(PDFS_BUCKET)
      .createSignedUrl(pdfRow.storage_path, deps.ttlSeconds ?? DEFAULT_TTL_SECONDS);
    if (storageError || !signed?.signedUrl) {
      console.error('get-pdf-signed-url: createSignedUrl failed', storageError?.code ?? 'unknown');
      return jsonResponse(
        { error: { code: 'internal_error', message: 'Failed to build the signed URL.' } },
        500,
      );
    }
    const now = deps.nowUnix ? deps.nowUnix() : Math.floor(Date.now() / 1000);
    return jsonResponse(
      {
        pdf_url: signed.signedUrl,
        pdf_id: pdfRow.id,
        lesson_id: lessonId,
        original_name: pdfRow.original_name,
        expires_at: new Date((now + (deps.ttlSeconds ?? DEFAULT_TTL_SECONDS)) * 1000).toISOString(),
      },
      200,
    );
  } catch (error) {
    console.error('get-pdf-signed-url: storage signing failed', String(error));
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to build the signed URL.' } },
      500,
    );
  }
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
