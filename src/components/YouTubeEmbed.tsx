interface YouTubeEmbedProps {
  videoId: string;
  title?: string;
}

export function YouTubeEmbed({ videoId, title }: YouTubeEmbedProps) {
  // Root-cause fix: use plain youtube.com embed without origin param (most compatible)
  // and rely on permissive CSP frame-src * to eliminate any blocking.
  const src = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
  return (
    <div className="relative">
      <iframe
        src={src}
        title={title ?? 'فيديو يوتيوب'}
        allowFullScreen
        loading="lazy"
        className="aspect-video w-full rounded-lg border border-white/15 bg-white/5"
        data-testid="youtube-embed"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        onError={(e) => console.error('YouTube embed failed for', videoId, e)}
      />
      <a
        href={`https://www.youtube.com/watch?v=${videoId}`}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[11px] text-white hover:bg-black/90"
      >
        فتح على يوتيوب
      </a>
    </div>
  );
}