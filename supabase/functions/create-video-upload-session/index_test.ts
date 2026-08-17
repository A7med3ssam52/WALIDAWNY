// Unit tests for create-video-upload-session (Phase 5, Function 1).
// Pure helpers (sanitizeTitle / parseSessionBody / TUS signature) are
// tested directly; handle() runs against the hand-rolled stub client
// (no network) with injectable Bunny deps.

import { detectVideoFileType, handle, parseSessionBody, sanitizeTitle } from './index.ts';
import type { Deps } from './index.ts';
import { tusAuthorizationSignature } from '../_shared/bunny.ts';
import { assert, assertEqual, deepEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const LESSON_ID = '40000000-0000-0000-0000-000000000001';
const OLD_VIDEO_ID = '50000000-0000-0000-0000-000000000001';
const BUNNY_GUID = '12345678-1234-1234-1234-123456789abc';

function post(body: unknown, jwt = 'jwt-token'): Request {
  return new Request('https://example.supabase.co/functions/v1/create-video-upload-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body),
  });
}

function staffCfg(overrides?: Partial<StubConfig>): StubConfig {
  const cfg: StubConfig = {
    user: { id: '70000000-0000-0000-0000-000000000009' },
    tables: {
      profiles: {
        rows: [
          {
            id: '70000000-0000-0000-0000-000000000009',
            role: 'mr_walid',
            status: 'active',
            deleted_at: null,
          },
        ],
      },
      lessons: { rows: [{ id: LESSON_ID, title: 'TEST-L1', deleted_at: null }] },
      lesson_videos: {
        rows: [{ id: OLD_VIDEO_ID, lesson_id: LESSON_ID, status: 'ready', deleted_at: null }],
        count: 0,
      },
    },
    rpc: {
      create_video_upload_record: {
        data: [{ id: '50000000-0000-0000-0000-000000000020', is_primary: false }],
      },
    },
  };
  return {
    ...cfg,
    ...overrides,
    tables: { ...cfg.tables, ...(overrides?.tables ?? {}) },
  };
}

function deps(cfg: StubConfig) {
  const { client, rpcCalls } = makeStubClient(cfg);
  const createdTitles: string[] = [];
  const deleted: string[] = [];
  const created: { guid: string }[] = [];
  const dep: Deps = {
    url: 'https://example.supabase.co',
    makeClient: () => client,
    bunnyApiKey: 'test-api-key',
    bunnyLibraryId: '725671',
    bunnyCreateVideo: (title: string) => {
      createdTitles.push(title);
      created.push({ guid: BUNNY_GUID });
      return Promise.resolve(created[created.length - 1]);
    },
    bunnyDeleteVideo: (guid: string) => {
      deleted.push(guid);
      return Promise.resolve();
    },
    nowUnix: () => 1750000000,
  };
  return { dep, rpcCalls, createdTitles, deleted };
}

// ---------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------

Deno.test('detectVideoFileType: extension-driven filetype', () => {
  assertEqual(detectVideoFileType('lesson.webm'), 'video/webm');
  assertEqual(detectVideoFileType('lesson.WEBM'), 'video/webm');
  assertEqual(detectVideoFileType('lesson.mov'), 'video/quicktime');
  assertEqual(detectVideoFileType('lesson.MOV'), 'video/quicktime');
  assertEqual(detectVideoFileType('lesson.mp4'), 'video/mp4');
  assertEqual(detectVideoFileType('lesson'), 'video/mp4');
  assertEqual(detectVideoFileType(null), 'video/mp4');
});

Deno.test('sanitizeTitle: strips path separators and trims', () => {
  const r = sanitizeTitle('../../bad/name.mp4');
  assert(r.ok);
  assertEqual(r.title, 'name.mp4');
});

Deno.test('sanitizeTitle: rejects empty / control chars / unsupported chars', () => {
  assert(!sanitizeTitle('').ok, 'empty rejected');
  assert(!sanitizeTitle('bad\u0000name').ok, 'control char rejected');
  assert(!sanitizeTitle('bad|name').ok, 'unsupported char rejected');
});

Deno.test('parseSessionBody: full valid body accepted', () => {
  const r = parseSessionBody({
    lesson_id: LESSON_ID,
    mode: 'replace',
    old_video_id: OLD_VIDEO_ID,
    file_name: 'lesson.mp4',
  });
  assert(r.ok, 'valid body accepted');
});

Deno.test('parseSessionBody: invalid lesson_id / mode rejected', () => {
  assert(!parseSessionBody({ lesson_id: 'nope', mode: 'create' }).ok, 'bad uuid');
  assert(!parseSessionBody({ lesson_id: LESSON_ID, mode: 'delete' }).ok, 'bad mode');
  assert(
    !parseSessionBody({ lesson_id: LESSON_ID, mode: 'create', old_video_id: OLD_VIDEO_ID }).ok,
    'old_video in create',
  );
  assert(
    !parseSessionBody({ lesson_id: LESSON_ID, mode: 'replace' }).ok,
    'missing old_video in replace',
  );
});

Deno.test('parseSessionBody: cancel body accepted; missing video_id rejected', () => {
  const r = parseSessionBody({ action: 'cancel', lesson_id: LESSON_ID, video_id: OLD_VIDEO_ID });
  assert(r.ok, 'cancel body accepted');
  if (r.ok) {
    assertEqual(r.body.action, 'cancel');
    assertEqual(r.body.video_id, OLD_VIDEO_ID);
  }
  assert(
    !parseSessionBody({ action: 'cancel', lesson_id: LESSON_ID }).ok,
    'cancel without video_id rejected',
  );
  assert(
    !parseSessionBody({ action: 'cancel', video_id: OLD_VIDEO_ID }).ok,
    'cancel without lesson_id rejected',
  );
  assert(
    !parseSessionBody({ action: 'cancel', lesson_id: 'nope', video_id: OLD_VIDEO_ID }).ok,
    'cancel bad lesson uuid',
  );
  assert(
    !parseSessionBody({ action: 'cancel', lesson_id: LESSON_ID, video_id: 'nope' }).ok,
    'cancel bad video uuid',
  );
});

Deno.test('tusAuthorizationSignature: pinned vector (docs formula)', async () => {
  assertEqual(
    await tusAuthorizationSignature('725671', 'test-api-key', 1750000000, BUNNY_GUID),
    'ba1b96188f1977e4578632220922a15bd6135900e1133b4a2f00b1ef355e86ec',
  );
});

// ---------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------

Deno.test('create-video-upload-session: GET rejected with 405', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(
    new Request('https://example.supabase.co/functions/v1/create-video-upload-session'),
    dep,
  );
  await expectStatus(res, 405);
});

Deno.test('create-video-upload-session: missing Authorization -> 401', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(post({ lesson_id: LESSON_ID, mode: 'create' }, ''), dep);
  await expectStatus(res, 401);
});

Deno.test('create-video-upload-session: invalid token -> 401', async () => {
  const { dep } = deps(staffCfg({ getUserError: { message: 'invalid' } }));
  const res = await handle(post({ lesson_id: LESSON_ID, mode: 'create' }), dep);
  await expectStatus(res, 401);
});

Deno.test('create-video-upload-session: student role -> 403 forbidden', async () => {
  const { dep } = deps(
    staffCfg({
      tables: {
        profiles: {
          rows: [
            {
              id: '70000000-0000-0000-0000-000000000001',
              role: 'student',
              status: 'active',
              deleted_at: null,
            },
          ],
        },
      },
    }),
  );
  const res = await handle(post({ lesson_id: LESSON_ID, mode: 'create' }), dep);
  await expectStatus(res, 403);
});

Deno.test(
  'create-video-upload-session: inactive account -> 403 account_inactive_or_deleted',
  async () => {
    const { dep } = deps(
      staffCfg({
        tables: {
          profiles: {
            rows: [
              {
                id: '70000000-0000-0000-0000-000000000009',
                role: 'admin',
                status: 'disabled',
                deleted_at: null,
              },
            ],
          },
        },
      }),
    );
    const res = await handle(post({ lesson_id: LESSON_ID, mode: 'create' }), dep);
    await expectStatus(res, 403);
    const body = await res.json();
    assertEqual(body.error.code, 'account_inactive_or_deleted');
  },
);

Deno.test('create-video-upload-session: invalid JSON -> 400', async () => {
  const { dep } = deps(staffCfg());
  const req = new Request('https://example.supabase.co/functions/v1/create-video-upload-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-token' },
    body: '{not json',
  });
  const res = await handle(req, dep);
  await expectStatus(res, 400);
});

Deno.test('create-video-upload-session: unknown lesson -> 404 lesson_not_found', async () => {
  const { dep } = deps(staffCfg({ tables: { lessons: { rows: [] } } }));
  const res = await handle(post({ lesson_id: LESSON_ID, mode: 'create' }), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'lesson_not_found');
});

Deno.test('create-video-upload-session: soft-deleted lesson -> 422 lesson_deleted', async () => {
  const { dep } = deps(
    staffCfg({
      tables: {
        lessons: { rows: [{ id: LESSON_ID, title: 'L1', deleted_at: '2026-01-01T00:00:00Z' }] },
      },
    }),
  );
  const res = await handle(post({ lesson_id: LESSON_ID, mode: 'create' }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'lesson_deleted');
});

Deno.test(
  'create-video-upload-session: pending upload exists -> 422 lesson_has_pending_upload (no Bunny call)',
  async () => {
    const { dep, createdTitles } = deps(
      staffCfg({
        tables: { lesson_videos: { rows: [], count: 1 } },
      }),
    );
    const res = await handle(post({ lesson_id: LESSON_ID, mode: 'create' }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'lesson_has_pending_upload');
    assertEqual(createdTitles.length, 0, 'no Bunny video created');
  },
);

Deno.test(
  'create-video-upload-session: replace with unknown old video -> 404 old_video_not_found',
  async () => {
    const { dep, createdTitles } = deps(
      staffCfg({
        tables: { lesson_videos: { rows: [], count: 0 } },
      }),
    );
    const res = await handle(
      post({ lesson_id: LESSON_ID, mode: 'replace', old_video_id: OLD_VIDEO_ID }),
      dep,
    );
    await expectStatus(res, 404);
    assertEqual(createdTitles.length, 0);
  },
);

Deno.test(
  'create-video-upload-session: replace old video of another lesson -> 422 wrong_lesson',
  async () => {
    const { dep } = deps(
      staffCfg({
        tables: {
          lesson_videos: {
            rows: [
              {
                id: OLD_VIDEO_ID,
                lesson_id: '40000000-0000-0000-0000-000000000002',
                status: 'ready',
                deleted_at: null,
              },
            ],
            count: 0,
          },
        },
      }),
    );
    const res = await handle(
      post({ lesson_id: LESSON_ID, mode: 'replace', old_video_id: OLD_VIDEO_ID }),
      dep,
    );
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'wrong_lesson');
  },
);

Deno.test(
  'create-video-upload-session: replace a non-ready old video -> 422 validation_error',
  async () => {
    const { dep } = deps(
      staffCfg({
        tables: {
          lesson_videos: {
            rows: [
              { id: OLD_VIDEO_ID, lesson_id: LESSON_ID, status: 'processing', deleted_at: null },
            ],
            count: 0,
          },
        },
      }),
    );
    const res = await handle(
      post({ lesson_id: LESSON_ID, mode: 'replace', old_video_id: OLD_VIDEO_ID }),
      dep,
    );
    await expectStatus(res, 422);
  },
);

Deno.test(
  'create-video-upload-session: Bunny create-video failure -> 502 bunny_create_failed',
  async () => {
    const { dep } = deps(staffCfg());
    dep.bunnyCreateVideo = () => Promise.resolve(null);
    const res = await handle(post({ lesson_id: LESSON_ID, mode: 'create' }), dep);
    await expectStatus(res, 502);
    const body = await res.json();
    assertEqual(body.error.code, 'bunny_create_failed');
  },
);

Deno.test(
  'create-video-upload-session: wrapper permission_denied -> 403 + Bunny cleanup',
  async () => {
    const { dep, deleted } = deps(
      staffCfg({
        rpc: {
          create_video_upload_record: { error: { code: 'permission_denied', message: 'nope' } },
        },
      }),
    );
    const res = await handle(post({ lesson_id: LESSON_ID, mode: 'create' }), dep);
    await expectStatus(res, 403);
    assert(deepEqual(deleted, [BUNNY_GUID]), 'orphan Bunny video deleted');
  },
);

Deno.test(
  'create-video-upload-session: wrapper lesson_has_pending_upload -> 422 + cleanup',
  async () => {
    const { dep, deleted } = deps(
      staffCfg({
        rpc: {
          create_video_upload_record: {
            error: { code: 'lesson_has_pending_upload', message: 'pending' },
          },
        },
      }),
    );
    const res = await handle(post({ lesson_id: LESSON_ID, mode: 'create' }), dep);
    await expectStatus(res, 422);
    assert(deepEqual(deleted, [BUNNY_GUID]), 'orphan Bunny video deleted');
  },
);

Deno.test(
  'create-video-upload-session: success returns TUS session (title from file_name)',
  async () => {
    const { dep, rpcCalls, deleted, createdTitles } = deps(staffCfg());
    const res = await handle(
      post({ lesson_id: LESSON_ID, mode: 'create', file_name: 'math/الدرس-1.mp4' }),
      dep,
    );
    await expectStatus(res, 200);
    const body = await res.json();

    assertEqual(body.video_id, '50000000-0000-0000-0000-000000000020');
    assertEqual(body.bunny_video_id, BUNNY_GUID);
    assertEqual(body.upload_url, 'https://video.bunnycdn.com/tusupload');
    assertEqual(body.expires_in, 86400);
    assertEqual(body.metadata.title, 'الدرس-1.mp4', 'sanitized basename used as title');
    assertEqual(body.tus_headers.LibraryId, '725671');
    assertEqual(body.tus_headers.VideoId, BUNNY_GUID);
    assertEqual(body.tus_headers.AuthorizationExpire, 1750086400);
    assertEqual(
      body.tus_headers.AuthorizationSignature,
      '5fce0ef2f52104293d8fb9a8b06c26786fb6e3408f291c6a99579397e466923e',
    );

    assertEqual(rpcCalls.length, 1);
    assertEqual(rpcCalls[0].fn, 'create_video_upload_record');
    assert(
      deepEqual(rpcCalls[0].args, {
        p_lesson_id: LESSON_ID,
        p_bunny_video_id: BUNNY_GUID,
        p_bunny_library_id: '725671',
        p_title: 'الدرس-1.mp4',
        p_mode: 'create',
        p_old_video_id: null,
      }),
      'wrapper args',
    );
    assertEqual(deleted.length, 0, 'no cleanup on success');
    assertEqual(createdTitles.length, 1);
  },
);

Deno.test('create-video-upload-session: success falls back to lesson title', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(post({ lesson_id: LESSON_ID, mode: 'create' }), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assertEqual(body.metadata.title, 'TEST-L1');
});

Deno.test(
  'create-video-upload-session: replace success passes old_video_id to wrapper',
  async () => {
    const { dep, rpcCalls } = deps(staffCfg());
    const res = await handle(
      post({ lesson_id: LESSON_ID, mode: 'replace', old_video_id: OLD_VIDEO_ID }),
      dep,
    );
    await expectStatus(res, 200);
    assertEqual(rpcCalls[0]?.args?.p_mode, 'replace');
    assertEqual(rpcCalls[0]?.args?.p_old_video_id, OLD_VIDEO_ID);
  },
);

// ---------------------------------------------------------------------
// CANCEL action (releases an abandoned session; 0017 wrapper)
// ---------------------------------------------------------------------

const CANCEL_VIDEO_ID = '50000000-0000-0000-0000-000000000030';

function cancelCfg(overrides?: Partial<StubConfig>): StubConfig {
  const cfg: StubConfig = {
    user: { id: '70000000-0000-0000-0000-000000000009' },
    tables: {
      profiles: {
        rows: [
          {
            id: '70000000-0000-0000-0000-000000000009',
            role: 'mr_walid',
            status: 'active',
            deleted_at: null,
          },
        ],
      },
      lessons: { rows: [{ id: LESSON_ID, title: 'TEST-L1', deleted_at: null }] },
      lesson_videos: {
        rows: [
          {
            id: CANCEL_VIDEO_ID,
            lesson_id: LESSON_ID,
            status: 'pending_upload',
            deleted_at: null,
            bunny_video_id: BUNNY_GUID,
          },
        ],
      },
    },
    rpc: {
      delete_video_upload_record: { data: null },
    },
  };
  return {
    ...cfg,
    ...overrides,
    tables: { ...cfg.tables, ...(overrides?.tables ?? {}) },
    rpc: { ...cfg.rpc, ...(overrides?.rpc ?? {}) },
  };
}

function cancelPost() {
  return post({ action: 'cancel', lesson_id: LESSON_ID, video_id: CANCEL_VIDEO_ID });
}

Deno.test(
  'create-video-upload-session: cancel success releases row + deletes Bunny object',
  async () => {
    const { dep, rpcCalls, deleted, createdTitles } = deps(cancelCfg());
    const res = await handle(cancelPost(), dep);
    await expectStatus(res, 200);
    const body = await res.json();
    assertEqual(body.released, true);
    assertEqual(body.video_id, CANCEL_VIDEO_ID);
    assertEqual(rpcCalls.length, 1);
    assertEqual(rpcCalls[0].fn, 'delete_video_upload_record');
    assert(
      deepEqual(rpcCalls[0].args, { p_lesson_id: LESSON_ID, p_video_id: CANCEL_VIDEO_ID }),
      'release args',
    );
    assert(deepEqual(deleted, [BUNNY_GUID]), 'Bunny object deleted best-effort');
    assertEqual(createdTitles.length, 0, 'no video object created');
  },
);

Deno.test(
  'create-video-upload-session: cancel unknown video -> 404 video_not_found (no RPC, no Bunny delete)',
  async () => {
    const { dep, rpcCalls, deleted } = deps(cancelCfg({ tables: { lesson_videos: { rows: [] } } }));
    const res = await handle(cancelPost(), dep);
    await expectStatus(res, 404);
    const body = await res.json();
    assertEqual(body.error.code, 'video_not_found');
    assertEqual(rpcCalls.length, 0);
    assertEqual(deleted.length, 0);
  },
);

Deno.test(
  'create-video-upload-session: cancel soft-deleted video -> 404 video_not_found',
  async () => {
    const { dep } = deps(
      cancelCfg({
        tables: {
          lesson_videos: {
            rows: [
              {
                id: CANCEL_VIDEO_ID,
                lesson_id: LESSON_ID,
                status: 'pending_upload',
                deleted_at: '2026-01-01T00:00:00Z',
                bunny_video_id: BUNNY_GUID,
              },
            ],
          },
        },
      }),
    );
    const res = await handle(cancelPost(), dep);
    await expectStatus(res, 404);
  },
);

Deno.test(
  'create-video-upload-session: cancel video of another lesson -> 422 wrong_lesson',
  async () => {
    const { dep } = deps(
      cancelCfg({
        tables: {
          lesson_videos: {
            rows: [
              {
                id: CANCEL_VIDEO_ID,
                lesson_id: '40000000-0000-0000-0000-000000000002',
                status: 'pending_upload',
                deleted_at: null,
                bunny_video_id: BUNNY_GUID,
              },
            ],
          },
        },
      }),
    );
    const res = await handle(cancelPost(), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'wrong_lesson');
  },
);

Deno.test(
  'create-video-upload-session: cancel non-pending video -> 409 video_not_pending',
  async () => {
    const { dep, deleted } = deps(
      cancelCfg({
        tables: {
          lesson_videos: {
            rows: [
              {
                id: CANCEL_VIDEO_ID,
                lesson_id: LESSON_ID,
                status: 'uploading',
                deleted_at: null,
                bunny_video_id: BUNNY_GUID,
              },
            ],
          },
        },
      }),
    );
    const res = await handle(cancelPost(), dep);
    await expectStatus(res, 409);
    const body = await res.json();
    assertEqual(body.error.code, 'video_not_pending');
    assertEqual(deleted.length, 0, 'no Bunny delete before the wrapper accepts the release');
  },
);

Deno.test(
  'create-video-upload-session: cancel wrapper permission_denied -> 403, no Bunny delete',
  async () => {
    const { dep, deleted } = deps(
      cancelCfg({
        rpc: {
          delete_video_upload_record: { error: { code: 'permission_denied', message: 'nope' } },
        },
      }),
    );
    const res = await handle(cancelPost(), dep);
    await expectStatus(res, 403);
    assertEqual(deleted.length, 0, 'Bunny object only deleted AFTER a successful release');
  },
);

Deno.test(
  'create-video-upload-session: cancel wrapper video_not_pending -> 409, no Bunny delete',
  async () => {
    const { dep, deleted } = deps(
      cancelCfg({
        rpc: {
          delete_video_upload_record: { error: { code: 'video_not_pending', message: 'advanced' } },
        },
      }),
    );
    const res = await handle(cancelPost(), dep);
    await expectStatus(res, 409);
    assertEqual(deleted.length, 0);
  },
);

Deno.test('create-video-upload-session: cancel student role -> 403 forbidden', async () => {
  const { dep, rpcCalls } = deps(
    cancelCfg({
      tables: {
        profiles: {
          rows: [
            {
              id: '70000000-0000-0000-0000-000000000001',
              role: 'student',
              status: 'active',
              deleted_at: null,
            },
          ],
        },
      },
    }),
  );
  const res = await handle(cancelPost(), dep);
  await expectStatus(res, 403);
  assertEqual(rpcCalls.length, 0);
});

Deno.test(
  'create-video-upload-session: cancel unknown lesson -> 404 lesson_not_found',
  async () => {
    const { dep, rpcCalls } = deps(cancelCfg({ tables: { lessons: { rows: [] } } }));
    const res = await handle(cancelPost(), dep);
    await expectStatus(res, 404);
    assertEqual(rpcCalls.length, 0);
  },
);
