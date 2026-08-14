import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const SHIM = path.join(__dirname, 'auth-shim.sql');
const DATA_DIR = path.join(__dirname, '.diagdata');
const PORT = 54330;

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

async function main() {
  for (const pid of findPidsOnPort(PORT)) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
    } catch {}
  }
  fs.rmSync(DATA_DIR, { recursive: true, force: true });

  const EPmod = await import('embedded-postgres');
  const EP = EPmod.default?.default ?? EPmod.default ?? EPmod;
  const embedded = new EP({ databaseDir: DATA_DIR, user: 'postgres', password: 'postgres', port: PORT, persistent: true });
  await embedded.initialise();
  await embedded.start();

  const { default: pg } = await import('pg');
  const client = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres', database: 'postgres' });
  await client.connect();
  await client.query(fs.readFileSync(SHIM, 'utf8'));
  const migrations = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const m of migrations) {
    try {
      await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, m), 'utf8'));
    } catch (e) {
      console.log('MIGRATION FAILED:', m, e.message.split('\n')[0]);
    }
  }

  const r = await client.query(`
    SELECT p.proname, p.proargnames IS NOT NULL AS has_args,
           format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     ORDER BY p.proname`);
  console.log('AUTHENTICATED-EXECUTABLE COUNT:', r.rows.length);
  for (const row of r.rows) console.log('  auth:', row.sig);

  const a = await client.query(`
    SELECT format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
     ORDER BY p.proname`);
  console.log('ANON-EXECUTABLE COUNT:', a.rows.length);
  for (const row of a.rows) console.log('  anon:', row.sig);

  await client.end();
  try {
    await embedded.stop();
  } catch {}
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});