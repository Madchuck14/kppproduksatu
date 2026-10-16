import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Isolated PostgreSQL only. No credentials or live Supabase changes.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const migration = '202610160003_editor_only_favorites.sql'
const editor = '11111111-1111-4111-8111-111111111111'
const sales = '22222222-2222-4222-8222-222222222222'
const ordinary = '33333333-3333-4333-8333-333333333333'
const otherEditor = '44444444-4444-4444-8444-444444444444'
const book = '55555555-5555-4555-8555-555555555555'
const draft = '66666666-6666-4666-8666-666666666666'
async function session(id) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await db.exec(id ? 'set role authenticated' : 'set role anon')
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
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
  for (const name of (await readdir('supabase/migrations'))
    .filter((n) => n.endsWith('.sql') && n < migration)
    .sort())
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
  await db.query('insert into auth.users values ($1), ($2), ($3), ($4)', [
    editor,
    sales,
    ordinary,
    otherEditor,
  ])
  await db.query(
    "insert into public.account_memberships (user_id, role, is_super) values ($1, 'editor', false), ($2, 'sales', true), ($3, 'editor', true)",
    [editor, sales, otherEditor],
  )
  await db.query("insert into public.editor_scopes values ($1, 'SD')", [editor])
  await db.query(
    "insert into public.products (id, title, slug, book_code, education_level, published) values ($1, 'Publik', 'publik', '123', 'SMA', true), ($2, 'Draft', 'draft', '456', 'SD', false)",
    [book, draft],
  )
  for (const id of [editor, sales, ordinary, otherEditor])
    await db.query('insert into public.product_favorites (user_id, product_id) values ($1, $2)', [
      id,
      book,
    ])
  const snapshot = async () => ({
    users: (await db.query('select * from auth.users order by id')).rows,
    accounts: (await db.query('select * from public.account_memberships order by user_id')).rows,
    favorites: (
      await db.query('select * from public.product_favorites order by user_id, product_id')
    ).rows,
    books: (await db.query('select * from public.products order by id')).rows,
  })
  const before = await snapshot()
  const sql = await readFile(`supabase/migrations/${migration}`, 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  assert.deepEqual(await snapshot(), before, 'Migration and retries preserve all data')
  await session('')
  await assert.rejects(db.query('select * from public.product_favorites'), /permission denied/)
  assert.equal((await db.query('select id from public.products')).rows.length, 1)
  for (const id of [sales, ordinary]) {
    await session(id)
    assert.equal((await db.query('select * from public.account_memberships')).rows.length, 0)
    assert.equal((await db.query('select * from public.product_favorites')).rows.length, 0)
    assert.equal(
      (await db.query('delete from public.product_favorites returning product_id')).rows.length,
      0,
    )
    await assert.rejects(
      db.query('insert into public.product_favorites (user_id, product_id) values ($1, $2)', [
        id,
        draft,
      ]),
      /row-level security/,
    )
    await db.exec('reset role')
    await db.query('delete from public.product_favorites where user_id = $1', [id])
    await session(id)
    await assert.rejects(
      db.query('insert into public.product_favorites (user_id, product_id) values ($1, $2)', [
        id,
        book,
      ]),
      /row-level security/,
    )
    await db.exec('reset role')
    await db.query('insert into public.product_favorites (user_id, product_id) values ($1, $2)', [
      id,
      book,
    ])
  }
  for (const id of [editor, otherEditor]) {
    await session(id)
    assert.equal(
      (await db.query('select * from public.account_memberships')).rows[0].role,
      'editor',
    )
    const own = (await db.query('select * from public.product_favorites')).rows
    assert.equal(own.length, 1)
    assert.equal(own[0].user_id, id)
    await assert.rejects(
      db.query('insert into public.product_favorites (user_id, product_id) values ($1, $2)', [
        id,
        draft,
      ]),
      /row-level security/,
    )
    await assert.rejects(
      db.query('insert into public.product_favorites (user_id, product_id) values ($1, $2)', [
        sales,
        draft,
      ]),
      /row-level security/,
    )
    assert.equal(
      (
        await db.query(
          'delete from public.product_favorites where user_id <> $1 returning product_id',
          [id],
        )
      ).rows.length,
      0,
    )
    assert.equal(
      (
        await db.query(
          'delete from public.product_favorites where user_id = $1 returning product_id',
          [id],
        )
      ).rows.length,
      1,
    )
    await db.query('insert into public.product_favorites (user_id, product_id) values ($1, $2)', [
      id,
      book,
    ])
  }
  await db.exec('reset role')
  // Restore timestamps for an exact preservation comparison after write-behavior checks.
  for (const row of before.favorites)
    await db.query('update public.product_favorites set created_at = $1 where user_id = $2', [
      row.created_at,
      row.user_id,
    ])
  assert.deepEqual(await snapshot(), before)
  await db.exec(await readFile('supabase/rollback/202610160003_all_account_favorites.sql', 'utf8'))
  await session(sales)
  assert.equal((await db.query('select * from public.product_favorites')).rows.length, 1)
  assert.equal((await db.query('select * from public.account_memberships')).rows[0].role, 'sales')
  await db.exec('reset role')
  await db.exec(sql)
  assert.deepEqual(await snapshot(), before)
  console.log(
    'PASS: full migration chain; Editor-only favorites and membership reads; legacy Sales/super Sales/no-role denied; cross-owner and draft denial; Editor favorites across public levels; no data loss; retry and rollback.',
  )
} finally {
  await db.close()
}
