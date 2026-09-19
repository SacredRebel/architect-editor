import type { SceneGraph } from '@pascal-app/editor'
import type { SceneMeta } from '@/components/scene-loader'

const INDEX_KEY = 'eco:scenes:index'
const GRAPH_PREFIX = 'eco:scenes:graph:'

const EMPTY_GRAPH: SceneGraph = {
  nodes: {},
  rootNodeIds: [],
}

function readIndex(): SceneMeta[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SceneMeta[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeIndex(scenes: SceneMeta[]): void {
  window.localStorage.setItem(INDEX_KEY, JSON.stringify(scenes))
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `local-${Date.now().toString(36)}`
}

function countNodes(graph: SceneGraph): number {
  return Object.keys(graph.nodes ?? {}).length
}

export function listLocalScenes(): SceneMeta[] {
  return readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getLocalScene(id: string): (SceneMeta & { graph: SceneGraph }) | null {
  const meta = readIndex().find((s) => s.id === id)
  if (!meta) return null
  try {
    const raw = window.localStorage.getItem(`${GRAPH_PREFIX}${id}`)
    const graph = raw ? (JSON.parse(raw) as SceneGraph) : EMPTY_GRAPH
    return { ...meta, graph }
  } catch {
    return { ...meta, graph: EMPTY_GRAPH }
  }
}

export function createLocalScene(
  name = 'Untitled scene',
  graph: SceneGraph = EMPTY_GRAPH,
  id = newId(),
): SceneMeta {
  const now = new Date().toISOString()
  const meta: SceneMeta = {
    id,
    name,
    projectId: 'local-static',
    thumbnailUrl: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ownerId: null,
    sizeBytes: JSON.stringify(graph).length,
    nodeCount: countNodes(graph),
  }
  const scenes = readIndex().filter((s) => s.id !== id)
  scenes.push(meta)
  writeIndex(scenes)
  window.localStorage.setItem(`${GRAPH_PREFIX}${meta.id}`, JSON.stringify(graph))
  return meta
}

export function saveLocalScene(
  id: string,
  name: string,
  graph: SceneGraph,
  expectedVersion?: number,
): SceneMeta | { conflict: true } {
  const scenes = readIndex()
  const idx = scenes.findIndex((s) => s.id === id)
  if (idx < 0) {
    throw new Error(`Local scene not found: ${id}`)
  }
  const prev = scenes[idx]
  if (expectedVersion !== undefined && prev.version !== expectedVersion) {
    return { conflict: true }
  }
  const next: SceneMeta = {
    ...prev,
    name,
    version: prev.version + 1,
    updatedAt: new Date().toISOString(),
    sizeBytes: JSON.stringify(graph).length,
    nodeCount: countNodes(graph),
  }
  scenes[idx] = next
  writeIndex(scenes)
  window.localStorage.setItem(`${GRAPH_PREFIX}${id}`, JSON.stringify(graph))
  return next
}
