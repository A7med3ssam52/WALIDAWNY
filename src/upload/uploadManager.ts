/**
 * Upload manager singleton — owns the job lifecycle and bridges the service
 * worker with the UI. Persists job meta (never the File) in localStorage, and
 * keeps a screen wake lock while any job is active so mobile uploads survive
 * screen-off.
 */

import type { VideoUploadSession } from '../types/database';
import { cancelVideoUploadSession } from '../data/rpc';
import { isSupported, sendMessage } from './swBridge';
import { uploadFileTus } from './tusCore';

export type UploadJobStage = 'queued' | 'uploading' | 'paused' | 'done' | 'failed' | 'cancelled';

export type VideoUploadJob = {
  jobId: string;
  lessonId: string;
  videoId: string;
  fileName: string;
  fileSize: number;
  progress: number;
  bytesSent: number;
  bytesTotal: number;
  stage: UploadJobStage;
  error: string | null;
};

/** Meta persisted in localStorage (no File); `createdAt` powers pruning. */
interface PersistedJobMeta extends VideoUploadJob {
  createdAt: number;
}

export interface EnqueueVideoUploadInput {
  lessonId: string;
  file: File;
  session: VideoUploadSession;
}

export interface SwJobSummary {
  jobId: string;
  status: string;
  offset: number;
}

export interface SwJobsSnapshot {
  type: 'jobs-snapshot';
  jobs: SwJobSummary[];
}

const STORAGE_KEY = 'walid-upload-jobs';
const JOB_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FAILED_ERROR_MESSAGE = 'فشل رفع الفيديو. حاول مرة أخرى';

const ACTIVE_STAGES = new Set<UploadJobStage>(['queued', 'uploading', 'paused']);

type JobsListener = (jobs: VideoUploadJob[]) => void;

let persisted: PersistedJobMeta[] = loadPersisted();
const listeners = new Set<JobsListener>();
const fallbackControllers = new Map<string, AbortController>();
let wakeLockSentinel: { release: () => Promise<void> } | null = null;
let swListenerAttached = false;

function loadPersisted(): PersistedJobMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PersistedJobMeta[]) : [];
  } catch {
    return [];
  }
}

function persistAll(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // storage unavailable (private mode) — in-memory state still works
  }
}

function upsertMeta(meta: PersistedJobMeta): void {
  const index = persisted.findIndex((item) => item.jobId === meta.jobId);
  if (index >= 0) {
    persisted[index] = meta;
  } else {
    persisted.push(meta);
  }
  persistAll();
  prune();
}

function removeMeta(jobId: string): void {
  persisted = persisted.filter((item) => item.jobId !== jobId);
  persistAll();
}

/** Drop done/failed/cancelled jobs older than 7 days from storage. */
function prune(): void {
  const cutoff = Date.now() - JOB_MAX_AGE_MS;
  const next = persisted.filter(
    (item) => !(item.createdAt < cutoff && item.stage !== 'queued' && item.stage !== 'uploading' && item.stage !== 'paused'),
  );
  if (next.length !== persisted.length) {
    persisted = next;
    persistAll();
  }
}

function getSnapshot(): VideoUploadJob[] {
  return persisted.map((item) => {
    const { createdAt, ...job } = item;
    void createdAt;
    return job;
  });
}

function emit(): void {
  const snapshot = getSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

function randomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function percentOf(bytesSent: number, bytesTotal: number): number {
  return bytesTotal > 0 ? Math.min(100, Math.round((bytesSent / bytesTotal) * 100)) : 0;
}

function findJob(jobId: string): PersistedJobMeta | undefined {
  return persisted.find((item) => item.jobId === jobId);
}

function syncWakeLock(): void {
  const active = persisted.some((item) => ACTIVE_STAGES.has(item.stage));
  if (active) {
    requestWakeLock();
  } else {
    releaseWakeLock();
  }
}

function requestWakeLock(): void {
  if (wakeLockSentinel) {
    return;
  }
  const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
  if (!wakeLock) {
    return;
  }
  try {
    wakeLock
      .request('screen')
      .then((sentinel) => {
        wakeLockSentinel = sentinel;
      })
      .catch(() => {
        // wake lock is best-effort — the upload continues without it
      });
  } catch {
    // best-effort — the upload continues without it
  }
}

function releaseWakeLock(): void {
  const sentinel = wakeLockSentinel;
  wakeLockSentinel = null;
  if (!sentinel) {
    return;
  }
  try {
    void sentinel.release().catch(() => undefined);
  } catch {
    // best-effort
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncWakeLock();
    }
  });
}

type SwMessage = Record<string, unknown> | null | undefined;

function handleSwMessage(data: SwMessage): void {
  if (!data || typeof data !== 'object') {
    return;
  }
  if (data.type === 'upload-progress') {
    const job = findJob(String(data.jobId));
    if (!job) {
      return;
    }
    const bytesSent = Number(data.bytesSent ?? 0);
    const bytesTotal = Number(data.bytesTotal ?? 0);
    job.stage = 'uploading';
    job.bytesSent = bytesSent;
    job.bytesTotal = bytesTotal;
    job.progress = percentOf(bytesSent, bytesTotal);
    upsertMeta(job);
    emit();
    return;
  }
  if (data.type === 'upload-success') {
    const job = findJob(String(data.jobId));
    if (job) {
      job.stage = 'done';
      job.progress = 100;
      job.bytesSent = job.bytesTotal;
      emit();
    }
    removeMeta(String(data.jobId));
    syncWakeLock();
    return;
  }
  if (data.type === 'upload-failed') {
    const job = findJob(String(data.jobId));
    if (!job) {
      return;
    }
    job.stage = 'failed';
    job.error = FAILED_ERROR_MESSAGE;
    upsertMeta(job);
    emit();
    syncWakeLock();
    return;
  }
  if (data.type === 'upload-cancelled') {
    removeMeta(String(data.jobId));
    emit();
    syncWakeLock();
  }
}

function attachSwListener(): void {
  if (swListenerAttached) {
    return;
  }
  swListenerAttached = true;
  if (!isSupported()) {
    return;
  }
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    handleSwMessage(event.data as SwMessage);
  });
}

async function runFallbackUpload(
  jobId: string,
  endpoint: string,
  headers: Record<string, string>,
  file: File,
): Promise<void> {
  const controller = new AbortController();
  fallbackControllers.set(jobId, controller);
  try {
    await uploadFileTus({
      endpoint,
      headers,
      file,
      onProgress: (bytesSent, bytesTotal) => {
        const job = findJob(jobId);
        if (!job) {
          return;
        }
        job.stage = 'uploading';
        job.bytesSent = bytesSent;
        job.bytesTotal = bytesTotal;
        job.progress = percentOf(bytesSent, bytesTotal);
        upsertMeta(job);
        emit();
      },
      signal: controller.signal,
    });
    const job = findJob(jobId);
    if (job) {
      job.stage = 'done';
      job.progress = 100;
      job.bytesSent = job.bytesTotal;
      emit();
    }
    removeMeta(jobId);
  } catch {
    const job = findJob(jobId);
    if (job) {
      job.stage = 'failed';
      job.error = FAILED_ERROR_MESSAGE;
      upsertMeta(job);
      emit();
    }
  } finally {
    fallbackControllers.delete(jobId);
    syncWakeLock();
  }
}

/**
 * Enqueue a video upload: persist job meta, hand the File to the service
 * worker (or run a local TUS upload as fallback) and return the job id.
 */
export async function enqueueVideoUpload(input: EnqueueVideoUploadInput): Promise<string> {
  const { lessonId, file, session } = input;
  const jobId = randomUUID();
  const meta: PersistedJobMeta = {
    jobId,
    lessonId,
    videoId: session.video_id,
    fileName: file.name,
    fileSize: file.size,
    progress: 0,
    bytesSent: 0,
    bytesTotal: file.size,
    stage: 'queued',
    error: null,
    createdAt: Date.now(),
  };
  upsertMeta(meta);
  attachSwListener();
  emit();
  syncWakeLock();

  if (isSupported()) {
    void sendMessage({
      type: 'upload-start',
      job: {
        jobId,
        lessonId,
        videoId: session.video_id,
        endpoint: session.upload_url,
        headers: session.tus_headers,
        metadata: session.metadata,
        fileName: file.name,
        fileSize: file.size,
        file,
        offset: 0,
        status: 'uploading',
      },
    });
  } else {
    void runFallbackUpload(jobId, session.upload_url, session.tus_headers, file);
  }
  return jobId;
}

/**
 * Cancel a job: abort the service worker upload (or the in-page fallback),
 * release the remote session best-effort and broadcast the cancelled stage.
 */
export async function cancelJob(jobId: string): Promise<void> {
  const job = findJob(jobId);
  const controller = fallbackControllers.get(jobId);
  if (controller) {
    controller.abort();
    fallbackControllers.delete(jobId);
  }
  attachSwListener();
  void sendMessage({ type: 'upload-cancel', jobId });
  if (job) {
    void cancelVideoUploadSession(job.lessonId, job.videoId).catch(() => undefined);
  }
  removeMeta(jobId);
  emit();
  syncWakeLock();
}

/** Subscribe to full snapshots on every change; returns an unsubscribe function. */
export function subscribe(listener: JobsListener): () => void {
  listeners.add(listener);
  listener(getSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Ask the service worker for its in-flight jobs and reconcile them with
 * localStorage — jobs the worker already finished while we were away are
 * marked done. The worker itself restarts active jobs on activate.
 */
export async function resumeOnLoad(): Promise<void> {
  attachSwListener();
  if (!isSupported()) {
    return;
  }
  const reply = (await sendMessage({ type: 'get-jobs' })) as SwJobsSnapshot | null | undefined;
  if (!reply || reply.type !== 'jobs-snapshot' || !Array.isArray(reply.jobs)) {
    return;
  }
  const swIds = new Set(reply.jobs.map((item) => item.jobId));
  let changed = false;
  for (const job of persisted) {
    if (!swIds.has(job.jobId) && job.stage !== 'done' && job.stage !== 'cancelled') {
      job.stage = 'done';
      job.progress = 100;
      job.bytesSent = job.bytesTotal;
      changed = true;
    }
  }
  for (const swJob of reply.jobs) {
    const job = findJob(swJob.jobId);
    if (job && swJob.status === 'uploading') {
      job.stage = 'uploading';
      job.bytesSent = swJob.offset;
      job.bytesTotal = job.fileSize;
      job.progress = percentOf(swJob.offset, job.fileSize);
      changed = true;
    }
  }
  if (changed) {
    persistAll();
    prune();
    emit();
  }
  syncWakeLock();
}

export const uploadManager = {
  enqueueVideoUpload,
  cancelJob,
  subscribe,
  getSnapshot,
  resumeOnLoad,
};