<script setup>
import { computed, watch } from 'vue'
import { useGraphStore } from '../stores/graph'

const graph = useGraphStore()

const summary = computed(() => graph.components?.summary ?? null)
const comps = computed(() => graph.components?.components ?? [])
const maxSize = computed(() => summary.value?.largest || 1)

// Log scale so a giant component and tiny fragments are both visible.
function widthPct(size) {
  const m = Math.log(maxSize.value + 1) || 1
  return Math.max(6, Math.round((Math.log(size + 1) / m) * 100))
}
function label(index) {
  return index === 0 ? 'main component' : `cluster ${index + 1}`
}

// Recompute whenever the data or the shared filters change (same scope as the graph views).
watch(
  () => [
    graph.hasData,
    graph.filters.activeNodeTypes,
    graph.filters.activeLinkTypes,
    graph.filters.timeRange,
  ],
  () => { if (graph.hasData) graph.fetchComponents() },
  { immediate: true, deep: true },
)
</script>

<template>
  <article class="rounded-xl border border-slate-200 bg-white p-4">
    <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">Community discovery</p>
    <h3 class="text-base font-semibold text-slate-900">Connected components</h3>

    <div v-if="summary" class="mt-3 grid grid-cols-3 gap-2">
      <div class="rounded-lg bg-slate-50 px-3 py-2">
        <div class="text-[11px] text-slate-500">components</div>
        <div class="text-lg font-semibold text-slate-900">{{ summary.count.toLocaleString() }}</div>
      </div>
      <div class="rounded-lg bg-slate-50 px-3 py-2">
        <div class="text-[11px] text-slate-500">largest</div>
        <div class="text-lg font-semibold text-slate-900">{{ summary.largest.toLocaleString() }}</div>
      </div>
      <div class="rounded-lg bg-slate-50 px-3 py-2">
        <div class="text-[11px] text-slate-500">singletons</div>
        <div class="text-lg font-semibold text-slate-900">{{ summary.singletons.toLocaleString() }}</div>
      </div>
    </div>

    <div v-if="comps.length" class="mt-3 space-y-1.5">
      <button
        v-for="comp in comps"
        :key="comp.index"
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition hover:bg-slate-50"
        :title="`Draw this component (${comp.size} nodes) in the node-link`"
        @click="graph.focusComponent(comp.node_ids)"
      >
        <span class="w-24 shrink-0 truncate text-xs text-slate-700">{{ label(comp.index) }}</span>
        <span class="h-4 flex-1 overflow-hidden rounded bg-slate-100">
          <span class="block h-full rounded bg-emerald-500" :style="{ width: widthPct(comp.size) + '%' }" />
        </span>
        <span class="w-14 shrink-0 text-right text-xs font-medium text-slate-700">{{ comp.size.toLocaleString() }}</span>
      </button>
    </div>

    <p v-if="graph.componentsError" class="mt-2 text-[11px] text-rose-600">{{ graph.componentsError }}</p>
    <p v-else-if="graph.hasData && summary && !comps.length" class="mt-3 text-center text-xs text-slate-400">
      No components — check the active node and link types.
    </p>
    <p v-else-if="!graph.hasData" class="mt-3 text-center text-xs text-slate-400">
      Load a dataset to see its connected components.
    </p>

    <p class="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
      Click a component to draw it in the node-link · respects active filters
    </p>
  </article>
</template>
