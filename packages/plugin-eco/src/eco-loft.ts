/**
 * Parametric loft — profile curves swept along a rail into a shell surface.
 * Control data stays editable; tessellation is derived on demand.
 */

export type Vec2 = [number, number]
export type Vec3 = [number, number, number]

export type EcoLoftProfile = {
  /** Parameter along rail in [0, 1]. */
  t: number
  /** Profile polyline in local (right, up) metres at the rail frame. */
  points: Vec2[]
}

export type EcoLoft = {
  id: string
  name: string
  /** Rail polyline in plan [x, z]; height taken from `railY` or 0. */
  rail: Vec2[]
  /** Optional Y at each rail point (same length as rail); default 0. */
  railY?: number[]
  profiles: EcoLoftProfile[]
  thickness: number
  /** Tessellation segments along rail (adaptive if 0). */
  alongSegments: number
  /** Tessellation segments across each profile (0 = use profile vertices). */
  acrossSegments: number
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function polylineLength2(poly: Vec2[]): number {
  let L = 0
  for (let i = 0; i < poly.length - 1; i++) {
    L += Math.hypot(poly[i + 1]![0] - poly[i]![0], poly[i + 1]![1] - poly[i]![1])
  }
  return L
}

function pointAlong2(poly: Vec2[], t01: number): { x: number; z: number; tx: number; tz: number } {
  const total = polylineLength2(poly) || 1
  let target = Math.max(0, Math.min(1, t01)) * total
  for (let i = 0; i < poly.length - 1; i++) {
    const ax = poly[i]![0]
    const az = poly[i]![1]
    const bx = poly[i + 1]![0]
    const bz = poly[i + 1]![1]
    const len = Math.hypot(bx - ax, bz - az)
    if (target <= len || i === poly.length - 2) {
      const u = len < 1e-9 ? 0 : target / len
      const dx = bx - ax
      const dz = bz - az
      const L = Math.hypot(dx, dz) || 1
      return {
        x: ax + dx * u,
        z: az + dz * u,
        tx: dx / L,
        tz: dz / L,
      }
    }
    target -= len
  }
  const last = poly[poly.length - 1]!
  return { x: last[0], z: last[1], tx: 1, tz: 0 }
}

function yAlong(rail: Vec2[], railY: number[] | undefined, t01: number): number {
  if (!railY || railY.length === 0) return 0
  if (railY.length === 1) return railY[0]!
  const total = polylineLength2(rail) || 1
  let target = Math.max(0, Math.min(1, t01)) * total
  let walked = 0
  for (let i = 0; i < rail.length - 1; i++) {
    const len = Math.hypot(rail[i + 1]![0] - rail[i]![0], rail[i + 1]![1] - rail[i]![1])
    const y0 = railY[Math.min(i, railY.length - 1)] ?? 0
    const y1 = railY[Math.min(i + 1, railY.length - 1)] ?? y0
    if (target <= len || i === rail.length - 2) {
      const u = len < 1e-9 ? 0 : target / len
      return lerp(y0, y1, u)
    }
    target -= len
    walked += len
  }
  void walked
  return railY[railY.length - 1] ?? 0
}

function sortedProfiles(profiles: EcoLoftProfile[]): EcoLoftProfile[] {
  return [...profiles].sort((a, b) => a.t - b.t)
}

function interpolateProfile(profiles: EcoLoftProfile[], t: number): Vec2[] {
  const sorted = sortedProfiles(profiles)
  if (sorted.length === 0) return []
  if (sorted.length === 1) return sorted[0]!.points.map((p) => [...p] as Vec2)
  if (t <= sorted[0]!.t) return sorted[0]!.points.map((p) => [...p] as Vec2)
  if (t >= sorted[sorted.length - 1]!.t) {
    return sorted[sorted.length - 1]!.points.map((p) => [...p] as Vec2)
  }
  let i = 0
  while (i < sorted.length - 1 && sorted[i + 1]!.t < t) i++
  const a = sorted[i]!
  const b = sorted[i + 1]!
  const span = b.t - a.t || 1
  const u = (t - a.t) / span
  const n = Math.min(a.points.length, b.points.length)
  const out: Vec2[] = []
  for (let k = 0; k < n; k++) {
    out.push([
      lerp(a.points[k]![0], b.points[k]![0], u),
      lerp(a.points[k]![1], b.points[k]![1], u),
    ])
  }
  return out
}

function resampleProfile(points: Vec2[], segments: number): Vec2[] {
  if (segments <= 0 || points.length < 2) return points.map((p) => [...p] as Vec2)
  const closed =
    Math.hypot(points[0]![0] - points[points.length - 1]![0], points[0]![1] - points[points.length - 1]![1]) <
    1e-6
  const poly = closed ? points.slice(0, -1) : points
  const L = polylineLength2(poly.length ? [...poly, poly[0]!] : points) || 1
  // Open length
  let openL = 0
  for (let i = 0; i < points.length - 1; i++) {
    openL += Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1])
  }
  const total = openL || 1
  const out: Vec2[] = []
  for (let i = 0; i <= segments; i++) {
    const target = (i / segments) * total
    let walked = 0
    let placed = false
    for (let j = 0; j < points.length - 1; j++) {
      const ax = points[j]![0]
      const ay = points[j]![1]
      const bx = points[j + 1]![0]
      const by = points[j + 1]![1]
      const len = Math.hypot(bx - ax, by - ay)
      if (walked + len >= target || j === points.length - 2) {
        const u = len < 1e-9 ? 0 : (target - walked) / len
        out.push([lerp(ax, bx, u), lerp(ay, by, u)])
        placed = true
        break
      }
      walked += len
    }
    if (!placed) out.push([...(points[points.length - 1] as Vec2)])
  }
  void L
  return out
}

export type LoftMeshData = {
  positions: number[]
  indices: number[]
  /** Outline of the loft at eave (plan) for walk helpers — empty if open. */
  planRing: Vec2[]
}

/**
 * Tessellate a loft into a triangle mesh. Positions are world metres (x,y,z)
 * with y up. Remains parametric: call again after editing rail/profiles.
 */
export function tessellateLoft(loft: EcoLoft): LoftMeshData {
  const railLen = polylineLength2(loft.rail)
  const along =
    loft.alongSegments > 0
      ? loft.alongSegments
      : Math.max(8, Math.ceil(railLen / 0.5))
  const positions: number[] = []
  const rows: Vec3[][] = []

  for (let i = 0; i <= along; i++) {
    const t = i / along
    const frame = pointAlong2(loft.rail, t)
    const y0 = yAlong(loft.rail, loft.railY, t)
    const rightX = -frame.tz
    const rightZ = frame.tx
    let profile = interpolateProfile(loft.profiles, t)
    if (loft.acrossSegments > 0) {
      profile = resampleProfile(profile, loft.acrossSegments)
    }
    const row: Vec3[] = []
    for (const [r, u] of profile) {
      const x = frame.x + rightX * r
      const z = frame.z + rightZ * r
      const y = y0 + u
      row.push([x, y, z])
      positions.push(x, y, z)
    }
    rows.push(row)
  }

  const cols = rows[0]?.length ?? 0
  const indices: number[] = []
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i = r * cols + c
      indices.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1)
    }
  }

  // Plan ring from first and last profile extremities (open loft — empty)
  const planRing: Vec2[] = []

  return { positions, indices, planRing }
}

/** Default leaf-section loft: three profiles (tip / mid / tip) along a 26 m spine. */
export function makeDefaultLeafLoft(id = `loft-${Date.now()}`): EcoLoft {
  const halfL = 13
  const arch = (w: number, h: number): Vec2[] => {
    const pts: Vec2[] = []
    const n = 16
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI
      pts.push([Math.cos(a) * w, Math.sin(a) * h])
    }
    return pts
  }
  return {
    id,
    name: 'Leaf loft',
    rail: [
      [-halfL, 0],
      [0, 0.1],
      [halfL, 0],
    ],
    railY: [3, 3, 3],
    profiles: [
      { t: 0, points: arch(0.4, 0.2) },
      { t: 0.5, points: arch(6.5, 6.8) },
      { t: 1, points: arch(0.4, 0.2) },
    ],
    thickness: 0.12,
    alongSegments: 32,
    acrossSegments: 0,
  }
}
