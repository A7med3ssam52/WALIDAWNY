// Unit tests for avatar-delete (Phase 10, Cloudinary avatars).
// handle() runs against the hand-rolled stub client (no network); the
// Cloudinary transport is injected via Deps.

import { handle } from './index.ts';
import { assert, assertEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';
import type { CloudinaryFetch } from '../_shared/cloudinary.ts';

const STUDENT_ID = '70000000-0000-0000-0000-000000000001';
const TEACHER_ID = '70000000-0000-0000-0000-00000000000b';

const CLOUD = { cloudName: 'test-cloud', apiKey: 'test-key', apiSecret: 'test-secret' };

function request(authHeader = 'Bearer test-jwt'): Request {
  return new Request('https://example.supabase.co/functions/v1/avatar-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({}),
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

Deno.test('avatar-delete: GET is rejected with 405', async () => {
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/avatar-delete'),
    deps(profileCfg(STUDENT_ID, 'student')),
  );
  await expectStatus(res, 405);
});

Deno.test('avatar-delete: missing Authorization header -> 401', async () => {
  const res = await handle(request(''), deps(profileCfg(STUDENT_ID, 'student')));
  await expectStatus(res, 401);
});

Deno.test('avatar-delete: non-student role -> 403', async () => {
  const res = await handle(request(), deps(profileCfg(TEACHER_ID, 'teacher')));
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('avatar-delete: disabled student -> 403 account_inactive_or_deleted', async () => {
  const res = await handle(
    request(),
    deps(profileCfg(STUDENT_ID, 'student', {
      tables: {
        profiles: {
          rows: [{ id: STUDENT_ID, role: 'student', status: 'disabled', deleted_at: null }],
        },
      },
    })),
  );
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'account_inactive_or_deleted');
});

Deno.test('avatar-delete: happy path destroys the caller asset', async () => {
  const calls: string[] = [];
  const res = await handle(
    request(),
    deps(profileCfg(STUDENT_ID, 'student'), (url, init) => {
      calls.push(url);
      assert(init.body.get('public_id') === `avatars/${STUDENT_ID}/avatar`, 'own public_id');
      return Promise.resolve({ status: 200, json: () => Promise.resolve({ result: 'ok' }) });
    }),
  );
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.deleted, true);
  assertEqual(calls.length, 1);
});

Deno.test('avatar-delete: missing asset is still success (idempotent)', async () => {
  const res = await handle(
    request(),
    deps(
      profileCfg(STUDENT_ID, 'student'),
      () => Promise.resolve({ status: 200, json: () => Promise.resolve({ result: 'not found' }) }),
    ),
  );
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.deleted, true);
});

Deno.test('avatar-delete: Cloudinary failure -> 502 destroy_failed', async () => {
  const res = await handle(
    request(),
    deps(
      profileCfg(STUDENT_ID, 'student'),
      () => Promise.resolve({ status: 400, json: () => Promise.resolve({ error: 'bad' }) }),
    ),
  );
  await expectStatus(res, 502);
  const body = await res.json();
  assertEqual(body.error.code, 'destroy_failed');
});

Deno.test('avatar-delete: missing Cloudinary secrets -> 500 misconfigured', async () => {
  const res = await handle(
    request(),
    deps(profileCfg(STUDENT_ID, 'student'), okFetch, { cloudName: '', apiKey: '', apiSecret: '' }),
  );
  await expectStatus(res, 500);
  const body = await res.json();
  assertEqual(body.error.code, 'misconfigured');
});
