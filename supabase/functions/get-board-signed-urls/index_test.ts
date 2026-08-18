// Unit tests for get-board-signed-urls (Phase 8, Lesson Boards).
// The access-gate matrix and the signed-URL issuance run against the
// stub client (no network).

import { handle, DEFAULT_TTL_SECONDS, BOARDS_BUCKET } from './index.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const USER_STUDENT = { id: '70000000-0000-0000-0000-000000000001' };
const USER_STAFF = { id: '70000000-0000-0000-0000-000000000009' };
const LESSON_ID = '40000000-0000-0000-0000-000000000001';
const B1_PATH = `${LESSON_ID}/board-1.jpg`;
const B2_PATH = `${LESSON_ID}/board-2.png`;
const B3_PATH = `${LESSON_ID}/board-3.webp`;

// Deliberately scrambled: the handler must return them sorted by
// sort_order ascending (the stub has no order() chain).
const BOARD_ROWS = [
  {
    id: '50000000-0000-0000-0000-000000000003',
    lesson_id: LESSON_ID,
    storage_path: B3_PATH,
    original_name: 'board-3.webp',
    sort_order: 3,
    is_ready: true,
    deleted_at: null,
  },
  {
    id: '50000000-0000-0000-0000-000000000001',
    lesson_id: LESSON_ID,
    storage_path: B1_PATH,
    original_name: 'بورد-1.jpg',
    sort_order: 1,
    is_ready: true,
    deleted_at: null,
  },
  {
    id: '50000000-0000-0000-0000-000000000002',
    lesson_id: LESSON_ID,
    storage_path: B2_PATH,
    original_name: 'board-2.png',
    sort_order: 2,
    is_ready: true,
    deleted_at: null,
  },
];

function post(lessonId: string, user: { id: string }): Request {
  return new Request('https://example.supabase.co/functions/v1/get-board-signed-urls', {
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
      lesson_boards: { rows: BOARD_ROWS },
    },
    rpc: {
      get_my_lesson_access: {
        data: { has_access: true, has_purchase: true, is_trial: false },
      },
    },
    storage: {
      boards: {
        signedUrl: 'https://example.supabase.co/storage/v1/object/sign/boards/b.jpg?token=abc',
      },
    },
  };
  return {
    ...base,
    ...overrides,
    tables: { ...base.tables, ...(overrides?.tables ?? {}) },
    rpc: { ...base.rpc, ...(overrides?.rpc ?? {}) },
    storage: { ...base.storage, ...(overrides?.storage ?? {}) },
  };
}

function deps(cfg: StubConfig, ttlSeconds?: number) {
  const { client, storageCalls, rpcCalls } = makeStubClient(cfg);
  const dep = {
    url: 'https://example.supabase.co',
    makeClient: () => client,
    makeServiceClient: () => client,
    ttlSeconds,
  };
  return { dep, storageCalls, rpcCalls };
}

// ---------------------------------------------------------------------
// HTTP surface + validation
// ---------------------------------------------------------------------

Deno.test('get-board-signed-urls: GET rejected with 405', async () => {
  const { dep } = deps(cfg());
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/get-board-signed-urls'),
    dep,
  );
  await expectStatus(res, 405);
});

Deno.test('get-board-signed-urls: missing Authorization -> 401', async () => {
  const { dep } = deps(cfg());
  const req = new Request('https://example.supabase.co/functions/v1/get-board-signed-urls', {
    method: 'POST',
    body: JSON.stringify({ lesson_id: LESSON_ID }),
  });
  const res = await handle(req, dep);
  await expectStatus(res, 401);
});

Deno.test('get-board-signed-urls: invalid lesson_id -> 422 validation_error', async () => {
  const { dep } = deps(cfg());
  const res = await handle(post('not-a-uuid', USER_STUDENT), dep);
  await expectStatus(res, 422);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'validation_error');
});

Deno.test('get-board-signed-urls: non-JSON body -> 400 invalid_json', async () => {
  const { dep } = deps(cfg());
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/get-board-signed-urls', {
      method: 'POST',
      headers: { Authorization: `Bearer ${USER_STUDENT.id}` },
      body: 'not json',
    }),
    dep,
  );
  await expectStatus(res, 400);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'invalid_json');
});

// ---------------------------------------------------------------------
// Role / account gate
// ---------------------------------------------------------------------

Deno.test('get-board-signed-urls: caller without a profile -> 403 forbidden', async () => {
  const { dep } = deps(cfg({ user: { id: '99999999-9999-9999-9999-999999999999' } }));
  const res = await handle(post(LESSON_ID, { id: '99999999-9999-9999-9999-999999999999' }), dep);
  await expectStatus(res, 403);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('get-board-signed-urls: unknown role -> 403 forbidden', async () => {
  const { dep } = deps(
    cfg({
      user: USER_STAFF,
      tables: {
        profiles: {
          rows: [{ id: USER_STAFF.id, role: 'x', status: 'active', deleted_at: null }],
        },
      },
    }),
  );
  const res = await handle(post(LESSON_ID, USER_STAFF), dep);
  await expectStatus(res, 403);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('get-board-signed-urls: disabled account -> account_inactive_or_deleted', async () => {
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

Deno.test('get-board-signed-urls: soft-deleted account -> account_inactive_or_deleted', async () => {
  const { dep } = deps(
    cfg({
      tables: {
        profiles: {
          rows: [
            {
              id: USER_STUDENT.id,
              role: 'student',
              status: 'active',
              deleted_at: '2026-08-01T00:00:00.000Z',
            },
          ],
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
// Lesson reachability + student access gate
// ---------------------------------------------------------------------

Deno.test('get-board-signed-urls: invisible lesson -> access_denied 403', async () => {
  const { dep } = deps(cfg({ tables: { lessons: { rows: [] } } }));
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 403);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'access_denied');
});

Deno.test('get-board-signed-urls: soft-deleted lesson -> access_denied 403', async () => {
  const { dep } = deps(
    cfg({ tables: { lessons: { rows: [{ id: LESSON_ID, deleted_at: '2026-01-01T00:00:00Z' }] } } }),
  );
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 403);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'access_denied');
});

Deno.test('get-board-signed-urls: student without access -> access_denied 403', async () => {
  const { dep } = deps(
    cfg({
      rpc: {
        get_my_lesson_access: { data: { has_access: false, has_purchase: false, is_trial: false } },
      },
    }),
  );
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 403);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'access_denied');
});

Deno.test('get-board-signed-urls: lesson-access RPC failure -> internal_error 500', async () => {
  const { dep } = deps(
    cfg({ rpc: { get_my_lesson_access: { error: { message: 'db down', code: 'P0001' } } } }),
  );
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 500);
  const body = (await res.json()) as { error: { code: string; message: string } };
  assertEqual(body.error.code, 'internal_error');
  assert(!body.error.message.includes('db down'), 'raw error must not be echoed');
});

// ---------------------------------------------------------------------
// Student success path
// ---------------------------------------------------------------------

Deno.test(
  'get-board-signed-urls: student with access gets sorted signed URLs (ttl 900, boards bucket)',
  async () => {
    const { dep, storageCalls, rpcCalls } = deps(cfg());
    const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
    await expectStatus(res, 200);
    const body = (await res.json()) as Array<{
      board_id: string;
      original_name: string | null;
      sort_order: number | null;
      signed_url: string;
    }>;

    // gate called exactly once with the lesson
    assertEqual(rpcCalls.length, 1);
    assertEqual(rpcCalls[0].fn, 'get_my_lesson_access');
    assert(
      deepEqual(rpcCalls[0].args, { p_lesson_id: LESSON_ID }),
      `unexpected RPC args: ${JSON.stringify(rpcCalls[0].args)}`,
    );

    // response is sorted by sort_order ascending with the full shape
    assertEqual(body.length, 3);
    assertEqual(body[0].board_id, '50000000-0000-0000-0000-000000000001');
    assertEqual(body[0].original_name, 'بورد-1.jpg');
    assertEqual(body[0].sort_order, 1);
    assertEqual(body[1].board_id, '50000000-0000-0000-0000-000000000002');
    assertEqual(body[2].board_id, '50000000-0000-0000-0000-000000000003');
    assert(
      deepEqual(Object.keys(body[0]).sort(), [
        'board_id',
        'original_name',
        'signed_url',
        'sort_order',
      ]),
      `unexpected item keys: ${JSON.stringify(Object.keys(body[0]).sort())}`,
    );
    assert(
      typeof body[0].signed_url === 'string' && body[0].signed_url.length > 0,
      'signed_url must be a non-empty string',
    );

    // one signing call per board, in sorted order, on the boards bucket
    assertEqual(storageCalls.length, 3);
    assertEqual(storageCalls[0].bucket, BOARDS_BUCKET);
    assertEqual(storageCalls[0].path, B1_PATH);
    assertEqual(storageCalls[1].path, B2_PATH);
    assertEqual(storageCalls[2].path, B3_PATH);
    assertEqual(storageCalls[0].options?.expiresIn, DEFAULT_TTL_SECONDS);
  },
);

Deno.test('get-board-signed-urls: default TTL is 15 minutes', async () => {
  const { dep, storageCalls } = deps(cfg());
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 200);
  assertEqual(storageCalls[0].options?.expiresIn, DEFAULT_TTL_SECONDS);
});

Deno.test('get-board-signed-urls: injectable TTL is honored', async () => {
  const { dep, storageCalls } = deps(cfg(), 123);
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 200);
  assertEqual(storageCalls[0].options?.expiresIn, 123);
});

// ---------------------------------------------------------------------
// Staff preview branch
// ---------------------------------------------------------------------

Deno.test(
  'get-board-signed-urls: staff (admin) -> 200 without the access gate',
  async () => {
    const { dep, rpcCalls } = deps(
      cfg({
        user: USER_STAFF,
        tables: {
          profiles: {
            rows: [{ id: USER_STAFF.id, role: 'admin', status: 'active', deleted_at: null }],
          },
        },
      }),
    );
    const res = await handle(post(LESSON_ID, USER_STAFF), dep);
    await expectStatus(res, 200);
    const body = (await res.json()) as Array<{ board_id: string }>;
    assertEqual(body.length, 3);
    assertEqual(rpcCalls.length, 0, 'staff preview must skip get_my_lesson_access');
  },
);

Deno.test(
  'get-board-signed-urls: staff (mr_walid) -> 200 without the access gate',
  async () => {
    const { dep, rpcCalls } = deps(
      cfg({
        user: USER_STAFF,
        tables: {
          profiles: {
            rows: [{ id: USER_STAFF.id, role: 'mr_walid', status: 'active', deleted_at: null }],
          },
        },
      }),
    );
    const res = await handle(post(LESSON_ID, USER_STAFF), dep);
    await expectStatus(res, 200);
    assertEqual(rpcCalls.length, 0);
  },
);

Deno.test(
  'get-board-signed-urls: staff (teacher) -> 200 without the access gate',
  async () => {
    const { dep, rpcCalls } = deps(
      cfg({
        user: USER_STAFF,
        tables: {
          profiles: {
            rows: [{ id: USER_STAFF.id, role: 'teacher', status: 'active', deleted_at: null }],
          },
        },
      }),
    );
    const res = await handle(post(LESSON_ID, USER_STAFF), dep);
    await expectStatus(res, 200);
    assertEqual(rpcCalls.length, 0);
  },
);

// ---------------------------------------------------------------------
// Empty / failure paths
// ---------------------------------------------------------------------

Deno.test('get-board-signed-urls: no ready boards -> 200 [] (not an error)', async () => {
  const { dep, storageCalls } = deps(cfg({ tables: { lesson_boards: { rows: [] } } }));
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 200);
  const body = (await res.json()) as unknown[];
  assertEqual(body.length, 0);
  assertEqual(storageCalls.length, 0, 'no signing calls for an empty gallery');
});

Deno.test(
  'get-board-signed-urls: storage error -> internal_error 500 (message not echoed)',
  async () => {
    const { dep } = deps(
      cfg({ storage: { boards: { error: { message: 'boom', code: 'storage_error' } } } }),
    );
    const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
    await expectStatus(res, 500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assertEqual(body.error.code, 'internal_error');
    assert(!body.error.message.includes('boom'), 'raw error must not be echoed');
  },
);

Deno.test('get-board-signed-urls: profile query failure -> 403 (no caller leak)', async () => {
  const { dep } = deps(cfg({ tables: { profiles: { error: { message: 'db down' } } } }));
  const res = await handle(post(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 403);
});
