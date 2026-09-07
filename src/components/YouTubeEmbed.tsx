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
      className="glass-card relative overflow-hidden rounded-2xl border-white/15 p-1.5"
      onContextMenu={(event) => event.preventDefault()}
      data-testid="youtube-embed-wrapper"
    >
      <div className="relative overflow-hidden rounded-xl bg-black">
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
