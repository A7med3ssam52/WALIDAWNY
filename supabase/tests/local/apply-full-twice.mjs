/**
 * apply-full-twice.mjs — validates supabase-full-schema.sql against BOTH
 * target states:
 *   PASS 1: a fresh project (subscription tables exist until 0028 drops them)
 *   PASS 2: the SAME database re-applied (subscription objects already gone,
 *           i.e. the exact shape of the live remote DB that failed with 42P01)
 * then runs every assertion suite to prove the final schema is intact.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(__dirname, '.pgdata');
const SHIM = path.join(__dirname, 'auth-shim.sql');
const FULL = path.join(ROOT, 'supabase-full-schema.sql');
const SQL_DIR = path.join(__dirname, 'sql');
const PORT = 54330;

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
  if (fs.existsSync(pidFile)) fs.rmSync(pidFile, { force: true });
}

async function main() {
  log('=== apply-full-twice validation ===');
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

  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  await embedded.initialise();
  await embedded.start();
  log('[boot] postgres up on ' + PORT);

  const { default: pg } = await import('pg');
  const client = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres', database: 'postgres' });
  await client.connect();

  let ok = true;

  async function apply(label, file) {
    const t0 = Date.now();
    try {
      await client.query(fs.readFileSync(file, 'utf8'));
      log(`[apply] ${label.padEnd(30)} PASS (${Date.now() - t0}ms)`);
      return true;
    } catch (e) {
      log(`[apply] ${label.padEnd(30)} FAIL (${Date.now() - t0}ms)`);
      const msgLines = String(e.message).split('\n').slice(0, 3);
      for (const l of msgLines) log('        ' + l);
      const full = String(e.message);
      const lineM = full.match(/LINE (\d+)/);
      if (lineM) log('        [pg] ' + lineM[0]);
      const stmtM = full.match(/STATEMENT:\s*([\s\S]{0,300})/);
      if (stmtM) log('        [pg stmt] ' + stmtM[1].replace(/\s+/g, ' ').slice(0, 260));
      if (e.position && file === FULL) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        const n = parseInt(e.position, 10);
        let lineNo = 1;
        let acc = 0;
        for (const l of lines) {
          acc += Buffer.byteLength(l, 'utf8') + 1;
          if (acc >= n) break;
          lineNo++;
        }
        log(`        at file line ~${lineNo}: ${String(lines[lineNo - 1] ?? '').trim().slice(0, 120)}`);
      }
      return false;
    }
  }

  ok = (await apply('auth-shim.sql', SHIM)) && ok;
  ok = (await apply('FULL SCHEMA pass 1 (fresh)', FULL)) && ok;
  ok = (await apply('FULL SCHEMA pass 2 (re-run)', FULL)) && ok;

  const suites = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
  log('');
  for (const s of suites) {
    const t0 = Date.now();
    try {
      await client.query(fs.readFileSync(path.join(SQL_DIR, s), 'utf8'));
      log(`[test ] ${s.padEnd(30)} PASS (${Date.now() - t0}ms)`);
    } catch (e) {
      ok = false;
      log(`[test ] ${s.padEnd(30)} FAIL (${Date.now() - t0}ms)`);
      log('        ' + e.message.split('\n')[0]);
    }
  }

  await client.end();
  try {
    await embedded.stop();
    log('[boot] postgres stopped cleanly');
  } catch {
    log('[boot] warning: stop failed');
  }

  log('');
  log(ok ? 'ALL GREEN' : 'FAILED');
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
