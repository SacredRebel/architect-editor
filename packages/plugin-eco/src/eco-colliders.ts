'use client'

import { useScene } from '@pascal-app/core'
import { useMemo } from 'react'

type HalfExtents = [number, number, number]

export type EcoColliderSpec = {
  key: string
  position: [number, number, number]
  rotation: [number, number, number]
  args: HalfExtents
}

function levelWorldY(
  nodes: Record<
    string,
    {
      type?: string
      parentId?: string | null
      children?: string[]
      height?: number
      baseElevation?: number
    }
  >,
  levelId: string,
): number {
  const level = nodes[levelId]
  if (!level || level.type !== 'level') return 0
  const buildingId = level.parentId
  const building = buildingId ? nodes[buildingId] : null
  if (!building || building.type !== 'building') {
    return level.baseElevation ?? 0
  }
  const levelIds = (building.children ?? []).filter((id) => nodes[id]?.type === 'level')
  let y = 0
  for (const id of levelIds) {
    if (id === levelId) return y + (level.baseElevation ?? 0)
    const h = nodes[id]?.height ?? 2.7
    y += h
  }
  return y + (level.baseElevation ?? 0)
}

/**
 * Approximate fixed cuboid colliders for walls and slabs from the scene graph.
 * Good enough for Walk v1; door openings are ignored here (handled in E6 walk export).
 */
export function useEcoStructureColliders(): EcoColliderSpec[] {
  const nodes = useScene((s) => s.nodes)

  return useMemo(() => {
    const specs: EcoColliderSpec[] = []
    for (const node of Object.values(nodes)) {
      if (!node) continue
      if (node.type === 'wall' && 'start' in node && 'end' in node) {
        const wall = node as {
          id: string
          parentId?: string | null
          start: [number, number]
          end: [number, number]
          thickness?: number
          height?: number
        }
        const levelY = wall.parentId ? levelWorldY(nodes as never, wall.parentId) : 0
        const [x0, z0] = wall.start
        const [x1, z1] = wall.end
        const dx = x1 - x0
        const dz = z1 - z0
        const len = Math.hypot(dx, dz)
        if (len < 1e-4) continue
        const thickness = wall.thickness ?? 0.1
        const height = wall.height ?? 2.7
        const cx = (x0 + x1) / 2
        const cz = (z0 + z1) / 2
        // Angle so local +Z aligns with wall direction (length along Z).
        const yaw = Math.atan2(dx, dz)
        specs.push({
          key: `wall:${wall.id}`,
          position: [cx, levelY + height / 2, cz],
          rotation: [0, yaw, 0],
          args: [thickness / 2, height / 2, len / 2],
        })
      }
      if (node.type === 'slab' && 'polygon' in node) {
        const slab = node as {
          id: string
          parentId?: string | null
          polygon: [number, number][]
          elevation?: number
          thickness?: number
        }
        if (!slab.polygon.length) continue
        const levelY = slab.parentId ? levelWorldY(nodes as never, slab.parentId) : 0
        let minX = Infinity
        let maxX = -Infinity
        let minZ = Infinity
        let maxZ = -Infinity
        for (const [x, z] of slab.polygon) {
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minZ = Math.min(minZ, z)
          maxZ = Math.max(maxZ, z)
        }
        const elevation = slab.elevation ?? 0.05
        const thickness = Math.max(slab.thickness ?? 0.05, 0.05)
        const top = levelY + elevation
        specs.push({
          key: `slab:${slab.id}`,
          position: [(minX + maxX) / 2, top - thickness / 2, (minZ + maxZ) / 2],
          rotation: [0, 0, 0],
          args: [(maxX - minX) / 2 || 0.5, thickness / 2, (maxZ - minZ) / 2 || 0.5],
        })
      }
    }
    return specs
  }, [nodes])
}
