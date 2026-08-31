interface YouTubeEmbedProps {
  videoId: string;
  title?: string;
}

export function YouTubeEmbed({ videoId, title }: YouTubeEmbedProps) {
  const src = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1&iv_load_policy=3`;
  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/15 bg-black"
      onContextMenu={(event) => event.preventDefault()}
      data-testid="youtube-embed-wrapper"
    >
      <iframe
        src={src}
        title={title ?? 'فيديو الدرس'}
        allowFullScreen
        loading="lazy"
        className="aspect-video w-full rounded-lg border-0 bg-black"
        data-testid="youtube-embed"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {/* Transparent overlays to block clicks on YouTube title/logo that would open youtube.com */}
      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute left-0 right-0 top-0 h-14" aria-hidden="true" />
        <div className="pointer-events-auto absolute bottom-0 right-0 h-12 w-24" aria-hidden="true" />
      </div>
    </div>
  );
}
