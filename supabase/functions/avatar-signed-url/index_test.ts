// Unit tests for avatar-signed-url (Phase 10, Cloudinary avatars).
// handle() runs against the hand-rolled stub client (no network).

import { handle } from './index.ts';
import { assert, assertEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const STUDENT_ID = '70000000-0000-0000-0000-000000000001';
const OTHER_STUDENT_ID = '70000000-0000-0000-0000-000000000004';
const TEACHER_ID = '70000000-0000-0000-0000-00000000000b';
const ASSISTANT_ID = '70000000-0000-0000-0000-00000000000c';

const CLOUD = { cloudName: 'test-cloud', apiKey: 'test-key', apiSecret: 'test-secret' };
// Reference vector: toSign =
// 'c_limit,w_512,h_512,q_auto/v1788000000/avatars/<STUDENT>/avatar.jpg'
// + 'test-secret' -> first-8 url-safe base64 SHA-1.
const EXPECTED_SIGNATURE = 'XG0a4-QC';
const OWN_PATH = `cloudinary:${STUDENT_ID}/avatar.jpg:1788000000`;

function request(body?: unknown, authHeader = 'Bearer test-jwt'): Request {
  return new Request('https://example.supabase.co/functions/v1/avatar-signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
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

function deps(cfg: StubConfig, cloud = CLOUD) {
  const { client } = makeStubClient(cfg);
  return {
    url: 'https://example.supabase.co',
    makeClient: (_url: string, _jwt: string) => client,
    cloudinary: cloud,
  };
}

Deno.test('avatar-signed-url: GET is rejected with 405', async () => {
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/avatar-signed-url'),
    deps(profileCfg(STUDENT_ID, 'student')),
  );
  await expectStatus(res, 405);
});

Deno.test('avatar-signed-url: missing Authorization header -> 401', async () => {
  const res = await handle(request({ path: OWN_PATH }, ''), deps(profileCfg(STUDENT_ID, 'student')));
  await expectStatus(res, 401);
});

Deno.test('avatar-signed-url: assistant role -> 403 (0082 staff set has no assistant)', async () => {
  const res = await handle(
    request({ path: OWN_PATH }),
    deps(profileCfg(ASSISTANT_ID, 'assistant')),
  );
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('avatar-signed-url: legacy Supabase path -> 422 validation_error', async () => {
  const res = await handle(
    request({ path: `${STUDENT_ID}/avatar.jpg` }),
    deps(profileCfg(STUDENT_ID, 'student')),
  );
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'validation_error');
});

Deno.test('avatar-signed-url: malformed pointer -> 422 validation_error', async () => {
  const res = await handle(
    request({ path: `cloudinary:${STUDENT_ID}/avatar.gif:1788000000` }),
    deps(profileCfg(STUDENT_ID, 'student')),
  );
  await expectStatus(res, 422);
});

Deno.test('avatar-signed-url: student viewing someone else -> 403', async () => {
  const res = await handle(
    request({ path: `cloudinary:${OTHER_STUDENT_ID}/avatar.jpg:1788000000` }),
    deps(profileCfg(STUDENT_ID, 'student')),
  );
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('avatar-signed-url: owner happy path returns the deterministic signed URL', async () => {
  const res = await handle(
    request({ path: OWN_PATH }),
    deps(profileCfg(STUDENT_ID, 'student')),
  );
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(
    body.signed_url,
    `https://res.cloudinary.com/test-cloud/image/authenticated/` +
      `s--${EXPECTED_SIGNATURE}--/c_limit,w_512,h_512,q_auto/` +
      `v1788000000/avatars/${STUDENT_ID}/avatar.jpg`,
  );
});

Deno.test('avatar-signed-url: teacher previews another student', async () => {
  const res = await handle(
    request({ path: `cloudinary:${OTHER_STUDENT_ID}/avatar.png:1788000001` }),
    deps(profileCfg(TEACHER_ID, 'teacher')),
  );
  await expectStatus(res, 200);
  const body = await res.json();
  assert(
    typeof body.signed_url === 'string' &&
      body.signed_url.startsWith('https://res.cloudinary.com/test-cloud/image/authenticated/s--'),
    `unexpected signed_url: ${JSON.stringify(body)}`,
  );
  assert(
    body.signed_url.includes(`/avatars/${OTHER_STUDENT_ID}/avatar.png`),
    `wrong asset: ${body.signed_url}`,
  );
});

Deno.test('avatar-signed-url: missing Cloudinary secrets -> 500 misconfigured', async () => {
  const res = await handle(
    request({ path: OWN_PATH }),
    deps(profileCfg(STUDENT_ID, 'student'), { cloudName: '', apiKey: '', apiSecret: '' }),
  );
  await expectStatus(res, 500);
  const body = await res.json();
  assertEqual(body.error.code, 'misconfigured');
});
