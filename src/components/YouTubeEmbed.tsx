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
  if (origin) params.set('origin', origin);
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
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
        />
        {/* Visual + click blocking overlays — quick fix to fully hide YouTube branding:
            - Top bar: hides video title + "Watch on YouTube" / Share / Watch later link
            - Bottom-end: hides YouTube watermark/logo
            Solid bg-black makes branding invisible, not just unclickable; middle controls stay fully usable. */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="pointer-events-auto absolute inset-x-0 top-0 h-[58px] bg-black sm:h-[56px]"
            aria-hidden="true"
            data-testid="youtube-overlay-top"
          />
          <div
            className="pointer-events-auto absolute bottom-0 end-0 h-[42px] w-[112px] bg-black sm:h-10 sm:w-[100px]"
            aria-hidden="true"
            data-testid="youtube-overlay-bottom"
          />
        </div>
      </div>
    </div>
  );
}
