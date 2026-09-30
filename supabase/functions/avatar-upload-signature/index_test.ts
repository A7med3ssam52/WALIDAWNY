// Unit tests for avatar-upload-signature (Phase 10, Cloudinary avatars).
// handle() runs against the hand-rolled stub client (no network); the
// Cloudinary env + clock are injected via Deps.

import { handle } from './index.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const STUDENT_ID = '70000000-0000-0000-0000-000000000001';
const TEACHER_ID = '70000000-0000-0000-0000-00000000000b';

const CLOUD = { cloudName: 'test-cloud', apiKey: 'test-key', apiSecret: 'test-secret' };
// nowSec fixed so the signature is deterministic.
const NOW_SEC = 1788000000;
// Reference vector for params
// { invalidate, overwrite, public_id: avatars/<STUDENT>/avatar,
//   timestamp: 1788000000, type: authenticated } + 'test-secret'.
// NOTE: this vector uses the STUDENT uid fixture above.
const EXPECTED_SIGNATURE = '2127c58f00665ab35ae2333ded7557b03c5a285f';

function request(body?: unknown, authHeader = 'Bearer test-jwt'): Request {
  return new Request('https://example.supabase.co/functions/v1/avatar-upload-signature', {
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
    },
  };
  return {
    ...cfg,
    ...overrides,
    tables: { ...cfg.tables, ...(overrides?.tables ?? {}) },
  };
}

function deps(cfg: StubConfig, cloud = CLOUD) {
  const { client } = makeStubClient(cfg);
  return {
    url: 'https://example.supabase.co',
    makeClient: (_url: string, _jwt: string) => client,
    cloudinary: cloud,
    nowSec: () => NOW_SEC,
  };
}

Deno.test('avatar-upload-signature: GET is rejected with 405', async () => {
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/avatar-upload-signature'),
    deps(studentCfg()),
  );
  await expectStatus(res, 405);
});

Deno.test('avatar-upload-signature: missing Authorization header -> 401', async () => {
  const res = await handle(request({}, ''), deps(studentCfg()));
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('avatar-upload-signature: invalid token (getUser failure) -> 401', async () => {
  const res = await handle(
    request({}),
    deps(studentCfg({ getUserError: { message: 'invalid JWT' } })),
  );
  await expectStatus(res, 401);
});

Deno.test('avatar-upload-signature: non-student role -> 403', async () => {
  const res = await handle(
    request({}),
    deps({
      user: { id: TEACHER_ID },
      tables: {
        profiles: { rows: [{ id: TEACHER_ID, role: 'teacher', status: 'active', deleted_at: null }] },
      },
    }),
  );
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('avatar-upload-signature: disabled student -> 403 account_inactive_or_deleted', async () => {
  const res = await handle(
    request({}),
    deps({
      user: { id: STUDENT_ID },
      tables: {
        profiles: {
          rows: [{ id: STUDENT_ID, role: 'student', status: 'disabled', deleted_at: null }],
        },
      },
    }),
  );
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'account_inactive_or_deleted');
});

Deno.test('avatar-upload-signature: bad content_type -> 422 invalid_file_type', async () => {
  const res = await handle(request({ content_type: 'image/gif' }), deps(studentCfg()));
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_file_type');
});

Deno.test('avatar-upload-signature: oversize file_size -> 422 file_too_large', async () => {
  const res = await handle(
    request({ content_type: 'image/jpeg', file_size: 9 * 1024 * 1024 }),
    deps(studentCfg()),
  );
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'file_too_large');
});

Deno.test('avatar-upload-signature: missing Cloudinary secrets -> 500 misconfigured', async () => {
  const res = await handle(
    request({}),
    deps(studentCfg(), { cloudName: '', apiKey: '', apiSecret: '' }),
  );
  await expectStatus(res, 500);
  const body = await res.json();
  assertEqual(body.error.code, 'misconfigured');
});

Deno.test('avatar-upload-signature: happy path returns the deterministic grant', async () => {
  const res = await handle(
    request({ content_type: 'image/png', file_size: 1024 }),
    deps(studentCfg()),
  );
  await expectStatus(res, 200);
  const body = await res.json();
  assert(
    deepEqual(body, {
      upload_url: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      timestamp: String(NOW_SEC),
      signature: EXPECTED_SIGNATURE,
      public_id: `avatars/${STUDENT_ID}/avatar`,
    }),
    `unexpected grant: ${JSON.stringify(body)}`,
  );
});
