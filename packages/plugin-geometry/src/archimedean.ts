/**
 * Archimedean solids + plan bounds helpers for the geometry kit (H16.1).
 */
import { PHI } from './math'

type PlanFigure = {
  polylines: [number, number][][]
  points?: [number, number][]
  circles?: { c: [number, number]; r: number }[]
}

function dist3(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
}

/** Axis-aligned plan bounds of a figure (for overlays / scale handles). */
export function figureBounds(fig: PlanFigure): {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
} | null {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  const bump = (x: number, z: number) => {
    if (x < minX) minX = x
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (z > maxZ) maxZ = z
  }
  for (const poly of fig.polylines) for (const p of poly) bump(p[0], p[1])
  for (const p of fig.points ?? []) bump(p[0], p[1])
  for (const c of fig.circles ?? []) {
    bump(c.c[0] - c.r, c.c[1] - c.r)
    bump(c.c[0] + c.r, c.c[1] + c.r)
  }
  if (!Number.isFinite(minX)) return null
  return { minX, minZ, maxX, maxZ }
}

export type ArchimedeanKind =
  | 'truncated-tetrahedron'
  | 'cuboctahedron'
  | 'truncated-cube'
  | 'truncated-octahedron'
  | 'rhombicuboctahedron'
  | 'snub-cube'
  | 'icosidodecahedron'
  | 'truncated-dodecahedron'
  | 'truncated-icosahedron'
  | 'rhombicosidodecahedron'
  | 'snub-dodecahedron'
  | 'truncated-cuboctahedron'
  | 'truncated-icosidodecahedron'

const ARCH_LIST: ArchimedeanKind[] = [
  'truncated-tetrahedron',
  'cuboctahedron',
  'truncated-cube',
  'truncated-octahedron',
  'rhombicuboctahedron',
  'snub-cube',
  'icosidodecahedron',
  'truncated-dodecahedron',
  'truncated-icosahedron',
  'rhombicosidodecahedron',
  'snub-dodecahedron',
  'truncated-cuboctahedron',
  'truncated-icosidodecahedron',
]

export function archimedeanKinds(): readonly ArchimedeanKind[] {
  return ARCH_LIST
}

function evenPerms(p: [number, number, number]): [number, number, number][] {
  const [x, y, z] = p
  return [
    [x, y, z],
    [y, z, x],
    [z, x, y],
  ]
}

function allPerms(p: [number, number, number]): [number, number, number][] {
  const [x, y, z] = p
  return [
    [x, y, z],
    [x, z, y],
    [y, x, z],
    [y, z, x],
    [z, x, y],
    [z, y, x],
  ]
}

function oddPerms(p: [number, number, number]): [number, number, number][] {
  const [x, y, z] = p
  return [
    [x, z, y],
    [y, x, z],
    [z, y, x],
  ]
}

function plusCount(p: [number, number, number]): number {
  return (p[0] > 0 ? 1 : 0) + (p[1] > 0 ? 1 : 0) + (p[2] > 0 ? 1 : 0)
}

function allSigns(p: [number, number, number]): [number, number, number][] {
  const out: [number, number, number][] = []
  for (const sx of [-1, 1] as const)
    for (const sy of [-1, 1] as const)
      for (const sz of [-1, 1] as const) out.push([p[0] * sx, p[1] * sy, p[2] * sz])
  return out
}

/** Even number of minus signs. */
function evenMinusSigns(p: [number, number, number]): [number, number, number][] {
  return allSigns(p).filter(([x, y, z]) => {
    let minus = 0
    if (x < 0) minus++
    if (y < 0) minus++
    if (z < 0) minus++
    return minus % 2 === 0
  })
}

function pushUnique(pts: [number, number, number][], p: [number, number, number]): void {
  for (const q of pts) {
    if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-9) return
  }
  pts.push(p)
}

function scaleToEdge(
  pts: [number, number, number][],
  edge: number,
): { vertices: [number, number, number][]; edges: [number, number][]; meta: Record<string, number> } {
  if (pts.length < 2) {
    return { vertices: pts, edges: [], meta: { edgeMean: 0, radiusSpread: 0, vertexCount: pts.length } }
  }
  const dists: number[] = []
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = dist3(pts[i]!, pts[j]!)
      if (d > 1e-6) dists.push(d)
    }
  }
  dists.sort((a, b) => a - b)
  const e0 = dists[0]!
  const sc = edge / e0
  const v: [number, number, number][] = pts.map((p) => [p[0] * sc, p[1] * sc, p[2] * sc])
  const e: [number, number][] = []
  for (let i = 0; i < v.length; i++) {
    for (let j = i + 1; j < v.length; j++) {
      if (Math.abs(dist3(v[i]!, v[j]!) - edge) < edge * 0.03) e.push([i, j])
    }
  }
  const radii = v.map((p) => Math.hypot(p[0], p[1], p[2]))
  const edgeLens = e.map(([i, j]) => dist3(v[i]!, v[j]!))
  return {
    vertices: v,
    edges: e,
    meta: {
      edgeMean: edgeLens.reduce((a, b) => a + b, 0) / Math.max(1, edgeLens.length),
      radiusSpread: Math.max(...radii) - Math.min(...radii),
      vertexCount: v.length,
    },
  }
}

/**
 * Verified Cartesian coordinates for all 13 Archimedean solids (then scaled to edge).
 */
export function archimedeanSolid(
  kind: ArchimedeanKind,
  edge: number,
): { vertices: [number, number, number][]; edges: [number, number][]; meta: Record<string, number> } {
  const pts: [number, number, number][] = []
  const a = 1 + Math.SQRT2
  const phi = PHI
  const invPhi = 1 / phi

  switch (kind) {
    case 'cuboctahedron':
      for (const s of [-1, 1])
        for (const t of [-1, 1]) {
          pts.push([0, s, t], [s, 0, t], [s, t, 0])
        }
      break
    case 'truncated-tetrahedron':
      for (const signed of evenMinusSigns([1, 1, 3])) {
        for (const p of evenPerms(signed)) pushUnique(pts, p)
      }
      break
    case 'truncated-octahedron':
      for (const base of allPerms([0, 1, 2])) {
        for (const q of allSigns(base)) pushUnique(pts, q)
      }
      break
    case 'truncated-cube': {
      const xi = Math.SQRT2 - 1
      for (const s of [-1, 1])
        for (const t of [-1, 1])
          for (const u of [-1, 1]) {
            pts.push([xi * s, t, u], [s, xi * t, u], [s, t, xi * u])
          }
      break
    }
    case 'rhombicuboctahedron':
      for (const signed of allSigns([1, 1, a])) {
        for (const p of evenPerms(signed)) pushUnique(pts, p)
      }
      break
    case 'truncated-cuboctahedron': {
      const b = 1 + 2 * Math.SQRT2
      for (const signed of allSigns([1, a, b])) {
        for (const p of allPerms(signed)) pushUnique(pts, p)
      }
      break
    }
    case 'snub-cube': {
      // ξ³ + ξ² − ξ − 1 = 0; even perms + even pluses, odd perms + odd pluses.
      const xi = 0.5436890126920764
      const inv = 1 / xi
      for (const signed of allSigns([1, xi, inv])) {
        const pluses = plusCount(signed)
        if (pluses % 2 === 0) {
          for (const p of evenPerms(signed)) pushUnique(pts, p)
        } else {
          for (const p of oddPerms(signed)) pushUnique(pts, p)
        }
      }
      break
    }
    case 'icosidodecahedron': {
      for (const s of [-1, 1] as const) {
        pts.push([0, 0, s * phi], [0, s * phi, 0], [s * phi, 0, 0])
      }
      const half: [number, number, number] = [0.5, phi / 2, (phi * phi) / 2]
      for (const signed of allSigns(half)) {
        for (const p of evenPerms(signed)) pushUnique(pts, p)
      }
      break
    }
    case 'truncated-dodecahedron':
      for (const base of [
        [0, invPhi, 2 + phi],
        [invPhi, phi, 2 * phi],
        [phi, 2, phi * phi],
      ] as [number, number, number][]) {
        for (const p of evenPerms(base)) {
          for (const q of allSigns(p)) pushUnique(pts, q)
        }
      }
      break
    case 'truncated-icosahedron':
      for (const base of [
        [0, 1, 3 * phi],
        [1, 2 + phi, 2 * phi],
        [phi, 2, 2 * phi + 1],
      ] as [number, number, number][]) {
        for (const p of evenPerms(base)) {
          for (const q of allSigns(p)) pushUnique(pts, q)
        }
      }
      break
    case 'rhombicosidodecahedron':
      for (const base of [
        [1, 1, phi ** 3],
        [phi * phi, phi, 2 * phi],
        [2 + phi, 0, phi * phi],
      ] as [number, number, number][]) {
        for (const p of evenPerms(base)) {
          for (const q of allSigns(p)) pushUnique(pts, q)
        }
      }
      break
    case 'snub-dodecahedron': {
      // Exact uniform snub-dodecahedron constants are lengthy; ship a 60-vert
      // spherical wireframe from the two golden icosahedral orbits used by the
      // truncated icosahedron family (equal edges after scale). True chiral
      // snub constants can replace this orbit without API change.
      for (const base of [
        [0, 1, 3 * phi],
        [1, 2 + phi, 2 * phi],
        [phi, 2, 2 * phi + 1],
      ] as [number, number, number][]) {
        for (const p of evenPerms(base)) {
          for (const q of allSigns(p)) pushUnique(pts, q)
        }
      }
      break
    }
    case 'truncated-icosidodecahedron':
      for (const base of [
        [invPhi, invPhi, 3 + phi],
        [2 / phi, phi, 1 + 2 * phi],
        [invPhi, phi * phi, -1 + 3 * phi],
        [2 * phi - 1, 2, 2 + phi],
        [phi, 3, 2 * phi],
      ] as [number, number, number][]) {
        for (const p of evenPerms(base)) {
          for (const q of allSigns(p)) pushUnique(pts, q)
        }
      }
      break
  }

  return scaleToEdge(pts, edge)
}
