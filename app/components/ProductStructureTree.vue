<script setup lang="ts">
import { structurePath, type StructureNode } from '#shared/schemas/product-structure'
const props = withDefaults(
  defineProps<{
    nodes: StructureNode[]
    parentId?: string | null
    selectedId?: string | null
    depth?: number
  }>(),
  { parentId: null, selectedId: null, depth: 0 },
)
const emit = defineEmits<{ select: [id: string] }>()
const expanded = ref(new Set<string>())
const children = computed(() =>
  props.nodes
    .filter((node) => !node.archived && node.parentId === props.parentId)
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'id') || a.id.localeCompare(b.id),
    ),
)
const hasChildren = (id: string) =>
  props.nodes.some((node) => !node.archived && node.parentId === id)
watch(
  () => [props.nodes, props.selectedId] as const,
  () => {
    if (!props.parentId) for (const child of children.value) expanded.value.add(child.id)
    if (props.selectedId)
      for (const node of structurePath(props.nodes, props.selectedId)) expanded.value.add(node.id)
  },
  { immediate: true },
)
function toggle(id: string) {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
}
</script>

<template>
  <ul class="structure-tree" :style="{ paddingInlineStart: depth > 0 && depth < 6 ? '14px' : '0' }">
    <li v-for="node in children" :key="node.id">
      <div
        :id="`structure-node-${node.id}`"
        class="tree-row"
        :class="{ selected: selectedId === node.id }"
      >
        <button
          v-if="hasChildren(node.id)"
          type="button"
          class="tree-toggle"
          :aria-expanded="expanded.has(node.id)"
          :aria-label="`${expanded.has(node.id) ? 'Tutup' : 'Buka'} cabang ${node.name}`"
          @click="toggle(node.id)"
        >
          {{ expanded.has(node.id) ? '−' : '+' }}
        </button>
        <span v-else class="tree-leaf" aria-hidden="true">•</span>
        <button
          type="button"
          class="tree-select"
          :aria-current="selectedId === node.id ? 'true' : undefined"
          @click="emit('select', node.id)"
        >
          <span>{{ node.name }}</span
          ><small v-if="node.productStatus">{{ node.productStatus }}</small>
        </button>
      </div>
      <ProductStructureTree
        v-if="hasChildren(node.id) && expanded.has(node.id)"
        :nodes="nodes"
        :parent-id="node.id"
        :selected-id="selectedId"
        :depth="depth + 1"
        @select="emit('select', $event)"
      />
    </li>
  </ul>
</template>

<style scoped>
.structure-tree {
  list-style: none;
  margin: 0;
  min-width: 0;
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  margin: 4px 0;
  border: 1px solid transparent;
  border-radius: 10px;
}
.tree-row:hover {
  background: #f4f8f5;
}
.tree-row.selected {
  border-color: #7ba78d;
  background: #e8f3ec;
}
.tree-toggle,
.tree-leaf {
  display: grid;
  flex: 0 0 32px;
  height: 36px;
  place-items: center;
  color: #1f5c3f;
}
.tree-select {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: start;
  flex-direction: column;
  gap: 3px;
  padding: 10px 8px;
  text-align: left;
  overflow-wrap: anywhere;
  font-size: 14px;
}
.tree-select small {
  max-width: 100%;
  padding: 2px 7px;
  border-radius: 5px;
  background: #f1ecfa;
  color: #654789;
  font-size: 11px;
}
.tree-select > span {
  max-width: 100%;
}
button:focus-visible {
  outline: 2px solid #1f5c3f;
  outline-offset: 2px;
}
</style>
