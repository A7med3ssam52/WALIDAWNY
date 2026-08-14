import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hlsMock = vi.hoisted(() => {
  const handlers: Array<{ event: string; cb: () => void }> = [];
  let supported = true;
  let constructed = 0;
  const HlsMock = function (this: {
    loadSource: ReturnType<typeof vi.fn>;
    attachMedia: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  }) {
    constructed += 1;
    this.loadSource = vi.fn();
    this.attachMedia = vi.fn();
    this.destroy = vi.fn();
    this.on = vi.fn((event: string, cb: () => void) => {
      handlers.push({ event, cb });
    });
  } as unknown as {
    new (): {
      loadSource: ReturnType<typeof vi.fn>;
      attachMedia: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
    };
    isSupported: () => boolean;
    Events: Record<string, string>;
  };
  return {
    handlers,
    HlsMock,
    trigger: (event: string) => {
      handlers.filter((entry) => entry.event === event).forEach((entry) => entry.cb());
    },
    setSupported: (value: boolean) => {
      supported = value;
    },
    isSupported: () => supported,
    constructed: () => constructed,
    reset: () => {
      handlers.length = 0;
      constructed = 0;
      supported = true;
    },
  };
});

vi.mock('hls.js', () => {
  hlsMock.HlsMock.isSupported = hlsMock.isSupported;
  hlsMock.HlsMock.Events = { MANIFEST_PARSED: 'MANIFEST_PARSED' };
  return { default: hlsMock.HlsMock };
});

import { VideoPlayer } from './VideoPlayer';

describe('VideoPlayer', () => {
  beforeEach(() => {
    hlsMock.reset();
  });

  it('loads the HLS source through hls.js when native HLS is unavailable', () => {
    render(<VideoPlayer src="https://vz.test/video/playlist.m3u8" />);
    expect(screen.getByTestId('lesson-video')).toBeInTheDocument();
    expect(hlsMock.constructed()).toBe(1);
  });

  it('seeks to the resume position once the manifest is parsed', () => {
    render(<VideoPlayer src="https://vz.test/video/playlist.m3u8" initialPosition={45} />);
    const video = screen.getByTestId('lesson-video') as HTMLVideoElement;
    hlsMock.trigger('MANIFEST_PARSED');
    expect(video.currentTime).toBe(45);
  });

  it('reports progress on timeupdate (position + percent)', () => {
    const onProgress = vi.fn();
    render(<VideoPlayer src="https://vz.test/video/playlist.m3u8" onProgress={onProgress} />);
    const video = screen.getByTestId('lesson-video') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 200, configurable: true });
    video.currentTime = 60;
    fireEvent.timeUpdate(video);
    expect(onProgress).toHaveBeenCalledWith(60, 30);
  });

  it('reports completion with 100% on ended', () => {
    const onProgress = vi.fn();
    const onComplete = vi.fn();
    render(
      <VideoPlayer
        src="https://vz.test/video/playlist.m3u8"
        onProgress={onProgress}
        onComplete={onComplete}
      />,
    );
    const video = screen.getByTestId('lesson-video') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 200, configurable: true });
    video.currentTime = 200;
    fireEvent.ended(video);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith(200, 100);
  });

  it('destroys the hls instance when the source changes', () => {
    const { rerender } = render(<VideoPlayer src="https://vz.test/a/playlist.m3u8" />);
    rerender(<VideoPlayer src="https://vz.test/b/playlist.m3u8" />);
    expect(hlsMock.constructed()).toBe(2);
  });

  it('shows the unsupported fallback when neither native HLS nor hls.js is available', () => {
    hlsMock.setSupported(false);
    render(<VideoPlayer src="https://vz.test/video/playlist.m3u8" />);
    expect(screen.queryByTestId('lesson-video')).not.toBeInTheDocument();
    expect(screen.getByText(/لا يدعم تشغيل الفيديو/)).toBeInTheDocument();
  });
});
