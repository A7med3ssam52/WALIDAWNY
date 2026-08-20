interface YouTubeEmbedProps {
  videoId: string;
  title?: string;
}

export function YouTubeEmbed({ videoId, title }: YouTubeEmbedProps) {
  return (
    <iframe
      src={'https://www.youtube-nocookie.com/embed/' + videoId}
      title={title ?? 'فيديو يوتيوب'}
      allowFullScreen
      className="aspect-video w-full rounded-lg border border-white/15 bg-white/5"
      data-testid="youtube-embed"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}