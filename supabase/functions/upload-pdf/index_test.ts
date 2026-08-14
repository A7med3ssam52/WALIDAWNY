import { handle, MAX_PDF_SIZE_BYTES } from './index.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const LESSON_ID = '40000000-0000-0000-0000-000000000001';
const DELETED_LESSON_ID = '40000000-0000-0000-0000-000000000004';
const WALID_ID = '20000000-0000-0000-0000-000000000002';
const STUDENT_ID = '20000000-0000-0000-0000-000000000003';
const PDF_ID = '30000000-0000-0000-0000-000000000001';
const RESERVED_PATH = `${LESSON_ID}/aaaaaaaa-bbbb-cccc-dddd-eeeeffff0001.pdf`;

function request(body?: unknown, authHeader = 'Bearer test-jwt'): Request {
  return new Request('https://example.supabase.co/functions/v1/upload-pdf', {
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
      lessons: { rows: [{ id: LESSON_ID, deleted_at: null }] },
    },
    rpc: {
      create_pdf_upload_record: {
        data: [{ id: PDF_ID, storage_path: RESERVED_PATH }],
      },
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

Deno.test('upload-pdf: GET is rejected with 405', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(new Request('https://example.supabase.co/functions/v1/upload-pdf'), dep);
  await expectStatus(res, 405);
});

Deno.test('upload-pdf: missing Authorization header -> 401', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request(undefined, ''), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('upload-pdf: invalid token (getUser failure) -> 401', async () => {
  const { dep } = deps(staffCfg({ getUserError: { message: 'invalid JWT' } }));
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('upload-pdf: caller without a profile -> 403', async () => {
  const { dep } = deps(staffCfg({ user: { id: '99999999-9999-9999-9999-999999999999' } }));
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('upload-pdf: student role -> 403', async () => {
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
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('upload-pdf: disabled profile -> 403 account_inactive_or_deleted', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: {
        profiles: { rows: [{ id: WALID_ID, role: 'admin', status: 'disabled', deleted_at: null }] },
      },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'account_inactive_or_deleted');
});

Deno.test('upload-pdf: soft-deleted profile -> 403 account_inactive_or_deleted', async () => {
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
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'account_inactive_or_deleted');
});

Deno.test('upload-pdf: non-JSON body -> 400 invalid_json', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request('not json at all'), dep);
  await expectStatus(res, 400);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_json');
});

Deno.test('upload-pdf: malformed lesson_id -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  for (const lesson_id of ['not-a-uuid', 42, '', null]) {
    const res = await handle(request({ lesson_id, file_name: 'lesson.pdf' }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'validation_error');
  }
});

Deno.test('upload-pdf: missing/empty/non-string file_name -> 422 invalid_file_name', async () => {
  const { dep } = deps(staffCfg());
  for (const file_name of [undefined, '', '   ', 42, null]) {
    const res = await handle(request({ lesson_id: LESSON_ID, file_name }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'invalid_file_name');
  }
});

Deno.test('upload-pdf: illegal characters -> 422 invalid_file_name', async () => {
  const { dep } = deps(staffCfg());
  for (const file_name of ['bad?name.pdf', 'col:on.pdf', 'star*name.pdf', 'ctrl\x01char.pdf']) {
    const res = await handle(request({ lesson_id: LESSON_ID, file_name }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'invalid_file_name');
  }
});

Deno.test('upload-pdf: non-.pdf extension -> 422 invalid_file_name', async () => {
  const { dep } = deps(staffCfg());
  for (const file_name of ['lesson.txt', 'lesson.pdf.exe', 'lesson', ' lesson.txt ']) {
    const res = await handle(request({ lesson_id: LESSON_ID, file_name }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'invalid_file_name');
  }
});

Deno.test('upload-pdf: file_name too long -> 422 invalid_file_name', async () => {
  const { dep } = deps(staffCfg());
  const long = `${'a'.repeat(256)}.pdf`;
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: long }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_file_name');
});

Deno.test('upload-pdf: path traversal is sanitized to basename (forward + backslash)', async () => {
  for (const raw of ['../x.pdf', '..\\x.pdf', 'a/b/lesson ي.pdf']) {
    const { dep, rpcCalls } = deps(staffCfg());
    const res = await handle(request({ lesson_id: LESSON_ID, file_name: raw }), dep);
    await expectStatus(res, 200);
    assertEqual(rpcCalls[0]!.args!.p_original_name, raw.includes('ي') ? 'lesson ي.pdf' : 'x.pdf');
  }
});

Deno.test('upload-pdf: .pdf extension is case-insensitive, Arabic names allowed', async () => {
  const { dep, rpcCalls, storageCalls, clientKeys } = deps(staffCfg());
  const res = await handle(
    request({ lesson_id: LESSON_ID, file_name: 'ملخص-الوحدة-1.PDF', file_size: 12345 }),
    dep,
  );
  await expectStatus(res, 200);
  const body = await res.json();

  assert(
    deepEqual(rpcCalls[0].args, {
      p_lesson_id: LESSON_ID,
      p_original_name: 'ملخص-الوحدة-1.PDF',
      p_size_bytes: 12345,
    }),
    `unexpected RPC args: ${JSON.stringify(rpcCalls[0].args)}`,
  );

  // request-scoped client: caller token only, never the service-role key
  assert(
    deepEqual(clientKeys, ['test-jwt']),
    `makeClient must receive only the bearer token, got ${JSON.stringify(clientKeys)}`,
  );
  assert(!clientKeys.includes('service-role-key'), 'service-role key must never be used');

  // signed upload URL on the pdfs bucket at the exact reserved path with
  // content-type application/pdf
  assertEqual(storageCalls.length, 1);
  assertEqual(storageCalls[0].bucket, 'pdfs');
  assertEqual(storageCalls[0].path, RESERVED_PATH);
  assertEqual(storageCalls[0].options?.contentType, 'application/pdf');

  assertEqual(body.pdf_id, PDF_ID);
  assertEqual(body.storage_path, RESERVED_PATH);
  assertEqual(body.expires_in, 60);
  assert(
    typeof body.uploadUrl === 'string' && body.uploadUrl.length > 0,
    'uploadUrl must be a non-empty string',
  );
  assertEqual(
    body.uploadUrl,
    `https://example.supabase.co/storage/v1/object/upload/sign/pdfs/${RESERVED_PATH}`,
  );
});

Deno.test('upload-pdf: declared file_size above 50MiB -> 422 file_too_large', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(
    request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf', file_size: MAX_PDF_SIZE_BYTES + 1 }),
    dep,
  );
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'file_too_large');
});

Deno.test('upload-pdf: non-integer/negative file_size -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  for (const file_size of [2.5, -1, 'large']) {
    const res = await handle(
      request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf', file_size }),
      dep,
    );
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'validation_error');
  }
});

Deno.test('upload-pdf: unknown lesson -> 404 lesson_not_found', async () => {
  const { dep } = deps(deepMerge(staffCfg(), { tables: { lessons: { rows: [] } } }));
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'lesson_not_found');
});

Deno.test('upload-pdf: soft-deleted lesson -> 422 lesson_deleted', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: {
        lessons: { rows: [{ id: DELETED_LESSON_ID, deleted_at: '2026-08-01T00:00:00.000Z' }] },
      },
    }),
  );
  const res = await handle(request({ lesson_id: DELETED_LESSON_ID, file_name: 'lesson.pdf' }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'lesson_deleted');
});

Deno.test('upload-pdf: wrapper permission_denied -> 403 permission_denied', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: {
        create_pdf_upload_record: { error: { code: 'permission_denied', message: 'denied' } },
      },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'permission_denied');
});

Deno.test('upload-pdf: wrapper lesson_not_found -> 404', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: { create_pdf_upload_record: { error: { code: 'lesson_not_found', message: 'nope' } } },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'lesson_not_found');
});

Deno.test('upload-pdf: wrapper lesson_deleted -> 422', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: { create_pdf_upload_record: { error: { code: 'lesson_deleted', message: 'gone' } } },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'lesson_deleted');
});

Deno.test('upload-pdf: wrapper invalid_pdf_size -> 422 file_too_large', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: { create_pdf_upload_record: { error: { code: 'invalid_pdf_size', message: 'big' } } },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'file_too_large');
});

Deno.test(
  'upload-pdf: generic RPC failure -> 502 pdf_reservation_failed (no raw message leak)',
  async () => {
    const { dep } = deps(
      deepMerge(staffCfg(), {
        rpc: {
          create_pdf_upload_record: {
            error: { code: 'P0001', message: 'connection string leaked' },
          },
        },
      }),
    );
    const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
    await expectStatus(res, 502);
    const body = await res.json();
    assertEqual(body.error.code, 'pdf_reservation_failed');
    assert(
      !JSON.stringify(body).includes('connection string leaked'),
      'raw message must never surface',
    );
  },
);

Deno.test('upload-pdf: empty reservation result -> 502 pdf_reservation_failed', async () => {
  const { dep } = deps(deepMerge(staffCfg(), { rpc: { create_pdf_upload_record: { data: [] } } }));
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
  await expectStatus(res, 502);
  const body = await res.json();
  assertEqual(body.error.code, 'pdf_reservation_failed');
});

Deno.test(
  'upload-pdf: signed-URL issuance failure -> 502 upload_url_failed (no raw message leak)',
  async () => {
    const { dep } = deps(
      deepMerge(staffCfg(), {
        storage: {
          pdfs: { error: { code: 'SPolicyViolationError', message: 'bucket secret exposed' } },
        },
      }),
    );
    const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
    await expectStatus(res, 502);
    const body = await res.json();
    assertEqual(body.error.code, 'upload_url_failed');
    assert(
      !JSON.stringify(body).includes('bucket secret exposed'),
      'raw message must never surface',
    );
  },
);

Deno.test('upload-pdf: admin role also allowed', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: {
        profiles: { rows: [{ id: WALID_ID, role: 'admin', status: 'active', deleted_at: null }] },
      },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
  await expectStatus(res, 200);
});

Deno.test('upload-pdf: profile query failure -> 403 (never leaks)', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: {
        profiles: { error: { code: 'PGRST116', message: 'relation profiles does not exist' } },
      },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'lesson.pdf' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('upload-pdf: known lesson + valid name -> 200, clean response shape', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'ملخص-الوحدة-1.pdf' }), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assert(
    deepEqual(Object.keys(body).sort(), ['expires_in', 'pdf_id', 'storage_path', 'uploadUrl']),
    `unexpected response keys: ${JSON.stringify(Object.keys(body).sort())}`,
  );
});
