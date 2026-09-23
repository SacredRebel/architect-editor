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

function boundaryPointAt(boundary: Vec3[], t01: number): Vec3 {
  if (boundary.length === 0) return [0, 0, 0]
  if (boundary.length === 1) return boundary[0]!
  let total = 0
  const lens: number[] = []
  for (let i = 0; i < boundary.length - 1; i++) {
    const a = boundary[i]!
    const b = boundary[i + 1]!
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    lens.push(len)
    total += len
  }
  // Closed: also last→first if not already closed
  const first = boundary[0]!
  const last = boundary[boundary.length - 1]!
  const closedGap = Math.hypot(first[0] - last[0], first[1] - last[1], first[2] - last[2])
  if (closedGap > 1e-4) {
    lens.push(closedGap)
    total += closedGap
  }
  let target = Math.max(0, Math.min(1, t01)) * (total || 1)
  const pts = closedGap > 1e-4 ? [...boundary, first] : boundary
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const len = lens[i] ?? Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    if (target <= len || i === pts.length - 2) {
      const u = len < 1e-9 ? 0 : target / len
      return [
        a[0] + (b[0] - a[0]) * u,
        a[1] + (b[1] - a[1]) * u,
        a[2] + (b[2] - a[2]) * u,
      ]
    }
    target -= len
  }
  return last
}

/**
 * Build a grid from a closed boundary curve, then relax interior vertices
 * (discrete minimal surface / soap film). Boundary stays fixed — parametric.
 */
export function tessellateMinimalPatch(patch: EcoMinimalPatch): {
  positions: number[]
  indices: number[]
} {
  const nu = Math.max(2, patch.gridU)
  const nv = Math.max(2, patch.gridV)
  const boundary = patch.boundary
  let cx = 0
  let cy = 0
  let cz = 0
  for (const p of boundary) {
    cx += p[0]
    cy += p[1]
    cz += p[2]
  }
  const n = Math.max(1, boundary.length)
  cx /= n
  cy /= n
  cz /= n

  const grid: Vec3[][] = []
  for (let i = 0; i <= nu; i++) {
    const row: Vec3[] = []
    const u = i / nu
    for (let j = 0; j <= nv; j++) {
      const v = j / nv
      // Polar-ish: edge of grid maps to boundary by angle; interior blends to centre
      const edgeT = j / nv
      const edge = boundaryPointAt(boundary, edgeT)
      const x = cx + (edge[0] - cx) * u
      const y = cy + (edge[1] - cy) * u
      const z = cz + (edge[2] - cz) * u
      row.push([x, y, z])
      void v
    }
    grid.push(row)
  }
  // Pin outer ring (i === nu); relax interior
  for (let iter = 0; iter < patch.iterations; iter++) {
    for (let i = 1; i < nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const j0 = (j + nv) % (nv + 1)
        const j1 = (j + 1) % (nv + 1)
        // For open V use neighbours; treat j as circular when boundary is closed
        const a = grid[i - 1]![j]!
        const b = grid[i + 1]![j]!
        const c = grid[i]![j0 === j ? Math.max(0, j - 1) : j0]!
        const d = grid[i]![j1 === j ? Math.min(nv, j + 1) : j1]!
        const left = grid[i]![Math.max(0, j - 1)]!
        const right = grid[i]![Math.min(nv, j + 1)]!
        grid[i]![j] = [
          (a[0] + b[0] + left[0] + right[0]) / 4,
          (a[1] + b[1] + left[1] + right[1]) / 4,
          (a[2] + b[2] + left[2] + right[2]) / 4,
        ]
        void c
        void d
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
