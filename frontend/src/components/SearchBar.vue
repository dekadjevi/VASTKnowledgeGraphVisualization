<script setup>
import { ref } from 'vue'
import * as d3 from 'd3'
import { useGraphStore } from '../stores/graph'

const graph = useGraphStore()
const query = ref('')
const open = ref(false)
let timer = null

function colorFor(type) {
  const scale = d3.scaleOrdinal().domain(graph.nodeTypes.map((t) => t.key)).range(d3.schemeTableau10)
  return scale(type)
}

function onInput() {
  open.value = true
  clearTimeout(timer)
  timer = setTimeout(() => graph.searchNodes(query.value), 200)
}

function choose(node) {
  query.value = node.label
  open.value = false
  graph.selectNode(node)
}

function blur() {
  setTimeout(() => (open.value = false), 150)
}
</script>

<template>
  <div class="relative">
    <p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Find an entity</p>
    <input
      v-model="query"
      type="text"
      autocomplete="off"
      :disabled="!graph.hasData"
      :placeholder="graph.hasData ? 'Search an entity by name…' : 'Load a dataset to search'"
      class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none disabled:bg-slate-50"
      @input="onInput"
      @focus="open = true"
      @blur="blur"
    />

    <div
      v-if="open && (graph.searchResults.length || query)"
      class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white shadow-md"
    >
      <button
        v-for="node in graph.searchResults"
        :key="node.id"
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-50"
        @mousedown.prevent="choose(node)"
      >
        <span class="inline-block h-2.5 w-2.5 rounded-full" :style="{ background: colorFor(node.type) }" />
        <span class="flex-1 truncate">{{ node.label }}</span>
        <span class="text-[11px] text-slate-400">{{ node.type }}</span>
      </button>
      <div
        v-if="!graph.searchLoading && query && !graph.searchResults.length"
        class="px-3 py-2 text-sm text-slate-400"
      >
        No matches
      </div>
    </div>
  </div>
</template>
