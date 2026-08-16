// regen-schema.mjs — REBUILDS supabase-full-schema.sql from scratch as a
// single-file snapshot of supabase/migrations/*.sql (in filename order):
//   * header range is derived dynamically (0001..<last migration number>)
//   * every migration is included with its exact marker block, so stale
//     or missing sections are impossible (fix for review finding MED-4)
//   * legacy migrations 0001-0026 are filtered at STATEMENT level: any
//     statement whose text matches a banned subscription pattern is
//     dropped, EXCEPT when it mixes a banned reference with legit content
//     (e.g. trigger loops that also cover legit tables) — those are kept
//     verbatim and logged as notes. Migrations 0027+ are kept verbatim
//     (0028_units_purchase.sql intentionally DROPs the subscription
//     objects, so its removal statements must survive).
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

// ---------------------------------------------------------------------------
// banned subscription patterns (post-0028 these only appear in 0028's own
// intentional removal statements)
// ---------------------------------------------------------------------------
const FORBIDDEN_PAT =
  /subscriptions|pricing_plan|subscription_codes|code_redemptions|subscription_status|subscription_activated|subscription_expiring|subscription_expired|expiry_warning_days|v_active_subscriptions|expire_subscriptions/i;

// legit public objects that must survive (final-schema surfaces)
const LEGIT_RE =
  /\b(profiles|grades|units|lessons|lesson_videos|lesson_pdfs|progress|notifications|audit_logs|app_settings|unit_pricing|unit_codes|unit_purchases|exams|exam_questions|exam_attempts|exam_answers|lesson_comments)\b/i;

// forbidden object names (their presence makes a statement suspicious)
const FORBIDDEN_OBJ_RE =
  /\b(pricing_plans|subscriptions|subscription_codes|code_redemptions|v_active_subscriptions|subscription_status|expire_subscriptions|redeem_subscription_code|get_my_subscriptions|get_my_current_subscription|create_manual_subscription|revoke_subscription_code|set_pricing_plan|delete_pricing_plan|create_codes_for_staff|generate_codes_internal)\b/i;

// statements whose primary subject is a legit public object even though the
// stripped text mentions a forbidden object
const MIXED_EXPLICIT_RE =
  /COMMENT ON TABLE public\.app_settings|notification_type|set_updated_at|audit_trigger|notify_new_content|can_access_lesson|get_dashboard_stats|v_dashboard_metrics|v_lesson_access|v_student_progress_summary|app_settings|is_teacher|create_grade/i;

// statement whose subject IS a forbidden object -> PURE (drop)
const SUBJECT_FORBIDDEN_RE =
  /^(CREATE OR REPLACE FUNCTION|CREATE TABLE|ALTER TABLE|COMMENT ON TABLE|COMMENT ON VIEW|CREATE VIEW|CREATE INDEX|DROP INDEX|GRANT|REVOKE|CREATE POLICY|DROP POLICY|ALTER FUNCTION|CREATE OR REPLACE VIEW|DROP VIEW|DROP TYPE|CREATE TYPE)[\s\S]{0,80}?\b(pricing_plans|subscriptions|subscription_codes|code_redemptions|v_active_subscriptions|subscription_status|expire_subscriptions|redeem_subscription_code|get_my_subscriptions|get_my_current_subscription|create_manual_subscription|revoke_subscription_code|set_pricing_plan|delete_pricing_plan|create_codes_for_staff|generate_codes_internal)\b/i;

// ---------------------------------------------------------------------------
// $$-aware statement splitter. Each chunk keeps its trailing `;` plus any
// following blank lines, so dropping a chunk removes exactly that statement
// and re-joining the kept chunks reproduces the file byte-for-byte.
// Handles: line comments, block comments, single-quoted strings ('' escape),
// dollar-quoted strings ($$ or $tag$).
// ---------------------------------------------------------------------------
function splitStatements(sql) {
  const chunks = [];
  let cur = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const rest = sql.slice(i);
    if (c === '-' && sql[i + 1] === '-') {
      const eol = sql.indexOf('\n', i);
      const end = eol === -1 ? n : eol + 1;
      cur += sql.slice(i, end);
      i = end;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i);
      const stop = end === -1 ? n : end + 2;
      cur += sql.slice(i, stop);
      i = stop;
      continue;
    }
    const dm = rest.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
    if (dm) {
      cur += dm[0];
      i += dm[0].length;
      const tag = dm[0];
      const end = sql.indexOf(tag, i);
      if (end === -1) {
        cur += sql.slice(i);
        i = n;
      } else {
        cur += sql.slice(i, end + tag.length);
        i = end + tag.length;
      }
      continue;
    }
    if (c === "'") {
      cur += c;
      i++;
      while (i < n) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            cur += "''";
            i += 2;
            continue;
          }
          cur += "'";
          i++;
          break;
        }
        cur += sql[i];
        i++;
      }
      continue;
    }
    if (c === ';') {
      cur += ';';
      i++;
      let j = i;
      while (j < n && (sql[j] === ' ' || sql[j] === '\t' || sql[j] === '\n' || sql[j] === '\r')) j++;
      cur += sql.slice(i, j);
      i = j;
      chunks.push(cur);
      cur = '';
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

function stripComments(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    if (sql[i] === '-' && sql[i + 1] === '-') {
      const eol = sql.indexOf('\n', i);
      i = eol === -1 ? n : eol + 1;
    } else if (sql[i] === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i);
      i = end === -1 ? n : end + 2;
    } else {
      out += sql[i];
      i++;
    }
  }
  return out;
}

function firstMeaningfulLine(stmt) {
  for (const l of stmt.split('\n')) {
    const t = l.trim();
    if (t && !t.startsWith('--')) return t.slice(0, 90);
  }
  return '(comment-only)';
}

function isLegacy(file) {
  const num = parseInt(file.slice(0, 4), 10);
  return Number.isInteger(num) && num >= 1 && num <= 26;
}

function filterMigration(content, file) {
  if (!isLegacy(file)) return { text: content, dropped: 0, mixed: 0 };
  let out = '';
  let dropped = 0;
  let mixed = 0;
  for (const chunk of splitStatements(content)) {
    if (!FORBIDDEN_PAT.test(chunk)) {
      out += chunk;
      continue;
    }
    const code = stripComments(chunk);
    const hasLegit = LEGIT_RE.test(code);
    const subjectForbidden = SUBJECT_FORBIDDEN_RE.test(code.trimStart());
    const isMixed = !subjectForbidden && (hasLegit || MIXED_EXPLICIT_RE.test(code));
    if (isMixed) {
      out += chunk;
      mixed++;
      console.log(`  keep(mixed): ${file} | ${firstMeaningfulLine(chunk)}`);
    } else {
      dropped++;
      console.log(`  drop: ${file} | ${firstMeaningfulLine(chunk)}`);
    }
  }
  return { text: out, dropped, mixed };
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------
const migrations = fs
  .readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const last = migrations[migrations.length - 1];
const lastNumber = last.match(/^(\d{4})_/)?.[1];
if (!lastNumber) throw new Error(`cannot derive migration number from ${last}`);

const header =
  '-- =====================================================================\n' +
  '-- supabase-full-schema.sql - consolidated Phase 1 schema\n' +
  '-- ---------------------------------------------------------------------\n' +
  `-- Single-file snapshot of supabase/migrations/0001..${lastNumber}, concatenated\n` +
  '-- in filename order. Apply ONCE to a fresh project; incremental changes\n' +
  '-- always go into new numbered migration files (never edit this file).\n' +
  '-- Statements from legacy migrations 0001-0026 that reference the removed\n' +
  '-- subscription subsystem are dropped at regen time; mixed statements are\n' +
  '-- kept and logged as notes. 0028_units_purchase.sql performs the actual\n' +
  '-- DROP of the subscription objects.\n' +
  '-- Verified by the embedded-PostgreSQL harness (tests/local).\n' +
  '-- =====================================================================\n' +
  '\n';

let totalDropped = 0;
let totalMixed = 0;
const sections = migrations.map((file) => {
  const raw = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8').replace(/\r\n/g, '\n');
  const filtered = filterMigration(raw, file);
  totalDropped += filtered.dropped;
  totalMixed += filtered.mixed;
  const content = filtered.text.replace(/\n+$/, '') + '\n';
  return (
    '-- =====================================================================\n' +
    `-- >>> included from migrations\\${file}\n` +
    '-- =====================================================================\n' +
    '\n' +
    content
  );
});

const expected = header + sections.join('\n');

// ---------------------------------------------------------------------------
// byte-verify: no BOM, LF only, trailing single newline, marker count
// ---------------------------------------------------------------------------
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
console.log(
  `schema-filter: dropped ${totalDropped} forbidden statement(s), kept ${totalMixed} mixed statement(s) with notes above`,
);
