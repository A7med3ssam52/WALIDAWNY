// Unit tests for upload-suggestion-image (Phase 13, Suggestions — Cloudinary grant).
import { handle, MAX_SUGGESTION_IMAGE_SIZE_BYTES } from './index.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const SUG_ID = '5a000000-0000-0000-0000-000000000001';
const OTHER_SUG_ID = '5a000000-0000-0000-0000-000000000099';
const STUDENT_ID = '70000000-0000-0000-0000-000000000001';
const OTHER_STUDENT_ID = '70000000-0000-0000-0000-000000000004';
const ADMIN_ID = '70000000-0000-0000-0000-00000000000a';
const IMAGE_ID = '70000000-0000-0000-0000-0000000000aa';

const CLOUD = { cloudName: 'test-cloud', apiKey: 'test-key', apiSecret: 'test-secret' };
const NOW_SEC = 1788000000;
// Reference vector for params
// { invalidate, overwrite, public_id: suggestion-images/<SUG>/<IMAGE>,
//   timestamp: 1788000000, type: authenticated } + 'test-secret'.
const EXPECTED_SIGNATURE = '4ca2aa071c84b6ed503a0eb16abf8524e3c83119';

function request(body?: unknown, authHeader = 'Bearer test-jwt'): Request {
  return new Request('https://example.supabase.co/functions/v1/upload-suggestion-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  });
}

function studentCfg(overrides?: Partial<StubConfig>): StubConfig {
  const cfg: StubConfig = {
    user: { id: STUDENT_ID },
    tables: {
      profiles: { rows: [{ id: STUDENT_ID, role: 'student', status: 'active', deleted_at: null }] },
      platform_suggestions: {
        rows: [{ id: SUG_ID, student_id: STUDENT_ID, image_path: null }],
      },
    },
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

Deno.test('upload-suggestion-image: GET is rejected with 405', async () => {
  const { dep } = deps(studentCfg());
  const res = await handle(new Request('https://example.supabase.co/functions/v1/upload-suggestion-image'), dep);
  await expectStatus(res, 405);
});

Deno.test('upload-suggestion-image: missing Authorization -> 401', async () => {
  const { dep } = deps(studentCfg());
  const res = await handle(request(undefined, ''), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('upload-suggestion-image: admin role -> 403 (students only)', async () => {
  const { dep } = deps(
    deepMerge(studentCfg(), {
      user: { id: ADMIN_ID },
      tables: { profiles: { rows: [{ id: ADMIN_ID, role: 'admin', status: 'active', deleted_at: null }] } },
    }),
  );
  const res = await handle(request({ suggestion_id: SUG_ID, file_name: 'shot.jpg' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('upload-suggestion-image: malformed suggestion_id -> 422 validation_error', async () => {
  const { dep } = deps(studentCfg());
  for (const suggestion_id of ['not-a-uuid', 42, '', null]) {
    const res = await handle(request({ suggestion_id, file_name: 'shot.jpg' }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'validation_error');
  }
});

Deno.test('upload-suggestion-image: invalid file_name -> 422', async () => {
  const { dep } = deps(studentCfg());
  for (const file_name of ['bad.txt', 'img.gif', '', null]) {
    const res = await handle(request({ suggestion_id: SUG_ID, file_name }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'invalid_file_name');
  }
});

Deno.test('upload-suggestion-image: phone-gallery names with parens accepted', async () => {
  const { dep } = deps(studentCfg());
  for (const file_name of [
    'Screenshot (1).png',
    'IMG_2026 (2).JPG',
    'صورة (٣).jpeg',
    'photo [final]+1@home, v2!.webp',
  ]) {
    const res = await handle(request({ suggestion_id: SUG_ID, file_name }), dep);
    await expectStatus(res, 200);
  }
});

Deno.test('upload-suggestion-image: file too large -> 422', async () => {
  const { dep } = deps(studentCfg());
  const res = await handle(
    request({ suggestion_id: SUG_ID, file_name: 'shot.jpg', file_size: MAX_SUGGESTION_IMAGE_SIZE_BYTES + 1 }),
    dep,
  );
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'file_too_large');
});

Deno.test('upload-suggestion-image: foreign suggestion -> 404 suggestion_not_found', async () => {
  const { dep } = deps(
    deepMerge(studentCfg(), {
      user: { id: OTHER_STUDENT_ID },
      tables: {
        profiles: { rows: [{ id: OTHER_STUDENT_ID, role: 'student', status: 'active', deleted_at: null }] },
      },
    }),
  );
  const res = await handle(request({ suggestion_id: SUG_ID, file_name: 'shot.jpg' }), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'suggestion_not_found');
});

Deno.test('upload-suggestion-image: unknown suggestion -> 404 suggestion_not_found', async () => {
  const { dep } = deps(
    deepMerge(studentCfg(), { tables: { platform_suggestions: { rows: [] } } }),
  );
  const res = await handle(request({ suggestion_id: OTHER_SUG_ID, file_name: 'shot.jpg' }), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'suggestion_not_found');
});

Deno.test('upload-suggestion-image: already has image -> 422 suggestion_image_exists', async () => {
  const { dep } = deps(
    deepMerge(studentCfg(), {
      tables: {
        platform_suggestions: {
          rows: [{
            id: SUG_ID,
            student_id: STUDENT_ID,
            image_path: `cloudinary:suggestion-images/${SUG_ID}/${IMAGE_ID}.jpg:1788000000`,
          }],
        },
      },
    }),
  );
  const res = await handle(request({ suggestion_id: SUG_ID, file_name: 'shot.jpg' }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'suggestion_image_exists');
});

Deno.test('upload-suggestion-image: success 200 with the deterministic Cloudinary grant', async () => {
  const { dep } = deps(studentCfg());
  const res = await handle(request({ suggestion_id: SUG_ID, file_name: 'سكرين-1.JPG', file_size: 12345 }), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assert(
    deepEqual(body, {
      upload_url: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      timestamp: String(NOW_SEC),
      signature: EXPECTED_SIGNATURE,
      public_id: `suggestion-images/${SUG_ID}/${IMAGE_ID}`,
      suggestion_id: SUG_ID,
      image_id: IMAGE_ID,
    }),
    `unexpected grant: ${JSON.stringify(body)}`,
  );
});

Deno.test('upload-suggestion-image: missing Cloudinary secrets -> 500 misconfigured', async () => {
  const { dep } = deps(studentCfg(), { cloudName: '', apiKey: '', apiSecret: '' });
  const res = await handle(request({ suggestion_id: SUG_ID, file_name: 'shot.jpg' }), dep);
  await expectStatus(res, 500);
  const body = await res.json();
  assertEqual(body.error.code, 'misconfigured');
});
