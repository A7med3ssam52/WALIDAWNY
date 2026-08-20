import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  tusHead,
  tusPatchChunk,
  uploadFileTus,
  TUS_DEFAULT_CHUNK_SIZE,
} from './tusCore';

interface FakeHeaders {
  get(name: string): string | null;
}

interface FakeResponse {
  ok: boolean;
  status: number;
  headers: FakeHeaders;
}

function fakeResponse(init: {
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
}): FakeResponse {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: {
      get(name: string): string | null {
        return init.headers?.[name] ?? null;
      },
    },
  };
}

function fileOf(size: number): File {
  return new File([new Uint8Array(size)], 'video.mp4', { type: 'video/mp4' });
}

const ENDPOINT = 'https://video.bunnycdn.com/tusupload';
const SESSION_HEADERS = {
  AuthorizationSignature: 'sig-123',
  AuthorizationExpire: '2027-01-01T00:00:00Z',
  LibraryId: 'lib-1',
  VideoId: 'vid-1',
};

describe('tusCore', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tusHead returns the persisted Upload-Offset', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ headers: { 'Upload-Offset': '4096' } }));
    const offset = await tusHead(ENDPOINT, SESSION_HEADERS);
    expect(offset).toBe(4096);
    expect(fetchMock).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({ method: 'HEAD', headers: SESSION_HEADERS }),
    );
  });

  it('tusHead returns 0 when the header is missing or the status is 404', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}));
    expect(await tusHead(ENDPOINT, SESSION_HEADERS)).toBe(0);
    fetchMock.mockResolvedValueOnce(fakeResponse({ ok: false, status: 404 }));
    expect(await tusHead(ENDPOINT, SESSION_HEADERS)).toBe(0);
  });

  it('tusHead returns 0 on network errors', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    expect(await tusHead(ENDPOINT, SESSION_HEADERS)).toBe(0);
  });

  it('tusPatchChunk sends headers, offset, content type and the chunk bytes', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ headers: { 'Upload-Offset': '8192' } }));
    const chunk = new Blob([new Uint8Array(1024)]);
    const next = await tusPatchChunk(ENDPOINT, 4096, chunk, SESSION_HEADERS);
    expect(next).toBe(8192);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(ENDPOINT);
    expect(init).toMatchObject({
      method: 'PATCH',
      headers: {
        ...SESSION_HEADERS,
        'Upload-Offset': '4096',
        'Content-Type': 'application/offset+octet-stream',
      },
    });
    expect(init.body).toBe(chunk);
  });

  it('tusPatchChunk falls back to offset + chunk size when the header is missing', async () => {
    fetchMock.mockResolvedValue(fakeResponse({}));
    const chunk = new Blob([new Uint8Array(2048)]);
    expect(await tusPatchChunk(ENDPOINT, 1000, chunk, SESSION_HEADERS)).toBe(3048);
  });

  it('tusPatchChunk throws with the status on non-2xx responses', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 403 }));
    await expect(
      tusPatchChunk(ENDPOINT, 0, new Blob(['x']), SESSION_HEADERS),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('uploadFileTus resumes from a non-zero HEAD offset and reports progress', async () => {
    const file = fileOf(TUS_DEFAULT_CHUNK_SIZE + 512 * 1024);
    const onProgress = vi.fn();
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ headers: { 'Upload-Offset': '4096' } }))
      .mockResolvedValueOnce(fakeResponse({ headers: { 'Upload-Offset': String(file.size) } }));

    await uploadFileTus({
      endpoint: ENDPOINT,
      headers: SESSION_HEADERS,
      file,
      onProgress,
    });

    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0][1]).toMatchObject({
      headers: expect.objectContaining({ 'Upload-Offset': '4096' }),
    });
    expect(onProgress).toHaveBeenCalledWith(file.size, file.size);
  });

  it('uploadFileTus uploads in 8 MiB chunks from scratch', async () => {
    const file = fileOf(3 * TUS_DEFAULT_CHUNK_SIZE);
    const onProgress = vi.fn();
    fetchMock
      .mockResolvedValueOnce(fakeResponse({}))
      .mockResolvedValueOnce(fakeResponse({ headers: { 'Upload-Offset': String(TUS_DEFAULT_CHUNK_SIZE) } }))
      .mockResolvedValueOnce(fakeResponse({ headers: { 'Upload-Offset': String(2 * TUS_DEFAULT_CHUNK_SIZE) } }))
      .mockResolvedValueOnce(fakeResponse({ headers: { 'Upload-Offset': String(file.size) } }));

    await uploadFileTus({ endpoint: ENDPOINT, headers: SESSION_HEADERS, file, onProgress });

    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(patchCalls).toHaveLength(3);
    expect(patchCalls[0][1].headers['Upload-Offset']).toBe('0');
    expect(patchCalls[1][1].headers['Upload-Offset']).toBe(String(TUS_DEFAULT_CHUNK_SIZE));
    expect(patchCalls[2][1].headers['Upload-Offset']).toBe(String(2 * TUS_DEFAULT_CHUNK_SIZE));
    expect(onProgress).toHaveBeenNthCalledWith(1, TUS_DEFAULT_CHUNK_SIZE, file.size);
    expect(onProgress).toHaveBeenLastCalledWith(file.size, file.size);
  });

  it('retries a 5xx failure with backoff and then succeeds', async () => {
    const file = fileOf(TUS_DEFAULT_CHUNK_SIZE);
    const onProgress = vi.fn();
    fetchMock
      .mockResolvedValueOnce(fakeResponse({}))
      .mockResolvedValueOnce(fakeResponse({ ok: false, status: 500 }))
      .mockResolvedValueOnce(fakeResponse({ ok: false, status: 503 }))
      .mockResolvedValueOnce(fakeResponse({ headers: { 'Upload-Offset': String(file.size) } }));

    await uploadFileTus({ endpoint: ENDPOINT, headers: SESSION_HEADERS, file, onProgress });

    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(patchCalls).toHaveLength(3);
    expect(onProgress).toHaveBeenCalledWith(file.size, file.size);
  });

  it('retries network errors and gives up with a throw after maxRetries', async () => {
    const file = fileOf(TUS_DEFAULT_CHUNK_SIZE);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({}))
      .mockRejectedValue(new TypeError('Network request failed'));

    await expect(
      uploadFileTus({
        endpoint: ENDPOINT,
        headers: SESSION_HEADERS,
        file,
        maxRetries: 0,
      }),
    ).rejects.toThrow('Network request failed');
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
  });

  it('stops immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const file = fileOf(TUS_DEFAULT_CHUNK_SIZE);
    fetchMock.mockResolvedValue(fakeResponse({ headers: { 'Upload-Offset': '0' } }));

    await expect(
      uploadFileTus({
        endpoint: ENDPOINT,
        headers: SESSION_HEADERS,
        file,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts mid-flight without touching the server again', async () => {
    const file = fileOf(2 * TUS_DEFAULT_CHUNK_SIZE);
    const controller = new AbortController();
    const onProgress = vi.fn();
    fetchMock
      .mockResolvedValueOnce(fakeResponse({}))
      .mockResolvedValueOnce(fakeResponse({ headers: { 'Upload-Offset': String(TUS_DEFAULT_CHUNK_SIZE) } }))
      .mockImplementationOnce(() => {
        controller.abort();
        return Promise.reject(new DOMException('The upload was aborted', 'AbortError'));
      });

    await expect(
      uploadFileTus({
        endpoint: ENDPOINT,
        headers: SESSION_HEADERS,
        file,
        signal: controller.signal,
        onProgress,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(onProgress).toHaveBeenCalledTimes(1);
    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(patchCalls).toHaveLength(2);
  });
});