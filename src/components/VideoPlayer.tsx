import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';

import { ErrorState } from './ErrorState';

export interface VideoPlayerProps {
  src: string;
  initialPosition?: number;
  onProgress?: (position: number, percent: number) => void;
  onComplete?: () => void;
  poster?: string;
}

/**
 * HLS video player. Uses the native HLS support (Safari/Edge) when
 * available; otherwise hls.js (Chromium/Firefox). Falls back to a plain
 * message when neither is available.
 * Note: hls.js is code-split via manualChunks + lazy StudentLessonPage route,
 * so Landing bundle never includes it.
 */
export function VideoPlayer({
  src,
  initialPosition = 0,
  onProgress,
  onComplete,
  poster,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const resumeAppliedRef = useRef(false);
  const [unsupported, setUnsupported] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const onProgressRef = useRef(onProgress);
  const onCompleteRef = useRef(onComplete);
  const initialPositionRef = useRef(initialPosition);
  onProgressRef.current = onProgress;
  onCompleteRef.current = onComplete;
  initialPositionRef.current = initialPosition;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    hlsRef.current?.destroy();
    hlsRef.current = null;
    resumeAppliedRef.current = false;
    setUnsupported(false);

    const canPlayHlsNative = video.canPlayType('application/vnd.apple.mpegurl') !== '';

    if (canPlayHlsNative) {
      video.src = src;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!resumeAppliedRef.current && initialPositionRef.current > 0) {
          video.currentTime = initialPositionRef.current;
          resumeAppliedRef.current = true;
        }
        try {
          void video.play().catch(() => {
            // autoplay may be blocked; the user can press play manually
          });
        } catch {
          // environments without media playback (e.g. tests) — ignore
        }
      });
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    setUnsupported(true);
    return undefined;
  }, [src]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const percent = duration > 0 ? Math.min(100, (video.currentTime / duration) * 100) : 0;
    onProgressRef.current?.(Math.floor(video.currentTime), Math.round(percent));
  };

  const handleEnded = () => {
    const video = videoRef.current;
    const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
    onProgressRef.current?.(Math.floor(video?.currentTime ?? duration), 100);
    onCompleteRef.current?.();
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (!resumeAppliedRef.current && initialPositionRef.current > 0) {
      video.currentTime = initialPositionRef.current;
      resumeAppliedRef.current = true;
    }
  };

  if (unsupported) {
    return (
      <div className="glass-card overflow-hidden rounded-2xl border-white/15 p-1.5">
        <ErrorState message="متصفحك لا يدعم تشغيل الفيديو (HLS). جرّب متصفحًا أحدث مثل Chrome أو Safari." />
      </div>
    );
  }

  return (
    <div
      className="glass-card relative overflow-hidden rounded-2xl border-white/15 p-1.5"
      data-testid="lesson-video-frame"
    >
      <div className="relative overflow-hidden rounded-xl">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="auto"
          poster={poster}
          className="aspect-video w-full bg-gradient-to-br from-indigo-950 via-[#312e81] to-violet-950"
          data-testid="lesson-video"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onLoadedMetadata={handleLoadedMetadata}
          onPause={handleTimeUpdate}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onCanPlay={() => setIsBuffering(false)}
          onLoadedData={() => setIsBuffering(false)}
        />
        {isBuffering ? (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-indigo-950/50"
          >
            <span
              aria-hidden="true"
              className="h-11 w-11 animate-spin rounded-full border-[3px] border-white/25 border-t-white"
            />
            <span className="rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold tracking-wide text-white/90">
              جاري تحميل الفيديو
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
