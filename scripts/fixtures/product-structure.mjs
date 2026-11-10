// Test examples only. Never imported by the application or production migrations.
export const structureIds = {
  root: 'a1111111-1111-4111-8111-111111111111',
  child: 'a2222222-2222-4222-8222-222222222222',
  leaf: 'a3333333-3333-4333-8333-333333333333',
  other: 'a4444444-4444-4444-8444-444444444444',
}
export const structureFixture = [
  {
    id: structureIds.root,
    educationLevel: 'SD',
    parentId: null,
    name: 'Buku Soal',
    sortOrder: 0,
    productStatus: null,
    archived: false,
  },
  {
    id: structureIds.child,
    educationLevel: 'SD',
    parentId: structureIds.root,
    name: 'Asesmen Formatif',
    sortOrder: 0,
    productStatus: null,
    archived: false,
  },
  {
    id: structureIds.leaf,
    educationLevel: 'SD',
    parentId: structureIds.child,
    name: 'Bupena Merdeka',
    sortOrder: 0,
    productStatus: 'Eksisting',
    archived: false,
  },
  {
    id: structureIds.other,
    educationLevel: 'SMP',
    parentId: null,
    name: 'Buku Teks',
    sortOrder: 0,
    productStatus: null,
    archived: false,
  },
]
