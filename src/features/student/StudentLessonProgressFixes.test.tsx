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
  getRpcCalls,
  makeExam,
  makeExamQuestion,
  makeGrade,
  makeLesson,
  makePdf,
  makeProgress,
  makeUnit,
  makeUnitPurchase,
  makeVideo,
  mockRpcError,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';
import { extractLessonId } from './usePresenceHeartbeat';

const PLAYBACK_URL = 'https://vz.test/12345/playlist.m3u8?token=x';
const PDF_URL = 'https://example.supabase.co/storage/v1/object/sign/pdfs/lesson-1/pdf-1.pdf?token=s';

function mockFunctions() {
  const fetchMock = vi.fn();
  fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
    const target = String(url);
    if (target.includes('/functions/v1/get-board-signed-urls')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (target.includes('/functions/v1/get-video-playback-url')) {
      const videoId = new URL(target).searchParams.get('video_id') ?? 'video-1';
      return {
        ok: true,
        status: 200,
        json: async () => ({ playback_url: PLAYBACK_URL, video_id: videoId, lesson_id: 'lesson-1' }),
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

function seedBasic() {
  mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
  mockState.units.push(
    makeUnit({ id: 'unit-1', grade_id: 'grade-1', name: 'الوحدة الأولى', status: 'published' }),
  );
  mockState.lessons.push(
    makeLesson({ id: 'lesson-1', unit_id: 'unit-1', title: 'الدرس الأول', status: 'published' }),
  );
  mockState.lessonVideos.push(
    makeVideo({ id: 'video-1', lesson_id: 'lesson-1', status: 'ready', is_primary: true }),
  );
  mockState.lessonPdfs.push(
    makePdf({ id: 'pdf-1', lesson_id: 'lesson-1', is_primary: true, is_ready: true }),
  );
  mockState.unitPurchases.push(makeUnitPurchase({ id: 'purchase-1', unit_id: 'unit-1' }));
}

describe('Lesson-17 progress fixes', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: 'grade-1' });
    hlsMock.handlers.length = 0;
    hlsMock.sources.length = 0;
    vi.unstubAllGlobals();
  });

  it('secondary video progress is ignored (primary-only policy)', async () => {
    mockFunctions();
    seedBasic();
    mockState.lessonVideos.push(
      makeVideo({ id: 'video-2', lesson_id: 'lesson-1', status: 'ready', is_primary: false, title: 'إضافي' }),
    );
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByTestId('lesson-video')).toBeInTheDocument();
    fireEvent.click(await screen.findByTestId('lesson-playlist-toggle'));
    fireEvent.click(screen.getByTestId('playlist-item-video-2'));

    // Secondary player renders but carries NO progress handlers: timeupdate saves nothing.
    const secondary = await screen.findByTestId('lesson-video');
    Object.defineProperty(secondary, 'duration', { value: 200, configurable: true });
    (secondary as HTMLVideoElement).currentTime = 100;
    fireEvent.timeUpdate(secondary);

    await new Promise((r) => setTimeout(r, 300));
    const upserts = getRpcCalls().filter((c) => c.fn === 'upsert_progress');
    expect(upserts).toHaveLength(0);
  }, 20000);

  it('primary video progress is still saved', async () => {
    mockFunctions();
    seedBasic();
    mockState.lessonVideos.push(
      makeVideo({ id: 'video-2', lesson_id: 'lesson-1', status: 'ready', is_primary: false }),
    );
    renderApp('/student/lessons/lesson-1');

    const video = (await screen.findByTestId('lesson-video')) as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 200, configurable: true });
    video.currentTime = 60;
    fireEvent.timeUpdate(video);

    await waitFor(() => expect(expectRpcCall('upsert_progress')).toBeTruthy());
    expect(expectRpcCall('upsert_progress')).toEqual({
      p_lesson_id: 'lesson-1',
      p_position_seconds: 60,
      p_percent: 30,
    });
  }, 20000);

  it('100% completion bypasses the throttle (race fix)', async () => {
    mockFunctions();
    seedBasic();
    renderApp('/student/lessons/lesson-1');

    const video = (await screen.findByTestId('lesson-video')) as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 200, configurable: true });
    video.currentTime = 20;
    fireEvent.timeUpdate(video);
    // Immediate end — even within the 5s window the 100% must still save.
    Object.defineProperty(video, 'duration', { value: 100, configurable: true });
    video.currentTime = 100;
    fireEvent.ended(video);

    await waitFor(() => {
      const calls = getRpcCalls().filter((c) => c.fn === 'upsert_progress');
      expect(calls.some((c) => (c.args as { p_percent: number }).p_percent === 100)).toBe(true);
    });
    expect(await screen.findByTestId('lesson-completed-badge')).toBeInTheDocument();
  }, 20000);

  it('opening the PDF preview records engagement (10%, no auto-complete)', async () => {
    mockFunctions();
    seedBasic();
    renderApp('/student/lessons/lesson-1');

    expect(await screen.findByTestId('lesson-pdf-download')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lesson-pdf-toggle'));
    expect(await screen.findByTestId('lesson-pdf-frame')).toBeInTheDocument();

    await waitFor(() => expect(expectRpcCall('upsert_progress')).toBeTruthy());
    expect(expectRpcCall('upsert_progress')).toEqual({
      p_lesson_id: 'lesson-1',
      p_position_seconds: 0,
      p_percent: 10,
    });
    expect(screen.queryByTestId('lesson-completed-badge')).not.toBeInTheDocument();
  }, 20000);

  it('successful exam submit auto-completes the lesson (source=exam)', async () => {
    mockFunctions();
    seedBasic();
    mockState.exams.push(makeExam({ id: 'exam-1', lesson_id: 'lesson-1' }));
    mockState.examQuestions.push(
      makeExamQuestion({
        id: 'question-1',
        exam_id: 'exam-1',
        type: 'mcq',
        choices: ['القاهرة', 'الإسكندرية'],
        correct_index: 0,
        sort_order: 1,
      }),
    );
    renderApp('/student/lessons/lesson-1');
    await screen.findByRole('heading', { name: 'الدرس الأول' });

    fireEvent.click(await screen.findByTestId('lesson-tab-exams'));
    expect(await screen.findByTestId('exam-card-exam-1')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('القاهرة'));
    fireEvent.click(screen.getByTestId('exam-submit-exam-1'));

    await waitFor(() => expect(expectRpcCall('submit_exam_attempt')).toBeTruthy());
    await waitFor(() => expect(expectRpcCall('toggle_lesson_completed')).toEqual({
      p_lesson_id: 'lesson-1',
      p_completed: true,
      p_source: 'exam',
    }));
    expect(await screen.findByTestId('lesson-completed-badge')).toBeInTheDocument();
  }, 25000);

  it('unmarking lowers percent below 90 and clears completion (no instant re-complete)', async () => {
    mockFunctions();
    seedBasic();
    mockState.progress.push(
      makeProgress({ lesson_id: 'lesson-1', is_completed: true, percent_completed: 100, position_seconds: 90 }),
    );
    renderApp('/student/lessons/lesson-1');

    const btn = await screen.findByTestId('toggle-complete-btn');
    expect(btn).toHaveTextContent('إلغاء الإكمال');
    fireEvent.click(btn);

    await waitFor(() => expect(expectRpcCall('toggle_lesson_completed')).toEqual({
      p_lesson_id: 'lesson-1',
      p_completed: false,
      p_source: 'manual',
    }));
    await waitFor(() => expect(screen.getByTestId('toggle-complete-btn')).toHaveTextContent('وضع علامة مكتمل'));
    expect(screen.queryByTestId('lesson-completed-badge')).not.toBeInTheDocument();
    // Mock mirrors 0072: percent lowered to <=89 + completed_at cleared.
    const row = mockState.progress.find((p) => p.lesson_id === 'lesson-1');
    expect(Number(row?.percent_completed)).toBeLessThanOrEqual(89);
    expect(row?.completed_at).toBeNull();
  }, 20000);

  it('stale-video error shows a non-blocking hint and keeps playback', async () => {
    mockFunctions();
    seedBasic();
    mockRpcError('upsert_progress', 'progress_stale_video');
    renderApp('/student/lessons/lesson-1');

    const video = (await screen.findByTestId('lesson-video')) as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 200, configurable: true });
    video.currentTime = 60;
    fireEvent.timeUpdate(video);

    expect(await screen.findByText(/حدّث الصفحة لمزامنة تقدمك/)).toBeInTheDocument();
    // Playback is never blocked by progress errors.
    expect(screen.getByTestId('lesson-video')).toBeInTheDocument();
  }, 20000);

  it('secondary YouTube without tracking shows the manual-only reminder', async () => {
    const { YouTubeEmbed } = await import('../../components/YouTubeEmbed');
    const { render } = await import('@testing-library/react');
    render(<YouTubeEmbed videoId="dQw4w9WgXcQ" />);
    expect(screen.getByTestId('youtube-manual-hint')).toHaveTextContent(/وضع علامة مكتمل/);
  });

  it('primary YouTube polls the IFrame API into the same saveProgress path', async () => {
    mockFunctions();
    seedBasic();
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
    const stateHandlers: Array<(e: { data: number }) => void> = [];
    const win = window as unknown as Record<string, unknown>;
    win.YT = {
      Player: function (this: unknown, _id: string, opts: { events?: { onStateChange?: (e: { data: number }) => void } }) {
        if (opts.events?.onStateChange) stateHandlers.push(opts.events.onStateChange);
        return { getCurrentTime: () => 50, getDuration: () => 100, destroy: () => undefined };
      },
    };
    try {
      renderApp('/student/lessons/lesson-1');
      expect(await screen.findByTestId('youtube-embed')).toBeInTheDocument();
      // Simulate PLAYING state -> immediate poll sample (50/100 = 50%).
      await waitFor(() => expect(stateHandlers.length).toBeGreaterThan(0));
      stateHandlers.forEach((h) => h({ data: 1 }));
      await waitFor(() => expect(expectRpcCall('upsert_progress')).toEqual({
        p_lesson_id: 'lesson-1',
        p_position_seconds: 50,
        p_percent: 50,
      }));
    } finally {
      delete win.YT;
    }
  }, 20000);

  it('extractLessonId is tolerant (uuid, slug, query, trailing slash)', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(extractLessonId(`/student/lessons/${uuid}`)).toBe(uuid);
    expect(extractLessonId(`/student/lessons/${uuid}?x=1`)).toBe(uuid);
    expect(extractLessonId('/student/lessons/my-lesson-slug')).toBe('my-lesson-slug');
    expect(extractLessonId('/student/lessons/my-lesson-slug/')).toBe('my-lesson-slug');
    expect(extractLessonId('/student/dashboard')).toBeNull();
    expect(extractLessonId('/student/lessons/')).toBeNull();
  });
});
