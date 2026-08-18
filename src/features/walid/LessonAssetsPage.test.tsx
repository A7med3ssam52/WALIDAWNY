import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  expectRpcCall,
  getQueryCallCount,
  makeBoard,
  makeLesson,
  makeLessonComment,
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
const BOARD_EF_URL = 'https://test-project.supabase.co/functions/v1/upload-board';
const DELETE_BOARD_EF_URL = 'https://test-project.supabase.co/functions/v1/delete-board';
const BOARD_UPLOAD_URL = 'https://storage.test/boards/lesson-1/board-new-1.jpg';
const BOARD_URL_1 =
  'https://example.supabase.co/storage/v1/object/sign/boards/lesson-1/board-1.jpg?token=b1';
const BOARD_URL_2 =
  'https://example.supabase.co/storage/v1/object/sign/boards/lesson-1/board-2.jpg?token=b2';
const MB = 1024 * 1024;

function makeBoardSignedUrl(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    board_id: 'board-1',
    original_name: 'سبورة الدرس.jpg',
    sort_order: 1,
    signed_url: BOARD_URL_1,
    ...overrides,
  };
}

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

const hlsMocks = vi.hoisted(() => ({
  loadSource: vi.fn(),
  attachMedia: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock('hls.js', () => {
  class FakeHls {
    static isSupported() {
      return true;
    }

    static Events = { MANIFEST_PARSED: 'manifest-parsed' };

    loadSource = hlsMocks.loadSource;
    attachMedia = hlsMocks.attachMedia;
    destroy = hlsMocks.destroy;
    on() {}
  }
  return { default: FakeHls };
});

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
    hlsMocks.loadSource.mockClear();
    hlsMocks.attachMedia.mockClear();
    hlsMocks.destroy.mockClear();
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

    expect(screen.getByRole('button', { name: 'رفع فيديو جديد' })).toBeInTheDocument();
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
    expect(retryUpload.options.endpoint).toBe(TUS_ENDPOINT);
    expect(retryUpload.options.uploadUrl).toBeUndefined();
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
      expect(hlsMocks.loadSource).toHaveBeenCalledWith(
        'https://vz.example.test/playback/abc.mp4',
      );
      expect(hlsMocks.attachMedia).toHaveBeenCalled();
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

describe('LessonAssetsPage — comments moderation', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedWalid();
  });

  it('lists the lesson comments and deletes a comment as staff', async () => {
    seedLesson();
    mockState.lessonComments.push(
      makeLessonComment({
        id: 'comment-1',
        lesson_id: 'lesson-1',
        author_id: 'user-test-1',
        author_name: 'أحمد محمد',
        body: 'شرح ممتاز، شكرًا للأستاذ',
      }),
      makeLessonComment({
        id: 'comment-2',
        lesson_id: 'lesson-1',
        author_id: 'user-student-2',
        author_name: 'منى علي',
        body: 'هل يمكن إعادة الشرح؟',
        parent_id: 'comment-1',
      }),
    );
    renderApp('/walid/lessons/lesson-1');

    expect(await screen.findByTestId('staff-comment-comment-1')).toBeInTheDocument();
    expect(screen.getByText('شرح ممتاز، شكرًا للأستاذ')).toBeInTheDocument();
    expect(screen.getByText('منى علي')).toBeInTheDocument();
    expect(screen.getByText('رد')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('staff-comment-comment-1').querySelector('button')!);

    await waitFor(() => {
      expect(expectRpcCall('delete_lesson_comment')).toEqual({ p_comment_id: 'comment-1' });
    });
    expect(await screen.findByText('محذوف')).toBeInTheDocument();
  });

  it('shows an empty state when there are no comments', async () => {
    seedLesson();
    renderApp('/walid/lessons/lesson-1');

    expect(
      await screen.findByText('لا توجد تعليقات على هذا الدرس بعد'),
    ).toBeInTheDocument();
  });
});

describe('LessonAssetsPage — board section', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetMockState();
    setAuthenticatedWalid();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an empty state when the lesson has no boards', async () => {
    seedLesson();
    renderApp('/walid/lessons/lesson-1');

    expect(
      await screen.findByText('لا توجد صور سبورة لهذا الدرس بعد'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('board-upload-input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'رفع الصورة' })).toBeDisabled();
  });

  it('shows an error state when the boards query fails', async () => {
    seedLesson();
    mockState.queryErrors['lesson_boards'] = 'db unavailable';
    renderApp('/walid/lessons/lesson-1');

    expect(await screen.findByText('تعذر تحميل صور السبورة')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });

  it('renders board cards with images, badges and action buttons', async () => {
    seedLesson();
    mockState.lessonBoards.push(
      makeBoard({ id: 'board-1', original_name: 'سبورة أولى.jpg', sort_order: 1 }),
      makeBoard({
        id: 'board-2',
        original_name: 'سبورة ثانية.jpg',
        sort_order: 2,
        is_ready: false,
      }),
    );
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target.includes('/functions/v1/get-board-signed-urls')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            makeBoardSignedUrl({ board_id: 'board-1', original_name: 'سبورة أولى.jpg' }),
          ],
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    renderApp('/walid/lessons/lesson-1');

    const card1 = await screen.findByTestId('board-card-board-1');
    expect(within(card1).getByText('سبورة أولى.jpg')).toBeInTheDocument();
    expect(within(card1).getByText('200 ك.ب')).toBeInTheDocument();
    expect(within(card1).getByText('جاهز')).toBeInTheDocument();
    expect(within(card1).getByTestId('board-img-board-1')).toHaveAttribute(
      'src',
      BOARD_URL_1,
    );
    expect(within(card1).getByTestId('board-img-board-1')).toHaveAttribute(
      'alt',
      'سبورة أولى.jpg',
    );
    expect(within(card1).getByTestId('board-preview-board-1')).not.toBeDisabled();
    expect(within(card1).getByTestId('board-delete-board-1')).toBeInTheDocument();
    expect(within(card1).getByTestId('board-move-up-board-1')).toBeDisabled();
    expect(within(card1).getByTestId('board-move-down-board-1')).not.toBeDisabled();

    const card2 = await screen.findByTestId('board-card-board-2');
    expect(within(card2).getByText('سبورة ثانية.jpg')).toBeInTheDocument();
    expect(within(card2).getByText('قيد الرفع')).toBeInTheDocument();
    expect(within(card2).getByTestId('board-img-board-2')).not.toHaveAttribute('src');
    expect(within(card2).getByTestId('board-preview-board-2')).toBeDisabled();
    expect(within(card2).getByTestId('board-move-up-board-2')).not.toBeDisabled();
    expect(within(card2).getByTestId('board-move-down-board-2')).toBeDisabled();
  });

  it('blocks a non-image file client-side without calling fetch', async () => {
    seedLesson();
    renderApp('/walid/lessons/lesson-1');
    await screen.findByText('لا توجد صور سبورة لهذا الدرس بعد');

    const badFile = new File(['x'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('board-upload-input'), {
      target: { files: [badFile] },
    });

    expect(
      await screen.findByText('يجب اختيار صورة بصيغة JPG أو PNG أو WebP فقط'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks a board image larger than 10 MiB client-side without calling fetch', async () => {
    seedLesson();
    renderApp('/walid/lessons/lesson-1');
    await screen.findByText('لا توجد صور سبورة لهذا الدرس بعد');

    const bigFile = new File(['x'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(bigFile, 'size', { value: 10 * MB + 1 });
    fireEvent.change(screen.getByTestId('board-upload-input'), {
      target: { files: [bigFile] },
    });

    expect(
      await screen.findByText('حجم الصورة يتجاوز الحد المسموح (10 ميجابايت)'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads a board image end-to-end: session EF, PUT bytes, finalize RPC and success toast', async () => {
    seedLesson();
    mockState.lessonBoards.push(
      makeBoard({
        id: 'board-new-1',
        lesson_id: 'lesson-1',
        original_name: 'سبورة جديدة.jpg',
        is_ready: false,
      }),
    );
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target.includes('/functions/v1/upload-board')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            uploadUrl: BOARD_UPLOAD_URL,
            board_id: 'board-new-1',
            storage_path: 'lesson-1/board-new-1.jpg',
            expires_in: 3600,
          }),
        };
      }
      if (target.includes('/functions/v1/get-board-signed-urls')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            makeBoardSignedUrl({
              board_id: 'board-new-1',
              original_name: 'سبورة جديدة.jpg',
              signed_url: BOARD_URL_1,
            }),
          ],
        };
      }
      if (target === BOARD_UPLOAD_URL) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    renderApp('/walid/lessons/lesson-1');
    await screen.findByTestId('board-card-board-new-1');

    const imageFile = new File(['fake-jpeg-bytes'], 'سبورة جديدة.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('board-upload-input'), {
      target: { files: [imageFile] },
    });
    expect(screen.getByText(/سبورة جديدة\.jpg —/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('board-upload-button'));

    await waitFor(() => {
      expect(expectRpcCall('finalize_board_upload')).toEqual({ p_board_id: 'board-new-1' });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      BOARD_EF_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-access-token' }),
        body: JSON.stringify({
          lesson_id: 'lesson-1',
          file_name: 'سبورة جديدة.jpg',
          file_size: 15,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      BOARD_UPLOAD_URL,
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(await screen.findByText('تم رفع الصورة بنجاح')).toBeInTheDocument();
    const uploadedCard = await screen.findByTestId('board-card-board-new-1');
    expect(within(uploadedCard).getByText('جاهز')).toBeInTheDocument();
  });

  it('deletes a board after confirmation and removes it from the list', async () => {
    seedLesson();
    mockState.lessonBoards.push(
      makeBoard({ id: 'board-1', original_name: 'سبورة أولى.jpg', sort_order: 1 }),
    );
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target.includes('/functions/v1/get-board-signed-urls')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            makeBoardSignedUrl({ board_id: 'board-1', original_name: 'سبورة أولى.jpg' }),
          ],
        };
      }
      if (target.includes('/functions/v1/delete-board')) {
        const row = mockState.lessonBoards.find((board) => board.id === 'board-1');
        if (row) {
          row.deleted_at = '2026-08-18T00:00:00.000Z';
        }
        return { ok: true, status: 200, json: async () => ({ deleted: true }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    renderApp('/walid/lessons/lesson-1');
    await screen.findByTestId('board-card-board-1');

    fireEvent.click(screen.getByTestId('board-delete-board-1'));
    expect(screen.getByRole('dialog', { name: 'تأكيد حذف الصورة' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'حذف الصورة' }));

    expect(await screen.findByText('تم حذف الصورة')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId('board-card-board-1')).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      DELETE_BOARD_EF_URL,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ lesson_id: 'lesson-1', board_id: 'board-1' }),
      }),
    );
  });

  it('reorders boards with the arrow buttons and disables edge buttons', async () => {
    seedLesson();
    mockState.lessonBoards.push(
      makeBoard({ id: 'board-1', original_name: 'سبورة أولى.jpg', sort_order: 1 }),
      makeBoard({ id: 'board-2', original_name: 'سبورة ثانية.jpg', sort_order: 2 }),
    );
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target.includes('/functions/v1/get-board-signed-urls')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            makeBoardSignedUrl({ board_id: 'board-1', original_name: 'سبورة أولى.jpg' }),
            makeBoardSignedUrl({
              board_id: 'board-2',
              original_name: 'سبورة ثانية.jpg',
              sort_order: 2,
              signed_url: BOARD_URL_2,
            }),
          ],
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    renderApp('/walid/lessons/lesson-1');
    await screen.findByTestId('board-card-board-1');
    await screen.findByTestId('board-card-board-2');

    expect(screen.getByTestId('board-move-up-board-1')).toBeDisabled();
    expect(screen.getByTestId('board-move-down-board-2')).toBeDisabled();

    fireEvent.click(screen.getByTestId('board-move-up-board-2'));

    await waitFor(() => {
      expect(expectRpcCall('reorder_boards')).toEqual({
        p_lesson_id: 'lesson-1',
        p_board_ids: ['board-2', 'board-1'],
      });
    });
    await waitFor(() => {
      const cards = screen.getAllByTestId(/^board-card-/);
      expect(cards[0]).toHaveAttribute('data-testid', 'board-card-board-2');
      expect(cards[1]).toHaveAttribute('data-testid', 'board-card-board-1');
    });
  });

  it('opens a preview modal showing the full image', async () => {
    seedLesson();
    mockState.lessonBoards.push(
      makeBoard({ id: 'board-1', original_name: 'سبورة أولى.jpg', sort_order: 1 }),
    );
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target.includes('/functions/v1/get-board-signed-urls')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            makeBoardSignedUrl({ board_id: 'board-1', original_name: 'سبورة أولى.jpg' }),
          ],
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    renderApp('/walid/lessons/lesson-1');
    await screen.findByTestId('board-card-board-1');

    fireEvent.click(screen.getByTestId('board-preview-board-1'));

    expect(await screen.findByRole('dialog', { name: 'معاينة الصورة' })).toBeInTheDocument();
    const modalContent = screen.getByTestId('board-preview-modal');
    expect(within(modalContent).getByRole('img')).toHaveAttribute('src', BOARD_URL_1);
    expect(within(modalContent).getByRole('img')).toHaveAttribute('alt', 'سبورة أولى.jpg');
  });
});
