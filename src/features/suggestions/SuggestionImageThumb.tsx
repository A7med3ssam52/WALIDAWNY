import { useEffect, useState } from 'react';
import { Expand, ImageIcon } from 'lucide-react';

import { getSuggestionImageSignedUrl } from '../../data/rpc';
import { Modal } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';

interface SuggestionImageThumbProps {
  path: string;
  title: string;
  className?: string;
}

/**
 * Signed-URL thumbnail that opens an in-app preview popup (0075).
 * The Supabase URL is never exposed as an external link.
 */
export function SuggestionImageThumb({ path, title, className }: SuggestionImageThumbProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    setPreviewOpen(false);
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

  const alt = `صورة مرفقة: ${title}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className={`group relative block overflow-hidden rounded-lg border border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${className ?? ''}`}
        data-testid="suggestion-image-button"
        aria-label={`معاينة ${alt}`}
        aria-haspopup="dialog"
      >
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className="h-24 w-32 object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/35"
        >
          <Expand className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </button>

      <Modal
        open={previewOpen}
        title="معاينة الصورة"
        confirmLabel="إغلاق"
        cancelLabel="إغلاق"
        onConfirm={() => setPreviewOpen(false)}
        onCancel={() => setPreviewOpen(false)}
      >
        <div className="mt-4" data-testid="suggestion-image-preview">
          <img
            src={url}
            alt={alt}
            className="max-h-[70vh] w-full rounded-lg object-contain"
          />
        </div>
      </Modal>
    </>
  );
}
