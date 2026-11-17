<script setup lang="ts">
import type { StructureNode } from '#shared/schemas/product-structure'

const props = withDefaults(
  defineProps<{
    nodes: StructureNode[]
    level: StructureNode['educationLevel']
    parentId?: string | null
    root?: boolean
  }>(),
  { parentId: null, root: false },
)
const children = computed(() =>
  props.nodes
    .filter((node) => !node.archived && node.parentId === props.parentId)
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'id') || a.id.localeCompare(b.id),
    ),
)
</script>

<template>
  <ul v-if="children.length" class="branches" :class="{ 'root-branches': root }">
    <li v-for="node in children" :key="node.id" class="branch">
      <NuxtLink
        class="node"
        :data-structure-id="node.id"
        :to="{ path: '/products', query: { level, structure: node.id } }"
      >
        <span>{{ node.name }}</span>
        <small v-if="node.productStatus">{{ node.productStatus }}</small>
      </NuxtLink>
      <ProductStructureDiagramBranch :nodes="nodes" :level="level" :parent-id="node.id" />
    </li>
  </ul>
</template>

<style scoped>
.branches {
  position: relative;
  display: flex;
  flex: 2 1 0;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  margin: 0;
  padding: 8px 0 8px 24px;
  list-style: none;
}
.branch {
  display: flex;
  align-items: center;
  gap: 24px;
  min-width: 0;
  position: relative;
}
.node {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid #d2e1d6;
  border-radius: 12px;
  background: #fffefa;
  color: #344e41;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.node:hover {
  border-color: #6b977b;
  background: #e8f3ec;
}
.node:focus-visible {
  outline: 2px solid #1f5c3f;
  outline-offset: 2px;
}
small {
  align-self: start;
  max-width: 100%;
  padding: 2px 8px;
  border-radius: 6px;
  background: #f1ecfa;
  color: #654789;
  font-size: 10px;
}
.root-branches > .branch > .node {
  border-color: #b8d1bf;
  background: #dfece1;
  color: #1f5c3f;
  font-size: 14px;
  font-weight: 600;
}
@media (max-width: 600px) {
  .branches {
    padding-left: 10px;
    gap: 14px;
  }
  .branch {
    gap: 10px;
  }
  .node,
  .root-branches > .branch > .node {
    padding: 10px 6px;
    font-size: 12px;
  }
  small {
    padding: 2px 4px;
  }
}
</style>
