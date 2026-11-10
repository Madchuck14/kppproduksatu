import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { parseStructureSource, planStructureImport } from './import-product-structure.mjs'

const source = await readFile('docs/referensicabangproduk/granddesignproduct.txt', 'utf8')
const parsed = parseStructureSource(source)
assert.equal(parsed.nodes.length, 101)
assert.equal(parsed.deferred.length, 11)
assert.deepEqual(
  Object.fromEntries(
    ['SD', 'SMP', 'SMA', 'SMK'].map((level) => [
      level,
      parsed.nodes.filter((node) => node.educationLevel === level).length,
    ]),
  ),
  { SD: 32, SMP: 21, SMA: 15, SMK: 33 },
)
assert(
  parsed.deferred.some((node) => node.name.includes('Mata Uji Wajib')),
  'Prose with uncertainty is deferred even without a dash note',
)
assert(
  !parsed.nodes.some(
    (node) => node.educationLevel === 'SMP' && node.path.includes('Kelompok asesmen'),
  ),
  'Unverified parent defers its entire subtree',
)
assert(
  parsed.nodes.some((node) => node.educationLevel === 'SMA' && node.name === 'Asesmen Sumatif'),
  'Verified category with incomplete products remains valid',
)
assert(
  !parsed.nodes.some(
    (node) => node.name.includes('—') || /perlu dicocokkan|belum terverifikasi/.test(node.name),
  ),
)
const plan = planStructureImport(parsed, [])
assert.equal(new Set(plan.additions.map((row) => row.id)).size, 101)
assert(plan.additions.every((row) => row.product_status === null && !row.archived))
assert.equal(
  planStructureImport(parsed, plan.additions).additions.length,
  0,
  'Retry must not duplicate any path',
)
assert.throws(
  () => planStructureImport(parsed, [{ ...plan.additions[0], archived: true }]),
  /arsip/,
)
assert.throws(
  () => planStructureImport(parsed, [plan.additions[0], { ...plan.additions[0], id: 'other' }]),
  /duplikat/,
)
assert.throws(
  () => planStructureImport(parsed, [{ ...plan.additions[0], name: 'Renamed' }]),
  /ID impor/,
)
const preserved = {
  ...plan.additions[0],
  id: '99999999-9999-4999-8999-999999999999',
  sort_order: 999,
  product_status: 'Existing status',
}
const merged = planStructureImport(parsed, [preserved])
assert.equal(merged.reused, 1)
assert(merged.additions.some((row) => row.parent_id === preserved.id))
assert.equal(preserved.sort_order, 999)
assert.throws(() => parseStructureSource(source.replace('  - ESPS', '   - ESPS')), /Format/)
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create function auth.uid() returns uuid language sql stable as $$select null::uuid;$$;
    create table public.account_memberships(user_id uuid,role text,is_super boolean);
    create table public.products(id uuid primary key default gen_random_uuid(),education_level text);`)
  await db.exec(await readFile('supabase/migrations/202611100005_product_structure.sql', 'utf8'))
  const insert = `insert into public.product_structure_nodes(id,education_level,parent_id,name,sort_order,product_status,archived)
    select id,education_level,parent_id,name,sort_order,product_status,archived from jsonb_to_recordset($1::jsonb)
    as n(id uuid,education_level text,parent_id uuid,name text,sort_order integer,product_status text,archived boolean) returning id`
  const bad = {
    ...plan.additions[0],
    id: '88888888-8888-4888-8888-888888888888',
    parent_id: '77777777-7777-4777-8777-777777777777',
  }
  await assert.rejects(
    db.query(insert, [JSON.stringify([...plan.additions, bad])]),
    /structure_parent_invalid/,
  )
  assert.equal(
    (await db.query('select count(*)::integer as count from public.product_structure_nodes'))
      .rows[0].count,
    0,
    'Failed bulk insert leaves no partial hierarchy',
  )
  assert.equal(
    Number(
      (await db.query('select revision from product_structure_private.write_guard')).rows[0]
        .revision,
    ),
    0,
    'Failed insert rolls back private guard writes',
  )
  assert.equal((await db.query(insert, [JSON.stringify(plan.additions)])).rows.length, 101)
  const rows = (await db.query('select * from public.product_structure_nodes')).rows
  assert.equal(planStructureImport(parsed, rows).additions.length, 0)
} finally {
  await db.close()
}
console.log(
  'PASS: 101 approved nodes across four levels, 11 deferred including uncertain subtrees/prose; verified category retained, stable IDs/paths, existing metadata preserved, duplicate/archive/renamed conflicts rejected, and atomic parent-first bulk insert/rollback with actual database triggers.',
)
