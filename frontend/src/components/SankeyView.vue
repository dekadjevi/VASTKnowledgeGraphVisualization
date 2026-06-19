<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import * as d3 from 'd3'
import { sankey, sankeyLinkHorizontal } from 'd3-sankey'
import { useGraphStore } from '../stores/graph'

const graph = useGraphStore()
const svgRef = ref(null)
const topN = ref(12)
const expanded = ref(false)
const caption = ref('Hover a relationship to trace its path · source type → edge type → target type · click to focus the node-link view')

// Label for the current grouping dimension ('type' by default, else the attribute).
const dimLabel = computed(() => {
  const gb = graph.typeFlows?.group_by
  return gb && gb !== 'Node Type' ? gb : 'type'
})

// Two independent tabs in this card: the flow Sankey, and an influence ranking.
const tab = ref('flows')

// Ranking-tab controls (generic; defaults aim at the music graph but nothing is hardcoded).
const rankAttr = ref('')
const rankValue = ref('')
const rankVia = ref('')
const rankDir = ref('incoming')
watch(
  () => graph.groupableAttrs,
  (g) => { if (g.length && !rankAttr.value) rankAttr.value = g[0].key },
  { immediate: true },
)
const ranking = computed(() => graph.influenceRanking?.ranking ?? [])
const rankMax = computed(() => Math.max(1, ...ranking.value.map((r) => r.count)))
function runRanking() {
  graph.fetchInfluenceRanking({
    sourceAttr: rankAttr.value,
    sourceValue: rankValue.value.trim(),
    via: rankVia.value || null,
    direction: rankDir.value,
    top: 12,
  })
}

function render() {
  const svgEl = svgRef.value
  const data = graph.typeFlows
  if (!svgEl || !data || !data.flows?.length) return

  const W = 820
  const H = expanded.value ? 460 : 260
  const flows = data.flows

  // Three layers: source types -> edge types -> target types (strict DAG).
  const seen = new Set()
  const nodes = []
  const ensure = (id, name, kind) => {
    if (!seen.has(id)) { seen.add(id); nodes.push({ id, name, kind }) }
  }
  const leftMap = new Map()
  const rightMap = new Map()
  flows.forEach((f) => {
    ensure(`src:${f.source_type}`, f.source_type, 'type')
    ensure(`edge:${f.edge_type}`, f.edge_type, 'edge')
    ensure(`tgt:${f.target_type}`, f.target_type, 'type')
    const lk = `src:${f.source_type}|edge:${f.edge_type}`
    leftMap.set(lk, (leftMap.get(lk) || 0) + f.count)
    const rk = `edge:${f.edge_type}|tgt:${f.target_type}`
    rightMap.set(rk, (rightMap.get(rk) || 0) + f.count)
  })
  const links = []
  leftMap.forEach((v, k) => {
    const [s, e] = k.split('|')
    links.push({ source: s, target: e, value: v, edge: e.slice(5), side: 'left', known: s.slice(4) })
  })
  rightMap.forEach((v, k) => {
    const [e, t] = k.split('|')
    links.push({ source: e, target: t, value: v, edge: e.slice(5), side: 'right', known: t.slice(4) })
  })

  const edgeTypes = [...new Set(flows.map((f) => f.edge_type))]
  const color = d3.scaleOrdinal().domain(edgeTypes).range(d3.schemePaired)

  const layout = sankey()
    .nodeId((d) => d.id)
    .nodeWidth(12)
    .nodePadding(10)
    .extent([[1, 8], [W - 1, H - 8]])

  const g = layout({
    nodes: nodes.map((d) => ({ ...d })),
    links: links.map((d) => ({ ...d })),
  })

  const svg = d3.select(svgEl)
  svg.selectAll('*').remove()

  const link = svg
    .append('g')
    .attr('fill', 'none')
    .selectAll('path')
    .data(g.links)
    .join('path')
    .attr('d', sankeyLinkHorizontal())
    .attr('stroke', (d) => color(d.edge))
    .attr('stroke-opacity', 0.45)
    .attr('stroke-width', (d) => Math.max(1, d.width))
    .style('cursor', 'pointer')
    .on('mouseover', (e, d) => {
      link.attr('stroke-opacity', 0.1)
      d3.select(e.currentTarget).attr('stroke-opacity', 0.85)
      const arrow = d.side === 'left' ? `${d.known} → ${d.edge}` : `${d.edge} → ${d.known}`
      caption.value = `${arrow} : ${d.value.toLocaleString()} edges`
    })
    .on('mouseout', () => {
      link.attr('stroke-opacity', 0.45)
      caption.value = 'Hover a relationship to trace its path · source type → edge type → target type · click to focus the node-link view'
    })
    .on('click', (_e, d) => {
      const grouped = graph.typeFlows?.group_by && graph.typeFlows.group_by !== 'Node Type'
      if (grouped && d.side === 'left') {
        // Attribute mode (e.g. genre): clicking a source drills into its
        // outgoing flows -> "Oceanus Folk → other genres".
        graph.focusFlowSource(d.known)
        return
      }
      const matching = flows.filter((f) =>
        f.edge_type === d.edge &&
        (d.side === 'left' ? f.source_type === d.known : f.target_type === d.known),
      )
      const nodeTypes = []
      matching.forEach((f) => nodeTypes.push(f.source_type, f.target_type))
      graph.focusTypes(nodeTypes, [d.edge])
    })

  svg
    .append('g')
    .selectAll('rect')
    .data(g.nodes)
    .join('rect')
    .attr('x', (d) => d.x0)
    .attr('y', (d) => d.y0)
    .attr('width', (d) => d.x1 - d.x0)
    .attr('height', (d) => Math.max(1, d.y1 - d.y0))
    .attr('rx', 2)
    .attr('fill', (d) => (d.kind === 'edge' ? color(d.name) : '#475569'))

  svg
    .append('g')
    .selectAll('text')
    .data(g.nodes)
    .join('text')
    .attr('x', (d) => (d.x0 < W / 3 ? d.x0 - 6 : d.x1 + 6))
    .attr('y', (d) => (d.y0 + d.y1) / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', (d) => (d.x0 < W / 3 ? 'end' : 'start'))
    .attr('font-size', (d) => (d.kind === 'edge' ? 9 : 11))
    .attr('fill', '#334155')
    .attr('stroke', '#fff')
    .attr('stroke-width', (d) => (d.kind === 'edge' ? 2.5 : 0))
    .style('paint-order', 'stroke')
    .text((d) => d.name)
}

function load() {
  if (graph.hasData) graph.fetchTypeFlows(topN.value)
}

watch(() => graph.graphId, load)
watch(() => graph.typeFlows, render)
watch([topN, expanded, () => graph.flowGroupBy, () => graph.flowFocus], () => {
  if (graph.hasData) graph.fetchTypeFlows(topN.value).then(render)
})
onMounted(load)
</script>

<template>
  <article
    class="rounded-xl border border-slate-200 bg-white p-4"
    :class="expanded ? 'sm:col-span-2 xl:col-span-3' : ''"
  >
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">Graph visualization</p>
        <h3 v-if="tab === 'flows'" class="text-base font-semibold text-slate-900">
          Sankey — {{ dimLabel }} → relationship → {{ dimLabel }}
          <span v-if="graph.flowFocus != null" class="font-normal text-slate-500">· {{ graph.flowFocus }} →</span>
        </h3>
        <h3 v-else class="text-base font-semibold text-slate-900">Influence ranking — who is most affected</h3>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex overflow-hidden rounded-md border border-slate-300 text-xs">
          <button
            type="button"
            class="px-2.5 py-1 font-medium transition"
            :class="tab === 'flows' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'"
            @click="tab = 'flows'"
          >Flows</button>
          <button
            v-if="graph.groupableAttrs.length"
            type="button"
            class="px-2.5 py-1 font-medium transition"
            :class="tab === 'ranking' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'"
            @click="tab = 'ranking'"
          >Ranking</button>
        </div>
        <template v-if="tab === 'flows'">
          <select
            v-if="graph.groupableAttrs.length"
            :value="graph.flowGroupBy"
            @change="graph.setFlowGroupBy($event.target.value)"
            class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
          >
            <option value="Node Type">Group: type</option>
            <option v-for="a in graph.groupableAttrs" :key="a.key" :value="a.key">Group: {{ a.key }}</option>
          </select>
          <button
            v-if="graph.flowFocus != null"
            type="button"
            class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            @click="graph.clearFlowFocus()"
          >
            ← {{ graph.flowFocus }}
          </button>
          <select v-model.number="topN" class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600">
            <option :value="8">Top 8</option>
            <option :value="12">Top 12</option>
            <option :value="0">All</option>
          </select>
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            @click="expanded = !expanded"
          >
            {{ expanded ? 'Shrink' : 'Expand' }}
          </button>
        </template>
      </div>
    </div>

    <div v-show="tab === 'flows'">
      <p v-if="graph.typeFlowsError" class="mt-2 text-[11px] text-rose-600">{{ graph.typeFlowsError }}</p>

      <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50">
        <svg
          v-show="graph.typeFlows"
          ref="svgRef"
          :viewBox="`0 0 820 ${expanded ? 460 : 260}`"
          class="w-full"
          :style="{ height: expanded ? '460px' : '260px' }"
        />
        <div
          v-if="!graph.typeFlows"
          class="flex items-center justify-center px-3 text-center text-xs text-slate-400"
          :style="{ height: expanded ? '460px' : '260px' }"
        >
          Load a dataset to see the type-flow Sankey
        </div>
      </div>

      <p class="mt-2 text-[11px] text-slate-500">{{ caption }}</p>
    </div>

    <div v-if="tab === 'ranking'" class="mt-3">
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="rankAttr" class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600">
          <option v-for="a in graph.groupableAttrs" :key="a.key" :value="a.key">{{ a.key }}</option>
        </select>
        <input
          v-model="rankValue"
          placeholder="value, e.g. Oceanus Folk"
          class="w-40 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
        />
        <select v-model="rankVia" class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600">
          <option value="">roll up: none</option>
          <option v-for="t in graph.linkTypes" :key="t.key" :value="t.key">via {{ t.key }}</option>
        </select>
        <select v-model="rankDir" class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600">
          <option value="incoming">affected by</option>
          <option value="outgoing">draws from</option>
        </select>
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          :disabled="!rankValue.trim() || graph.influenceLoading"
          @click="runRanking"
        >
          {{ graph.influenceLoading ? '…' : 'Rank' }}
        </button>
      </div>

      <p class="mt-1 text-[11px] text-slate-400">Edge scope = active link types in the sidebar.</p>
      <p v-if="graph.influenceError" class="mt-2 text-[11px] text-rose-600">{{ graph.influenceError }}</p>

      <div class="mt-3 space-y-1.5">
        <div v-for="r in ranking" :key="r.id" class="flex items-center gap-2">
          <div class="w-28 shrink-0 truncate text-right text-xs text-slate-700" :title="r.label">{{ r.label }}</div>
          <div class="h-4 flex-1 overflow-hidden rounded bg-slate-100">
            <div class="h-full rounded bg-emerald-500" :style="{ width: (r.count / rankMax * 100) + '%' }" />
          </div>
          <div class="w-6 shrink-0 text-xs font-medium text-slate-700">{{ r.count }}</div>
        </div>
      </div>

      <p v-if="graph.influenceRanking && !ranking.length" class="mt-3 text-center text-xs text-slate-400">
        No matches — check the value, the active link types, or the direction.
      </p>
      <p v-else-if="!graph.influenceRanking" class="mt-3 text-center text-xs text-slate-400">
        Pick an attribute, type a value, optionally a roll-up relation, then Rank.
      </p>
    </div>
  </article>
</template>
