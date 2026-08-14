// Unit tests for recheck-video-states (Phase 5, Function 2/J2).
// Token gate, stuck-row selection and per-status reconciliation run
// against the stub client with injectable Bunny status deps (no network).

import { handle, targetForBunnyStatus } from './index.ts';
import type { Deps } from './index.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const JOB_TOKEN = 'job-token-0123456789abcdef';
const DB_VIDEO_ID = '50000000-0000-0000-0000-000000000003';
const LESSON_ID = '40000000-0000-0000-0000-000000000001';
const BUNNY_VIDEO_ID = '12345678-1234-1234-1234-123456789abc';

function request(token: string | null): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== null) headers['x-internal-token'] = token;
  return new Request('https://example.supabase.co/functions/v1/recheck-video-states', {
    method: 'POST',
    headers,
    body: '{}',
  });
}

function jobCfg(overrides?: Partial<StubConfig>): StubConfig {
  const cfg: StubConfig = {
    tables: {
      lesson_videos: {
        rows: [
          {
            id: DB_VIDEO_ID,
            lesson_id: LESSON_ID,
            status: 'pending_upload',
            bunny_video_id: BUNNY_VIDEO_ID,
            created_at: '2025-01-01T00:00:00Z',
            deleted_at: null,
          },
        ],
      },
    },
    rpc: { set_video_status: { data: null } },
  };
  return {
    ...cfg,
    ...overrides,
    tables: { ...cfg.tables, ...(overrides?.tables ?? {}) },
  };
}

type LiveStatus =
  | { kind: 'error' }
  | { kind: 'missing' }
  | { kind: 'video'; status: number; length: number | null; thumbnailUrl: string | null };

function deps(cfg: StubConfig, live: LiveStatus) {
  const { client, rpcCalls } = makeStubClient(cfg);
  const dep: Deps = {
    url: 'https://example.supabase.co',
    serviceRoleKey: 'service-role-key',
    getToken: () => JOB_TOKEN,
    makeClient: () => client,
    bunnyApiKey: 'test-api-key',
    bunnyLibraryId: '725671',
    bunnyVideoStatus: () => Promise.resolve(live),
    now: () => 1760000000000,
  };
  return { dep, rpcCalls };
}

const statusOf = (n: number): LiveStatus => ({
  kind: 'video',
  status: n,
  length: 75,
  thumbnailUrl: 'https://x/thumb.jpg',
});

// ---------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------

Deno.test('targetForBunnyStatus: mapping', () => {
  assertEqual(targetForBunnyStatus(3), 'ready');
  assertEqual(targetForBunnyStatus(1), 'processing');
  assertEqual(targetForBunnyStatus(2), 'processing');
  assertEqual(targetForBunnyStatus(4), 'processing');
  assertEqual(targetForBunnyStatus(7), 'uploading');
  assertEqual(targetForBunnyStatus(5), 'failed');
  assertEqual(targetForBunnyStatus(6), 'failed');
  assertEqual(targetForBunnyStatus(8), 'failed');
  assertEqual(targetForBunnyStatus(0), null);
  assertEqual(targetForBunnyStatus(9), null);
  assertEqual(targetForBunnyStatus(10), null);
});

// ---------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------

Deno.test('recheck-video-states: GET rejected with 405', async () => {
  const { dep } = deps(jobCfg(), statusOf(3));
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/recheck-video-states'),
    dep,
  );
  await expectStatus(res, 405);
});

Deno.test('recheck-video-states: token not configured -> 500 server_misconfigured', async () => {
  const { dep } = deps(jobCfg(), statusOf(3));
  dep.getToken = () => null;
  const res = await handle(request(JOB_TOKEN), dep);
  await expectStatus(res, 500);
});

Deno.test('recheck-video-states: missing token -> 401', async () => {
  const { dep } = deps(jobCfg(), statusOf(3));
  const res = await handle(request(null), dep);
  await expectStatus(res, 401);
});

Deno.test('recheck-video-states: wrong token -> 401', async () => {
  const { dep } = deps(jobCfg(), statusOf(3));
  const res = await handle(request('nope'), dep);
  await expectStatus(res, 401);
});

Deno.test('recheck-video-states: no candidates -> { checked: 0, updated: 0 }', async () => {
  const { dep, rpcCalls } = deps(jobCfg({ tables: { lesson_videos: { rows: [] } } }), statusOf(3));
  const res = await handle(request(JOB_TOKEN), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.checked, 0);
  assertEqual(body.updated, 0);
  assertEqual(rpcCalls.length, 0);
});

Deno.test('recheck-video-states: candidate query failure -> 500', async () => {
  const { dep } = deps(
    jobCfg({
      tables: { lesson_videos: { rows: [], error: { code: 'PGRST000', message: 'boom' } } },
    }),
    statusOf(3),
  );
  const res = await handle(request(JOB_TOKEN), dep);
  await expectStatus(res, 500);
  const body = await res.json();
  assertEqual(body.error.code, 'recheck_failed');
});

Deno.test('recheck-video-states: finished -> ready chain with metadata', async () => {
  const { dep, rpcCalls } = deps(jobCfg(), statusOf(3));
  const res = await handle(request(JOB_TOKEN), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.checked, 1);
  assertEqual(body.updated, 1);

  const steps = rpcCalls.map((c) => c.args);
  assertEqual(steps.length, 3, 'pending_upload -> uploading -> processing -> ready');
  assert(
    deepEqual(
      steps.map((s) => s?.p_new_status),
      ['uploading', 'processing', 'ready'],
    ),
  );
  assertEqual(steps[2]?.p_duration_seconds, 75);
  assertEqual(steps[2]?.p_thumbnail_url, 'https://x/thumb.jpg');
});

Deno.test('recheck-video-states: processing -> single processing step', async () => {
  const { dep, rpcCalls } = deps(
    jobCfg({
      tables: {
        lesson_videos: {
          rows: [
            {
              id: DB_VIDEO_ID,
              lesson_id: LESSON_ID,
              status: 'uploading',
              bunny_video_id: BUNNY_VIDEO_ID,
              created_at: '2025-01-01T00:00:00Z',
              deleted_at: null,
            },
          ],
        },
      },
    }),
    statusOf(2),
  );
  const res = await handle(request(JOB_TOKEN), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.updated, 1);
  assertEqual(rpcCalls.length, 1);
  assertEqual(rpcCalls[0].args?.p_new_status, 'processing');
});

Deno.test('recheck-video-states: missing on Bunny -> failed with message', async () => {
  const { dep, rpcCalls } = deps(jobCfg(), { kind: 'missing' });
  const res = await handle(request(JOB_TOKEN), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.updated, 1);
  assertEqual(rpcCalls.length, 1);
  assertEqual(rpcCalls[0].args?.p_new_status, 'failed');
  assertEqual(rpcCalls[0].args?.p_error_message, 'video not found on Bunny');
});

Deno.test('recheck-video-states: failed status -> failed with message', async () => {
  const { dep, rpcCalls } = deps(jobCfg(), statusOf(5));
  const res = await handle(request(JOB_TOKEN), dep);
  await expectStatus(res, 200);
  assertEqual(rpcCalls[0].args?.p_new_status, 'failed');
  assertEqual(rpcCalls[0].args?.p_error_message, 'Bunny status 5 (failed)');
});

Deno.test('recheck-video-states: queued (0) -> no-op', async () => {
  const { dep, rpcCalls } = deps(jobCfg(), statusOf(0));
  const res = await handle(request(JOB_TOKEN), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.updated, 0);
  assertEqual(rpcCalls.length, 0);
});

Deno.test('recheck-video-states: transient fetch error -> skipped, not updated', async () => {
  const { dep, rpcCalls } = deps(jobCfg(), { kind: 'error' });
  const res = await handle(request(JOB_TOKEN), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.checked, 1);
  assertEqual(body.updated, 0);
  assertEqual(rpcCalls.length, 0);
});

Deno.test(
  'recheck-video-states: invalid_video_transition race -> counted checked, not updated',
  async () => {
    const { dep } = deps(
      jobCfg({
        rpc: {
          set_video_status: {
            error: { code: 'invalid_video_transition', message: 'already advanced' },
          },
        },
      }),
      statusOf(3),
    );
    const res = await handle(request(JOB_TOKEN), dep);
    await expectStatus(res, 200);
    const body = await res.json();
    assertEqual(body.checked, 1);
    assertEqual(body.updated, 0);
  },
);

Deno.test('recheck-video-states: multiple candidates, mixed outcomes', async () => {
  const { dep, rpcCalls } = deps(
    jobCfg({
      tables: {
        lesson_videos: {
          rows: [
            {
              id: DB_VIDEO_ID,
              lesson_id: LESSON_ID,
              status: 'pending_upload',
              bunny_video_id: BUNNY_VIDEO_ID,
              created_at: '2025-01-01T00:00:00Z',
              deleted_at: null,
            },
            {
              id: '50000000-0000-0000-0000-000000000004',
              lesson_id: LESSON_ID,
              status: 'processing',
              bunny_video_id: 'video-two',
              created_at: '2025-01-02T00:00:00Z',
              deleted_at: null,
            },
            {
              id: '50000000-0000-0000-0000-000000000005',
              lesson_id: LESSON_ID,
              status: 'uploading',
              bunny_video_id: 'video-three',
              created_at: '2025-01-03T00:00:00Z',
              deleted_at: null,
            },
          ],
        },
      },
    }),
    statusOf(3),
  );
  const res = await handle(request(JOB_TOKEN), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.checked, 3);
  assertEqual(body.updated, 3);
  // each candidate reconciled to ready with its own chain length
  assertEqual(rpcCalls.length, 3 + 2 + 1);
});
