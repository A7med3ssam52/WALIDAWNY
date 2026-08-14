// Unit tests for get-video-thumbnail-url (Phase 5, Function 6).
// URL signing (pinned vectors) and the access-gate matrix run against
// the stub client (no network).

import { handle } from './index.ts';
import { buildSignedObjectUrl, signDirectoryToken } from '../_shared/bunny.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const USER_STUDENT = { id: '70000000-0000-0000-0000-000000000001' };
const USER_STAFF = { id: '70000000-0000-0000-0000-000000000009' };
const LESSON_ID = '40000000-0000-0000-0000-000000000001';
const VIDEO_ID = '50000000-0000-0000-0000-000000000001';
const BUNNY_VIDEO_ID = '12345678-1234-1234-1234-123456789abc';

function get(videoId: string, user: { id: string }, method = 'GET'): Request {
  const url = `https://example.supabase.co/functions/v1/get-video-thumbnail-url?video_id=${videoId}`;
  return new Request(url, {
    method,
    headers: { Authorization: `Bearer ${user.id}` },
  });
}

function videoRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VIDEO_ID,
    lesson_id: LESSON_ID,
    bunny_video_id: BUNNY_VIDEO_ID,
    status: 'ready',
    is_primary: true,
    deleted_at: null,
    ...overrides,
  };
}

function cfg(overrides?: Partial<StubConfig>): StubConfig {
  const base: StubConfig = {
    user: USER_STUDENT,
    tables: {
      profiles: {
        rows: [{ id: USER_STUDENT.id, role: 'student', status: 'active', deleted_at: null }],
      },
      lessons: { rows: [{ id: LESSON_ID, deleted_at: null }] },
      subscriptions: {
        rows: [
          {
            id: '81000000-0000-0000-0000-000000000001',
            student_id: USER_STUDENT.id,
            status: 'active',
            expires_at: '2099-01-01T00:00:00Z',
          },
        ],
      },
      lesson_videos: { rows: [videoRow()] },
    },
  };
  return {
    ...base,
    ...overrides,
    tables: { ...base.tables, ...(overrides?.tables ?? {}) },
  };
}

function deps(cfg: StubConfig) {
  const { client } = makeStubClient(cfg);
  const dep = {
    url: 'https://example.supabase.co',
    makeClient: () => client,
    bunnySigningKey: 'test-signing-key',
    bunnyHostname: 'vz-test.b-cdn.net',
    ttlSeconds: 123,
    nowUnix: () => 1750000000,
    getClientIp: () => '203.0.113.7',
  };
  return { dep };
}

// The signed object is covered by the SAME IP-locked directory token as
// the HLS chain (verified against the real pull zone by smoke-bunny.mjs:
// thumbnail.jpg returned 200 with the directory token).

Deno.test('buildSignedObjectUrl: pinned vector (same directory token as playback)', async () => {
  const { url, expires } = await buildSignedObjectUrl({
    hostname: 'vz-test.b-cdn.net',
    signingKey: 'test-signing-key',
    videoId: BUNNY_VIDEO_ID,
    objectName: 'thumbnail.jpg',
    ttlSeconds: 123,
    nowUnix: 1750000000,
    ip: '203.0.113.7',
  });
  assertEqual(expires, 1750000123);
  assertEqual(
    url,
    `https://vz-test.b-cdn.net/${BUNNY_VIDEO_ID}/thumbnail.jpg` +
      `?token=HS256-1-mBeWRRtO7EjOaJwTu4TEM5I5w7CafDGPGgcmxZ7BCq8` +
      `&expires=1750000123` +
      `&token_path=%2F${BUNNY_VIDEO_ID}%2F`,
  );
});

Deno.test('get-video-thumbnail-url: POST rejected with 405', async () => {
  const { dep } = deps(cfg());
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/get-video-thumbnail-url', {
      method: 'POST',
    }),
    dep,
  );
  await expectStatus(res, 405);
});

Deno.test('get-video-thumbnail-url: HEAD accepted (same path as GET)', async () => {
  const { dep } = deps(cfg());
  const res = await handle(get(VIDEO_ID, USER_STUDENT, 'HEAD'), dep);
  await expectStatus(res, 200);
});

Deno.test('get-video-thumbnail-url: missing Authorization -> 401', async () => {
  const { dep } = deps(cfg());
  const res = await handle(
    new Request(
      `https://example.supabase.co/functions/v1/get-video-thumbnail-url?video_id=${VIDEO_ID}`,
    ),
    dep,
  );
  await expectStatus(res, 401);
});

Deno.test('get-video-thumbnail-url: missing/illegal video_id -> 422', async () => {
  const { dep } = deps(cfg());
  const noParam = await handle(
    new Request('https://example.supabase.co/functions/v1/get-video-thumbnail-url', {
      headers: { Authorization: 'Bearer x' },
    }),
    dep,
  );
  await expectStatus(noParam, 422);
  const bad = await handle(get('not-a-uuid', USER_STUDENT), dep);
  await expectStatus(bad, 422);
});

Deno.test('get-video-thumbnail-url: unknown video -> 404 video_not_found', async () => {
  const { dep } = deps(cfg({ tables: { lesson_videos: { rows: [] } } }));
  const res = await handle(get(VIDEO_ID, USER_STUDENT), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'video_not_found');
});

Deno.test('get-video-thumbnail-url: soft-deleted video -> 404 video_not_found', async () => {
  const { dep } = deps(
    cfg({
      tables: { lesson_videos: { rows: [videoRow({ deleted_at: '2026-01-01T00:00:00Z' })] } },
    }),
  );
  const res = await handle(get(VIDEO_ID, USER_STUDENT), dep);
  await expectStatus(res, 404);
});

Deno.test(
  'get-video-thumbnail-url: student, non-primary video -> 404 video_not_found',
  async () => {
    const { dep } = deps(
      cfg({
        tables: { lesson_videos: { rows: [videoRow({ is_primary: false })] } },
      }),
    );
    const res = await handle(get(VIDEO_ID, USER_STUDENT), dep);
    await expectStatus(res, 404);
  },
);

Deno.test('get-video-thumbnail-url: student, not-ready video -> 404 video_not_found', async () => {
  const { dep } = deps(
    cfg({
      tables: { lesson_videos: { rows: [videoRow({ status: 'processing' })] } },
    }),
  );
  const res = await handle(get(VIDEO_ID, USER_STUDENT), dep);
  await expectStatus(res, 404);
});

Deno.test('get-video-thumbnail-url: student, invisible lesson -> 403 access_denied', async () => {
  const { dep } = deps(cfg({ tables: { lessons: { rows: [] } } }));
  const res = await handle(get(VIDEO_ID, USER_STUDENT), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'access_denied');
});

Deno.test(
  'get-video-thumbnail-url: student, soft-deleted lesson -> 403 access_denied',
  async () => {
    const { dep } = deps(
      cfg({
        tables: { lessons: { rows: [{ id: LESSON_ID, deleted_at: '2026-01-01T00:00:00Z' }] } },
      }),
    );
    const res = await handle(get(VIDEO_ID, USER_STUDENT), dep);
    await expectStatus(res, 403);
  },
);

Deno.test(
  'get-video-thumbnail-url: student without active subscription -> 403 access_denied',
  async () => {
    const { dep } = deps(cfg({ tables: { subscriptions: { rows: [] } } }));
    const res = await handle(get(VIDEO_ID, USER_STUDENT), dep);
    await expectStatus(res, 403);
    const body = await res.json();
    assertEqual(body.error.code, 'access_denied');
  },
);

Deno.test(
  'get-video-thumbnail-url: student success -> IP-locked signed thumbnail + expiry',
  async () => {
    const { dep } = deps(cfg());
    const res = await handle(get(VIDEO_ID, USER_STUDENT), dep);
    await expectStatus(res, 200);
    const body = await res.json();
    assertEqual(body.video_id, VIDEO_ID);
    assertEqual(body.lesson_id, LESSON_ID);
    assertEqual(body.expires_at, new Date(1750000123 * 1000).toISOString());
    assertEqual(
      body.thumbnail_url,
      `https://vz-test.b-cdn.net/${BUNNY_VIDEO_ID}/thumbnail.jpg` +
        `?token=HS256-1-mBeWRRtO7EjOaJwTu4TEM5I5w7CafDGPGgcmxZ7BCq8` +
        `&expires=1750000123` +
        `&token_path=%2F${BUNNY_VIDEO_ID}%2F`,
    );
  },
);

Deno.test('get-video-thumbnail-url: no client IP -> 500 client_ip_unavailable', async () => {
  const { dep } = deps(cfg());
  const noIp = { ...dep, getClientIp: undefined };
  const res = await handle(get(VIDEO_ID, USER_STUDENT), noIp);
  await expectStatus(res, 500);
  const body = await res.json();
  assertEqual(body.error.code, 'client_ip_unavailable');
});

Deno.test('get-video-thumbnail-url: staff, missing lesson -> 404 lesson_not_found', async () => {
  const { dep } = deps(
    cfg({
      user: USER_STAFF,
      tables: {
        profiles: {
          rows: [{ id: USER_STAFF.id, role: 'admin', status: 'active', deleted_at: null }],
        },
        lessons: { rows: [] },
      },
    }),
  );
  const res = await handle(get(VIDEO_ID, USER_STAFF), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'lesson_not_found');
});

Deno.test('get-video-thumbnail-url: staff, soft-deleted lesson -> 422 lesson_deleted', async () => {
  const { dep } = deps(
    cfg({
      user: USER_STAFF,
      tables: {
        profiles: {
          rows: [{ id: USER_STAFF.id, role: 'mr_walid', status: 'active', deleted_at: null }],
        },
        lessons: { rows: [{ id: LESSON_ID, deleted_at: '2026-01-01T00:00:00Z' }] },
      },
    }),
  );
  const res = await handle(get(VIDEO_ID, USER_STAFF), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'lesson_deleted');
});

Deno.test(
  'get-video-thumbnail-url: staff thumbnail for non-primary video succeeds WITHOUT subscription',
  async () => {
    const { dep } = deps(
      cfg({
        user: USER_STAFF,
        tables: {
          profiles: {
            rows: [{ id: USER_STAFF.id, role: 'mr_walid', status: 'active', deleted_at: null }],
          },
          subscriptions: { rows: [] },
          lesson_videos: { rows: [videoRow({ is_primary: false, status: 'processing' })] },
        },
      }),
    );
    const res = await handle(get(VIDEO_ID, USER_STAFF), dep);
    await expectStatus(res, 200);
    const body = await res.json();
    assert(
      body.thumbnail_url.startsWith(
        `https://vz-test.b-cdn.net/${BUNNY_VIDEO_ID}/thumbnail.jpg?token=HS256-1-`,
      ),
    );
  },
);

Deno.test(
  'get-video-thumbnail-url: disabled account -> 403 account_inactive_or_deleted',
  async () => {
    const { dep } = deps(
      cfg({
        tables: {
          profiles: {
            rows: [{ id: USER_STUDENT.id, role: 'student', status: 'disabled', deleted_at: null }],
          },
        },
      }),
    );
    const res = await handle(get(VIDEO_ID, USER_STUDENT), dep);
    await expectStatus(res, 403);
    const body = await res.json();
    assertEqual(body.error.code, 'account_inactive_or_deleted');
  },
);

Deno.test(
  'get-video-thumbnail-url: url is monotone with nowUnix (deterministic expiry)',
  async () => {
    const { dep } = deps(cfg());
    const a = await handle(get(VIDEO_ID, USER_STUDENT), dep);
    const bodyA = await a.json();
    const second = { ...dep, nowUnix: () => 1750000060 };
    const b = await handle(get(VIDEO_ID, USER_STUDENT), second);
    const bodyB = await b.json();
    assert(!deepEqual(bodyA.thumbnail_url, bodyB.thumbnail_url), 'different tokens');
    assertEqual(bodyB.expires_at, new Date(1750000183 * 1000).toISOString());
  },
);

Deno.test('signDirectoryToken (shared): still pinned after refactor', async () => {
  const token = await signDirectoryToken({
    signingKey: 'test-signing-key',
    tokenPath: `/${BUNNY_VIDEO_ID}/`,
    expires: 1750000123,
    ip: '203.0.113.7',
  });
  assertEqual(token, 'HS256-1-mBeWRRtO7EjOaJwTu4TEM5I5w7CafDGPGgcmxZ7BCq8');
});
