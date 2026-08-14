/**
 * run-tests.mjs — Phase 1 local verification harness.
 *
 * Booting an embedded PostgreSQL 18.4 instance on port 54329
 * (databaseDir: supabase/tests/local/.pgdata, user/password postgres),
 * then:
 *   1. applies auth-shim.sql      (auth/storage shims + test roles)
 *   2. applies every migration in supabase/migrations/ in filename order
 *   3. runs the assertion suites in tests/local/sql/ in filename order
 *
 * Prints PASS/FAIL per file and exits non-zero on any failure.
 * A fresh `npm install` is needed once; afterwards `npm start`.
 *
 * Prerequisites (documented in tests/local/README.md): Node 18+.
 * Docker is NOT required — no container stack is used.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..'); // supabase/
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const SQL_DIR = path.join(__dirname, 'sql');
const DATA_DIR = path.join(__dirname, '.pgdata');
const SHIM = path.join(__dirname, 'auth-shim.sql');
const PORT = 54329;

let failures = 0;
let passes = 0;

function log(line) {
  console.log(line);
}

function findPidsOnPort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (line.includes(`:${port}`) && /LISTENING|ESTABLISHED/.test(line)) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid)) pids.add(pid);
      }
    }
    return [...pids];
  } catch {
    return [];
  }
}

function killStalePostgres() {
  for (const pid of findPidsOnPort(PORT)) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      log(`  killed stale postgres pid ${pid} on port ${PORT}`);
    } catch {
      /* already gone */
    }
  }
  const pidFile = path.join(DATA_DIR, 'postmaster.pid');
  if (fs.existsSync(pidFile)) {
    fs.rmSync(pidFile, { force: true });
    log('  removed stale postmaster.pid');
  }
}

function readSql(file) {
  return fs.readFileSync(file, 'utf8');
}

async function main() {
  log('=== منصة مستر وليد عونى التعليمية - Phase 1 verification harness ===');
  log('target       : embedded PostgreSQL 18.4 on 127.0.0.1:' + PORT);
  log('databaseDir  : ' + DATA_DIR);
  log('migrations   : ' + MIGRATIONS_DIR);
  log('');

  killStalePostgres();

  const cjs = await import('embedded-postgres');
  const mod = cjs.default ?? cjs;
  const EP = mod.default ?? mod;

  const embedded = new EP({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: true,
  });

  // Deterministic runs: migrations are not idempotent, so the cluster is
  // wiped before every run (fresh initdb + full re-apply).
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  log('[boot] wiped cluster state');
  await embedded.initialise();
  log('[boot] starting postgres ...');
  await embedded.start();
  log('[boot] postgres is up');

  const { default: pg } = await import('pg');
  const client = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres', database: 'postgres' });
  await client.connect();

  async function applyFile(label, file) {
    const t0 = Date.now();
    try {
      await client.query(readSql(file));
      const ms = Date.now() - t0;
      log(`[apply] ${label.padEnd(34)} PASS (${ms}ms)`);
      return true;
    } catch (e) {
      const ms = Date.now() - t0;
      log(`[apply] ${label.padEnd(34)} FAIL (${ms}ms)`);
      log(`        ${e.message.split('\n')[0]}`);
      log(`        ${(e.detail || '').split('\n')[0]}`);
      return false;
    }
  }

  let ok = true;

  ok = (await applyFile('auth-shim.sql', SHIM)) && ok;

  const migrations = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const m of migrations) {
    ok = (await applyFile(m, path.join(MIGRATIONS_DIR, m))) && ok;
  }

  const suites = fs
    .readdirSync(SQL_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  log('');
  for (const s of suites) {
    const t0 = Date.now();
    try {
      await client.query(readSql(path.join(SQL_DIR, s)));
      const ms = Date.now() - t0;
      passes += 1;
      log(`[test ] ${s.padEnd(34)} PASS (${ms}ms)`);
    } catch (e) {
      failures += 1;
      const ms = Date.now() - t0;
      log(`[test ] ${s.padEnd(34)} FAIL (${ms}ms)`);
      log(`        ${e.message.split('\n')[0]}`);
      const where = (e.message.match(/CONTEXT:\s*(.*)/) || [])[1];
      if (where) log(`        ${where}`);
    }
  }

  // ------------------------------------------------------------------
  // HIGH-3: two parallel first-insert upsert_progress calls for the same
  // (student, lesson) must BOTH succeed (atomic INSERT ... ON CONFLICT,
  // no SELECT ... FOR UPDATE) and converge to one row with monotonic
  // percent (GREATEST), irreversible is_completed, and a last-write-wins
  // position (100 or 7 - the ordering of the two commits).
  // ------------------------------------------------------------------
  {
    const t0 = Date.now();
    try {
      await client.query(`
        INSERT INTO public.units (id, grade_id, name, sort_order, status, deleted_at)
        VALUES ('30000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', 'Race Unit', 98, 'published', NULL)
        ON CONFLICT (id) DO UPDATE SET status = 'published', deleted_at = NULL;
        INSERT INTO public.lessons (id, unit_id, title, sort_order, status, deleted_at)
        VALUES ('40000000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-00000000000c', 'Race Lesson', 98, 'published', NULL)
        ON CONFLICT (id) DO UPDATE SET status = 'published', deleted_at = NULL;
        DELETE FROM public.progress
        WHERE student_id = '70000000-0000-0000-0000-000000000001'
          AND lesson_id = '40000000-0000-0000-0000-000000000012';
      `);

      const conn = { host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres', database: 'postgres' };
      const c1 = new pg.Client(conn);
      const c2 = new pg.Client(conn);
      await c1.connect();
      await c2.connect();
      const call = (pos, pct) => [
        'BEGIN;',
        `SET LOCAL "app.current_user_id" = '70000000-0000-0000-0000-000000000001';`,
        'SET LOCAL ROLE student;',
        `SELECT public.upsert_progress('40000000-0000-0000-0000-000000000012', ${pos}, ${pct});`,
        'COMMIT;',
      ].join(' ');
      await Promise.all([c1.query(call(100, 55)), c2.query(call(7, 95))]);
      await c1.end();
      await c2.end();

      const check = await client.query(
        `SELECT percent_completed, position_seconds, is_completed
           FROM public.progress
          WHERE student_id = '70000000-0000-0000-0000-000000000001'
            AND lesson_id = '40000000-0000-0000-0000-000000000012'`);
      const row = check.rows[0];
      const mergedOk = row
        && Number(row.percent_completed) === 95
        && row.is_completed
        && (Number(row.position_seconds) === 100 || Number(row.position_seconds) === 7);
      if (!mergedOk) {
        throw new Error(`unexpected merged state: ${JSON.stringify(row)}`);
      }
      await client.query(
        `DELETE FROM public.progress
          WHERE student_id = '70000000-0000-0000-0000-000000000001'
            AND lesson_id = '40000000-0000-0000-0000-000000000012';`);
      log(`[test ] concurrency upsert_progress (HIGH-3)   PASS (${Date.now() - t0}ms)`);
      passes += 1;
    } catch (e) {
      failures += 1;
      log(`[test ] concurrency upsert_progress (HIGH-3)   FAIL (${Date.now() - t0}ms)`);
      log(`        ${e.message.split('\n')[0]}`);
    }
  }

  // ------------------------------------------------------------------
  // Phase 3 race: two students redeem the SAME code concurrently.
  // redeem_subscription_code (0006) serializes on an advisory xact lock
  // per code + FOR UPDATE + re-validation, so EXACTLY ONE attempt may
  // win: the loser must fail with code_already_used and the code must
  // end 'used' with exactly one subscription (code_redemptions UNIQUE
  // backstop). Two fresh student accounts (grade 1, no subscription)
  // race a freshly seeded available code.
  // ------------------------------------------------------------------
  {
    const RACE_CODE = 'WLDN-RACE-RACE-RACE';
    const RACE_CODE_ID = '90000000-0000-0000-0000-00000000deef';
    const raceStudents = [
      '70000000-0000-0000-0000-0000000000c1',
      '70000000-0000-0000-0000-0000000000c2',
    ];
    const t0 = Date.now();
    try {
      await client.query(`
        DELETE FROM public.notifications WHERE user_id IN ('${raceStudents[0]}', '${raceStudents[1]}');
        DELETE FROM public.code_redemptions WHERE code_id = '${RACE_CODE_ID}';
        DELETE FROM public.subscriptions WHERE code_id = '${RACE_CODE_ID}';
        DELETE FROM public.subscription_codes WHERE code = '${RACE_CODE}';
        DELETE FROM auth.users WHERE id IN ('${raceStudents[0]}', '${raceStudents[1]}');
        INSERT INTO public.subscription_codes (id, code, pricing_plan_id, status, created_by, created_at, note)
        VALUES ('${RACE_CODE_ID}', '${RACE_CODE}', '20000000-0000-0000-0000-000000000001', 'available',
                '70000000-0000-0000-0000-00000000000a', now(), 'RACE-FIXTURE');
        INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data) VALUES
          ('${raceStudents[0]}', 'test-race-1@walid.test', 'x',
           '{"full_name":"R1","phone":"+201001000091","guardian_phone":"+201001000091","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}'),
          ('${raceStudents[1]}', 'test-race-2@walid.test', 'x',
           '{"full_name":"R2","phone":"+201001000092","guardian_phone":"+201001000092","address":"Cairo","grade_id":"10000000-0000-0000-0000-000000000001"}');
        UPDATE public.profiles SET grade_id = '10000000-0000-0000-0000-000000000001'
        WHERE id IN ('${raceStudents[0]}', '${raceStudents[1]}');
      `);

      const conn = { host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres', database: 'postgres' };
      const c1 = new pg.Client(conn);
      const c2 = new pg.Client(conn);
      await c1.connect();
      await c2.connect();
      const call = (sid) => [
        'BEGIN;',
        `SET LOCAL "app.current_user_id" = '${sid}';`,
        'SET LOCAL ROLE student;',
        `SELECT public.redeem_subscription_code('${RACE_CODE}');`,
        'COMMIT;',
      ].join(' ');
      const outcomes = await Promise.allSettled([
        c1.query(call(raceStudents[0])),
        c2.query(call(raceStudents[1])),
      ]);
      await c1.end();
      await c2.end();

      const winners = outcomes.filter((o) => o.status === 'fulfilled');
      const losers = outcomes.filter((o) => o.status === 'rejected');
      const raceOk = winners.length === 1
        && losers.length === 1
        && String(losers[0].reason.message).includes('code_already_used');
      if (!raceOk) {
        throw new Error('expected exactly one winner and one code_already_used loser, got '
          + JSON.stringify(outcomes.map((o) => (o.status === 'fulfilled' ? 'ok' : String(o.reason.message).split('\n')[0]))));
      }

      const check = await client.query(`
        SELECT (SELECT count(*) FROM public.subscriptions WHERE code_id = '${RACE_CODE_ID}') AS sub_count,
               (SELECT status FROM public.subscription_codes WHERE id = '${RACE_CODE_ID}') AS code_status,
               (SELECT count(*) FROM public.code_redemptions WHERE code_id = '${RACE_CODE_ID}') AS redemption_count`);
      const mergedOk = Number(check.rows[0].sub_count) === 1
        && check.rows[0].code_status === 'used'
        && Number(check.rows[0].redemption_count) === 1;
      if (!mergedOk) {
        throw new Error(`unexpected redemption race outcome: ${JSON.stringify(check.rows[0])}`);
      }

      await client.query(`
        DELETE FROM public.notifications WHERE user_id IN ('${raceStudents[0]}', '${raceStudents[1]}');
        DELETE FROM public.code_redemptions WHERE code_id = '${RACE_CODE_ID}';
        DELETE FROM public.subscriptions WHERE code_id = '${RACE_CODE_ID}';
        DELETE FROM public.subscription_codes WHERE id = '${RACE_CODE_ID}';
        DELETE FROM auth.users WHERE id IN ('${raceStudents[0]}', '${raceStudents[1]}');
      `);
      log(`[test ] concurrency redeem_subscription_code (Phase 3) PASS (${Date.now() - t0}ms)`);
      passes += 1;
    } catch (e) {
      failures += 1;
      log(`[test ] concurrency redeem_subscription_code (Phase 3) FAIL (${Date.now() - t0}ms)`);
      log(`        ${e.message.split('\n')[0]}`);
    }
  }

  await client.end();
  try {
    await embedded.stop();
    log('[boot] postgres stopped cleanly');
  } catch {
    log('[boot] warning: postgres stop failed (process may need manual cleanup)');
  }

  log('');
  log(`=== suites passed: ${passes}, suites failed: ${failures} ===`);
  if (!ok) {
    log('!!! one or more migration files failed to apply !!!');
  }
  if (failures > 0 || !ok) {
    process.exitCode = 1;
  } else {
    log('ALL GREEN');
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
