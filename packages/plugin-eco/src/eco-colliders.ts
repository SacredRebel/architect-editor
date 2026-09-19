'use client'

import { isCurvedWall, sampleWallCenterline, useScene } from '@pascal-app/core'
import { useMemo } from 'react'
import { ECO_WALL_SAMPLE_STEP_M } from './export-walk'
import { levelWorldY } from './level-y'

type HalfExtents = [number, number, number]

export type EcoColliderSpec = {
  key: string
  position: [number, number, number]
  rotation: [number, number, number]
  args: HalfExtents
}

/**
 * Approximate fixed cuboid colliders for walls and slabs.
 * Curved walls are sampled every 0.5 m into short cuboid runs (same step as walk export).
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
          curveOffset?: number
        }
        const levelY = wall.parentId ? levelWorldY(nodes as never, wall.parentId) : 0
        const thickness = wall.thickness ?? 0.1
        const height = wall.height ?? 2.7

        if (isCurvedWall(wall)) {
          const chord = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
          const segments = Math.max(1, Math.ceil(chord / ECO_WALL_SAMPLE_STEP_M))
          const pts = sampleWallCenterline(wall, segments)
          for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i]!
            const b = pts[i + 1]!
            const dx = b.x - a.x
            const dz = b.y - a.y
            const len = Math.hypot(dx, dz)
            if (len < 1e-4) continue
            specs.push({
              key: `wall:${wall.id}:${i}`,
              position: [(a.x + b.x) / 2, levelY + height / 2, (a.y + b.y) / 2],
              rotation: [0, Math.atan2(dx, dz), 0],
              args: [thickness / 2, height / 2, len / 2],
            })
          }
        } else {
          const [x0, z0] = wall.start
          const [x1, z1] = wall.end
          const dx = x1 - x0
          const dz = z1 - z0
          const len = Math.hypot(dx, dz)
          if (len < 1e-4) continue
          specs.push({
            key: `wall:${wall.id}`,
            position: [(x0 + x1) / 2, levelY + height / 2, (z0 + z1) / 2],
            rotation: [0, Math.atan2(dx, dz), 0],
            args: [thickness / 2, height / 2, len / 2],
          })
        }
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
