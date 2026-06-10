<script setup>
import { computed } from 'vue'
import { useGraphStore } from '../stores/graph'

const graph = useGraphStore()

// Heights in percent for the simple CSS/SVG histograms. Replace with D3
// charts once the real views are built.
function scale(values) {
  const max = Math.max(1, ...values)
  return values.map((v) => Math.round((v / max) * 100))
}

const nodeBars = computed(() => {
  const h = scale(graph.nodesByType.map((t) => t.count))
  return graph.nodesByType.map((t, i) => ({ ...t, h: h[i] }))
})
const edgeBars = computed(() => {
  const h = scale(graph.edgesByType.map((t) => t.count))
  return graph.edgesByType.map((t, i) => ({ ...t, h: h[i] }))
})
const degreeBars = computed(() => scale(graph.degreeCentrality.map((d) => d.count)))
</script>

<template>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <article class="rounded-lg border border-slate-200 bg-white p-3">
      <p class="mb-2 text-xs text-slate-500">Nodes by type</p>
      <div class="flex h-11 items-end gap-1">
        <div
          v-for="(t, i) in nodeBars"
          :key="i"
          class="flex-1 rounded-t"
          :class="t.active ? 'bg-sky-500' : 'bg-slate-200'"
          :style="{ height: t.h + '%' }"
        />
      </div>
    </article>

    <article class="rounded-lg border border-slate-200 bg-white p-3">
      <p class="mb-2 text-xs text-slate-500">Edges by type</p>
      <div class="flex h-11 items-end gap-1">
        <div
          v-for="(t, i) in edgeBars"
          :key="i"
          class="flex-1 rounded-t"
          :class="t.active ? 'bg-sky-500' : 'bg-slate-200'"
          :style="{ height: t.h + '%' }"
        />
      </div>
    </article>

    <article class="rounded-lg border border-slate-200 bg-white p-3">
      <p class="mb-2 text-xs text-slate-500">Degree centrality</p>
      <div class="flex h-11 items-end gap-0.5">
        <div
          v-for="(h, i) in degreeBars"
          :key="i"
          class="flex-1 rounded-t bg-sky-500"
          :style="{ height: h + '%' }"
        />
      </div>
    </article>
  </div>
</template>
