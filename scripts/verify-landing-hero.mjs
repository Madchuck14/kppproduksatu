import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Isolated PostgreSQL only; no credentials or live requests.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const editor = '11111111-1111-4111-8111-111111111111'
const sales = '22222222-2222-4222-8222-222222222222'
const book = '33333333-3333-4333-8333-333333333333'
const outside = '44444444-4444-4444-8444-444444444444'
async function session(id) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await db.exec(id ? 'set role authenticated' : 'set role anon')
}
const hero = async () => (await db.query('select heading, body from public.landing_hero')).rows[0]
const save = (ids, heading = 'Heading baru', body = 'Isi baru') =>
  db.query('select public.set_featured_books_with_hero($1::uuid[], $2, $3)', [ids, heading, body])
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
  await db.exec(await readFile('supabase/setup.sql', 'utf8'))
  await db.query('insert into auth.users values ($1), ($2)', [editor, sales])
  await db.query(
    "insert into public.account_memberships (user_id, role) values ($1, 'editor'), ($2, 'sales')",
    [editor, sales],
  )
  await db.query("insert into public.editor_scopes values ($1, 'SD')", [editor])
  await db.query(
    `insert into public.products (id, slug, title, book_code, education_level)
    values ($1, 'hero-sd', 'SD', '101', 'SD'), ($2, 'hero-smp', 'SMP', '102', 'SMP')`,
    [book, outside],
  )
  await session('')
  const original = await hero()
  assert.equal(original.heading, 'Temukan Buku Pilihanmu')
  await assert.rejects(save([book]), /permission denied/)
  await assert.rejects(
    db.exec("update public.landing_hero set heading = 'Hacked'"),
    /permission denied/,
  )
  await session(sales)
  await assert.rejects(save([book]), /super_editor_required/)
  await session(editor)
  await assert.rejects(save([book]), /super_editor_required/)
  await assert.rejects(
    db.query('select public.set_featured_books($1::uuid[])', [[book]]),
    /super_editor_required/,
  )
  await assert.rejects(db.query('select public.featured_products_count()'), /super_editor_required/)
  await assert.rejects(
    db.query('update public.products set featured = true where id = $1', [book]),
    /super_editor_required/,
  )
  await assert.rejects(
    db.exec(
      "insert into public.products (slug, title, book_code, education_level, featured) values ('bypass', 'Bypass', '103', 'SD', true)",
    ),
    /super_editor_required/,
  )
  await db.query("update public.products set author = 'Editor biasa' where id = $1", [book])
  assert.deepEqual(await hero(), original)
  await db.exec('reset role')
  await db.query('update public.account_memberships set is_super = true where user_id = $1', [
    sales,
  ])
  await session(sales)
  await assert.rejects(save([book]), /super_editor_required/)
  await db.exec('reset role')
  await db.query('update public.account_memberships set is_super = true where user_id = $1', [
    editor,
  ])
  await session(editor)
  await assert.rejects(
    db.exec("update public.landing_hero set heading = 'Direct write'"),
    /permission denied/,
  )
  await assert.rejects(save(['55555555-5555-4555-8555-555555555555']), /featured_book_out_of_scope/)
  await save([outside])
  await save([])
  await assert.rejects(save([book], ' ', 'Isi'), /invalid_landing_hero/)
  await assert.rejects(save([book], '\n\t', 'Isi'), /invalid_landing_hero/)
  await assert.rejects(save([book], 'x'.repeat(101)), /invalid_landing_hero/)
  await assert.rejects(save([book], 'Valid', 'x'.repeat(401)), /invalid_landing_hero/)
  assert.deepEqual(await hero(), { heading: 'Heading baru', body: 'Isi baru' })
  assert.equal(
    (await db.query('select featured from public.products where id = $1', [book])).rows[0].featured,
    false,
  )
  await save([book], 'x'.repeat(100), 'y'.repeat(400))
  assert.equal((await hero()).body.length, 400)
  await save([book], ' Heading baru ', ' Isi baru ')
  assert.deepEqual(await hero(), { heading: 'Heading baru', body: 'Isi baru' })
  await assert.rejects(save([book, book], 'Gagal', 'Gagal'), /invalid_featured_books/)
  assert.equal((await hero()).heading, 'Heading baru')
  // Legacy callers can update the selection without overwriting saved hero text.
  await db.query('select public.set_featured_books($1::uuid[])', [[]])
  assert.equal((await hero()).heading, 'Heading baru')
  await db.exec('reset role')
  await db.exec(await readFile('supabase/migrations/202610160004_landing_hero.sql', 'utf8'))
  await db.exec(
    await readFile('supabase/migrations/202610160005_super_editor_featured_books.sql', 'utf8'),
  )
  await session('')
  assert.equal((await hero()).heading, 'Heading baru')
  console.log(
    'PASS: ordinary Editor and Sales super denied via RPC and direct featured writes; ordinary metadata edits allowed; super Editor manages all levels; atomic save/validation/public reads and idempotent migrations. No live mutations.',
  )
} finally {
  await db.close()
}
