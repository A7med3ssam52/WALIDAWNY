/* migrate-avatars-to-cloudinary.mjs — one-off migration of legacy
 * Supabase Storage avatars (<uid>/avatar.ext) to Cloudinary
 * (type=authenticated, public_id avatars/<uid>/avatar).
 *
 * Reads every profiles.avatar_path, and for each LEGACY pointer:
 *   1. downloads the bytes from the private `avatars` bucket,
 *   2. signed-uploads them to Cloudinary (server-side signature),
 *   3. rewrites avatar_path to cloudinary:<uid>/avatar.<ext>:<version>.
 * Already-migrated (cloudinary:...) pointers are skipped; a final
 * verification recounts remaining legacy pointers.
 *
 * Usage (PowerShell):
 *   # dry run (default — no writes):
 *   node scripts/migrate-avatars-to-cloudinary.mjs
 *   # execute:
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service-role key>"
 *   $env:CLOUDINARY_CLOUD_NAME="<cloud>"
 *   $env:CLOUDINARY_API_KEY="<key>"
 *   $env:CLOUDINARY_API_SECRET="<secret>"
 *   node scripts/migrate-avatars-to-cloudinary.mjs --apply
 *
 * Secrets travel ONLY via environment variables — never commit them.
 * The legacy bucket objects are LEFT IN PLACE; delete them (and the
 * avatars_* storage policies) in a later cleanup migration after a
 * week of stable reads.
 */
/* global console, process */
import crypto from 'node:crypto';

const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 200;

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? '';
const API_KEY = process.env.CLOUDINARY_API_KEY ?? '';
const API_SECRET = process.env.CLOUDINARY_API_SECRET ?? '';

const LEGACY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar\.(jpg|jpeg|png|webp)$/i;

function sha1hex(input) {
  return crypto.createHash('sha1').update(input, 'utf8').digest('hex');
}

function requireEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!CLOUD_NAME) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!API_KEY) missing.push('CLOUDINARY_API_KEY');
  if (!API_SECRET) missing.push('CLOUDINARY_API_SECRET');
  if (missing.length > 0) {
    console.error(`missing env vars: ${missing.join(', ')}`);
    process.exit(2);
  }
}

async function supabaseFetch(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(init.headers ?? {}),
    },
  });
  return res;
}

async function listProfilesWithAvatars() {
  const rows = [];
  let from = 0;
  for (;;) {
    const res = await supabaseFetch(
      `/rest/v1/profiles?select=id,avatar_path&avatar_path=not.is.null&order=id&limit=${PAGE_SIZE}&offset=${from}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) {
      throw new Error(`profiles list failed: HTTP ${res.status}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function downloadLegacyAvatar(legacyPath) {
  const res = await supabaseFetch(`/storage/v1/object/avatars/${legacyPath}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`storage download failed: HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) return null;
  return { bytes: buffer, contentType: res.headers.get('content-type') ?? 'image/jpeg' };
}

async function uploadToCloudinary(uid, bytes, contentType) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const publicId = `avatars/${uid}/avatar`;
  const params = {
    invalidate: 'true',
    overwrite: 'true',
    public_id: publicId,
    timestamp,
    type: 'authenticated',
  };
  const signature = sha1hex(
    Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&') + API_SECRET,
  );
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: contentType }), 'avatar');
  form.append('api_key', API_KEY);
  form.append('timestamp', timestamp);
  form.append('public_id', publicId);
  form.append('type', 'authenticated');
  form.append('overwrite', 'true');
  form.append('invalidate', 'true');
  form.append('signature', signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`cloudinary upload failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const payload = await res.json();
  const version = String(payload.version ?? '');
  const format = String(payload.format ?? '').toLowerCase();
  if (!/^[0-9]+$/.test(version) || !/^(jpg|jpeg|png|webp)$/.test(format)) {
    throw new Error(
      `cloudinary returned an unusable asset: ${JSON.stringify(payload).slice(0, 200)}`,
    );
  }
  return `cloudinary:${uid}/avatar.${format}:${version}`;
}

async function bindPointer(uid, pointer) {
  const res = await supabaseFetch(`/rest/v1/profiles?id=eq.${uid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ avatar_path: pointer }),
  });
  if (!res.ok) {
    throw new Error(`profile bind failed: HTTP ${res.status}`);
  }
}

async function main() {
  requireEnv();
  console.log(
    `mode: ${APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (no writes — pass --apply to execute)'}`,
  );

  const rows = await listProfilesWithAvatars();
  console.log(`profiles with an avatar: ${rows.length}`);

  const stats = { migrated: 0, skipped: 0, missingBytes: 0, failed: 0 };
  const failures = [];

  for (const row of rows) {
    const uid = String(row.id ?? '');
    const current = String(row.avatar_path ?? '');
    if (!LEGACY_RE.test(current)) {
      stats.skipped += 1; // already migrated or foreign — never touch
      continue;
    }
    try {
      const file = await downloadLegacyAvatar(current);
      if (!file) {
        stats.missingBytes += 1;
        console.log(`- ${uid}: storage object missing, left as-is`);
        continue;
      }
      if (!APPLY) {
        stats.migrated += 1; // would migrate
        continue;
      }
      const pointer = await uploadToCloudinary(uid, file.bytes, file.contentType);
      await bindPointer(uid, pointer);
      stats.migrated += 1;
      console.log(`- ${uid}: migrated -> ${pointer}`);
    } catch (error) {
      stats.failed += 1;
      failures.push(`${uid}: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`- ${uid}: FAILED (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  // Verification recount (fresh read).
  const after = await listProfilesWithAvatars();
  const remainingLegacy = after.filter((row) =>
    LEGACY_RE.test(String(row.avatar_path ?? '')),
  ).length;

  console.log('--- report ---');
  console.log(`migrated: ${stats.migrated}`);
  console.log(`skipped (already cloudinary): ${stats.skipped}`);
  console.log(`missing storage bytes (left as-is): ${stats.missingBytes}`);
  console.log(`failed: ${stats.failed}`);
  for (const failure of failures) console.log(`  FAIL ${failure}`);
  console.log(`remaining legacy pointers: ${remainingLegacy}`);

  if (stats.failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
