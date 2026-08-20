import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isSupported: vi.fn(),
  sendMessage: vi.fn(),
  uploadFileTus: vi.fn(),
  cancelVideoUploadSession: vi.fn(),
  swMessageHandler: { handler: null as ((event: { data: unknown }) => void) | null },
}));

vi.mock('./swBridge', () => ({
  isSupported: mocks.isSupported,
  sendMessage: mocks.sendMessage,
}));

vi.mock('./tusCore', () => ({
  uploadFileTus: mocks.uploadFileTus,
}));

vi.mock('../data/rpc', () => ({
  cancelVideoUploadSession: mocks.cancelVideoUploadSession,
}));

type ManagerModule = typeof import('./uploadManager');
let manager: ManagerModule['uploadManager'];

const MB = 1024 * 1024;

const SESSION = {
  video_id: 'video-new-1',
  bunny_video_id: 'bunny-video-new-1',
  upload_url: 'https://video.bunnycdn.com/tusupload',
  tus_headers: {
    AuthorizationSignature: 'sig-123',
    AuthorizationExpire: '2027-01-01T00:00:00Z',
    LibraryId: 'lib-1',
    VideoId: 'bunny-video-new-1',
  },
  metadata: { filetype: 'video/mp4', title: 'فيديو الدرس' },
  expires_in: 3600,
};

function makeFile(): File {
  return new File(['fake-video-bytes'], 'درس.mp4', { type: 'video/mp4' });
}

function installSw() {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      addEventListener: (type: string, listener: (event: { data: unknown }) => void) => {
        if (type === 'message') {
          mocks.swMessageHandler.handler = listener;
        }
      },
    },
  });
}

function sendSwMessage(data: unknown) {
  mocks.swMessageHandler.handler?.({ data });
}

describe('uploadManager', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
    mocks.isSupported.mockReset();
    mocks.sendMessage.mockReset();
    mocks.uploadFileTus.mockReset();
    mocks.cancelVideoUploadSession.mockReset();
    mocks.uploadFileTus.mockResolvedValue(undefined);
    mocks.sendMessage.mockResolvedValue(undefined);
    mocks.cancelVideoUploadSession.mockResolvedValue(undefined);
    mocks.swMessageHandler.handler = null;
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      'job-1' as ReturnType<typeof crypto.randomUUID>,
    );
    installSw();
    const mod = await import('./uploadManager');
    manager = mod.uploadManager;
  });

  it('enqueues: persists job meta and sends upload-start with the full session', async () => {
    mocks.isSupported.mockReturnValue(true);
    const file = makeFile();
    const jobId = await manager.enqueueVideoUpload({
      lessonId: 'lesson-1',
      file,
      session: SESSION,
    });

    expect(jobId).toBe('job-1');
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      type: 'upload-start',
      job: expect.objectContaining({
        jobId: 'job-1',
        lessonId: 'lesson-1',
        videoId: 'video-new-1',
        endpoint: SESSION.upload_url,
        headers: SESSION.tus_headers,
        metadata: SESSION.metadata,
        fileName: 'درس.mp4',
        fileSize: file.size,
        file,
      }),
    });
    expect(mocks.uploadFileTus).not.toHaveBeenCalled();

    const stored = JSON.parse(localStorage.getItem('walid-upload-jobs') ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      jobId: 'job-1',
      lessonId: 'lesson-1',
      videoId: 'video-new-1',
      fileName: 'درس.mp4',
      stage: 'queued',
    });
    expect(stored[0].file).toBeUndefined();

    expect(manager.getSnapshot()).toEqual([
      expect.objectContaining({
        jobId: 'job-1',
        stage: 'queued',
        bytesTotal: file.size,
        error: null,
      }),
    ]);
  });

  it('updates the snapshot from upload-progress messages', async () => {
    mocks.isSupported.mockReturnValue(true);
    await manager.enqueueVideoUpload({ lessonId: 'lesson-1', file: makeFile(), session: SESSION });

    sendSwMessage({
      type: 'upload-progress',
      jobId: 'job-1',
      bytesSent: 4 * MB,
      bytesTotal: 8 * MB,
    });

    expect(manager.getSnapshot()).toEqual([
      expect.objectContaining({
        stage: 'uploading',
        progress: 50,
        bytesSent: 4 * MB,
        bytesTotal: 8 * MB,
      }),
    ]);
    const stored = JSON.parse(localStorage.getItem('walid-upload-jobs') ?? '[]');
    expect(stored[0]).toMatchObject({ stage: 'uploading', progress: 50 });
  });

  it('broadcasts done, clears localStorage and removes the job on upload-success', async () => {
    mocks.isSupported.mockReturnValue(true);
    const listener = vi.fn();
    manager.subscribe(listener);
    await manager.enqueueVideoUpload({ lessonId: 'lesson-1', file: makeFile(), session: SESSION });

    sendSwMessage({ type: 'upload-success', jobId: 'job-1' });

    expect(listener).toHaveBeenLastCalledWith([
      expect.objectContaining({ stage: 'done', progress: 100 }),
    ]);
    expect(localStorage.getItem('walid-upload-jobs')).toBe('[]');
    expect(manager.getSnapshot()).toEqual([]);
  });

  it('keeps the job resumable on upload-failed', async () => {
    mocks.isSupported.mockReturnValue(true);
    await manager.enqueueVideoUpload({ lessonId: 'lesson-1', file: makeFile(), session: SESSION });

    sendSwMessage({ type: 'upload-failed', jobId: 'job-1' });

    expect(manager.getSnapshot()).toEqual([
      expect.objectContaining({ stage: 'failed', error: 'فشل رفع الفيديو. حاول مرة أخرى' }),
    ]);
    const stored = JSON.parse(localStorage.getItem('walid-upload-jobs') ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].stage).toBe('failed');
  });

  it('cancel sends upload-cancel, releases the remote session and removes the job', async () => {
    mocks.isSupported.mockReturnValue(true);
    await manager.enqueueVideoUpload({ lessonId: 'lesson-1', file: makeFile(), session: SESSION });

    await manager.cancelJob('job-1');

    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'upload-cancel', jobId: 'job-1' });
    expect(mocks.cancelVideoUploadSession).toHaveBeenCalledWith('lesson-1', 'video-new-1');
    expect(localStorage.getItem('walid-upload-jobs')).toBe('[]');
    expect(manager.getSnapshot()).toEqual([]);
  });

  it('falls back to in-page TUS when the service worker is unsupported', async () => {
    mocks.isSupported.mockReturnValue(false);
    const pendingUpload = { resolve: null as (() => void) | null };
    mocks.uploadFileTus.mockReturnValue(
      new Promise<void>((resolve) => {
        pendingUpload.resolve = resolve;
      }),
    );
    const file = makeFile();
    await manager.enqueueVideoUpload({ lessonId: 'lesson-1', file, session: SESSION });

    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.uploadFileTus).toHaveBeenCalledTimes(1);
    const options = mocks.uploadFileTus.mock.calls[0][0];
    expect(options).toMatchObject({
      endpoint: SESSION.upload_url,
      headers: SESSION.tus_headers,
      file,
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);

    options.onProgress?.(4 * MB, 8 * MB);
    expect(manager.getSnapshot()).toEqual([
      expect.objectContaining({ stage: 'uploading', progress: 50 }),
    ]);

    pendingUpload.resolve?.();
    await vi.waitFor(() => {
      expect(manager.getSnapshot()).toEqual([]);
    });
    expect(localStorage.getItem('walid-upload-jobs')).toBe('[]');
  });

  it('marks the fallback job failed and keeps it when TUS throws', async () => {
    mocks.isSupported.mockReturnValue(false);
    mocks.uploadFileTus.mockRejectedValue(new Error('network down'));
    await manager.enqueueVideoUpload({ lessonId: 'lesson-1', file: makeFile(), session: SESSION });

    await vi.waitFor(() => {
      expect(manager.getSnapshot()).toEqual([
        expect.objectContaining({ stage: 'failed', error: 'فشل رفع الفيديو. حاول مرة أخرى' }),
      ]);
    });
    const stored = JSON.parse(localStorage.getItem('walid-upload-jobs') ?? '[]');
    expect(stored[0].stage).toBe('failed');
  });

  it('reconciles jobs finished while away on resumeOnLoad', async () => {
    mocks.isSupported.mockReturnValue(true);
    localStorage.setItem(
      'walid-upload-jobs',
      JSON.stringify([
        {
          jobId: 'job-1',
          lessonId: 'lesson-1',
          videoId: 'video-new-1',
          fileName: 'a.mp4',
          fileSize: 100,
          progress: 0,
          bytesSent: 0,
          bytesTotal: 100,
          stage: 'queued',
          error: null,
          createdAt: Date.now(),
        },
        {
          jobId: 'job-2',
          lessonId: 'lesson-1',
          videoId: 'video-old-1',
          fileName: 'b.mp4',
          fileSize: 100,
          progress: 10,
          bytesSent: 10,
          bytesTotal: 100,
          stage: 'uploading',
          error: null,
          createdAt: Date.now(),
        },
      ]),
    );
    mocks.sendMessage.mockResolvedValue({
      type: 'jobs-snapshot',
      jobs: [{ jobId: 'job-1', status: 'uploading', offset: 64 }],
    });

    vi.resetModules();
    const mod = await import('./uploadManager');
    manager = mod.uploadManager;

    await manager.resumeOnLoad();

    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'get-jobs' });
    const snapshot = manager.getSnapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot.find((job) => job.jobId === 'job-1')).toMatchObject({
      stage: 'uploading',
      bytesSent: 64,
      progress: 64,
    });
    expect(snapshot.find((job) => job.jobId === 'job-2')).toMatchObject({
      stage: 'done',
      progress: 100,
    });
  });

  it('subscribe fires with full snapshots and returns an unsubscribe', async () => {
    mocks.isSupported.mockReturnValue(true);
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);

    expect(listener).toHaveBeenCalledTimes(1);

    await manager.enqueueVideoUpload({ lessonId: 'lesson-1', file: makeFile(), session: SESSION });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0]).toEqual([
      expect.objectContaining({ jobId: 'job-1', stage: 'queued' }),
    ]);

    unsubscribe();
    sendSwMessage({ type: 'upload-progress', jobId: 'job-1', bytesSent: 1, bytesTotal: 2 });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});