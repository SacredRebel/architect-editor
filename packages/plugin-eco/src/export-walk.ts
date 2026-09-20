import { getWallArcData, getWallChordFrame, getWallCurveFrameAt } from '@pascal-app/core'
import type { EcoWalk } from './bridge-types'
import {
  adaptiveArcSampleStepM,
  ECO_CURVE_WALK_TOLERANCE_M,
  ECO_WALK_FLOOR_INSET_M,
  ECO_WALK_SOLID_OUTSET_M,
  ECO_WALL_SAMPLE_STEP_M,
} from './eco-curve-tolerance'
import { levelWorldY } from './level-y'

export {
  ECO_CURVE_WALK_TOLERANCE_M,
  ECO_WALK_FLOOR_INSET_M,
  ECO_WALK_SOLID_OUTSET_M,
  ECO_WALL_SAMPLE_STEP_M,
}

/** Shrink an open plan ring toward its centroid (floor bias — never stand on air). */
function insetPlanRing(ring: [number, number][], insetM: number): [number, number][] {
  if (ring.length < 3 || insetM <= 0) return ring
  let cx = 0
  let cz = 0
  for (const [x, z] of ring) {
    cx += x
    cz += z
  }
  cx /= ring.length
  cz /= ring.length
  return ring.map(([x, z]) => {
    const dx = x - cx
    const dz = z - cz
    const len = Math.hypot(dx, dz) || 1
    const scale = Math.max(0, (len - insetM) / len)
    return [cx + dx * scale, cz + dz * scale]
  })
}

type NodeMap = Record<string, Record<string, unknown> | undefined>

type WallLike = {
  id: string
  type: 'wall'
  parentId?: string | null
  children?: string[]
  start: [number, number]
  end: [number, number]
  thickness?: number
  height?: number
  curveOffset?: number
}

type SlabLike = {
  id: string
  type: 'slab'
  parentId?: string | null
  polygon: [number, number][]
  elevation?: number
}

type DoorLike = {
  id: string
  type: 'door'
  parentId?: string | null
  wallId?: string
  position: [number, number, number]
  width: number
  height?: number
}

/** Editor +z (north) → world +z (south). */
function toWorldXz([x, z]: [number, number]): [number, number] {
  return [x, -z]
}

function asWall(node: Record<string, unknown> | undefined): WallLike | null {
  if (node?.type !== 'wall') return null
  if (!Array.isArray(node.start) || !Array.isArray(node.end)) return null
  return node as unknown as WallLike
}

function asSlab(node: Record<string, unknown> | undefined): SlabLike | null {
  if (node?.type !== 'slab') return null
  if (!Array.isArray(node.polygon)) return null
  return node as unknown as SlabLike
}

function asDoor(node: Record<string, unknown> | undefined): DoorLike | null {
  if (node?.type !== 'door') return null
  if (!Array.isArray(node.position) || typeof node.width !== 'number') return null
  return node as unknown as DoorLike
}

function wallDoors(wall: WallLike, nodes: NodeMap): DoorLike[] {
  const out: DoorLike[] = []
  const childIds = new Set(wall.children ?? [])
  for (const node of Object.values(nodes)) {
    const door = asDoor(node)
    if (!door) continue
    if (door.wallId === wall.id || door.parentId === wall.id || childIds.has(door.id)) {
      out.push(door)
    }
  }
  return out
}

/** Chord length (Pascal door localX domain). */
function wallChordLength(wall: WallLike): number {
  return getWallChordFrame(wall).length
}

/** Walking length along the wall (arc if curved, else chord). */
export function wallRunLength(wall: WallLike): number {
  const arc = getWallArcData(wall)
  if (!arc) return wallChordLength(wall)
  return Math.abs(arc.radius * arc.delta)
}

/**
 * Convert Pascal door localX (0…chord) to metres along the run (arc if curved).
 */
function doorLocalXToRunMeters(wall: WallLike, localX: number): number {
  const chord = wallChordLength(wall)
  if (chord < 1e-6) return 0
  const t = Math.max(0, Math.min(1, localX / chord))
  return t * wallRunLength(wall)
}

function wallSegmentsWithDoorGaps(wall: WallLike, doors: DoorLike[]): { s0: number; s1: number }[] {
  const run = wallRunLength(wall)
  if (run < 1e-4) return []

  const gaps = doors
    .map((d) => {
      const center = doorLocalXToRunMeters(wall, d.position[0])
      const half = d.width / 2
      return { min: center - half, max: center + half }
    })
    .filter((g) => g.max > 0 && g.min < run)
    .map((g) => ({ min: Math.max(0, g.min), max: Math.min(run, g.max) }))
    .sort((a, b) => a.min - b.min)

  const merged: { min: number; max: number }[] = []
  for (const g of gaps) {
    const last = merged[merged.length - 1]
    if (!last || g.min > last.max) merged.push({ ...g })
    else last.max = Math.max(last.max, g.max)
  }

  const segs: { s0: number; s1: number }[] = []
  let cursor = 0
  for (const g of merged) {
    if (g.min - cursor > 1e-3) segs.push({ s0: cursor, s1: g.min })
    cursor = g.max
  }
  if (run - cursor > 1e-3) segs.push({ s0: cursor, s1: run })
  return segs
}

function frameAtRunMeters(wall: WallLike, s: number) {
  const run = wallRunLength(wall)
  const t = run < 1e-9 ? 0 : Math.max(0, Math.min(1, s / run))
  return getWallCurveFrameAt(wall, t)
}

/**
 * Thickened plan ring for a wall run segment [s0,s1] in run-metres.
 * Curved walls: sample centerline every adaptive step (≤ ECO_WALL_SAMPLE_STEP_M,
 * chord error ≤ ECO_CURVE_WALK_TOLERANCE_M), offset by ±half thickness.
 * One solid per continuous run (not per sample). Ring is a polyline, never a chord.
 */
export function wallSegmentRing(wall: WallLike, s0: number, s1: number): [number, number][] {
  // Outset past the visual face so chord approximation errs by stopping early.
  const halfT = (wall.thickness ?? 0.1) / 2 + ECO_WALK_SOLID_OUTSET_M
  const span = Math.max(0, s1 - s0)
  const arc = getWallArcData(wall)
  const step = arc ? adaptiveArcSampleStepM(arc.radius) : ECO_WALL_SAMPLE_STEP_M
  const samples = Math.max(1, Math.ceil(span / step))
  const left: [number, number][] = []
  const right: [number, number][] = []

  for (let i = 0; i <= samples; i++) {
    const s = s0 + (span * i) / samples
    const frame = frameAtRunMeters(wall, s)
    left.push([frame.point.x + frame.normal.x * halfT, frame.point.y + frame.normal.y * halfT])
    right.push([frame.point.x - frame.normal.x * halfT, frame.point.y - frame.normal.y * halfT])
  }

  // Open ring: left face along the run, then right face reverse.
  const ring = [...left, ...right.reverse()]
  return ring.map(([x, z]) => toWorldXz([x, z]))
}

/** Step used for a wall (for tests / docs). */
export function wallSampleStepM(wall: WallLike): number {
  const arc = getWallArcData(wall)
  return arc ? adaptiveArcSampleStepM(arc.radius) : ECO_WALL_SAMPLE_STEP_M
}

/**
 * Derive EcoWalk from the scene graph (world frame: x east, y up, z south).
 * Rings are open (first point ≠ last); the host closes them.
 * Curved walls export as one solid per door-split run with adaptive sampling
 * (chord error ≤ ECO_CURVE_WALK_TOLERANCE_M).
 */
export function buildEcoWalk(nodes: NodeMap): EcoWalk {
  const floors: EcoWalk['floors'] = []
  const solids: EcoWalk['solids'] = []

  for (const node of Object.values(nodes)) {
    const slab = asSlab(node)
    if (slab && slab.polygon.length >= 3) {
      const levelY = slab.parentId ? levelWorldY(nodes as never, slab.parentId) : 0
      const elevation = slab.elevation ?? 0.05
      floors.push({
        name: `slab:${slab.id}`,
        ring: insetPlanRing(
          slab.polygon.map(([x, z]) => toWorldXz([x, z])),
          ECO_WALK_FLOOR_INSET_M,
        ),
        top: levelY + elevation,
      })
    }

    const wall = asWall(node)
    if (wall) {
      const levelY = wall.parentId ? levelWorldY(nodes as never, wall.parentId) : 0
      const height = wall.height ?? 2.7
      const doors = wallDoors(wall, nodes)
      const segs = wallSegmentsWithDoorGaps(wall, doors)
      segs.forEach((seg, i) => {
        solids.push({
          name: segs.length === 1 ? `wall:${wall.id}` : `wall:${wall.id}:${i}`,
          ring: wallSegmentRing(wall, seg.s0, seg.s1),
          base: levelY,
          top: levelY + height,
        })
      })
    }
  }

  return { floors, solids }
}
