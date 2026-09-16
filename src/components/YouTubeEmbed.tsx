import { useEffect, useId, useRef } from 'react';

interface YouTubeEmbedProps {
  videoId: string;
  title?: string;
  /**
   * Periodic watch callbacks (YouTube IFrame API, polled ~5s while playing).
   * Feeds the SAME saveProgress path as the Bunny player so YouTube lessons
   * track progress. When omitted, the player is manual-only (visible reminder
   * below explains that auto-progress needs the toggle button).
   */
  onProgress?: (position: number, percent: number) => void;
  onComplete?: () => void;
  /** Poll interval for time polling while playing (default 5000ms). */
  progressIntervalMs?: number;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        opts: {
          events?: {
            onReady?: (e: { target: unknown }) => void;
            onStateChange?: (e: { data: number; target: unknown }) => void;
          };
        },
      ) => {
        getCurrentTime?: () => number;
        getDuration?: () => number;
        destroy?: () => void;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_API_SRC = 'https://www.youtube.com/iframe_api';
const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2 } as const;

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } catch {
        // ignore previous handler errors
      }
      resolve();
    };
    // Timeout fallback: never block the player on API load.
    window.setTimeout(() => resolve(), 8000);
    if (!document.querySelector(`script[src="${YT_API_SRC}"]`)) {
      const tag = document.createElement('script');
      tag.src = YT_API_SRC;
      tag.async = true;
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}

export function YouTubeEmbed({
  videoId,
  title,
  onProgress,
  onComplete,
  progressIntervalMs = 5000,
}: YouTubeEmbedProps) {
  const frameId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const playerId = `yt-player-${frameId}`;
  const onProgressRef = useRef(onProgress);
  const onCompleteRef = useRef(onComplete);
  onProgressRef.current = onProgress;
  onCompleteRef.current = onComplete;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    iv_load_policy: '3',
    controls: '1',
    fs: '1',
    disablekb: '0',
    enablejsapi: '1',
  });
  if (origin) {
    params.set('origin', origin);
    params.set('widget_referrer', origin);
  }
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
  const trackingEnabled = Boolean(onProgress || onComplete);

  useEffect(() => {
    if (!trackingEnabled) return;
    let player: { getCurrentTime?: () => number; getDuration?: () => number; destroy?: () => void } | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let completedFired = false;

    const poll = () => {
      try {
        const pos = Number(player?.getCurrentTime?.() ?? NaN);
        const dur = Number(player?.getDuration?.() ?? NaN);
        if (!Number.isFinite(pos) || pos < 0) return;
        if (!Number.isFinite(dur) || dur <= 0) {
          // Duration unknown yet — still report position with 0%.
          onProgressRef.current?.(Math.floor(pos), 0);
          return;
        }
        const percent = Math.min(100, Math.round((pos / dur) * 100));
        onProgressRef.current?.(Math.floor(pos), percent);
        if ((dur - pos <= 1.5 || percent >= 99) && !completedFired) {
          completedFired = true;
          onCompleteRef.current?.();
        }
      } catch {
        // polling is best-effort
      }
    };

    const startPolling = () => {
      if (timer || cancelled) return;
      // Immediate sample + periodic while the API player is alive.
      poll();
      timer = setInterval(poll, Math.max(2000, progressIntervalMs));
    };
    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    void loadYouTubeApi().then(() => {
      if (cancelled) return;
      try {
        const YT = window.YT;
        if (!YT?.Player) return; // API blocked — manual fallback reminder stays visible
        player = new YT.Player(playerId, {
          events: {
            onStateChange: (e) => {
              if (e.data === YT_STATE.PLAYING) startPolling();
              else if (e.data === YT_STATE.PAUSED) poll();
              else if (e.data === YT_STATE.ENDED && !completedFired) {
                completedFired = true;
                poll();
                onCompleteRef.current?.();
              }
            },
          },
        });
        // Fallback: poll anyway in case state events are missed.
        startPolling();
      } catch {
        // manual fallback
      }
    });

    return () => {
      cancelled = true;
      stopPolling();
      try {
        player?.destroy?.();
      } catch {
        // ignore
      }
      player = null;
    };
  }, [playerId, trackingEnabled, videoId, progressIntervalMs]);

  return (
    <div
      className="glass-card conic-ring spotlight-card group relative overflow-hidden rounded-2xl border-white/15 p-1.5 shadow-[0_0_40px_-12px_rgba(129,140,248,0.35),0_18px_44px_-22px_rgba(2,1,10,0.9)] transition-shadow duration-500 hover:shadow-[0_0_50px_-10px_rgba(129,140,248,0.5)]"
      data-testid="youtube-embed-wrapper"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -inset-6 -z-10 bg-gradient-to-br from-indigo-600/15 via-purple-600/10 to-cyan-500/10 blur-2xl opacity-60 group-hover:opacity-80 transition-opacity duration-700" />
      {/* Fixed 16:9 box so the layout never shifts while the iframe loads,
          and the iframe fills it exactly — same geometry as Bunny VideoPlayer. */}
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <iframe
          key={videoId}
          id={playerId}
          src={src}
          title={title ?? 'فيديو الدرس'}
          allowFullScreen
          loading="lazy"
          className="absolute inset-0 block h-full w-full border-0 bg-black"
          data-testid="youtube-embed"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
        {/* Transparent click-interceptors: every native control keeps working
            (play / volume / settings / fullscreen), but clicks on the spots
            that navigate away to YouTube are swallowed invisibly —
            video title/channel, Watch later/Share (top strip) and the
            watermark chip (bottom-right, floating above the control bar so
            the bar itself stays fully clickable). Physical `right-` (not
            logical) because the player internals are always LTR even on
            our RTL pages. */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="pointer-events-auto absolute inset-x-0 top-0 h-[clamp(44px,16%,64px)] cursor-default bg-transparent"
            aria-hidden="true"
            data-testid="youtube-overlay-top"
          />
          <div
            className="pointer-events-auto absolute bottom-[42px] right-[10px] h-[30px] w-[84px] cursor-default bg-transparent"
            aria-hidden="true"
            data-testid="youtube-overlay-bottom"
          />
        </div>
      </div>
      {!trackingEnabled ? (
        <p className="px-2 pb-1 pt-2 text-xs leading-5 text-foreground-muted" data-testid="youtube-manual-hint">
          المشاهدة على يوتيوب لا تُسجَّل تلقائياً — استخدم زر «وضع علامة مكتمل» بعد
          المشاهدة لحفظ تقدمك.
        </p>
      ) : null}
    </div>
  );
}
