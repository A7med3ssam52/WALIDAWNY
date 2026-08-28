interface YouTubeEmbedProps {
  videoId: string;
  title?: string;
}

export function YouTubeEmbed({ videoId, title }: YouTubeEmbedProps) {
  // Use youtube.com (not nocookie) + origin param for better compatibility.
  // nocookie sometimes triggers "blocked" interstitial with strict CSP/cookie settings.
  const src = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&enablejsapi=0&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : 'https://walidawny.com')}`;
  return (
    <iframe
      src={src}
      title={title ?? 'فيديو يوتيوب'}
      allowFullScreen
      loading="lazy"
      className="aspect-video w-full rounded-lg border border-white/15 bg-white/5"
      data-testid="youtube-embed"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}