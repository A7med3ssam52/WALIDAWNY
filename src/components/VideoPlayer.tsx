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
  // Pinned once per src: later progress-state updates must NOT rewind
  // playback mid-watch (fix #13 — ثبت initialPositionRef).
  const initialPositionRef = useRef(initialPosition);
  const pinnedSrcRef = useRef<string | null>(null);
  onProgressRef.current = onProgress;
  onCompleteRef.current = onComplete;
  if (pinnedSrcRef.current !== src) {
    pinnedSrcRef.current = src;
    initialPositionRef.current = initialPosition;
    resumeAppliedRef.current = false;
  }

  // E-11 / R-10 — guard ضد src غير صالح (undefined/"undefined"/فارغ) لمنع hls.loadSource("") والـ buffering العالق
  const isValidSrc =
    typeof src === 'string' &&
    src.trim() !== '' &&
    src !== 'undefined' &&
    src !== 'null' &&
    src.trim().toLowerCase() !== 'undefined';

  useEffect(() => {
    if (!isValidSrc) {
      setUnsupported(false);
      setIsBuffering(false);
      return;
    }
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
  }, [src, isValidSrc]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const percent = duration > 0 ? Math.min(100, (video.currentTime / duration) * 100) : 0;
    onProgressRef.current?.(Math.floor(video.currentTime), Math.round(percent));
  };

  // Single completion path (fix #4): onEnded routes ONLY through
  // onComplete (which saves 100%). No duplicate onProgress(100) here —
  // that caused a double-save race with the trailing timeupdate.
  const handleEnded = () => {
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

  // عرض ErrorState بدل محاولة التحميل عند src غير صالح — يمنع hls.loadSource("") نهائيًا
  if (!isValidSrc) {
    return (
      <div className="glass-card relative overflow-hidden rounded-[20px] p-1.5">
        <ErrorState message="تعذر تحميل الفيديو — رابط غير صالح" />
      </div>
    );
  }

  if (unsupported) {
    return (
      <div className="glass-card relative overflow-hidden rounded-[20px] p-1.5">
        <ErrorState message="متصفحك لا يدعم تشغيل الفيديو (HLS). جرّب متصفحًا أحدث مثل Chrome أو Safari." />
      </div>
    );
  }

  return (
    <div
      className="glass-card relative overflow-hidden rounded-[20px] p-1.5"
      data-testid="lesson-video-frame"
    >
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="auto"
          poster={poster}
          className="aspect-video w-full bg-transparent"
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
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[rgb(16_24_40/0.55)]"
          >
            <span aria-hidden="true" className="relative flex h-12 w-12 items-center justify-center">
              <span className="absolute inset-0 rounded-full border border-white/20" />
              <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-white animate-spin" />
              <span className="h-2 w-2 rounded-full bg-white" />
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-bold tracking-wide text-white">
              جاري تحميل الفيديو
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
