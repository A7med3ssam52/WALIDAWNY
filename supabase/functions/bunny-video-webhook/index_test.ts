// Unit tests for bunny-video-webhook (Phase 5, Function 2).
// Payload parsing, status mapping and transition chains are tested
// directly; handle() runs against the stub client with injectable Bunny
// metadata deps (no network).

import { handle, parseWebhookPayload, timingSafeEqual } from './index.ts';
import type { Deps } from './index.ts';
import { mapWebhookStatus, transitionChain } from '../_shared/bunny.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const WEBHOOK_TOKEN = 'webhook-token-0123456789abcdef';
const LIBRARY_ID = '725671';
const BUNNY_VIDEO_ID = '12345678-1234-1234-1234-123456789abc';
const DB_VIDEO_ID = '50000000-0000-0000-0000-000000000003';
const LESSON_ID = '40000000-0000-0000-0000-000000000001';

function post(
  payload: unknown,
  token: string | null = WEBHOOK_TOKEN,
  bodyOverride?: string,
): Request {
  const query = token === null ? '' : `?token=${encodeURIComponent(token)}`;
  return new Request(`https://example.supabase.co/functions/v1/bunny-video-webhook${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyOverride ?? JSON.stringify(payload),
  });
}

function webhookCfg(overrides?: Partial<StubConfig>): StubConfig {
  const cfg: StubConfig = {
    tables: {
      lesson_videos: {
        rows: [
          {
            id: DB_VIDEO_ID,
            lesson_id: LESSON_ID,
            status: 'pending_upload',
            bunny_video_id: BUNNY_VIDEO_ID,
          },
        ],
      },
    },
    rpc: {
      set_video_status: { data: null },
      notify_new_content: { data: null },
    },
  };
  return {
    ...cfg,
    ...overrides,
    tables: { ...cfg.tables, ...(overrides?.tables ?? {}) },
  };
}

function deps(
  cfg: StubConfig,
  metadata: unknown = { length: 75, thumbnailUrl: 'https://x/thumb.jpg' },
) {
  const { client, rpcCalls } = makeStubClient(cfg);
  const metadataCalls: string[] = [];
  const dep: Deps = {
    url: 'https://example.supabase.co',
    serviceRoleKey: 'service-role-key',
    getWebhookToken: () => WEBHOOK_TOKEN,
    makeClient: () => client,
    bunnyApiKey: 'test-api-key',
    bunnyLibraryId: LIBRARY_ID,
    bunnyGetVideo: (_lib: string, _key: string, videoId: string) => {
      metadataCalls.push(videoId);
      return Promise.resolve(
        metadata as { length: number | null; thumbnailUrl: string | null } | null,
      );
    },
  };
  return { dep, rpcCalls, metadataCalls };
}

// ---------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------

Deno.test('timingSafeEqual: equal -> true, unequal -> false', async () => {
  assert(await timingSafeEqual('token-a', 'token-a'));
  assert(!(await timingSafeEqual('token-a', 'token-b')));
});

Deno.test('mapWebhookStatus: numeric mapping (docs contract)', () => {
  assertEqual(mapWebhookStatus(3), 'ready');
  assertEqual(mapWebhookStatus(1), 'processing');
  assertEqual(mapWebhookStatus(2), 'processing');
  assertEqual(mapWebhookStatus(4), 'processing');
  assertEqual(mapWebhookStatus(6), 'uploading');
  assertEqual(mapWebhookStatus(7), 'uploading');
  assertEqual(mapWebhookStatus(5), 'failed');
  assertEqual(mapWebhookStatus(8), 'failed');
  assertEqual(mapWebhookStatus(0), 'none');
  assertEqual(mapWebhookStatus(9), 'none');
  assertEqual(mapWebhookStatus(10), 'none');
  assertEqual(mapWebhookStatus(null), 'none');
});

Deno.test('parseWebhookPayload: current shape (VideoGuid + Status)', () => {
  const p = parseWebhookPayload({
    VideoLibraryId: LIBRARY_ID,
    VideoGuid: BUNNY_VIDEO_ID,
    Status: 3,
  });
  assert(p !== null && p.videoId === BUNNY_VIDEO_ID && p.action === 'ready');
});

Deno.test('parseWebhookPayload: legacy VideoId alias accepted', () => {
  const p = parseWebhookPayload({ VideoLibraryId: LIBRARY_ID, VideoId: BUNNY_VIDEO_ID, Status: 5 });
  assert(p !== null && p.action === 'failed');
});

Deno.test(
  'parseWebhookPayload: string-only EventType payload is non-actionable (documented deviation)',
  () => {
    assert(
      parseWebhookPayload({
        VideoLibraryId: LIBRARY_ID,
        VideoGuid: BUNNY_VIDEO_ID,
        EventType: 'VideoUploaded',
      }) === null,
    );
  },
);

Deno.test('transitionChain: legal paths only', () => {
  assert(
    deepEqual(transitionChain('pending_upload', 'ready'), ['uploading', 'processing', 'ready']),
  );
  assert(deepEqual(transitionChain('uploading', 'processing'), ['processing']));
  assert(deepEqual(transitionChain('failed', 'ready'), ['uploading', 'processing', 'ready']));
  assert(deepEqual(transitionChain('ready', 'ready'), []));
  assert(transitionChain('ready', 'failed') === null, 'ready -> failed illegal');
  assert(transitionChain('replaced', 'ready') === null, 'replaced is terminal');
});

// ---------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------

Deno.test('bunny-video-webhook: GET rejected with 405', async () => {
  const { dep } = deps(webhookCfg());
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/bunny-video-webhook'),
    dep,
  );
  await expectStatus(res, 405);
});

Deno.test('bunny-video-webhook: token not configured -> 500 server_misconfigured', async () => {
  const { dep } = deps(webhookCfg());
  dep.getWebhookToken = () => null;
  const res = await handle(
    post({ VideoLibraryId: LIBRARY_ID, VideoGuid: BUNNY_VIDEO_ID, Status: 3 }),
    dep,
  );
  await expectStatus(res, 500);
});

Deno.test('bunny-video-webhook: missing token -> 401', async () => {
  const { dep } = deps(webhookCfg());
  const res = await handle(
    post({ VideoLibraryId: LIBRARY_ID, VideoGuid: BUNNY_VIDEO_ID, Status: 3 }, null),
    dep,
  );
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'missing_webhook_token');
});

Deno.test('bunny-video-webhook: wrong token -> 401 invalid_webhook_token', async () => {
  const { dep } = deps(webhookCfg());
  const res = await handle(
    post({ VideoLibraryId: LIBRARY_ID, VideoGuid: BUNNY_VIDEO_ID, Status: 3 }, 'wrong'),
    dep,
  );
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'invalid_webhook_token');
});

Deno.test('bunny-video-webhook: header token accepted (x-webhook-token)', async () => {
  const { dep, rpcCalls } = deps(webhookCfg());
  const req = new Request('https://example.supabase.co/functions/v1/bunny-video-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-token': WEBHOOK_TOKEN },
    body: JSON.stringify({ VideoLibraryId: LIBRARY_ID, VideoGuid: BUNNY_VIDEO_ID, Status: 3 }),
  });
  const res = await handle(req, dep);
  await expectStatus(res, 200);
  assert(rpcCalls.length > 0, 'processed');
});

Deno.test('bunny-video-webhook: invalid JSON -> 400', async () => {
  const { dep } = deps(webhookCfg());
  const res = await handle(post({}, WEBHOOK_TOKEN, '{not json'), dep);
  await expectStatus(res, 400);
});

Deno.test('bunny-video-webhook: oversized payload -> 413', async () => {
  const { dep } = deps(webhookCfg());
  const big = JSON.stringify({
    VideoLibraryId: LIBRARY_ID,
    VideoGuid: BUNNY_VIDEO_ID,
    Status: 3,
    pad: 'x'.repeat(70_000),
  });
  const res = await handle(post({}, WEBHOOK_TOKEN, big), dep);
  await expectStatus(res, 413);
});

Deno.test('bunny-video-webhook: payload without video id -> 200 ignored', async () => {
  const { dep } = deps(webhookCfg());
  const res = await handle(post({ VideoLibraryId: LIBRARY_ID, Status: 3 }), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.status, 'ignored');
});

Deno.test('bunny-video-webhook: wrong library -> 200 ignored', async () => {
  const { dep } = deps(webhookCfg());
  const res = await handle(
    post({ VideoLibraryId: '000000', VideoGuid: BUNNY_VIDEO_ID, Status: 3 }),
    dep,
  );
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.status, 'ignored');
});

Deno.test(
  'bunny-video-webhook: non-actionable event (queued/captions) -> 200 ignored',
  async () => {
    const { dep, rpcCalls } = deps(webhookCfg());
    const res = await handle(
      post({ VideoLibraryId: LIBRARY_ID, VideoGuid: BUNNY_VIDEO_ID, Status: 0 }),
      dep,
    );
    await expectStatus(res, 200);
    assertEqual(rpcCalls.length, 0);
  },
);

Deno.test('bunny-video-webhook: unknown local video -> 200 ignored', async () => {
  const { dep, rpcCalls } = deps(webhookCfg({ tables: { lesson_videos: { rows: [] } } }));
  const res = await handle(
    post({ VideoLibraryId: LIBRARY_ID, VideoGuid: BUNNY_VIDEO_ID, Status: 3 }),
    dep,
  );
  await expectStatus(res, 200);
  assertEqual(rpcCalls.length, 0);
});

Deno.test('bunny-video-webhook: already-ready video -> 200 ignored (no rpc)', async () => {
  const { dep, rpcCalls } = deps(
    webhookCfg({
      tables: {
        lesson_videos: { rows: [{ id: DB_VIDEO_ID, lesson_id: LESSON_ID, status: 'ready' }] },
      },
    }),
  );
  const res = await handle(
    post({ VideoLibraryId: LIBRARY_ID, VideoGuid: BUNNY_VIDEO_ID, Status: 3 }),
    dep,
  );
  await expectStatus(res, 200);
  assertEqual(rpcCalls.length, 0);
});

Deno.test('bunny-video-webhook: finished -> ready chain with metadata + notify', async () => {
  const { dep, rpcCalls, metadataCalls } = deps(webhookCfg());
  const res = await handle(
    post({ VideoLibraryId: LIBRARY_ID, VideoGuid: BUNNY_VIDEO_ID, Status: 3 }),
    dep,
  );
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.status, 'ok');
  assertEqual(body.action, 'ready');

  const steps = rpcCalls.filter((c) => c.fn === 'set_video_status');
  assertEqual(steps.length, 3, 'pending_upload -> uploading -> processing -> ready');
  assert(
    deepEqual(
      steps.map((s) => s.args?.p_new_status),
      ['uploading', 'processing', 'ready'],
    ),
  );
  assert(deepEqual(steps[2].args?.p_duration_seconds, 75), 'duration on final step');
  assertEqual(steps[2].args?.p_thumbnail_url, 'https://x/thumb.jpg');
  assert(deepEqual(steps[0].args?.p_error_message, null));

  const notify = rpcCalls.find((c) => c.fn === 'notify_new_content');
  assert(notify !== undefined, 'notify_new_content called after ready');
  assertEqual(notify.args?.p_lesson_id, LESSON_ID);
  assert(deepEqual(metadataCalls, [BUNNY_VIDEO_ID]), 'metadata fetched for the bunny id');
});

Deno.test(
  'bunny-video-webhook: failed event -> single failed step with error_message',
  async () => {
    const { dep, rpcCalls } = deps(webhookCfg());
    const res = await handle(
      post({ VideoLibraryId: LIBRARY_ID, VideoGuid: BUNNY_VIDEO_ID, Status: 5 }),
      dep,
    );
    await expectStatus(res, 200);
    const steps = rpcCalls.filter((c) => c.fn === 'set_video_status');
    assertEqual(steps.length, 1);
    assertEqual(steps[0].args?.p_new_status, 'failed');
    assertEqual(steps[0].args?.p_error_message, 'Bunny status 5 (failed)');
  },
);

Deno.test(
  'bunny-video-webhook: metadata fetch failure -> 502 bunny_metadata_failed, no transitions',
  async () => {
    const { dep, rpcCalls } = deps(webhookCfg(), null);
    const res = await handle(
      post({ VideoLibraryId: LIBRARY_ID, VideoGuid: BUNNY_VIDEO_ID, Status: 3 }),
      dep,
    );
    await expectStatus(res, 502);
    const body = await res.json();
    assertEqual(body.error.code, 'bunny_metadata_failed');
    assertEqual(rpcCalls.length, 0, 'no transitions burned');
  },
);

Deno.test('bunny-video-webhook: race -> 200 ignored on invalid_video_transition', async () => {
  const { dep } = deps(
    webhookCfg({
      rpc: { set_video_status: { error: { code: 'invalid_video_transition', message: 'x' } } },
    }),
  );
  const res = await handle(
    post({ VideoLibraryId: LIBRARY_ID, VideoGuid: BUNNY_VIDEO_ID, Status: 3 }),
    dep,
  );
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.status, 'ignored');
});

Deno.test('bunny-video-webhook: unknown DB failure -> 500 webhook_failed', async () => {
  const { dep } = deps(
    webhookCfg({
      rpc: { set_video_status: { error: { code: 'P0001', message: 'boom' } } },
    }),
  );
  const res = await handle(
    post({ VideoLibraryId: LIBRARY_ID, VideoGuid: BUNNY_VIDEO_ID, Status: 3 }),
    dep,
  );
  await expectStatus(res, 500);
  const body = await res.json();
  assertEqual(body.error.code, 'webhook_failed');
});

Deno.test('bunny-video-webhook: notify failure does not fail the webhook', async () => {
  const { dep } = deps(
    webhookCfg({
      rpc: {
        set_video_status: { data: null },
        notify_new_content: { error: { code: 'P0001', message: 'boom' } },
      },
    }),
  );
  const res = await handle(
    post({ VideoLibraryId: LIBRARY_ID, VideoGuid: BUNNY_VIDEO_ID, Status: 3 }),
    dep,
  );
  await expectStatus(res, 200);
});
