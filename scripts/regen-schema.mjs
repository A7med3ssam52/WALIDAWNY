// regen-schema.mjs — REBUILDS supabase-full-schema.sql from scratch as a
// single-file snapshot of supabase/migrations/*.sql (in filename order):
//   * header range is derived dynamically (0001..<last migration number>)
//   * every migration is included with its exact marker block, so stale
//     or missing sections are impossible (fix for review finding MED-4)
//   * byte-verifies the result (LF endings, no BOM, trailing single
//     newline, marker count == migration count)
/* global Buffer, console */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..'); // repo root
const SCHEMA = path.join(ROOT, 'supabase', 'supabase-full-schema.sql');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');

const migrations = fs
  .readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const last = migrations[migrations.length - 1];
const lastNumber = last.match(/^(\d{4})_/)?.[1];
if (!lastNumber) throw new Error(`cannot derive migration number from ${last}`);

// 1) header (dynamic range)
const header =
  '-- =====================================================================\n' +
  '-- supabase-full-schema.sql - consolidated Phase 1 schema\n' +
  '-- ---------------------------------------------------------------------\n' +
  `-- Single-file snapshot of supabase/migrations/0001..${lastNumber}, concatenated\n` +
  '-- in filename order. Apply ONCE to a fresh project; incremental changes\n' +
  '-- always go into new numbered migration files (never edit this file).\n' +
  '-- Verified by the embedded-PostgreSQL harness (tests/local).\n' +
  '-- =====================================================================\n' +
  '\n';

// 2) concatenate every migration with its marker block
const sections = migrations.map((file) => {
  const content = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8').replace(/\r\n/g, '\n');
  const normalized = content.replace(/\n+$/, '') + '\n';
  return (
    '-- =====================================================================\n' +
    `-- >>> included from migrations\\${file}\n` +
    '-- =====================================================================\n' +
    '\n' +
    normalized
  );
});

const expected = header + sections.join('\n');

// 3) byte-verify: no BOM, LF only, trailing single newline, marker count
const buf = Buffer.from(expected, 'utf8');
if (buf.length !== Buffer.byteLength(expected, 'utf8')) throw new Error('length mismatch');
if ((expected.match(/\r\n/g) ?? []).length > 0) throw new Error('CRLF introduced');
if (expected.charCodeAt(0) === 0xfeff) throw new Error('BOM introduced');
if (!expected.endsWith('\n')) throw new Error('file must end with a single newline');
const markers = (expected.match(/-- >>> included from migrations\\/g) ?? []).length;
if (markers !== migrations.length)
  throw new Error(`expected ${migrations.length} markers, got ${markers}`);

fs.writeFileSync(SCHEMA, expected, 'utf8');
console.log(
  `regen OK: ${buf.length} bytes, ${markers} markers, LF-only, no BOM (range 0001..${lastNumber})`,
);
