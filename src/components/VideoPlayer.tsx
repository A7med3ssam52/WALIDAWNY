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

  // عرض ErrorState بدل محاولة التحميل عند src غير صالح — يمنع hls.loadSource("") نهائيًا
  if (!isValidSrc) {
    return (
      <div className="glass-card conic-ring spotlight-card relative overflow-hidden rounded-2xl border-white/15 p-1.5 shadow-[0_0_40px_-12px_rgba(129,140,248,0.35)]">
        <ErrorState message="تعذر تحميل الفيديو — رابط غير صالح" />
      </div>
    );
  }

  if (unsupported) {
    return (
      <div className="glass-card conic-ring spotlight-card relative overflow-hidden rounded-2xl border-white/15 p-1.5 shadow-[0_0_40px_-12px_rgba(129,140,248,0.35)]">
        <ErrorState message="متصفحك لا يدعم تشغيل الفيديو (HLS). جرّب متصفحًا أحدث مثل Chrome أو Safari." />
      </div>
    );
  }

  return (
    <div
      className="glass-card conic-ring spotlight-card group relative overflow-hidden rounded-2xl border-white/15 p-1.5 shadow-[0_0_40px_-12px_rgba(129,140,248,0.35),0_18px_44px_-22px_rgba(2,1,10,0.9)] transition-shadow duration-500 hover:shadow-[0_0_50px_-10px_rgba(129,140,248,0.5),0_28px_60px_-20px_rgba(2,1,10,0.95)]"
      data-testid="lesson-video-frame"
    >
      {/* ambient glow behind video */}
      <div aria-hidden="true" className="pointer-events-none absolute -inset-6 -z-10 bg-gradient-to-br from-indigo-600/15 via-purple-600/10 to-cyan-500/10 blur-2xl opacity-60 group-hover:opacity-80 transition-opacity duration-700" />
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-950 via-[#1e1b4b] to-violet-950">
        {/* subtle top highlight */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
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
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#070513]/70 backdrop-blur-[6px]"
          >
            <span aria-hidden="true" className="relative flex h-12 w-12 items-center justify-center">
              <span className="absolute inset-0 rounded-full border border-white/10" />
              <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-400 border-r-purple-400 animate-spin" />
              <span className="h-2 w-2 rounded-full bg-white shadow-[0_0_12px_2px_rgba(129,140,248,0.8)]" />
            </span>
            <span className="rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-xs font-bold tracking-wide text-white/95 shadow-[0_0_20px_-6px_rgba(129,140,248,0.6)] backdrop-blur">
              جاري تحميل الفيديو
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
