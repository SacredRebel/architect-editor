/**
 * H15 — Catmull–Rom smooth walls (open/closed polylines, multi-arc).
 * Openings placed by arc length; frames follow the local tangent.
 */

export type Vec2 = [number, number]

export type SmoothWallOpening = {
  id: string
  kind: 'door' | 'window'
  /** Arc-length distance along the sampled centerline to opening centre (m). */
  alongM: number
  width: number
  sillM: number
  headM: number
}

export type EcoSmoothWall = {
  id: string
  name: string
  /** Control points in plan [x, z]. */
  controls: Vec2[]
  closed: boolean
  thickness: number
  height: number
  openings: SmoothWallOpening[]
  /** Assembly extras for GLB round-trip. */
  assembly?: { structure: string; infill: string; insulation: string }
}

const SIMPLIFY_TOL_M = 0.1

/** Centripetal Catmull–Rom sample between four control points. */
function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t
  const t3 = t2 * t
  const x =
    0.5 *
    (2 * p1[0] +
      (-p0[0] + p2[0]) * t +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
  const z =
    0.5 *
    (2 * p1[1] +
      (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
  return [x, z]
}

function wrapIndex(i: number, n: number, closed: boolean): number {
  if (closed) return ((i % n) + n) % n
  return Math.max(0, Math.min(n - 1, i))
}

/** Ramer–Douglas–Peucker simplify (~0.1 m default). */
export function simplifyPolyline(pts: Vec2[], tolM = SIMPLIFY_TOL_M): Vec2[] {
  if (pts.length <= 2) return pts.slice()
  const sqTol = tolM * tolM
  function perpDistSq(p: Vec2, a: Vec2, b: Vec2): number {
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len2 = dx * dx + dz * dz
    if (len2 < 1e-12) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2
    let u = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2
    u = Math.max(0, Math.min(1, u))
    const qx = a[0] + u * dx
    const qz = a[1] + u * dz
    return (p[0] - qx) ** 2 + (p[1] - qz) ** 2
  }
  function rec(start: number, end: number, keep: boolean[]): void {
    let maxD = 0
    let idx = -1
    for (let i = start + 1; i < end; i++) {
      const d = perpDistSq(pts[i]!, pts[start]!, pts[end]!)
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (maxD > sqTol && idx >= 0) {
      keep[idx] = true
      rec(start, idx, keep)
      rec(idx, end, keep)
    }
  }
  const keep = pts.map((_, i) => i === 0 || i === pts.length - 1)
  rec(0, pts.length - 1, keep)
  return pts.filter((_, i) => keep[i])
}

/** Sample Catmull–Rom through controls; step ≈ 0.25 m. */
export function sampleSmoothWall(wall: EcoSmoothWall, stepM = 0.25): Vec2[] {
  const controls = wall.controls
  const n = controls.length
  if (n < 2) return controls.slice()
  if (n === 2) return [controls[0]!, controls[1]!]

  const out: Vec2[] = []
  const spans = wall.closed ? n : n - 1
  for (let i = 0; i < spans; i++) {
    const p0 = controls[wrapIndex(i - 1, n, wall.closed)]!
    const p1 = controls[wrapIndex(i, n, wall.closed)]!
    const p2 = controls[wrapIndex(i + 1, n, wall.closed)]!
    const p3 = controls[wrapIndex(i + 2, n, wall.closed)]!
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || stepM
    const segs = Math.max(2, Math.ceil(segLen / stepM))
    for (let s = 0; s < segs; s++) {
      const t = s / segs
      out.push(catmullRom(p0, p1, p2, p3, t))
    }
  }
  if (!wall.closed) out.push(controls[n - 1]!)
  else out.push(out[0]!)
  return out
}

export function smoothWallLength(wall: EcoSmoothWall): number {
  const pts = sampleSmoothWall(wall)
  let L = 0
  for (let i = 0; i < pts.length - 1; i++) {
    L += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1])
  }
  return L
}

export function frameAtArcLength(
  wall: EcoSmoothWall,
  alongM: number,
): { point: Vec2; tangent: Vec2; normal: Vec2; t: number } {
  const pts = sampleSmoothWall(wall)
  let remaining = Math.max(0, alongM)
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len = Math.hypot(dx, dz) || 1e-9
    if (remaining <= len || i === pts.length - 2) {
      const u = Math.min(1, remaining / len)
      const tx = dx / len
      const tz = dz / len
      return {
        point: [a[0] + dx * u, a[1] + dz * u],
        tangent: [tx, tz],
        normal: [-tz, tx],
        t: u,
      }
    }
    remaining -= len
  }
  const last = pts[pts.length - 1]!
  return { point: last, tangent: [1, 0], normal: [0, 1], t: 1 }
}

/**
 * Push the middle of the selected control span by `metres` along the outward normal.
 * Span is indices [i, i+1] (or last→first when closed).
 */
export function bulgeSmoothWall(
  wall: EcoSmoothWall,
  spanIndex: number,
  metres: number,
): EcoSmoothWall {
  const controls = wall.controls.map((c) => [...c] as Vec2)
  const n = controls.length
  if (n < 2) return wall
  const i0 = ((spanIndex % (wall.closed ? n : n - 1)) + n) % n
  const i1 = wall.closed ? (i0 + 1) % n : Math.min(n - 1, i0 + 1)
  const a = controls[i0]!
  const b = controls[i1]!
  const mx = (a[0] + b[0]) / 2
  const mz = (a[1] + b[1]) / 2
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len = Math.hypot(dx, dz) || 1
  const nx = -dz / len
  const nz = dx / len
  // Insert or move a mid control
  const mid: Vec2 = [mx + nx * metres, mz + nz * metres]
  if (wall.closed) {
    const next = [...controls.slice(0, i0 + 1), mid, ...controls.slice(i1)]
    return { ...wall, controls: simplifyPolyline(next, SIMPLIFY_TOL_M * 0.5) }
  }
  const next = [...controls.slice(0, i0 + 1), mid, ...controls.slice(i1)]
  return { ...wall, controls: next }
}

/** Continuous solid runs with openings cut as gaps (absence). */
export function smoothWallSolidRuns(
  wall: EcoSmoothWall,
): { startM: number; endM: number }[] {
  const total = smoothWallLength(wall)
  const cuts = wall.openings
    .map((o) => ({
      a: Math.max(0, o.alongM - o.width / 2),
      b: Math.min(total, o.alongM + o.width / 2),
    }))
    .sort((x, y) => x.a - y.a)
  const runs: { startM: number; endM: number }[] = []
  let cursor = 0
  for (const c of cuts) {
    if (c.a > cursor + 0.02) runs.push({ startM: cursor, endM: c.a })
    cursor = Math.max(cursor, c.b)
  }
  if (cursor < total - 0.02) runs.push({ startM: cursor, endM: total })
  return runs
}

/** Offset polyline for thickness / slab overlap (mitred corners via averaged normals). */
export function offsetPolyline(pts: Vec2[], dist: number, closed: boolean): Vec2[] {
  const n = pts.length - (closed && pts.length > 1 ? 1 : 0)
  if (n < 2) return pts.slice()
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const prev = pts[wrapIndex(i - 1, n, closed)]!
    const cur = pts[i]!
    const next = pts[wrapIndex(i + 1, n, closed)]!
    const d0x = cur[0] - prev[0]
    const d0z = cur[1] - prev[1]
    const d1x = next[0] - cur[0]
    const d1z = next[1] - cur[1]
    const l0 = Math.hypot(d0x, d0z) || 1
    const l1 = Math.hypot(d1x, d1z) || 1
    const n0x = -d0z / l0
    const n0z = d0x / l0
    const n1x = -d1z / l1
    const n1z = d1x / l1
    let nx = n0x + n1x
    let nz = n0z + n1z
    const nl = Math.hypot(nx, nz) || 1
    nx /= nl
    nz /= nl
    // Mitre length
    const dot = Math.max(-0.999, Math.min(0.999, n0x * nx + n0z * nz))
    const mitre = dist / Math.max(0.2, dot)
    out.push([cur[0] + nx * mitre, cur[1] + nz * mitre])
  }
  if (closed && out.length) out.push(out[0]!)
  return out
}

export function makeDemoSmoothWall(id = `sw-${Date.now()}`): EcoSmoothWall {
  // Open multi-arc polyline ~20 m with three windows
  const controls: Vec2[] = [
    [0, 0],
    [5, 3],
    [10, 0],
    [15, -2],
    [20, 0],
  ]
  const wall: EcoSmoothWall = {
    id,
    name: 'Smooth wall',
    controls,
    closed: false,
    thickness: 0.3,
    height: 2.7,
    openings: [],
  }
  const L = smoothWallLength(wall)
  wall.openings = [
    { id: 'w0', kind: 'window', alongM: L * 0.25, width: 1.2, sillM: 0.9, headM: 2.1 },
    { id: 'w1', kind: 'window', alongM: L * 0.5, width: 1.2, sillM: 0.9, headM: 2.1 },
    { id: 'w2', kind: 'window', alongM: L * 0.75, width: 1.2, sillM: 0.9, headM: 2.1 },
  ]
  return wall
}
