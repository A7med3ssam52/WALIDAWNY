// Unit tests for exam-image-delete (Phase 12, Cloudinary exam images).
// handle() runs against the hand-rolled stub client (no network); the
// Cloudinary transport is injected via Deps.

import { handle } from './index.ts';
import { assert, assertEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';
import type { CloudinaryFetch } from '../_shared/cloudinary.ts';

const STAFF_ID = '20000000-0000-0000-0000-000000000002';
const STUDENT_ID = '20000000-0000-0000-0000-000000000003';
const EXAM_ID = 'ab000000-0000-0000-0000-000000000001';
const IMAGE_ID = '60000000-0000-0000-0000-000000000001';
const POINTER = `cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.png:1788000000`;

const CLOUD = { cloudName: 'test-cloud', apiKey: 'test-key', apiSecret: 'test-secret' };

function request(body?: unknown, authHeader = 'Bearer test-jwt'): Request {
  return new Request('https://example.supabase.co/functions/v1/exam-image-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify(body ?? {}),
  });
}

function profileCfg(
  userId: string,
  role: string,
  overrides?: Partial<StubConfig>,
): StubConfig {
  const cfg: StubConfig = {
    user: { id: userId },
    tables: {
      profiles: { rows: [{ id: userId, role, status: 'active', deleted_at: null }] },
    },
  };
  return {
    ...cfg,
    ...overrides,
    tables: { ...cfg.tables, ...(overrides?.tables ?? {}) },
  };
}

const okFetch: CloudinaryFetch = () =>
  Promise.resolve({ status: 200, json: () => Promise.resolve({ result: 'ok' }) });

function deps(cfg: StubConfig, fetchFn: CloudinaryFetch | undefined = okFetch, cloud = CLOUD) {
  const { client } = makeStubClient(cfg);
  return {
    url: 'https://example.supabase.co',
    makeClient: (_url: string, _jwt: string) => client,
    cloudinary: cloud,
    nowSec: () => 1788000000,
    cloudinaryFetch: fetchFn,
  };
}

Deno.test('exam-image-delete: GET is rejected with 405', async () => {
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/exam-image-delete'),
    deps(profileCfg(STAFF_ID, 'mr_walid')),
  );
  await expectStatus(res, 405);
});

Deno.test('exam-image-delete: missing Authorization header -> 401', async () => {
  const res = await handle(request({ path: POINTER }, ''), deps(profileCfg(STAFF_ID, 'mr_walid')));
  await expectStatus(res, 401);
});

Deno.test('exam-image-delete: student role -> 403', async () => {
  const res = await handle(request({ path: POINTER }), deps(profileCfg(STUDENT_ID, 'student')));
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('exam-image-delete: legacy path -> 422 validation_error', async () => {
  const res = await handle(
    request({ path: `${EXAM_ID}/${IMAGE_ID}.png` }),
    deps(profileCfg(STAFF_ID, 'teacher')),
  );
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'validation_error');
});

Deno.test('exam-image-delete: avatar pointer -> 422 validation_error', async () => {
  const res = await handle(
    request({ path: 'cloudinary:70000000-0000-0000-0000-000000000001/avatar.jpg:1788000000' }),
    deps(profileCfg(STAFF_ID, 'teacher')),
  );
  await expectStatus(res, 422);
});

Deno.test('exam-image-delete: happy path destroys the exam asset', async () => {
  const calls: string[] = [];
  const res = await handle(
    request({ path: POINTER }),
    deps(profileCfg(STAFF_ID, 'assistant'), (url, init) => {
      calls.push(url);
      assert(init.body.get('public_id') === `exam-images/${EXAM_ID}/${IMAGE_ID}`, 'exam public_id');
      return Promise.resolve({ status: 200, json: () => Promise.resolve({ result: 'ok' }) });
    }),
  );
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.deleted, true);
  assertEqual(calls.length, 1);
});

Deno.test('exam-image-delete: missing asset is still success (idempotent)', async () => {
  const res = await handle(
    request({ path: POINTER }),
    deps(
      profileCfg(STAFF_ID, 'admin'),
      () => Promise.resolve({ status: 200, json: () => Promise.resolve({ result: 'not found' }) }),
    ),
  );
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.deleted, true);
});

Deno.test('exam-image-delete: Cloudinary failure -> 502 destroy_failed', async () => {
  const res = await handle(
    request({ path: POINTER }),
    deps(
      profileCfg(STAFF_ID, 'admin'),
      () => Promise.resolve({ status: 400, json: () => Promise.resolve({ error: 'bad' }) }),
    ),
  );
  await expectStatus(res, 502);
  const body = await res.json();
  assertEqual(body.error.code, 'destroy_failed');
});
