/** Client-side image validation for uploads (suggestions inbox 0075, student avatars 0082).
 *
 * Avatars are stored at full original quality: the original file bytes and
 * MIME type are uploaded untouched (no canvas downscale / re-encode), so
 * what the student uploads is byte-identical to what staff download.
 */

export const SUGGESTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const SUGGESTION_IMAGE_MAX_DIMENSION = 1600;
export const SUGGESTION_IMAGE_QUALITY = 0.82;

export const AVATAR_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Arabic validation message, or null when the file is acceptable. */
export function validateSuggestionImage(file: File): string | null {
  if (!SUPPORTED_TYPES.has(file.type)) {
    return 'الصورة يجب أن تكون JPG أو PNG أو WEBP';
  }
  if (file.size <= 0) {
    return 'ملف الصورة فارغ';
  }
  if (file.size > SUGGESTION_IMAGE_MAX_BYTES) {
    return 'حجم الصورة كبير — الحد الأقصى 5MB';
  }
  return null;
}

function loadImage(url: string, timeoutMs = 3000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('decode_timeout')), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('decode_failed'));
    };
    img.src = url;
  });
}

/**
 * Downscales to {@link SUGGESTION_IMAGE_MAX_DIMENSION} and re-encodes as
 * JPEG. Falls back to the original file whenever the browser cannot do
 * canvas work (or anything throws) so submit never breaks on upload.
 */
export async function compressSuggestionImage(file: File): Promise<Blob> {
  return compressImage(file, SUGGESTION_IMAGE_MAX_DIMENSION, SUGGESTION_IMAGE_QUALITY);
}

/** Arabic validation message for avatar files, or null when acceptable. */
export function validateAvatarImage(file: File): string | null {
  if (!SUPPORTED_TYPES.has(file.type)) {
    return 'الصورة يجب أن تكون JPG أو PNG أو WEBP';
  }
  if (file.size <= 0) {
    return 'ملف الصورة فارغ';
  }
  if (file.size > AVATAR_IMAGE_MAX_BYTES) {
    return 'حجم الصورة كبير — الحد الأقصى 8MB';
  }
  return null;
}

async function compressImage(file: File, maxDimension: number, quality: number): Promise<Blob> {
  try {
    if (typeof document === 'undefined') return file;
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const scale = Math.min(
        1,
        maxDimension / Math.max(1, img.naturalWidth || img.width),
        maxDimension / Math.max(1, img.naturalHeight || img.height),
      );
      const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
      const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
      );
      return blob ?? file;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return file;
  }
}
