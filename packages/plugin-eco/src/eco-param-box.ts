/**
 * H10.0 — parameter spine on a BOX before any curve exists.
 *
 * Live parameters: width, depth, height, doorway position/width.
 * Changing any regenerates scene nodes, mesh extents, and walk data.
 * If a box cannot follow its parameters, a shell will not either.
 */
import type { EcoWalk } from './bridge-types'
import { buildEcoWalk } from './export-walk'

export type EcoParamBox = {
  id: string
  name: string
  /** Exterior width (m) along +x. */
  width: number
  /** Exterior depth (m) along +z (editor north). */
  depth: number
  /** Wall height (m). */
  height: number
  wallThickness: number
  /** Floor top elevation above level (m). */
  floorTop: number
  /** Door centered this many metres along the south wall from west corner. */
  doorCenter: number
  doorWidth: number
}

export type NodeMap = Record<string, Record<string, unknown> | undefined>

type BoxState = { boxes: EcoParamBox[] }

const listeners = new Set<() => void>()
let state: BoxState = { boxes: [] }

function emit() {
  for (const l of listeners) l()
}

export function getEcoParamBoxesState(): BoxState {
  return state
}

export function subscribeEcoParamBoxes(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setEcoParamBoxes(boxes: EcoParamBox[]): void {
  state = { boxes }
  emit()
}

export function addEcoParamBox(box: EcoParamBox): void {
  state = { boxes: [...state.boxes.filter((b) => b.id !== box.id), box] }
  emit()
}

export function updateEcoParamBox(id: string, patch: Partial<EcoParamBox>): void {
  state = {
    boxes: state.boxes.map((b) => (b.id === id ? { ...b, ...patch, id: b.id } : b)),
  }
  emit()
}

export function clearEcoParamBoxes(): void {
  state = { boxes: [] }
  emit()
}

export function makeDefaultParamBox(id = `box-${Date.now()}`): EcoParamBox {
  return {
    id,
    name: 'Param box',
    width: 6,
    depth: 4,
    height: 2.7,
    wallThickness: 0.2,
    floorTop: 0.15,
    doorCenter: 3,
    doorWidth: 0.9,
  }
}

/**
 * Expand live parameters into Pascal-shaped scene nodes (editor frame, +z north).
 * Door is an absence in the south wall run — never a flag on the solid.
 */
export function paramBoxToNodes(box: EcoParamBox): NodeMap {
  const hw = box.width / 2
  const hd = box.depth / 2
  const t = box.wallThickness
  const doorLocalX = Math.max(0, Math.min(box.width, box.doorCenter))

  return {
    site: { id: 'site', type: 'site', children: ['bldg'] },
    bldg: { id: 'bldg', type: 'building', parentId: 'site', children: ['L0'] },
    L0: {
      id: 'L0',
      type: 'level',
      parentId: 'bldg',
      height: box.height,
      baseElevation: 0,
      children: ['slab0', 'wN', 'wS', 'wE', 'wW'],
    },
    slab0: {
      id: 'slab0',
      type: 'slab',
      parentId: 'L0',
      polygon: [
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd],
      ],
      elevation: box.floorTop,
      thickness: 0.05,
    },
    wN: {
      id: 'wN',
      type: 'wall',
      parentId: 'L0',
      start: [-hw, hd],
      end: [hw, hd],
      thickness: t,
      height: box.height,
      children: [],
    },
    wS: {
      id: 'wS',
      type: 'wall',
      parentId: 'L0',
      start: [hw, -hd],
      end: [-hw, -hd],
      thickness: t,
      height: box.height,
      children: ['doorS'],
    },
    doorS: {
      id: 'doorS',
      type: 'door',
      parentId: 'wS',
      wallId: 'wS',
      // Pascal door localX is along chord from wall.start; wS runs east→west so
      // localX 0 is at +hw. Map doorCenter (from west) → localX from start.
      position: [box.width - doorLocalX, 1.05, 0],
      width: box.doorWidth,
      height: Math.min(2.1, box.height - 0.2),
    },
    wE: {
      id: 'wE',
      type: 'wall',
      parentId: 'L0',
      start: [hw, hd],
      end: [hw, -hd],
      thickness: t,
      height: box.height,
      children: [],
    },
    wW: {
      id: 'wW',
      type: 'wall',
      parentId: 'L0',
      start: [-hw, -hd],
      end: [-hw, hd],
      thickness: t,
      height: box.height,
      children: [],
    },
  }
}

/** Walk data derived from current parameters (never a baked mesh). */
export function paramBoxWalk(box: EcoParamBox): EcoWalk {
  return buildEcoWalk(paramBoxToNodes(box))
}

/** Axis-aligned plan extents of floor ring in world frame (x east, z south). */
export function paramBoxWorldFloorExtents(box: EcoParamBox): {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  top: number
} {
  const walk = paramBoxWalk(box)
  const floor = walk.floors[0]
  if (!floor) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, top: box.floorTop }
  }
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of floor.ring) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  return { minX, maxX, minZ, maxZ, top: floor.top }
}
