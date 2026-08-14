// Shared Bunny.net contracts for the Phase 5 Edge Functions.
//
// Endpoints, headers and payload shapes below are verified against the
// Bunny Stream/API documentation (webhooks, tus-resumable-uploads,
// storage-structure, token-authentication/advanced):
//   https://docs.bunny.net/docs/stream/webhooks
//   https://docs.bunny.net/docs/stream/tus-resumable-uploads
//   https://docs.bunny.net/docs/stream/storage-structure
//   https://docs.bunny.net/docs/cdn/security/token-authentication/advanced
//
// No secrets are logged anywhere in this module.

export const BUNNY_LIBRARY_API_BASE = 'https://video.bunnycdn.com/library';
export const BUNNY_TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';
export const BUNNY_API_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------
// Webhook status codes (current API): the payload is
// { VideoLibraryId, VideoGuid, Status } with NUMERIC statuses — NOT the
// legacy EventType strings. Verified against docs.bunny.net
// (stream/webhooks): 0 Queued, 1 Processing, 2 Encoding, 3 Finished,
// 4 Resolution finished, 5 Failed, 6 PresignedUploadStarted,
// 7 PresignedUploadFinished, 8 PresignedUploadFailed,
// 9 CaptionsGenerated, 10 TitleOrDescriptionGenerated.
// ---------------------------------------------------------------------
export const BUNNY_STATUS = {
  queued: 0,
  processing: 1,
  encoding: 2,
  finished: 3,
  resolutionFinished: 4,
  failed: 5,
  presignedUploadStarted: 6,
  presignedUploadFinished: 7,
  presignedUploadFailed: 8,
  captionsGenerated: 9,
  titleOrDescriptionGenerated: 10,
} as const;

/** What a webhook event means for the lesson_videos state machine. */
export type BunnyAction = 'uploading' | 'processing' | 'ready' | 'failed' | 'none';

/** Map a numeric Bunny status to the state-machine action it drives. */
export function mapWebhookStatus(status: number | null | undefined): BunnyAction {
  switch (status) {
    case BUNNY_STATUS.finished:
      return 'ready';
    case BUNNY_STATUS.processing:
    case BUNNY_STATUS.encoding:
    case BUNNY_STATUS.resolutionFinished:
      return 'processing';
    case BUNNY_STATUS.presignedUploadStarted:
    case BUNNY_STATUS.presignedUploadFinished:
      return 'uploading';
    case BUNNY_STATUS.failed:
    case BUNNY_STATUS.presignedUploadFailed:
      return 'failed';
    default:
      // queued (0), captions (9), title (10), unknown: nothing to do.
      return 'none';
  }
}

export type VideoState =
  'pending_upload' | 'uploading' | 'processing' | 'ready' | 'failed' | 'replaced';

// Legal transitions, mirrored from migrations/0008_rpc_system.sql
// (set_video_status): pending_upload -> uploading|failed,
// uploading -> processing|failed, processing -> ready|failed,
// ready -> replaced, failed -> pending_upload|uploading, replaced terminal.
const LEGAL_TRANSITIONS: Record<VideoState, VideoState[]> = {
  pending_upload: ['uploading', 'failed'],
  uploading: ['processing', 'failed'],
  processing: ['ready', 'failed'],
  ready: ['replaced'],
  failed: ['pending_upload', 'uploading'],
  replaced: [],
};

/**
 * Shortest legal path from `current` to `target` (BFS over the
 * set_video_status transition graph). Returns the sequence of states to
 * apply, EXCLUDING `current` and INCLUDING `target`; [] when already at
 * the target; null when the target is unreachable (e.g. ready -> failed).
 */
export function transitionChain(current: VideoState, target: VideoState): VideoState[] | null {
  if (current === target) return [];
  const queue: VideoState[][] = [[current]];
  const visited = new Set<VideoState>([current]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    for (const next of LEGAL_TRANSITIONS[last] ?? []) {
      if (visited.has(next)) continue;
      if (next === target) return [...path.slice(1), next];
      visited.add(next);
      queue.push([...path, next]);
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// TUS upload signing (docs.bunny.net/stream/tus-resumable-uploads):
// AuthorizationSignature = SHA-256 hex (lowercase) of the concatenated
// libraryId + apiKey + expire (unix seconds) + videoId; AuthorizationExpire
// carries the same unix seconds value.
// ---------------------------------------------------------------------
export async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function tusAuthorizationSignature(
  libraryId: string,
  apiKey: string,
  expireUnixSeconds: number,
  videoId: string,
): Promise<string> {
  return sha256Hex(`${libraryId}${apiKey}${expireUnixSeconds}${videoId}`);
}

// ---------------------------------------------------------------------
// CDN token authentication — Advanced (HS256). The format below was
// EMPIRICALLY VERIFIED against the real pull zone (scripts/smoke-bunny.mjs)
// and matches the official BunnyCDN.TokenAuthentication token.js:
//   message = signaturePath + expires + ipBytes + signingData
// where for a DIRECTORY token signaturePath is the protected directory
// ("/{videoId}/") and signingData is "token_path=" + <RAW path>. ipBytes
// are the raw octets of the client IP (IPv6 masked to /64, empty when no
// IP); the token carries the IP-lock flag prefix "1-" when an IP is used.
//   token  = HS256-<1-><base64url(HMAC-SHA256(signingKey, message))>
//   URL    = https://<zone>/<videoId>/playlist.m3u8
//            ?token=<token>&expires=<e>&token_path=%2F<videoId>%2F
// NOTE: this zone (vz-359f776b-f3a) requires the IP-locked QUERY form;
// the docs' bcdn_token path form and plain (non-IP) tokens return 403.
// ---------------------------------------------------------------------
export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Client IP -> raw bytes for token signing. IPv4: the 4 octets. IPv6:
 * 16 bytes with the interface identifier masked to the /64 prefix
 * (zeroed last 8 bytes), mirroring the official token.js. Any other
 * input yields an empty byte array (token is then not IP-locked).
 */
export function ipToBytes(ip: string | null | undefined): Uint8Array {
  if (!ip) return new Uint8Array();
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map((x) => Number(x));
    if (octets.every((n) => n >= 0 && n <= 255)) return new Uint8Array(octets);
    return new Uint8Array();
  }
  let s = ip;
  let trailingV4: number[] | null = null;
  const lastColon = s.lastIndexOf(':');
  if (lastColon !== -1 && s.indexOf('.') > lastColon) {
    const tail = s.slice(lastColon + 1);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(tail)) {
      trailingV4 = tail.split('.').map(Number);
      s = s.slice(0, lastColon) + ':0:0';
    }
  }
  const halves = s.split('::');
  if (halves.length > 2) return new Uint8Array();
  const left = halves[0] === '' ? [] : halves[0].split(':');
  const right = halves.length === 2 && halves[1] !== '' ? halves[1].split(':') : [];
  const total = left.length + right.length;
  if ((halves.length === 1 && total !== 8) || (halves.length === 2 && total > 7)) {
    return new Uint8Array();
  }
  const fill = halves.length === 2 ? 8 - total : 0;
  const hextets = [...left, ...Array(fill).fill('0'), ...right];
  if (hextets.length !== 8) return new Uint8Array();
  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9A-Fa-f]{1,4}$/.test(hextets[i])) return new Uint8Array();
    const n = parseInt(hextets[i], 16);
    out[i * 2] = (n >>> 8) & 0xff;
    out[i * 2 + 1] = n & 0xff;
  }
  if (trailingV4) for (let i = 0; i < 4; i++) out[12 + i] = trailingV4[i];
  out.fill(0, 8);
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export async function signDirectoryToken(opts: {
  signingKey: string;
  /** Directory to protect, e.g. "/0123-4567/" (leading/trailing slash). */
  tokenPath: string;
  /** Unix seconds the token expires. */
  expires: number;
  /** Client IP to lock the token to (optional; raw bytes in the message). */
  ip?: string;
}): Promise<string> {
  const enc = new TextEncoder();
  const head = enc.encode(`${opts.tokenPath}${opts.expires}`);
  const ipBytes = ipToBytes(opts.ip);
  const tail = enc.encode(`token_path=${opts.tokenPath}`);
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(opts.signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, concatBytes([head, ipBytes, tail]));
  const flags = ipBytes.length > 0 ? '1-' : '';
  return `HS256-${flags}${encodeBase64Url(new Uint8Array(signature))}`;
}

export const DEFAULT_PLAYBACK_TTL_SECONDS = 1200; // 20 minutes

/**
 * Signed HLS master playlist URL for a video (query form, verified):
 * https://<host>/<videoId>/playlist.m3u8
 *   ?token=HS256-1-<b64url>&expires=<e>&token_path=%2F<videoId>%2F
 * The master playlist path is the documented storage structure
 * `/{videoId}/playlist.m3u8`; the directory token authorizes every HLS
 * file under `/{videoId}/` (master + resolution playlists + segments).
 * An IP-locked token is REQUIRED by the production zone.
 */
export async function buildPlaybackUrl(opts: {
  hostname: string;
  signingKey: string;
  videoId: string;
  ttlSeconds?: number;
  nowUnix?: number;
  /** Client IP to lock the token to (required by the production zone). */
  ip?: string;
}): Promise<{ url: string; expires: number }> {
  const ttl = opts.ttlSeconds ?? DEFAULT_PLAYBACK_TTL_SECONDS;
  const now = opts.nowUnix ?? Math.floor(Date.now() / 1000);
  const expires = now + ttl;
  const tokenPath = `/${opts.videoId}/`;
  const manifestPath = `/${opts.videoId}/playlist.m3u8`;
  const token = await signDirectoryToken({
    signingKey: opts.signingKey,
    tokenPath,
    expires,
    ip: opts.ip,
  });
  const url =
    `https://${opts.hostname}${manifestPath}` +
    `?token=${token}` +
    `&expires=${expires}` +
    `&token_path=${encodeURIComponent(tokenPath)}`;
  return { url, expires };
}

/**
 * Signed URL for any single object inside a video's directory, e.g.
 * `thumbnail.jpg` at `/{videoId}/thumbnail.jpg`. Reuses the IP-locked
 * DIRECTORY token for `/{videoId}/` (the verified query form) so the
 * object is protected by the same zone rules as the HLS chain.
 */
export async function buildSignedObjectUrl(opts: {
  hostname: string;
  signingKey: string;
  videoId: string;
  /** File name within the video directory, e.g. "thumbnail.jpg". */
  objectName: string;
  ttlSeconds?: number;
  nowUnix?: number;
  /** Client IP to lock the token to (required by the production zone). */
  ip?: string;
}): Promise<{ url: string; expires: number }> {
  const ttl = opts.ttlSeconds ?? DEFAULT_PLAYBACK_TTL_SECONDS;
  const now = opts.nowUnix ?? Math.floor(Date.now() / 1000);
  const expires = now + ttl;
  const tokenPath = `/${opts.videoId}/`;
  const token = await signDirectoryToken({
    signingKey: opts.signingKey,
    tokenPath,
    expires,
    ip: opts.ip,
  });
  const url =
    `https://${opts.hostname}${tokenPath}${opts.objectName}` +
    `?token=${token}` +
    `&expires=${expires}` +
    `&token_path=${encodeURIComponent(tokenPath)}`;
  return { url, expires };
}
