<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useGraphStore } from '../stores/graph'

const graph = useGraphStore()
const scope = ref('all') // 'all' | 'ego'
const bucket = ref('auto') // 'auto' | 'year' | 'month' | 'day'
const group = ref('') // '' (none) | a category attribute, e.g. 'genre' / 'Edge Type'
const expanded = ref(false)

// Categorical palette for stacked groups (last colour reserved for "Other").
const PALETTE = ['#1D9E75', '#EF9F27', '#378ADD', '#E24B4A', '#9B6BD6', '#E27AB5', '#888780']

function load() {
  const ego = scope.value === 'ego' && graph.selectedNode ? graph.selectedNode.id : null
  graph.fetchTimeline({ ego, bucket: bucket.value, groupBy: group.value || null })
}

// Follow the shared selection: scope to the entity when one is chosen, whole
// graph otherwise. Keeps the Temporal card in step with the Ego card.
watch(
  () => graph.selectedNode,
  (n) => {
    scope.value = n ? 'ego' : 'all'
    if (graph.hasData) load()
  },
)
watch([bucket, group, scope], load)
watch(
  () => graph.graphId,
  () => {
    scope.value = 'all'
    group.value = ''
    if (graph.hasData) load()
  },
)
onMounted(() => {
  if (graph.hasData) load()
})

const tl = computed(() => graph.timeline)
const grouped = computed(() => !!(tl.value && tl.value.groups && tl.value.groups.length))
const maxCount = computed(() =>
  tl.value?.buckets?.length ? Math.max(...tl.value.buckets.map((b) => b.count)) : 1,
)
const colorOf = (g, i) => (g === 'Other' ? '#888780' : PALETTE[i % PALETTE.length])
const chartPx = computed(() => (expanded.value ? 230 : 140))

// Group-by options depend on where time was found: node-time graphs (music)
// expose genre/type; edge-time graphs (committee) expose the relationship type.
const groupOptions = computed(() => {
  const src = tl.value?.source
  if (src === 'node') {
    return [
      { val: '', label: 'No split' },
      { val: 'genre', label: 'By genre' },
      { val: 'Node Type', label: 'By type' },
    ]
  }
  if (src === 'edge') {
    return [
      { val: '', label: 'No split' },
      { val: 'Edge Type', label: 'By type' },
    ]
  }
  return [{ val: '', label: 'No split' }]
})

const sourceLabel = computed(() => {
  const t = tl.value
  if (!t || !t.time_field) return ''
  const where = t.source === 'edge' ? 'edge' : 'node'
  return `${where} field "${t.time_field}" · ${t.granularity ?? ''}`
})
const labelEvery = computed(() => {
  const n = tl.value?.buckets?.length ?? 0
  // A collapsed card is narrow, so show far fewer labels there; densify when expanded.
  const target = expanded.value ? 16 : 8
  return n <= target ? 1 : Math.ceil(n / target)
})
</script>

<template>
  <article
    class="rounded-xl border border-slate-200 bg-white p-4"
    :class="expanded ? 'sm:col-span-2 xl:col-span-3' : ''"
  >
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Temporal projection
        </p>
        <h3 class="text-base font-semibold text-slate-900">
          Activity over time<span v-if="scope === 'ego' && graph.selectedNode" class="font-normal text-slate-500">
            &mdash; {{ graph.selectedNode.label }}</span
          >
        </h3>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div v-if="graph.selectedNode" class="inline-flex overflow-hidden rounded-md border border-slate-300">
          <button type="button" class="px-2.5 py-1 text-xs"
            :class="scope === 'all' ? 'bg-sky-50 text-sky-700' : 'bg-white text-slate-500'"
            @click="scope = 'all'">All</button>
          <button type="button" class="border-l border-slate-300 px-2.5 py-1 text-xs"
            :class="scope === 'ego' ? 'bg-sky-50 text-sky-700' : 'bg-white text-slate-500'"
            @click="scope = 'ego'">
            {{ graph.selectedNode.label.length > 14 ? graph.selectedNode.label.slice(0, 13) + '\u2026' : graph.selectedNode.label }}
          </button>
        </div>
        <select v-model="group" class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600">
          <option v-for="o in groupOptions" :key="o.val" :value="o.val">{{ o.label }}</option>
        </select>
        <select v-model="bucket" class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600">
          <option value="auto">Auto</option>
          <option value="year">Year</option>
          <option value="month">Month</option>
          <option value="day">Day</option>
        </select>
        <button type="button"
          class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          @click="expanded = !expanded">{{ expanded ? 'Shrink' : 'Expand' }}</button>
      </div>
    </div>

    <!-- legend (only when stacked) -->
    <div v-if="grouped" class="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      <span v-for="(g, i) in tl.groups" :key="g" class="inline-flex items-center text-[11px] text-slate-600">
        <span class="mr-1 inline-block h-2.5 w-2.5 rounded-sm" :style="{ background: colorOf(g, i) }" />{{ g }}
      </span>
    </div>

    <p v-if="graph.timelineLoading" class="mt-2 text-[11px] text-slate-500">Loading timeline&hellip;</p>
    <p v-else-if="graph.timelineError" class="mt-2 text-[11px] text-rose-600">{{ graph.timelineError }}</p>

    <template v-if="tl && tl.buckets && tl.buckets.length">
      <div class="mt-3 flex items-end gap-[3px] border-b border-slate-200" :style="{ height: (chartPx + 10) + 'px' }">
        <div v-for="b in tl.buckets" :key="b.key" class="flex-1"
          :title="`${b.key} \u00b7 ${b.count}`"
          :style="{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }">
          <!-- stacked segments when grouped, single bar otherwise -->
          <template v-if="grouped">
            <div v-for="(g, i) in tl.groups" :key="g"
              :style="{ height: ((b.by[g] || 0) / maxCount * chartPx) + 'px', background: colorOf(g, i) }"
              :class="i === 0 ? 'w-full rounded-t-sm' : 'w-full'" />
          </template>
          <div v-else class="w-full rounded-t-sm bg-sky-500/80"
            :style="{ height: (b.count / maxCount * chartPx) + 'px' }" />
        </div>
      </div>
      <div class="mt-1 flex gap-[3px]">
        <div v-for="(b, i) in tl.buckets" :key="b.key" class="flex-1 text-center text-[10px] text-slate-400">
          <span v-if="i % labelEvery === 0">{{ b.key }}</span>
        </div>
      </div>
      <p class="mt-2 text-[11px] text-slate-400">
        {{ tl.total_timestamped.toLocaleString() }} timestamped
        {{ tl.source === 'edge' ? 'events' : 'records' }} &middot; {{ sourceLabel }}
        <span v-if="scope === 'ego'"> &middot; scoped to selection</span>
      </p>
    </template>

    <div v-else-if="!graph.timelineLoading && !graph.timelineError"
      class="mt-3 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-center text-xs text-slate-400"
      :style="{ height: (chartPx + 10) + 'px' }">
      No time data found in this {{ scope === 'ego' ? 'neighborhood' : 'dataset' }}.
    </div>
  </article>
</template>
