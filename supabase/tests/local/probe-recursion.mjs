import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const EP = require('embedded-postgres').default ?? require('embedded-postgres');

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const DATA_DIR = path.join(__dirname, '.probe-pgdata');
const PORT = 54333;

const shim = fs.readFileSync(path.join(__dirname, 'auth-shim.sql'), 'utf8');

const pgInstance = new EP({
  databaseDir: DATA_DIR,
  port: PORT,
  user: 'postgres',
  password: 'postgres',
  persistent: true,
});

async function main() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  pgInstance.onLog = () => {};
  pgInstance.onError = () => {};
  await pgInstance.initialise();
  await pgInstance.start();

  const { default: pgMod } = await import('pg');
  const client = new pgMod.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres', database: 'postgres' });
  await client.connect();

  await client.query(shim);
  const migrations = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const m of migrations) {
    if (m.startsWith('0023')) continue;
    try {
      await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, m), 'utf8'));
    } catch (e) {
      console.log(`MIGRATION ERROR ${m}: ${e.message}`);
      process.exit(1);
    }
  }
  console.log('shim + 0001..0022 applied');

  const run = async (label, policySql, updateSql) => {
    try {
      await client.query(policySql);
    } catch (e) {
      console.log(`${label} [POLICY CREATE ERROR]: ${e.message}`);
      return;
    }
    try {
      await client.query(updateSql);
      console.log(`${label}: UPDATE SUCCEEDED (no error)`);
    } catch (e) {
      console.log(`${label}: ${e.code} ${e.message.split('\n')[0]}`);
    }
  };

  const studentUid = '70000000-0000-0000-0000-000000000001';

  // A: current 0022 shape (select auth.uid() everywhere + subqueries in WITH CHECK)
  await run(
    'A (0022 as-is)',
    `DROP POLICY IF EXISTS profiles_update_own_self_service ON public.profiles;
     CREATE POLICY profiles_update_own_self_service ON public.profiles
       FOR UPDATE
       USING (id = (select auth.uid()) AND public.is_student())
       WITH CHECK (
         id = (select auth.uid())
         AND role = (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id)
         AND grade_id = (SELECT p.grade_id FROM public.profiles p WHERE p.id = profiles.id)
         AND status = (SELECT p.status FROM public.profiles p WHERE p.id = profiles.id)
         AND deleted_at IS NULL
       );`,
    `SET LOCAL "app.current_user_id" = '${studentUid}';
     SET LOCAL ROLE student;
     UPDATE public.profiles SET role = 'admin' WHERE id = '${studentUid}';`
  );

  // B: USING with (select auth.uid()), WITH CHECK with plain auth.uid() + subqueries
  await run(
    'B (select in USING only)',
    `DROP POLICY IF EXISTS profiles_update_own_self_service ON public.profiles;
     CREATE POLICY profiles_update_own_self_service ON public.profiles
       FOR UPDATE
       USING (id = (select auth.uid()) AND public.is_student())
       WITH CHECK (
         id = auth.uid()
         AND role = (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id)
         AND grade_id = (SELECT p.grade_id FROM public.profiles p WHERE p.id = profiles.id)
         AND status = (SELECT p.status FROM public.profiles p WHERE p.id = profiles.id)
         AND deleted_at IS NULL
       );`,
    `SET LOCAL "app.current_user_id" = '${studentUid}';
     SET LOCAL ROLE student;
     UPDATE public.profiles SET role = 'admin' WHERE id = '${studentUid}';`
  );

  // C: original 0009 shape (plain auth.uid() everywhere)
  await run(
    'C (original 0009 shape)',
    `DROP POLICY IF EXISTS profiles_update_own_self_service ON public.profiles;
     CREATE POLICY profiles_update_own_self_service ON public.profiles
       FOR UPDATE
       USING (id = auth.uid() AND public.is_student())
       WITH CHECK (
         id = auth.uid()
         AND role = (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id)
         AND grade_id = (SELECT p.grade_id FROM public.profiles p WHERE p.id = profiles.id)
         AND status = (SELECT p.status FROM public.profiles p WHERE p.id = profiles.id)
         AND deleted_at IS NULL
       );`,
    `SET LOCAL "app.current_user_id" = '${studentUid}';
     SET LOCAL ROLE student;
     UPDATE public.profiles SET role = 'admin' WHERE id = '${studentUid}';`
  );

  // D: subqueries but no auth.uid() inside WITH CHECK
  await run(
    'D (no auth.uid in WITH CHECK, still subqueries)',
    `DROP POLICY IF EXISTS profiles_update_own_self_service ON public.profiles;
     CREATE POLICY profiles_update_own_self_service ON public.profiles
       FOR UPDATE
       USING (id = (select auth.uid()) AND public.is_student())
       WITH CHECK (
         role = (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id)
         AND grade_id = (SELECT p.grade_id FROM public.profiles p WHERE p.id = profiles.id)
         AND status = (SELECT p.status FROM public.profiles p WHERE p.id = profiles.id)
         AND deleted_at IS NULL
       );`,
    `SET LOCAL "app.current_user_id" = '${studentUid}';
     SET LOCAL ROLE student;
     UPDATE public.profiles SET role = 'admin' WHERE id = '${studentUid}';`
  );

  // E: no subqueries at all
  await run(
    'E (no subqueries anywhere)',
    `DROP POLICY IF EXISTS profiles_update_own_self_service ON public.profiles;
     CREATE POLICY profiles_update_own_self_service ON public.profiles
       FOR UPDATE
       USING (id = (select auth.uid()) AND public.is_student())
       WITH CHECK (id = (select auth.uid()) AND deleted_at IS NULL);`,
    `SET LOCAL "app.current_user_id" = '${studentUid}';
     SET LOCAL ROLE student;
     UPDATE public.profiles SET role = 'admin' WHERE id = '${studentUid}';`
  );

  await client.end();
  await pgInstance.stop();
  console.log('probe done');
}

main().catch((e) => {
  console.error('PROBE FATAL', e);
  process.exit(1);
});
