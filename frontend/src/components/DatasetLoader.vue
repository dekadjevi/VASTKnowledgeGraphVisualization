<script setup>
import { ref } from 'vue'
import { useGraphStore } from '../stores/graph'

const graph = useGraphStore()
const dragOver = ref(false)
const fileInput = ref(null)

function pickFile() {
  fileInput.value?.click()
}
function onFileChange(event) {
  const file = event.target.files?.[0]
  if (file) graph.loadDataset(file)
}
function onDrop(event) {
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) graph.loadDataset(file)
}
</script>

<template>
  <div
    class="rounded-lg border border-dashed bg-slate-50 p-4 text-center transition"
    :class="dragOver ? 'border-sky-400 bg-sky-50' : 'border-slate-300'"
    @dragover.prevent="dragOver = true"
    @dragleave.prevent="dragOver = false"
    @drop.prevent="onDrop"
  >
    <p class="text-sm font-semibold text-slate-700">Drop a graph file</p>
    <p class="mt-0.5 text-xs text-slate-500">or browse — NetworkX node-link JSON</p>

    <div class="mt-3 flex flex-col gap-2">
      <button
        type="button"
        class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-50"
        @click="pickFile"
      >
        Browse files
      </button>
      <button
        type="button"
        class="text-xs text-slate-500 underline-offset-2 hover:underline"
        @click="graph.loadDefault()"
      >
        Load default graph
      </button>
    </div>

    <p v-if="graph.loading" class="mt-2 text-xs text-slate-500">Loading…</p>
    <p v-if="graph.error" class="mt-2 text-xs text-rose-600">{{ graph.error }}</p>

    <input ref="fileInput" type="file" accept=".json" class="hidden" @change="onFileChange" />
  </div>
</template>
