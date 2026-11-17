<script setup lang="ts">
import { educationLevelSchema } from '#shared/schemas/auth'

const route = useRoute()
const level = computed(() => educationLevelSchema.safeParse(route.query.level).data ?? 'SD')
const { data, error, status, refresh } = await useFetch('/api/catalog/product-structure', {
  query: { level },
})
const nodes = computed(() =>
  (data.value ?? []).filter((node) => node.educationLevel === level.value && !node.archived),
)
const diagram = useTemplateRef<HTMLElement>('diagram')
const connectors = ref<string[]>([])
let observer: ResizeObserver | undefined
let frame = 0
function measureConnectors() {
  const container = diagram.value
  if (!container) {
    connectors.value = []
    return
  }
  const bounds = container.getBoundingClientRect()
  const root = container.querySelector<HTMLElement>('.diagram-root')
  const cards = new Map(
    Array.from(container.querySelectorAll<HTMLElement>('[data-structure-id]')).map((card) => [
      card.dataset.structureId,
      card,
    ]),
  )
  connectors.value = nodes.value.flatMap((node) => {
    const parent = node.parentId ? cards.get(node.parentId) : root
    const child = cards.get(node.id)
    if (!parent || !child) return []
    const from = parent.getBoundingClientRect()
    const to = child.getBoundingClientRect()
    const x1 = from.right - bounds.left
    const y1 = from.top + from.height / 2 - bounds.top
    const x2 = to.left - bounds.left
    const y2 = to.top + to.height / 2 - bounds.top
    const middle = (x1 + x2) / 2
    return [`M ${x1} ${y1} H ${middle} V ${y2} H ${x2}`]
  })
}
function scheduleMeasurement() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(measureConnectors)
}
async function observeDiagram() {
  await nextTick()
  observer?.disconnect()
  if (diagram.value) {
    observer?.observe(diagram.value)
    diagram.value
      .querySelectorAll('.node, .diagram-root')
      .forEach((card) => observer?.observe(card))
  }
  scheduleMeasurement()
}
onMounted(() => {
  observer = new ResizeObserver(scheduleMeasurement)
  observeDiagram()
  document.fonts.ready.then(scheduleMeasurement)
})
watch(nodes, () => {
  if (import.meta.client) observeDiagram()
})
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
})
function changeLevel(event: Event) {
  const value = educationLevelSchema.parse((event.target as HTMLSelectElement).value)
  return navigateTo({ path: route.path, query: { ...route.query, level: value } })
}
</script>

<template>
  <section class="division-structure" aria-labelledby="division-structure-title">
    <div class="structure-heading">
      <h1 id="division-structure-title">Struktur Produk</h1>
      <div class="level-field">
        <label for="division-structure-level">Jenjang pendidikan</label>
        <select id="division-structure-level" :value="level" @change="changeLevel">
          <option v-for="item in educationLevelSchema.options" :key="item" :value="item">
            {{ item }}
          </option>
        </select>
      </div>
    </div>
    <div class="diagram-panel" :aria-busy="status === 'pending'">
      <p v-if="status === 'pending'" class="message" role="status">Memuat struktur produk...</p>
      <div v-else-if="error" class="message" role="alert">
        <p>Struktur produk belum dapat dimuat.</p>
        <UButton class="mt-4" variant="outline" @click="refresh()">Coba lagi</UButton>
      </div>
      <template v-else-if="nodes.length">
        <div class="diagram-content" :aria-label="`Diagram struktur produk ${level}`">
          <div ref="diagram" class="diagram">
            <svg class="diagram-connectors" aria-hidden="true">
              <path v-for="(path, index) in connectors" :key="index" :d="path" />
            </svg>
            <NuxtLink class="diagram-root" :to="{ path: '/products', query: { level } }">
              <span>Produk {{ level }}</span>
            </NuxtLink>
            <ProductStructureDiagramBranch :nodes="nodes" :level="level" root />
          </div>
        </div>
      </template>
      <p v-else class="message" role="status">Struktur Produk {{ level }} belum tersedia.</p>
    </div>
  </section>
</template>

<style scoped>
.division-structure {
  margin: 64px 0 40px;
  color: #243e30;
}
.structure-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
h1 {
  font: 500 44px/1.2 var(--font-landing-serif);
  color: #242b26;
}
.level-field {
  display: grid;
  flex: 0 0 200px;
  gap: 8px;
  font-size: 13px;
}
select {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #cedcd2;
  border-radius: 12px;
  background-color: white;
  color: #1f5c3f;
  font: inherit;
}
.diagram-panel {
  overflow: hidden;
  border: 1px solid #dce6dd;
  border-radius: 24px;
  background: #f1f6f0;
}
.diagram-content {
  padding: 32px 24px;
}
.diagram {
  position: relative;
  display: flex;
  width: 100%;
  gap: 24px;
  align-items: center;
}
.diagram-connectors {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  fill: none;
  stroke: #aec4b4;
  stroke-width: 1.5;
  stroke-linejoin: round;
}
.diagram-root {
  display: flex;
  flex: 0 1 160px;
  min-width: 0;
  justify-content: center;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 16px 28px;
  border-radius: 14px;
  background: #1f5c3f;
  color: white;
  font-size: 18px;
  font-weight: 600;
}
.diagram-root span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.message {
  padding: 40px 24px;
  color: #687169;
  font-size: 14px;
}
select:focus-visible {
  outline: 2px solid #1f5c3f;
  outline-offset: -3px;
}
@media (max-width: 600px) {
  .diagram-content {
    padding: 24px 12px;
  }
  .diagram {
    gap: 10px;
  }
  .diagram-root {
    flex-basis: 64px;
    padding: 12px 6px;
    font-size: 12px;
  }
  .structure-heading {
    align-items: stretch;
    flex-direction: column;
  }
  .level-field {
    flex-basis: auto;
  }
  h1 {
    font-size: 36px;
  }
}
</style>
