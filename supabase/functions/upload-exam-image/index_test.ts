// Unit tests for upload-exam-image (Phase 12, Exam Images).
import { handle, MAX_EXAM_IMAGE_SIZE_BYTES } from './index.ts';
import { assert, assertEqual, expectStatus, makeStubClient } from '../_test_helpers.ts';
import type { StubConfig } from '../_test_helpers.ts';

const EXAM_ID = 'ab000000-0000-0000-0000-000000000001';
const DELETED_EXAM_ID = 'ab000000-0000-0000-0000-000000000099';
const WALID_ID = '20000000-0000-0000-0000-000000000002';
const STUDENT_ID = '20000000-0000-0000-0000-000000000003';

function request(body?: unknown, authHeader = 'Bearer test-jwt'): Request {
  return new Request('https://example.supabase.co/functions/v1/upload-exam-image', {
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
      exams: { rows: [{ id: EXAM_ID, deleted_at: null }] },
    },
    storage: { 'exam-images': {} },
  };
  return deepMerge(cfg, overrides ?? {});
}

function deepMerge(base: StubConfig, override: Partial<StubConfig>): StubConfig {
  return {
    ...base,
    ...override,
    tables: { ...base.tables, ...(override.tables ?? {}) },
    rpc: { ...base.rpc, ...(override.rpc ?? {}) },
    storage: { ...base.storage, ...(override.storage ?? {}) },
  };
}

function deps(cfg: StubConfig) {
  const { client, storageCalls } = makeStubClient(cfg);
  const serviceClient = makeStubClient(cfg).client;
  // capture service storage calls separately
  const svcStorageCalls: typeof storageCalls = [];
  const svcClient = {
    ...serviceClient,
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: (path: string, options?: { contentType?: string }) => {
          svcStorageCalls.push({ bucket, path, options });
          const s = cfg.storage?.[bucket] ?? {};
          if (s.error) return Promise.resolve({ data: null, error: s.error });
          return Promise.resolve({
            data: {
              signedUrl: `https://example.supabase.co/storage/v1/object/upload/sign/${bucket}/${path}`,
              path,
              token: 'stub-token',
            },
            error: null,
          });
        },
        createSignedUrl: (path: string, expiresIn: number) => {
          svcStorageCalls.push({ bucket, path, options: { expiresIn } });
          const s = cfg.storage?.[bucket] ?? {};
          if (s.error) return Promise.resolve({ data: null, error: s.error });
          return Promise.resolve({
            data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/${bucket}/${path}`, path, expiresIn },
            error: null,
          });
        },
        remove: (paths: string[]) => {
          svcStorageCalls.push({ bucket, path: paths.join(',') });
          return Promise.resolve({ data: paths.map((p) => ({ path: p })), error: null });
        },
        upload: (_p: string, _c: string, _opts?: unknown) =>
          Promise.resolve({ data: { path: _p }, error: null }),
      }),
    },
  } as unknown as typeof client;
  const callerClient = client;
  return {
    dep: {
      url: 'https://example.supabase.co',
      makeClient: () => callerClient,
      makeServiceClient: () => svcClient,
    },
    storageCalls: svcStorageCalls,
  };
}

Deno.test('upload-exam-image: GET is rejected with 405', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(new Request('https://example.supabase.co/functions/v1/upload-exam-image'), dep);
  await expectStatus(res, 405);
});

Deno.test('upload-exam-image: missing Authorization -> 401', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(request(undefined, ''), dep);
  await expectStatus(res, 401);
  const body = await res.json();
  assertEqual(body.error.code, 'unauthorized');
});

Deno.test('upload-exam-image: student role -> 403', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      user: { id: STUDENT_ID },
      tables: { profiles: { rows: [{ id: STUDENT_ID, role: 'student', status: 'active', deleted_at: null }] } },
    }),
  );
  const res = await handle(request({ exam_id: EXAM_ID, file_name: 'q.jpg' }), dep);
  await expectStatus(res, 403);
  const body = await res.json();
  assertEqual(body.error.code, 'forbidden');
});

Deno.test('upload-exam-image: malformed exam_id -> 422 validation_error', async () => {
  const { dep } = deps(staffCfg());
  for (const exam_id of ['not-a-uuid', 42, '', null]) {
    const res = await handle(request({ exam_id, file_name: 'board.jpg' }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'validation_error');
  }
});

Deno.test('upload-exam-image: invalid file_name -> 422', async () => {
  const { dep } = deps(staffCfg());
  for (const file_name of ['bad.txt', 'img.gif', '', null]) {
    const res = await handle(request({ exam_id: EXAM_ID, file_name }), dep);
    await expectStatus(res, 422);
    const body = await res.json();
    assertEqual(body.error.code, 'invalid_file_name');
  }
});

Deno.test('upload-exam-image: file too large -> 422', async () => {
  const { dep } = deps(staffCfg());
  const res = await handle(
    request({ exam_id: EXAM_ID, file_name: 'q.jpg', file_size: MAX_EXAM_IMAGE_SIZE_BYTES + 1 }),
    dep,
  );
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'file_too_large');
});

Deno.test('upload-exam-image: unknown exam -> 404', async () => {
  const { dep } = deps(deepMerge(staffCfg(), { tables: { exams: { rows: [] } } }));
  const res = await handle(request({ exam_id: EXAM_ID, file_name: 'q.jpg' }), dep);
  await expectStatus(res, 404);
  const body = await res.json();
  assertEqual(body.error.code, 'exam_not_found');
});

Deno.test('upload-exam-image: soft-deleted exam -> 422 exam_deleted', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      tables: { exams: { rows: [{ id: DELETED_EXAM_ID, deleted_at: '2026-08-01T00:00:00.000Z' }] } },
    }),
  );
  const res = await handle(request({ exam_id: DELETED_EXAM_ID, file_name: 'q.jpg' }), dep);
  await expectStatus(res, 422);
  const body = await res.json();
  assertEqual(body.error.code, 'exam_deleted');
});

Deno.test('upload-exam-image: success 200 with signed URL', async () => {
  const { dep, storageCalls } = deps(staffCfg());
  const res = await handle(request({ exam_id: EXAM_ID, file_name: 'سؤال-1.JPG', file_size: 12345 }), dep);
  await expectStatus(res, 200);
  const body = await res.json();
  assert(typeof body.uploadUrl === 'string' && body.uploadUrl.length > 0, 'uploadUrl must be string');
  assertEqual(body.exam_id, EXAM_ID);
  assert(typeof body.storage_path === 'string' && body.storage_path.startsWith(EXAM_ID + '/'), 'path must start with exam_id');
  assert(body.storage_path.endsWith('.jpg'), 'path must preserve extension lowercased');
  assertEqual(storageCalls.length, 1);
  assertEqual(storageCalls[0].bucket, 'exam-images');
  assertEqual(storageCalls[0].options?.contentType, 'image/jpeg');
});

Deno.test('upload-exam-image: content-type mapping', async () => {
  const cases: Array<[string, string]> = [
    ['a.jpeg', 'image/jpeg'],
    ['b.png', 'image/png'],
    ['c.webp', 'image/webp'],
  ];
  for (const [file_name, mime] of cases) {
    const { dep, storageCalls } = deps(staffCfg());
    const res = await handle(request({ exam_id: EXAM_ID, file_name }), dep);
    await expectStatus(res, 200);
    assertEqual(storageCalls[0].options?.contentType, mime);
  }
});

Deno.test('upload-exam-image: storage failure -> 502', async () => {
  const { dep } = deps(
    deepMerge(staffCfg(), {
      storage: { 'exam-images': { error: { message: 'boom', code: 'err' } } },
    }),
  );
  const res = await handle(request({ exam_id: EXAM_ID, file_name: 'q.jpg' }), dep);
  await expectStatus(res, 502);
  const body = await res.json();
  assertEqual(body.error.code, 'upload_url_failed');
});
