/**
 * advisor-replica.mjs — TEMP diagnostic: replicates Supabase Security Advisor
 * checks against the embedded harness DB (shim + migrations), prints findings.
 * Run: node advisor-replica.mjs  (from tests/local)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const DATA_DIR = path.join(__dirname, '.advisor-pgdata');
const SHIM = path.join(__dirname, 'auth-shim.sql');
const PORT = 54331;

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
    try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {}
  }
  const pidFile = path.join(DATA_DIR, 'postmaster.pid');
  if (fs.existsSync(pidFile)) fs.rmSync(pidFile, { force: true });

  const cjs = await import('embedded-postgres');
  const mod = cjs.default ?? cjs;
  const EP = mod.default ?? mod;
  const embedded = new EP({ databaseDir: DATA_DIR, user: 'postgres', password: 'postgres', port: PORT, persistent: true });

  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  await embedded.initialise();
  await embedded.start();

  const { default: pg } = await import('pg');
  const client = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres', database: 'postgres' });
  await client.connect();

  const apply = async (file) => { await client.query(fs.readFileSync(file, 'utf8')); };
  await apply(SHIM);
  const migrations = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const m of migrations) await apply(path.join(MIGRATIONS_DIR, m));
  console.log('shim + migrations applied');

  const checks = [
    {
      name: 'A. RLS disabled on tables (public schema)',
      sql: `SELECT n.nspname, c.relname
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema','storage','auth','tests')
               AND NOT c.relrowsecurity
             ORDER BY 1,2`,
    },
    {
      name: 'B. RLS enabled but ZERO policies',
      sql: `SELECT n.nspname, c.relname
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema','storage','auth','tests')
               AND c.relrowsecurity
               AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = n.nspname AND p.tablename = c.relname)
             ORDER BY 1,2`,
    },
    {
      name: 'C. Policies exist but RLS disabled',
      sql: `SELECT DISTINCT p.schemaname, p.tablename
              FROM pg_policies p JOIN pg_class c ON c.relname = p.tablename
              JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname
             WHERE NOT c.relrowsecurity
             ORDER BY 1,2`,
    },
    {
      name: 'D. Functions executable by PUBLIC',
      sql: `SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
               AND has_function_privilege('public', p.oid, 'EXECUTE')
             ORDER BY 2`,
    },
    {
      name: 'E. SECURITY DEFINER without pinned search_path',
      sql: `SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proconfig
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.prosecdef
               AND NOT EXISTS (
                 SELECT 1 FROM unnest(p.proconfig) pc WHERE pc LIKE 'search_path=%'
               )
             ORDER BY 2`,
    },
    {
      name: 'E2. SECURITY DEFINER search_path values',
      sql: `SELECT p.proname, (SELECT string_agg(pc, ';') FROM unnest(p.proconfig) pc) AS proconfig
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.prosecdef
             ORDER BY 1`,
    },
    {
      name: 'F. SECURITY DEFINER views / security_barrier views',
      sql: `SELECT n.nspname, c.relname, c.reloptions
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind = 'v' AND n.nspname NOT IN ('pg_catalog','information_schema')
               AND (
                 c.reloptions IS NOT NULL
                 AND (SELECT count(*) FROM unnest(c.reloptions) ro WHERE ro LIKE 'security_barrier=%' OR ro LIKE 'security_invoker=%') > 0
               )
             ORDER BY 1,2`,
    },
    {
      name: 'G. Installed extensions vs hosted allowlist',
      sql: `SELECT e.extname, e.extversion FROM pg_extension e ORDER BY 1`,
    },
    {
      name: 'H. Roles with SUPERUSER / CREATEDB / CREATEROLE',
      sql: `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
              FROM pg_roles
             WHERE rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls
             ORDER BY 1`,
    },
    {
      name: 'I. anon/authenticated table privileges (public)',
      sql: `SELECT grantee, table_schema, table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
              FROM information_schema.role_table_grants
             WHERE grantee IN ('anon','authenticated') AND table_schema = 'public'
             GROUP BY 1,2,3 ORDER BY 1,3`,
    },
    {
      name: 'J. anon/authenticated function EXECUTE (public)',
      sql: `SELECT grantee, routine_name
              FROM information_schema.role_routine_grants
             WHERE grantee IN ('anon','authenticated') AND routine_schema = 'public'
             ORDER BY 1,2`,
    },
    {
      name: 'K. PUBLIC usage on schemas (writable public schema)',
      sql: `SELECT nspname, pg_catalog.has_schema_privilege('public', nspname, 'CREATE') AS public_can_create
              FROM pg_namespace WHERE nspname IN ('public','storage','auth') ORDER BY 1`,
    },
    {
      name: 'L. Index count (fresh DB = candidate "unused index" suggestions)',
      sql: `SELECT count(*) AS indexes FROM pg_indexes WHERE schemaname = 'public'`,
    },
    {
      name: 'M. Tables in storage schema (RLS state)',
      sql: `SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'storage' AND c.relkind = 'r' ORDER BY 2`,
    },
  ];

  for (const ch of checks) {
    console.log(`\n=== ${ch.name} ===`);
    try {
      const r = await client.query(ch.sql);
      if (r.rows.length === 0) { console.log('  (none)'); continue; }
      for (const row of r.rows) {
        console.log('  ' + Object.values(row).join(' | '));
      }
    } catch (e) {
      console.log('  ERROR: ' + e.message.split('\n')[0]);
    }
  }

  await client.end();
  await embedded.stop();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
