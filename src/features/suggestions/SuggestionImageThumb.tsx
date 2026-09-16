import { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';

import { getSuggestionImageSignedUrl } from '../../data/rpc';
import { Skeleton } from '../../components/Skeleton';

interface SuggestionImageThumbProps {
  path: string;
  title: string;
  className?: string;
}

/** Signed-URL thumbnail for a suggestion attachment (owner/admin RLS). */
export function SuggestionImageThumb({ path, title, className }: SuggestionImageThumbProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    getSuggestionImageSignedUrl(path)
      .then((signed) => {
        if (active) {
          if (signed) setUrl(signed);
          else setFailed(true);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [path]);

  if (failed) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs text-foreground-subtle ${className ?? ''}`}
      >
        <ImageIcon className="h-4 w-4" aria-hidden="true" />
        تعذر تحميل الصورة
      </span>
    );
  }

  if (!url) {
    return <Skeleton className={`h-24 w-32 rounded-lg ${className ?? ''}`} />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`block overflow-hidden rounded-lg border border-white/10 ${className ?? ''}`}
      data-testid="suggestion-image-link"
    >
      <img
        src={url}
        alt={`صورة مرفقة: ${title}`}
        loading="lazy"
        className="h-24 w-32 object-cover transition-transform duration-300 hover:scale-105"
      />
    </a>
  );
}
