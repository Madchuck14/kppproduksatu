import assert from 'node:assert/strict'
import { editorNips, planEditorNips } from './convert-editor-nips.mjs'

const accounts = Object.keys(editorNips).map((level) => ({ level, user_id: `editor-${level}` }))
const registry = [
  { nip: '000000000', user_id: 'super-editor', role: 'editor', education_level: 'SD' },
  { nip: '000000001', user_id: 'super-sales', role: 'sales', education_level: null },
]
const before = structuredClone({ accounts, registry })
const plan = planEditorNips(accounts, registry)
assert.deepEqual(
  plan.additions.map((row) => [row.education_level, row.nip]),
  [
    ['SD', '000000002'],
    ['SMP', '000000003'],
    ['SMA', '000000004'],
    ['SMK', '000000005'],
  ],
)
assert.deepEqual({ accounts, registry }, before, 'Planning never mutates identities')
assert.equal(
  planEditorNips(accounts, [...registry, ...plan.additions]).additions.length,
  0,
  'Retry is a no-op',
)
assert.equal(
  planEditorNips(accounts, [
    ...registry,
    ...plan.additions.map((row) =>
      row.education_level === 'SD' ? { ...row, nip: '000000010' } : row,
    ),
  ]).mappings[0].nip,
  '000000010',
  'Preserve existing NIP instead of renumbering',
)
for (const row of [
  { nip: '000000002', user_id: 'someone-else' },
  { nip: '000000002', user_id: null, role: 'editor', education_level: 'SD' },
  { nip: '000000011', user_id: 'editor-SD', role: 'sales', education_level: null },
  { nip: '000000011', user_id: 'editor-SD', role: 'editor', education_level: 'SMA' },
  { nip: '11', user_id: 'editor-SD', role: 'editor', education_level: 'SD' },
])
  assert.throws(() => planEditorNips(accounts, [...registry, row]), /Tidak ada data diubah/)
assert.throws(() => planEditorNips([...accounts, accounts[0]], registry), /duplikat/)
assert.throws(
  () =>
    planEditorNips(
      [
        { level: 'SD', user_id: 'same' },
        { level: 'SMP', user_id: 'same' },
      ],
      registry,
    ),
  /dua Editor/,
)
assert.throws(() => planEditorNips([{ level: 'invalid' }], registry), /tidak valid/)
assert.equal(
  planEditorNips([{ level: 'SD' }], registry).mappings[0].nip,
  '000000002',
  'New provisioning reserves the same NIP',
)
assert.equal(
  planEditorNips([{ level: 'SD' }], registry).additions.length,
  0,
  'Do not insert a link without an Auth ID',
)
assert.throws(
  () =>
    planEditorNips(accounts, [
      { nip: '000000003', user_id: 'editor-SD', role: 'editor', education_level: 'SD' },
    ]),
  /dipakai|bertabrakan/,
)
console.log(
  'PASS: SD/SMP/SMA/SMK continue 000000002–000000005; preserve existing links, retry no-op, reject occupied/unclaimed NIPs, wrong role/level/format, duplicate users/levels and cross-level collisions; new provisioning shares the same plan.',
)
