import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hlsMock = vi.hoisted(() => {
  const handlers: Array<{ event: string; cb: () => void }> = [];
  return {
    handlers,
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
      this.loadSource = vi.fn();
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
const PDF_URL =
  'https://example.supabase.co/storage/v1/object/sign/pdfs/lesson-1/pdf-1.pdf?token=s';

function mockFunctions() {
  const fetchMock = vi.fn();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
    const target = String(url);
    if (target.includes('/functions/v1/get-video-playback-url')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          playback_url: PLAYBACK_URL,
          video_id: 'video-1',
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
  });

  it('renders the lesson with video and pdf (signed URLs)', async () => {
    mockFunctions();
    seedLessonPage();
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByRole('heading', { name: 'الدرس الأول' })).toBeInTheDocument();
    expect(await screen.findByTestId('lesson-video')).toBeInTheDocument();
    expect(screen.getByTestId('lesson-pdf-frame')).toHaveAttribute('src', PDF_URL);
    expect(screen.getByTestId('lesson-pdf-download')).toHaveAttribute('download', 'ملخص الدرس.pdf');
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
    hlsMock.trigger('MANIFEST_PARSED');
    expect(video.currentTime).toBe(45);
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

    expect(await screen.findByTestId('lesson-pdf-frame')).toBeInTheDocument();
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
});
