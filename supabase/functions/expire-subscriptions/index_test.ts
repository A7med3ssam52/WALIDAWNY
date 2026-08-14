import { handle, timingSafeEqual } from './index.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const JOB_TOKEN = 'job-token-0123456789abcdef';

function request(token: string | null): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== null) headers['x-internal-token'] = token;
  return new Request('https://example.supabase.co/functions/v1/expire-subscriptions', {
    method: 'POST',
    headers,
    body: '{}',
  });
}

function jobCfg(overrides?: Partial<StubConfig>): StubConfig {
  const cfg: StubConfig = {
    tables: {
      subscriptions: { countQueue: [4, 1] },
    },
    rpc: { expire_subscriptions: { data: null } },
  };
  return { ...cfg, ...overrides, tables: { ...cfg.tables, ...(overrides?.tables ?? {}) } };
}

function deps(cfg: StubConfig, token: string | null = JOB_TOKEN) {
  const { client, rpcCalls } = makeStubClient(cfg);
  return {
    dep: {
      url: 'https://example.supabase.co',
      serviceRoleKey: 'service-role-key',
      getToken: () => token,
      makeClient: () => client,
    },
    rpcCalls,
  };
}

Deno.test('timingSafeEqual: equal values -> true', async () => {
  assert(await timingSafeEqual('same-token-value', 'same-token-value'));
});

Deno.test('timingSafeEqual: unequal values (same length) -> false', async () => {
  assert(!(await timingSafeEqual('aaaaaaaaaa', 'aaaaaaaabb')));
});

Deno.test('timingSafeEqual: different lengths -> false', async () => {
  assert(!(await timingSafeEqual('short', 'a-much-longer-token-value')));
});

Deno.test('expire-subscriptions: GET is rejected with 405', async () => {
  const { dep } = deps(jobCfg());
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/expire-subscriptions'),
    dep,
  );
  await expectStatus(res, 405);
});

Deno.test(
  'expire-subscriptions: INTERNAL_JOB_TOKEN not configured -> 500 server_misconfigured',
  async () => {
    const { dep } = deps(jobCfg(), null);
    const res = await handle(request(JOB_TOKEN), dep);
    await expectStatus(res, 500);
    const body = await res.json();
    assertEqual(body.error.code, 'server_misconfigured');
  },
);

Deno.test('expire-subscriptions: missing x-internal-token header -> 401', async () => {
  const { dep } = deps(jobCfg());
  const res = await handle(request(null), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'missing_internal_token');
});

Deno.test('expire-subscriptions: wrong token -> 401 invalid_internal_token', async () => {
  const { dep } = deps(jobCfg());
  const res = await handle(request('wrong-token'), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_internal_token');
});

Deno.test(
  'expire-subscriptions: wrong-length token -> 401 invalid_internal_token (constant-time path)',
  async () => {
    const { dep } = deps(jobCfg());
    const res = await handle(request('x'), dep);
    await expectStatus(res, 401);
    const body = await res.json();
    assertEqual(body.error.code, 'invalid_internal_token');
  },
);

Deno.test(
  'expire-subscriptions: correct token -> expire_subscriptions RPC called once, delta reported',
  async () => {
    const { dep, rpcCalls } = deps(jobCfg());
    const res = await handle(request(JOB_TOKEN), dep);
    await expectStatus(res, 200);
    const body = await res.json();

    assertEqual(rpcCalls.length, 1);
    assertEqual(rpcCalls[0].fn, 'expire_subscriptions');
    assert(deepEqual(rpcCalls[0].args, {}), 'expire_subscriptions takes no arguments');
    assertEqual(body.expired, 3);
  },
);

Deno.test('expire-subscriptions: idempotent re-run -> expired 0', async () => {
  const { dep, rpcCalls } = deps(jobCfg({ tables: { subscriptions: { countQueue: [0, 0] } } }));
  const res = await handle(request(JOB_TOKEN), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(rpcCalls.length, 1);
  assertEqual(body.expired, 0);
});

Deno.test('expire-subscriptions: RPC failure -> 500 expire_failed json error', async () => {
  const { dep } = deps(
    jobCfg({
      rpc: {
        expire_subscriptions: { error: { code: 'P0001', message: 'scheduled job exploded' } },
      },
    }),
  );
  const res = await handle(request(JOB_TOKEN), dep);
  await expectStatus(res, 500);
  const body = await res.json();
  assertEqual(body.error.code, 'expire_failed');
  assertEqual(body.error.message, 'Scheduled expiry job failed.');
});
