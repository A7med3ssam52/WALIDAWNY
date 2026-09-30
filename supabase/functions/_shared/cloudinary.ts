// =====================================================================
// _shared/cloudinary.ts — Cloudinary signing + avatar-path helpers
// (Phase 10, avatars on Cloudinary — see 0089_avatars_cloudinary.sql).
//
// Avatars live on Cloudinary with delivery type `authenticated`
// (original + derivatives only served through server-signed URLs) at
// the fixed public_id `avatars/<uid>/avatar` (overwrite on re-upload,
// so one asset per student, no orphans).
//
// profiles.avatar_path pointers for Cloudinary assets look like:
//   cloudinary:<uid>/avatar.<ext>:<version>
// (ext = jpg|jpeg|png|webp, version = Cloudinary asset version digits)
//
// Secrets (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY /
// CLOUDINARY_API_SECRET) are server-side ONLY — Edge Functions read
// them from Deno.env; the browser only ever sees the cloud name, the
// API key, and per-request signatures. Nothing here logs secrets.
//
// NOTE on URL lifetime: an `authenticated`-type signed delivery URL
// (s--SIGNATURE--) is unguessable but has no server-side expiry on the
// free plan (no token auth). Frontend caching keeps the 1-hour refresh
// behaviour; every re-upload bumps the version, which invalidates
// previously issued URLs. Strict transformations should additionally
// be enabled in the Cloudinary console so URLs cannot be manipulated.
// =====================================================================

/** Fixed Cloudinary folder for avatars; one asset per uid below it. */
export const CLOUDINARY_AVATAR_FOLDER = 'avatars';

/** Fixed Cloudinary folder for exam question images. */
export const CLOUDINARY_EXAM_FOLDER = 'exam-images';

/** Single delivery transformation for avatars (downscale + auto quality). */
export const AVATAR_DELIVERY_TRANSFORMATION = 'c_limit,w_512,h_512,q_auto';

/** Delivery transformation for exam images (keeps question detail readable). */
export const EXAM_IMAGE_DELIVERY_TRANSFORMATION = 'c_limit,w_1600,h_1600,q_auto';

/** Cloudinary free plan caps image uploads at 10MB; the platform caps at 8MB. */
export const AVATAR_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

/** Exam images keep the 5MiB platform cap (mirrors the exam-images bucket limit). */
export const EXAM_IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AVATAR_EXT_RE = /^(jpg|jpeg|png|webp)$/;

export interface ParsedAvatarPath {
  uid: string;
  format: string;
  version: string;
}

export interface ParsedExamImagePath {
  examId: string;
  imageId: string;
  format: string;
  version: string;
}

/** Fixed public_id for a user's avatar — overwrite on re-upload. */
export function avatarPublicId(userId: string): string {
  return `${CLOUDINARY_AVATAR_FOLDER}/${userId}/avatar`;
}

/** Server-minted public_id for an exam question image (uuid per upload). */
export function examImagePublicId(examId: string, imageId: string): string {
  return `${CLOUDINARY_EXAM_FOLDER}/${examId}/${imageId}`;
}

/** profiles.avatar_path pointer for a Cloudinary avatar asset. */
export function avatarPathFor(userId: string, format: string, version: string): string {
  return `cloudinary:${userId}/avatar.${format}:${version}`;
}

/**
 * exam_questions image pointer for a Cloudinary asset:
 * cloudinary:exam-images/<exam_id>/<image_uuid>.<ext>:<version>.
 */
export function examImagePointerFor(
  examId: string,
  imageId: string,
  format: string,
  version: string,
): string {
  return `cloudinary:${CLOUDINARY_EXAM_FOLDER}/${examId}/${imageId}.${format}:${version}`;
}

/**
 * Parses a `cloudinary:<uid>/avatar.<ext>:<version>` pointer.
 * Returns null for anything else (including legacy Supabase paths).
 */
export function parseAvatarPath(path: unknown): ParsedAvatarPath | null {
  if (typeof path !== 'string' || !path.startsWith('cloudinary:')) {
    return null;
  }
  const rest = path.slice('cloudinary:'.length);
  const versionSep = rest.lastIndexOf(':');
  if (versionSep < 0) return null;
  const version = rest.slice(versionSep + 1);
  const head = rest.slice(0, versionSep);
  const slash = head.indexOf('/');
  if (slash < 0) return null;
  const uid = head.slice(0, slash);
  const file = head.slice(slash + 1);
  if (!file.startsWith('avatar.')) return null;
  const format = file.slice('avatar.'.length);
  if (!UUID_RE.test(uid)) return null;
  if (!AVATAR_EXT_RE.test(format)) return null;
  if (!/^[0-9]+$/.test(version)) return null;
  return { uid, format, version };
}

/**
 * Parses a `cloudinary:exam-images/<exam_id>/<image_uuid>.<ext>:<version>`
 * pointer. Returns null for anything else (including legacy Supabase
 * paths and avatar pointers).
 */
export function parseExamImagePointer(path: unknown): ParsedExamImagePath | null {
  if (typeof path !== 'string') return null;
  const prefix = `cloudinary:${CLOUDINARY_EXAM_FOLDER}/`;
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  const versionSep = rest.lastIndexOf(':');
  if (versionSep < 0) return null;
  const version = rest.slice(versionSep + 1);
  const head = rest.slice(0, versionSep);
  const slash = head.indexOf('/');
  if (slash < 0) return null;
  const examId = head.slice(0, slash);
  const file = head.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  if (dot < 0) return null;
  const imageId = file.slice(0, dot);
  const format = file.slice(dot + 1);
  if (!UUID_RE.test(examId)) return null;
  if (!UUID_RE.test(imageId)) return null;
  if (!AVATAR_EXT_RE.test(format)) return null;
  if (!/^[0-9]+$/.test(version)) return null;
  return { examId, imageId, format, version };
}

/** SHA-1 digest of a UTF-8 string, lowercase hex (upload-API signatures). */
export async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Upload-API signature: params (everything the browser will send except
 * file/api_key/signature/resource_type/cloud_name) sorted A-Z, joined
 * `k=v&...`, secret appended, SHA-1 hex.
 */
export function signUploadParams(
  params: Record<string, string>,
  apiSecret: string,
): Promise<string> {
  const payload =
    Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&') + apiSecret;
  return sha1Hex(payload);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Delivery-URL signature: first 8 chars of the URL-safe base64 SHA-1
 * over `<transformation>/v<version>/<publicId>.<format>` + secret.
 */
export async function signDeliveryUrl(toSign: string, apiSecret: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(toSign + apiSecret),
  );
  return base64UrlEncode(new Uint8Array(digest)).slice(0, 8);
}

/** Signed delivery URL for an `authenticated`-type avatar asset. */
export function buildAuthenticatedDeliveryUrl(args: {
  cloudName: string;
  publicId: string;
  format: string;
  version: string;
  transformation?: string;
  signature: string;
}): string {
  const transformation = args.transformation ?? AVATAR_DELIVERY_TRANSFORMATION;
  return (
    `https://res.cloudinary.com/${args.cloudName}/image/authenticated/` +
    `s--${args.signature}--/${transformation}/v${args.version}/` +
    `${args.publicId}.${args.format}`
  );
}

/** Direct browser-upload endpoint for the image resource type. */
export function uploadEndpoint(cloudName: string): string {
  return `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
}

/** Upload-API destroy endpoint for the image resource type. */
export function destroyEndpoint(cloudName: string): string {
  return `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`;
}

export type CloudinaryFetch = (
  url: string,
  init: { method: string; body: URLSearchParams },
) => Promise<{ status: number; json(): Promise<unknown> }>;

/**
 * Destroys the caller's avatar asset via the Upload API (server secret).
 * Missing assets count as success (idempotent — mirrors the
 * best-effort removal of remove_my_avatar()).
 */
export async function destroyAvatarAsset(args: {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  publicId: string;
  timestamp: number;
  fetchFn: CloudinaryFetch;
}): Promise<{ deleted: boolean }> {
  const params: Record<string, string> = {
    invalidate: 'true',
    public_id: args.publicId,
    timestamp: String(args.timestamp),
    type: 'authenticated',
  };
  const signature = await signUploadParams(params, args.apiSecret);
  const body = new URLSearchParams({
    ...params,
    api_key: args.apiKey,
    signature,
  });
  const res = await args.fetchFn(destroyEndpoint(args.cloudName), { method: 'POST', body });
  if (res.status === 200) {
    const payload = (await res.json()) as { result?: unknown } | null;
    const result = typeof payload?.result === 'string' ? payload.result : '';
    return { deleted: result === 'ok' || result === 'not found' };
  }
  return { deleted: false };
}
