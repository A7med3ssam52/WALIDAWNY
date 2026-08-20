/**
 * Pure TUS protocol over fetch — used by the in-page fallback uploader and
 * covered by mock-fetch tests. The service worker ships its own embedded copy
 * (public/sw.js) because importScripts is not allowed there.
 */

export const TUS_DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
export const TUS_RETRY_DELAYS = [0, 1000, 3000, 5000];

/** Error thrown for non-2xx TUS responses; `status` is absent for network errors. */
export interface TusError extends Error {
  status?: number;
}

export interface TusUploadOptions {
  endpoint: string;
  headers: Record<string, string>;
  file: Blob;
  chunkSize?: number;
  onProgress?: (bytesSent: number, bytesTotal: number) => void;
  signal?: AbortSignal;
  maxRetries?: number;
}

/** HEAD the endpoint and return the persisted `Upload-Offset` (0 when absent or on 404). */
export async function tusHead(
  endpoint: string,
  headers: Record<string, string>,
): Promise<number> {
  try {
    const response = await fetch(endpoint, { method: 'HEAD', headers });
    if (!response.ok) {
      return 0;
    }
    const header = response.headers.get('Upload-Offset');
    if (header === null) {
      return 0;
    }
    const offset = Number.parseInt(header, 10);
    return Number.isFinite(offset) && offset >= 0 ? offset : 0;
  } catch {
    return 0;
  }
}

/** PATCH one chunk; returns the new offset from the `Upload-Offset` response header. */
export async function tusPatchChunk(
  endpoint: string,
  offset: number,
  chunk: Blob,
  headers: Record<string, string>,
): Promise<number> {
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      ...headers,
      'Upload-Offset': String(offset),
      'Content-Type': 'application/offset+octet-stream',
    },
    body: chunk,
  });
  if (!response.ok) {
    const error: TusError = new Error(`TUS PATCH failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const header = response.headers.get('Upload-Offset');
  if (header !== null) {
    const parsed = Number.parseInt(header, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return offset + chunk.size;
}

function createAbortError(): DOMException {
  return new DOMException('The upload was aborted', 'AbortError');
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(createAbortError());
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);
    }
  });
}

/**
 * Upload a Blob to a TUS endpoint: HEAD first (resume from the persisted
 * offset), then PATCH chunks until completion. Network errors and 5xx are
 * retried with backoff; a final failure throws while the upload stays
 * resumable. Aborts promptly when `signal` fires.
 */
export async function uploadFileTus(options: TusUploadOptions): Promise<void> {
  const { endpoint, headers, file, onProgress, signal, maxRetries = TUS_RETRY_DELAYS.length } =
    options;
  const chunkSize = options.chunkSize ?? TUS_DEFAULT_CHUNK_SIZE;

  assertNotAborted(signal);
  let offset = await tusHead(endpoint, headers);
  assertNotAborted(signal);

  while (offset < file.size) {
    const end = Math.min(offset + chunkSize, file.size);
    const chunk = file.slice(offset, end);
    let triesLeft = maxRetries;
    for (;;) {
      assertNotAborted(signal);
      try {
        offset = await tusPatchChunk(endpoint, offset, chunk, headers);
        break;
      } catch (error) {
        const status = (error as TusError).status;
        const retryable = status === undefined || status >= 500;
        if (!retryable || triesLeft === 0) {
          throw error;
        }
        const delayIndex = maxRetries - triesLeft;
        const delay = TUS_RETRY_DELAYS[Math.min(delayIndex, TUS_RETRY_DELAYS.length - 1)];
        await wait(delay, signal);
        triesLeft -= 1;
      }
    }
    onProgress?.(offset, file.size);
  }
}