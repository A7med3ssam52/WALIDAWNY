// Unit tests for upload-board (Phase 8, Lesson Boards).
// Pure helpers (sanitizeImageFileName / imageContentType / parseUploadBody)
// are exercised through handle(); handle() runs against the hand-rolled
// stub client (no network).

import { handle, MAX_BOARD_SIZE_BYTES } from './index.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const LESSON_ID = '40000000-0000-0000-0000-000000000001';
const DELETED_LESSON_ID = '40000000-0000-0000-0000-000000000004';
const WALID_ID = '20000000-0000-0000-0000-000000000002';
const STUDENT_ID = '20000000-0000-0000-0000-000000000003';
const BOARD_ID = '30000000-0000-0000-0000-000000000001';
const RESERVED_PATH = `${LESSON_ID}/aaaaaaaa-bbbb-cccc-dddd-eeeeffff0001.jpg`;

function request(body?: unknown, authHeader = 'Bearer test-jwt'): Request {
  return new Request('https://example.supabase.co/functions/v1/upload-board', {
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
      create_board_upload_record: {
        data: [{ id: BOARD_ID, storage_path: RESERVED_PATH }],
      },
    },
    storage: { boards: {} },
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

Deno.test('upload-board: GET is rejected with 405', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(new Request('https://example.supabase.co/functions/v1/upload-board'), dep);
  await expectStatus(res, 405);
});

Deno.test('upload-board: missing Authorization header -> 401', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request(undefined, ''), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('upload-board: invalid token (getUser failure) -> 401', async () => {
  const { dep } = deps(staffCfg({ getUserError: { message: 'invalid JWT' } }));
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('upload-board: caller without a profile -> 403', async () => {
  const { dep } = deps(staffCfg({ user: { id: '99999999-9999-9999-9999-999999999999' } }));
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('upload-board: student role -> 403', async () => {
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
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('upload-board: disabled profile -> 403 account_inactive_or_deleted', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: {
        profiles: { rows: [{ id: WALID_ID, role: 'admin', status: 'disabled', deleted_at: null }] },
      },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'account_inactive_or_deleted');
});

Deno.test('upload-board: soft-deleted profile -> 403 account_inactive_or_deleted', async () => {
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
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'account_inactive_or_deleted');
});

Deno.test('upload-board: non-JSON body -> 400 invalid_json', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request('not json at all'), dep);
  await expectStatus(res, 400);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_json');
});

Deno.test('upload-board: malformed lesson_id -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  for (const lesson_id of ['not-a-uuid', 42, '', null]) {
    const res = await handle(request({ lesson_id, file_name: 'board.jpg' }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'validation_error');
  }
});

Deno.test('upload-board: missing/empty/non-string file_name -> 422 invalid_file_name', async () => {
  const { dep } = deps(staffCfg());
  for (const file_name of [undefined, '', '   ', 42, null]) {
    const res = await handle(request({ lesson_id: LESSON_ID, file_name }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'invalid_file_name');
  }
});

Deno.test('upload-board: illegal characters -> 422 invalid_file_name', async () => {
  const { dep } = deps(staffCfg());
  for (const file_name of ['bad?name.jpg', 'col:on.jpg', 'star*name.jpg', 'ctrl\x01char.jpg']) {
    const res = await handle(request({ lesson_id: LESSON_ID, file_name }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'invalid_file_name');
  }
});

Deno.test('upload-board: non-image extension -> 422 invalid_file_name', async () => {
  const { dep } = deps(staffCfg());
  for (const file_name of ['board.txt', 'board.pdf', 'board.gif', 'board', ' board.txt ']) {
    const res = await handle(request({ lesson_id: LESSON_ID, file_name }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'invalid_file_name');
  }
});

Deno.test('upload-board: file_name too long -> 422 invalid_file_name', async () => {
  const { dep } = deps(staffCfg());
  const long = `${'a'.repeat(256)}.jpg`;
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: long }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_file_name');
});

Deno.test(
  'upload-board: path traversal is sanitized to basename (forward + backslash)',
  async () => {
    for (const raw of ['../x.jpg', '..\\x.jpg', 'a/b/سبورة ي.jpg']) {
      const { dep, rpcCalls } = deps(staffCfg());
      const res = await handle(request({ lesson_id: LESSON_ID, file_name: raw }), dep);
      await expectStatus(res, 200);
      assertEqual(
        rpcCalls[0]!.args!.p_original_name,
        raw.includes('ي') ? 'سبورة ي.jpg' : 'x.jpg',
      );
    }
  },
);

Deno.test(
  'upload-board: .JPG extension is case-insensitive, Arabic names allowed',
  async () => {
    const { dep, rpcCalls, storageCalls, clientKeys } = deps(staffCfg());
    const res = await handle(
      request({ lesson_id: LESSON_ID, file_name: 'ملخص-الوحدة-1.JPG', file_size: 12345 }),
      dep,
    );
    await expectStatus(res, 200);
    const body = await res.json();

    assert(
      deepEqual(rpcCalls[0].args, {
        p_lesson_id: LESSON_ID,
        p_original_name: 'ملخص-الوحدة-1.JPG',
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

    // signed upload URL on the boards bucket at the exact reserved path with
    // content-type derived from the extension
    assertEqual(storageCalls.length, 1);
    assertEqual(storageCalls[0].bucket, 'boards');
    assertEqual(storageCalls[0].path, RESERVED_PATH);
    assertEqual(storageCalls[0].options?.contentType, 'image/jpeg');

    assertEqual(body.board_id, BOARD_ID);
    assertEqual(body.storage_path, RESERVED_PATH);
    assertEqual(body.expires_in, 60);
    assert(
      typeof body.uploadUrl === 'string' && body.uploadUrl.length > 0,
      'uploadUrl must be a non-empty string',
    );
    assertEqual(
      body.uploadUrl,
      `https://example.supabase.co/storage/v1/object/upload/sign/boards/${RESERVED_PATH}`,
    );
  },
);

Deno.test('upload-board: content-type derived from the extension (jpeg/png/webp)', async () => {
  const cases: Array<[string, string]> = [
    ['slide.jpeg', 'image/jpeg'],
    ['slide.png', 'image/png'],
    ['slide.webp', 'image/webp'],
  ];
  for (const [file_name, mime] of cases) {
    const { dep, storageCalls } = deps(staffCfg());
    const res = await handle(request({ lesson_id: LESSON_ID, file_name }), dep);
    await expectStatus(res, 200);
    assertEqual(storageCalls[0].options?.contentType, mime);
  }
});

Deno.test('upload-board: declared file_size above 10MiB -> 422 file_too_large', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(
    request({
      lesson_id: LESSON_ID,
      file_name: 'board.jpg',
      file_size: MAX_BOARD_SIZE_BYTES + 1,
    }),
    dep,
  );
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'file_too_large');
});

Deno.test('upload-board: non-integer/negative file_size -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  for (const file_size of [2.5, -1, 'large']) {
    const res = await handle(
      request({ lesson_id: LESSON_ID, file_name: 'board.jpg', file_size }),
      dep,
    );
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'validation_error');
  }
});

Deno.test('upload-board: unknown lesson -> 404 lesson_not_found', async () => {
  const { dep } = deps(deepMerge(staffCfg(), { tables: { lessons: { rows: [] } } }));
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'lesson_not_found');
});

Deno.test('upload-board: soft-deleted lesson -> 422 lesson_deleted', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: {
        lessons: { rows: [{ id: DELETED_LESSON_ID, deleted_at: '2026-08-01T00:00:00.000Z' }] },
      },
    }),
  );
  const res = await handle(request({ lesson_id: DELETED_LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'lesson_deleted');
});

Deno.test('upload-board: wrapper permission_denied -> 403 permission_denied', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: {
        create_board_upload_record: { error: { code: 'permission_denied', message: 'denied' } },
      },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'permission_denied');
});

Deno.test('upload-board: wrapper lesson_not_found -> 404', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: {
        create_board_upload_record: { error: { code: 'lesson_not_found', message: 'nope' } },
      },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'lesson_not_found');
});

Deno.test('upload-board: wrapper lesson_deleted -> 422', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: { create_board_upload_record: { error: { code: 'lesson_deleted', message: 'gone' } } },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'lesson_deleted');
});

Deno.test('upload-board: wrapper invalid_board_size -> 422 file_too_large', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: {
        create_board_upload_record: { error: { code: 'invalid_board_size', message: 'big' } },
      },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'file_too_large');
});

Deno.test('upload-board: wrapper invalid_file_extension -> 422 invalid_file_name', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: {
        create_board_upload_record: {
          error: { code: 'invalid_file_extension', message: 'bad ext' },
        },
      },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_file_name');
});

Deno.test(
  'upload-board: generic RPC failure -> 502 board_reservation_failed (no raw message leak)',
  async () => {
    const { dep } = deps(
      deepMerge(staffCfg(), {
        rpc: {
          create_board_upload_record: {
            error: { code: 'P0001', message: 'connection string leaked' },
          },
        },
      }),
    );
    const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
    await expectStatus(res, 502);
    const body = await res.json();
    assertEqual(body.error.code, 'board_reservation_failed');
    assert(
      !JSON.stringify(body).includes('connection string leaked'),
      'raw message must never surface',
    );
  },
);

Deno.test('upload-board: empty reservation result -> 502 board_reservation_failed', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), { rpc: { create_board_upload_record: { data: [] } } }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 502);
  const body = await res.json();
  assertEqual(body.error.code, 'board_reservation_failed');
});

Deno.test(
  'upload-board: signed-URL issuance failure -> 502 upload_url_failed (no raw message leak)',
  async () => {
    const { dep } = deps(
      deepMerge(staffCfg(), {
        storage: {
          boards: { error: { code: 'SPolicyViolationError', message: 'bucket secret exposed' } },
        },
      }),
    );
    const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
    await expectStatus(res, 502);
    const body = await res.json();
    assertEqual(body.error.code, 'upload_url_failed');
    assert(
      !JSON.stringify(body).includes('bucket secret exposed'),
      'raw message must never surface',
    );
  },
);

Deno.test('upload-board: admin role also allowed', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: {
        profiles: { rows: [{ id: WALID_ID, role: 'admin', status: 'active', deleted_at: null }] },
      },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 200);
});

Deno.test('upload-board: teacher role also allowed', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: {
        profiles: { rows: [{ id: WALID_ID, role: 'teacher', status: 'active', deleted_at: null }] },
      },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 200);
});

Deno.test('upload-board: profile query failure -> 403 (never leaks)', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: {
        profiles: { error: { code: 'PGRST116', message: 'relation profiles does not exist' } },
      },
    }),
  );
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'board.jpg' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('upload-board: known lesson + valid name -> 200, clean response shape', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request({ lesson_id: LESSON_ID, file_name: 'ملخص-الوحدة-1.jpg' }), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assert(
    deepEqual(Object.keys(body).sort(), ['board_id', 'expires_in', 'storage_path', 'uploadUrl']),
    `unexpected response keys: ${JSON.stringify(Object.keys(body).sort())}`,
  );
});
