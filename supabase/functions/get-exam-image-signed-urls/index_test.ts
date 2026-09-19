// Unit tests for get-exam-image-signed-urls
import { handle, DEFAULT_TTL_SECONDS } from './index.ts';
import { assert, assertEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const USER_STUDENT = { id: '70000000-0000-0000-0000-000000000001' };
const USER_STAFF = { id: '70000000-0000-0000-0000-000000000009' };
const EXAM_ID = 'ab000000-0000-0000-0000-000000000001';
const LESSON_ID = '40000000-0000-0000-0000-000000000001';
const Q1 = 'ab000000-0000-0000-0000-000000000002';
const Q2 = 'ab000000-0000-0000-0000-000000000003';
const P1_PATH = `${EXAM_ID}/prompt1.jpg`;
const C1_PATH = `${EXAM_ID}/choice1.png`;
const _C2_PATH = `${EXAM_ID}/choice2.webp`;

function post(examId: string, user: { id: string }): Request {
  return new Request('https://example.supabase.co/functions/v1/get-exam-image-signed-urls', {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.id}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ exam_id: examId }),
  });
}

function cfg(overrides?: Partial<StubConfig>): StubConfig {
  const base: StubConfig = {
    user: USER_STUDENT,
    tables: {
      profiles: { rows: [{ id: USER_STUDENT.id, role: 'student', status: 'active', deleted_at: null }] },
      exams: { rows: [{ id: EXAM_ID, lesson_id: LESSON_ID, deleted_at: null }] },
      lessons: { rows: [{ id: LESSON_ID, deleted_at: null }] },
      exam_questions: {
        rows: [
          { id: Q1, exam_id: EXAM_ID, prompt_image_path: P1_PATH, choice_image_paths: [C1_PATH, null] },
          { id: Q2, exam_id: EXAM_ID, prompt_image_path: null, choice_image_paths: null },
        ],
      },
    },
    rpc: { get_my_lesson_access: { data: { has_access: true } } },
    storage: { 'exam-images': { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/exam-images/x.jpg?token=abc' } },
  };
  return {
    ...base,
    ...overrides,
    tables: { ...base.tables, ...(overrides?.tables ?? {}) },
    rpc: { ...base.rpc, ...(overrides?.rpc ?? {}) },
    storage: { ...base.storage, ...(overrides?.storage ?? {}) },
  };
}

function deps(cfg: StubConfig, ttl?: number) {
  const { client, storageCalls, rpcCalls } = makeStubClient(cfg);
  const dep = {
    url: 'https://example.supabase.co',
    makeClient: () => client,
    makeServiceClient: () => client,
    ttlSeconds: ttl,
  };
  return { dep, storageCalls, rpcCalls };
}

Deno.test('get-exam-image-signed-urls: missing auth -> 401', async () => {
  const { dep } = deps(cfg());
  const req = new Request('https://example.supabase.co/functions/v1/get-exam-image-signed-urls', {
    method: 'POST',
    body: JSON.stringify({ exam_id: EXAM_ID }),
  });
  const res = await handle(req, dep);
  await expectStatus(res, 401);
});

Deno.test('get-exam-image-signed-urls: invalid exam_id -> 422', async () => {
  const { dep } = deps(cfg());
  const res = await handle(post('not-a-uuid', USER_STUDENT), dep);
  await expectStatus(res, 422);
});

Deno.test('get-exam-image-signed-urls: student without access -> 403', async () => {
  const { dep } = deps(cfg({ rpc: { get_my_lesson_access: { data: { has_access: false } } } }));
  const res = await handle(post(EXAM_ID, USER_STUDENT), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'access_denied');
});

Deno.test('get-exam-image-signed-urls: staff bypasses access gate', async () => {
  const { dep, rpcCalls } = deps(
    cfg({
      user: USER_STAFF,
      tables: { profiles: { rows: [{ id: USER_STAFF.id, role: 'admin', status: 'active', deleted_at: null }] } },
    }),
  );
  const res = await handle(post(EXAM_ID, USER_STAFF), dep);
  await expectStatus(res, 200);
  assertEqual(rpcCalls.length, 0, 'staff must skip get_my_lesson_access');
});

Deno.test('get-exam-image-signed-urls: student success returns signed URLs per question', async () => {
  const { dep, storageCalls } = deps(cfg());
  const res = await handle(post(EXAM_ID, USER_STUDENT), dep);
  await expectStatus(res, 200);
  const body = (await res.json()) as { exam_id: string; images: Array<{ question_id: string; prompt_image_url: string | null; choice_image_urls: (string | null)[] | null }> };
  assertEqual(body.exam_id, EXAM_ID);
  assertEqual(body.images.length, 2);
  const q1 = body.images.find((x) => x.question_id === Q1)!;
  assert(q1.prompt_image_url !== null, 'q1 prompt url should be signed');
  assertEqual(q1.choice_image_urls?.length, 2);
  assert(q1.choice_image_urls?.[0] !== null, 'choice 0 should have url');
  assertEqual(q1.choice_image_urls?.[1], null);
  const q2 = body.images.find((x) => x.question_id === Q2)!;
  assertEqual(q2.prompt_image_url, null);
  assertEqual(q2.choice_image_urls, null);
  // distinct paths = P1 + C1 = 2 calls
  assertEqual(storageCalls.length, 2);
  assertEqual(storageCalls[0].options?.expiresIn, DEFAULT_TTL_SECONDS);
});

Deno.test('get-exam-image-signed-urls: no images -> empty urls', async () => {
  const { dep, storageCalls } = deps(
    cfg({ tables: { exam_questions: { rows: [{ id: Q1, exam_id: EXAM_ID, prompt_image_path: null, choice_image_paths: null }] } } }),
  );
  const res = await handle(post(EXAM_ID, USER_STUDENT), dep);
  await expectStatus(res, 200);
  const body = (await res.json()) as { images: unknown[] };
  assertEqual(body.images.length, 1);
  assertEqual(storageCalls.length, 0);
});

Deno.test('get-exam-image-signed-urls: storage error -> 500', async () => {
  const { dep } = deps(cfg({ storage: { 'exam-images': { error: { message: 'boom' } } } }));
  const res = await handle(post(EXAM_ID, USER_STUDENT), dep);
  await expectStatus(res, 500);
  const body = await res.json();
  assertEqual(body.error.code, 'internal_error');
});

// ---------------------------------------------------------------------
// General (standalone) exams — 0080: grade-gated, no lesson involved
// ---------------------------------------------------------------------
const GENERAL_EXAM_ID = 'ac000000-0000-0000-0000-000000000001';
const GENERAL_GRADE_ID = '10000000-0000-0000-0000-000000000001';

function generalCfg(overrides?: Partial<StubConfig>): StubConfig {
  return cfg({
    ...overrides,
    tables: {
      exams: {
        rows: [{ id: GENERAL_EXAM_ID, lesson_id: null, grade_id: GENERAL_GRADE_ID, deleted_at: null }],
      },
      exam_questions: {
        rows: [
          { id: Q1, exam_id: GENERAL_EXAM_ID, prompt_image_path: P1_PATH, choice_image_paths: [C1_PATH, null] },
        ],
      },
      ...(overrides?.tables ?? {}),
    },
    rpc: { can_access_general_exam: { data: true }, ...(overrides?.rpc ?? {}) },
  });
}

function generalPost(user: { id: string }): Request {
  return post(GENERAL_EXAM_ID, user);
}

Deno.test('get-exam-image-signed-urls: general exam student with access -> 200', async () => {
  const { dep, rpcCalls } = deps(generalCfg());
  const res = await handle(generalPost(USER_STUDENT), dep);
  await expectStatus(res, 200);
  const body = (await res.json()) as { exam_id: string; images: unknown[] };
  assertEqual(body.exam_id, GENERAL_EXAM_ID);
  assertEqual(body.images.length, 1);
  const called = rpcCalls.map((c) => c.fn);
  assert(called.includes('can_access_general_exam'), 'general path must check grade access');
  assert(!called.includes('get_my_lesson_access'), 'general path must not touch lesson access');
});

Deno.test('get-exam-image-signed-urls: general exam student denied -> 403', async () => {
  const { dep } = deps(generalCfg({ rpc: { can_access_general_exam: { data: false } } }));
  const res = await handle(generalPost(USER_STUDENT), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'access_denied');
});

Deno.test('get-exam-image-signed-urls: general exam staff bypasses gate', async () => {
  const { dep, rpcCalls } = deps(
    generalCfg({
      user: USER_STAFF,
      tables: { profiles: { rows: [{ id: USER_STAFF.id, role: 'admin', status: 'active', deleted_at: null }] } },
    }),
  );
  const res = await handle(generalPost(USER_STAFF), dep);
  await expectStatus(res, 200);
  assertEqual(rpcCalls.length, 0, 'staff must skip access RPCs on general exams too');
});

Deno.test('get-exam-image-signed-urls: general exam pre-start hidden from students', async () => {
  const { dep } = deps(
    generalCfg({
      tables: {
        exams: {
          rows: [
            {
              id: GENERAL_EXAM_ID,
              lesson_id: null,
              grade_id: GENERAL_GRADE_ID,
              starts_at: new Date(Date.now() + 3_600_000).toISOString(),
              deleted_at: null,
            },
          ],
        },
      },
    }),
  );
  const res = await handle(generalPost(USER_STUDENT), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'access_denied');
});
