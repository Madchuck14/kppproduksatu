import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Isolated PostgreSQL only. No credentials, emails, or live database mutations.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const migration = '202611040001_restore_sales_registration.sql'
const editor = '11111111-1111-4111-8111-111111111111'
const sales = '22222222-2222-4222-8222-222222222222'
const noRole = '33333333-3333-4333-8333-333333333333'
const newSales = '44444444-4444-4444-8444-444444444444'
const book = '55555555-5555-4555-8555-555555555555'
const draft = '66666666-6666-4666-8666-666666666666'
async function session(id) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await db.exec(id ? 'set role authenticated' : 'set role anon')
}
async function snapshot() {
  return {
    users: (await db.query('select * from auth.users order by id')).rows,
    accounts: (await db.query('select * from public.account_memberships order by user_id')).rows,
    scopes: (await db.query('select * from public.editor_scopes order by user_id')).rows,
    favorites: (await db.query('select * from public.product_favorites order by user_id')).rows,
  }
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select on storage.objects to anon, authenticated;
    grant insert, delete on storage.objects to authenticated;
  `)
  for (const name of (await readdir('supabase/migrations'))
    .filter((n) => n.endsWith('.sql') && n < migration)
    .sort())
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
  await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [editor, sales, noRole])
  await db.query(
    "insert into public.account_memberships (user_id, role, is_super) values ($1, 'editor', false), ($2, 'sales', true)",
    [editor, sales],
  )
  await db.query("insert into public.editor_scopes values ($1, 'SD')", [editor])
  await db.query(
    "insert into public.products (id, title, slug, book_code, education_level, published) values ($1, 'Public', 'public', '123', 'SD', true), ($2, 'Draft', 'draft', '456', 'SMP', false)",
    [book, draft],
  )
  await db.query(
    'insert into public.product_favorites (user_id, product_id) values ($1, $3), ($2, $3)',
    [editor, sales, book],
  )
  const before = await snapshot()
  const sql = await readFile(`supabase/migrations/${migration}`, 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  assert.deepEqual(await snapshot(), before, 'Migration retries preserve existing data')
  await db.query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [
    newSales,
    { role: 'editor', is_super: true, educationLevel: 'SD' },
  ])
  const assigned = (
    await db.query('select role, is_super from public.account_memberships where user_id = $1', [
      newSales,
    ])
  ).rows[0]
  assert.deepEqual(
    assigned,
    { role: 'sales', is_super: false },
    'Forged metadata never grants Editor/super',
  )
  assert.equal(
    (await db.query('select * from public.editor_scopes where user_id = $1', [newSales])).rows
      .length,
    0,
  )
  for (const id of [editor, sales, newSales]) {
    await session(id)
    const memberships = (await db.query('select * from public.account_memberships')).rows
    assert.equal(memberships.length, 1)
    assert.equal(memberships[0].user_id, id)
    await db.query('delete from public.product_favorites where user_id = $1', [id])
    await db.query('insert into public.product_favorites (user_id, product_id) values ($1, $2)', [
      id,
      book,
    ])
    const favorites = (await db.query('select * from public.product_favorites')).rows
    assert.equal(favorites.length, 1)
    assert.equal(favorites[0].user_id, id)
    await assert.rejects(
      db.query('insert into public.product_favorites (user_id, product_id) values ($1, $2)', [
        id,
        draft,
      ]),
      /row-level security/,
    )
    await assert.rejects(
      db.query('insert into public.product_favorites (user_id, product_id) values ($1, $2)', [
        noRole,
        book,
      ]),
      /row-level security/,
    )
    assert.equal(
      (await db.query('delete from public.product_favorites where user_id <> $1 returning *', [id]))
        .rows.length,
      0,
    )
    await assert.rejects(
      db.query(
        "update public.account_memberships set role = 'editor', is_super = true where user_id = $1",
        [id],
      ),
      /permission denied/,
    )
    await assert.rejects(db.query('select public.assign_new_sales_account()'), /permission denied/)
    if (id !== editor) {
      assert.equal(
        (await db.query("select public.can_manage_book_level('SD') as allowed")).rows[0].allowed,
        false,
      )
      assert.equal(
        (
          await db.query(
            "update public.products set title = 'Forbidden' where id = $1 returning id",
            [book],
          )
        ).rows.length,
        0,
      )
      await assert.rejects(
        db.query("select public.delete_book_classification('division', 'sd-1-mipa', '')"),
        /classification_forbidden/,
      )
    }
  }
  await session(editor)
  assert.equal(
    (await db.query("select public.has_editor_scope('SD') as allowed")).rows[0].allowed,
    true,
  )
  assert.equal(
    (await db.query("select public.has_editor_scope('SMP') as allowed")).rows[0].allowed,
    false,
  )
  await session(noRole)
  assert.equal((await db.query('select * from public.product_favorites')).rows.length, 0)
  await assert.rejects(
    db.query('insert into public.product_favorites (user_id, product_id) values ($1, $2)', [
      noRole,
      book,
    ]),
    /row-level security/,
  )
  await session('')
  await assert.rejects(db.query('select * from public.product_favorites'), /permission denied/)
  assert.equal((await db.query('select id from public.products')).rows.length, 1)
  await db.exec('reset role')
  const rollbackBefore = await snapshot()
  await db.exec(await readFile('supabase/rollback/202611040001_editor_only_access.sql', 'utf8'))
  assert.deepEqual(await snapshot(), rollbackBefore, 'Rollback preserves accounts and favorites')
  await session(sales)
  assert.equal((await db.query('select * from public.account_memberships')).rows.length, 0)
  assert.equal((await db.query('select * from public.product_favorites')).rows.length, 0)
  await db.exec('reset role')
  await db.exec(sql)
  assert.deepEqual(await snapshot(), rollbackBefore)
  console.log(
    'PASS: Sales/Editor favorites, owner isolation, draft/anonymous/no-role denial, trusted Sales enrollment despite forged metadata, Editor scope preserved, no data loss, retry and rollback.',
  )
} finally {
  await db.close()
}
