import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hlsMock = vi.hoisted(() => {
  const handlers: Array<{ event: string; cb: () => void }> = [];
  const sources: string[] = [];
  return {
    handlers,
    sources,
    HlsMock: function (this: {
      on: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      loadSource: ReturnType<typeof vi.fn>;
      attachMedia: ReturnType<typeof vi.fn>;
    }) {
      this.on = vi.fn((event: string, cb: () => void) => {
        handlers.push({ event, cb });
      });
      this.destroy = vi.fn();
      this.loadSource = vi.fn((src: string) => {
        sources.push(src);
      });
      this.attachMedia = vi.fn();
    } as unknown as {
      new (): {
        on: ReturnType<typeof vi.fn>;
        destroy: ReturnType<typeof vi.fn>;
        loadSource: ReturnType<typeof vi.fn>;
        attachMedia: ReturnType<typeof vi.fn>;
      };
    },
    trigger: (event: string) => {
      handlers.filter((entry) => entry.event === event).forEach((entry) => entry.cb());
    },
  };
});

vi.mock('hls.js', () => {
  const Hls = hlsMock.HlsMock as unknown as {
    new (): {
      on: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      loadSource: ReturnType<typeof vi.fn>;
      attachMedia: ReturnType<typeof vi.fn>;
    };
    isSupported: () => boolean;
    Events: Record<string, string>;
  };
  Hls.isSupported = () => true;
  Hls.Events = { MANIFEST_PARSED: 'MANIFEST_PARSED' };
  return { default: Hls };
});

import {
  expectRpcCall,
  makeGrade,
  makeLesson,
  makeNotification,
  makePdf,
  makeProgress,
  makeUnit,
  makeUnitCode,
  makeUnitPricing,
  makeUnitPurchase,
  makeVideo,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

const PLAYBACK_URL = 'https://vz.test/12345/playlist.m3u8?token=x';
const EXTRA_PLAYBACK_URL = 'https://vz.test/67890/playlist.m3u8?token=y';
const PDF_URL =
  'https://example.supabase.co/storage/v1/object/sign/pdfs/lesson-1/pdf-1.pdf?token=s';
const BOARD_URL_1 =
  'https://example.supabase.co/storage/v1/object/sign/boards/lesson-1/board-1.jpg?token=b1';
const BOARD_URL_2 =
  'https://example.supabase.co/storage/v1/object/sign/boards/lesson-1/board-2.jpg?token=b2';

function makeBoardSignedUrl(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    board_id: 'board-1',
    original_name: 'سبورة الدرس.jpg',
    sort_order: 1,
    signed_url: BOARD_URL_1,
    ...overrides,
  };
}

const DEFAULT_BOARDS = [
  makeBoardSignedUrl({
    board_id: 'board-2',
    original_name: 'سبورة ثانية.jpg',
    sort_order: 1,
    signed_url: BOARD_URL_2,
  }),
  makeBoardSignedUrl({
    board_id: 'board-1',
    original_name: 'سبورة أولى.jpg',
    sort_order: 2,
    signed_url: BOARD_URL_1,
  }),
];

function mockFunctions(
  options: { boards?: unknown[]; boardsFail?: boolean; failVideoId?: string; failCode?: string } = {},
) {
  const fetchMock = vi.fn();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
    const target = String(url);
    if (target.includes('/functions/v1/get-board-signed-urls')) {
      if (options.boardsFail) {
        return { ok: false, status: 500, json: async () => ({ error: { code: 'boards_failed' } }) };
      }
      return { ok: true, status: 200, json: async () => options.boards ?? DEFAULT_BOARDS };
    }
    if (target.includes('/functions/v1/get-video-playback-url')) {
      const videoId = new URL(target).searchParams.get('video_id');
      if (options.failVideoId && videoId === options.failVideoId) {
        return {
          ok: false,
          status: options.failCode === 'video_not_ready' ? 409 : 500,
          json: async () => ({ error: { code: options.failCode ?? 'playback_failed' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          playback_url: videoId === 'video-2' ? EXTRA_PLAYBACK_URL : PLAYBACK_URL,
          video_id: videoId ?? 'video-1',
          lesson_id: 'lesson-1',
        }),
      };
    }
    if (target.includes('/functions/v1/get-pdf-signed-url')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          pdf_url: PDF_URL,
          pdf_id: 'pdf-1',
          lesson_id: 'lesson-1',
          original_name: 'ملخص الدرس.pdf',
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function seedLessonPage() {
  mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
  mockState.units.push(
    makeUnit({ id: 'unit-1', grade_id: 'grade-1', name: 'الوحدة الأولى', status: 'published' }),
  );
  mockState.lessons.push(
    makeLesson({ id: 'lesson-1', unit_id: 'unit-1', title: 'الدرس الأول', status: 'published' }),
    makeLesson({
      id: 'lesson-2',
      unit_id: 'unit-1',
      title: 'الدرس الثاني',
      status: 'published',
      sort_order: 2,
    }),
    makeLesson({
      id: 'lesson-hidden',
      unit_id: 'unit-1',
      title: 'درس مخفي',
      status: 'hidden',
      sort_order: 3,
    }),
  );
  mockState.lessonVideos.push(
    makeVideo({ id: 'video-1', lesson_id: 'lesson-1', status: 'ready', is_primary: true }),
  );
  mockState.lessonPdfs.push(
    makePdf({ id: 'pdf-1', lesson_id: 'lesson-1', is_primary: true, is_ready: true }),
  );
  mockState.unitPricing.push(makeUnitPricing({ id: 'pricing-1', unit_id: 'unit-1' }));
  mockState.unitPurchases.push(makeUnitPurchase({ id: 'purchase-1', unit_id: 'unit-1' }));
}

describe('StudentLessonPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: 'grade-1' });
    hlsMock.handlers.length = 0;
    hlsMock.sources.length = 0;
  });

  it('renders the lesson with video and pdf (signed URLs)', async () => {
    const fetchMock = mockFunctions();
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByRole('heading', { name: 'الدرس الأول' })).toBeInTheDocument();
    expect(await screen.findByTestId('lesson-video')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes(
            '/functions/v1/get-video-playback-url?lesson_id=lesson-1&video_id=video-1',
          ),
        ),
      ).toBe(true);
    });
    expect(await screen.findByTestId('lesson-pdf-download')).toHaveTextContent('تحميل الملف');
    fireEvent.click(screen.getByTestId('lesson-pdf-toggle'));
    expect(screen.getByTestId('lesson-pdf-frame')).toHaveAttribute('src', PDF_URL);
  });

  it('downloads the pdf as a blob when the download button is clicked', async () => {
    const createObjectUrl = vi.fn(() => 'blob:mock-download');
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const fetchMock = mockFunctions();
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target === PDF_URL) {
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }),
        };
      }
      if (target.includes('/functions/v1/get-video-playback-url')) {
        const videoId = new URL(target).searchParams.get('video_id') ?? 'video-1';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            playback_url: PLAYBACK_URL,
            video_id: videoId,
            lesson_id: 'lesson-1',
          }),
        };
      }
      if (target.includes('/functions/v1/get-pdf-signed-url')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            pdf_url: PDF_URL,
            pdf_id: 'pdf-1',
            lesson_id: 'lesson-1',
            original_name: 'ملخص الدرس.pdf',
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    const download = await screen.findByTestId('lesson-pdf-download');
    fireEvent.click(download);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(PDF_URL);
    });
    await waitFor(() => {
      expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    });
    expect(clickSpy).toHaveBeenCalled();
    await waitFor(
      () => {
        expect(revokeObjectUrl).toHaveBeenCalledWith('blob:mock-download');
      },
      { timeout: 3000 },
    );

    clickSpy.mockRestore();
  });

  it('shows the unit name and previous/next lesson navigation', async () => {
    mockFunctions();
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByText('الوحدة الأولى')).toBeInTheDocument();
    expect(screen.queryByTestId('prev-lesson')).not.toBeInTheDocument();
    expect(await screen.findByTestId('next-lesson')).toHaveTextContent('الدرس الثاني');
  });

  it('resumes from the saved position once the manifest is parsed', async () => {
    mockFunctions();
    seedLessonPage();
    mockState.progress.push(
      makeProgress({ lesson_id: 'lesson-1', position_seconds: 45, percent_completed: 30 }),
    );
    renderApp('/student/lessons/lesson-1');

    const video = (await screen.findByTestId('lesson-video')) as HTMLVideoElement;
    await waitFor(() => {
      hlsMock.trigger('MANIFEST_PARSED');
      expect(video.currentTime).toBe(45);
    });
  });

  it('saves progress on timeupdate and shows the percent badge', async () => {
    mockFunctions();
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    const video = (await screen.findByTestId('lesson-video')) as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 200, configurable: true });
    video.currentTime = 60;
    fireEvent.timeUpdate(video);

    await waitFor(() => {
      expect(expectRpcCall('upsert_progress')).toEqual({
        p_lesson_id: 'lesson-1',
        p_position_seconds: 60,
        p_percent: 30,
      });
    });
    expect(await screen.findByTestId('lesson-percent-badge')).toHaveTextContent('30٪');
  });

  it('marks the lesson complete at 90%+ and shows the completed badge', async () => {
    mockFunctions();
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    const video = (await screen.findByTestId('lesson-video')) as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 100, configurable: true });
    video.currentTime = 100;
    fireEvent.timeUpdate(video);
    fireEvent.ended(video);

    expect(await screen.findByTestId('lesson-completed-badge')).toHaveTextContent('مكتمل');
    expect(expectRpcCall('upsert_progress')).toEqual({
      p_lesson_id: 'lesson-1',
      p_position_seconds: 100,
      p_percent: 100,
    });
  });

  it('does not save progress twice within the throttle window', async () => {
    mockFunctions();
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    const video = (await screen.findByTestId('lesson-video')) as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 200, configurable: true });
    video.currentTime = 10;
    fireEvent.timeUpdate(video);
    video.currentTime = 12;
    fireEvent.timeUpdate(video);

    await waitFor(() => expect(expectRpcCall('upsert_progress')).toBeTruthy());
    const calls = expectRpcCall('upsert_progress');
    expect(expectRpcCall('upsert_progress')).toEqual({
      p_lesson_id: 'lesson-1',
      p_position_seconds: 10,
      p_percent: 5,
    });
    void calls;
  });

  it('shows the access-denied card with the units link when playback is denied', async () => {
    const fetchMock = mockFunctions();
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes('/functions/v1/get-video-playback-url')) {
        return { ok: false, status: 403, json: async () => ({ error: { code: 'access_denied' } }) };
      }
      if (String(url).includes('/functions/v1/get-pdf-signed-url')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            pdf_url: PDF_URL,
            pdf_id: 'pdf-1',
            lesson_id: 'lesson-1',
            original_name: 'x.pdf',
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByText('هذا الدرس غير متاح حاليًا')).toBeInTheDocument();
    expect(screen.getByTestId('units-link')).toHaveAttribute('href', '/student/units');
  });

  it('shows the lock screen when the unit is not purchased', async () => {
    mockFunctions();
    seedLessonPage();
    mockState.unitPurchases = [];
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByText('هذه الوحدة غير مفعّلة')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تواصل عبر واتساب لتفعيل الوحدة' })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/201000000000'),
    );
    expect(screen.queryByTestId('lesson-video')).not.toBeInTheDocument();
  });

  it('unlocks the lesson after redeeming a valid unit code', async () => {
    mockFunctions();
    seedLessonPage();
    mockState.unitPurchases = [];
    mockState.unitCodes.push(makeUnitCode({ id: 'code-1', unit_id: 'unit-1' }));
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByText('هذه الوحدة غير مفعّلة')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('كود التفعيل'), {
      target: { value: 'wldn-abcd-efgh-jklm' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تفعيل' }));

    expect(expectRpcCall('redeem_unit_code')).toEqual({ p_code: 'wldn-abcd-efgh-jklm' });
    expect(await screen.findByTestId('lesson-video')).toBeInTheDocument();
  });

  it('shows a processing message when the video is not ready yet', async () => {
    const fetchMock = mockFunctions();
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes('/functions/v1/get-video-playback-url')) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: { code: 'video_not_ready' } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    expect(
      await screen.findByText('الفيديو قيد التجهيز، حاول مرة أخرى لاحقًا.'),
    ).toBeInTheDocument();
  });

  it('renders a youtube primary video with YouTubeEmbed without fetching playback', async () => {
    const fetchMock = mockFunctions();
    seedLessonPage();
    mockState.lessonVideos = [
      makeVideo({
        id: 'video-1',
        lesson_id: 'lesson-1',
        status: 'ready',
        is_primary: true,
        source: 'youtube',
        youtube_video_id: 'abc123XYZ',
        title: 'شرح أساسي',
      }),
    ];
    renderApp('/student/lessons/lesson-1');

    expect((await screen.findByTestId('youtube-embed')).getAttribute('src')).toContain(
      'https://www.youtube.com/embed/abc123XYZ',
    );
    expect(screen.queryByTestId('lesson-video')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('get-video-playback-url')),
    ).toHaveLength(0);
  });

  it('renders extra bunny videos with their own playback url', async () => {
    const fetchMock = mockFunctions();
    seedLessonPage();
    mockState.lessonVideos.push(
      makeVideo({
        id: 'video-2',
        lesson_id: 'lesson-1',
        status: 'ready',
        is_primary: false,
        bunny_video_id: 'bunny-video-2',
        title: 'فيديو إضافي',
      }),
    );
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByTestId('lesson-extra-videos')).toBeInTheDocument();
    expect(screen.getByText('محتوى الدرس')).toBeInTheDocument();
    // Course-style dropdown — playlist hidden until opened
    expect(screen.queryByText('فيديو إضافي')).not.toBeInTheDocument();
    expect(screen.queryByTestId('extra-video-list')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lesson-playlist-toggle'));
    expect(await screen.findByTestId('extra-video-list')).toBeInTheDocument();
    expect(screen.getByText('فيديو إضافي')).toBeInTheDocument();
    // Active video is primary initially — single player visible
    expect(await screen.findByTestId('lesson-video')).toBeInTheDocument();
    expect(screen.getAllByTestId('lesson-video')).toHaveLength(1);
    // Selecting the extra video switches the main player (course-style)
    fireEvent.click(screen.getByTestId('playlist-item-video-2'));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('video_id=video-2')),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(hlsMock.sources).toContain(EXTRA_PLAYBACK_URL);
    });
    expect(screen.getByTestId('playlist-item-video-2')).toHaveAttribute('aria-current', 'true');
  });

  it('renders extra youtube videos with YouTubeEmbed', async () => {
    mockFunctions();
    seedLessonPage();
    mockState.lessonVideos.push(
      makeVideo({
        id: 'video-3',
        lesson_id: 'lesson-1',
        status: 'ready',
        is_primary: false,
        source: 'youtube',
        youtube_video_id: 'dQw4w9WgXcQ',
        title: 'شرح يوتيوب',
      }),
    );
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByTestId('lesson-extra-videos')).toBeInTheDocument();
    // Extra videos are inside a course-style dropdown
    expect(screen.queryByText('شرح يوتيوب')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lesson-playlist-toggle'));
    expect(await screen.findByTestId('extra-video-list')).toBeInTheDocument();
    expect(screen.getByText('شرح يوتيوب')).toBeInTheDocument();
    // Initially primary bunny is playing — single player
    expect(await screen.findByTestId('lesson-video')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('playlist-item-video-3'));
    expect((await screen.findByTestId('youtube-embed')).getAttribute('src')).toContain(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
    expect(screen.queryByTestId('lesson-video')).not.toBeInTheDocument();
    expect(screen.getAllByText('يوتيوب').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('playlist-item-video-3')).toHaveTextContent('يوتيوب');
  });

  it('shows an inline error for a failed extra video while the primary keeps playing', async () => {
    mockFunctions({ failVideoId: 'video-2' });
    seedLessonPage();
    mockState.lessonVideos.push(
      makeVideo({ id: 'video-2', lesson_id: 'lesson-1', status: 'ready', is_primary: false }),
    );
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByTestId('lesson-extra-videos')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lesson-playlist-toggle'));
    expect(await screen.findByTestId('extra-video-list')).toBeInTheDocument();
    // Select the failing video — main player shows inline error (course-style single player)
    fireEvent.click(screen.getByTestId('playlist-item-video-2'));
    expect(
      await screen.findByText('تعذر تحميل الفيديو. حاول مرة أخرى لاحقاً.'),
    ).toBeInTheDocument();
    // Can switch back to primary and it still plays
    fireEvent.click(screen.getByTestId('playlist-item-video-1'));
    expect(await screen.findByTestId('lesson-video')).toBeInTheDocument();
    expect(screen.queryByText('تعذر تحميل الدرس')).not.toBeInTheDocument();
  });

  it('shows a processing message for an extra video that is not ready yet', async () => {
    mockFunctions({ failVideoId: 'video-2', failCode: 'video_not_ready' });
    seedLessonPage();
    mockState.lessonVideos.push(
      makeVideo({ id: 'video-2', lesson_id: 'lesson-1', status: 'ready', is_primary: false }),
    );
    renderApp('/student/lessons/lesson-1');

    fireEvent.click(await screen.findByTestId('lesson-playlist-toggle'));
    fireEvent.click(screen.getByTestId('playlist-item-video-2'));
    expect(await screen.findByTestId('video-not-ready')).toBeInTheDocument();
    expect(screen.getByText(/الفيديو قيد التجهيز/)).toBeInTheDocument();
    // Switch back to primary — primary still playable
    fireEvent.click(screen.getByTestId('playlist-item-video-1'));
    expect(await screen.findByTestId('lesson-video')).toBeInTheDocument();
  });

  it('hides the extra videos card when no extra videos exist', async () => {
    mockFunctions();
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByTestId('lesson-video')).toBeInTheDocument();
    expect(screen.queryByTestId('lesson-extra-videos')).not.toBeInTheDocument();
    expect(screen.queryByText('محتوى الدرس')).not.toBeInTheDocument();
  });

  it('shows an empty state when the lesson does not exist', async () => {
    mockFunctions();
    seedLessonPage();
    renderApp('/student/lessons/lesson-999');

    expect(await screen.findByText('الدرس غير موجود')).toBeInTheDocument();
  });

  it('does not render a video card for pdf-only lessons', async () => {
    mockFunctions();
    seedLessonPage();
    mockState.lessonVideos = [];
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByTestId('lesson-pdf-download')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lesson-pdf-toggle'));
    expect(screen.getByTestId('lesson-pdf-frame')).toBeInTheDocument();
    expect(screen.queryByTestId('lesson-video')).not.toBeInTheDocument();
  });

  it('ignores unrelated notifications on this page', async () => {
    mockFunctions();
    seedLessonPage();
    mockState.notifications.push(makeNotification());
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByRole('heading', { name: 'الدرس الأول' })).toBeInTheDocument();
    expect(screen.queryByText('درس جديد متاح')).not.toBeInTheDocument();
  });

  it('renders the board card with signed URL images when boards exist', async () => {
    mockFunctions();
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByTestId('board-grid')).toBeInTheDocument();
    expect(screen.getByText('سبورة الدرس')).toBeInTheDocument();
    expect(screen.getByTestId('board-image-board-1')).toHaveAttribute('src', BOARD_URL_1);
    expect(screen.getByTestId('board-image-board-1')).toHaveAttribute('alt', 'سبورة أولى.jpg');
    expect(screen.getByTestId('board-image-board-2')).toHaveAttribute('src', BOARD_URL_2);
    expect(screen.getByTestId('board-image-board-2')).toHaveAttribute('alt', 'سبورة ثانية.jpg');
  });

  it('renders board images in the order returned by the edge function (sort_order asc)', async () => {
    mockFunctions();
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    const images = await screen.findAllByTestId(/^board-image-/);
    expect(images.map((img) => img.getAttribute('data-testid'))).toEqual([
      'board-image-board-2',
      'board-image-board-1',
    ]);
  });

  it('does not render anything board-related when the lesson has no boards', async () => {
    mockFunctions({ boards: [] });
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByRole('heading', { name: 'الدرس الأول' })).toBeInTheDocument();
    expect(screen.queryByTestId('board-grid')).not.toBeInTheDocument();
    expect(screen.queryByText('سبورة الدرس')).not.toBeInTheDocument();
  });

  it('keeps the whole page working when the boards fetch fails (silent)', async () => {
    mockFunctions({ boardsFail: true });
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByTestId('lesson-video')).toBeInTheDocument();
    expect(await screen.findByTestId('lesson-pdf-download')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lesson-pdf-toggle'));
    expect(screen.getByTestId('lesson-pdf-frame')).toBeInTheDocument();
    expect(screen.queryByTestId('board-grid')).not.toBeInTheDocument();
    expect(screen.queryByText('سبورة الدرس')).not.toBeInTheDocument();
    expect(screen.queryByText('تعذر تحميل الدرس')).not.toBeInTheDocument();
  });
});
