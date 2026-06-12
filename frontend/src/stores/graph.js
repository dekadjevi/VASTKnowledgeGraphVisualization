import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// Base URL of the FastAPI backend (NetworkX Graph API). CORS on the API
// already allows the Vite dev origin (localhost:5173).
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

// Map the API's { "Person": 214, ... } objects into the array shape the
// components iterate over. The type string is both the key and the label.
function toTypeArray(countsObj = {}) {
  return Object.entries(countsObj)
    .map(([label, count]) => ({ key: label, label, count }))
    .sort((a, b) => b.count - a.count)
}

// The /summary degree_centrality_distribution is an object of "lo-hi": count
// plus a "stats" entry. Strip stats and return chartable bins.
function toDegreeBins(dist = {}) {
  return Object.entries(dist)
    .filter(([k]) => k !== 'stats')
    .map(([bin, count]) => ({ bin, count }))
}

export const useGraphStore = defineStore('graph', () => {
  // ---- state -------------------------------------------------------------
  const graphId = ref(null) // returned by POST /upload/ (D8: kept for GETs)
  const dataset = ref(null) // { name } once loaded, else null
  const loading = ref(false)
  const error = ref(null)

  const nodeTypes = ref([]) // [{ key, label, count }] from /node-types
  const linkTypes = ref([]) // [{ key, label, count }] from /edge-types
  const degreeCentrality = ref([]) // [{ bin, count }] from /summary
  const totals = ref({ nodes: 0, edges: 0 })

  // Filter selection. Node/link types are active (D8 client-side); confidence
  // and time are placeholders with no backing data yet (D9).
  const filters = ref({
    activeNodeTypes: [],
    activeLinkTypes: [],
    confidenceRange: [0, 1],
    timeRange: [null, null],
  })

  // What the current backend can actually support, drives the disabled
  // "needs backend support" notes in the sidebar (D9).
  const capabilities = ref({ types: true, properties: false, temporal: false })

  // ---- getters -----------------------------------------------------------
  const hasData = computed(() => dataset.value !== null)

  // Type distributions with an `active` flag so the panel can dim filtered-out
  // bars. Filtering is reactive — toggling a type updates these automatically.
  const nodesByType = computed(() =>
    nodeTypes.value.map((t) => ({ ...t, active: filters.value.activeNodeTypes.includes(t.key) })),
  )
  const edgesByType = computed(() =>
    linkTypes.value.map((t) => ({ ...t, active: filters.value.activeLinkTypes.includes(t.key) })),
  )

  // Filter-feedback counts (D5): totals from the API, filtered computed locally.
  const counts = computed(() => {
    const filteredNodes = nodeTypes.value
      .filter((t) => filters.value.activeNodeTypes.includes(t.key))
      .reduce((sum, t) => sum + t.count, 0)
    const filteredEdges = linkTypes.value
      .filter((t) => filters.value.activeLinkTypes.includes(t.key))
      .reduce((sum, t) => sum + t.count, 0)
    return {
      totalNodes: totals.value.nodes,
      totalEdges: totals.value.edges,
      filteredNodes,
      filteredEdges,
    }
  })

  // ---- actions -----------------------------------------------------------
  // Fetch the three metadata endpoints for a given id and fill the store.
  async function loadMetadata(id, name) {
    const [nt, et, summary] = await Promise.all([
      fetch(`${API_BASE}/node-types/${id}`).then((r) => r.json()),
      fetch(`${API_BASE}/edge-types/${id}`).then((r) => r.json()),
      fetch(`${API_BASE}/summary/${id}`).then((r) => r.json()),
    ])
    graphId.value = id
    dataset.value = { name }
    nodeTypes.value = toTypeArray(nt.node_type_counts)
    linkTypes.value = toTypeArray(et.edge_type_counts)
    totals.value = { nodes: nt.total_nodes ?? 0, edges: et.total_edges ?? 0 }
    degreeCentrality.value = toDegreeBins(summary?.degree_properties?.degree_centrality_distribution)
    filters.value.activeNodeTypes = nodeTypes.value.map((t) => t.key)
    filters.value.activeLinkTypes = linkTypes.value.map((t) => t.key)
  }

  // Two-step real workflow: POST /upload/ -> graph_id -> GET metadata.
  async function loadDataset(file) {
    loading.value = true
    error.value = null
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API_BASE}/upload/`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      const { graph_id } = await res.json()
      await loadMetadata(graph_id, file.name)
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  // Load the API's preconfigured "default" graph without uploading a file.
  async function loadDefault() {
    loading.value = true
    error.value = null
    try {
      await loadMetadata('default', 'default graph')
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  function toggleNodeType(key) {
    const a = filters.value.activeNodeTypes
    const i = a.indexOf(key)
    i === -1 ? a.push(key) : a.splice(i, 1)
  }
  function toggleLinkType(key) {
    const a = filters.value.activeLinkTypes
    const i = a.indexOf(key)
    i === -1 ? a.push(key) : a.splice(i, 1)
  }

  // Drawable subgraph for the node-link / ego views (server-computed, D10/D12).
  const subgraph = ref(null) // { nodes, links, truncated, node_count, link_count }
  const subgraphLoading = ref(false)
  const subgraphError = ref(null)

  // Type-level metagraph for the Sankey (server-computed aggregate flows).
  const typeFlows = ref(null) // { flows: [{source_type, edge_type, target_type, count}] }
  const typeFlowsError = ref(null)

  async function fetchTypeFlows(top = 12) {
    if (!hasData.value) return
    typeFlowsError.value = null
    try {
      const res = await fetch(`${API_BASE}/type-flows/${graphId.value}?top=${top}`)
      if (!res.ok) throw new Error(`Type-flows request failed (${res.status})`)
      typeFlows.value = await res.json()
    } catch (e) {
      typeFlowsError.value = e.message
    }
  }

  // Cross-filter: clicking a Sankey ribbon ticks the matching types in the
  // sidebar and redraws the node-link diagram to that slice (overview -> detail).
  async function focusTypeFlow(flow) {
    filters.value.activeNodeTypes = Array.from(new Set([flow.source_type, flow.target_type]))
    filters.value.activeLinkTypes = [flow.edge_type]
    await fetchSubgraph({ limit: 300 })
  }

  // Flexible variant used by the 3-column Sankey, where a clicked segment maps
  // to a set of node types and link types rather than a single triple.
  async function focusTypes(nodeTypes, linkTypes) {
    filters.value.activeNodeTypes = Array.from(new Set(nodeTypes))
    filters.value.activeLinkTypes = Array.from(new Set(linkTypes))
    await fetchSubgraph({ limit: 300 })
  }

  // ---- search + ego (drives the Ego Network card; node-link untouched) -----
  const searchResults = ref([]) // [{ id, label, type }]
  const searchLoading = ref(false)
  const selectedNode = ref(null) // the chosen { id, label, type }
  const egoGraph = ref(null) // ego subgraph for the Ego card (its own slot)
  const egoLoading = ref(false)
  const egoError = ref(null)

  async function searchNodes(q) {
    if (!hasData.value || !q.trim()) {
      searchResults.value = []
      return
    }
    searchLoading.value = true
    try {
      const res = await fetch(`${API_BASE}/search/${graphId.value}?q=${encodeURIComponent(q)}&limit=10`)
      if (!res.ok) throw new Error(`Search failed (${res.status})`)
      const data = await res.json()
      searchResults.value = data.matches || []
    } catch {
      searchResults.value = []
    } finally {
      searchLoading.value = false
    }
  }

  // Select an entity -> fetch its ego neighborhood into egoGraph. Reuses the
  // existing /subgraph?ego= endpoint and never touches the node-link's subgraph.
  async function selectNode(node, radius = 1) {
    selectedNode.value = node
    searchResults.value = []
    egoLoading.value = true
    egoError.value = null
    try {
      const res = await fetch(
        `${API_BASE}/subgraph/${graphId.value}?ego=${encodeURIComponent(node.id)}&radius=${radius}&limit=300`,
      )
      if (!res.ok) throw new Error(`Ego request failed (${res.status})`)
      egoGraph.value = await res.json()
    } catch (e) {
      egoError.value = e.message
    } finally {
      egoLoading.value = false
    }
  }

  // Fetch a slice from the backend. Filter mode uses the active node types +
  // a node budget; ego mode centers on a node id. Degree is computed on the
  // FULL graph server-side, so the slice isn't structurally distorted.
  async function fetchSubgraph({ ego = null, radius = 1, limit = 300 } = {}) {
    if (!hasData.value) return
    // Empty selection renders nothing (filter mode); ego mode is exempt.
    if (!ego && filters.value.activeNodeTypes.length === 0) {
      subgraph.value = null
      return
    }
    subgraphLoading.value = true
    subgraphError.value = null
    try {
      const params = new URLSearchParams({ limit: String(limit) })
      if (ego) {
        params.set('ego', ego)
        params.set('radius', String(radius))
      } else {
        params.set('node_types', filters.value.activeNodeTypes.join(','))
        if (filters.value.activeLinkTypes.length) {
          params.set('link_types', filters.value.activeLinkTypes.join(','))
        }
      }
      const res = await fetch(`${API_BASE}/subgraph/${graphId.value}?${params}`)
      if (!res.ok) throw new Error(`Subgraph request failed (${res.status})`)
      subgraph.value = await res.json()
    } catch (e) {
      subgraphError.value = e.message
    } finally {
      subgraphLoading.value = false
    }
  }

  function reset() {
    graphId.value = null
    dataset.value = null
    nodeTypes.value = []
    linkTypes.value = []
    degreeCentrality.value = []
    totals.value = { nodes: 0, edges: 0 }
    subgraph.value = null
    subgraphError.value = null
    typeFlows.value = null
    typeFlowsError.value = null
    searchResults.value = []
    selectedNode.value = null
    egoGraph.value = null
    egoError.value = null
    error.value = null
  }

  return {
    graphId, dataset, loading, error,
    nodeTypes, linkTypes, degreeCentrality, totals, filters, capabilities,
    hasData, nodesByType, edgesByType, counts,
    subgraph, subgraphLoading, subgraphError,
    typeFlows, typeFlowsError,
    searchResults, searchLoading, selectedNode, egoGraph, egoLoading, egoError,
    loadDataset, loadDefault, toggleNodeType, toggleLinkType,
    fetchSubgraph, fetchTypeFlows, focusTypeFlow, focusTypes,
    searchNodes, selectNode, reset,
  }
})
