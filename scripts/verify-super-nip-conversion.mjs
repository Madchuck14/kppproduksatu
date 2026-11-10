import assert from 'node:assert/strict'
import { planSuperNips } from './convert-super-nips.mjs'

const editor = { user_id: 'editor', role: 'editor', created_at: '2026-01-01' }
const sales = { user_id: 'sales', role: 'sales', created_at: '2025-01-01' }
const accounts = [sales, editor]
const before = structuredClone(accounts)
const plan = planSuperNips(accounts, [])
assert.deepEqual(
  plan.additions.map((row) => [row.role, row.nip]),
  [
    ['editor', '000000000'],
    ['sales', '000000001'],
  ],
)
assert.deepEqual(accounts, before, 'Planning never mutates account data')
assert.equal(planSuperNips(accounts, plan.additions).additions.length, 0, 'Retry is a no-op')
assert.throws(
  () => planSuperNips(accounts, [{ nip: '000000000', user_id: 'other' }]),
  /sudah memiliki/,
)
assert.throws(
  () => planSuperNips(accounts, [{ nip: '000000001', user_id: 'other' }]),
  /sudah dipakai/,
)
assert.throws(
  () => planSuperNips(accounts, [{ nip: '123', user_id: 'editor' }]),
  /pemetaan berbeda/,
)
const extra = { user_id: 'extra-editor', role: 'editor', created_at: '2027-01-01' }
assert.equal(
  planSuperNips([...accounts, extra], plan.additions).additions[0].nip,
  '000000002',
  'New super accounts never shift existing NIPs',
)
assert.equal(
  planSuperNips([...accounts, extra], [], extra.user_id).additions[0].user_id,
  extra.user_id,
)
console.log(
  'PASS: Editor starts at 000000000, Sales follows, 9-digit padding, collisions rejected, retry safe, new accounts preserve earlier NIPs, configured primary Editor prioritized; account data unchanged.',
)
