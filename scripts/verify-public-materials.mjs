import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (!process.env.PGLITE_MODULE_PATH) throw new Error('PGLITE_MODULE_PATH belum ditentukan.')
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const migrationPath = 'supabase/migrations/202610140002_public_promotional_materials.sql'
const metadataName = '202610140003_book_curriculum_isbn.sql'
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
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select on storage.objects to anon, authenticated;
    grant insert, delete on storage.objects to authenticated;
  `)
  for (const name of (await readdir('supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    if (name >= metadataName) break
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
  }
  const publicId = '11111111-1111-4111-8111-111111111111'
  const draftId = '22222222-2222-4222-8222-222222222222'
  const outsideId = '33333333-3333-4333-8333-333333333333'
  const salesId = '44444444-4444-4444-8444-444444444444'
  const editorId = '55555555-5555-4555-8555-555555555555'
  const fileId = '66666666-6666-4666-8666-666666666666'
  const materialPath = (id, kind) =>
    `books/${id}/${kind}/${fileId}.${kind === 'product-knowledge' ? 'pptx' : 'pdf'}`
  for (const [id, level, published] of [
    [publicId, 'SD', true],
    [draftId, 'SD', false],
    [outsideId, 'SMP', false],
  ]) {
    await db.query(
      `insert into public.products
      (id, slug, title, book_code, education_level, published, flyer_path, dummy_book_path, product_knowledge_path)
      values ($1, $2, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        `test-${id}`,
        id.replaceAll('-', ''),
        level,
        published,
        materialPath(id, 'flyer'),
        materialPath(id, 'dummy'),
        materialPath(id, 'product-knowledge'),
      ],
    )
    for (const kind of ['flyer', 'dummy', 'product-knowledge'])
      await db.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [
        'book-materials',
        materialPath(id, kind),
      ])
  }
  await db.query('insert into auth.users values ($1), ($2)', [salesId, editorId])
  await db.query(
    "insert into public.account_memberships (user_id, role) values ($1, 'sales'), ($2, 'editor')",
    [salesId, editorId],
  )
  await db.query("insert into public.editor_scopes values ($1, 'SD')", [editorId])
  // Objects in other buckets and unreferenced originals must not inherit public access.
  await db.query(
    "insert into storage.objects (bucket_id, name) values ('unrelated', $1), ('book-materials', $2)",
    [
      materialPath(publicId, 'flyer'),
      `books/${publicId}/flyer/77777777-7777-4777-8777-777777777777.pdf`,
    ],
  )
  const visible = async () =>
    (await db.query('select name from storage.objects order by name')).rows.map((row) => row.name)
  const expectedPublic = [
    materialPath(publicId, 'flyer'),
    materialPath(publicId, 'product-knowledge'),
  ].sort()
  await db.exec('set role anon')
  assert.deepEqual(await visible(), expectedPublic)
  assert.equal(
    (
      await db.query('select public.can_access_public_book_material($1) as allowed', [
        materialPath(publicId, 'dummy'),
      ])
    ).rows[0].allowed,
    false,
  )
  await assert.rejects(
    db.query("insert into storage.objects (bucket_id, name) values ('book-materials', $1)", [
      materialPath(publicId, 'flyer'),
    ]),
    /permission denied/i,
  )
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [salesId])
  await db.exec('set role authenticated')
  assert.deepEqual(await visible(), [...expectedPublic, materialPath(publicId, 'dummy')].sort())
  const salesDelete = await db.query('delete from storage.objects where name = $1 returning id', [
    materialPath(publicId, 'flyer'),
  ])
  assert.equal(salesDelete.rows.length, 0, 'Sales cannot delete public materials')
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [editorId])
  await db.exec('set role authenticated')
  const editorVisible = await visible()
  assert.ok(
    editorVisible.includes(materialPath(draftId, 'dummy')),
    'Editor retains scoped draft access',
  )
  assert.equal(
    editorVisible.some((name) => name.includes(outsideId)),
    false,
    'Editor cannot access another level draft',
  )
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
  const before = (await db.query('select * from public.products order by id')).rows
  await db.exec(await readFile(migrationPath, 'utf8'))
  assert.deepEqual(
    (await db.query('select * from public.products order by id')).rows,
    before,
    'Rerun changes no book data',
  )
  assert.equal(
    (await db.query("select public from storage.buckets where id = 'book-materials'")).rows[0]
      .public,
    false,
  )
  await db.exec(
    await readFile('supabase/rollback/202610140002_private_promotional_materials.sql', 'utf8'),
  )
  await db.exec('set role anon')
  assert.deepEqual(await visible(), [], 'Rollback removes anonymous promotional reads')
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [salesId])
  await db.exec('set role authenticated')
  assert.deepEqual(await visible(), [...expectedPublic, materialPath(publicId, 'dummy')].sort())
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
  await db.exec(await readFile(migrationPath, 'utf8'))
  await db.query(
    'update public.products set dummy_book_path = product_knowledge_path where id = $1',
    [publicId],
  )
  await db.exec('set role anon')
  assert.deepEqual(
    await visible(),
    [materialPath(publicId, 'flyer')],
    'Dummy alias cannot become public',
  )
  await db.exec('reset role')
  await db.query('update public.products set published = false where id = $1', [publicId])
  await db.exec('set role anon')
  assert.deepEqual(await visible(), [], 'Unpublishing removes new anonymous access')
  await db.exec('reset role')
  // Add metadata to a database with existing books, then verify preservation and scopes.
  await db.query(
    'update public.products set published = true, dummy_book_path = $1 where id = $2',
    [materialPath(publicId, 'dummy'), publicId],
  )
  const snapshot = (await db.query('select * from public.products order by id')).rows
  const metadataSql = await readFile(`supabase/migrations/${metadataName}`, 'utf8')
  await db.exec(metadataSql)
  const expanded = (await db.query('select * from public.products order by id')).rows
  assert.deepEqual(
    expanded.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(([key]) => !['curriculum', 'isbn'].includes(key)),
      ),
    ),
    snapshot,
  )
  assert.ok(expanded.every((row) => row.curriculum === null && row.isbn === null))
  await db.query('update public.products set curriculum = $1, isbn = $2 where id = $3', [
    'Kurikulum Merdeka',
    '0306406152',
    publicId,
  ])
  const withMetadata = (await db.query('select * from public.products order by id')).rows
  await db.exec(metadataSql)
  assert.deepEqual((await db.query('select * from public.products order by id')).rows, withMetadata)
  for (const curriculum of ['', '   ', 'a'.repeat(201), ' Kurikulum'])
    await assert.rejects(
      db.query('update public.products set curriculum = $1 where id = $2', [curriculum, publicId]),
      /products_curriculum_valid/,
    )
  for (const isbn of ['123', '978-0-306-40615-7', '123456789x', '12345678XX'])
    await assert.rejects(
      db.query('update public.products set isbn = $1 where id = $2', [isbn, publicId]),
      /products_isbn_format/,
    )
  await db.query('update public.products set curriculum = $1, isbn = $2 where id = $3', [
    'a'.repeat(200),
    '9780306406157',
    publicId,
  ])
  await db.query('update public.products set isbn = $1 where id = $2', ['123456789X', publicId])
  await db.query('select public.record_product_access($1, $2)', [`test-${publicId}`, salesId])
  await db.exec('set role anon')
  const ranked = (await db.query("select * from public.catalog_browse_groups('level')")).rows[0]
    .books[0]
  assert.equal(ranked.curriculum, 'a'.repeat(200))
  assert.equal(ranked.isbn, '123456789X')
  assert.equal((await db.query('select id from public.products')).rows.length, 1)
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [salesId])
  await db.exec('set role authenticated')
  assert.equal(
    (
      await db.query(
        "update public.products set curriculum = 'Sales write' where id = $1 returning id",
        [publicId],
      )
    ).rows.length,
    0,
  )
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [editorId])
  await db.exec('set role authenticated')
  assert.equal(
    (
      await db.query(
        "update public.products set curriculum = 'Editor SD', isbn = null where id = $1 returning id",
        [publicId],
      )
    ).rows.length,
    1,
  )
  assert.equal(
    (
      await db.query(
        "update public.products set curriculum = 'Wrong scope' where id = $1 returning id",
        [outsideId],
      )
    ).rows.length,
    0,
  )
  await db.query('update public.products set curriculum = null, isbn = null where id = $1', [
    publicId,
  ])
  await db.exec('reset role')
  const conversionMigration = await readFile(
    'supabase/migrations/202610140004_server_presentation_previews.sql',
    'utf8',
  )
  const slidePath = `books/${publicId}/presentation-slides/88888888-8888-4888-8888-888888888888.jpg`
  await db.exec(conversionMigration)
  await db.query(
    `update public.products
      set product_knowledge_slide_paths = array[$1],
        product_knowledge_preview_status = 'ready',
        product_knowledge_preview_error = null
      where id = $2`,
    [slidePath, publicId],
  )
  await db.query("insert into storage.objects (bucket_id, name) values ('book-materials', $1)", [
    slidePath,
  ])
  await db.exec('set role anon')
  assert.ok((await visible()).includes(slidePath), 'Published generated slides are public')
  await db.exec('reset role')
  const conversionSnapshot = (
    await db.query(
      'select product_knowledge_slide_paths, product_knowledge_preview_status from public.products where id = $1',
      [publicId],
    )
  ).rows[0]
  await db.exec(conversionMigration)
  assert.deepEqual(
    (
      await db.query(
        'select product_knowledge_slide_paths, product_knowledge_preview_status from public.products where id = $1',
        [publicId],
      )
    ).rows[0],
    conversionSnapshot,
    'Conversion migration retry preserves generated paths and status',
  )
  const manualPreviewMigration = await readFile(
    'supabase/migrations/202610140005_manual_product_knowledge_pdf.sql',
    'utf8',
  )
  const previewPath = `books/${publicId}/product-knowledge-preview/99999999-9999-4999-8999-999999999999.pdf`
  await db.exec(manualPreviewMigration)
  await db.query('update public.products set product_knowledge_preview_path = $1 where id = $2', [
    previewPath,
    publicId,
  ])
  await db.query("insert into storage.objects (bucket_id, name) values ('book-materials', $1)", [
    previewPath,
  ])
  await assert.rejects(
    db.query('update public.products set product_knowledge_preview_path = $1 where id = $2', [
      `books/${publicId}/product-knowledge/99999999-9999-4999-8999-999999999999.pdf`,
      publicId,
    ]),
    /products_product_knowledge_preview_path_valid/,
  )
  const columns = (
    await db.query(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'products'`,
    )
  ).rows.map((row) => row.column_name)
  assert.equal(columns.includes('product_knowledge_slide_paths'), false)
  assert.equal(columns.includes('product_knowledge_preview_status'), false)
  assert.equal(columns.includes('product_knowledge_preview_error'), false)
  assert.deepEqual(
    (
      await db.query(
        'select slide_paths, preview_status from catalog_cleanup_archive.presentation_converter_columns where product_id = $1',
        [publicId],
      )
    ).rows[0],
    { slide_paths: [slidePath], preview_status: 'ready' },
  )
  await db.exec('set role anon')
  const manualVisible = await visible()
  assert.ok(manualVisible.includes(previewPath), 'Published PDF preview is public')
  assert.equal(
    manualVisible.includes(slidePath),
    false,
    'Archived generated slides are no longer public',
  )
  await db.exec('reset role')
  await db.exec(manualPreviewMigration)
  assert.equal(
    (
      await db.query('select product_knowledge_preview_path from public.products where id = $1', [
        publicId,
      ])
    ).rows[0].product_knowledge_preview_path,
    previewPath,
    'Manual preview migration retry preserves the uploaded PDF path',
  )
  console.log(
    'PASS: curriculum/ISBN migration preserves existing rows/timestamps, defaults to NULL, retries preserve metadata, constraints enforce format/bounds, RPC includes public metadata, and Sales/Editor scopes remain enforced.',
  )
  console.log(
    'PASS: full migration chain, published Flyer/PPT anonymous reads only, Dummy login requirement, draft/bucket/unreferenced denial, Sales write denial, Editor scope, private bucket, retry preservation, Dummy alias protection, and unpublish.',
  )
  console.log(
    'PASS: converter metadata is archived then removed; manual PDF preview path, RLS, constraints, and migration retry are verified.',
  )
  const dummySql = await readFile('supabase/migrations/202610160001_public_dummy_books.sql', 'utf8')
  const beforeDummy = (await db.query('select * from public.products order by id')).rows
  await db.exec(dummySql)
  await db.exec(dummySql)
  assert.deepEqual((await db.query('select * from public.products order by id')).rows, beforeDummy)
  await db.exec('set role anon')
  assert.deepEqual(
    await visible(),
    [
      materialPath(publicId, 'dummy'),
      materialPath(publicId, 'flyer'),
      materialPath(publicId, 'product-knowledge'),
      previewPath,
    ].sort(),
    'Anonymous reads only referenced published materials, including Dummy',
  )
  await db.exec('reset role')
  await db.query('update public.products set published = false where id = $1', [publicId])
  await db.exec('set role anon')
  assert.deepEqual(await visible(), [], 'Unpublishing revokes Dummy and other material reads')
  await db.exec('reset role')
  assert.equal(
    (await db.query("select public from storage.buckets where id = 'book-materials'")).rows[0]
      .public,
    false,
  )
  console.log(
    'PASS: public Dummy migration, anonymous reads, draft/unreferenced/bucket denial, unpublish, retries and data preservation.',
  )
  console.log('Isolated PostgreSQL with simulated Auth/Storage; live Supabase remains unverified.')
} finally {
  await db.close()
}
