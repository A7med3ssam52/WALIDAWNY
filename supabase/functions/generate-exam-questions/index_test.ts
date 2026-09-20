// Unit tests for generate-exam-questions (admin-only AI generator)
import { handle } from './index.ts';
import { assert, assertEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const USER_ADMIN = { id: '70000000-0000-0000-0000-00000000000a' };
const USER_TEACHER = { id: '70000000-0000-0000-0000-00000000000b' };
const EXAM_ID = 'ac000000-0000-0000-0000-000000000001';
const GRADE_ID = '10000000-0000-0000-0000-000000000001';
const IMG_PATH = `${EXAM_ID}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`;

const GEMINI_OK = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              questions: [
                {
                  type: 'mcq', prompt: 'Q1', choices: ['أ', 'ب'], correct_index: 1,
                  max_score: 2, needs_review: false, prompt_image: null, choice_images: null,
                },
                {
                  type: 'essay', prompt: 'Q2', choices: null, correct_index: null,
                  max_score: 5, needs_review: true, prompt_image: 1, choice_images: null,
                },
                // invalid entries must be dropped, not crash
                { type: 'mcq', prompt: '', choices: ['أ'], correct_index: 9 },
                { type: 'weird', prompt: 'nope' },
              ],
            }),
          },
        ],
      },
    },
  ],
};

function post(body: unknown, user: { id: string }): Request {
  return new Request('https://example.supabase.co/functions/v1/generate-exam-questions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.id}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function adminCfg(overrides?: Partial<StubConfig>): StubConfig {
  const base: StubConfig = {
    user: USER_ADMIN,
    tables: {
      profiles: { rows: [{ id: USER_ADMIN.id, role: 'admin', status: 'active', deleted_at: null }] },
      exams: { rows: [{ id: EXAM_ID, lesson_id: null, grade_id: GRADE_ID, deleted_at: null }] },
    },
  };
  return {
    ...base,
    ...overrides,
    tables: { ...base.tables, ...(overrides?.tables ?? {}) },
  };
}

function deps(cfg: StubConfig, geminiBody: unknown = GEMINI_OK, geminiKey = 'test-key') {
  const { client } = makeStubClient(cfg);
  const fetchCalls: Array<{ url: string; body: unknown }> = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    fetchCalls.push({ url: input, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(geminiBody), { status: 200 });
  };
  return {
    dep: {
      url: 'https://example.supabase.co',
      makeClient: () => client,
      makeServiceClient: () => client,
      fetchImpl,
      geminiKey,
    },
    fetchCalls,
  };
}

const GEN_BODY = {
  mode: 'generate', exam_id: EXAM_ID, topic: 'قانون أوم',
  grade_name: 'الثالث الثانوي', mcq_count: 1, essay_count: 1, difficulty: 'medium',
};

Deno.test('generate-exam-questions: teacher is rejected (admin-only)', async () => {
  const { dep } = deps(
    adminCfg({
      user: USER_TEACHER,
      tables: { profiles: { rows: [{ id: USER_TEACHER.id, role: 'teacher', status: 'active', deleted_at: null }] } },
    }),
  );
  const res = await handle(post(GEN_BODY, USER_TEACHER), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('generate-exam-questions: missing key -> ai_not_configured', async () => {
  const { dep } = deps(adminCfg(), GEMINI_OK, '');
  const res = await handle(post(GEN_BODY, USER_ADMIN), dep);
  await expectStatus(res, 503);
  const body = await res.json();
  assertEqual(body.error.code, 'ai_not_configured');
});

Deno.test('generate-exam-questions: invalid mode -> 422', async () => {
  const { dep } = deps(adminCfg());
  const res = await handle(post({ ...GEN_BODY, mode: 'nope' }, USER_ADMIN), dep);
  await expectStatus(res, 422);
});

Deno.test('generate-exam-questions: lesson exam rejected', async () => {
  const { dep } = deps(
    adminCfg({
      tables: {
        exams: { rows: [{ id: EXAM_ID, lesson_id: '40000000-0000-0000-0000-000000000001', grade_id: null, deleted_at: null }] },
      },
    }),
  );
  const res = await handle(post(GEN_BODY, USER_ADMIN), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'not_general_exam');
});

Deno.test('generate-exam-questions: too many questions rejected', async () => {
  const { dep } = deps(adminCfg());
  const res = await handle(post({ ...GEN_BODY, mcq_count: 20 }, USER_ADMIN), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_counts');
});

Deno.test('generate-exam-questions: cross-exam image rejected', async () => {
  const { dep } = deps(adminCfg());
  const res = await handle(
    post({ ...GEN_BODY, images: [{ storage_path: 'ffffffff-ffff-ffff-ffff-ffffffffffff/x.jpg' }] }, USER_ADMIN),
    dep,
  );
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_image');
});

Deno.test('generate-exam-questions: success normalizes + drops invalid', async () => {
  const { dep, fetchCalls } = deps(adminCfg());
  const res = await handle(post(GEN_BODY, USER_ADMIN), dep);
  await expectStatus(res, 200);
  const body = (await res.json()) as {
    exam_id: string;
    questions: Array<{ type: string; prompt_image_path: string | null; correct_index: number | null }>;
  };
  assertEqual(body.exam_id, EXAM_ID);
  assertEqual(body.questions.length, 2);
  assertEqual(body.questions[0].correct_index, 1);
  assertEqual(body.questions[0].prompt_image_path, null);
  assertEqual(body.questions[1].prompt_image_path, null);
  assert(fetchCalls.length === 1, 'gemini called once');
  assert(String(fetchCalls[0].url).includes('generateContent'), 'calls generateContent');
});

Deno.test('generate-exam-questions: image ref mapped to verified path', async () => {
  const withImage = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                questions: [
                  {
                    type: 'essay', prompt: 'Q about image', choices: null, correct_index: null,
                    max_score: 3, needs_review: false, prompt_image: 1, choice_images: null,
                  },
                ],
              }),
            },
          ],
        },
      },
    ],
  };
  const { dep } = deps(adminCfg(), withImage);
  const res = await handle(post({ ...GEN_BODY, images: [{ storage_path: IMG_PATH }] }, USER_ADMIN), dep);
  await expectStatus(res, 200);
  const body = (await res.json()) as { questions: Array<{ prompt_image_path: string | null }> };
  assertEqual(body.questions.length, 1);
  assertEqual(body.questions[0].prompt_image_path, IMG_PATH);
});

Deno.test('generate-exam-questions: garbage model output -> ai_bad_output', async () => {
  const { dep } = deps(adminCfg(), { candidates: [{ content: { parts: [{ text: 'not json' }] } }] });
  const res = await handle(post(GEN_BODY, USER_ADMIN), dep);
  await expectStatus(res, 502);
  const body = await res.json();
  assertEqual(body.error.code, 'ai_bad_output');
});

Deno.test('generate-exam-questions: format mode requires raw text', async () => {
  const { dep } = deps(adminCfg());
  const res = await handle(
    post({ mode: 'format', exam_id: EXAM_ID, raw_text: 'قصير' }, USER_ADMIN),
    dep,
  );
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_text');
});
