<script setup>
import { useGraphStore } from '../stores/graph'
import FilterSidebar from '../components/FilterSidebar.vue'
import DashboardCard from '../components/DashboardCard.vue'
import NodeLinkView from '../components/NodeLinkView.vue'
import SankeyView from '../components/SankeyView.vue'
import EgoNetworkView from '../components/EgoNetworkView.vue'
import TemporalView from '../components/TemporalView.vue'
import SpatialView from '../components/SpatialView.vue'
import SearchBar from '../components/SearchBar.vue'

const graph = useGraphStore()

// Remaining placeholder cards (live views are inlined below).
const cards = [
  { title: 'Connected components', subtitle: 'Community discovery', content: 'Overview of connected components, with node/edge counts per component.' },
]
</script>

<template>
  <!-- D1/D4: persistent sidebar + main; empty and loaded share one layout -->
  <div class="grid grid-cols-1 gap-0 md:grid-cols-[210px_minmax(0,1fr)]">
    <FilterSidebar class="rounded-l-xl" />

    <div class="relative p-4">
      <!-- Search strip (top of main area) -->
      <div class="mb-4">
        <SearchBar />
      </div>

      <!-- Visualization grid: live views first, placeholders after -->
      <p class="mt-5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Visualization grid
      </p>
      <section
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        :class="graph.hasData ? '' : 'opacity-45'"
      >
        <NodeLinkView />
        <SankeyView />
        <EgoNetworkView />
        <DashboardCard
          v-for="card in cards"
          :key="card.title"
          :title="card.title"
          :subtitle="card.subtitle"
        >
          {{ card.content }}
        </DashboardCard>
        <div class="rounded-xl border border-slate-200 bg-white p-4">
          <SpatialView />
        </div>
        <TemporalView />
      </section>

      <!-- Empty-state hint overlay (D4) -->
      <div
        v-if="!graph.hasData"
        class="pointer-events-none absolute inset-x-4 bottom-4 top-28 flex items-center justify-center"
      >
        <span class="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm">
          ← Load a dataset to populate these views
        </span>
      </div>
    </div>
  </div>
</template>
