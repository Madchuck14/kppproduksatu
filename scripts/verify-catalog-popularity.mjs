import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Isolated PostgreSQL proof. Supply a temporary PGlite installation, not a live DB.
const modulePath = process.env.PGLITE_MODULE_PATH
if (!modulePath) throw new Error('PGLITE_MODULE_PATH belum ditentukan.')
const { PGlite } = await import(pathToFileURL(modulePath).href)
const db = new PGlite()
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create table public.products (
      id uuid primary key default gen_random_uuid(), slug text unique not null,
      title text not null, author text not null default '', description text not null default '',
      highlights text[] not null default '{}', price integer not null default 0,
      image_path text, featured boolean not null default false,
      book_code text, education_level text, grade smallint, subject text,
      publication_year smallint, published boolean not null default false,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      flyer_path text, dummy_book_path text, product_knowledge_path text
    );
    alter table public.products enable row level security;
    grant select on public.products to anon, authenticated;
    create policy "Published products" on public.products for select to anon, authenticated using (published);
  `)
  for (const name of ['202610130001_book_divisions.sql', '202610130003_catalog_popularity.sql']) {
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
  }
  await db.exec(`
    insert into public.products (slug, title, education_level, division_code, published, flyer_path)
    select 'test-' || i, 'Buku Uji ' || i, 'SD', 'sd-1-mipa', i < 6, 'private-secret.pdf'
    from generate_series(1, 6) i;
  `)
  const visitor = '11111111-1111-4111-8111-111111111111'
  const visitor2 = '22222222-2222-4222-8222-222222222222'
  async function record(slug, id = visitor) {
    return (await db.query('select public.record_product_access($1, $2) as accepted', [slug, id]))
      .rows[0].accepted
  }
  async function groups(kind) {
    return (await db.query('select * from public.catalog_browse_groups($1)', [kind])).rows
  }
  await db.exec('set role anon')
  assert.equal(await record('missing'), false)
  assert.equal(await record('test-6'), false, 'Draft not tracked')
  assert.equal(await record('test-1'), true)
  assert.equal(await record('test-1'), true)
  assert.equal(
    (await db.query('select access_count from public.product_access_stats')).rows[0].access_count,
    1,
    'Daily duplicate does not increase count',
  )
  assert.equal(await record('test-1', visitor2), true)
  await Promise.all(Array.from({ length: 5 }, () => record('test-2')))
  for (const slug of ['test-3', 'test-4', 'test-5']) await record(slug)
  for (const forbidden of [
    'select * from public.product_access_days',
    'update public.product_access_stats set access_count = 100',
    'delete from public.product_access_stats',
    'insert into public.product_access_days select id, gen_random_uuid(), current_date from public.products',
  ])
    await assert.rejects(db.exec(forbidden), /permission denied/i)
  const levels = await groups('level')
  assert.equal(levels.length, 4)
  assert.equal(levels[0].book_count, 5)
  assert.equal(levels[0].books.length, 4)
  assert.equal(levels[0].books[0].slug, 'test-1', 'Most accessed first')
  assert.equal(levels[1].books.length, 0)
  assert.equal((await groups('division')).length, 6)
  assert.equal((await groups('division'))[0].book_count, 5)
  assert.equal(JSON.stringify(levels).includes('private-secret.pdf'), false)
  assert.equal((await groups('invalid')).length, 0)
  await db.exec('reset role')
  const snapshot = async () => ({
    days: (
      await db.query(
        'select * from public.product_access_days order by product_id, visitor_id, access_day',
      )
    ).rows,
    stats: (await db.query('select * from public.product_access_stats order by product_id')).rows,
  })
  const beforeRetry = await snapshot()
  const popularityMigration = await readFile(
    'supabase/migrations/202610130003_catalog_popularity.sql',
    'utf8',
  )
  await db.exec(popularityMigration)
  assert.deepEqual(await snapshot(), beforeRetry, 'Rerun preserves ledger and counters')
  // Simulate the early file version that did not yet include the division facet RPC.
  await db.exec(
    'drop function public.catalog_division_subject_counts(text, text, text, integer, boolean)',
  )
  await db.exec(popularityMigration)
  assert.deepEqual(await snapshot(), beforeRetry, 'Early-version upgrade preserves all statistics')
  await db.exec('set role anon')
  await db.query("select * from public.catalog_division_subject_counts('sd-1-mipa')")
  await assert.rejects(db.exec('select * from public.product_access_days'), /permission denied/i)
  assert.equal(await record('test-1'), true)
  await db.exec('reset role')
  assert.deepEqual(
    await snapshot(),
    beforeRetry,
    'Rerun retains daily deduplication and permissions',
  )
  const stats = await db.query(
    "select access_count from public.product_access_stats s join public.products p on p.id = s.product_id where p.slug = 'test-2'",
  )
  assert.equal(stats.rows[0].access_count, 1, 'Repeated requests remain deduplicated')
  await db.exec("update public.products set published = false where slug = 'test-1'")
  await db.exec('set role authenticated')
  assert.equal(await record('test-1'), false)
  assert.equal((await groups('level'))[0].book_count, 4)
  assert.equal(
    (await groups('level'))[0].books.some((book) => book.slug === 'test-1'),
    false,
  )
  await assert.rejects(db.exec('select * from public.product_access_days'), /permission denied/i)
  await db.exec('reset role')
  await db.exec("delete from public.products where slug = 'test-2'")
  assert.equal(
    (await db.query('select count(*) as total from public.product_access_stats')).rows[0].total,
    4,
  )
  console.log(
    'PASS: PostgreSQL migration and rerun/early-version upgrade preserve data, daily deduplication, draft/missing exclusion, four-book ranking, group counts, public permissions, private-path exclusion, unpublish and FK cascade.',
  )
} finally {
  await db.close()
}
