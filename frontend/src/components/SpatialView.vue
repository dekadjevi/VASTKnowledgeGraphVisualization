<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as d3 from 'd3'
import { useGraphStore } from '../stores/graph'

const graph = useGraphStore()
const expanded = ref(false)
const svgRef = ref(null)
const renderError = ref(null)
const basemap = ref(null) // optional GeoJSON FeatureCollection (Oceanus outline)

// Where the optional basemap is served from. It is a static asset (drop the
// dataset's outline into the frontend's public/ folder); absence is fine —
// the map falls back to plotting points on a plain field.
const BASEMAP_URL = '/oceanus_map.geojson'

const points = computed(() => graph.geo?.points ?? [])
const isSpatial = computed(() => graph.geo?.spatial === true && points.value.length > 0)

const PALETTE = [
  '#4E79A7', '#F28E2B', '#59A14F', '#E15759', '#B07AA1',
  '#76B7B2', '#EDC948', '#FF9DA7', '#9C755F', '#BAB0AC',
]
const typeColor = computed(() => {
  const types = Array.from(new Set(points.value.map((p) => p.type)))
  const scale = d3.scaleOrdinal().domain(types).range(PALETTE)
  return (t) => scale(t)
})

async function loadBasemap() {
  if (basemap.value !== null) return
  try {
    const res = await fetch(BASEMAP_URL)
    if (res.ok) basemap.value = await res.json()
    else basemap.value = false // mark "checked, none available"
  } catch {
    basemap.value = false
  }
}

function render() {
  renderError.value = null
  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()
  if (!isSvgReady() || !isSpatial.value) return

  try {
    // Size the projection to the SVG's ACTUAL pixel box (kept current by a
    // ResizeObserver), so the map fills its container with no letterboxing and
    // grows correctly when expanded into the overlay.
    const W = svgRef.value.clientWidth || (expanded.value ? 880 : 360)
    const H = svgRef.value.clientHeight || (expanded.value ? 560 : 300)
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'none')

    // Water backdrop so land reads as land.
    svg.append('rect')
      .attr('x', 0).attr('y', 0).attr('width', W).attr('height', H)
      .attr('fill', '#DCEAF5')

    // Build a GeoJSON FeatureCollection of the place points.
    const pointFC = {
      type: 'FeatureCollection',
      features: points.value.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.x, p.y] },
        properties: p,
      })),
    }

    // Fit the projection to the PLACES (the analytical subject), not the whole
    // island. The far-flung navigation markers in the basemap would otherwise
    // stretch the frame and squeeze every inhabited place into a central blob.
    // The basemap is still drawn underneath for geographic reference; its outer
    // margins simply fall outside the viewBox.
    const pad = 20
    const projection = d3.geoMercator()
    projection.fitExtent([[pad, pad], [W - pad, H - pad]], pointFC)
    const path = d3.geoPath(projection)

    // --- basemap polygons (land / zones) ---------------------------------
    if (basemap.value && basemap.value.features) {
      const lands = basemap.value.features.filter(
        (f) => f.geometry && f.geometry.type !== 'Point',
      )
      svg.append('g')
        .selectAll('path')
        .data(lands)
        .join('path')
        .attr('d', path)
        .attr('fill', '#EAF0E2')       // land tone, distinct from the water
        .attr('stroke', '#8FA68A')     // visible coastline
        .attr('stroke-width', 1.1)
        .attr('stroke-linejoin', 'round')

      // Zone names, placed at each land polygon's centroid.
      svg.append('g')
        .selectAll('text')
        .data(lands.filter((f) => (f.properties && f.properties.Name)))
        .join('text')
        .attr('x', (f) => path.centroid(f)[0])
        .attr('y', (f) => path.centroid(f)[1])
        .attr('text-anchor', 'middle')
        .attr('font-size', expanded.value ? 11 : 9)
        .attr('font-style', 'italic')
        .attr('fill', '#6B7F66')
        .attr('paint-order', 'stroke')
        .attr('stroke', '#EAF0E2')
        .attr('stroke-width', 2.5)
        .text((f) => f.properties.Name)
    }

    // --- place-to-place links (faint) -------------------------------------
    const byId = new Map(points.value.map((p) => [p.id, p]))
    const links = (graph.geo?.links ?? [])
      .map((l) => ({ s: byId.get(l.source), t: byId.get(l.target) }))
      .filter((l) => l.s && l.t)
    if (links.length && links.length < 1200) {
      svg.append('g')
        .attr('stroke', '#94A3B8')
        .attr('stroke-opacity', 0.18)
        .selectAll('line')
        .data(links)
        .join('line')
        .attr('x1', (l) => projection([l.s.x, l.s.y])[0])
        .attr('y1', (l) => projection([l.s.x, l.s.y])[1])
        .attr('x2', (l) => projection([l.t.x, l.t.y])[0])
        .attr('y2', (l) => projection([l.t.x, l.t.y])[1])
    }

    // --- place points (graduated symbols) ---------------------------------
    const maxDeg = d3.max(points.value, (p) => p.degree) || 1
    const r = d3.scaleSqrt().domain([0, maxDeg]).range([2.5, expanded.value ? 13 : 8])

    const g = svg.append('g')
    const sel = graph.selectedNode?.id != null ? String(graph.selectedNode.id) : null

    g.selectAll('circle')
      .data(points.value)
      .join('circle')
      .attr('cx', (p) => projection([p.x, p.y])[0])
      .attr('cy', (p) => projection([p.x, p.y])[1])
      .attr('r', (p) => r(p.degree))
      .attr('fill', (p) => typeColor.value(p.type))
      .attr('fill-opacity', 0.82)
      .attr('stroke', (p) => (p.id === sel ? '#0F172A' : '#fff'))
      .attr('stroke-width', (p) => (p.id === sel ? 2.2 : 0.8))
      .style('cursor', 'pointer')
      .on('click', (_e, p) =>
        graph.selectNode({ id: p.id, label: p.label, type: p.type }),
      )
      .append('title')
      .text((p) => `${p.label}${p.zone ? ' · ' + p.zone : ''} · ${p.type} · degree ${p.degree}`)

    // Label only the most-connected handful, to avoid clutter.
    const topN = expanded.value ? 14 : 7
    const labels = [...points.value].sort((a, b) => b.degree - a.degree).slice(0, topN)
    svg.append('g')
      .selectAll('text')
      .data(labels)
      .join('text')
      .attr('x', (p) => projection([p.x, p.y])[0] + r(p.degree) + 2)
      .attr('y', (p) => projection([p.x, p.y])[1] + 3)
      .attr('font-size', expanded.value ? 10 : 8.5)
      .attr('fill', '#334155')
      .attr('paint-order', 'stroke')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2.5)
      .text((p) => (p.label.length > 22 ? p.label.slice(0, 21) + '\u2026' : p.label))
  } catch (e) {
    renderError.value = e.message
  }
}

function isSvgReady() {
  return !!svgRef.value
}

// Render after the SVG is actually in the DOM (flush:'post' + nextTick), the
// same pattern that fixed the ego view's silent no-render.
watch(
  [() => graph.geo, () => graph.selectedNode, expanded, basemap],
  async () => {
    await nextTick()
    render()
  },
  { flush: 'post', deep: true },
)

let ro = null

onMounted(async () => {
  await loadBasemap()
  if (graph.graphId) await graph.fetchGeo()
  await nextTick()
  render()
  // Re-render whenever the SVG box changes size: first paint (0 -> real width),
  // expand into the overlay, and window resize all flow through here.
  if (svgRef.value && 'ResizeObserver' in window) {
    ro = new ResizeObserver(() => render())
    ro.observe(svgRef.value)
  }
})

onUnmounted(() => {
  if (ro) ro.disconnect()
})

// The card may mount before any dataset is loaded (empty state), so fetch geo
// as soon as a graph id appears and on every dataset swap.
watch(
  () => graph.graphId,
  async (id) => {
    if (id) await graph.fetchGeo()
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="mb-2 flex items-center justify-between">
      <div>
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Geographic projection
        </p>
        <h3 class="text-sm font-semibold text-slate-800">Spatial / geographic view</h3>
      </div>
      <button
        v-if="isSpatial"
        type="button"
        class="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Shrink' : 'Expand' }}
      </button>
    </div>

    <!-- No coordinates in this dataset (e.g. the music graph) -->
    <div
      v-if="!graph.geoLoading && !isSpatial"
      class="flex flex-1 items-center justify-center rounded-md border border-dashed border-slate-200 p-6 text-center"
    >
      <p class="text-xs text-slate-400">
        No spatial data in this dataset.<br />
        The map appears when a graph carries place coordinates.
      </p>
    </div>

    <div v-else-if="graph.geoLoading" class="flex flex-1 items-center justify-center">
      <p class="text-xs text-slate-400">Loading map&hellip;</p>
    </div>

    <template v-else>
      <div
        :class="
          expanded
            ? 'fixed inset-0 z-50 flex flex-col bg-white/97 p-6 backdrop-blur-sm'
            : 'flex flex-1 flex-col'
        "
      >
        <div v-if="expanded" class="mb-3 flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-800">
            Spatial / geographic view — Oceanus
          </h3>
          <button
            type="button"
            class="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            @click="expanded = false"
          >
            Close
          </button>
        </div>
        <svg
          ref="svgRef"
          class="w-full flex-1"
          :style="expanded ? {} : { height: '300px' }"
        />
        <p v-if="renderError" class="mt-1 text-[10px] text-red-500">{{ renderError }}</p>
        <p class="mt-1 text-[10px] italic text-slate-400">
          {{ points.length }} located places ·
          {{ basemap && basemap.features ? 'Oceanus basemap' : 'point map (no basemap loaded)' }} ·
          click a place to focus the other views
        </p>
      </div>
    </template>
  </div>
</template>
