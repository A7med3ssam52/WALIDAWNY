/**
 * advisor2.mjs — TEMP diagnostic: runs the canonical Supabase advisor lint
 * queries (from packages/pg-meta lints.ts) against the harness DB.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const DATA_DIR = path.join(__dirname, '.advisor2-pgdata');
const SHIM = path.join(__dirname, 'auth-shim.sql');
const PORT = 54332;

function killOn(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) {
      if (line.includes(`:${port}`) && /LISTENING|ESTABLISHED/.test(line)) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid)) { try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {} }
      }
    }
  } catch {}
  fs.rmSync(path.join(DATA_DIR, 'postmaster.pid'), { force: true });
}

const SCHEMAS_EXCLUDE = `('_timescaledb_cache','_timescaledb_catalog','_timescaledb_config','_timescaledb_internal','auth','cron','extensions','graphql','graphql_public','information_schema','net','pgmq','pgroonga','pgsodium','pgsodium_masks','pgtle','pgbouncer','pg_catalog','realtime','repack','storage','supabase_functions','supabase_migrations','tiger','topology','vault')`;

const lints = [
  {
    name: 'unindexed_foreign_keys (INFO)',
    sql: `with foreign_keys as (
      select cl.relnamespace::regnamespace::text as schema_name, cl.relname as table_name, cl.oid as table_oid,
             ct.conname as fkey_name, ct.conkey as col_attnums
        from pg_catalog.pg_constraint ct
        join pg_catalog.pg_class cl on ct.conrelid = cl.oid
        left join pg_catalog.pg_depend d on d.objid = cl.oid and d.deptype = 'e'
       where ct.contype = 'f' and d.objid is null
         and cl.relnamespace::regnamespace::text not in ('pg_catalog','information_schema','auth','storage','vault','extensions')
      ),
      index_ as (
        select pi.indrelid as table_oid, indexrelid::regclass as index_,
               string_to_array(indkey::text, ' ')::smallint[] as col_attnums
          from pg_catalog.pg_index pi where indisvalid
      )
      select fk.schema_name, fk.table_name, fk.fkey_name
        from foreign_keys fk
        left join index_ idx on fk.table_oid = idx.table_oid
             and fk.col_attnums = idx.col_attnums[1:array_length(fk.col_attnums, 1)]
        left join pg_catalog.pg_depend dep on idx.table_oid = dep.objid and dep.deptype = 'e'
       where idx.index_ is null and fk.schema_name not in ${SCHEMAS_EXCLUDE} and dep.objid is null
       order by 1,2,3`,
  },
  {
    name: 'auth_rls_initplan (WARN)',
    sql: `with policies as (
        select nsp.nspname as schema_name, pb.tablename as table_name, pc.relrowsecurity as is_rls_active,
               polname as policy_name, polpermissive as is_permissive, qual, with_check
          from pg_catalog.pg_policy pa
          join pg_catalog.pg_class pc on pa.polrelid = pc.oid
          join pg_catalog.pg_namespace nsp on pc.relnamespace = nsp.oid
          join pg_catalog.pg_policies pb on pc.relname = pb.tablename and nsp.nspname = pb.schemaname
           and pa.polname = pb.policyname
      )
      select schema_name, table_name, policy_name, qual
        from policies
       where is_rls_active and schema_name not in ${SCHEMAS_EXCLUDE}
         and ((qual like '%auth.uid()%' and lower(qual) not like '%select auth.uid()%')
           or (qual like '%auth.jwt()%' and lower(qual) not like '%select auth.jwt()%')
           or (qual like '%auth.role()%' and lower(qual) not like '%select auth.role()%')
           or (with_check like '%auth.uid()%' and lower(with_check) not like '%select auth.uid()%')
           or (with_check like '%auth.jwt()%' and lower(with_check) not like '%select auth.jwt()%')
           or (with_check like '%auth.role()%' and lower(with_check) not like '%select auth.role()%'))`,
  },
  {
    name: 'multiple_permissive_policies (WARN)',
    sql: `select n.nspname, c.relname, r.rolname, act.cmd, array_agg(p.polname order by p.polname) as policies
            from pg_catalog.pg_policy p
            join pg_catalog.pg_class c on p.polrelid = c.oid
            join pg_catalog.pg_namespace n on c.relnamespace = n.oid
            join pg_catalog.pg_roles r on p.polroles @> array[r.oid] or p.polroles = array[0::oid]
            left join pg_catalog.pg_depend dep on c.oid = dep.objid and dep.deptype = 'e',
            lateral (select x.cmd from unnest((select case p.polcmd
                when 'r' then array['SELECT'] when 'a' then array['INSERT']
                when 'w' then array['UPDATE'] when 'd' then array['DELETE']
                when '*' then array['SELECT','INSERT','UPDATE','DELETE'] else array['ERROR'] end)) x(cmd)) act(cmd)
           where c.relkind = 'r' and p.polpermissive and n.nspname not in ${SCHEMAS_EXCLUDE}
             and r.rolname not like 'pg_%' and r.rolname not like 'supabase%admin' and not r.rolbypassrls
             and dep.objid is null
           group by n.nspname, c.relname, r.rolname, act.cmd having count(1) > 1`,
  },
  {
    name: 'policy_exists_rls_disabled (ERROR)',
    sql: `select p.schemaname, p.tablename, array_agg(p.policyname) as policies
            from pg_policies p
            join pg_class c on c.relname = p.tablename
            join pg_namespace n on n.oid = c.relnamespace and n.nspname = p.schemaname
           where not c.relrowsecurity and p.schemaname not in ${SCHEMAS_EXCLUDE}
           group by 1,2`,
  },
  {
    name: 'rls_enabled_no_policy (INFO)',
    sql: `select n.nspname, c.relname
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where c.relkind = 'r' and c.relrowsecurity and n.nspname not in ${SCHEMAS_EXCLUDE}
             and not exists (select 1 from pg_policies p where p.schemaname = n.nspname and p.tablename = c.relname)`,
  },
  {
    name: 'rls_disabled_in_public (ERROR)',
    sql: `select n.nspname, c.relname
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where c.relkind = 'r' and not c.relrowsecurity
             and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))
             and n.nspname = 'public'`,
  },
  {
    name: 'function_search_path_mutable (WARN)',
    sql: `select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
            from pg_proc p join pg_namespace n on p.pronamespace = n.oid
            left join pg_depend dep on p.oid = dep.objid and dep.deptype = 'e'
           where n.nspname not in ${SCHEMAS_EXCLUDE} and dep.objid is null
             and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) cfg where cfg like 'search_path=%')`,
  },
  {
    name: 'extension_in_public (WARN)',
    sql: `select pe.extname, pe.extnamespace::regnamespace::text as schema
            from pg_extension pe where pe.extname not in ('plpgsql') and pe.extnamespace::regnamespace::text = 'public'`,
  },
  {
    name: 'duplicate_index (WARN)',
    sql: `select n.nspname, c.relname, array_agg(pi.indexname order by pi.indexname) as indexes
            from pg_indexes pi
            join pg_namespace n on n.nspname = pi.schemaname
            join pg_class c on pi.tablename = c.relname and n.oid = c.relnamespace
            left join pg_depend dep on c.oid = dep.objid and dep.deptype = 'e'
           where c.relkind in ('r','m') and n.nspname not in ${SCHEMAS_EXCLUDE} and dep.objid is null
           group by n.nspname, c.relkind, c.relname, replace(pi.indexdef, pi.indexname, '')
           having count(*) > 1`,
  },
  {
    name: 'rls_references_user_metadata (ERROR)',
    sql: `select schemaname, tablename, policyname
            from pg_policies
           where (qual like '%raw_user_meta_data%' or qual like '%user_metadata%'
               or with_check like '%raw_user_meta_data%' or with_check like '%user_metadata%')
             and schemaname not in ${SCHEMAS_EXCLUDE}`,
  },
  {
    name: 'rls_policy_always_true (WARN)',
    sql: `select schemaname, tablename, policyname, cmd, qual, with_check
            from pg_policies
           where (lower(coalesce(qual,'')) in ('true','true::boolean','(true)','(true::boolean)')
               or lower(coalesce(with_check,'')) in ('true','true::boolean','(true)','(true::boolean)'))
             and cmd in ('UPDATE','DELETE','INSERT')
             and schemaname not in ${SCHEMAS_EXCLUDE}`,
  },
  {
    name: 'fkey_to_auth_unique (WARN)',
    sql: `select cl.relnamespace::regnamespace::text as schema_name, cl.relname as table_name,
                 ct.conname, a.attname, a.attnum
            from pg_constraint ct
            join pg_class cl on ct.conrelid = cl.oid
            join pg_namespace n on n.oid = cl.relnamespace
            join pg_attribute a on a.attrelid = cl.oid and a.attnum = ct.conkey[1]
            join pg_class ref on ref.oid = ct.confrelid
            join pg_namespace rn on rn.oid = ref.relnamespace
            join pg_attribute ra on ra.attrelid = ref.oid and ra.attnum = ct.confkey[1]
           where ct.contype = 'f' and rn.nspname = 'auth' and ref.relname = 'users'
             and not exists (
                select 1 from pg_index i
                join pg_attribute ia on ia.attrelid = i.indrelid and ia.attnum = any(i.indkey)
                where i.indrelid = ref.oid and i.indisunique
                  and array(select unnest(i.indkey))::int[] @> array[ra.attnum]
             )
             and n.nspname not in ${SCHEMAS_EXCLUDE}`,
  },
  {
    name: 'sensitive_columns_exposed (INFO)',
    sql: `select n.nspname, c.relname, a.attname
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            join pg_attribute a on a.attrelid = c.oid
           where n.nspname not in ${SCHEMAS_EXCLUDE} and c.relkind = 'r'
             and lower(a.attname) in ('password','passwd','pwd','secret','api_key','apikey','access_token','auth_token','client_secret','jwt_secret','token_hash')
             and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))`,
  },
  {
    name: 'anon_security_definer_function_executable (WARN)',
    sql: `select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
            from pg_proc p join pg_namespace n on p.pronamespace = n.oid
           where p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
             and n.nspname = 'public'`,
  },
  {
    name: 'authenticated_security_definer_function_executable (WARN)',
    sql: `select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
            from pg_proc p join pg_namespace n on p.pronamespace = n.oid
           where p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE')
             and n.nspname = 'public'`,
  },
  {
    name: 'public_bucket_allows_listing (INFO)',
    sql: `select id, name from storage.buckets where public`,
  },
  {
    name: 'extension_versions_outdated (WARN)',
    sql: `select e.extname, e.extversion, a.default_version
            from pg_extension e
            join pg_available_extension_versions a on a.name = e.extname and a.version = e.extversion`,
  },
  {
    name: 'auth_users_exposed (ERROR)',
    sql: `select n.nspname, c.relname
            from pg_class auth_users_pg_class
            join pg_namespace auth_users_pg_namespace on auth_users_pg_class.relnamespace = auth_users_pg_namespace.oid
              and auth_users_pg_class.relname = 'users' and auth_users_pg_namespace.nspname = 'auth'
            join pg_depend d on d.refobjid = auth_users_pg_class.oid
            join pg_rewrite r on r.oid = d.objid
            join pg_class c on c.oid = r.ev_class
            join pg_namespace n on n.oid = c.relnamespace
           where d.deptype = 'n' and n.nspname = 'public'
             and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))`,
  },
];

async function main() {
  killOn(PORT);
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
  await client.query(fs.readFileSync(SHIM, 'utf8'));
  const migrations = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const m of migrations) await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, m), 'utf8'));
  await client.query(`set search_path = ''`);
  console.log('shim + migrations applied\n');

  for (const lint of lints) {
    console.log(`=== ${lint.name} ===`);
    try {
      const r = await client.query(lint.sql);
      if (r.rows.length === 0) { console.log('  (none)'); continue; }
      for (const row of r.rows) console.log('  ' + Object.values(row).join(' | '));
    } catch (e) {
      console.log('  QUERY ERROR: ' + e.message.split('\n')[0]);
    }
  }

  await client.end();
  try { await embedded.stop(); } catch {}
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
