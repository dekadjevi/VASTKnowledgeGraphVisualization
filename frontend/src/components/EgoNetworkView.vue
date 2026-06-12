<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as d3 from 'd3'
import { useGraphStore } from '../stores/graph'

const graph = useGraphStore()
const svgRef = ref(null)
const radius = ref(1)
const expanded = ref(false)
const renderError = ref('')
const W = 820
const H = 440
let simulation = null

const canvasHeight = computed(() => (expanded.value ? '560px' : '300px'))

function colorScale() {
  const types = graph.nodeTypes.map((t) => t.key)
  return d3.scaleOrdinal().domain(types).range(d3.schemeTableau10)
}

function render() {
  try {
    const data = graph.egoGraph
    const svgEl = svgRef.value
    if (!data || !svgEl || !data.nodes?.length) return

    const centerId = graph.selectedNode?.id
    const nodes = data.nodes.map((d) => ({ ...d }))
    const links = data.links.map((d) => ({ ...d }))

    const color = colorScale()
    const maxDeg = d3.max(nodes, (d) => d.degree) || 1
    const r = d3.scaleSqrt().domain([0, maxDeg]).range([4, 14])

    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    const g = svg.append('g')
    svg.call(d3.zoom().scaleExtent([0.2, 6]).on('zoom', (e) => g.attr('transform', e.transform)))

    const link = g
      .append('g')
      .attr('stroke', '#94a3b8')
      .attr('stroke-opacity', 0.5)
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', 1)

    const node = g
      .append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d) => (d.id === centerId ? r(d.degree) + 3 : r(d.degree)))
      .attr('fill', (d) => color(d.type))
      .attr('stroke', (d) => (d.id === centerId ? '#1e293b' : '#fff'))
      .attr('stroke-width', (d) => (d.id === centerId ? 2.5 : 1))
      .style('cursor', 'pointer')
      .on('click', (_e, d) => {
        if (d.id !== centerId)
          graph.selectNode({ id: d.id, label: d.label, type: d.type }, radius.value)
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

    node.append('title').text((d) => `${d.label}\n${d.type} · degree ${d.degree}`)

    // Declutter: label the center + the top-N neighbors by degree. Everyone
    // else keeps their name on hover via the <title> above.
    const labelCount = expanded.value ? 25 : 12
    const topIds = new Set(
      [...nodes]
        .filter((d) => d.id !== centerId)
        .sort((a, b) => b.degree - a.degree)
        .slice(0, labelCount)
        .map((d) => d.id),
    )
    const labelNodes = nodes.filter((d) => d.id === centerId || topIds.has(d.id))

    const labels = g
      .append('g')
      .selectAll('text')
      .data(labelNodes)
      .join('text')
      .text((d) => d.label)
      .attr('font-size', (d) => (d.id === centerId ? 11 : 9))
      .attr('font-weight', (d) => (d.id === centerId ? 600 : 400))
      .attr('fill', '#334155')
      .attr('stroke', '#f8fafc')
      .attr('stroke-width', 2.5)
      .style('paint-order', 'stroke')
      .attr('pointer-events', 'none')

    if (simulation) simulation.stop()
    simulation = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(60))
      .force('charge', d3.forceManyBody().strength(-160))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide().radius((d) => r(d.degree) + 4))
      .on('tick', () => {
        link
          .attr('x1', (d) => d.source.x)
          .attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x)
          .attr('y2', (d) => d.target.y)
        node.attr('cx', (d) => d.x).attr('cy', (d) => d.y)
        labels.attr('x', (d) => d.x + 7).attr('y', (d) => d.y + 3)
      })

    renderError.value = ''
  } catch (e) {
    renderError.value = e.message || String(e)
    // eslint-disable-next-line no-console
    console.error('Ego render failed:', e)
  }
}

// Draw AFTER the DOM has the (re)mounted svg, so we never draw into nothing.
watch(() => graph.egoGraph, () => nextTick(render), { flush: 'post' })
watch(expanded, () => nextTick(render))
watch(radius, () => {
  if (graph.selectedNode) graph.selectNode(graph.selectedNode, radius.value)
})
onMounted(() => {
  if (graph.egoGraph) nextTick(render)
})
onBeforeUnmount(() => simulation && simulation.stop())
</script>

<template>
  <article
    class="rounded-xl border border-slate-200 bg-white p-4"
    :class="expanded ? 'sm:col-span-2 xl:col-span-3' : ''"
  >
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Neighborhood from a node
        </p>
        <h3 class="text-base font-semibold text-slate-900">
          Ego network<span v-if="graph.selectedNode" class="font-normal text-slate-500">
            — {{ graph.selectedNode.label }}</span
          >
        </h3>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model.number="radius"
          class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
        >
          <option :value="1">radius 1</option>
          <option :value="2">radius 2</option>
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

    <p v-if="graph.egoLoading" class="mt-2 text-[11px] text-slate-500">Loading neighborhood…</p>
    <p v-else-if="graph.egoError" class="mt-2 text-[11px] text-rose-600">{{ graph.egoError }}</p>
    <p v-else-if="renderError" class="mt-2 text-[11px] text-rose-600">Render error: {{ renderError }}</p>
    <p v-else-if="graph.egoGraph?.truncated" class="mt-2 text-[11px] text-amber-600">
      Large neighborhood — showing the top {{ graph.egoGraph.node_count }} by degree.
    </p>

    <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50">
      <svg
        v-if="graph.egoGraph"
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
        Search an entity above to see its neighborhood · click a neighbor to re-center
      </div>
    </div>
  </article>
</template>
