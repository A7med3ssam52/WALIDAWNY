// Unit tests for suggestion-image-signed-url (Phase 13, Suggestions — Cloudinary reads).
// handle() runs against the hand-rolled stub client (no network).

import { handle } from './index.ts';
import { assert, assertEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const SUG_ID = '5a000000-0000-0000-0000-000000000001';
const OTHER_SUG_ID = '5a000000-0000-0000-0000-000000000099';
const STUDENT_ID = '70000000-0000-0000-0000-000000000001';
const OTHER_STUDENT_ID = '70000000-0000-0000-0000-000000000004';
const ADMIN_ID = '70000000-0000-0000-0000-00000000000a';
const TEACHER_ID = '70000000-0000-0000-0000-00000000000b';
const IMAGE_ID = '70000000-0000-0000-0000-0000000000aa';

const CLOUD = { cloudName: 'test-cloud', apiKey: 'test-key', apiSecret: 'test-secret' };
// Reference vector: toSign =
// 'c_limit,w_1600,h_1600,q_auto/v1788000000/suggestion-images/<SUG>/<IMG>.jpg'
// + 'test-secret' -> first-8 url-safe base64 SHA-1.
const EXPECTED_SIGNATURE = '4CeyPwGN';
const OWN_PATH = `cloudinary:suggestion-images/${SUG_ID}/${IMAGE_ID}.jpg:1788000000`;

function request(body?: unknown, authHeader = 'Bearer test-jwt'): Request {
  return new Request('https://example.supabase.co/functions/v1/suggestion-image-signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  });
}

function cfgFor(userId: string, role: string, suggestions: unknown[]): StubConfig {
  return {
    user: { id: userId },
    tables: {
      profiles: { rows: [{ id: userId, role, status: 'active', deleted_at: null }] },
      platform_suggestions: { rows: suggestions },
    },
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

const OWN_ROW = { id: SUG_ID, student_id: STUDENT_ID, image_path: OWN_PATH };

Deno.test('suggestion-image-signed-url: GET is rejected with 405', async () => {
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/suggestion-image-signed-url'),
    deps(cfgFor(STUDENT_ID, 'student', [OWN_ROW])),
  );
  await expectStatus(res, 405);
});

Deno.test('suggestion-image-signed-url: missing Authorization header -> 401', async () => {
  const res = await handle(request({ path: OWN_PATH }, ''), deps(cfgFor(STUDENT_ID, 'student', [OWN_ROW])));
  await expectStatus(res, 401);
});

Deno.test('suggestion-image-signed-url: teacher role -> 403 (admin-only inbox)', async () => {
  const res = await handle(
    request({ path: OWN_PATH }),
    deps(cfgFor(TEACHER_ID, 'teacher', [OWN_ROW])),
  );
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('suggestion-image-signed-url: legacy Supabase path -> 422 validation_error', async () => {
  const res = await handle(
    request({ path: `${STUDENT_ID}/${SUG_ID}.jpg` }),
    deps(cfgFor(STUDENT_ID, 'student', [OWN_ROW])),
  );
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'validation_error');
});

Deno.test('suggestion-image-signed-url: malformed pointer -> 422 validation_error', async () => {
  const res = await handle(
    request({ path: `cloudinary:suggestion-images/${SUG_ID}/${IMAGE_ID}.gif:1788000000` }),
    deps(cfgFor(STUDENT_ID, 'student', [OWN_ROW])),
  );
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'validation_error');
});

Deno.test('suggestion-image-signed-url: foreign student image -> 403', async () => {
  const res = await handle(
    request({ path: OWN_PATH }),
    deps(cfgFor(OTHER_STUDENT_ID, 'student', [OWN_ROW])),
  );
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('suggestion-image-signed-url: missing suggestion row -> 404 suggestion_not_found', async () => {
  const res = await handle(
    request({ path: `cloudinary:suggestion-images/${OTHER_SUG_ID}/${IMAGE_ID}.jpg:1788000000` }),
    deps(cfgFor(STUDENT_ID, 'student', [OWN_ROW])),
  );
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'suggestion_not_found');
});

Deno.test('suggestion-image-signed-url: owner success returns the signed delivery URL', async () => {
  const res = await handle(
    request({ path: OWN_PATH }),
    deps(cfgFor(STUDENT_ID, 'student', [OWN_ROW])),
  );
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(
    body.signed_url,
    `https://res.cloudinary.com/test-cloud/image/authenticated/s--${EXPECTED_SIGNATURE}--/c_limit,w_1600,h_1600,q_auto/v1788000000/suggestion-images/${SUG_ID}/${IMAGE_ID}.jpg`,
  );
});

Deno.test('suggestion-image-signed-url: admin previews any image', async () => {
  const res = await handle(
    request({ path: OWN_PATH }),
    deps(cfgFor(ADMIN_ID, 'admin', [OWN_ROW])),
  );
  await expectStatus(res, 200);
  const body = await res.json();
  assert(typeof body.signed_url === 'string' && body.signed_url.includes('res.cloudinary.com'), 'signed url');
});

Deno.test('suggestion-image-signed-url: missing Cloudinary secrets -> 500 misconfigured', async () => {
  const res = await handle(
    request({ path: OWN_PATH }),
    deps(cfgFor(STUDENT_ID, 'student', [OWN_ROW]), { cloudName: '', apiKey: '', apiSecret: '' }),
  );
  await expectStatus(res, 500);
  const body = await res.json();
  assertEqual(body.error.code, 'misconfigured');
});
