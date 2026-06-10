<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { useGraphStore } from './stores/graph'

const graph = useGraphStore()

const navItems = [
  { label: 'Dashboard', to: '/' },
  { label: 'About', to: '/about' },
]
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <header class="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-6">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-widest text-slate-500">VAST KG</p>
          <h1 class="flex items-center gap-2 text-base font-semibold text-slate-900 md:text-lg">
            Dashboard Workspace
            <!-- Loaded-dataset indicator (D5) -->
            <span
              v-if="graph.hasData"
              class="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-normal text-emerald-700"
            >
              {{ graph.dataset.name }}
            </span>
          </h1>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <!-- Filter-feedback chip (D5) -->
          <span
            v-if="graph.hasData"
            class="rounded-md bg-sky-50 px-2.5 py-1 text-xs text-sky-700"
          >
            {{ graph.counts.filteredNodes.toLocaleString() }} / {{ graph.counts.totalNodes.toLocaleString() }} nodes ·
            {{ graph.counts.filteredEdges.toLocaleString() }} / {{ graph.counts.totalEdges.toLocaleString() }} edges
          </span>

          <nav class="flex flex-wrap items-center gap-2">
            <RouterLink
              v-for="item in navItems"
              :key="item.label"
              :to="item.to"
              class="rounded-md px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              {{ item.label }}
            </RouterLink>
          </nav>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-7xl p-4 md:p-6">
      <RouterView />
    </main>
  </div>
</template>
