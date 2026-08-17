// Unit tests for delete-pdf (Phase 4, ghost-row cleanup).
// Pure helper (parseDeleteBody) is tested directly; handle() runs
// against the hand-rolled stub client (no network).

import { handle, PDF_BUCKET } from './index.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const LESSON_ID = '40000000-0000-0000-0000-000000000001';
const WALID_ID = '20000000-0000-0000-0000-000000000002';
const STUDENT_ID = '20000000-0000-0000-0000-000000000003';
const PDF_ID = '30000000-0000-0000-0000-000000000001';
const STORAGE_PATH = `${LESSON_ID}/aaaaaaaa-bbbb-cccc-dddd-eeeeffff0001.pdf`;

function request(body?: unknown, authHeader = 'Bearer test-jwt'): Request {
  return new Request('https://example.supabase.co/functions/v1/delete-pdf', {
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
      lesson_pdfs: {
        rows: [
          {
            id: PDF_ID,
            lesson_id: LESSON_ID,
            is_ready: false,
            deleted_at: null,
            storage_path: STORAGE_PATH,
          },
        ],
      },
    },
    rpc: {
      delete_pdf_upload_record: { data: null },
    },
    storage: { pdfs: {} },
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

function deps(cfg: StubConfig) {
  const { client, rpcCalls, storageCalls } = makeStubClient(cfg);
  const clientKeys: string[] = [];
  return {
    dep: {
      url: 'https://example.supabase.co',
      makeClient: (_url: string, jwt: string) => {
        clientKeys.push(jwt);
        return client;
      },
    },
    rpcCalls,
    storageCalls,
    clientKeys,
  };
}

function deletePost() {
  return request({ lesson_id: LESSON_ID, pdf_id: PDF_ID });
}

Deno.test('delete-pdf: GET is rejected with 405', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(new Request('https://example.supabase.co/functions/v1/delete-pdf'), dep);
  await expectStatus(res, 405);
});

Deno.test('delete-pdf: missing Authorization header -> 401', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request(undefined, ''), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('delete-pdf: invalid token (getUser failure) -> 401', async () => {
  const { dep } = deps(staffCfg({ getUserError: { message: 'invalid JWT' } }));
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('delete-pdf: caller without a profile -> 403', async () => {
  const { dep } = deps(staffCfg({ user: { id: '99999999-9999-9999-9999-999999999999' } }));
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('delete-pdf: student role -> 403', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      user: { id: STUDENT_ID },
      tables: {
        profiles: {
          rows: [{ id: STUDENT_ID, role: 'student', status: 'active', deleted_at: null }],
        },
      },
    }),
  );
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('delete-pdf: disabled profile -> 403 account_inactive_or_deleted', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: {
        profiles: { rows: [{ id: WALID_ID, role: 'admin', status: 'disabled', deleted_at: null }] },
      },
    }),
  );
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'account_inactive_or_deleted');
});

Deno.test('delete-pdf: soft-deleted profile -> 403 account_inactive_or_deleted', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: {
        profiles: {
          rows: [
            {
              id: WALID_ID,
              role: 'admin',
              status: 'active',
              deleted_at: '2026-08-01T00:00:00.000Z',
            },
          ],
        },
      },
    }),
  );
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'account_inactive_or_deleted');
});

Deno.test('delete-pdf: non-JSON body -> 400 invalid_json', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request('not json at all'), dep);
  await expectStatus(res, 400);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_json');
});

Deno.test('delete-pdf: malformed lesson_id / pdf_id -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  for (const lesson_id of ['not-a-uuid', 42, '', null]) {
    const res = await handle(request({ lesson_id, pdf_id: PDF_ID }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'validation_error');
  }
  for (const pdf_id of ['not-a-uuid', 42, '', null]) {
    const res = await handle(request({ lesson_id: LESSON_ID, pdf_id }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'validation_error');
  }
});

Deno.test('delete-pdf: unknown row -> 404 pdf_not_found (no storage, no RPC)', async () => {
  const { dep, rpcCalls, storageCalls } = deps(
    deepMerge(staffCfg(), { tables: { lesson_pdfs: { rows: [] } } }),
  );
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'pdf_not_found');
  assertEqual(rpcCalls.length, 0, 'no RPC before the row is validated');
  assertEqual(storageCalls.length, 0, 'no storage removal for an unknown row');
});

Deno.test('delete-pdf: ready row -> 409 pdf_not_pending (no RPC)', async () => {
  const { dep, rpcCalls, storageCalls } = deps(
    deepMerge(staffCfg(), {
      tables: {
        lesson_pdfs: {
          rows: [
            {
              id: PDF_ID,
              lesson_id: LESSON_ID,
              is_ready: true,
              deleted_at: null,
              storage_path: STORAGE_PATH,
            },
          ],
        },
      },
    }),
  );
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 409);
  const body = await res.json();
  assertEqual(body.error.code, 'pdf_not_pending');
  assertEqual(rpcCalls.length, 0, 'ready rows are never deleted');
  assertEqual(storageCalls.length, 0, 'no storage removal for a ready row');
});

Deno.test('delete-pdf: success removes storage object and releases the row', async () => {
  const { dep, rpcCalls, storageCalls, clientKeys } = deps(staffCfg());
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.deleted, true);
  assertEqual(body.pdf_id, PDF_ID);

  // request-scoped client: caller token only, never the service-role key
  assert(
    deepEqual(clientKeys, ['test-jwt']),
    `makeClient must receive only the bearer token, got ${JSON.stringify(clientKeys)}`,
  );
  assert(!clientKeys.includes('service-role-key'), 'service-role key must never be used');

  // storage object removed at the exact row path on the pdfs bucket
  assertEqual(storageCalls.length, 1);
  assertEqual(storageCalls[0].bucket, PDF_BUCKET);
  assertEqual(storageCalls[0].path, STORAGE_PATH);

  // wrapper called with the release args
  assertEqual(rpcCalls.length, 1);
  assertEqual(rpcCalls[0].fn, 'delete_pdf_upload_record');
  assert(
    deepEqual(rpcCalls[0].args, { p_lesson_id: LESSON_ID, p_pdf_id: PDF_ID }),
    `unexpected RPC args: ${JSON.stringify(rpcCalls[0].args)}`,
  );
});

Deno.test('delete-pdf: storage remove failure is best-effort (still 200 + RPC)', async () => {
  const { dep, rpcCalls } = deps(
    deepMerge(staffCfg(), {
      storage: { pdfs: { removeError: { code: 'ObjectNotFound', message: 'missing object' } } },
    }),
  );
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.deleted, true);
  assertEqual(rpcCalls.length, 1, 'the row delete must not depend on the object removal');
});

Deno.test('delete-pdf: wrapper permission_denied -> 403', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: { delete_pdf_upload_record: { error: { code: 'permission_denied', message: 'nope' } } },
    }),
  );
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'permission_denied');
});

Deno.test('delete-pdf: wrapper pdf_not_found -> 404', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: { delete_pdf_upload_record: { error: { code: 'pdf_not_found', message: 'gone' } } },
    }),
  );
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'pdf_not_found');
});

Deno.test('delete-pdf: wrapper wrong_lesson -> 422', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: { delete_pdf_upload_record: { error: { code: 'wrong_lesson', message: 'other' } } },
    }),
  );
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'wrong_lesson');
});

Deno.test('delete-pdf: wrapper pdf_not_pending -> 409', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: { delete_pdf_upload_record: { error: { code: 'pdf_not_pending', message: 'finalized' } } },
    }),
  );
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 409);
  const body = await res.json();
  assertEqual(body.error.code, 'pdf_not_pending');
});

Deno.test('delete-pdf: generic RPC failure -> 502 function_error (no raw message leak)', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: {
        delete_pdf_upload_record: {
          error: { code: 'P0001', message: 'connection string leaked' },
        },
      },
    }),
  );
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 502);
  const body = await res.json();
  assertEqual(body.error.code, 'function_error');
  assert(!JSON.stringify(body).includes('connection string leaked'), 'raw message never surfaces');
});

Deno.test('delete-pdf: admin role also allowed', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: {
        profiles: { rows: [{ id: WALID_ID, role: 'admin', status: 'active', deleted_at: null }] },
      },
    }),
  );
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 200);
});

Deno.test('delete-pdf: profile query failure -> 403 (never leaks)', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: {
        profiles: { error: { code: 'PGRST116', message: 'relation profiles does not exist' } },
      },
    }),
  );
  const res = await handle(deletePost(), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});