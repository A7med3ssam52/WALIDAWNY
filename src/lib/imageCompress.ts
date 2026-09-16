/** Client-side image validation + compression for the suggestions inbox (0075). */

export const SUGGESTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const SUGGESTION_IMAGE_MAX_DIMENSION = 1600;
export const SUGGESTION_IMAGE_QUALITY = 0.82;

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
  try {
    if (typeof document === 'undefined') return file;
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const scale = Math.min(
        1,
        SUGGESTION_IMAGE_MAX_DIMENSION / Math.max(1, img.naturalWidth || img.width),
        SUGGESTION_IMAGE_MAX_DIMENSION / Math.max(1, img.naturalHeight || img.height),
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
        canvas.toBlob((b) => resolve(b), 'image/jpeg', SUGGESTION_IMAGE_QUALITY),
      );
      return blob ?? file;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return file;
  }
}
