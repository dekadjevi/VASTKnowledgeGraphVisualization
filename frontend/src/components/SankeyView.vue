<script setup>
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { sankey, sankeyLinkHorizontal } from 'd3-sankey'
import { useGraphStore } from '../stores/graph'

const graph = useGraphStore()
const svgRef = ref(null)
const topN = ref(12)
const expanded = ref(false)
const caption = ref('Hover a relationship to trace its path · source type → edge type → target type · click to focus the node-link view')

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
watch([topN, expanded], () => {
  if (graph.typeFlows) graph.fetchTypeFlows(topN.value).then(render)
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
        <h3 class="text-base font-semibold text-slate-900">Sankey — type → relationship → type</h3>
      </div>
      <div class="flex flex-wrap items-center gap-2">
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
      </div>
    </div>

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
  </article>
</template>
