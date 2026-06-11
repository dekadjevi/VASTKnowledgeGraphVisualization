<script setup>
import { useGraphStore } from '../stores/graph'
import FilterSidebar from '../components/FilterSidebar.vue'
import DistributionPanel from '../components/DistributionPanel.vue'
import DashboardCard from '../components/DashboardCard.vue'
import NodeLinkView from '../components/NodeLinkView.vue'
import SankeyView from '../components/SankeyView.vue'

const graph = useGraphStore()

// Live components sit in the grid; the rest stay placeholders.
const cards = [
  { title: 'Connected components', subtitle: 'Community discovery', content: 'Overview of connected components, with node/edge counts per component.' },
  { title: 'Ego network', subtitle: 'Neighborhood from a node', content: 'Placeholder for an ego-network view around a selected node.' },
  { title: 'Spatial / geographic view (?)', subtitle: 'Geographic projection', content: 'Optional map projection of entities and relationships.' },
  { title: 'Temporal view (?)', subtitle: 'Temporal projection', content: 'Optional timeline of how the graph evolves.' },
]
</script>

<template>
  <!-- D1/D4: persistent sidebar + main; empty and loaded share one layout -->
  <div class="grid grid-cols-1 gap-0 md:grid-cols-[210px_minmax(0,1fr)]">
    <FilterSidebar class="rounded-l-xl" />

    <div class="relative p-4">
      <!-- Distributions strip (D2) -->
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Data distributions — filter feedback
      </p>
      <div :class="graph.hasData ? '' : 'opacity-45'">
        <DistributionPanel />
      </div>

      <!-- Visualization grid: node-link and Sankey are live; others are placeholders -->
      <p class="mt-5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Visualization grid
      </p>
      <section
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        :class="graph.hasData ? '' : 'opacity-45'"
      >
        <NodeLinkView />
        <SankeyView />
        <DashboardCard
          v-for="card in cards"
          :key="card.title"
          :title="card.title"
          :subtitle="card.subtitle"
        >
          {{ card.content }}
        </DashboardCard>
      </section>

      <!-- Empty-state hint overlay (D4) -->
      <div
        v-if="!graph.hasData"
        class="pointer-events-none absolute inset-4 flex items-center justify-center"
      >
        <span class="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm">
          ← Load a dataset to populate these views
        </span>
      </div>
    </div>
  </div>
</template>
