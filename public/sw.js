/* وليد عونى — Aurora Night service worker
 * - Precaches the app shell for instant + offline startup
 * - Network-first for navigations (fresh content online, cached shell offline)
 * - Cache-first for hashed build assets (safe, immutable)
 * - Cross-origin requests (Supabase, Bunny CDN, Google Fonts) are never cached
 * - Background TUS upload engine: jobs live in IndexedDB (walid-uploads/jobs),
 *   uploads survive tab close / device sleep and auto-resume on activate.
 */
'use strict';

const CACHE_VERSION = 'v1';
const CACHE_NAME = `walid-aurora-${CACHE_VERSION}`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

/* ------------------------- Background upload engine ---------------------- */

const UPLOAD_DB = 'walid-uploads';
const UPLOAD_STORE = 'jobs';
const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;
const UPLOAD_RETRY_DELAYS = [0, 1000, 3000, 5000];
const UPLOAD_MAX_RETRIES = UPLOAD_RETRY_DELAYS.length;

const activeControllers = new Map();

function openUploadDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(UPLOAD_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(UPLOAD_STORE)) {
        db.createObjectStore(UPLOAD_STORE, { keyPath: 'jobId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbDelete(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function broadcast(message) {
  self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      clients.forEach((client) => client.postMessage(message));
    })
    .catch(() => {});
}

function isAbortError(error) {
  return Boolean(error && error.name === 'AbortError');
}

/** UTF-8 safe base64 — metadata titles are Arabic and btoa alone would throw. */
function b64Utf8(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** HEAD the endpoint and return the persisted Upload-Offset (0 when absent). */
function tusHead(endpoint, headers) {
  return self
    .fetch(endpoint, { method: 'HEAD', headers })
    .then((response) => {
      if (!response.ok) {
        return 0;
      }
      const header = response.headers.get('Upload-Offset');
      const offset = header === null ? NaN : parseInt(header, 10);
      return Number.isFinite(offset) && offset >= 0 ? offset : 0;
    })
    .catch(() => 0);
}

/** PATCH one chunk and return the new offset from the response header. */
function tusPatch(endpoint, offset, chunk, headers, uploadMetadata) {
  const requestHeaders = Object.assign({}, headers, {
    'Upload-Offset': String(offset),
    'Content-Type': 'application/offset+octet-stream',
  });
  if (uploadMetadata && offset === 0) {
    requestHeaders['Upload-Metadata'] = uploadMetadata;
  }
  return self
    .fetch(endpoint, { method: 'PATCH', headers: requestHeaders, body: chunk })
    .then((response) => {
      if (!response.ok) {
        const error = new Error('TUS PATCH failed with status ' + response.status);
        error.status = response.status;
        throw error;
      }
      const header = response.headers.get('Upload-Offset');
      const parsed = header === null ? NaN : parseInt(header, 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : offset + chunk.size;
    });
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(new DOMException('The upload was aborted', 'AbortError'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort);
  });
}

/**
 * Run one TUS job end-to-end: HEAD for the persisted offset, then PATCH
 * 8 MiB chunks with retry/backoff, broadcasting progress to every window.
 * Success deletes the job; a final failure keeps it (resumable later).
 */
function runUploadJob(job) {
  const controller = new AbortController();
  activeControllers.set(job.jobId, controller);
  const headers = job.headers || {};
  const uploadMetadata = job.metadata
    ? Object.keys(job.metadata)
        .map((key) => key + ' ' + b64Utf8(job.metadata[key]))
        .join(',')
    : null;

  return tusHead(job.endpoint, headers)
    .then((headOffset) => {
      let offset = headOffset;
      const saveAndBroadcast = (status) =>
        openUploadDb()
          .then((db) =>
            idbPut(db, UPLOAD_STORE, {
              jobId: job.jobId,
              lessonId: job.lessonId,
              videoId: job.videoId,
              endpoint: job.endpoint,
              headers: job.headers,
              metadata: job.metadata,
              fileName: job.fileName,
              fileSize: job.fileSize,
              file: job.file,
              offset,
              status,
            }).then(() => db.close()),
          )
          .then(() => {
            if (status === 'uploading') {
              broadcast({
                type: 'upload-progress',
                jobId: job.jobId,
                bytesSent: offset,
                bytesTotal: job.fileSize,
              });
            }
          });

      return saveAndBroadcast('uploading').then(() => {
        const uploadNext = () => {
          if (controller.signal.aborted) {
            return Promise.resolve();
          }
          if (offset >= job.fileSize) {
            return Promise.resolve();
          }
          const end = Math.min(offset + UPLOAD_CHUNK_SIZE, job.fileSize);
          const chunk = job.file.slice(offset, end);
          let triesLeft = UPLOAD_MAX_RETRIES;
          const attempt = () => {
            if (controller.signal.aborted) {
              return Promise.reject(new DOMException('The upload was aborted', 'AbortError'));
            }
            return tusPatch(job.endpoint, offset, chunk, headers, uploadMetadata)
              .then((nextOffset) => {
                offset = nextOffset;
                return saveAndBroadcast('uploading').then(uploadNext);
              })
              .catch((error) => {
                if (isAbortError(error) || controller.signal.aborted) {
                  throw new DOMException('The upload was aborted', 'AbortError');
                }
                const status = error.status;
                if ((status !== undefined && status < 500) || triesLeft === 0) {
                  throw error;
                }
                const delayIndex = UPLOAD_MAX_RETRIES - triesLeft;
                const delay =
                  UPLOAD_RETRY_DELAYS[Math.min(delayIndex, UPLOAD_RETRY_DELAYS.length - 1)];
                return wait(delay, controller.signal).then(() => {
                  triesLeft -= 1;
                  return attempt();
                });
              });
          };
          return attempt();
        };
        return uploadNext().then(() => {
          if (controller.signal.aborted) {
            return;
          }
          return openUploadDb()
            .then((db) => idbDelete(db, UPLOAD_STORE, job.jobId).then(() => db.close()))
            .then(() => {
              broadcast({
                type: 'upload-success',
                jobId: job.jobId,
                lessonId: job.lessonId,
                videoId: job.videoId,
              });
            });
        });
      });
    })
    .catch((error) => {
      if (isAbortError(error) || controller.signal.aborted) {
        return;
      }
      return openUploadDb()
        .then((db) =>
          idbPut(db, UPLOAD_STORE, {
            jobId: job.jobId,
            lessonId: job.lessonId,
            videoId: job.videoId,
            endpoint: job.endpoint,
            headers: job.headers,
            metadata: job.metadata,
            fileName: job.fileName,
            fileSize: job.fileSize,
            file: job.file,
            offset: 0,
            status: 'failed',
          }).then(() => db.close()),
        )
        .then(() => {
          broadcast({
            type: 'upload-failed',
            jobId: job.jobId,
            lessonId: job.lessonId,
            videoId: job.videoId,
          });
        });
    })
    .then(() => {
      activeControllers.delete(job.jobId);
    });
}

/** Restart every active (uploading/paused) job — automatic resume on activate. */
function resumeUploadJobs() {
  return openUploadDb()
    .then((db) =>
      idbGetAll(db, UPLOAD_STORE).then((rows) => {
        db.close();
        return rows;
      }),
    )
    .then((rows) => {
      const resumed = [];
      rows.forEach((row) => {
        if (row.status === 'uploading' || row.status === 'paused') {
          resumed.push(runUploadJob(row));
        }
      });
      return Promise.all(resumed);
    })
    .catch(() => {
      // best-effort — a failed resume never blocks activation
    });
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') {
    return;
  }
  if (data.type === 'upload-start') {
    const job = data.job;
    if (!job || !job.jobId || !(job.file instanceof File || job.file instanceof Blob)) {
      return;
    }
    event.waitUntil(
      openUploadDb()
        .then((db) =>
          idbPut(db, UPLOAD_STORE, {
            jobId: job.jobId,
            lessonId: job.lessonId,
            videoId: job.videoId,
            endpoint: job.endpoint,
            headers: job.headers,
            metadata: job.metadata,
            fileName: job.fileName,
            fileSize: job.fileSize,
            file: job.file,
            offset: job.offset || 0,
            status: 'uploading',
          }).then(() => db.close()),
        )
        .then(() => runUploadJob(job)),
    );
    return;
  }
  if (data.type === 'upload-cancel') {
    event.waitUntil(
      Promise.resolve()
        .then(() => {
          const controller = activeControllers.get(data.jobId);
          if (controller) {
            controller.abort();
          }
          return openUploadDb().then((db) =>
            idbDelete(db, UPLOAD_STORE, data.jobId).then(() => db.close()),
          );
        })
        .then(() => {
          broadcast({ type: 'upload-cancelled', jobId: data.jobId });
        }),
    );
    return;
  }
  if (data.type === 'get-jobs') {
    event.waitUntil(
      openUploadDb()
        .then((db) =>
          idbGetAll(db, UPLOAD_STORE).then((rows) => {
            db.close();
            return rows;
          }),
        )
        .then((rows) => {
          const jobs = rows.map((row) => ({
            jobId: row.jobId,
            lessonId: row.lessonId,
            videoId: row.videoId,
            fileName: row.fileName,
            fileSize: row.fileSize,
            offset: row.offset || 0,
            status: row.status,
          }));
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ type: 'jobs-snapshot', jobs });
          } else {
            broadcast({ type: 'jobs-snapshot', jobs });
          }
        })
        .catch(() => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ type: 'jobs-snapshot', jobs: [] });
          }
        }),
    );
    return;
  }
});

/* ------------------------------ Cache shell ------------------------------ */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
        ),
      self.clients.claim(),
      resumeUploadJobs(),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // SEO files must never be served from cache — always network (no PWA interference)
  if (
    url.pathname === '/sitemap.xml' ||
    url.pathname === '/robots.txt' ||
    url.pathname === '/og-image.jpg' ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        if (
          response.ok &&
          (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.webmanifest'))
        ) {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      });
    }),
  );
});