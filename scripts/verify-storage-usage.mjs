import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (!process.env.PGLITE_MODULE_PATH) throw new Error('PGLITE_MODULE_PATH belum ditentukan.')
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const migration = await readFile('supabase/migrations/202610200001_storage_usage.sql', 'utf8')
const editor = '11111111-1111-4111-8111-111111111111'
const sales = '22222222-2222-4222-8222-222222222222'
const other = '33333333-3333-4333-8333-333333333333'
const usage = async () =>
  Number((await db.query('select public.editor_storage_usage_bytes() as bytes')).rows[0].bytes)
async function session(user) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user])
  await db.exec(user ? 'set role authenticated' : 'set role anon')
}
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create table public.account_memberships (user_id uuid, role text);
    insert into public.account_memberships values ('${editor}', 'editor'), ('${sales}', 'sales');
    create schema storage;
    create table storage.objects (bucket_id text, name text, metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select on storage.objects to authenticated;
  `)
  await db.exec(migration)
  await session(editor)
  assert.equal(await usage(), 0)
  await db.exec('reset role')
  await db.exec(`
    insert into storage.objects values
      ('product-images', 'cover.webp', '{"size": 1048576}'),
      ('book-materials', 'draft.pdf', '{"size": "2097152"}'),
      ('book-materials', 'old-unreferenced.pptx', '{"size": 3145728}'),
      ('another-bucket', 'unrelated.bin', '{"size": 4294967296}'),
      ('book-materials', 'folder', null);
  `)
  const before = (await db.query('select * from storage.objects order by name')).rows
  await db.exec(migration)
  await session(editor)
  assert.deepEqual((await db.query('select * from storage.objects')).rows, [])
  assert.equal(await usage(), 4294967296 + 6 * 1024 ** 2)
  for (const user of ['', sales, other]) {
    await session(user)
    await assert.rejects(usage(), /permission denied|storage_usage_forbidden/)
  }
  await db.exec('reset role')
  assert.deepEqual((await db.query('select * from storage.objects order by name')).rows, before)
  await db.exec('drop function public.editor_storage_usage_bytes()')
  assert.deepEqual((await db.query('select * from storage.objects order by name')).rows, before)
  console.log(
    'PASS Storage total: empty, all buckets, draft/orphan files, bigint; Editor-only aggregate, RLS intact, rerun and rollback preserve files (isolated PostgreSQL)',
  )
} finally {
  await db.close()
}
