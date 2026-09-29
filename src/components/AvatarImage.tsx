import { useEffect, useState, type ReactNode } from 'react';

import { getAvatarSignedUrl } from '../data/rpc';

interface AvatarImageProps {
  /** Storage path from profiles.avatar_path. Null/undefined renders the fallback. */
  path: string | null | undefined;
  alt: string;
  className?: string;
  fallback: ReactNode;
}

/**
 * Student profile photo with graceful fallback.
 * Resolves a cached signed URL for the private avatars bucket; shows the
 * fallback (usually the name initial) while loading or when unavailable.
 */
export function AvatarImage({ path, alt, className, fallback }: AvatarImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    if (!path) {
      return;
    }
    void getAvatarSignedUrl(path)
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

  if (!path || failed || !url) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={url}
      alt={alt}
      data-testid="avatar-image"
      draggable={false}
      className={`object-cover ${className ?? ''}`}
      onError={() => setFailed(true)}
    />
  );
}
