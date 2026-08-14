import { handle, MAX_CODES_PER_REQUEST } from './index.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const PLAN_ID = '10000000-0000-0000-0000-000000000001';
const WALID_ID = '20000000-0000-0000-0000-000000000002';
const STUDENT_ID = '20000000-0000-0000-0000-000000000003';

function request(body?: unknown, authHeader = 'Bearer test-jwt'): Request {
  return new Request('https://example.supabase.co/functions/v1/generate-subscription-codes', {
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
      pricing_plans: { rows: [{ id: PLAN_ID, is_active: true }] },
    },
    rpc: {
      create_codes_for_staff: {
        data: [
          {
            id: '30000000-0000-0000-0000-000000000001',
            code: 'WLDN-ABCD-EFGH-JKMN',
            pricing_plan_id: PLAN_ID,
            status: 'available',
            created_at: '2026-08-11T00:00:00.000Z',
            note: 'ramadan batch',
            created_by: WALID_ID,
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

Deno.test('generate-subscription-codes: GET is rejected with 405', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/generate-subscription-codes'),
    dep,
  );
  await expectStatus(res, 405);
});

Deno.test('generate-subscription-codes: missing Authorization header -> 401', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request(undefined, ''), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('generate-subscription-codes: invalid token (getUser failure) -> 401', async () => {
  const { dep } = deps(staffCfg({ getUserError: { message: 'invalid JWT' } }));
  const res = await handle(request({ plan_id: PLAN_ID, count: 3 }), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('generate-subscription-codes: caller without a profile -> 403', async () => {
  const { dep } = deps(staffCfg({ user: { id: '99999999-9999-9999-9999-999999999999' } }));
  const res = await handle(request({ plan_id: PLAN_ID, count: 3 }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('generate-subscription-codes: student role -> 403', async () => {
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
  const res = await handle(request({ plan_id: PLAN_ID, count: 3 }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test(
  'generate-subscription-codes: disabled profile -> 403 account_inactive_or_deleted',
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
    const res = await handle(request({ plan_id: PLAN_ID, count: 3 }), dep);
    await expectStatus(res, 403);
    const body = await res.json();
    assertEqual(body.error.code, 'account_inactive_or_deleted');
  },
);

Deno.test(
  'generate-subscription-codes: soft-deleted profile -> 403 account_inactive_or_deleted',
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
    const res = await handle(request({ plan_id: PLAN_ID, count: 3 }), dep);
    await expectStatus(res, 403);
    const body = await res.json();
    assertEqual(body.error.code, 'account_inactive_or_deleted');
  },
);

Deno.test('generate-subscription-codes: non-JSON body -> 400', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request('not json at all'), dep);
  await expectStatus(res, 400);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_json');
});

Deno.test('generate-subscription-codes: malformed plan_id -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  for (const plan_id of ['not-a-uuid', 42, '', null]) {
    const res = await handle(request({ plan_id, count: 3 }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'validation_error');
  }
});

Deno.test('generate-subscription-codes: count 0 -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request({ plan_id: PLAN_ID, count: 0 }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'validation_error');
});

Deno.test('generate-subscription-codes: count above cap -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request({ plan_id: PLAN_ID, count: MAX_CODES_PER_REQUEST + 1 }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'validation_error');
});

Deno.test('generate-subscription-codes: non-integer count -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request({ plan_id: PLAN_ID, count: 2.5 }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'validation_error');
});

Deno.test('generate-subscription-codes: unknown plan -> 404 plan_not_found', async () => {
  const { dep } = deps(deepMerge(staffCfg(), { tables: { pricing_plans: { rows: [] } } }));
  const res = await handle(request({ plan_id: PLAN_ID, count: 3 }), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'plan_not_found');
});

Deno.test('generate-subscription-codes: inactive plan -> 422 plan_inactive', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: { pricing_plans: { rows: [{ id: PLAN_ID, is_active: false }] } },
    }),
  );
  const res = await handle(request({ plan_id: PLAN_ID, count: 3 }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'plan_inactive');
});

Deno.test(
  'generate-subscription-codes: mr_walid + valid plan/count -> wrapper RPC called with caller token and right args, mapped codes returned',
  async () => {
    const { dep, rpcCalls, clientKeys } = deps(staffCfg());
    const res = await handle(request({ plan_id: PLAN_ID, count: 3, note: 'ramadan batch' }), dep);
    await expectStatus(res, 200);
    const body = await res.json();

    assertEqual(rpcCalls.length, 1);
    assertEqual(rpcCalls[0].fn, 'create_codes_for_staff');
    assert(
      deepEqual(rpcCalls[0].args, { p_plan_id: PLAN_ID, p_count: 3, p_note: 'ramadan batch' }),
      `unexpected RPC args: ${JSON.stringify(rpcCalls[0].args)}`,
    );

    // Request-scoped client: built with the caller's Bearer token, never the
    // service-role key.
    assert(
      deepEqual(clientKeys, ['test-jwt']),
      `makeClient must receive only the caller's bearer token, got: ${JSON.stringify(clientKeys)}`,
    );
    assert(!clientKeys.includes('service-role-key'), 'service-role key must never be used');

    assert(Array.isArray(body.codes) && body.codes.length === 1, 'expected exactly one code row');
    const row = body.codes[0];
    assertEqual(row.code, 'WLDN-ABCD-EFGH-JKMN');
    assertEqual(row.plan, PLAN_ID);
    assertEqual(row.status, 'available');
    assertEqual(row.created_at, '2026-08-11T00:00:00.000Z');
    assertEqual(row.note, 'ramadan batch');
    assert(
      !('created_by' in row) && !('id' in row),
      'internal columns must not leak to the caller',
    );
  },
);

Deno.test('generate-subscription-codes: note omitted -> p_note null', async () => {
  const { dep, rpcCalls } = deps(staffCfg());
  const res = await handle(request({ plan_id: PLAN_ID, count: 2 }), dep);
  await expectStatus(res, 200);
  assert(deepEqual(rpcCalls[0].args, { p_plan_id: PLAN_ID, p_count: 2, p_note: null }));
});

Deno.test('generate-subscription-codes: RPC permission_denied -> 403', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: { create_codes_for_staff: { error: { code: 'permission_denied', message: 'denied' } } },
    }),
  );
  const res = await handle(request({ plan_id: PLAN_ID, count: 3 }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'permission_denied');
});

Deno.test('generate-subscription-codes: RPC plan_not_found -> 404', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: { create_codes_for_staff: { error: { code: 'plan_not_found', message: 'not found' } } },
    }),
  );
  const res = await handle(request({ plan_id: PLAN_ID, count: 3 }), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'plan_not_found');
});

Deno.test('generate-subscription-codes: RPC invalid_count -> 422 validation_error', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      rpc: { create_codes_for_staff: { error: { code: 'invalid_count', message: 'bad count' } } },
    }),
  );
  const res = await handle(request({ plan_id: PLAN_ID, count: 3 }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'validation_error');
});

Deno.test(
  'generate-subscription-codes: RPC system_actor_required -> 502 code_generation_failed (code never surfaced)',
  async () => {
    const { dep } = deps(
      deepMerge(staffCfg(), {
        rpc: {
          create_codes_for_staff: { error: { code: 'system_actor_required', message: 'no actor' } },
        },
      }),
    );
    const res = await handle(request({ plan_id: PLAN_ID, count: 3 }), dep);
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
  'generate-subscription-codes: generic RPC error -> 502 code_generation_failed (no raw message leak)',
  async () => {
    const { dep } = deps(
      deepMerge(staffCfg(), {
        rpc: {
          create_codes_for_staff: {
            error: { code: 'P0001', message: 'connection refused to secret db' },
          },
        },
      }),
    );
    const res = await handle(request({ plan_id: PLAN_ID, count: 3 }), dep);
    await expectStatus(res, 502);
    const body = await res.json();
    assertEqual(body.error.code, 'code_generation_failed');
    assertEqual(body.error.message, 'Failed to generate codes.');
  },
);
