/* migrate-exam-images-to-cloudinary.mjs — one-off migration of legacy
 * Supabase Storage exam images (<exam_id>/<uuid>.<ext>) to Cloudinary
 * (type=authenticated, public_id exam-images/<exam_id>/<fresh-uuid>).
 *
 * Reads every exam_questions row carrying image pointers, and for each
 * LEGACY pointer:
 *   1. downloads the bytes from the private `exam-images` bucket,
 *   2. signed-uploads them to Cloudinary (server-side signature),
 *   3. rewrites the pointer in place to
 *      cloudinary:exam-images/<exam_id>/<uuid>.<ext>:<version>
 *      (prompt_image_path + choice_image_paths order/nulls preserved).
 * Already-migrated (cloudinary:...) pointers are skipped; a final
 * verification recounts remaining legacy pointers.
 *
 * Usage (PowerShell):
 *   # dry run (default — no writes):
 *   node scripts/migrate-exam-images-to-cloudinary.mjs
 *   # execute:
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service-role key>"
 *   $env:CLOUDINARY_CLOUD_NAME="<cloud>"
 *   $env:CLOUDINARY_API_KEY="<key>"
 *   $env:CLOUDINARY_API_SECRET="<secret>"
 *   node scripts/migrate-exam-images-to-cloudinary.mjs --apply
 *
 * Secrets travel ONLY via environment variables — never commit them.
 * The legacy bucket objects are LEFT IN PLACE; delete them (and the
 * bucket) in a later cleanup step after a week of stable reads.
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
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/i;

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

async function listQuestionRows() {
  const rows = [];
  let from = 0;
  for (;;) {
    const res = await supabaseFetch(
      `/rest/v1/exam_questions?select=id,exam_id,prompt_image_path,choice_image_paths&or=(prompt_image_path.not.is.null,choice_image_paths.not.is.null)&order=id&limit=${PAGE_SIZE}&offset=${from}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) {
      throw new Error(`exam_questions list failed: HTTP ${res.status}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function downloadLegacyImage(legacyPath) {
  const res = await supabaseFetch(`/storage/v1/object/exam-images/${legacyPath}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`storage download failed: HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) return null;
  return { bytes: buffer, contentType: res.headers.get('content-type') ?? 'image/jpeg' };
}

async function uploadToCloudinary(examId, bytes, contentType) {
  const imageId = crypto.randomUUID();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const publicId = `exam-images/${examId}/${imageId}`;
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
  form.append('file', new Blob([bytes], { type: contentType }), 'image');
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
  return `cloudinary:exam-images/${examId}/${imageId}.${format}:${version}`;
}

async function main() {
  requireEnv();
  console.log(
    `mode: ${APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (no writes — pass --apply to execute)'}`,
  );

  const rows = await listQuestionRows();
  console.log(`question rows carrying images: ${rows.length}`);

  const stats = { images: 0, rowsTouched: 0, skipped: 0, missingBytes: 0, failed: 0 };
  const failures = [];

  for (const row of rows) {
    const examId = String(row.exam_id ?? '');
    let nextPrompt = row.prompt_image_path ?? null;
    let nextChoices = Array.isArray(row.choice_image_paths) ? [...row.choice_image_paths] : null;
    let changed = false;

    const migrateOne = async (legacyPath) => {
      const file = await downloadLegacyImage(legacyPath);
      if (!file) {
        stats.missingBytes += 1;
        console.log(`- row ${row.id}: storage object missing (${legacyPath}), left as-is`);
        return legacyPath;
      }
      if (!APPLY) {
        stats.images += 1;
        return `cloudinary:exam-images/${examId}/<new-uuid>:<version>`;
      }
      const pointer = await uploadToCloudinary(examId, file.bytes, file.contentType);
      stats.images += 1;
      return pointer;
    };

    try {
      if (typeof nextPrompt === 'string' && LEGACY_RE.test(nextPrompt)) {
        nextPrompt = await migrateOne(nextPrompt);
        changed = true;
      }
      if (Array.isArray(nextChoices)) {
        for (let i = 0; i < nextChoices.length; i += 1) {
          const item = nextChoices[i];
          if (typeof item === 'string' && LEGACY_RE.test(item)) {
            nextChoices[i] = await migrateOne(item);
            changed = true;
          }
        }
      }
      if (!changed) {
        stats.skipped += 1;
        continue;
      }
      if (APPLY) {
        const res = await supabaseFetch(`/rest/v1/exam_questions?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ prompt_image_path: nextPrompt, choice_image_paths: nextChoices }),
        });
        if (!res.ok) {
          throw new Error(`question bind failed: HTTP ${res.status}`);
        }
        stats.rowsTouched += 1;
        console.log(`- row ${row.id}: migrated`);
      } else {
        stats.rowsTouched += 1;
      }
    } catch (error) {
      stats.failed += 1;
      failures.push(`${row.id}: ${error instanceof Error ? error.message : String(error)}`);
      console.log(
        `- row ${row.id}: FAILED (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  // Verification recount (fresh read).
  const after = await listQuestionRows();
  const remainingLegacy = after.filter((row) => {
    const promptLegacy =
      typeof row.prompt_image_path === 'string' && LEGACY_RE.test(row.prompt_image_path);
    const choicesLegacy =
      Array.isArray(row.choice_image_paths) &&
      row.choice_image_paths.some((item) => typeof item === 'string' && LEGACY_RE.test(item));
    return promptLegacy || choicesLegacy;
  }).length;

  console.log('--- report ---');
  console.log(`images migrated: ${stats.images}`);
  console.log(`rows touched: ${stats.rowsTouched}`);
  console.log(`rows skipped (already cloudinary): ${stats.skipped}`);
  console.log(`missing storage bytes (left as-is): ${stats.missingBytes}`);
  console.log(`failed rows: ${stats.failed}`);
  for (const failure of failures) console.log(`  FAIL ${failure}`);
  console.log(`rows still holding legacy pointers: ${remainingLegacy}`);

  if (stats.failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
