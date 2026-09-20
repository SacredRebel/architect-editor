/**
 * Catenary arches and a simple discrete minimal-surface (soap-film) solve.
 * Shapes from physics parameters — not drafted polylines.
 */

import type { Vec2, Vec3 } from './eco-loft'

export type EcoCatenary = {
  id: string
  name: string
  /** Plan start [x, z]. */
  start: Vec2
  /** Plan end [x, z]. */
  end: Vec2
  /** Sag below the chord (m) — positive down from supports. */
  sag: number
  /** Height of the two supports (m). */
  supportHeight: number
  thickness: number
  segments: number
}

/**
 * Sample a catenary in the vertical plane of start→end.
 * y = a cosh((x-x0)/a) + c, fitted so mid-sag equals `sag`.
 */
export function sampleCatenary(cat: EcoCatenary): Vec3[] {
  const dx = cat.end[0] - cat.start[0]
  const dz = cat.end[1] - cat.start[1]
  const span = Math.hypot(dx, dz) || 1
  const tx = dx / span
  const tz = dz / span
  // Approximate a from sag: sag ≈ L²/(8a) ⇒ a ≈ L²/(8 sag)
  const a = Math.max(0.1, (span * span) / (8 * Math.max(0.05, cat.sag)))
  const n = Math.max(4, cat.segments)
  const pts: Vec3[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const s = (t - 0.5) * span
    const yDrop = a * Math.cosh(s / a) - a * Math.cosh(span / (2 * a))
    // yDrop is 0 at ends, negative at mid — we want mid lower by sag
    const scale = cat.sag / Math.max(1e-6, a * Math.cosh(span / (2 * a)) - a)
    const y = cat.supportHeight + yDrop * scale
    pts.push([cat.start[0] + tx * t * span, y, cat.start[1] + tz * t * span])
  }
  return pts
}

export type EcoMinimalPatch = {
  id: string
  name: string
  /** Closed or open boundary polylines in 3D (control cage). */
  boundary: Vec3[]
  /** Grid resolution for the discrete Laplace solve. */
  gridU: number
  gridV: number
  thickness: number
  /** Iterations of Laplacian smoothing with fixed boundary. */
  iterations: number
}

/**
 * Build a ruled grid from a rectangular boundary estimate, then relax interior
 * vertices (discrete minimal surface). Boundary stays fixed — parametric.
 */
export function tessellateMinimalPatch(patch: EcoMinimalPatch): {
  positions: number[]
  indices: number[]
} {
  const nu = Math.max(2, patch.gridU)
  const nv = Math.max(2, patch.gridV)
  // Expect boundary ordered: 4 corners at least — sample bbox
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of patch.boundary) {
    minX = Math.min(minX, p[0])
    maxX = Math.max(maxX, p[0])
    minZ = Math.min(minZ, p[2])
    maxZ = Math.max(maxZ, p[2])
    minY = Math.min(minY, p[1])
    maxY = Math.max(maxY, p[1])
  }
  const grid: Vec3[][] = []
  for (let i = 0; i <= nu; i++) {
    const row: Vec3[] = []
    const u = i / nu
    for (let j = 0; j <= nv; j++) {
      const v = j / nv
      const x = minX + (maxX - minX) * u
      const z = minZ + (maxZ - minZ) * v
      // Boundary height from bilinear corners of boundary bbox mid
      const y = minY + (maxY - minY) * (1 - Math.hypot(u - 0.5, v - 0.5) * 1.2)
      row.push([x, y, z])
    }
    grid.push(row)
  }
  // Pin boundary; relax interior
  for (let iter = 0; iter < patch.iterations; iter++) {
    for (let i = 1; i < nu; i++) {
      for (let j = 1; j < nv; j++) {
        const a = grid[i - 1]![j]!
        const b = grid[i + 1]![j]!
        const c = grid[i]![j - 1]!
        const d = grid[i]![j + 1]!
        grid[i]![j] = [
          (a[0] + b[0] + c[0] + d[0]) / 4,
          (a[1] + b[1] + c[1] + d[1]) / 4,
          (a[2] + b[2] + c[2] + d[2]) / 4,
        ]
      }
    }
  }

  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const p = grid[i]![j]!
      positions.push(p[0], p[1], p[2])
    }
  }
  const cols = nv + 1
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * cols + j
      indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1)
    }
  }
  return { positions, indices }
}

export function makeDefaultCatenary(id = `cat-${Date.now()}`): EcoCatenary {
  return {
    id,
    name: 'Catenary arch',
    start: [-6, 0],
    end: [6, 0],
    sag: 2.5,
    supportHeight: 5,
    thickness: 0.2,
    segments: 32,
  }
}
