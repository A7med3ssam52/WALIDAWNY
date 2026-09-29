import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

import { getAvatarSignedUrl } from '../data/rpc';
import { useToast } from './Toast';
import { Button } from './Button';

export interface PreviewStudent {
  id: string;
  full_name: string;
  avatar_path: string | null | undefined;
}

interface AvatarPreviewDialogProps {
  /** Null = closed. Non-null without avatar_path renders nothing. */
  student: PreviewStudent | null;
  onClose: () => void;
}

/**
 * Admin-only avatar preview + download (0082 private bucket).
 * Resolves a fresh signed URL on open; download fetches it as a blob
 * and saves `avatar-<id>.jpg` on the device.
 */
export function AvatarPreviewDialog({ student, onClose }: AvatarPreviewDialogProps) {
  const { showToast } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const path = student?.avatar_path ?? null;

  useEffect(() => {
    let active = true;
    setUrl(null);
    setLoadError(false);
    if (!student || !path) {
      return;
    }
    // Escape closes the dialog (no focus trap needed beyond the close button).
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    void getAvatarSignedUrl(path)
      .then((signed) => {
        if (!active) return;
        if (signed) setUrl(signed);
        else setLoadError(true);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
      document.removeEventListener('keydown', handleKey);
    };
  }, [student, path, onClose]);

  if (!student || !path) {
    return null;
  }

  const handleDownload = async () => {
    if (!url || downloading) {
      return;
    }
    setDownloading(true);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('download_failed');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = `avatar-${student.id}.jpg`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      showToast('تم تحميل الصورة على جهازك');
    } catch {
      showToast('تعذر تحميل الصورة. حاول مرة أخرى لاحقًا', 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgb(10_12_10/0.6)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`معاينة صورة ${student.full_name}`}
      data-testid="avatar-preview-dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget && !downloading) {
          onClose();
        }
      }}
    >
      <div className="glass-panel w-full max-w-md rounded-[20px] p-5 text-center sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-lg font-black text-foreground">{student.full_name}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق المعاينة"
            data-testid="avatar-preview-close"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground-subtle transition-colors hover:bg-surface-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 flex justify-center">
          {loadError ? (
            <p role="alert" className="text-sm font-medium text-error">
              تعذر تحميل المعاينة. حاول مرة أخرى لاحقًا
            </p>
          ) : url ? (
            <img
              src={url}
              alt={`صورة ${student.full_name}`}
              draggable={false}
              className="max-h-[50vh] w-auto max-w-full rounded-2xl object-contain ring-2 ring-border"
            />
          ) : (
            <p className="text-sm text-foreground-subtle">جاري تحميل المعاينة...</p>
          )}
        </div>
        <Button
          className="mt-5 w-full"
          icon={<Download aria-hidden="true" className="h-4 w-4" />}
          loading={downloading}
          disabled={!url}
          onClick={() => void handleDownload()}
          data-testid="avatar-download"
        >
          تحميل على الجهاز
        </Button>
      </div>
    </div>
  );
}
