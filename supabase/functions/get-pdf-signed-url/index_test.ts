// Unit tests for get-pdf-signed-url (Phase 6, Function 4).
// The access-gate matrix and the signed-URL issuance run against the
// stub client (no network).

import { handle, DEFAULT_TTL_SECONDS, PDFS_BUCKET } from './index.ts';
import { assert, assertEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const USER_STUDENT = { id: '70000000-0000-0000-0000-000000000001' };
const USER_STAFF = { id: '70000000-0000-0000-0000-000000000009' };
const LESSON_ID = '40000000-0000-0000-0000-000000000001';
const PDF_ID = '50000000-0000-0000-0000-000000000002';
const PDF_PATH = '40000000-0000-0000-0000-000000000001/lesson-notes.pdf';

function post(lessonId: string, user: { id: string }): Request {
  return new Request('https://example.supabase.co/functions/v1/get-pdf-signed-url', {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.id}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ lesson_id: lessonId }),
  });
}

function cfg(overrides?: Partial<StubConfig>): StubConfig {
  const base: StubConfig = {
    user: USER_STUDENT,
    tables: {
      profiles: {
        rows: [{ id: USER_STUDENT.id, role: 'student', status: 'active', deleted_at: null }],
      },
      lessons: { rows: [{ id: LESSON_ID, deleted_at: null }] },
      subscriptions: {
        rows: [
          {
            id: '81000000-0000-0000-0000-000000000001',
            student_id: USER_STUDENT.id,
            status: 'active',
            expires_at: '2099-01-01T00:00:00Z',
          },
        ],
      },
      lesson_pdfs: {
        rows: [
          {
            id: PDF_ID,
            lesson_id: LESSON_ID,
            storage_path: PDF_PATH,
            original_name: 'ملخص الدرس.pdf',
            is_primary: true,
            is_ready: true,
            deleted_at: null,
          },
        ],
      },
    },
    storage: {
      pdfs: {
        signedUrl: 'https://example.supabase.co/storage/v1/object/sign/pdfs/lesson.pdf?token=abc',
      },
    },
  };
  return {
    ...base,
    ...overrides,
    tables: { ...base.tables, ...(overrides?.tables ?? {}) },
    storage: { ...base.storage, ...(overrides?.storage ?? {}) },
  };
}

function deps(cfg: StubConfig, ttlSeconds?: number) {
  const { client, storageCalls } = makeStubClient(cfg);
  const dep = {
    url: 'https://example.supabase.co',
    makeClient: () => client,
    makeServiceClient: () => client,
    ttlSeconds,
    nowUnix: () => 1750000000,
  };
  return { dep, storageCalls };
}

// ---------------------------------------------------------------------
// HTTP surface + validation
// ---------------------------------------------------------------------

Deno.test('get-pdf-signed-url: GET rejected with 405', async () => {
  const { dep } = deps(cfg());
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/get-pdf-signed-url'),
    dep,
  );
  await expectStatus(res, 405);
});

Deno.test('get-pdf-signed-url: missing Authorization -> 401', async () => {
  const { dep } = deps(cfg());
  const req = new Request('https://example.supabase.co/functions/v1/get-pdf-signed-url', {
    method: 'POST',
    body: JSON.stringify({ lesson_id: LESSON_ID }),
  });
  const res = await handle(req, dep);
  await expectStatus(res, 401);
});

Deno.test('get-pdf-signed-url: invalid lesson_id -> 422', async () => {
  const { dep } = deps(cfg());
  const res = await handle(post('not-a-uuid', USER_STUDENT), dep);
  await expectStatus(res, 422);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'validation_error');
});

Deno.test('get-pdf-signed-url: non-JSON body -> 422', async () => {
  const { dep } = deps(cfg());
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/get-pdf-signed-url', {
      method: 'POST',
      headers: { Authorization: `Bearer ${USER_STUDENT.id}` },
      body: 'not json',
    }),
    dep,
  );
  await expectStatus(res, 422);
});

// ---------------------------------------------------------------------
// Role / account gate
// ---------------------------------------------------------------------

Deno.test('get-pdf-signed-url: staff rejected with 403 (student-only, S7)', async () => {
  const { dep } = deps(
    cfg({
      tables: {
        profiles: {
          rows: [{ id: USER_STAFF.id, role: 'mr_walid', status: 'active', deleted_at: null }],
        },
      },
    }),
  );
  const res = await handle(post(LESSON_ID, USER_STAFF), dep);
  await expectStatus(res, 403);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('get-pdf-signed-url: disabled account -> account_inactive_or_deleted', async () => {
  const { dep } = deps(
    cfg({
      tables: {
        profiles: {
          rows: [{ id: USER_STUDENT.id, role: 'student', status: 'disabled', deleted_at: null }],
        },
      },
    }),
  );
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 403);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'account_inactive_or_deleted');
});

// ---------------------------------------------------------------------
// Access gate matrix (student)
// ---------------------------------------------------------------------

Deno.test('get-pdf-signed-url: invisible lesson -> access_denied 403', async () => {
  const { dep } = deps(cfg({ tables: { lessons: { rows: [] } } }));
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 403);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'access_denied');
});

Deno.test('get-pdf-signed-url: soft-deleted lesson -> access_denied 403', async () => {
  const { dep } = deps(
    cfg({ tables: { lessons: { rows: [{ id: LESSON_ID, deleted_at: '2026-01-01T00:00:00Z' }] } } }),
  );
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 403);
});

Deno.test('get-pdf-signed-url: no active subscription -> access_denied 403', async () => {
  const { dep } = deps(cfg({ tables: { subscriptions: { rows: [] } } }));
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 403);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'access_denied');
});

Deno.test('get-pdf-signed-url: expired subscription -> access_denied 403', async () => {
  const { dep } = deps(
    cfg({
      tables: {
        subscriptions: {
          rows: [
            {
              id: '81000000-0000-0000-0000-000000000001',
              student_id: USER_STUDENT.id,
              status: 'active',
              expires_at: '2020-01-01T00:00:00Z',
            },
          ],
        },
      },
    }),
  );
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 403);
});

// ---------------------------------------------------------------------
// PDF resolution
// ---------------------------------------------------------------------

Deno.test('get-pdf-signed-url: no primary ready pdf -> pdf_not_ready 409', async () => {
  const { dep } = deps(
    cfg({
      tables: {
        lesson_pdfs: {
          rows: [
            {
              id: PDF_ID,
              lesson_id: LESSON_ID,
              storage_path: PDF_PATH,
              original_name: 'x.pdf',
              is_primary: true,
              is_ready: false,
              deleted_at: null,
            },
          ],
        },
      },
    }),
  );
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 409);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'pdf_not_ready');
});

Deno.test('get-pdf-signed-url: non-primary row is not resolved (MED-7)', async () => {
  const { dep } = deps(
    cfg({
      tables: {
        lesson_pdfs: {
          rows: [
            {
              id: PDF_ID,
              lesson_id: LESSON_ID,
              storage_path: PDF_PATH,
              original_name: 'x.pdf',
              is_primary: false,
              is_ready: true,
              deleted_at: null,
            },
          ],
        },
      },
    }),
  );
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 409);
});

// ---------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------

Deno.test('get-pdf-signed-url: signed URL issued via service role on the pdfs bucket', async () => {
  const { dep, storageCalls } = deps(cfg(), 123);
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 200);
  const body = (await res.json()) as {
    pdf_url: string;
    pdf_id: string;
    lesson_id: string;
    original_name: string | null;
    expires_at: string;
  };
  assertEqual(
    body.pdf_url,
    'https://example.supabase.co/storage/v1/object/sign/pdfs/lesson.pdf?token=abc',
  );
  assertEqual(body.pdf_id, PDF_ID);
  assertEqual(body.lesson_id, LESSON_ID);
  assertEqual(body.original_name, 'ملخص الدرس.pdf');
  assertEqual(body.expires_at, new Date((1750000000 + 123) * 1000).toISOString());
  assertEqual(storageCalls.length, 1);
  assertEqual(storageCalls[0].bucket, PDFS_BUCKET);
  assertEqual(storageCalls[0].path, PDF_PATH);
  assertEqual(storageCalls[0].options?.expiresIn, 123);
});

Deno.test('get-pdf-signed-url: default TTL is 15 minutes', async () => {
  const { dep } = deps(cfg());
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 200);
  const body = (await res.json()) as { expires_at: string };
  assertEqual(body.expires_at, new Date((1750000000 + DEFAULT_TTL_SECONDS) * 1000).toISOString());
});

Deno.test(
  'get-pdf-signed-url: storage error -> internal_error 500 (message not echoed)',
  async () => {
    const { dep } = deps(
      cfg({ storage: { pdfs: { error: { message: 'boom', code: 'storage_error' } } } }),
    );
    const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
    await expectStatus(res, 500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assertEqual(body.error.code, 'internal_error');
    assert(!body.error.message.includes('boom'), 'raw error must not be echoed');
  },
);

Deno.test('get-pdf-signed-url: profile query failure -> 403 (no caller leak)', async () => {
  const { dep } = deps(cfg({ tables: { profiles: { error: { message: 'db down' } } } }));
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 403);
});
