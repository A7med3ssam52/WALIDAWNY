// Unit tests for export-audit-log (Phase 8, Function 7).
// Role gate, filter handling, CSV building (BOM + escaping) and the
// upload -> signed-URL pipeline run against the stub client (no network).

import { AUDIT_EXPORTS_BUCKET, buildCsv, handle } from './index.ts';
import { assert, assertEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const USER_ADMIN = { id: '70000000-0000-0000-0000-00000000000a' };
const USER_STAFF = { id: '70000000-0000-0000-0000-000000000009' };
const CSV_PATH = 'audit-log-1750000000-export.csv';

function post(user: { id: string }, body: unknown): Request {
  return new Request('https://example.supabase.co/functions/v1/export-audit-log', {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.id}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function cfg(overrides?: Partial<StubConfig>): StubConfig {
  const base: StubConfig = {
    user: USER_ADMIN,
    tables: {
      profiles: {
        rows: [{ id: USER_ADMIN.id, role: 'admin', status: 'active', deleted_at: null }],
      },
      v_audit_log: {
        rows: [
          {
            id: '1',
            created_at: '2026-08-01T10:00:00Z',
            actor_id: USER_ADMIN.id,
            actor_name: 'المشرف العام',
            actor_role: 'admin',
            action: 'grade.create',
            entity_type: 'grades',
            entity_id: null,
            ip_address: '127.0.0.1',
            metadata: { name: 'الصف الأول' },
          },
          {
            id: '2',
            created_at: '2026-08-02T10:00:00Z',
            actor_id: USER_ADMIN.id,
            actor_name: 'المشرف العام',
            actor_role: 'admin',
            action: 'user.role_change',
            entity_type: 'profiles',
            entity_id: null,
            ip_address: null,
            metadata: null,
          },
          {
            id: '3',
            created_at: '2026-08-03T10:00:00Z',
            actor_id: null,
            actor_name: null,
            actor_role: null,
            action: 'pricing.delete',
            entity_type: 'pricing_plans',
            entity_id: null,
            ip_address: '10.0.0.1',
            metadata: { note: 'قال "مرحبًا"' },
          },
        ],
      },
    },
    storage: {
      'audit-exports': {
        signedUrl:
          'https://example.supabase.co/storage/v1/object/sign/audit-exports/export.csv?token=abc',
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

function deps(cfg: StubConfig) {
  const { client, storageCalls } = makeStubClient(cfg);
  const dep = {
    url: 'https://example.supabase.co',
    makeClient: () => client,
    makeServiceClient: () => client,
    ttlSeconds: 600,
    nowUnix: () => 1750000000,
    randomPath: () => CSV_PATH,
  };
  return { dep, storageCalls };
}

// ---------------------------------------------------------------------
// HTTP surface + validation
// ---------------------------------------------------------------------

Deno.test('export-audit-log: GET rejected with 405', async () => {
  const { dep } = deps(cfg());
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/export-audit-log'),
    dep,
  );
  await expectStatus(res, 405);
});

Deno.test('export-audit-log: missing Authorization -> 401', async () => {
  const { dep } = deps(cfg());
  const req = new Request('https://example.supabase.co/functions/v1/export-audit-log', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const res = await handle(req, dep);
  await expectStatus(res, 401);
});

Deno.test('export-audit-log: non-JSON body -> 422', async () => {
  const { dep } = deps(cfg());
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/export-audit-log', {
      method: 'POST',
      headers: { Authorization: `Bearer ${USER_ADMIN.id}` },
      body: 'not json',
    }),
    dep,
  );
  await expectStatus(res, 422);
});

Deno.test('export-audit-log: invalid actor_id -> 422', async () => {
  const { dep } = deps(cfg());
  const res = await handle(post(USER_ADMIN, { actor_id: 'not-a-uuid' }), dep);
  await expectStatus(res, 422);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'validation_error');
});

// ---------------------------------------------------------------------
// Role / account gate
// ---------------------------------------------------------------------

Deno.test('export-audit-log: mr_walid rejected with 403', async () => {
  const { dep } = deps(
    cfg({
      tables: {
        profiles: {
          rows: [{ id: USER_STAFF.id, role: 'mr_walid', status: 'active', deleted_at: null }],
        },
      },
    }),
  );
  const res = await handle(post(USER_STAFF, {}), dep);
  await expectStatus(res, 403);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('export-audit-log: disabled admin -> account_inactive_or_deleted', async () => {
  const { dep } = deps(
    cfg({
      tables: {
        profiles: {
          rows: [{ id: USER_ADMIN.id, role: 'admin', status: 'disabled', deleted_at: null }],
        },
      },
    }),
  );
  const res = await handle(post(USER_ADMIN, {}), dep);
  await expectStatus(res, 403);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'account_inactive_or_deleted');
});

// ---------------------------------------------------------------------
// CSV building (unit) -- BOM + escaping
// ---------------------------------------------------------------------

Deno.test('buildCsv: emits a UTF-8 BOM header and quoted cells', () => {
  const csv = buildCsv([
    {
      created_at: '2026-08-01T10:00:00Z',
      actor_id: 'a',
      actor_name: 'سارة',
      actor_role: 'admin',
      action: 'grade.create',
      entity_type: 'grades',
      entity_id: null,
      ip_address: '1.2.3.4',
      metadata: { name: 'الصف الأول' },
    },
  ]);
  assert(csv.startsWith('\uFEFF'), 'csv starts with the BOM');
  const lines = csv.slice(1).split('\r\n');
  assertEqual(
    lines[0],
    '"created_at","actor_id","actor_name","actor_role","action","entity_type","entity_id","ip_address","metadata"',
  );
  assert(lines[1].includes('"سارة"'), 'Arabic actor name survives unescaped inside quotes');
  assert(
    lines[1].includes('"{""name"":""الصف الأول""}"'),
    'metadata JSON is embedded with doubled quotes',
  );
});

Deno.test('buildCsv: escapes embedded quotes in metadata', () => {
  const csv = buildCsv([
    {
      created_at: '2026-08-03T10:00:00Z',
      actor_id: null,
      actor_name: null,
      actor_role: null,
      action: 'pricing.delete',
      entity_type: 'pricing_plans',
      entity_id: null,
      ip_address: null,
      metadata: { note: 'قال "مرحبًا"' },
    },
  ]);
  assert(csv.includes('قال \\""مرحبًا\\""'), 'inner quotes are doubled for CSV round-tripping');
});

// ---------------------------------------------------------------------
// End-to-end pipeline
// ---------------------------------------------------------------------

Deno.test(
  'export-audit-log: admin export uploads to audit-exports and returns a signed URL',
  async () => {
    const { dep, storageCalls } = deps(cfg());
    const res = await handle(post(USER_ADMIN, {}), dep);
    await expectStatus(res, 200);
    const body = (await res.json()) as { url: string; rows: number; expires_at: string };
    assert(
      body.url.startsWith('https://example.supabase.co/storage/v1/object/sign/audit-exports/'),
      'signed URL points at the bucket',
    );
    assertEqual(body.rows, 3);

    const upload = storageCalls.find((call) => call.path === CSV_PATH);
    assert(upload !== undefined, 'CSV was uploaded to the bucket');
    assertEqual(upload!.bucket, AUDIT_EXPORTS_BUCKET);
    assertEqual(upload!.options?.contentType, 'text/csv; charset=utf-8');

    const signed = storageCalls.find((call) => call.options?.expiresIn === 600);
    assert(signed !== undefined, 'signed URL issued with the 600 s TTL');
    assertEqual(signed!.path, CSV_PATH);
    assertEqual(body.expires_at, '2025-06-15T15:16:40.000Z'); // now(1750000000) + 600
  },
);

Deno.test('export-audit-log: action and entity_type substring filters narrow the CSV', async () => {
  const { dep } = deps(cfg());
  const res = await handle(post(USER_ADMIN, { action: 'grade', entity_type: 'grades' }), dep);
  await expectStatus(res, 200);
  const body = (await res.json()) as { rows: number };
  assertEqual(body.rows, 1);
});

Deno.test('export-audit-log: actor_id and date-range filters reach the query', async () => {
  const { client, storageCalls } = makeStubClient(cfg());
  const dep = {
    url: 'https://example.supabase.co',
    makeClient: () => client,
    makeServiceClient: () => client,
    ttlSeconds: 600,
    nowUnix: () => 1750000000,
    randomPath: () => CSV_PATH,
  };
  const res = await handle(
    post(USER_ADMIN, {
      actor_id: USER_ADMIN.id,
      from: '2026-08-01T00:00:00Z',
      to: '2026-08-31T23:59:59Z',
    }),
    dep,
  );
  await expectStatus(res, 200);
  void res;
  assert(
    storageCalls.some((call) => call.path === CSV_PATH),
    'export still produced',
  );
});

Deno.test('export-audit-log: upload failure -> 500 internal_error', async () => {
  const { dep } = deps(
    cfg({
      storage: { 'audit-exports': { uploadError: { message: 'boom', code: 'boom' } } },
    }),
  );
  const res = await handle(post(USER_ADMIN, {}), dep);
  await expectStatus(res, 500);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'internal_error');
});

Deno.test('export-audit-log: sign failure -> 500 internal_error', async () => {
  const { dep } = deps(
    cfg({
      storage: { 'audit-exports': { error: { message: 'boom', code: 'boom' } } },
    }),
  );
  const res = await handle(post(USER_ADMIN, {}), dep);
  await expectStatus(res, 500);
  const body = (await res.json()) as { error: { code: string } };
  assertEqual(body.error.code, 'internal_error');
});
