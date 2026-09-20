// =====================================================================
// generate-exam-questions — AI question generator (Gemini) for general exams
// POST + JWT (config.toml: [functions.generate-exam-questions]
// verify_jwt = true).
//
// ADMIN-ONLY by design (the UI hides the entry from assistant/teacher,
// and this function re-enforces it: any non-admin caller gets
// `forbidden`, even with a valid token).
//
// Two modes:
//   * "generate": topic (+ optional reference text) -> fresh questions.
//   * "format":   pasted raw text -> structured questions (detects marked
//     answers like ✓/*/صح, otherwise picks from knowledge + needs_review).
// Optional images (max 3, already uploaded via upload-exam-image):
//   the model reads them (Vision) and references them by 1-based index;
//   this function maps the references back to the verified storage paths
//   (paths MUST live under the target exam_id/ prefix — cross-exam
//   references are rejected).
//
// Human-in-the-loop is a UI decision; this function only PROPOSES —
// saving goes through the normal staff question DML afterwards.
//
// Request:
//   POST {
//     mode: "generate" | "format", exam_id: "<uuid>",
//     topic?: string, grade_name?: string,
//     mcq_count?: number, essay_count?: number,
//     difficulty?: "easy" | "medium" | "hard" | "mixed",
//     context?: string,            // generate-mode reference text
//     raw_text?: string,           // format-mode pasted text
//     images?: [{ storage_path: string }]  // max 3, under exam_id/
//   }
// Response:
//   { exam_id, mode, questions: [{
//       type, prompt, choices, correct_index, max_score, needs_review,
//       prompt_image_path, choice_image_paths }] }
//
// Gemini key comes from the GEMINI_API_KEY secret (never in code).
// Missing secret -> `ai_not_configured` (deploy works without the key).
//
// Error envelope: { error: { code, message } } with stable codes:
//   unauthorized, forbidden, account_inactive_or_deleted, invalid_json,
//   validation_error, invalid_topic, invalid_text, invalid_counts,
//   invalid_image, image_too_large, exam_not_found, not_general_exam,
//   ai_not_configured, ai_failed, ai_bad_output, internal_error
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { jsonResponse, preflightResponse } from '../_shared/cors.ts';

export const EXAM_IMAGES_BUCKET = 'exam-images';
// Verified live against the project key: versioned 2.x models are retired
// for new accounts and the -latest alias is unreliable (503s); this
// preview build returns the exact JSON contract.
export const GEMINI_MODEL = 'gemini-3-flash-preview';
export const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
export const MAX_QUESTIONS_PER_CALL = 20;
export const MAX_IMAGES_PER_CALL = 3;
export const MAX_IMAGE_BYTES_FOR_AI = 4 * 1024 * 1024;
export const ADMIN_ROLE = 'admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$/i;

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

export interface SvcStorageBucket {
  download(
    path: string,
  ): Promise<{ data: { arrayBuffer(): Promise<ArrayBuffer>; type?: string } | null; error: DbError | null }>;
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
  storage: { from(bucket: string): SvcStorageBucket };
}

export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export interface Deps {
  url: string;
  makeClient: (url: string, jwt: string) => SvcClient;
  makeServiceClient: (url: string) => SvcClient;
  fetchImpl: FetchImpl;
  geminiKey: string;
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
    fetchImpl: (input, init) => fetch(input, init),
    geminiKey: Deno.env.get('GEMINI_API_KEY') ?? '',
  };
}

// ---------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------

export type Mode = 'generate' | 'format';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';

export interface ValidRequest {
  mode: Mode;
  examId: string;
  topic: string;
  gradeName: string;
  mcqCount: number;
  essayCount: number;
  difficulty: Difficulty;
  context: string;
  rawText: string;
  imagePaths: string[];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

export function parseBody(raw: unknown):
  | { ok: true; body: ValidRequest }
  | { ok: false; code: string; message: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, code: 'invalid_json', message: 'Request body must be a JSON object.' };
  }
  const r = raw as Record<string, unknown>;
  const mode = r.mode;
  if (mode !== 'generate' && mode !== 'format') {
    return { ok: false, code: 'validation_error', message: 'mode must be "generate" or "format".' };
  }
  const examId = asString(r.exam_id);
  if (!UUID_RE.test(examId)) {
    return { ok: false, code: 'validation_error', message: 'exam_id must be a UUID.' };
  }

  const imagesRaw = Array.isArray(r.images) ? r.images : [];
  if (imagesRaw.length > MAX_IMAGES_PER_CALL) {
    return { ok: false, code: 'invalid_image', message: `At most ${MAX_IMAGES_PER_CALL} images per call.` };
  }
  const imagePaths: string[] = [];
  for (const item of imagesRaw) {
    const path = (item as { storage_path?: unknown } | null)?.storage_path;
    if (typeof path !== 'string' || !IMAGE_PATH_RE.test(path)) {
      return { ok: false, code: 'invalid_image', message: 'Invalid image storage_path.' };
    }
    // Cross-exam references are rejected: the path must live under exam_id/.
    if (!path.toLowerCase().startsWith(`${examId.toLowerCase()}/`)) {
      return { ok: false, code: 'invalid_image', message: 'Image does not belong to this exam.' };
    }
    imagePaths.push(path);
  }

  if (mode === 'generate') {
    const topic = asString(r.topic).trim();
    if (!topic) {
      return { ok: false, code: 'invalid_topic', message: 'topic is required.' };
    }
    if (topic.length > 300) {
      return { ok: false, code: 'invalid_topic', message: 'topic is too long (max 300 chars).' };
    }
    const mcq = asInt(r.mcq_count) ?? 5;
    const essay = asInt(r.essay_count) ?? 1;
    if (mcq < 0 || mcq > 15 || essay < 0 || essay > 5 || mcq + essay < 1 || mcq + essay > MAX_QUESTIONS_PER_CALL) {
      return { ok: false, code: 'invalid_counts', message: `mcq 0..15, essay 0..5, total 1..${MAX_QUESTIONS_PER_CALL}.` };
    }
    const difficulty = asString(r.difficulty) || 'mixed';
    if (!['easy', 'medium', 'hard', 'mixed'].includes(difficulty)) {
      return { ok: false, code: 'validation_error', message: 'Invalid difficulty.' };
    }
    const context = asString(r.context);
    if (context.length > 6000) {
      return { ok: false, code: 'validation_error', message: 'context is too long (max 6000 chars).' };
    }
    return {
      ok: true,
      body: {
        mode, examId, topic,
        gradeName: asString(r.grade_name).slice(0, 120),
        mcqCount: mcq, essayCount: essay,
        difficulty: difficulty as Difficulty,
        context, rawText: '', imagePaths,
      },
    };
  }

  const rawText = asString(r.raw_text).trim();
  if (rawText.length < 20) {
    return { ok: false, code: 'invalid_text', message: 'raw_text is too short (min 20 chars).' };
  }
  if (rawText.length > 8000) {
    return { ok: false, code: 'invalid_text', message: 'raw_text is too long (max 8000 chars).' };
  }
  return {
    ok: true,
    body: {
      mode, examId, topic: '', gradeName: asString(r.grade_name).slice(0, 120),
      mcqCount: 0, essayCount: 0, difficulty: 'mixed',
      context: '', rawText, imagePaths,
    },
  };
}

// ---------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------

const DIFFICULTY_AR: Record<Difficulty, string> = {
  easy: 'سهلة',
  medium: 'متوسطة',
  hard: 'صعبة',
  mixed: 'متنوعة (سهلة ومتوسطة وصعبة)',
};

const OUTPUT_CONTRACT = `أعد JSON فقط بهذا الشكل (بدون أي نص خارجه):
{"questions":[{"type":"mcq"|"essay","prompt":"نص السؤال","choices":["أ","ب","ج","د"] أو null للمقالي,"correct_index":رقم الصحيح أو null للمقالي,"max_score":1,"needs_review":false,"prompt_image":رقم الصورة (1-based) أو null,"choice_images":[أرقام الصور أو null لكل اختيار] أو null}]}
قواعد ملزمة:
- الاختياري: 4 اختيارات نصية غير فارغة، وcorrect_index صحيح واحد (0-based).
- المقالي: choices=null وcorrect_index=null وmax_score أكبر (2-5).
- needs_review=true عند أي شك (إجابة غير مؤكدة، صياغة غامضة).
- الصور المرفقة مرقمة [IMAGE_1..N]: ضع رقم الصورة في prompt_image إذا كان السؤال عنها، أو في choice_images بمحاذاة الاختيارات. لا تخترع صوراً غير موجودة. إذا لا توجد صور مرفقة فكل الحقول null.
- اللغة: العربية الفصيحة المبسطة المناسبة للمرحلة.`;

export function buildPrompt(body: ValidRequest, imageCount: number): string {
  const imageNote = imageCount > 0
    ? `\nالصور المرفقة (${imageCount}): ${Array.from({ length: imageCount }, (_, i) => `[IMAGE_${i + 1}]`).join(' ')} — اقرأها بعين خبير واربط كل سؤال بصورته كما في القواعد.`
    : `\nلا توجد صور مرفقة — كل حقول الصور null.`;
  if (body.mode === 'generate') {
    const contextBlock = body.context.trim()
      ? `\nالنص المرجعي (التزم به ولا تخرج عنه):\n"""${body.context.trim()}"""`
      : '';
    return `أنت خبير مناهج مصرية. ولّد امتحاناً عن الموضوع التالي.
الصف: ${body.gradeName || 'غير محدد'} | الموضوع: ${body.topic} | المستوى: ${DIFFICULTY_AR[body.difficulty]}
المطلوب: ${body.mcqCount} سؤال اختياري + ${body.essayCount} سؤال مقالي.${contextBlock}${imageNote}
${OUTPUT_CONTRACT}`;
  }
  return `أنت خبير مناهج مصرية. النص التالي أسئلة خام (قد تكون غير منظمة). نظّمها لأسئلة امتحان.
الصف: ${body.gradeName || 'غير محدد'}
النص الخام:
"""${body.rawText}"""
تعليمات: استخرج كل سؤال. إذا وُجدت علامة على إجابة (✓ أو * أو كلمة صح) اعتبرها الصحيحة. إن لم توجد علامة فحدد الصحيحة من علمك وضع needs_review=true. حافظ على معنى الأسئلة ولا تخترع أسئلة جديدة.${imageNote}
${OUTPUT_CONTRACT}`;
}

// ---------------------------------------------------------------------
// Output validation (mirrors the DB CHECKs)
// ---------------------------------------------------------------------

export interface GeneratedQuestion {
  type: 'mcq' | 'essay';
  prompt: string;
  choices: string[] | null;
  correct_index: number | null;
  max_score: number;
  needs_review: boolean;
  prompt_image_path: string | null;
  choice_image_paths: (string | null)[] | null;
}

function cleanStr(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

/** Map 1-based image refs to verified storage paths (unknown refs -> null). */
export function normalizeQuestions(raw: unknown, imagePaths: string[]): GeneratedQuestion[] {
  const list = (raw as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return [];
  const out: GeneratedQuestion[] = [];
  for (const item of list.slice(0, MAX_QUESTIONS_PER_CALL)) {
    const q = item as Record<string, unknown>;
    if (q.type !== 'mcq' && q.type !== 'essay') continue;
    const prompt = cleanStr(q.prompt, 2000);
    if (!prompt) continue;
    let maxScore = typeof q.max_score === 'number' && Number.isFinite(q.max_score) ? q.max_score : 1;
    if (maxScore <= 0 || maxScore > 100) maxScore = 1;
    const needsReview = q.needs_review === true;

    const refToPath = (ref: unknown): string | null => {
      if (typeof ref !== 'number' || !Number.isInteger(ref)) return null;
      return imagePaths[ref - 1] ?? null;
    };

    if (q.type === 'mcq') {
      const rawChoices = Array.isArray(q.choices) ? q.choices : [];
      const choices = rawChoices
        .map((c) => (typeof c === 'string' ? c.trim() : ''))
        .filter((c) => c)
        .slice(0, 6)
        .map((c) => (c.length > 500 ? c.slice(0, 500) : c));
      if (choices.length < 2) continue;
      const correct = typeof q.correct_index === 'number' && Number.isInteger(q.correct_index)
        ? q.correct_index
        : -1;
      if (correct < 0 || correct >= choices.length) continue;
      const choiceImagesRaw = Array.isArray(q.choice_images) ? q.choice_images : null;
      const choiceImages = choiceImagesRaw
        ? choices.map((_, i) => refToPath(choiceImagesRaw[i]))
        : null;
      out.push({
        type: 'mcq', prompt, choices, correct_index: correct,
        max_score: maxScore, needs_review: needsReview,
        prompt_image_path: refToPath(q.prompt_image),
        choice_image_paths: choiceImages,
      });
    } else {
      out.push({
        type: 'essay', prompt, choices: null, correct_index: null,
        max_score: maxScore, needs_review: needsReview,
        prompt_image_path: refToPath(q.prompt_image),
        choice_image_paths: null,
      });
    }
  }
  return out;
}

export function extractJson(text: string): unknown | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export function base64Encode(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------

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
    console.error('generate-exam-questions: profile query failed', profileError.code ?? 'unknown');
    return jsonResponse({ error: { code: 'forbidden', message: 'Unable to verify caller.' } }, 403);
  }
  const p = profile as { role: string; status: string; deleted_at: string | null } | null;
  if (!p) {
    return jsonResponse({ error: { code: 'forbidden', message: 'Caller profile not found.' } }, 403);
  }
  // ADMIN-ONLY: assistant / teacher / mr_walid are rejected here even though
  // they hold general-exam write access elsewhere.
  if (p.role !== ADMIN_ROLE) {
    return jsonResponse({ error: { code: 'forbidden', message: 'Admin only.' } }, 403);
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
  const parsed = parseBody(rawBody);
  if (!parsed.ok) {
    const status = parsed.code === 'invalid_json' ? 400 : 422;
    return jsonResponse({ error: { code: parsed.code, message: parsed.message } }, status);
  }
  const body = parsed.body;

  // The generation must target a live general exam (ties usage to the flow).
  const { data: exam, error: examError } = await client
    .from('exams')
    .select('id,lesson_id,grade_id,deleted_at')
    .eq('id', body.examId)
    .maybeSingle();
  if (examError) {
    console.error('generate-exam-questions: exam query failed', examError.code ?? 'unknown');
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to validate exam.' } },
      500,
    );
  }
  const examRow = exam as { id: string; lesson_id: string | null; grade_id: string | null; deleted_at: string | null } | null;
  if (!examRow || examRow.deleted_at !== null) {
    return jsonResponse({ error: { code: 'exam_not_found', message: 'Exam not found.' } }, 404);
  }
  if (examRow.lesson_id !== null || examRow.grade_id === null) {
    return jsonResponse({ error: { code: 'not_general_exam', message: 'Not a general exam.' } }, 422);
  }

  if (!deps.geminiKey) {
    return jsonResponse(
      { error: { code: 'ai_not_configured', message: 'Gemini API key is not configured.' } },
      503,
    );
  }

  // Fetch attached images (service role) for Vision input.
  const imageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  try {
    const service = deps.makeServiceClient(deps.url);
    for (const path of body.imagePaths) {
      const { data: blob, error: dlError } = await service.storage
        .from(EXAM_IMAGES_BUCKET)
        .download(path);
      if (dlError || !blob) {
        console.error('generate-exam-questions: image download failed', dlError?.code ?? 'unknown');
        return jsonResponse(
          { error: { code: 'invalid_image', message: 'Failed to read an attached image.' } },
          422,
        );
      }
      const bytes = await blob.arrayBuffer();
      if (bytes.byteLength > MAX_IMAGE_BYTES_FOR_AI) {
        return jsonResponse(
          { error: { code: 'image_too_large', message: 'Attached image is too large (max 4MB for AI).' } },
          422,
        );
      }
      imageParts.push({ inlineData: { mimeType: mimeFromPath(path), data: base64Encode(bytes) } });
    }
  } catch (error) {
    console.error('generate-exam-questions: image fetch failed', String(error));
    return jsonResponse(
      { error: { code: 'internal_error', message: 'Failed to read attached images.' } },
      500,
    );
  }

  // Call Gemini.
  let modelText: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let res: Response;
    try {
      res = await deps.fetchImpl(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': deps.geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(body, body.imagePaths.length) }, ...imageParts] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 8192 },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      console.error('generate-exam-questions: gemini status', res.status);
      return jsonResponse(
        { error: { code: 'ai_failed', message: 'AI generation failed, try again.' } },
        502,
      );
    }
    const payload = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    modelText = (payload.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');
    if (!modelText.trim()) {
      return jsonResponse(
        { error: { code: 'ai_bad_output', message: 'AI returned an empty response.' } },
        502,
      );
    }
  } catch (error) {
    console.error('generate-exam-questions: gemini call failed', String(error));
    return jsonResponse(
      { error: { code: 'ai_failed', message: 'AI generation failed, try again.' } },
      502,
    );
  }

  const questions = normalizeQuestions(extractJson(modelText), body.imagePaths);
  if (questions.length === 0) {
    return jsonResponse(
      { error: { code: 'ai_bad_output', message: 'AI returned no valid questions.' } },
      502,
    );
  }

  return jsonResponse({ exam_id: body.examId, mode: body.mode, questions }, 200);
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, defaultDeps()));
}
