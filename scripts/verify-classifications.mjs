import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (!process.env.PGLITE_MODULE_PATH) throw new Error('PGLITE_MODULE_PATH belum ditentukan.')
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const migration = 'supabase/migrations/202610150004_book_classifications.sql'
try {
  await db.exec(`
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
  for (const name of (await readdir('supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    if (name >= '202610150004') break
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
  }
  await db.exec(`
    insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
    insert into public.account_memberships (user_id, role) values
      ('11111111-1111-4111-8111-111111111111', 'editor'), ('22222222-2222-4222-8222-222222222222', 'sales');
    insert into public.editor_scopes values ('11111111-1111-4111-8111-111111111111', 'SD');
    insert into public.products (title, slug, book_code, education_level, division_code, subject, curriculum, published)
      values ('Buku Lama', 'buku-lama', '123456', 'SD', 'sd-1-mipa', 'Matematika', 'Kurikulum Lama', true);
  `)
  const before = (await db.query('select * from public.products')).rows
  await db.exec(await readFile(migration, 'utf8'))
  assert.deepEqual((await db.query('select * from public.products')).rows, before)
  assert.equal(
    (await db.query("select * from public.book_classifications where kind = 'division'")).rows
      .length,
    6,
  )
  for (const [level, expected] of [
    ['SD', 9],
    ['SMP', 11],
    ['SMA', 19],
    ['SMK', 19],
  ]) {
    assert.equal(
      (
        await db.query(
          "select * from public.book_classifications where kind = 'subject' and education_level = $1",
          [level],
        )
      ).rows.length,
      expected,
    )
  }
  await db.exec('set role anon')
  assert.equal((await db.query('select * from public.book_classifications')).rows.length, 65)
  await assert.rejects(
    db.exec(
      "insert into public.book_classifications (kind, code, name) values ('division', 'illegal', 'Illegal')",
    ),
  )
  await db.exec(
    "reset role; set role authenticated; set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222'",
  )
  await assert.rejects(
    db.exec(
      "insert into public.book_classifications (kind, code, name) values ('division', 'illegal', 'Illegal')",
    ),
  )
  await db.exec("set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111'")
  await db.exec(
    "insert into public.book_classifications (kind, code, name) values ('division', 'divisi-baru', 'Divisi Baru'), ('curriculum', 'Kurikulum Baru', 'Kurikulum Baru')",
  )
  await db.exec(
    "insert into public.book_classifications (kind, code, name, education_level) values ('subject', 'Mapel Baru', 'Mapel Baru', 'SD')",
  )
  await assert.rejects(
    db.exec(
      "insert into public.book_classifications (kind, code, name, education_level) values ('subject', 'Mapel SMP', 'Mapel SMP', 'SMP')",
    ),
  )
  await assert.rejects(
    db.exec(
      "insert into public.book_classifications (kind, code, name) values ('division', 'divisi-baru', 'Nama lain')",
    ),
  )
  await assert.rejects(
    db.exec(
      "insert into public.book_classifications (kind, code, name) values ('division', 'kode-lain', 'divisi baru')",
    ),
  )
  await assert.rejects(db.exec("update public.book_classifications set name = 'Changed'"))
  await assert.rejects(db.exec('delete from public.book_classifications'))
  await db.exec(
    "update public.products set subject = 'Mapel Baru', division_code = 'divisi-baru', curriculum = 'Kurikulum Baru' where book_code = '123456'",
  )
  await assert.rejects(
    db.exec("update public.products set subject = 'Biologi' where book_code = '123456'"),
  )
  await assert.rejects(
    db.exec("update public.products set division_code = 'unregistered' where book_code = '123456'"),
  )
  await db.exec('reset role; set role anon')
  const groups = (await db.query("select * from public.catalog_browse_groups('division')")).rows
  assert.equal(groups.length, 7)
  assert.equal(Number(groups.find((group) => group.group_code === 'divisi-baru').book_count), 1)
  const saved = (await db.query('select * from public.products')).rows
  await db.exec('reset role')
  await db.exec(await readFile(migration, 'utf8'))
  assert.deepEqual((await db.query('select * from public.products')).rows, saved)
  assert.equal(
    (await db.query("select * from public.book_classifications where code = 'divisi-baru'")).rows
      .length,
    1,
  )
  const deletionMigration = await readFile(
    'supabase/migrations/202610150005_delete_book_classifications.sql',
    'utf8',
  )
  await db.exec(deletionMigration)
  await db.exec(deletionMigration)
  assert.deepEqual((await db.query('select * from public.products')).rows, saved)
  assert.equal(
    (await db.query('select * from public.book_classifications where is_builtin')).rows.length,
    64,
  )
  const remove = (kind, code, level = '') =>
    db.query('select public.delete_book_classification($1, $2, $3) as deleted', [kind, code, level])
  await db.exec('set role anon')
  await assert.rejects(remove('division', 'divisi-baru'))
  await db.exec(
    "reset role; set role authenticated; set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222'",
  )
  await assert.rejects(remove('division', 'divisi-baru'), /classification_forbidden/)
  await db.exec("set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111'")
  await assert.rejects(remove('division', 'sd-1-mipa'), /classification_builtin/)
  await assert.rejects(remove('subject', 'Matematika', 'SD'), /classification_builtin/)
  for (const [kind, code, level] of [
    ['division', 'divisi-baru', ''],
    ['subject', 'Mapel Baru', 'SD'],
    ['curriculum', 'Kurikulum Baru', ''],
  ]) {
    await assert.rejects(remove(kind, code, level), /classification_in_use/)
  }
  await assert.rejects(remove('subject', 'Mapel Baru', 'SMP'), /classification_forbidden/)
  await db.exec('reset role')
  // A reference hidden by product RLS still prevents deletion by another Editor.
  await db.exec(
    "update public.products set education_level = 'SMP', subject = null, published = false",
  )
  await db.exec(
    "set role authenticated; set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111'",
  )
  assert.equal((await db.query('select * from public.products')).rows.length, 0)
  await assert.rejects(remove('division', 'divisi-baru'), /classification_in_use/)
  await assert.rejects(remove('curriculum', 'Kurikulum Baru'), /classification_in_use/)
  assert.equal((await remove('subject', 'Mapel Baru', 'SD')).rows[0].deleted, true)
  assert.equal((await remove('subject', 'Mapel Baru', 'SD')).rows[0].deleted, false)
  await db.exec('reset role')
  await db.exec('update public.products set division_code = null, curriculum = null')
  await db.exec(
    "set role authenticated; set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111'",
  )
  assert.equal((await remove('division', 'divisi-baru')).rows[0].deleted, true)
  assert.equal((await remove('curriculum', 'Kurikulum Baru')).rows[0].deleted, true)
  await assert.rejects(db.exec('delete from public.book_classifications'))
  await db.exec('reset role; set role anon')
  assert.equal(
    (await db.query("select * from public.catalog_browse_groups('division')")).rows.length,
    6,
  )
  await db.exec('reset role')
  const allDeletionMigration = await readFile(
    'supabase/migrations/202610150006_delete_all_book_classifications.sql',
    'utf8',
  )
  const beforeAll = (await db.query('select * from public.products')).rows
  await db.exec(allDeletionMigration)
  await db.exec(allDeletionMigration)
  assert.deepEqual((await db.query('select * from public.products')).rows, beforeAll)
  await db.exec('set role anon')
  await assert.rejects(remove('division', 'sd-1-mipa'))
  await db.exec(
    "reset role; set role authenticated; set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222'",
  )
  await assert.rejects(remove('division', 'sd-1-mipa'), /classification_forbidden/)
  await db.exec("set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111'")
  await assert.rejects(remove('subject', 'Matematika', 'SMP'), /classification_forbidden/)
  await db.exec('reset role')
  await db.exec(
    "update public.products set education_level = 'SD', subject = 'Matematika', division_code = 'sd-1-mipa'",
  )
  await db.exec(
    "set role authenticated; set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111'",
  )
  await assert.rejects(remove('division', 'sd-1-mipa'), /classification_in_use/)
  await assert.rejects(remove('subject', 'Matematika', 'SD'), /classification_in_use/)
  await db.exec('reset role')
  await db.exec('update public.products set subject = null, division_code = null')
  const beforeDelete = (await db.query('select * from public.products')).rows
  await db.exec(
    "set role authenticated; set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111'",
  )
  assert.equal((await remove('division', 'sd-1-mipa')).rows[0].deleted, true)
  assert.equal((await remove('subject', 'Matematika', 'SD')).rows[0].deleted, true)
  await db.exec('reset role')
  assert.equal(
    (
      await db.query(
        "select * from public.book_classifications where kind = 'division' and code = 'sd-1-mipa'",
      )
    ).rows.length,
    0,
  )
  assert.equal(
    (
      await db.query(
        "select * from public.book_classifications where kind = 'subject' and code = 'Matematika' and education_level = 'SD'",
      )
    ).rows.length,
    0,
  )
  assert.deepEqual((await db.query('select * from public.products')).rows, beforeDelete)
  await db.exec(allDeletionMigration)
  assert.equal(
    (await db.query("select * from public.catalog_browse_groups('division')")).rows.length,
    5,
  )
  assert.equal(
    (
      await db.query(
        "select * from public.book_classifications where kind = 'subject' and code = 'Matematika' and education_level = 'SMP'",
      )
    ).rows.length,
    1,
  )
  console.log(
    'PASS: all options deletable, actual row removal, deleted rows remain absent after migration retry, product preservation, auth/scope and in-use checks retained.',
  )
  console.log(
    'PASS: full migration chain, preservation, default lists, retry, new options, duplicate rejection, subject scope, anon/Sales denial, immutable registry, database validation, and seven division groups (isolated PostgreSQL).',
  )
} finally {
  await db.close()
}
