import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getQueryCallCount,
  makeLesson,
  makeVideo,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

const VIDEO_EF_URL = 'https://test-project.supabase.co/functions/v1/create-video-upload-session';
const PLAYBACK_EF_URL = 'https://test-project.supabase.co/functions/v1/get-video-playback-url';
const THUMB_EF_URL = 'https://test-project.supabase.co/functions/v1/get-video-thumbnail-url';
const TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';
const MB = 1024 * 1024;

interface FakeTusInstance {
  file: unknown;
  options: {
    endpoint?: string;
    uploadUrl?: string;
    headers?: Record<string, string>;
    metadata?: Record<string, string>;
    chunkSize?: number;
    retryDelays?: number[];
    removeFingerprintOnSuccess?: boolean;
    onProgress?: (bytesSent: number, bytesTotal: number) => void;
    onSuccess?: () => void;
    onError?: (error: unknown) => void;
  };
  start: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
}

const { tusUploads } = vi.hoisted(() => ({
  tusUploads: [] as FakeTusInstance[],
}));

vi.mock('tus-js-client', () => {
  class FakeUpload {
    file: unknown;
    options: FakeTusInstance['options'];
    start: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;

    constructor(file: unknown, options: FakeTusInstance['options']) {
      this.file = file;
      this.options = options;
      this.start = vi.fn();
      this.abort = vi.fn(async () => undefined);
      tusUploads.push(this);
    }
  }
  return { Upload: FakeUpload };
});

function seedLesson() {
  mockState.lessons.push(
    makeLesson({
      id: 'lesson-1',
      unit_id: 'unit-1',
      title: 'الدرس الأول',
      status: 'published',
      published_at: '2026-06-01T00:00:00Z',
    }),
  );
}

function lastUpload(): FakeTusInstance {
  return tusUploads[tusUploads.length - 1];
}

function makeSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    video_id: 'video-new-1',
    bunny_video_id: 'bunny-video-new-1',
    upload_url: TUS_ENDPOINT,
    tus_headers: {
      AuthorizationSignature: 'sig-123',
      AuthorizationExpire: '2027-01-01T00:00:00Z',
      LibraryId: 'lib-1',
      VideoId: 'bunny-video-new-1',
    },
    metadata: { filetype: 'video/mp4', title: 'فيديو الدرس' },
    expires_in: 3600,
    ...overrides,
  };
}

function videoFile(): File {
  const file = new File(['fake-video-bytes'], 'درس.mp4', { type: 'video/mp4' });
  Object.defineProperty(file, 'size', { value: 16 * MB });
  return file;
}

function pickVideoFile() {
  fireEvent.change(screen.getByLabelText('اختيار ملف الفيديو'), {
    target: { files: [videoFile()] },
  });
}

async function fireProgress(instance: FakeTusInstance, bytesSent: number, bytesTotal: number) {
  await act(async () => {
    instance.options.onProgress?.(bytesSent, bytesTotal);
  });
}

async function fireSuccess(instance: FakeTusInstance) {
  await act(async () => {
    instance.options.onSuccess?.();
  });
}

async function fireError(instance: FakeTusInstance) {
  await act(async () => {
    instance.options.onError?.(new Error('network error'));
  });
}

describe('LessonAssetsPage — video section', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetMockState();
    setAuthenticatedWalid();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    tusUploads.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders the video list with all status badges, primary, duration and signed thumbnail', async () => {
    seedLesson();
    mockState.lessonVideos.push(
      makeVideo({ id: 'v-ready', status: 'ready', is_primary: true, duration_seconds: 125 }),
      makeVideo({ id: 'v-pending', status: 'pending_upload', is_primary: false }),
      makeVideo({ id: 'v-uploading', status: 'uploading', is_primary: false }),
      makeVideo({ id: 'v-processing', status: 'processing', is_primary: false }),
      makeVideo({
        id: 'v-failed',
        status: 'failed',
        is_primary: false,
        error_message: 'فشلت المعالجة بسبب خطأ داخلي',
      }),
      makeVideo({ id: 'v-replaced', status: 'replaced', is_primary: false }),
    );
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url) === `${THUMB_EF_URL}?video_id=v-ready`) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            thumbnail_url: 'https://vz.example.test/signed-thumb.jpg?token=HS256-1-abc',
            video_id: 'v-ready',
            lesson_id: 'lesson-1',
            expires_at: '2026-07-01T00:00:00Z',
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    renderApp('/walid/lessons/lesson-1');

    const readyRow = await screen.findByTestId('video-row-v-ready');
    expect(within(readyRow).getByText('جاهز')).toBeInTheDocument();
    expect(within(readyRow).getByText('الأساسي')).toBeInTheDocument();
    expect(within(readyRow).getByText(/المدة 02:05/)).toBeInTheDocument();
    expect(within(readyRow).getByRole('button', { name: 'معاينة' })).toBeInTheDocument();
    expect(within(readyRow).getByRole('button', { name: 'استبدال' })).toBeInTheDocument();
    expect(await within(readyRow).findByAltText('صورة مصغرة للفيديو')).toHaveAttribute(
      'src',
      'https://vz.example.test/signed-thumb.jpg?token=HS256-1-abc',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${THUMB_EF_URL}?video_id=v-ready`,
      expect.objectContaining({ method: 'GET' }),
    );

    expect(screen.getAllByText('قيد الرفع')).toHaveLength(2);
    expect(screen.getByText('قيد المعالجة')).toBeInTheDocument();
    expect(screen.getByText('مستبدل')).toBeInTheDocument();
    expect(screen.queryByAltText('صورة مصغرة للفيديو')).toBeInTheDocument();

    const failedRow = screen.getByTestId('video-row-v-failed');
    expect(within(failedRow).getByText('فشل')).toBeInTheDocument();
    expect(within(failedRow).getByText(/فشلت المعالجة بسبب خطأ داخلي/)).toBeInTheDocument();
    expect(within(failedRow).getByText(/حاول رفع الفيديو مرة أخرى/)).toBeInTheDocument();
    expect(within(failedRow).queryByRole('button', { name: 'معاينة' })).not.toBeInTheDocument();
    expect(within(failedRow).queryByRole('button', { name: 'استبدال' })).not.toBeInTheDocument();
    expect(within(failedRow).queryByAltText('صورة مصغرة للفيديو')).not.toBeInTheDocument();
  });

  it('hides the thumbnail when the signed-URL fetch fails', async () => {
    seedLesson();
    mockState.lessonVideos.push(makeVideo({ id: 'v-ready', status: 'ready', is_primary: true }));
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'access_denied', message: 'nope' } }),
    }));
    renderApp('/walid/lessons/lesson-1');

    const readyRow = await screen.findByTestId('video-row-v-ready');
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${THUMB_EF_URL}?video_id=v-ready`,
        expect.objectContaining({ method: 'GET' }),
      );
    });
    expect(within(readyRow).queryByAltText('صورة مصغرة للفيديو')).not.toBeInTheDocument();
  });

  it('shows an empty state when the lesson has no videos', async () => {
    seedLesson();
    renderApp('/walid/lessons/lesson-1');

    expect(await screen.findByText('لا توجد فيديوهات لهذا الدرس بعد')).toBeInTheDocument();
  });

  it('shows a loading state while the videos list is being fetched', async () => {
    seedLesson();
    const gateHandle: { release: (() => void) | null } = { release: null };
    mockState.queryGates['lesson_videos'] = new Promise<void>((resolve) => {
      gateHandle.release = () => resolve();
    });
    renderApp('/walid/lessons/lesson-1');

    expect(await screen.findByText('جاري تحميل الفيديوهات')).toBeInTheDocument();
    gateHandle.release?.();
    expect(await screen.findByText('لا توجد فيديوهات لهذا الدرس بعد')).toBeInTheDocument();
  });

  it('shows an error state when the videos query fails', async () => {
    seedLesson();
    mockState.queryErrors['lesson_videos'] = 'db unavailable';
    renderApp('/walid/lessons/lesson-1');

    expect(await screen.findByText('تعذر تحميل قائمة الفيديوهات')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });

  it('blocks a non-video file client-side without calling fetch', async () => {
    seedLesson();
    renderApp('/walid/lessons/lesson-1');
    await screen.findByText('لا توجد فيديوهات لهذا الدرس بعد');

    const badFile = new File(['x'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('اختيار ملف الفيديو'), { target: { files: [badFile] } });

    expect(
      await screen.findByText('يجب اختيار ملف فيديو بصيغة MP4 أو WebM أو MOV فقط'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks a video larger than 2 GiB client-side without calling fetch', async () => {
    seedLesson();
    renderApp('/walid/lessons/lesson-1');
    await screen.findByText('لا توجد فيديوهات لهذا الدرس بعد');

    const bigFile = new File(['x'], 'huge.mp4', { type: 'video/mp4' });
    Object.defineProperty(bigFile, 'size', { value: 2 * 1024 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByLabelText('اختيار ملف الفيديو'), { target: { files: [bigFile] } });

    expect(
      await screen.findByText('حجم الملف يتجاوز الحد المسموح (2 جيجابايت)'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads a new video end-to-end: session Edge Function, TUS upload with progress, then success', async () => {
    seedLesson();
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url) === VIDEO_EF_URL) {
        return { ok: true, status: 200, json: async () => makeSession() };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    renderApp('/walid/lessons/lesson-1');
    await screen.findByText('لا توجد فيديوهات لهذا الدرس بعد');

    pickVideoFile();
    expect(screen.getByText(/درس\.mp4/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'رفع الفيديو' }));

    await waitFor(() => {
      expect(tusUploads).toHaveLength(1);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      VIDEO_EF_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ lesson_id: 'lesson-1', mode: 'create' }),
      }),
    );

    const upload = lastUpload();
    expect(upload.start).toHaveBeenCalled();
    expect(upload.options.endpoint).toBe(TUS_ENDPOINT);
    expect(upload.options.headers).toEqual({
      AuthorizationSignature: 'sig-123',
      AuthorizationExpire: '2027-01-01T00:00:00Z',
      LibraryId: 'lib-1',
      VideoId: 'bunny-video-new-1',
    });
    expect(upload.options.metadata).toEqual({ filetype: 'video/mp4', title: 'فيديو الدرس' });
    expect(upload.options.chunkSize).toBe(8 * MB);
    expect(upload.options.retryDelays).toEqual([0, 1000, 3000, 5000]);
    expect(upload.options.removeFingerprintOnSuccess).toBe(true);

    await fireProgress(upload, 4 * MB, 8 * MB);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('جارٍ رفع الملف (50%)...')).toBeInTheDocument();
    expect(screen.getByText('4.0 م.ب من 8.0 م.ب')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء الرفع' })).toBeInTheDocument();

    mockState.lessonVideos.push(
      makeVideo({
        id: 'video-new-1',
        lesson_id: 'lesson-1',
        bunny_video_id: 'bunny-video-new-1',
        status: 'processing',
        is_primary: true,
      }),
    );
    await fireSuccess(upload);

    expect(screen.getAllByText('تم رفع الفيديو — جاري المعالجة').length).toBeGreaterThanOrEqual(1);
    const row = await screen.findByTestId('video-row-video-new-1');
    expect(within(row).getByText('قيد المعالجة')).toBeInTheDocument();
  });

  it('maps the lesson_has_pending_upload session error to Arabic and creates no TUS upload', async () => {
    seedLesson();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'lesson_has_pending_upload', message: 'busy' } }),
    });
    renderApp('/walid/lessons/lesson-1');
    await screen.findByText('لا توجد فيديوهات لهذا الدرس بعد');

    pickVideoFile();
    fireEvent.click(screen.getByRole('button', { name: 'رفع الفيديو' }));

    expect(await screen.findByText('يوجد رفع قيد التنفيذ بالفعل لهذا الدرس')).toBeInTheDocument();
    await waitFor(() => {
      expect(tusUploads).toHaveLength(0);
    });
  });

  it('sends the old video id when replacing an existing ready video', async () => {
    seedLesson();
    mockState.lessonVideos.push(makeVideo({ id: 'video-1', status: 'ready', is_primary: true }));
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url) === VIDEO_EF_URL) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            makeSession({ video_id: 'video-new-1', bunny_video_id: 'bunny-video-new-1' }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    renderApp('/walid/lessons/lesson-1');
    await screen.findByTestId('video-row-video-1');

    fireEvent.click(screen.getByRole('button', { name: 'استبدال' }));
    expect(screen.getByRole('dialog', { name: 'تأكيد استبدال الفيديو' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'متابعة الاستبدال' }));

    expect(screen.queryByRole('dialog', { name: 'تأكيد استبدال الفيديو' })).not.toBeInTheDocument();
    expect(screen.getByText('استبدال الفيديو الحالي بالفيديو المرفوع')).toBeInTheDocument();

    pickVideoFile();
    fireEvent.click(screen.getByRole('button', { name: 'رفع الفيديو' }));

    await waitFor(() => {
      expect(tusUploads).toHaveLength(1);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      VIDEO_EF_URL,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ lesson_id: 'lesson-1', mode: 'replace', old_video_id: 'video-1' }),
      }),
    );

    const upload = lastUpload();
    mockState.lessonVideos.push(
      makeVideo({
        id: 'video-new-1',
        lesson_id: 'lesson-1',
        bunny_video_id: 'bunny-video-new-1',
        status: 'processing',
        is_primary: true,
      }),
    );
    const oldRow = mockState.lessonVideos.find((video) => video.id === 'video-1');
    if (oldRow) {
      oldRow.status = 'replaced';
      oldRow.is_primary = false;
    }
    await fireSuccess(upload);

    expect(await screen.findByTestId('video-row-video-new-1')).toBeInTheDocument();
    expect(within(screen.getByTestId('video-row-video-1')).getByText('مستبدل')).toBeInTheDocument();
  });

  it('shows an error with a retry button after a TUS failure and resumes with the same session creds', async () => {
    seedLesson();
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url) === VIDEO_EF_URL) {
        return { ok: true, status: 200, json: async () => makeSession() };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    renderApp('/walid/lessons/lesson-1');
    await screen.findByText('لا توجد فيديوهات لهذا الدرس بعد');

    pickVideoFile();
    fireEvent.click(screen.getByRole('button', { name: 'رفع الفيديو' }));
    await waitFor(() => {
      expect(tusUploads).toHaveLength(1);
    });

    await fireError(lastUpload());
    expect(await screen.findByText('فشل رفع الفيديو. حاول مرة أخرى')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    await waitFor(() => {
      expect(tusUploads).toHaveLength(2);
    });
    const retryUpload = lastUpload();
    expect(retryUpload.options.uploadUrl).toBe(TUS_ENDPOINT);
    expect(retryUpload.options.endpoint).toBeUndefined();
    expect(retryUpload.options.headers).toEqual({
      AuthorizationSignature: 'sig-123',
      AuthorizationExpire: '2027-01-01T00:00:00Z',
      LibraryId: 'lib-1',
      VideoId: 'bunny-video-new-1',
    });
    expect(retryUpload.start).toHaveBeenCalled();
  });

  it('cancels an in-flight upload with an Arabic confirmation', async () => {
    seedLesson();
    const cancelBodies: unknown[] = [];
    fetchMock.mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === VIDEO_EF_URL) {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        if (body?.action === 'cancel') {
          cancelBodies.push(body);
          return { ok: true, status: 200, json: async () => ({ released: true }) };
        }
        return { ok: true, status: 200, json: async () => makeSession() };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    renderApp('/walid/lessons/lesson-1');
    await screen.findByText('لا توجد فيديوهات لهذا الدرس بعد');

    pickVideoFile();
    fireEvent.click(screen.getByRole('button', { name: 'رفع الفيديو' }));
    await waitFor(() => {
      expect(tusUploads).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'إلغاء الرفع' }));
    await waitFor(() => {
      expect(lastUpload().abort).toHaveBeenCalled();
    });
    expect(await screen.findByText('تم إلغاء الرفع')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'رفع فيديو جديد' })).toBeInTheDocument();
    expect(cancelBodies).toEqual([
      { action: 'cancel', lesson_id: 'lesson-1', video_id: 'video-new-1' },
    ]);
  });

  it('cancelling without a session (request failed) still resets the UI', async () => {
    seedLesson();
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'function_error', message: 'boom' } }),
    }));
    renderApp('/walid/lessons/lesson-1');
    await screen.findByText('لا توجد فيديوهات لهذا الدرس بعد');

    pickVideoFile();
    fireEvent.click(screen.getByRole('button', { name: 'رفع الفيديو' }));
    expect(await screen.findByText('تعذر تنفيذ العملية. حاول مرة أخرى')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(await screen.findByText('تم إلغاء الرفع')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'رفع فيديو جديد' })).toBeInTheDocument();
    expect(tusUploads).toHaveLength(0);
  });

  it('fetches a playback url and plays it in an inline modal player', async () => {
    seedLesson();
    mockState.lessonVideos.push(makeVideo({ id: 'video-1', status: 'ready', is_primary: true }));
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url) === `${PLAYBACK_EF_URL}?lesson_id=lesson-1`) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            playback_url: 'https://vz.example.test/playback/abc.mp4',
            video_id: 'video-1',
            lesson_id: 'lesson-1',
            expires_at: '2026-07-01T00:00:00Z',
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    renderApp('/walid/lessons/lesson-1');
    await screen.findByTestId('video-row-video-1');

    fireEvent.click(screen.getByRole('button', { name: 'معاينة' }));

    expect(await screen.findByRole('dialog', { name: 'معاينة الفيديو' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `${PLAYBACK_EF_URL}?lesson_id=lesson-1`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer test-access-token' }),
        body: undefined,
      }),
    );
    await waitFor(() => {
      const player = document.querySelector('video');
      expect(player).toHaveAttribute('src', 'https://vz.example.test/playback/abc.mp4');
    });
  });

  it('maps the video_not_ready playback error to Arabic', async () => {
    seedLesson();
    mockState.lessonVideos.push(makeVideo({ id: 'video-1', status: 'ready', is_primary: true }));
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'video_not_ready', message: 'not ready' } }),
    });
    renderApp('/walid/lessons/lesson-1');
    await screen.findByTestId('video-row-video-1');

    fireEvent.click(screen.getByRole('button', { name: 'معاينة' }));

    expect(await screen.findByText('الفيديو غير جاهز بعد')).toBeInTheDocument();
    expect(document.querySelector('video')).not.toBeInTheDocument();
  });

  it('refreshes the videos list when the refresh button is clicked', async () => {
    seedLesson();
    mockState.lessonVideos.push(makeVideo({ id: 'video-1', status: 'ready', is_primary: true }));
    renderApp('/walid/lessons/lesson-1');
    await screen.findByTestId('video-row-video-1');

    const before = getQueryCallCount('lesson_videos');
    fireEvent.click(screen.getByRole('button', { name: 'تحديث' }));

    await waitFor(() => {
      expect(getQueryCallCount('lesson_videos')).toBe(before + 1);
    });
  });

  it('polls the videos list every 4 seconds while a video is processing and stops once ready', async () => {
    vi.useFakeTimers();
    seedLesson();
    mockState.lessonVideos.push(
      makeVideo({ id: 'v-proc', status: 'processing', is_primary: true }),
    );
    renderApp('/walid/lessons/lesson-1');

    await act(async () => {});
    await act(async () => {});
    expect(screen.getByTestId('video-row-v-proc')).toBeInTheDocument();
    expect(getQueryCallCount('lesson_videos')).toBeGreaterThanOrEqual(1);

    const initial = getQueryCallCount('lesson_videos');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    await act(async () => {});
    expect(getQueryCallCount('lesson_videos')).toBe(initial + 1);

    mockState.lessonVideos[0].status = 'ready';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    await act(async () => {});
    const afterReady = getQueryCallCount('lesson_videos');
    expect(afterReady).toBe(initial + 2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    await act(async () => {});
    expect(getQueryCallCount('lesson_videos')).toBe(afterReady);
  });

  it('blocks students via the route guard', async () => {
    resetMockState();
    setAuthenticatedStudent();
    renderApp('/walid/lessons/lesson-1');

    expect(await screen.findByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
  });
});
