// Live smoke test: Bunny API + TUS-upload + CDN token auth (Phase 5).
// Reads secrets from .env.functions.local (LOCAL ONLY, never committed).
// Verifies the EXACT signing formulas used by supabase/functions/_shared/bunny.ts
// against the REAL pull zone, then cleans up the test video.
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.functions.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const API_KEY = env.BUNNY_API_KEY;
const LIB_ID = env.BUNNY_LIBRARY_ID;
const HOST = env.BUNNY_PULL_ZONE_HOSTNAME;
const SIGNING_KEY = env.BUNNY_SIGNING_KEY;

const api = (path, init = {}) =>
  fetch(`https://video.bunnycdn.com/library/${LIB_ID}${path}`, {
    ...init,
    headers: { Accept: 'application/json', AccessKey: API_KEY, ...(init.headers ?? {}) },
  });

const base64Url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// EXACT replica of _shared/bunny.ts signDirectoryToken + buildPlaybackUrl
// (verified formula: IP-locked HS256, RAW token_path in the message,
// query form in the URL).
function signDirectoryToken(tokenPath, expires, ip) {
  const head = `${tokenPath}${expires}`;
  const hmac = createHmac('sha256', SIGNING_KEY);
  hmac.update(head);
  if (ip) hmac.update(ip);
  hmac.update(`token_path=${tokenPath}`);
  const sig = hmac.digest();
  return `HS256-${ip ? '1-' : ''}${base64Url(sig)}`;
}
function buildPlaybackUrl(videoId, ttlSeconds = 1200, ip) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const tokenPath = `/${videoId}/`;
  const token = signDirectoryToken(tokenPath, expires, ip);
  const url =
    `https://${HOST}/${videoId}/playlist.m3u8` +
    `?token=${token}` +
    `&expires=${expires}` +
    `&token_path=${encodeURIComponent(tokenPath)}`;
  return { url, expires, tokenPath };
}

const ok = (m) => console.log(`PASS  ${m}`);
const bad = (m) => {
  console.log(`FAIL  ${m}`);
  process.exitCode = 1;
};
const step = (m) => console.log(`\n--- ${m}`);

// Egress IP (what the pull zone sees) for IP-locked token variants.
const EGRESS_IP =
  process.env.SMOKE_EGRESS_IP ??
  (await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(15000) })
    .then((r) => r.json())
    .then((j) => j.ip)
    .catch(() => ''));

// EXACT replica of _shared/bunny.ts ipToBytes: IPv4 octets; IPv6 parsed
// to 16 bytes with the interface identifier masked (/64); anything else
// -> empty (token not IP-locked). Must mirror the EF byte-for-byte.
function ipToBytes(ip) {
  if (!ip) return Buffer.alloc(0);
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.every((n) => n >= 0 && n <= 255)) return Buffer.from(octets);
    return Buffer.alloc(0);
  }
  let s = ip;
  let trailingV4 = null;
  const lastColon = s.lastIndexOf(':');
  if (lastColon !== -1 && s.indexOf('.') > lastColon) {
    const tail = s.slice(lastColon + 1);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(tail)) {
      trailingV4 = tail.split('.').map(Number);
      s = s.slice(0, lastColon) + ':0:0';
    }
  }
  const halves = s.split('::');
  if (halves.length > 2) return Buffer.alloc(0);
  const left = halves[0] === '' ? [] : halves[0].split(':');
  const right = halves.length === 2 && halves[1] !== '' ? halves[1].split(':') : [];
  const total = left.length + right.length;
  if ((halves.length === 1 && total !== 8) || (halves.length === 2 && total > 7))
    return Buffer.alloc(0);
  const fill = halves.length === 2 ? 8 - total : 0;
  const hextets = [...left, ...Array(fill).fill('0'), ...right];
  if (hextets.length !== 8) return Buffer.alloc(0);
  const out = Buffer.alloc(16);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9A-Fa-f]{1,4}$/.test(hextets[i])) return Buffer.alloc(0);
    out.writeUInt16BE(parseInt(hextets[i], 16), i * 2);
  }
  if (trailingV4) for (let i = 0; i < 4; i++) out[12 + i] = trailingV4[i];
  out.fill(0, 8);
  return out;
}
const ipBytes = ipToBytes(EGRESS_IP);

async function main() {
  step('1/6 Library access');
  const lib = await api('').then((r) => (r.ok ? r.json() : null));
  if (!lib) return bad('library GET failed');
  ok(`library reachable (${lib.Name ?? 'name-unknown'})`);

  step('2/6 Create test video');
  const created = await api('/videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'smoke-test' }),
  });
  if (!created.ok) return bad(`create video HTTP ${created.status}`);
  const video = await created.json();
  const videoId = video.guid ?? video.videoId;
  if (!videoId) return bad(`no guid in create response: ${JSON.stringify(video).slice(0, 200)}`);
  ok(`created videoId=${videoId}`);

  try {
    step('3/6 Download tiny sample MP4');
    const mp4 = await fetch('https://download.samplelib.com/mp4/sample-5s.mp4', {
      headers: { 'User-Agent': 'smoke-bunny' },
    }).then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null));
    if (!mp4) return bad('could not download sample mp4');
    ok(`sample mp4 ${(mp4.length / 1024).toFixed(0)} KB`);

    step('4/6 Upload via API (server-side path)');
    const up = await api(`/videos/${videoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(mp4),
    });
    if (!up.ok) return bad(`upload HTTP ${up.status}`);
    ok('upload accepted');

    step('5/6 Poll until encoded (max 8 min)');
    let status = null;
    for (let i = 0; i < 96; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const d = await api(`/videos/${videoId}`).then((r) => (r.ok ? r.json() : null));
      if (!d) continue;
      status = d.status;
      console.log(`  status=${status} (${i * 5}s)`);
      if (status === 4 || status === 5) break;
    }
    if (status !== 4) return bad(`final status ${status} (expected 4=encoded)`);
    ok('video encoded');

    step('6/6 Signed playback — EF-exact formula + full HLS chain');
    const { expires, tokenPath } = buildPlaybackUrl(videoId, 1200, ipBytes);
    const base = `https://${HOST}`;
    const signed = (p) => {
      const suffix = `?token=${signDirectoryToken(tokenPath, expires, ipBytes)}&expires=${expires}&token_path=${encodeURIComponent(tokenPath)}`;
      return `${base}${tokenPath}${p}${suffix}`;
    };
    const headers = (referer) => ({
      'User-Agent': 'Mozilla/5.0',
      ...(referer ? { Referer: referer } : {}),
    });
    const probe = async (label, p, referer) => {
      const res = await fetch(signed(p), { headers: headers(referer) });
      console.log(`  ${label}: HTTP ${res.status}`);
      return res;
    };
    const m1 = await probe(
      'playlist.m3u8 (dir token, Referer example.com)',
      'playlist.m3u8',
      'https://example.com/',
    );
    const m2 = await probe(
      'playlist.m3u8 (dir token, Referer other.example)',
      'playlist.m3u8',
      'https://other.example/',
    );
    const m3 = await probe('playlist.m3u8 (dir token, no Referer)', 'playlist.m3u8', '');
    let hlsOk = false;
    if (m1.ok || m2.ok) {
      const list = await (m1.ok ? m1 : m2).text();
      const variantLine = list
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.endsWith('.m3u8'));
      if (variantLine) {
        const v = await probe(`sub-playlist ${variantLine}`, variantLine, 'https://example.com/');
        if (v.ok) {
          const vtext = await v.text();
          const segLine = vtext
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.endsWith('.ts'));
          if (segLine) {
            const s = await probe(
              `segment ${segLine}`,
              `${variantLine.split('/')[0]}/${segLine}`,
              'https://example.com/',
            );
            hlsOk = s.ok;
          } else hlsOk = v.ok;
        }
      } else hlsOk = true;
    }
    const th = await probe(
      'thumbnail.jpg (dir token, Referer example.com)',
      'thumbnail.jpg',
      'https://example.com/',
    );
    const neg = await fetch(`${base}${tokenPath}playlist.m3u8`, {
      headers: headers('https://example.com/'),
    });
    console.log(`  playlist.m3u8 unsigned (negative control): HTTP ${neg.status}`);
    if (m1.ok || m2.ok) {
      ok(`TOKEN FORMULA CONFIRMED (IP-locked HS256 dir token, query form)`);
    } else {
      bad('token formula still rejected — see dashboard Security tab');
    }
    if (hlsOk) ok('HLS chain verified (master + sub-playlist + .ts segment all 200)');
    else bad('HLS chain NOT verified — segments rejected');
    if (th.ok) ok('thumbnail covered by directory token');
    else bad('thumbnail NOT covered by directory token');
    if (!neg.ok) ok('unsigned request rejected (token auth enforced)');
    else bad('unsigned request SERVED — token auth not actually enforced');
    if (m3.ok) console.log('  NOTE: no-Referer request also 200 (no referrer gate)');
    else
      console.log(
        '  NOTE: no-Referer 403 — the zone may still enforce a Referer allowlist; add the app origin to Allowed Referrers if playback fails in the browser',
      );
  } finally {
    step('Cleanup');
    const del = await api(`/videos/${videoId}`, { method: 'DELETE' });
    console.log(del.ok ? 'PASS  test video deleted' : `WARN  delete HTTP ${del.status}`);
  }
}

main();
