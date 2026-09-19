import type { EcoWalk } from './bridge-types'
import { levelWorldY } from './level-y'

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
  if (!node || node.type !== 'wall') return null
  if (!Array.isArray(node.start) || !Array.isArray(node.end)) return null
  return node as unknown as WallLike
}

function asSlab(node: Record<string, unknown> | undefined): SlabLike | null {
  if (!node || node.type !== 'slab') return null
  if (!Array.isArray(node.polygon)) return null
  return node as unknown as SlabLike
}

function asDoor(node: Record<string, unknown> | undefined): DoorLike | null {
  if (!node || node.type !== 'door') return null
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

function wallSegmentsWithDoorGaps(wall: WallLike, doors: DoorLike[]): { s0: number; s1: number }[] {
  const [x0, z0] = wall.start
  const [x1, z1] = wall.end
  const len = Math.hypot(x1 - x0, z1 - z0)
  if (len < 1e-4) return []

  const gaps = doors
    .map((d) => {
      const half = d.width / 2
      return { min: d.position[0] - half, max: d.position[0] + half }
    })
    .filter((g) => g.max > 0 && g.min < len)
    .map((g) => ({ min: Math.max(0, g.min), max: Math.min(len, g.max) }))
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
  if (len - cursor > 1e-3) segs.push({ s0: cursor, s1: len })
  return segs
}

/** Rectangle ring around a wall segment plan footprint (editor xz → world xz). */
function wallSegmentRing(wall: WallLike, s0: number, s1: number): [number, number][] {
  const [x0, z0] = wall.start
  const [x1, z1] = wall.end
  const len = Math.hypot(x1 - x0, z1 - z0)
  const dx = (x1 - x0) / len
  const dz = (z1 - z0) / len
  const halfT = (wall.thickness ?? 0.1) / 2
  const px = -dz
  const pz = dx

  const a: [number, number] = [x0 + dx * s0, z0 + dz * s0]
  const b: [number, number] = [x0 + dx * s1, z0 + dz * s1]
  const corners: [number, number][] = [
    [a[0] + px * halfT, a[1] + pz * halfT],
    [b[0] + px * halfT, b[1] + pz * halfT],
    [b[0] - px * halfT, b[1] - pz * halfT],
    [a[0] - px * halfT, a[1] - pz * halfT],
  ]
  // Open rings — world closes them; document: we emit open (first ≠ last).
  return corners.map(toWorldXz)
}

/**
 * Derive EcoWalk from the scene graph (world frame: x east, y up, z south).
 * Rings are open (first point ≠ last); the host closes them.
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
        ring: slab.polygon.map(([x, z]) => toWorldXz([x, z])),
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
