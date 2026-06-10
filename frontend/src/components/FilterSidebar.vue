<script setup>
import { useGraphStore } from '../stores/graph'
import DatasetLoader from './DatasetLoader.vue'

const graph = useGraphStore()
// Filtering is reactive client-side (D8): toggling mutates the filter arrays
// and the store's computed counts/distributions update on their own.
</script>

<template>
  <aside class="flex w-full flex-col gap-5 border-r border-slate-200 bg-white p-4">
    <!-- Dataset load control at the top (D3, D4) -->
    <section>
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Dataset</p>
      <DatasetLoader v-if="!graph.hasData" />
      <div v-else class="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
        <span class="truncate text-xs font-medium text-emerald-700">{{ graph.dataset.name }}</span>
        <button type="button" class="text-xs text-slate-500 hover:text-slate-800" @click="graph.reset()">swap</button>
      </div>
    </section>

    <!-- Node types (T) — client-side filter -->
    <section :class="graph.hasData ? '' : 'pointer-events-none opacity-40'">
      <p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Node types — T</p>
      <div class="flex flex-col gap-1.5">
        <label
          v-for="t in graph.nodeTypes"
          :key="t.key"
          class="flex cursor-pointer items-center justify-between text-xs text-slate-600"
        >
          <span class="flex items-center gap-1.5">
            <input
              type="checkbox"
              :checked="graph.filters.activeNodeTypes.includes(t.key)"
              class="accent-sky-600"
              @change="graph.toggleNodeType(t.key)"
            />
            {{ t.label }}
          </span>
          <span class="text-slate-400">{{ t.count }}</span>
        </label>
      </div>
    </section>

    <!-- Link types (T) — client-side filter -->
    <section :class="graph.hasData ? '' : 'pointer-events-none opacity-40'">
      <p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Link types — T</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="t in graph.linkTypes"
          :key="t.key"
          type="button"
          class="rounded-md px-2 py-1 text-[11px] transition"
          :class="graph.filters.activeLinkTypes.includes(t.key)
            ? 'bg-sky-100 text-sky-700'
            : 'bg-slate-100 text-slate-400'"
          @click="graph.toggleLinkType(t.key)"
        >
          {{ t.label }} <span class="opacity-60">{{ t.count }}</span>
        </button>
      </div>
    </section>

    <!-- Properties (P) — visible but disabled until the backend exposes them (D9) -->
    <section class="pointer-events-none opacity-40">
      <p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Properties — P</p>
      <div class="flex justify-between text-[11px] text-slate-600">
        <span>Confidence</span>
        <span class="text-slate-400">0.0 – 1.0</span>
      </div>
      <input type="range" min="0" max="1" step="0.1" value="0" disabled class="mt-1.5 w-full accent-sky-600" />
      <p class="mt-1 text-[10px] italic text-slate-400">needs backend support</p>
    </section>

    <!-- Time range — visible but disabled until the backend exposes it (D9) -->
    <section class="pointer-events-none opacity-40">
      <p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Time range</p>
      <div class="flex items-center gap-2 text-[11px] text-slate-600">
        <span class="flex-1 rounded-md border border-slate-200 py-1 text-center">—</span>
        <span class="text-slate-400">→</span>
        <span class="flex-1 rounded-md border border-slate-200 py-1 text-center">—</span>
      </div>
      <p class="mt-1 text-[10px] italic text-slate-400">needs backend support</p>
    </section>
  </aside>
</template>
