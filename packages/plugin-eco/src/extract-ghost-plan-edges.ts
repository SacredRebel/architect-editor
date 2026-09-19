import type { PlanSnapContribution, PlanSnapHorizontal, PlanSnapSegment } from '@pascal-app/core'
import { Box3, type Object3D, Vector3 } from 'three'

const EDGE_Y_DOT_MAX = 0.35 // |dy|/len — keep near-vertical / plan edges
const MIN_EDGE_LEN = 0.15
const WELD = 0.08

/**
 * Extract plan silhouette segments + horizontal bands from a loaded GLB root.
 * Coordinates are world/editor metres (ghost sits at origin).
 */
export function extractGhostPlanSnap(root: Object3D): PlanSnapContribution {
  root.updateMatrixWorld(true)
  const segments: PlanSnapSegment[] = []
  const horizontals: PlanSnapHorizontal[] = []
  const vA = new Vector3()
  const vB = new Vector3()
  const vC = new Vector3()
  const box = new Box3()

  root.traverse((obj) => {
    const mesh = obj as Object3D & {
      isMesh?: boolean
      geometry?: {
        getAttribute: (name: string) =>
          | {
              count: number
              getX: (i: number) => number
              getY: (i: number) => number
              getZ: (i: number) => number
            }
          | undefined
        index?: { count: number; getX: (i: number) => number } | null
      }
    }
    if (!mesh.isMesh || !mesh.geometry) return
    const pos = mesh.geometry.getAttribute('position')
    if (!pos || pos.count < 3) return

    const idx = mesh.geometry.index
    const triCount = idx ? idx.count / 3 : pos.count / 3
    let flatArea = 0
    let flatY = 0
    let flatN = 0
    box.makeEmpty()

    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2
      vA.set(pos.getX(i0), pos.getY(i0), pos.getZ(i0)).applyMatrix4(mesh.matrixWorld)
      vB.set(pos.getX(i1), pos.getY(i1), pos.getZ(i1)).applyMatrix4(mesh.matrixWorld)
      vC.set(pos.getX(i2), pos.getY(i2), pos.getZ(i2)).applyMatrix4(mesh.matrixWorld)
      box.expandByPoint(vA)
      box.expandByPoint(vB)
      box.expandByPoint(vC)

      const e1x = vB.x - vA.x
      const e1y = vB.y - vA.y
      const e1z = vB.z - vA.z
      const e2x = vC.x - vA.x
      const e2y = vC.y - vA.y
      const e2z = vC.z - vA.z
      const nx = e1y * e2z - e1z * e2y
      const ny = e1z * e2x - e1x * e2z
      const nz = e1x * e2y - e1y * e2x
      const nLen = Math.hypot(nx, ny, nz) || 1
      const nyUnit = ny / nLen

      // Near-horizontal face → floor/deck band
      if (Math.abs(nyUnit) > 0.85) {
        const y = (vA.y + vB.y + vC.y) / 3
        const area = nLen * 0.5
        flatArea += area
        flatY += y * area
        flatN += 1
      }

      // Edges of steep faces → plan silhouette candidates
      if (Math.abs(nyUnit) < 0.7) {
        pushEdge(segments, vA, vB)
        pushEdge(segments, vB, vC)
        pushEdge(segments, vC, vA)
      }
    }

    if (flatN > 0 && flatArea > 0.5) {
      horizontals.push({
        y: flatY / flatArea,
        minX: box.min.x,
        maxX: box.max.x,
        minZ: box.min.z,
        maxZ: box.max.z,
      })
    }
  })

  return {
    segments: weldSegments(segments),
    horizontals: mergeHorizontals(horizontals),
  }
}

function pushEdge(out: PlanSnapSegment[], a: Vector3, b: Vector3): void {
  const len = a.distanceTo(b)
  if (len < MIN_EDGE_LEN) return
  const dy = Math.abs(a.y - b.y) / len
  if (dy > EDGE_Y_DOT_MAX) return // skip steep vertical risers that aren't plan edges... wait
  // Plan silhouette: prefer edges that are mostly horizontal in Y (roofline/eave in plan)
  // OR edges of vertical walls (dy can be large for wall height!).
  // Wall vertical edges: large dy — those are corners in plan (point).
  // Wall bottom/top horizontal edges: small dy — those ARE the plan outline.
  if (dy > EDGE_Y_DOT_MAX) return
  out.push({
    a: [a.x, a.z],
    b: [b.x, b.z],
  })
}

function weldSegments(segs: PlanSnapSegment[]): PlanSnapSegment[] {
  const key = (x: number, z: number) => `${Math.round(x / WELD)},${Math.round(z / WELD)}`
  const seen = new Set<string>()
  const out: PlanSnapSegment[] = []
  for (const s of segs) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    if (len < MIN_EDGE_LEN) continue
    const k1 = key(s.a[0], s.a[1])
    const k2 = key(s.b[0], s.b[1])
    const id = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push(s)
  }
  return out
}

function mergeHorizontals(bands: PlanSnapHorizontal[]): PlanSnapHorizontal[] {
  if (bands.length === 0) return bands
  const sorted = [...bands].sort((a, b) => a.y - b.y)
  const out: PlanSnapHorizontal[] = []
  for (const b of sorted) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.y - b.y) < 0.12) {
      last.minX = Math.min(last.minX, b.minX)
      last.maxX = Math.max(last.maxX, b.maxX)
      last.minZ = Math.min(last.minZ, b.minZ)
      last.maxZ = Math.max(last.maxZ, b.maxZ)
      last.y = (last.y + b.y) / 2
    } else {
      out.push({ ...b })
    }
  }
  return out
}
