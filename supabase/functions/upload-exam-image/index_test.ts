// Unit tests for upload-exam-image (Phase 12, Exam Images — Cloudinary grant).
import { handle, MAX_EXAM_IMAGE_SIZE_BYTES } from './index.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const EXAM_ID = 'ab000000-0000-0000-0000-000000000001';
const DELETED_EXAM_ID = 'ab000000-0000-0000-0000-000000000099';
const WALID_ID = '20000000-0000-0000-0000-000000000002';
const STUDENT_ID = '20000000-0000-0000-0000-000000000003';
const IMAGE_ID = '70000000-0000-0000-0000-000000000001';

const CLOUD = { cloudName: 'test-cloud', apiKey: 'test-key', apiSecret: 'test-secret' };
const NOW_SEC = 1788000000;
// Reference vector for params
// { invalidate, overwrite, public_id: exam-images/<EXAM>/<IMAGE>,
//   timestamp: 1788000000, type: authenticated } + 'test-secret'.
const EXPECTED_SIGNATURE = '26301c9c69b28fe7fc7a7988832ef92eac897c3b';

function request(body?: unknown, authHeader = 'Bearer test-jwt'): Request {
  return new Request('https://example.supabase.co/functions/v1/upload-exam-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  });
}

function staffCfg(overrides?: Partial<StubConfig>): StubConfig {
  const cfg: StubConfig = {
    user: { id: WALID_ID },
    tables: {
      profiles: { rows: [{ id: WALID_ID, role: 'mr_walid', status: 'active', deleted_at: null }] },
      exams: { rows: [{ id: EXAM_ID, deleted_at: null }] },
    },
    storage: { 'exam-images': {} },
  };
  return deepMerge(cfg, overrides ?? {});
}

function deepMerge(base: StubConfig, override: Partial<StubConfig>): StubConfig {
  return {
    ...base,
    ...override,
    tables: { ...base.tables, ...(override.tables ?? {}) },
    rpc: { ...base.rpc, ...(override.rpc ?? {}) },
    storage: { ...base.storage, ...(override.storage ?? {}) },
  };
}

function deps(cfg: StubConfig, cloud = CLOUD) {
  const { client } = makeStubClient(cfg);
  const callerClient = client;
  return {
    dep: {
      url: 'https://example.supabase.co',
      makeClient: () => callerClient,
      cloudinary: cloud,
      nowSec: () => NOW_SEC,
      newImageId: () => IMAGE_ID,
    },
  };
}

Deno.test('upload-exam-image: GET is rejected with 405', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(new Request('https://example.supabase.co/functions/v1/upload-exam-image'), dep);
  await expectStatus(res, 405);
});

Deno.test('upload-exam-image: missing Authorization -> 401', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request(undefined, ''), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('upload-exam-image: student role -> 403', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      user: { id: STUDENT_ID },
      tables: { profiles: { rows: [{ id: STUDENT_ID, role: 'student', status: 'active', deleted_at: null }] } },
    }),
  );
  const res = await handle(request({ exam_id: EXAM_ID, file_name: 'q.jpg' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('upload-exam-image: malformed exam_id -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  for (const exam_id of ['not-a-uuid', 42, '', null]) {
    const res = await handle(request({ exam_id, file_name: 'board.jpg' }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'validation_error');
  }
});

Deno.test('upload-exam-image: invalid file_name -> 422', async () => {
  const { dep } = deps(staffCfg());
  for (const file_name of ['bad.txt', 'img.gif', '', null]) {
    const res = await handle(request({ exam_id: EXAM_ID, file_name }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'invalid_file_name');
  }
});

Deno.test('upload-exam-image: phone-gallery names with parens accepted', async () => {
  const { dep } = deps(staffCfg());
  for (const file_name of [
    'Screenshot (1).png',
    'IMG_2026 (2).JPG',
    'صورة (٣).jpeg',
    'photo [final]+1@home, v2!.webp',
  ]) {
    const res = await handle(request({ exam_id: EXAM_ID, file_name }), dep);
    await expectStatus(res, 200);
  }
});

Deno.test('upload-exam-image: file too large -> 422', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(
    request({ exam_id: EXAM_ID, file_name: 'q.jpg', file_size: MAX_EXAM_IMAGE_SIZE_BYTES + 1 }),
    dep,
  );
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'file_too_large');
});

Deno.test('upload-exam-image: unknown exam -> 404', async () => {
  const { dep } = deps(deepMerge(staffCfg(), { tables: { exams: { rows: [] } } }));
  const res = await handle(request({ exam_id: EXAM_ID, file_name: 'q.jpg' }), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'exam_not_found');
});

Deno.test('upload-exam-image: soft-deleted exam -> 422 exam_deleted', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: { exams: { rows: [{ id: DELETED_EXAM_ID, deleted_at: '2026-08-01T00:00:00.000Z' }] } },
    }),
  );
  const res = await handle(request({ exam_id: DELETED_EXAM_ID, file_name: 'q.jpg' }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'exam_deleted');
});

Deno.test('upload-exam-image: success 200 with the deterministic Cloudinary grant', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request({ exam_id: EXAM_ID, file_name: 'سؤال-1.JPG', file_size: 12345 }), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assert(
    deepEqual(body, {
      upload_url: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      timestamp: String(NOW_SEC),
      signature: EXPECTED_SIGNATURE,
      public_id: `exam-images/${EXAM_ID}/${IMAGE_ID}`,
      exam_id: EXAM_ID,
      image_id: IMAGE_ID,
    }),
    `unexpected grant: ${JSON.stringify(body)}`,
  );
});

Deno.test('upload-exam-image: missing Cloudinary secrets -> 500 misconfigured', async () => {
  const { dep } = deps(staffCfg(), { cloudName: '', apiKey: '', apiSecret: '' });
  const res = await handle(request({ exam_id: EXAM_ID, file_name: 'q.jpg' }), dep);
  await expectStatus(res, 500);
  const body = await res.json();
  assertEqual(body.error.code, 'misconfigured');
});
