import { handle, MAX_CODES_PER_REQUEST } from './index.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const UNIT_ID = '10000000-0000-0000-0000-000000000001';
const WALID_ID = '20000000-0000-0000-0000-000000000002';
const TEACHER_ID = '20000000-0000-0000-0000-000000000003';
const STUDENT_ID = '20000000-0000-0000-0000-000000000004';

function request(body?: unknown, authHeader = 'Bearer test-jwt'): Request {
  return new Request('https://example.supabase.co/functions/v1/generate-unit-codes', {
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
    },
    rpc: {
      create_unit_codes_for_staff: {
        data: [
          {
            id: '30000000-0000-0000-0000-000000000001',
            code: 'WLDN-AB2DE4FG6JK8',
            unit_pricing_id: '30000000-0000-0000-0000-000000000002',
            status: 'available',
            created_at: '2026-08-15T00:00:00.000Z',
            note: 'ramadan batch',
            created_by: WALID_ID,
            used_at: null,
            used_by: null,
            revoked_at: null,
          },
        ],
      },
    },
  };
  return deepMerge(cfg, overrides ?? {});
}

function deepMerge(base: StubConfig, override: Partial<StubConfig>): StubConfig {
  return {
    ...base,
    ...override,
    tables: { ...base.tables, ...(override.tables ?? {}) },
    rpc: { ...base.rpc, ...(override.rpc ?? {}) },
  };
}

function deps(cfg: StubConfig) {
  const { client, rpcCalls } = makeStubClient(cfg);
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
    clientKeys,
  };
}

Deno.test('generate-unit-codes: GET is rejected with 405', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/generate-unit-codes'),
    dep,
  );
  await expectStatus(res, 405);
});

Deno.test('generate-unit-codes: missing Authorization header -> 401', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request(undefined, ''), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('generate-unit-codes: invalid token (getUser failure) -> 401', async () => {
  const { dep } = deps(staffCfg({ getUserError: { message: 'invalid JWT' } }));
  const res = await handle(request({ unit_id: UNIT_ID, count: 3 }), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('generate-unit-codes: caller without a profile -> 403', async () => {
  const { dep } = deps(staffCfg({ user: { id: '99999999-9999-9999-9999-999999999999' } }));
  const res = await handle(request({ unit_id: UNIT_ID, count: 3 }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('generate-unit-codes: student role -> 403', async () => {
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
  const res = await handle(request({ unit_id: UNIT_ID, count: 3 }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('generate-unit-codes: teacher role is allowed (DB guard includes is_teacher)', async () => {
  const { dep, rpcCalls } = deps(
    deepMerge(staffCfg(), {
      user: { id: TEACHER_ID },
      tables: {
        profiles: {
          rows: [{ id: TEACHER_ID, role: 'teacher', status: 'active', deleted_at: null }],
        },
      },
    }),
  );
  const res = await handle(request({ unit_id: UNIT_ID, count: 2 }), dep);
  await expectStatus(res, 200);
  assertEqual(rpcCalls.length, 1);
  assertEqual(rpcCalls[0].fn, 'create_unit_codes_for_staff');
});

Deno.test(
  'generate-unit-codes: disabled profile -> 403 account_inactive_or_deleted',
  async () => {
    const { dep } = deps(
      deepMerge(staffCfg(), {
        tables: {
          profiles: {
            rows: [{ id: WALID_ID, role: 'mr_walid', status: 'disabled', deleted_at: null }],
          },
        },
      }),
    );
    const res = await handle(request({ unit_id: UNIT_ID, count: 3 }), dep);
    await expectStatus(res, 403);
    const body = await res.json();
    assertEqual(body.error.code, 'account_inactive_or_deleted');
  },
);

Deno.test(
  'generate-unit-codes: soft-deleted profile -> 403 account_inactive_or_deleted',
  async () => {
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
    const res = await handle(request({ unit_id: UNIT_ID, count: 3 }), dep);
    await expectStatus(res, 403);
    const body = await res.json();
    assertEqual(body.error.code, 'account_inactive_or_deleted');
  },
);

Deno.test('generate-unit-codes: non-JSON body -> 400', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request('not json at all'), dep);
  await expectStatus(res, 400);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_json');
});

Deno.test('generate-unit-codes: malformed unit_id -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  for (const unit_id of ['not-a-uuid', 42, '', null]) {
    const res = await handle(request({ unit_id, count: 3 }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'validation_error');
  }
});

Deno.test('generate-unit-codes: count 0 -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request({ unit_id: UNIT_ID, count: 0 }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'validation_error');
});

Deno.test('generate-unit-codes: count above cap -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request({ unit_id: UNIT_ID, count: MAX_CODES_PER_REQUEST + 1 }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'validation_error');
});

Deno.test('generate-unit-codes: non-integer count -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request({ unit_id: UNIT_ID, count: 2.5 }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'validation_error');
});

Deno.test('generate-unit-codes: non-string note -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request({ unit_id: UNIT_ID, count: 3, note: 42 }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'validation_error');
});

Deno.test(
  'generate-unit-codes: mr_walid + valid unit/count -> wrapper RPC called with caller token and right args, code strings returned',
  async () => {
    const { dep, rpcCalls, clientKeys } = deps(staffCfg());
    const res = await handle(request({ unit_id: UNIT_ID, count: 3, note: 'ramadan batch' }), dep);
    await expectStatus(res, 200);
    const body = await res.json();

    assertEqual(rpcCalls.length, 1);
    assertEqual(rpcCalls[0].fn, 'create_unit_codes_for_staff');
    assert(
      deepEqual(rpcCalls[0].args, { p_unit_id: UNIT_ID, p_count: 3, p_note: 'ramadan batch' }),
      `unexpected RPC args: ${JSON.stringify(rpcCalls[0].args)}`,
    );

    // Request-scoped client: built with the caller's Bearer token, never the
    // service-role key.
    assert(
      deepEqual(clientKeys, ['test-jwt']),
      `makeClient must receive only the caller's bearer token, got: ${JSON.stringify(clientKeys)}`,
    );
    assert(!clientKeys.includes('service-role-key'), 'service-role key must never be used');

    assertEqual(body.ok, true);
    assert(Array.isArray(body.codes) && body.codes.length === 1, 'expected exactly one code');
    assertEqual(body.codes[0], 'WLDN-AB2DE4FG6JK8');
    assert(
      body.codes.every((c: unknown) => typeof c === 'string'),
      'codes must be plain code strings; internal columns must not leak',
    );
  },
);

Deno.test('generate-unit-codes: note omitted -> p_note null', async () => {
  const { dep, rpcCalls } = deps(staffCfg());
  const res = await handle(request({ unit_id: UNIT_ID, count: 2 }), dep);
  await expectStatus(res, 200);
  assert(deepEqual(rpcCalls[0].args, { p_unit_id: UNIT_ID, p_count: 2, p_note: null }));
});

Deno.test('generate-unit-codes: RPC permission_denied -> 403', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: {
        create_unit_codes_for_staff: { error: { code: 'permission_denied', message: 'denied' } },
      },
    }),
  );
  const res = await handle(request({ unit_id: UNIT_ID, count: 3 }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'permission_denied');
});

Deno.test('generate-unit-codes: RPC unit_not_found -> 404', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: {
        create_unit_codes_for_staff: { error: { code: 'unit_not_found', message: 'not found' } },
      },
    }),
  );
  const res = await handle(request({ unit_id: UNIT_ID, count: 3 }), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'unit_not_found');
});

Deno.test('generate-unit-codes: RPC unit_inactive -> 422', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: {
        create_unit_codes_for_staff: { error: { code: 'unit_inactive', message: 'inactive' } },
      },
    }),
  );
  const res = await handle(request({ unit_id: UNIT_ID, count: 3 }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'unit_inactive');
});

Deno.test('generate-unit-codes: RPC invalid_count -> 422 mirrored literally', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: {
        create_unit_codes_for_staff: { error: { code: 'invalid_count', message: 'bad count' } },
      },
    }),
  );
  const res = await handle(request({ unit_id: UNIT_ID, count: 3 }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_count');
});

Deno.test(
  'generate-unit-codes: RPC system_actor_required -> 502 code_generation_failed (code never surfaced)',
  async () => {
    const { dep } = deps(
      deepMerge(staffCfg(), {
        rpc: {
          create_unit_codes_for_staff: {
            error: { code: 'system_actor_required', message: 'no actor' },
          },
        },
      }),
    );
    const res = await handle(request({ unit_id: UNIT_ID, count: 3 }), dep);
    await expectStatus(res, 502);
    const body = await res.json();
    assertEqual(body.error.code, 'code_generation_failed');
    assertEqual(body.error.message, 'Failed to generate codes.');
    assert(
      !JSON.stringify(body).includes('system_actor_required'),
      'system_actor_required must never surface',
    );
  },
);

Deno.test(
  'generate-unit-codes: generic RPC error -> 502 code_generation_failed (no raw message leak)',
  async () => {
    const { dep } = deps(
      deepMerge(staffCfg(), {
        rpc: {
          create_unit_codes_for_staff: {
            error: { code: 'P0001', message: 'connection refused to secret db' },
          },
        },
      }),
    );
    const res = await handle(request({ unit_id: UNIT_ID, count: 3 }), dep);
    await expectStatus(res, 502);
    const body = await res.json();
    assertEqual(body.error.code, 'code_generation_failed');
    assertEqual(body.error.message, 'Failed to generate codes.');
  },
);
