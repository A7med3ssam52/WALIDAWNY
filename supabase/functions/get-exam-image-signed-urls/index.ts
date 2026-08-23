// =====================================================================
// get-exam-image-signed-urls — Phase 12 | Edge Function | Exam Images
// POST + JWT (config.toml: [functions.get-exam-image-signed-urls]
// verify_jwt = true). Serves exam question images for BOTH students
// and staff (staff preview).
//
// Accepts `exam_id` ONLY (client never passes a storage path — MED-7);
// the server resolves the exam's questions and signs each stored image
// path (prompt_image_path + choice_image_paths).
//
//   POST { "exam_id": "<uuid>" }
//   -> { exam_id, images: [{ question_id, prompt_image_url, choice_image_urls }] }
//
// Each `*_url` is a Supabase Storage short-lived signed URL
// (service-role createSignedUrl, TTL 15 minutes) on the PRIVATE
// `exam-images` bucket — content only ever leaves via this EF.
//
// Access control:
//   * STUDENT: the exam's lesson must be reachable (not soft-deleted) AND
//     the student needs access to THIS lesson (can_access_lesson via
//     get_my_lesson_access). has_access != true -> access_denied.
//   * STAFF (admin / mr_walid / teacher): allowed directly (preview).
//   * Other roles -> forbidden.
//   * Inactive / soft-deleted accounts rejected.
//
// No image -> null URL (client renders nothing). Empty exam -> empty array.
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized, forbidden, account_inactive_or_deleted, invalid_json,
//   validation_error, access_denied, internal_error
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';

export const DEFAULT_TTL_SECONDS = 900; // 15 minutes
export const EXAM_IMAGES_BUCKET = 'exam-images';
export const STAFF_ROLES: ReadonlySet<string> = new Set(['admin', 'mr_walid', 'teacher']);

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
  makeClient: (url: string, jwt: string) => SvcClient;
  makeServiceClient: (url: string) => SvcClient;
  ttlSeconds?: number;
}

export function defaultDeps(): Deps {
  return {
    url: Deno.env.get('SUPABASE_URL') ?? '',
    makeClient: (url, jwt) =>
      createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SvcClient,
    makeServiceClient: (url) =>
      createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SvcClient,
  };
}

export function parseExamId(body: unknown):
  | { ok: true; examId: string }
  | { ok: false; message: string } {
  const examId = (body as { exam_id?: unknown } | null)?.exam_id;
  if (typeof examId !== 'string' || !UUID_RE.test(examId)) {
    return { ok: false, message: 'exam_id must be a UUID.' };
  }
  return { ok: true, examId };
}

interface QuestionRow {
  id: string;
  exam_id: string;
  prompt_image_path: string | null;
  choice_image_paths: unknown;
}

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
    console.error('get-exam-image-signed-urls: profile query failed', profileError.code ?? 'unknown');
    return jsonResponse({ error: { code: 'forbidden', message: 'Unable to verify caller.' } }, 403);
  }
  const p = profile as { role: string; status: string; deleted_at: string | null } | null;
  if (!p) {
    return jsonResponse({ error: { code: 'forbidden', message: 'Caller profile not found.' } }, 403);
  }
  const isStudent = p.role === 'student';
  if (!isStudent && !STAFF_ROLES.has(p.role)) {
    return jsonResponse({ error: { code: 'forbidden', message: 'Insufficient privileges.' } }, 403);
  }
  if (p.status !== 'active' || p.deleted_at !== null) {
    return jsonResponse(
      { error: { code: 'account_inactive_or_deleted', message: 'Account is disabled or deleted.' } },
      403,
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse(
      { error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } },
      400,
    );
  }
  const parsed = parseExamId(rawBody);
  if (!parsed.ok) {
    return jsonResponse({ error: { code: 'validation_error', message: parsed.message } }, 422);
  }
  const examId = parsed.examId;

  // --- exam + lesson reachability ---
  const { data: exam, error: examError } = await client
    .from('exams')
    .select('id,lesson_id,deleted_at')
    .eq('id', examId)
    .maybeSingle();
  if (examError) {
    console.error('get-exam-image-signed-urls: exam query failed', examError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate exam.' } },
      500,
    );
  }
  const examRow = exam as { id: string; lesson_id: string; deleted_at: string | null } | null;
  if (!examRow || examRow.deleted_at !== null) {
    return jsonResponse({ error: { code: 'access_denied', message: 'Exam is not accessible.' } }, 403);
  }

  const { data: lesson, error: lessonError } = await client
    .from('lessons')
    .select('id,deleted_at')
    .eq('id', examRow.lesson_id)
    .maybeSingle();
  if (lessonError) {
    console.error('get-exam-image-signed-urls: lesson query failed', lessonError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate lesson.' } },
      500,
    );
  }
  const lessonRow = lesson as { id: string; deleted_at: string | null } | null;
  if (!lessonRow || lessonRow.deleted_at !== null) {
    return jsonResponse({ error: { code: 'access_denied', message: 'Lesson is not accessible.' } }, 403);
  }

  if (isStudent) {
    const { data: access, error: accessError } = await client.rpc('get_my_lesson_access', {
      p_lesson_id: examRow.lesson_id,
    });
    if (accessError) {
      console.error(
        'get-exam-image-signed-urls: lesson access check failed',
        accessError.code ?? 'unknown',
      );
      return jsonResponse(
        { error: { code: 'internal_error', message: 'Failed to validate lesson access.' } },
        500,
      );
    }
    const accessInfo = access as { has_access: boolean } | null;
    if (!accessInfo || accessInfo.has_access !== true) {
      return jsonResponse(
        { error: { code: 'access_denied', message: 'Lesson access is required.' } },
        403,
      );
    }
  }

  // --- fetch questions with image paths ---
  const { data: rows, error: qError } = await client
    .from('exam_questions')
    .select('id,exam_id,prompt_image_path,choice_image_paths')
    .eq('exam_id', examId);
  if (qError) {
    console.error('get-exam-image-signed-urls: questions query failed', qError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to resolve the questions.' } },
      500,
    );
  }
  const questions = (rows as QuestionRow[] | null) ?? [];

  // collect distinct paths to sign
  const pathToUrl = new Map<string, string>();
  const allPaths: string[] = [];
  for (const q of questions) {
    if (q.prompt_image_path) allPaths.push(q.prompt_image_path);
    if (Array.isArray(q.choice_image_paths)) {
      for (const p of q.choice_image_paths) {
        if (typeof p === 'string' && p) allPaths.push(p);
      }
    }
  }
  const distinct = [...new Set(allPaths)];

  try {
    const service = deps.makeServiceClient(deps.url);
    const ttl = deps.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    for (const path of distinct) {
      const { data: signed, error: storageError } = await service.storage
        .from(EXAM_IMAGES_BUCKET)
        .createSignedUrl(path, ttl);
      if (storageError || !signed?.signedUrl) {
        console.error(
          'get-exam-image-signed-urls: createSignedUrl failed',
          storageError?.code ?? 'unknown',
        );
        return jsonResponse(
          { error: { code: 'internal_error', message: 'Failed to build the signed URL.' } },
          500,
        );
      }
      pathToUrl.set(path, signed.signedUrl);
    }

    const images = questions.map((q) => {
      const promptUrl = q.prompt_image_path ? (pathToUrl.get(q.prompt_image_path) ?? null) : null;
      let choiceUrls: (string | null)[] | null = null;
      if (Array.isArray(q.choice_image_paths)) {
        choiceUrls = (q.choice_image_paths as unknown[]).map((p) => {
          if (typeof p === 'string' && p) return pathToUrl.get(p) ?? null;
          return null;
        });
      }
      return {
        question_id: q.id,
        prompt_image_url: promptUrl,
        choice_image_urls: choiceUrls,
      };
    });

    return jsonResponse({ exam_id: examId, images }, 200);
  } catch (error) {
    console.error('get-exam-image-signed-urls: storage signing failed', String(error));
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to build the signed URL.' } },
      500,
    );
  }
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
