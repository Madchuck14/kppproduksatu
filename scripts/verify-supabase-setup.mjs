import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Isolated PostgreSQL only; never loads credentials or connects to Supabase live.
if (!process.env.PGLITE_MODULE_PATH) throw new Error('PGLITE_MODULE_PATH belum ditentukan.')
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const bundle = await readFile('supabase/setup.sql', 'utf8')
const db = new PGlite()
const sequential = new PGlite()
const failed = new PGlite()
async function prepare(connection) {
  await connection.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select on storage.objects to anon, authenticated;
    grant insert, delete on storage.objects to authenticated;
  `)
}
async function snapshot(connection) {
  const queries = {
    columns: `select table_schema, table_name, column_name, data_type, is_nullable, column_default, is_identity, identity_generation
      from information_schema.columns where table_schema in ('public', 'catalog_cleanup_archive') order by table_schema, table_name, ordinal_position`,
    tables: `select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relacl::text
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'catalog_cleanup_archive') and c.relkind in ('r', 'S') order by 1, 2`,
    constraints: `select n.nspname, c.relname, x.conname, pg_get_constraintdef(x.oid) as definition
      from pg_constraint x join pg_class c on c.oid = x.conrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'storage', 'catalog_cleanup_archive') order by 1, 2, 3`,
    indexes: `select schemaname, tablename, indexname, indexdef from pg_indexes
      where schemaname in ('public', 'storage', 'catalog_cleanup_archive') order by 1, 2, 3`,
    policies: `select * from pg_policies where schemaname in ('public', 'storage', 'catalog_cleanup_archive') order by schemaname, tablename, policyname`,
    functions: `select n.nspname, p.proname, pg_get_functiondef(p.oid) as definition, p.proacl::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1, 2, 3`,
    triggers: `select n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid) as definition
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal order by 1, 2, 3`,
    classifications:
      'select * from public.book_classifications order by kind, code, education_level',
    buckets: 'select * from storage.buckets order by id',
  }
  const result = {}
  for (const [key, sql] of Object.entries(queries)) {
    result[key] = (await connection.query(sql)).rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([field, value]) => [
          field,
          typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : value,
        ]),
      ),
    )
  }
  return result
}
try {
  await Promise.all([prepare(db), prepare(sequential), prepare(failed)])
  const filenames = (await readdir('supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()
  assert.equal((bundle.match(/^-- BAGIAN \d+:/gm) ?? []).length, filenames.length)
  await db.exec(bundle)
  for (const name of filenames)
    await sequential.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
  assert.deepEqual(
    await snapshot(db),
    await snapshot(sequential),
    'Bundle and sequential migrations must produce identical schema, RLS, grants, functions, triggers, and registry data',
  )
  const before = await snapshot(db)
  await assert.rejects(db.exec(bundle), /hanya untuk database baru/)
  await db.exec('rollback')
  assert.deepEqual(await snapshot(db), before, 'Existing database guard preserves schema and data')
  await assert.rejects(
    failed.exec(bundle.replace(/\ncommit;\n$/, '\nselect 1 / 0;\ncommit;\n')),
    /division by zero/,
  )
  await failed.exec('rollback')
  assert.equal(
    (await failed.query("select to_regclass('public.products') as table_name")).rows[0].table_name,
    null,
  )
  await db.exec(`
    insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
    insert into public.account_memberships (user_id, role) values
      ('11111111-1111-4111-8111-111111111111', 'editor'), ('22222222-2222-4222-8222-222222222222', 'sales');
    insert into public.editor_scopes values ('11111111-1111-4111-8111-111111111111', 'SD');
    insert into public.products (slug, title, book_code, education_level, division_code, subject, published)
      values ('bundle-public', 'Judul Sama', '123', 'SD', 'smk', 'Matematika', true),
      ('bundle-draft', 'Judul Sama', '456', 'SD', 'smk', 'Matematika', false);
    set role anon;
  `)
  assert.equal((await db.query('select * from public.products')).rows.length, 1)
  assert.equal(
    (await db.query("select * from public.catalog_browse_groups('division')")).rows.length,
    6,
  )
  assert.equal(
    (
      await db.query(
        "select public.record_product_access('bundle-public', '33333333-3333-4333-8333-333333333333') as recorded",
      )
    ).rows[0].recorded,
    true,
  )
  await assert.rejects(
    db.exec(
      "insert into public.book_classifications (kind, code, name) values ('division', 'test', 'Test')",
    ),
  )
  await db.exec(
    "reset role; set role authenticated; set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222'",
  )
  await assert.rejects(
    db.query("select public.delete_book_classification('division', 'sd-1-mipa', '')"),
    /classification_forbidden/,
  )
  await db.exec("set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111'")
  await assert.rejects(
    db.query("select public.delete_book_classification('division', 'sd-1-mipa', '')"),
    /classification_forbidden/,
  )
  await db.exec(
    "reset role; update public.account_memberships set is_super = true where role = 'editor'; set role authenticated",
  )
  assert.equal(
    (
      await db.query(
        "select public.delete_book_classification('division', 'sd-1-mipa', '') as deleted",
      )
    ).rows[0].deleted,
    true,
  )
  await assert.rejects(
    db.query("select public.delete_book_classification('division', 'smk', '')"),
    /classification_in_use/,
  )
  await db.exec(
    "insert into public.book_classifications (kind, code, name, education_level) values ('subject', 'Test', 'Test', 'SMP')",
  )
  console.log(
    'PASS: 32-section bundle equals sequential schema/RLS/grants/functions/triggers/data; existing-DB guard, atomic rollback, public/draft separation, popularity, duplicate titles, and final Editor classification rules (isolated PostgreSQL).',
  )
} finally {
  await Promise.all([db.close(), sequential.close(), failed.close()])
}
