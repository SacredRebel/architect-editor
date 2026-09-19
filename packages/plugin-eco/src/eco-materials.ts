/** Eco material palette — name + PBR knobs for glTF export. */

import * as THREE from 'three'

export type EcoMaterialId =
  | 'stone'
  | 'river-stone'
  | 'timber'
  | 'glass'
  | 'stucco'
  | 'concrete'
  | 'living-roof'
  | 'metal'

export type EcoMaterialDef = {
  id: EcoMaterialId
  name: string
  color: string // #rrggbb
  roughness: number
  metalness: number
  opacity: number
}

export const ECO_MATERIALS: readonly EcoMaterialDef[] = [
  { id: 'stone', name: 'Stone', color: '#8a8680', roughness: 0.92, metalness: 0.02, opacity: 1 },
  {
    id: 'river-stone',
    name: 'River stone',
    color: '#6e7a78',
    roughness: 0.78,
    metalness: 0.04,
    opacity: 1,
  },
  { id: 'timber', name: 'Timber', color: '#a67c52', roughness: 0.7, metalness: 0.0, opacity: 1 },
  { id: 'glass', name: 'Glass', color: '#c5e3ef', roughness: 0.08, metalness: 0.05, opacity: 0.35 },
  { id: 'stucco', name: 'Stucco', color: '#e8e0d4', roughness: 0.88, metalness: 0.0, opacity: 1 },
  {
    id: 'concrete',
    name: 'Concrete',
    color: '#9a9a96',
    roughness: 0.95,
    metalness: 0.0,
    opacity: 1,
  },
  {
    id: 'living-roof',
    name: 'Living roof',
    color: '#5d7a55',
    roughness: 0.9,
    metalness: 0.0,
    opacity: 1,
  },
  { id: 'metal', name: 'Metal', color: '#8b949e', roughness: 0.35, metalness: 0.85, opacity: 1 },
] as const

export function ecoMaterialById(id: EcoMaterialId): EcoMaterialDef {
  return ECO_MATERIALS.find((m) => m.id === id) ?? ECO_MATERIALS[0]!
}

/** MeshStandardMaterial named by palette id so GLTFExporter keeps a stable material name. */
export function createEcoThreeMaterial(
  id: EcoMaterialId,
  opts?: { doubleSide?: boolean },
): THREE.MeshStandardMaterial {
  const def = ecoMaterialById(id)
  const transparent = def.opacity < 1
  return new THREE.MeshStandardMaterial({
    name: def.id,
    color: def.color,
    roughness: def.roughness,
    metalness: def.metalness,
    opacity: def.opacity,
    transparent,
    depthWrite: !transparent,
    side: opts?.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  })
}

type Assignments = Record<string, EcoMaterialId>

type MatState = {
  /** element key → material id (`wall:id`, `slab:id`, `shell:id`) */
  assignments: Assignments
  defaultWall: EcoMaterialId
  defaultSlab: EcoMaterialId
  defaultShell: EcoMaterialId
}

const listeners = new Set<() => void>()

let state: MatState = {
  assignments: {},
  defaultWall: 'stucco',
  defaultSlab: 'concrete',
  defaultShell: 'living-roof',
}

function emit() {
  for (const l of listeners) l()
}

export function getEcoMaterialsState(): MatState {
  return state
}

export function subscribeEcoMaterials(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setEcoMaterialAssignment(elementKey: string, materialId: EcoMaterialId): void {
  state = {
    ...state,
    assignments: { ...state.assignments, [elementKey]: materialId },
  }
  emit()
}

export function setEcoMaterialDefaults(patch: Partial<Omit<MatState, 'assignments'>>): void {
  state = { ...state, ...patch }
  emit()
}

export function resolveEcoMaterialId(
  elementKey: string,
  kind: 'wall' | 'slab' | 'shell',
): EcoMaterialId {
  const assigned = state.assignments[elementKey]
  if (assigned) return assigned
  if (kind === 'wall') return state.defaultWall
  if (kind === 'slab') return state.defaultSlab
  return state.defaultShell
}

export function elementKeyForWall(id: string): string {
  return `wall:${id}`
}
export function elementKeyForSlab(id: string): string {
  return `slab:${id}`
}
export function elementKeyForShell(id: string): string {
  return `shell:${id}`
}

/** Test helper — restore palette defaults and clear assignments. */
export function resetEcoMaterialsState(): void {
  state = {
    assignments: {},
    defaultWall: 'stucco',
    defaultSlab: 'concrete',
    defaultShell: 'living-roof',
  }
  emit()
}
