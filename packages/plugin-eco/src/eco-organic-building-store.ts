/**
 * H15 — organic buildings + smooth walls store (one undo step per slider).
 */

import { organicPlan, type OrganicPlan } from './eco-organic-plan'
import { cleanSpec, parseOrganicWords, type OrganicSpec } from './eco-organic-spec'
import {
  addEcoMinimal,
  getEcoOrganicState,
  setEcoOrganicState,
  type EcoOrganicState,
} from './eco-organic-store'
import {
  bulgeSmoothWall,
  makeDemoSmoothWall,
  type EcoSmoothWall,
} from './eco-smooth-wall'
import type { EcoMinimalPatch } from './eco-catenary'

export type EcoOrganicBuildingState = {
  buildings: OrganicPlan[]
  smoothWalls: EcoSmoothWall[]
  selectedBuildingId: string | null
  selectedWallId: string | null
  /** Target gross sq ft for regenerate (optional). */
  targetGrossSqft: number | null
  lengthOrder: 'imperial-first' | 'metric-first'
}

const listeners = new Set<() => void>()
let state: EcoOrganicBuildingState = {
  buildings: [],
  smoothWalls: [],
  selectedBuildingId: null,
  selectedWallId: null,
  targetGrossSqft: null,
  lengthOrder: 'imperial-first',
}

type Snapshot = EcoOrganicBuildingState
const undoStack: Snapshot[] = []
const MAX_UNDO = 40

function cloneState(s: EcoOrganicBuildingState): Snapshot {
  return structuredClone(s)
}

function emit() {
  for (const l of listeners) l()
}

function pushUndo() {
  undoStack.push(cloneState(state))
  if (undoStack.length > MAX_UNDO) undoStack.shift()
}

export function getEcoOrganicBuildingState(): EcoOrganicBuildingState {
  return state
}

export function subscribeEcoOrganicBuilding(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function undoEcoOrganicBuilding(): boolean {
  const prev = undoStack.pop()
  if (!prev) return false
  state = prev
  emit()
  return true
}

export function setLengthOrder(order: EcoOrganicBuildingState['lengthOrder']): void {
  pushUndo()
  state = { ...state, lengthOrder: order }
  emit()
}

export function setTargetGrossSqft(sqft: number | null): void {
  pushUndo()
  state = { ...state, targetGrossSqft: sqft }
  emit()
}

/** Create / replace organic building; each call is one undo step. */
export function generateOrganicBuilding(options: {
  id?: string
  name?: string
  spec: Partial<OrganicSpec>
  perimeter?: [number, number][]
  floors?: number
  targetGrossSqft?: number
}): OrganicPlan {
  pushUndo()
  const id = options.id ?? state.selectedBuildingId ?? `organic-${Date.now()}`
  const plan = organicPlan({
    id,
    name: options.name,
    spec: options.spec,
    perimeter: options.perimeter,
    floors: options.floors ?? 1,
    targetGrossSqft: options.targetGrossSqft ?? state.targetGrossSqft ?? undefined,
  })
  state = {
    ...state,
    buildings: [...state.buildings.filter((b) => b.id !== plan.id), plan],
    selectedBuildingId: plan.id,
  }
  emit()
  return plan
}

/** Patch one field and regenerate in place (one undo per slider). */
export function updateOrganicSpecField<K extends keyof OrganicSpec>(
  id: string,
  key: K,
  value: OrganicSpec[K],
): OrganicPlan | null {
  const existing = state.buildings.find((b) => b.id === id)
  if (!existing) return null
  return generateOrganicBuilding({
    id,
    name: existing.name,
    spec: { ...existing.spec, [key]: value },
    perimeter: existing.perimeter,
    floors: existing.floors,
    targetGrossSqft: state.targetGrossSqft ?? undefined,
  })
}

export function applyOrganicWords(id: string | null, text: string): OrganicPlan {
  const existing = id ? state.buildings.find((b) => b.id === id) : null
  const parsed = parseOrganicWords(text)
  return generateOrganicBuilding({
    id: existing?.id,
    name: existing?.name,
    spec: cleanSpec({ ...(existing?.spec ?? {}), ...parsed }),
    perimeter: existing?.perimeter,
    floors: existing?.floors ?? 1,
    targetGrossSqft: state.targetGrossSqft ?? undefined,
  })
}

export function removeOrganicBuilding(id: string): void {
  pushUndo()
  state = {
    ...state,
    buildings: state.buildings.filter((b) => b.id !== id),
    selectedBuildingId: state.selectedBuildingId === id ? null : state.selectedBuildingId,
  }
  emit()
}

export function addSmoothWall(wall?: EcoSmoothWall): EcoSmoothWall {
  pushUndo()
  const w = wall ?? makeDemoSmoothWall()
  state = {
    ...state,
    smoothWalls: [...state.smoothWalls.filter((x) => x.id !== w.id), w],
    selectedWallId: w.id,
  }
  emit()
  return w
}

export function updateSmoothWall(id: string, patch: Partial<EcoSmoothWall>): void {
  pushUndo()
  state = {
    ...state,
    smoothWalls: state.smoothWalls.map((w) => (w.id === id ? { ...w, ...patch, id: w.id } : w)),
  }
  emit()
}

export function bulgeSelectedWall(spanIndex: number, metres: number): void {
  const id = state.selectedWallId
  if (!id) return
  const wall = state.smoothWalls.find((w) => w.id === id)
  if (!wall) return
  pushUndo()
  const next = bulgeSmoothWall(wall, spanIndex, metres)
  state = {
    ...state,
    smoothWalls: state.smoothWalls.map((w) => (w.id === id ? next : w)),
  }
  emit()
}

export function removeSmoothWall(id: string): void {
  pushUndo()
  state = {
    ...state,
    smoothWalls: state.smoothWalls.filter((w) => w.id !== id),
    selectedWallId: state.selectedWallId === id ? null : state.selectedWallId,
  }
  emit()
}

export function clearEcoOrganicBuildings(): void {
  state = {
    buildings: [],
    smoothWalls: [],
    selectedBuildingId: null,
    selectedWallId: null,
    targetGrossSqft: null,
    lengthOrder: 'imperial-first',
  }
  undoStack.length = 0
  emit()
}

/** Minimal surface from a selected closed plan curve — one undo per change. */
export function addMinimalFromClosedCurve(options: {
  id?: string
  name?: string
  /** Closed plan ring [x,z]. */
  ring: [number, number][]
  heightM?: number
  thickness?: number
  iterations?: number
  gridU?: number
  gridV?: number
}): EcoMinimalPatch {
  pushUndo()
  const h = options.heightM ?? 3
  const ring = options.ring
  const boundary: [number, number, number][] = ring.map(([x, z]) => [x, h, z])
  // Raise mid for interesting soap film
  const patch: EcoMinimalPatch = {
    id: options.id ?? `min-${Date.now()}`,
    name: options.name ?? 'Minimal surface',
    boundary,
    gridU: options.gridU ?? 12,
    gridV: options.gridV ?? 12,
    thickness: options.thickness ?? 0.08,
    iterations: options.iterations ?? 40,
  }
  addEcoMinimal(patch)
  return patch
}

export function updateMinimalRelaxation(id: string, iterations: number, thickness?: number): void {
  pushUndo()
  const org: EcoOrganicState = getEcoOrganicState()
  const next = {
    ...org,
    minimal: org.minimal.map((m) =>
      m.id === id
        ? {
            ...m,
            iterations: Math.max(1, Math.round(iterations)),
            thickness: thickness ?? m.thickness,
          }
        : m,
    ),
  }
  setEcoOrganicState(next)
}

/** Serialize buildings for GLB extras / scene round-trip. */
export function serializeOrganicBuildings(): {
  buildings: OrganicPlan[]
  smoothWalls: EcoSmoothWall[]
} {
  return {
    buildings: structuredClone(state.buildings),
    smoothWalls: structuredClone(state.smoothWalls),
  }
}

export function restoreOrganicBuildings(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return
  const data = payload as { buildings?: OrganicPlan[]; smoothWalls?: EcoSmoothWall[] }
  if (!Array.isArray(data.buildings)) return
  pushUndo()
  state = {
    ...state,
    buildings: data.buildings,
    smoothWalls: Array.isArray(data.smoothWalls) ? data.smoothWalls : state.smoothWalls,
    selectedBuildingId: data.buildings[0]?.id ?? null,
  }
  emit()
}
