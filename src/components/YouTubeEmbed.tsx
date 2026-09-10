interface YouTubeEmbedProps {
  videoId: string;
  title?: string;
}

export function YouTubeEmbed({ videoId, title }: YouTubeEmbedProps) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    iv_load_policy: '3',
    controls: '1',
    fs: '1',
    disablekb: '0',
  });
  if (origin) {
    params.set('origin', origin);
    params.set('widget_referrer', origin);
  }
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;

  return (
    <div
      className="glass-card conic-ring spotlight-card group relative overflow-hidden rounded-2xl border-white/15 p-1.5 shadow-[0_0_40px_-12px_rgba(129,140,248,0.35),0_18px_44px_-22px_rgba(2,1,10,0.9)] transition-shadow duration-500 hover:shadow-[0_0_50px_-10px_rgba(129,140,248,0.5)]"
      onContextMenu={(event) => event.preventDefault()}
      data-testid="youtube-embed-wrapper"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -inset-6 -z-10 bg-gradient-to-br from-indigo-600/15 via-fuchsia-600/10 to-cyan-500/10 blur-2xl opacity-60 group-hover:opacity-80 transition-opacity duration-700" />
      <div className="relative overflow-hidden rounded-xl bg-black">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent z-10" />
        <iframe
          src={src}
          title={title ?? 'فيديو الدرس'}
          allowFullScreen
          loading="lazy"
          className="aspect-video w-full border-0 bg-black"
          data-testid="youtube-embed"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
        {/* Overlays to hide external navigation without blocking player controls:
            - Top: hides title link / Share / Watch later (leads outside)
            - Bottom: hides YouTube watermark/logo only, leaves ~44px gap on the right
              so the native Fullscreen button stays clickable + rotatable. */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="pointer-events-auto absolute inset-x-0 top-0 h-[56px] bg-black sm:h-[52px]"
            aria-hidden="true"
            data-testid="youtube-overlay-top"
          />
          <div
            className="pointer-events-auto absolute bottom-0 end-[44px] h-[36px] w-[88px] bg-black sm:h-[34px] sm:w-[84px]"
            aria-hidden="true"
            data-testid="youtube-overlay-bottom"
          />
        </div>
      </div>
    </div>
  );
}
