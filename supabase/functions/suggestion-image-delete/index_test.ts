// Unit tests for suggestion-image-delete (Phase 13, Suggestions — Cloudinary destroy).

import { handle } from './index.ts';
import { assertEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const SUG_ID = '5a000000-0000-0000-0000-000000000001';
const ADMIN_ID = '70000000-0000-0000-0000-00000000000a';
const STUDENT_ID = '70000000-0000-0000-0000-000000000001';
const TEACHER_ID = '70000000-0000-0000-0000-00000000000b';
const IMAGE_ID = '70000000-0000-0000-0000-0000000000aa';

const CLOUD = { cloudName: 'test-cloud', apiKey: 'test-key', apiSecret: 'test-secret' };
const OWN_PATH = `cloudinary:suggestion-images/${SUG_ID}/${IMAGE_ID}.jpg:1788000000`;

function request(body?: unknown, authHeader = 'Bearer test-jwt'): Request {
  return new Request('https://example.supabase.co/functions/v1/suggestion-image-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  });
}

function adminCfg(overrides?: Partial<StubConfig>): StubConfig {
  const cfg: StubConfig = {
    user: { id: ADMIN_ID },
    tables: {
      profiles: { rows: [{ id: ADMIN_ID, role: 'admin', status: 'active', deleted_at: null }] },
    },
  };
  return { ...cfg, ...overrides, tables: { ...cfg.tables, ...(overrides?.tables ?? {}) } };
}

function deps(cfg: StubConfig, fetchImpl?: (url: string, init: { method: string; body: URLSearchParams }) => Promise<{ status: number; json(): Promise<unknown> }>) {
  const { client } = makeStubClient(cfg);
  return {
    url: 'https://example.supabase.co',
    makeClient: () => client,
    cloudinary: CLOUD,
    nowSec: () => 1788000000,
    cloudinaryFetch: fetchImpl ??
      ((_url: string, _init: { method: string; body: URLSearchParams }) =>
        Promise.resolve({ status: 200, json: () => Promise.resolve({ result: 'ok' }) })),
  };
}

Deno.test('suggestion-image-delete: GET is rejected with 405', async () => {
  const res = await handle(new Request('https://example.supabase.co/functions/v1/suggestion-image-delete'), deps(adminCfg()));
  await expectStatus(res, 405);
});

Deno.test('suggestion-image-delete: missing Authorization -> 401', async () => {
  const res = await handle(request({ path: OWN_PATH }, ''), deps(adminCfg()));
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('suggestion-image-delete: student role -> 403 (admin-only)', async () => {
  const res = await handle(
    request({ path: OWN_PATH }),
    deps({
      user: { id: STUDENT_ID },
      tables: { profiles: { rows: [{ id: STUDENT_ID, role: 'student', status: 'active', deleted_at: null }] } },
    }),
  );
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('suggestion-image-delete: teacher role -> 403 (admin-only inbox)', async () => {
  const res = await handle(
    request({ path: OWN_PATH }),
    deps({
      user: { id: TEACHER_ID },
      tables: { profiles: { rows: [{ id: TEACHER_ID, role: 'teacher', status: 'active', deleted_at: null }] } },
    }),
  );
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('suggestion-image-delete: malformed pointer -> 422 validation_error', async () => {
  const res = await handle(request({ path: `${STUDENT_ID}/${SUG_ID}.jpg` }), deps(adminCfg()));
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'validation_error');
});

Deno.test('suggestion-image-delete: success destroys the suggestion asset', async () => {
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  const res = await handle(
    request({ path: OWN_PATH }),
    deps(adminCfg(), (url, init) => {
      calls.push({ url, body: init.body });
      return Promise.resolve({ status: 200, json: () => Promise.resolve({ result: 'ok' }) });
    }),
  );
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.deleted, true);
  assertEqual(calls.length, 1);
  assertEqual(calls[0].body.get('public_id'), `suggestion-images/${SUG_ID}/${IMAGE_ID}`);
  assertEqual(calls[0].body.get('type'), 'authenticated');
});

Deno.test('suggestion-image-delete: not-found counts as deleted (idempotent)', async () => {
  const res = await handle(
    request({ path: OWN_PATH }),
    deps(adminCfg(), () => Promise.resolve({ status: 200, json: () => Promise.resolve({ result: 'not found' }) })),
  );
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.deleted, true);
});

Deno.test('suggestion-image-delete: Cloudinary failure -> 502 destroy_failed', async () => {
  const res = await handle(
    request({ path: OWN_PATH }),
    deps(adminCfg(), () => Promise.resolve({ status: 400, json: () => Promise.resolve({}) })),
  );
  await expectStatus(res, 502);
  const body = await res.json();
  assertEqual(body.error.code, 'destroy_failed');
});

Deno.test('suggestion-image-delete: missing Cloudinary secrets -> 500 misconfigured', async () => {
  const { client } = makeStubClient(adminCfg());
  const res = await handle(request({ path: OWN_PATH }), {
    url: 'https://example.supabase.co',
    makeClient: () => client,
    cloudinary: { cloudName: '', apiKey: '', apiSecret: '' },
    nowSec: () => 1788000000,
    cloudinaryFetch: () => Promise.resolve({ status: 200, json: () => Promise.resolve({ result: 'ok' }) }),
  });
  await expectStatus(res, 500);
  const body = await res.json();
  assertEqual(body.error.code, 'misconfigured');
});
