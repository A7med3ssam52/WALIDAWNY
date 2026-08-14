// Unit tests for get-video-playback-url (Phase 5, Function 3).
// URL signing (pinned vectors) and the access-gate matrix run against
// the stub client (no network).

import { handle, DEFAULT_TTL_SECONDS } from './index.ts';
import { buildPlaybackUrl, signDirectoryToken, ipToBytes } from '../_shared/bunny.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const USER_STUDENT = { id: '70000000-0000-0000-0000-000000000001' };
const USER_STAFF = { id: '70000000-0000-0000-0000-000000000009' };
const LESSON_ID = '40000000-0000-0000-0000-000000000001';
const VIDEO_ID = '50000000-0000-0000-0000-000000000001';
const BUNNY_VIDEO_ID = '12345678-1234-1234-1234-123456789abc';

function get(lessonId: string, user: { id: string }, method = 'GET'): Request {
  const url = `https://example.supabase.co/functions/v1/get-video-playback-url?lesson_id=${lessonId}`;
  return new Request(url, {
    method,
    headers: { Authorization: `Bearer ${user.id}` },
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
      lesson_videos: {
        rows: [
          {
            id: VIDEO_ID,
            lesson_id: LESSON_ID,
            bunny_video_id: BUNNY_VIDEO_ID,
            status: 'ready',
            is_primary: true,
            deleted_at: null,
          },
        ],
      },
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

// Pinned vectors (computed with node crypto over the exact message
// signaturePath + expires + ipBytes + "token_path=" + raw path).

Deno.test('signDirectoryToken: pinned HS256 vector (IP-locked)', async () => {
  const token = await signDirectoryToken({
    signingKey: 'test-signing-key',
    tokenPath: `/${BUNNY_VIDEO_ID}/`,
    expires: 1750000123,
    ip: '203.0.113.7',
  });
  assertEqual(token, 'HS256-1-mBeWRRtO7EjOaJwTu4TEM5I5w7CafDGPGgcmxZ7BCq8');
});

Deno.test('signDirectoryToken: pinned HS256 vector (no IP)', async () => {
  const token = await signDirectoryToken({
    signingKey: 'test-signing-key',
    tokenPath: `/${BUNNY_VIDEO_ID}/`,
    expires: 1750000123,
  });
  assertEqual(token, 'HS256-Uu9DRw9fvaa9B7GKxijFK1wBZZQWkdSjyZnSw7grzYw');
});

Deno.test('signDirectoryToken: IPv6 masked to /64', async () => {
  const token = await signDirectoryToken({
    signingKey: 'test-signing-key',
    tokenPath: `/${BUNNY_VIDEO_ID}/`,
    expires: 1750000123,
    ip: '2001:db8::1',
  });
  assertEqual(token, 'HS256-1-D-v_hj-MlGKGVoGZc73amFmAyaPdc9UtCzMKLs9Vy_4');
});

Deno.test('ipToBytes: IPv4 octets, IPv6 /64 mask, garbage -> empty', () => {
  const same = (a: Uint8Array, b: Uint8Array) =>
    a.length === b.length && a.every((v, i) => v === b[i]);
  assert(same(ipToBytes('203.0.113.7'), new Uint8Array([203, 0, 113, 7])), 'IPv4 octets');
  assert(same(ipToBytes('999.1.1.1'), new Uint8Array()), 'invalid IPv4');
  assert(same(ipToBytes(''), new Uint8Array()), 'empty');
  assert(
    same(
      ipToBytes('2001:db8::1'),
      new Uint8Array([0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ),
    'IPv6 /64 mask',
  );
  assert(same(ipToBytes('not-an-ip'), new Uint8Array()), 'garbage');
});

Deno.test('buildPlaybackUrl: verified URL shape + pinned token', async () => {
  const { url, expires } = await buildPlaybackUrl({
    hostname: 'vz-test.b-cdn.net',
    signingKey: 'test-signing-key',
    videoId: BUNNY_VIDEO_ID,
    ttlSeconds: 123,
    nowUnix: 1750000000,
    ip: '203.0.113.7',
  });
  assertEqual(expires, 1750000123);
  assertEqual(
    url,
    `https://vz-test.b-cdn.net/${BUNNY_VIDEO_ID}/playlist.m3u8` +
      `?token=HS256-1-mBeWRRtO7EjOaJwTu4TEM5I5w7CafDGPGgcmxZ7BCq8` +
      `&expires=1750000123` +
      `&token_path=%2F${BUNNY_VIDEO_ID}%2F`,
  );
});

Deno.test('buildPlaybackUrl: default TTL is 20 minutes', async () => {
  const { expires } = await buildPlaybackUrl({
    hostname: 'h',
    signingKey: 'k',
    videoId: BUNNY_VIDEO_ID,
    nowUnix: 1000000000,
  });
  assertEqual(expires, 1000000000 + DEFAULT_TTL_SECONDS);
});

// ---------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------

Deno.test('get-video-playback-url: POST rejected with 405', async () => {
  const { dep } = deps(cfg());
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/get-video-playback-url', {
      method: 'POST',
    }),
    dep,
  );
  await expectStatus(res, 405);
});

Deno.test('get-video-playback-url: HEAD accepted (same path as GET)', async () => {
  const { dep } = deps(cfg());
  const res = await handle(get(LESSON_ID, USER_STUDENT, 'HEAD'), dep);
  await expectStatus(res, 200);
});

Deno.test('get-video-playback-url: missing Authorization -> 401', async () => {
  const { dep } = deps(cfg());
  const res = await handle(
    new Request(
      `https://example.supabase.co/functions/v1/get-video-playback-url?lesson_id=${LESSON_ID}`,
    ),
    dep,
  );
  await expectStatus(res, 401);
});

Deno.test('get-video-playback-url: missing/illegal lesson_id -> 422', async () => {
  const { dep } = deps(cfg());
  const noParam = await handle(
    new Request('https://example.supabase.co/functions/v1/get-video-playback-url', {
      headers: { Authorization: 'Bearer x' },
    }),
    dep,
  );
  await expectStatus(noParam, 422);
  const bad = await handle(get('not-a-uuid', USER_STUDENT), dep);
  await expectStatus(bad, 422);
});

Deno.test('get-video-playback-url: student, invisible lesson -> 403 access_denied', async () => {
  const { dep } = deps(cfg({ tables: { lessons: { rows: [] } } }));
  const res = await handle(get(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'access_denied');
});

Deno.test('get-video-playback-url: student, soft-deleted lesson -> 403 access_denied', async () => {
  const { dep } = deps(
    cfg({
      tables: { lessons: { rows: [{ id: LESSON_ID, deleted_at: '2026-01-01T00:00:00Z' }] } },
    }),
  );
  const res = await handle(get(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 403);
});

Deno.test(
  'get-video-playback-url: student without active subscription -> 403 access_denied',
  async () => {
    const { dep } = deps(cfg({ tables: { subscriptions: { rows: [] } } }));
    const res = await handle(get(LESSON_ID, USER_STUDENT), dep);
    await expectStatus(res, 403);
    const body = await res.json();
    assertEqual(body.error.code, 'access_denied');
  },
);

Deno.test(
  'get-video-playback-url: student, no primary ready video -> 409 video_not_ready',
  async () => {
    const { dep } = deps(cfg({ tables: { lesson_videos: { rows: [] } } }));
    const res = await handle(get(LESSON_ID, USER_STUDENT), dep);
    await expectStatus(res, 409);
    const body = await res.json();
    assertEqual(body.error.code, 'video_not_ready');
  },
);

Deno.test('get-video-playback-url: student success -> IP-locked signed URL + expiry', async () => {
  const { dep } = deps(cfg());
  const res = await handle(get(LESSON_ID, USER_STUDENT), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.video_id, VIDEO_ID);
  assertEqual(body.lesson_id, LESSON_ID);
  assertEqual(body.expires_at, new Date(1750000123 * 1000).toISOString());
  assertEqual(
    body.playback_url,
    `https://vz-test.b-cdn.net/${BUNNY_VIDEO_ID}/playlist.m3u8` +
      `?token=HS256-1-mBeWRRtO7EjOaJwTu4TEM5I5w7CafDGPGgcmxZ7BCq8` +
      `&expires=1750000123` +
      `&token_path=%2F${BUNNY_VIDEO_ID}%2F`,
  );
});

Deno.test('get-video-playback-url: no client IP -> 500 client_ip_unavailable', async () => {
  const { dep } = deps(cfg());
  const noIp = { ...dep, getClientIp: undefined };
  const res = await handle(get(LESSON_ID, USER_STUDENT), noIp);
  await expectStatus(res, 500);
  const body = await res.json();
  assertEqual(body.error.code, 'client_ip_unavailable');
});

Deno.test('get-video-playback-url: staff, missing lesson -> 404 lesson_not_found', async () => {
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
  const res = await handle(get(LESSON_ID, USER_STAFF), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'lesson_not_found');
});

Deno.test('get-video-playback-url: staff, soft-deleted lesson -> 422 lesson_deleted', async () => {
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
  const res = await handle(get(LESSON_ID, USER_STAFF), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'lesson_deleted');
});

Deno.test('get-video-playback-url: staff preview succeeds WITHOUT subscription', async () => {
  const { dep } = deps(
    cfg({
      user: USER_STAFF,
      tables: {
        profiles: {
          rows: [{ id: USER_STAFF.id, role: 'mr_walid', status: 'active', deleted_at: null }],
        },
        subscriptions: { rows: [] },
      },
    }),
  );
  const res = await handle(get(LESSON_ID, USER_STAFF), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assert(
    body.playback_url.startsWith(
      `https://vz-test.b-cdn.net/${BUNNY_VIDEO_ID}/playlist.m3u8?token=HS256-1-`,
    ),
  );
});

Deno.test(
  'get-video-playback-url: disabled account -> 403 account_inactive_or_deleted',
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
    const res = await handle(get(LESSON_ID, USER_STUDENT), dep);
    await expectStatus(res, 403);
    const body = await res.json();
    assertEqual(body.error.code, 'account_inactive_or_deleted');
  },
);

Deno.test(
  'get-video-playback-url: url is monotone with nowUnix (deterministic expiry)',
  async () => {
    const { dep } = deps(cfg());
    const a = await handle(get(LESSON_ID, USER_STUDENT), dep);
    const bodyA = await a.json();
    const second = { ...dep, nowUnix: () => 1750000060 };
    const b = await handle(get(LESSON_ID, USER_STUDENT), second);
    const bodyB = await b.json();
    assert(!deepEqual(bodyA.playback_url, bodyB.playback_url), 'different tokens');
    assertEqual(bodyB.expires_at, new Date(1750000183 * 1000).toISOString());
  },
);
