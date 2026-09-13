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
      data-testid="youtube-embed-wrapper"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -inset-6 -z-10 bg-gradient-to-br from-indigo-600/15 via-purple-600/10 to-cyan-500/10 blur-2xl opacity-60 group-hover:opacity-80 transition-opacity duration-700" />
      {/* Fixed 16:9 box so the layout never shifts while the iframe loads,
          and the iframe fills it exactly — same geometry as Bunny VideoPlayer. */}
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <iframe
          key={videoId}
          src={src}
          title={title ?? 'فيديو الدرس'}
          allowFullScreen
          loading="lazy"
          className="absolute inset-0 block h-full w-full border-0 bg-black"
          data-testid="youtube-embed"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </div>
  );
}
