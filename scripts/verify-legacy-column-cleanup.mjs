import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Isolated PostgreSQL only. Never connects to Supabase or loads .env.
if (!process.env.PGLITE_MODULE_PATH) throw new Error('PGLITE_MODULE_PATH belum ditentukan.')
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const migrationName = '202610140001_remove_legacy_product_columns.sql'
const migration = await readFile(`supabase/migrations/${migrationName}`, 'utf8')
const rollback = await readFile(
  'supabase/rollback/202610140001_restore_legacy_product_columns.sql',
  'utf8',
)
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    create schema storage;
    create table storage.buckets (
      id text primary key, name text, public boolean, file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (id uuid primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
  `)
  for (const name of (await readdir('supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    if (name >= migrationName) break
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
  }
  const id = '11111111-1111-4111-8111-111111111111'
  const draftId = '22222222-2222-4222-8222-222222222222'
  const userId = '33333333-3333-4333-8333-333333333333'
  const oldSlide = `books/${id}/flyer-slides/44444444-4444-4444-8444-444444444444.png`
  const presentationSlide = `books/${id}/presentation-slides/55555555-5555-4555-8555-555555555555.jpg`
  await db.query(`insert into auth.users values ($1)`, [userId])
  await db.query(`insert into public.account_memberships (user_id, role) values ($1, 'editor')`, [
    userId,
  ])
  await db.query(`insert into public.editor_scopes values ($1, 'SD')`, [userId])
  await db.query(
    `
    insert into public.products
      (id, slug, title, book_code, education_level, synopsis, description,
        flyer_path, flyer_slide_paths, product_knowledge_path, product_knowledge_slide_paths,
        published, updated_at)
    values ($1, 'cleanup-test', 'Buku Uji', '123', 'SD', 'Sinopsis asli', 'Deskripsi lama',
      $2, array[$3], $4, array[$5], true, '2026-01-01T00:00:00Z')
  `,
    [
      id,
      `books/${id}/flyer/original.pptx`,
      oldSlide,
      `books/${id}/product-knowledge/original.pptx`,
      presentationSlide,
    ],
  )
  await db.query(
    `insert into public.products (id, slug, title, book_code, education_level, description)
    values ($1, 'cleanup-draft', 'Draft', '456', 'SMP', 'Isi lama bukan sinopsis')`,
    [draftId],
  )
  await db.query('insert into public.product_favorites (user_id, product_id) values ($1, $2)', [
    userId,
    id,
  ])
  await db.query('select public.record_product_access($1, $2)', ['cleanup-test', userId])
  const products = async () => (await db.query('select * from public.products order by id')).rows
  const before = await products()
  const stable = (rows) =>
    rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(([key]) => !['description', 'flyer_slide_paths'].includes(key)),
      ),
    )
  const stats = async () => ({
    days: (await db.query('select * from public.product_access_days order by product_id')).rows,
    stats: (await db.query('select * from public.product_access_stats order by product_id')).rows,
    favorites: (await db.query('select * from public.product_favorites order by product_id')).rows,
  })
  const beforeStats = await stats()
  await db.exec('create view public.cleanup_dependency as select description from public.products')
  await assert.rejects(db.exec(migration), /other objects depend/i)
  await db.exec('rollback')
  assert.deepEqual(await products(), before, 'Unknown dependencies abort cleanup without data loss')
  await db.exec('drop view public.cleanup_dependency')
  await db.exec(migration)
  assert.deepEqual(
    stable(await products()),
    stable(before),
    'All remaining fields and timestamps preserved',
  )
  assert.ok(
    (await products()).every((row) => !('description' in row) && !('flyer_slide_paths' in row)),
  )
  const archive = (
    await db.query(
      'select * from catalog_cleanup_archive.product_legacy_columns order by product_id',
    )
  ).rows
  assert.deepEqual(
    archive.map((row) => [row.product_id, row.description, row.flyer_slide_paths]),
    before.map((row) => [row.id, row.description, row.flyer_slide_paths]),
  )
  assert.equal(
    (await products())[1].synopsis,
    null,
    'Legacy descriptions are not guessed into synopsis',
  )
  assert.deepEqual(await stats(), beforeStats)
  await db.exec(migration)
  assert.deepEqual(
    (
      await db.query(
        'select * from catalog_cleanup_archive.product_legacy_columns order by product_id',
      )
    ).rows,
    archive,
  )
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    await assert.rejects(
      db.exec('select * from catalog_cleanup_archive.product_legacy_columns'),
      /permission denied/i,
    )
    await db.exec('reset role')
  }
  await db.exec('set role anon')
  const groups = (await db.query("select * from public.catalog_browse_groups('level')")).rows
  assert.equal(groups[0].book_count, 1)
  assert.equal(groups[0].books[0].description, 'Sinopsis asli')
  assert.equal(JSON.stringify(groups).includes(oldSlide), false)
  assert.equal(JSON.stringify(groups).includes('original.pptx'), false)
  await assert.rejects(
    db.query('select public.can_access_public_book_material($1)', [presentationSlide]),
    /permission denied/i,
  )
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
  await db.exec('set role authenticated')
  const access = async (name) =>
    (await db.query('select public.can_access_public_book_material($1) as allowed', [name])).rows[0]
      .allowed
  assert.equal(await access(presentationSlide), true)
  assert.equal(await access(oldSlide), false)
  assert.equal(await access(`books/${draftId}/flyer/draft.pdf`), false)
  assert.equal(
    (await db.query('select public.can_manage_book_material($1) as allowed', [oldSlide])).rows[0]
      .allowed,
    false,
  )
  await db.query('update public.products set flyer_path = $1 where id = $2', [
    `books/${id}/flyer/new.pdf`,
    id,
  ])
  await db.exec('reset role')
  // A restored preview list cannot refer to a replaced PDF. Rollback fails atomically.
  await assert.rejects(db.exec(rollback), /products_flyer_slides_valid/)
  await db.exec('rollback')
  assert.ok((await products()).every((row) => !('description' in row)))
  await db.query('update public.products set flyer_path = $1 where id = $2', [
    `books/${id}/flyer/original.pptx`,
    id,
  ])
  const beforeRollback = stable(await products())
  await db.exec(rollback)
  assert.deepEqual(
    stable(await products()),
    beforeRollback,
    'Rollback preserves current content and timestamps',
  )
  assert.deepEqual(
    (await products()).map((row) => [row.description, row.flyer_slide_paths]),
    before.map((row) => [row.description, row.flyer_slide_paths]),
  )
  await db.exec(rollback)
  await db.exec(migration)
  assert.deepEqual(await stats(), beforeStats)
  await db.exec(await readFile('supabase/seed.sql', 'utf8'))
  console.log(
    'PASS: full migration chain, exact private archive, unchanged UUIDs/content/timestamps/favorites/statistics, rerun, anon/auth archive denial, published-only RPC, private material permissions, Flyer PDF update, atomic rollback failure, restore/reapply, and seed compatibility.',
  )
  console.log(
    'Isolated PostgreSQL with simulated Auth/Storage; live Supabase and browser uploads remain unverified.',
  )
} finally {
  await db.close()
}
