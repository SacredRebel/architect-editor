/**
 * Eco scene payload — Pascal SceneGraph plus Eco plugin extras.
 * This is what `eco:scene` / `eco:load-scene` carry. See docs/eco-scene.md.
 */

import type { SceneGraph } from '@pascal-app/editor'
import { useScene } from '@pascal-app/core'
import {
  restoreEcoAssetsFromScene,
  serializeEcoAssetsForScene,
  totalAssetBytes,
  type EcoAsset,
  type EcoPlacement,
} from './eco-assets-store'
import {
  getEcoMaterialsState,
  type EcoMaterialId,
  resetEcoMaterialsState,
  setEcoMaterialAssignment,
  setEcoMaterialDefaults,
} from './eco-materials'
import { getEcoShellsState, setEcoShells, type EcoShell } from './eco-shell-store'
import {
  getEcoOrganicState,
  setEcoOrganicState,
  type EcoOrganicState,
} from './eco-organic-store'
import type { EcoLoft } from './eco-loft'
import type { EcoVault } from './eco-vault'
import type { EcoCatenary, EcoMinimalPatch } from './eco-catenary'
import {
  getEcoTreesState,
  isEcoTreeVariantId,
  setEcoTrees,
  type EcoTreePlacement,
} from './eco-trees-store'

const MAX_SCENE_ASSET_BYTES = 20 * 1024 * 1024

export type EcoMaterialsSceneBlob = {
  assignments: Record<string, EcoMaterialId>
  defaultWall: EcoMaterialId
  defaultSlab: EcoMaterialId
  defaultShell: EcoMaterialId
}

export type EcoScenePayload = SceneGraph & {
  ecoAssets?: { assets: EcoAsset[]; placements: EcoPlacement[] }
  ecoShells?: EcoShell[]
  ecoOrganic?: EcoOrganicState
  ecoMaterials?: EcoMaterialsSceneBlob
  ecoTrees?: EcoTreePlacement[]
}

export function serializeEcoShellsForScene(): EcoShell[] {
  return getEcoShellsState()
    .shells.map((s) => ({
      ...s,
      outline: s.outline.map(([x, z]) => [x, z] as [number, number]),
      ridge: s.ridge.map(([x, z]) => [x, z] as [number, number]),
      ridgeHeights: [...s.ridgeHeights],
      rise: s.rise > 0 ? s.rise : 1,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function restoreEcoShellsFromScene(payload: unknown): void {
  if (!Array.isArray(payload)) {
    setEcoShells([])
    return
  }
  const shells: EcoShell[] = []
  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') continue
    const s = raw as Partial<EcoShell>
    if (typeof s.id !== 'string' || !Array.isArray(s.outline) || !Array.isArray(s.ridge)) continue
    shells.push({
      id: s.id,
      name: typeof s.name === 'string' ? s.name : s.id,
      outline: s.outline as [number, number][],
      ridge: s.ridge as [number, number][],
      ridgeHeights: Array.isArray(s.ridgeHeights) ? (s.ridgeHeights as number[]) : [],
      eaveHeight: typeof s.eaveHeight === 'number' ? s.eaveHeight : 3,
      thickness: typeof s.thickness === 'number' ? s.thickness : 0.12,
      ribSpacing: typeof s.ribSpacing === 'number' ? s.ribSpacing : 0,
      rise: typeof s.rise === 'number' && s.rise > 0 ? s.rise : 1,
    })
  }
  // Stable order for byte-identical re-export
  shells.sort((a, b) => a.id.localeCompare(b.id))
  setEcoShells(shells)
}

export function serializeEcoOrganicForScene(): EcoOrganicState {
  const s = getEcoOrganicState()
  return {
    lofts: [...s.lofts].sort((a, b) => a.id.localeCompare(b.id)),
    vaults: [...s.vaults].sort((a, b) => a.id.localeCompare(b.id)),
    catenaries: [...s.catenaries].sort((a, b) => a.id.localeCompare(b.id)),
    minimal: [...s.minimal].sort((a, b) => a.id.localeCompare(b.id)),
  }
}

export function restoreEcoOrganicFromScene(payload: unknown): void {
  if (!payload || typeof payload !== 'object') {
    setEcoOrganicState({ lofts: [], vaults: [], catenaries: [], minimal: [] })
    return
  }
  const raw = payload as Partial<EcoOrganicState>
  const lofts = Array.isArray(raw.lofts) ? (raw.lofts as EcoLoft[]) : []
  const vaults = Array.isArray(raw.vaults) ? (raw.vaults as EcoVault[]) : []
  const catenaries = Array.isArray(raw.catenaries) ? (raw.catenaries as EcoCatenary[]) : []
  const minimal = Array.isArray(raw.minimal) ? (raw.minimal as EcoMinimalPatch[]) : []
  setEcoOrganicState({ lofts, vaults, catenaries, minimal })
}

export function serializeEcoMaterialsForScene(): EcoMaterialsSceneBlob {
  const s = getEcoMaterialsState()
  const assignments: Record<string, EcoMaterialId> = {}
  for (const key of Object.keys(s.assignments).sort()) {
    assignments[key] = s.assignments[key]!
  }
  return {
    assignments,
    defaultWall: s.defaultWall,
    defaultSlab: s.defaultSlab,
    defaultShell: s.defaultShell,
  }
}

export function restoreEcoMaterialsFromScene(payload: unknown): void {
  resetEcoMaterialsState()
  if (!payload || typeof payload !== 'object') return
  const data = payload as Partial<EcoMaterialsSceneBlob>
  if (data.defaultWall || data.defaultSlab || data.defaultShell) {
    setEcoMaterialDefaults({
      ...(data.defaultWall ? { defaultWall: data.defaultWall } : {}),
      ...(data.defaultSlab ? { defaultSlab: data.defaultSlab } : {}),
      ...(data.defaultShell ? { defaultShell: data.defaultShell } : {}),
    })
  }
  if (data.assignments && typeof data.assignments === 'object') {
    for (const key of Object.keys(data.assignments).sort()) {
      const id = data.assignments[key]
      if (id) setEcoMaterialAssignment(key, id)
    }
  }
}

export function serializeEcoTreesForScene(): EcoTreePlacement[] {
  return getEcoTreesState()
    .trees.map((t) => ({
      ...t,
      position: [...t.position] as [number, number, number],
      rotation: [...t.rotation] as [number, number, number],
      scale: [...t.scale] as [number, number, number],
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function restoreEcoTreesFromScene(payload: unknown): void {
  if (!Array.isArray(payload)) {
    setEcoTrees([])
    return
  }
  const trees: EcoTreePlacement[] = []
  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') continue
    const t = raw as Partial<EcoTreePlacement>
    if (typeof t.id !== 'string' || !isEcoTreeVariantId(t.variant)) continue
    if (!Array.isArray(t.position) || !Array.isArray(t.rotation) || !Array.isArray(t.scale)) continue
    trees.push({
      id: t.id,
      variant: t.variant,
      seed: typeof t.seed === 'number' ? t.seed : 1,
      position: t.position as [number, number, number],
      rotation: t.rotation as [number, number, number],
      scale: t.scale as [number, number, number],
    })
  }
  trees.sort((a, b) => a.id.localeCompare(b.id))
  setEcoTrees(trees)
}

function currentSceneGraph(): SceneGraph {
  const { nodes, rootNodeIds, collections, materials, installedPlugins } = useScene.getState()
  return {
    nodes,
    rootNodeIds,
    collections,
    materials,
    installedPlugins,
  } as SceneGraph
}

/**
 * Build the eco:scene payload from the live editor + Eco stores.
 * Returns a plain JSON-safe object.
 */
export function exportEcoScenePayload(options?: {
  /** When assets exceed 20 MB, strip asset bytes (placements kept). */
  onAssetsTooLarge?: () => void
}): EcoScenePayload {
  const graph = currentSceneGraph()
  const eco = serializeEcoAssetsForScene()
  let ecoAssets = eco
  if (totalAssetBytes() > MAX_SCENE_ASSET_BYTES) {
    options?.onAssetsTooLarge?.()
    ecoAssets = { assets: [], placements: eco.placements }
  }
  return {
    nodes: graph.nodes,
    rootNodeIds: [...graph.rootNodeIds],
    collections: graph.collections ?? {},
    materials: graph.materials ?? {},
    installedPlugins: graph.installedPlugins ? [...graph.installedPlugins] : [],
    ecoAssets,
    ecoShells: serializeEcoShellsForScene(),
    ecoOrganic: serializeEcoOrganicForScene(),
    ecoMaterials: serializeEcoMaterialsForScene(),
    ecoTrees: serializeEcoTreesForScene(),
  }
}

/**
 * Restore Eco plugin extras from a loaded scene (shells, materials, assets).
 * Caller applies SceneGraph via applySceneGraphToEditor separately.
 */
export function restoreEcoSceneExtras(scene: unknown): void {
  if (!scene || typeof scene !== 'object') return
  const s = scene as EcoScenePayload
  restoreEcoShellsFromScene(s.ecoShells ?? [])
  restoreEcoOrganicFromScene(s.ecoOrganic)
  restoreEcoMaterialsFromScene(s.ecoMaterials)
  if ('ecoAssets' in s) restoreEcoAssetsFromScene(s.ecoAssets)
  restoreEcoTreesFromScene(s.ecoTrees ?? [])
}

/**
 * Headless round-trip: restore extras from `scene`, then rebuild extras onto
 * the same graph fields. Does not touch useScene.
 */
export function roundTripEcoScenePayload(scene: EcoScenePayload): EcoScenePayload {
  restoreEcoShellsFromScene(scene.ecoShells ?? [])
  restoreEcoOrganicFromScene(scene.ecoOrganic)
  restoreEcoMaterialsFromScene(scene.ecoMaterials)
  if ('ecoAssets' in scene) restoreEcoAssetsFromScene(scene.ecoAssets)
  else restoreEcoAssetsFromScene({ assets: [], placements: [] })
  restoreEcoTreesFromScene(scene.ecoTrees ?? [])

  return {
    nodes: structuredClone(scene.nodes),
    rootNodeIds: [...scene.rootNodeIds],
    collections: structuredClone(scene.collections ?? {}),
    materials: structuredClone(scene.materials ?? {}),
    installedPlugins: scene.installedPlugins ? [...scene.installedPlugins] : [],
    ecoAssets: serializeEcoAssetsForScene(),
    ecoShells: serializeEcoShellsForScene(),
    ecoOrganic: serializeEcoOrganicForScene(),
    ecoMaterials: serializeEcoMaterialsForScene(),
    ecoTrees: serializeEcoTreesForScene(),
  }
}

/** Deterministic JSON for equality checks (sorted object keys). */
export function stableStringifyEcoScene(scene: unknown): string {
  return JSON.stringify(sortKeysDeep(scene))
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(obj).sort()) {
      out[k] = sortKeysDeep(obj[k])
    }
    return out
  }
  return value
}
