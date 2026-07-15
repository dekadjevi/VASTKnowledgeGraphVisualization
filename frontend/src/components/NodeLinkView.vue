<script setup>
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import * as d3 from 'd3'
import { useGraphStore } from '../stores/graph'

const graph = useGraphStore()
const svgRef = ref(null)
const limit = ref(300)
const expanded = ref(false)
const lastRendered = ref(null) // node-type snapshot at the last filter render
const W = 820
const H = 440
let simulation = null

const noTypes = computed(() => graph.filters.activeNodeTypes.length === 0)

// True when the current type selection differs from what's currently drawn.
const filtersChanged = computed(() => {
  if (!graph.subgraph || !lastRendered.value) return false
  const a = lastRendered.value
  const b = graph.filters.activeNodeTypes
  return a.length !== b.length || a.some((t) => !b.includes(t))
})

const canvasHeight = computed(() => (expanded.value ? '560px' : '300px'))

function colorScale() {
  const types = graph.nodeTypes.map((t) => t.key)
  return d3.scaleOrdinal().domain(types).range(d3.schemeTableau10)
}

async function renderFilter() {
  if (noTypes.value) return
  await graph.fetchSubgraph({ limit: limit.value })
  lastRendered.value = [...graph.filters.activeNodeTypes]
}

function render() {
  const data = graph.subgraph
  const svgEl = svgRef.value
  if (!data || !svgEl) return

  // Any real render (manual button, or a Sankey ribbon-click that re-scopes the
  // filter and refetches) syncs the snapshot, so the "Filters changed" badge
  // reflects reality. A pure sidebar toggle doesn't render, so it still prompts.
  lastRendered.value = [...graph.filters.activeNodeTypes]

  const nodes = data.nodes.map((d) => ({ ...d }))
  const links = data.links.map((d) => ({ ...d }))

  const adj = new Map(nodes.map((n) => [n.id, new Set()]))
  data.links.forEach((l) => {
    adj.get(String(l.source))?.add(String(l.target))
    adj.get(String(l.target))?.add(String(l.source))
  })

  const color = colorScale()
  const maxDeg = d3.max(nodes, (d) => d.degree) || 1
  const r = d3.scaleSqrt().domain([0, maxDeg]).range([3, 13])
  const topIds = new Set(
    [...nodes].sort((a, b) => b.degree - a.degree).slice(0, 12).map((n) => n.id),
  )

  const svg = d3.select(svgEl)
  // normalise a link endpoint to its id (it's a string before the force layout
  // runs, and a node object afterwards).
  const idOf = (d) => (d && typeof d === 'object' ? d.id : d)

  // Build the persistent layer structure ONCE; on later renders we reuse it and
  // let D3's data-join (.join) reconcile elements (enter / update / exit) instead
  // of wiping the whole SVG with selectAll('*').remove().
  let g = svg.select('g.nl-root')
  if (g.empty()) {
    g = svg.append('g').attr('class', 'nl-root')
    g.append('g').attr('class', 'nl-links').attr('stroke', '#94a3b8').attr('stroke-opacity', 0.45)
    g.append('g').attr('class', 'nl-nodes').attr('stroke', '#fff').attr('stroke-width', 1)
    g.append('g').attr('class', 'nl-labels')
    svg.call(d3.zoom().scaleExtent([0.2, 6]).on('zoom', (e) => g.attr('transform', e.transform)))
  }

  const link = g.select('g.nl-links')
    .selectAll('line')
    .data(links, (d) => `${idOf(d.source)}|${idOf(d.target)}`)
    .join('line')
    .attr('stroke-width', 1)

  const node = g.select('g.nl-nodes')
    .selectAll('circle')
    .data(nodes, (d) => d.id)
    .join((enter) => enter.append('circle').call((c) => c.append('title')))
    .attr('r', (d) => r(d.degree))
    .attr('fill', (d) => color(d.type))
    .style('cursor', 'pointer')
    .on('mouseover', (_e, d) => {
      const near = adj.get(d.id) || new Set()
      node.attr('opacity', (o) => (o.id === d.id || near.has(o.id) ? 1 : 0.12))
      link.attr('stroke-opacity', (l) =>
        idOf(l.source) === d.id || idOf(l.target) === d.id ? 0.85 : 0.04,
      )
      labels.attr('opacity', (o) => (o.id === d.id || near.has(o.id) ? 1 : 0.12))
    })
    .on('mouseout', () => {
      node.attr('opacity', 1)
      link.attr('stroke-opacity', 0.45)
      labels.attr('opacity', 1)
    })
    .on('click', (_e, d) => {
      // Coordinated views: clicking a node feeds the Ego card via the SAME store
      // action the Ego search uses. The node-link's own state (sample + zoom) is
      // left untouched -- this only re-centres the Ego card on the clicked node.
      graph.selectNode({ id: d.id, label: d.label, type: d.type })
    })
    .call(
      d3
        .drag()
        .on('start', (e, d) => {
          if (!e.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (e, d) => {
          d.fx = e.x
          d.fy = e.y
        })
        .on('end', (e, d) => {
          if (!e.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        }),
    )

  node.select('title').text((d) => `${d.label}\n${d.type} · degree ${d.degree}`)

  const labels = g.select('g.nl-labels')
    .selectAll('text')
    .data(nodes.filter((n) => topIds.has(n.id)), (d) => d.id)
    .join('text')
    .text((d) => d.label)
    .attr('font-size', 9)
    .attr('fill', '#334155')
    .attr('pointer-events', 'none')

  if (simulation) simulation.stop()
  simulation = d3
    .forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d) => d.id).distance(45))
    .force('charge', d3.forceManyBody().strength(-100))
    //.force('center', d3.forceCenter(W / 2, H / 2))
    //.force('x', d3.forceX(W / 2).strength(0.06))
    //.force('y', d3.forceY(H / 2).strength(0.06))
    //.force('collide', d3.forceCollide().radius((d) => r(d.degree) + 2))
    .on('tick', () => {
      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y)
      node.attr('cx', (d) => d.x).attr('cy', (d) => d.y)
      labels.attr('x', (d) => d.x + 6).attr('y', (d) => d.y + 3)
    })
}

// Render AFTER Vue has patched the DOM 
watch(() => graph.subgraph, () => nextTick(render), { flush: 'post' })

// Draw once as soon as a dataset is loaded, with a small budget, so the card is
// never blank. Subsequent redraws stay on demand via the Render button, which
// keeps the "compose a filter, then draw" model for heavier views.
watch(
  () => graph.hasData,
  async (ready) => {
    if (!ready || graph.subgraph) return
    limit.value = 150
    await renderFilter()
  },
  { immediate: true },
)

onBeforeUnmount(() => simulation && simulation.stop())
</script>

<template>
  <article
    class="rounded-xl border border-slate-200 bg-white p-4"
    :class="expanded ? 'sm:col-span-2 xl:col-span-3' : ''"
  >
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">Graph visualization</p>
        <h3 class="text-base font-semibold text-slate-900">Node-link diagram</h3>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span
          v-if="filtersChanged"
          class="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700"
        >
          Filters changed — click Render
        </span>
        <select v-model.number="limit" class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600">
          <option :value="150">150</option>
          <option :value="300">300</option>
          <option :value="500">500</option>
        </select>
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          @click="expanded = !expanded"
        >
          {{ expanded ? 'Shrink' : 'Expand' }}
        </button>
        <button
          type="button"
          class="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 disabled:opacity-50"
          :disabled="!graph.hasData || graph.subgraphLoading || noTypes"
          @click="renderFilter"
        >
          {{ graph.subgraphLoading ? 'Rendering…' : 'Render graph' }}
        </button>
      </div>
    </div>

    <div v-if="expanded && graph.subgraph" class="mt-2 flex flex-wrap gap-2">
      <span v-for="t in graph.nodeTypes" :key="t.key" class="flex items-center gap-1 text-[11px] text-slate-500">
        <span class="inline-block h-2.5 w-2.5 rounded-full" :style="{ background: colorScale()(t.key) }" />
        {{ t.label }}
      </span>
    </div>

    <p v-if="graph.subgraph?.truncated" class="mt-2 text-[11px] text-amber-600">
      Showing a connected sample of {{ graph.subgraph.node_count }} nodes grown from the busiest hubs. Narrow the filter, or click a node to open it in the Ego network card.
    </p>
    <p v-if="graph.subgraphError" class="mt-2 text-[11px] text-rose-600">{{ graph.subgraphError }}</p>

    <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50">
      <div
        v-if="noTypes"
        class="flex items-center justify-center px-3 text-center text-xs text-slate-400"
        :style="{ height: canvasHeight }"
      >
        Select at least one node type to render
      </div>
      <svg
        v-else-if="graph.subgraph"
        ref="svgRef"
        :viewBox="`0 0 ${W} ${H}`"
        class="w-full"
        :style="{ height: canvasHeight }"
      />
      <div
        v-else
        class="flex items-center justify-center px-3 text-center text-xs text-slate-400"
        :style="{ height: canvasHeight }"
      >
        Click “Render graph” to draw the current selection · click a node to focus its ego network
      </div>
    </div>
  </article>
</template>
