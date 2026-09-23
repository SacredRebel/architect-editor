/**
 * H15 — organic building plan: perimeter → wall ring + shell roof + quantities.
 * Shell loft reuses the eco-shell height curve: eaves + rise·(1 − ρ^2.2).
 */

import { cleanSpec, type OrganicSpec } from './eco-organic-spec'
import {
  offsetPolyline,
  sampleSmoothWall,
  simplifyPolyline,
  type EcoSmoothWall,
  type SmoothWallOpening,
  type Vec2,
} from './eco-smooth-wall'

export type OrganicQuantities = {
  floor_m2: number
  floor_sqft: number
  wall_length_m: number
  wall_gross_m2: number
  wall_net_m2: number
  infill_m3: number
  glazing_m2: number
  roof_plan_m2: number
  roof_surface_m2: number
  insulation_m3: number
  frame_kg: number
  panels: number
  kWp: number
  kWh_year: number
}

export type OrganicOpening = SmoothWallOpening & { bearing_deg: number }

export type OrganicPlan = {
  id: string
  name: string
  spec: OrganicSpec
  /** Drawn / fitted perimeter (closed). */
  perimeter: Vec2[]
  /** Wall centerline controls (~40 pts, closed, smooth). */
  wallControls: Vec2[]
  wall: EcoSmoothWall
  openings: OrganicOpening[]
  /** Floor ring (inside wall). */
  floorRing: Vec2[]
  /** Eave outline (wall + overhang). */
  eaveRing: Vec2[]
  /** Pole of inaccessibility (plan). */
  pole: Vec2
  quantities: OrganicQuantities
  /** Storeys for ANSI / target area (default 1). */
  floors: number
}

const M2_TO_SQFT = 10.76391041671
const PANEL_M2 = 1.7
const PANEL_KWP = 0.4
const KWH_PER_KWP = 1650

function ringArea(ring: Vec2[]): number {
  if (ring.length < 3) return 0
  let a = 0
  const n = ring.length - (Math.hypot(ring[0]![0] - ring[ring.length - 1]![0], ring[0]![1] - ring[ring.length - 1]![1]) < 1e-6 ? 1 : 0)
  for (let i = 0; i < n; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % n]!
    a += p[0] * q[1] - q[0] * p[1]
  }
  return Math.abs(a) / 2
}

function ringCentroid(ring: Vec2[]): Vec2 {
  let x = 0
  let z = 0
  let n = 0
  for (const p of ring) {
    x += p[0]
    z += p[1]
    n++
  }
  return n ? [x / n, z / n] : [0, 0]
}

function closeRing(pts: Vec2[]): Vec2[] {
  if (pts.length < 3) return pts.slice()
  const a = pts[0]!
  const b = pts[pts.length - 1]!
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) return pts.slice()
  return [...pts, a]
}

function rotate(p: Vec2, deg: number, c: Vec2): Vec2 {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const dx = p[0] - c[0]
  const dz = p[1] - c[1]
  return [c[0] + dx * cos - dz * sin, c[1] + dx * sin + dz * cos]
}

function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax
  const abz = bz - az
  const len2 = abx * abx + abz * abz
  if (len2 < 1e-12) return Math.hypot(px - ax, pz - az)
  let u = ((px - ax) * abx + (pz - az) * abz) / len2
  u = Math.max(0, Math.min(1, u))
  return Math.hypot(px - (ax + abx * u), pz - (az + abz * u))
}

function distToRing(px: number, pz: number, ring: Vec2[]): number {
  let best = Infinity
  for (let i = 0; i < ring.length - 1; i++) {
    const d = distToSeg(px, pz, ring[i]![0], ring[i]![1], ring[i + 1]![0], ring[i + 1]![1])
    if (d < best) best = d
  }
  return best
}

function pointInRing(px: number, pz: number, ring: Vec2[]): boolean {
  let inside = false
  const n = ring.length - (Math.hypot(ring[0]![0] - ring[ring.length - 1]![0], ring[0]![1] - ring[ring.length - 1]![1]) < 1e-6 ? 1 : 0)
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i]![0]
    const zi = ring[i]![1]
    const xj = ring[j]![0]
    const zj = ring[j]![1]
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Grid-search pole of inaccessibility (furthest inside point from wall). */
export function poleOfInaccessibility(ring: Vec2[], grid = 24): Vec2 {
  const closed = closeRing(ring)
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of closed) {
    minX = Math.min(minX, p[0])
    maxX = Math.max(maxX, p[0])
    minZ = Math.min(minZ, p[1])
    maxZ = Math.max(maxZ, p[1])
  }
  let best: Vec2 = ringCentroid(closed)
  let bestD = -1
  for (let i = 0; i <= grid; i++) {
    for (let j = 0; j <= grid; j++) {
      const x = minX + ((maxX - minX) * i) / grid
      const z = minZ + ((maxZ - minZ) * j) / grid
      if (!pointInRing(x, z, closed)) continue
      const d = distToRing(x, z, closed)
      if (d > bestD) {
        bestD = d
        best = [x, z]
      }
    }
  }
  return best
}

/** Shell height at plan point: eaves + rise·(1 − ρ^2.2). */
export function organicShellHeight(
  pole: Vec2,
  wallRing: Vec2[],
  x: number,
  z: number,
  eaves: number,
  rise: number,
): number {
  const closed = closeRing(wallRing)
  const dx = x - pole[0]
  const dz = z - pole[1]
  const r = Math.hypot(dx, dz)
  if (r < 1e-6) return eaves + rise
  const ux = dx / r
  const uz = dz / r
  // Ray from pole through (x,z) to wall
  let wallR = r
  let hit = false
  for (let i = 0; i < closed.length - 1; i++) {
    const ax = closed[i]![0]
    const az = closed[i]![1]
    const bx = closed[i + 1]![0]
    const bz = closed[i + 1]![1]
    const ex = bx - ax
    const ez = bz - az
    const denom = ux * ez - uz * ex
    if (Math.abs(denom) < 1e-9) continue
    const fx = ax - pole[0]
    const fz = az - pole[1]
    const t = (fx * ez - fz * ex) / denom
    const u = (fx * uz - fz * ux) / denom
    if (t > 1e-4 && u >= 0 && u <= 1) {
      if (!hit || t < wallR) {
        wallR = t
        hit = true
      }
    }
  }
  if (!hit) wallR = Math.max(r, 1)
  const rho = Math.min(1.5, r / wallR)
  if (rho <= 1) return eaves + rise * (1 - rho ** 2.2)
  // Past wall: droop into eave overhang
  const past = Math.min(1, rho - 1)
  return eaves - past * rise * 0.15
}

function bboxPerimeter(cx: number, cz: number, halfW: number, halfD: number, n = 32): Vec2[] {
  const pts: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    // Squircle-ish toward rectangle corners via higher powers for oval base
    const c = Math.cos(t)
    const s = Math.sin(t)
    pts.push([cx + halfW * c, cz + halfD * s])
  }
  return closeRing(pts)
}

function lobedPerimeter(
  cx: number,
  cz: number,
  radius: number,
  lobes: number,
  depth: number,
  turnDeg: number,
  n = 48,
): Vec2[] {
  const pts: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2
    const r = radius * (1 - depth * 0.5 + depth * 0.5 * Math.cos(ang * lobes))
    pts.push(rotate([cx + r * Math.cos(ang), cz + r * Math.sin(ang)], turnDeg, [cx, cz]))
  }
  return closeRing(pts)
}

function leafPerimeter(cx: number, cz: number, len: number, width: number, turnDeg: number, n = 40): Vec2[] {
  const pts: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const t = i / n
    const ang = t * Math.PI * 2
    // Tear / leaf: longer along +x
    const rx = (len / 2) * (0.55 + 0.45 * Math.cos(ang))
    const rz = (width / 2) * Math.sin(ang) * (0.7 + 0.3 * Math.cos(ang))
    pts.push(rotate([cx + rx * Math.cos(0) - rz * 0 + (len / 4) * (Math.cos(ang) > 0 ? 0 : 0), cz + rz], turnDeg, [cx, cz]))
    // simpler parametric leaf
  }
  // Rebuild clean leaf
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    const x = (len / 2) * Math.cos(t)
    const z = (width / 2) * Math.sin(t) * (1 - 0.35 * Math.cos(t))
    out.push(rotate([cx + x, cz + z], turnDeg, [cx, cz]))
  }
  return closeRing(out)
}

function shellPerimeter(cx: number, cz: number, radius: number, depth: number, turnDeg: number, n = 48): Vec2[] {
  // Nautilus-ish spiral closed by connecting end
  const pts: Vec2[] = []
  const turns = 1.15 + depth
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const ang = u * Math.PI * 2 * turns
    const r = radius * (0.25 + 0.75 * u)
    pts.push(rotate([cx + r * Math.cos(ang), cz + r * Math.sin(ang)], turnDeg, [cx, cz]))
  }
  return closeRing(simplifyPolyline(pts, 0.15))
}

function insetRing(ring: Vec2[], inset: number): Vec2[] {
  if (inset <= 0) return closeRing(ring)
  const closed = closeRing(ring)
  const c = ringCentroid(closed)
  return closeRing(
    closed.slice(0, -1).map(([x, z]) => {
      const dx = x - c[0]
      const dz = z - c[1]
      const len = Math.hypot(dx, dz) || 1
      const s = Math.max(0.05, (len - inset) / len)
      return [c[0] + dx * s, c[1] + dz * s] as Vec2
    }),
  )
}

function bearingOf(from: Vec2, to: Vec2): number {
  // 0 = north (+z editor), 90 = east (+x), 180 = south — match compass: 180 south
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  let deg = (Math.atan2(dx, dz) * 180) / Math.PI
  if (deg < 0) deg += 360
  return deg
}

function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 360
  if (d > 180) d = 360 - d
  return d
}

function structureKgPerM(structure: OrganicSpec['structure']): number {
  switch (structure) {
    case 'steel':
      return 18
    case 'bamboo':
      return 6
    case 'timber':
      return 10
    default:
      return 0
  }
}

function insulationThick(ins: OrganicSpec['insulation']): number {
  return ins === 'none' ? 0 : 0.1
}

/**
 * Solar panel spots on roof facets facing the sun and shallower than 42°.
 */
export function solarSpots(
  pole: Vec2,
  wallRing: Vec2[],
  eaves: number,
  rise: number,
  facingDeg: number,
  ratio: number,
  sample = 10,
): { x: number; y: number; z: number; tilt_deg: number }[] {
  if (ratio <= 0) return []
  const closed = closeRing(wallRing)
  const spots: { x: number; y: number; z: number; tilt_deg: number; score: number }[] = []
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of closed) {
    minX = Math.min(minX, p[0])
    maxX = Math.max(maxX, p[0])
    minZ = Math.min(minZ, p[1])
    maxZ = Math.max(maxZ, p[1])
  }
  for (let i = 0; i <= sample; i++) {
    for (let j = 0; j <= sample; j++) {
      const x = minX + ((maxX - minX) * i) / sample
      const z = minZ + ((maxZ - minZ) * j) / sample
      if (!pointInRing(x, z, closed)) continue
      const y = organicShellHeight(pole, wallRing, x, z, eaves, rise)
      const yE = organicShellHeight(pole, wallRing, x + 0.3, z, eaves, rise)
      const yN = organicShellHeight(pole, wallRing, x, z + 0.3, eaves, rise)
      const nx = y - yE
      const nz = y - yN
      const ny = 0.3
      const nlen = Math.hypot(nx, ny, nz) || 1
      const tilt = (Math.acos(Math.max(-1, Math.min(1, ny / nlen))) * 180) / Math.PI
      if (tilt >= 42) continue
      const face = bearingOf(pole, [x, z])
      const align = 1 - angleDiff(face, facingDeg) / 180
      if (align < 0.35) continue
      spots.push({ x, y, z, tilt_deg: tilt, score: align * (42 - tilt) })
    }
  }
  spots.sort((a, b) => b.score - a.score)
  const keep = Math.max(0, Math.floor(spots.length * ratio))
  return spots.slice(0, keep).map(({ x, y, z, tilt_deg }) => ({ x, y, z, tilt_deg }))
}

export function defaultPerimeterForSpec(spec: OrganicSpec, centre: Vec2 = [0, 0], radius = 8): Vec2[] {
  const s = cleanSpec(spec)
  switch (s.form) {
    case 'oval':
      return bboxPerimeter(centre[0], centre[1], radius * 1.2, radius * 0.75, 36)
    case 'leaf':
      return leafPerimeter(centre[0], centre[1], radius * 2.2, radius * 1.1, s.turn)
    case 'shell':
      return shellPerimeter(centre[0], centre[1], radius, s.depth, s.turn)
    case 'fit':
      return bboxPerimeter(centre[0], centre[1], radius, radius, 40)
    case 'lobed':
    default:
      return lobedPerimeter(centre[0], centre[1], radius, s.lobes, s.depth, s.turn)
  }
}

export function organicPlan(options: {
  id?: string
  name?: string
  spec: Partial<OrganicSpec>
  perimeter?: Vec2[]
  floors?: number
  targetGrossSqft?: number
}): OrganicPlan {
  let spec = cleanSpec(options.spec)
  let perimeter = options.perimeter?.length
    ? closeRing(simplifyPolyline(options.perimeter, 0.1))
    : defaultPerimeterForSpec(spec)

  // Target gross: scale about centre until gross within 1 sq ft
  const floors = Math.max(1, options.floors ?? 1)
  if (options.targetGrossSqft && options.targetGrossSqft > 0) {
    const c = ringCentroid(perimeter)
    for (let iter = 0; iter < 12; iter++) {
      const trial = buildPlan(options.id, options.name, spec, perimeter, floors)
      const grossSqft = trial.quantities.floor_sqft * floors
      const err = options.targetGrossSqft - grossSqft
      if (Math.abs(err) <= 1) break
      const scale = Math.sqrt(options.targetGrossSqft / Math.max(1, grossSqft))
      perimeter = closeRing(
        perimeter.slice(0, -1).map(([x, z]) => [c[0] + (x - c[0]) * scale, c[1] + (z - c[1]) * scale] as Vec2),
      )
    }
  }

  return buildPlan(options.id, options.name, spec, perimeter, floors)
}

function buildPlan(
  id: string | undefined,
  name: string | undefined,
  spec: OrganicSpec,
  perimeter: Vec2[],
  floors: number,
): OrganicPlan {
  const wallRing = insetRing(perimeter, spec.inset + spec.overhang)
  // Resample to ~40 control points via smooth sample of the ring as a closed wall
  const seedWall: EcoSmoothWall = {
    id: 'tmp',
    name: 'tmp',
    controls: wallRing.slice(0, -1),
    closed: true,
    thickness: spec.thick,
    height: spec.height,
    openings: [],
  }
  const sampled = sampleSmoothWall(seedWall, Math.max(0.4, smoothApproxStep(wallRing)))
  const controls = simplifyPolyline(sampled.slice(0, -1), 0.08)
  // Ensure ~40 pts
  const wallControls =
    controls.length >= 36
      ? controls
      : sampleSmoothWall({ ...seedWall, controls }, 0.35).slice(0, -1)

  const pole = poleOfInaccessibility(wallControls)
  const floorRing = offsetPolyline(closeRing(wallControls), -spec.thick / 2, true)
  const eaveRing = offsetPolyline(closeRing(wallControls), spec.overhang, true)

  const doorOpening: OrganicOpening = {
    id: 'door',
    kind: 'door',
    alongM: 0,
    width: 1.0,
    sillM: 0,
    headM: 2.1,
    bearing_deg: spec.door,
  }
  // Place door by bearing from pole
  const wallLen = polylineLen(closeRing(wallControls))
  doorOpening.alongM = alongForBearing(wallControls, pole, spec.door, wallLen)

  const openings: OrganicOpening[] = [doorOpening]
  // Windows across view-facing arc
  const glazingBudget = Math.max(0, ringArea(floorRing) * 0) // filled below via wall face
  const winCount = Math.max(1, Math.round(3 + spec.glazing * 4))
  for (let i = 0; i < winCount; i++) {
    const bearing = (spec.facing - 40 + (80 * (i + 0.5)) / winCount + 360) % 360
    const along = alongForBearing(wallControls, pole, bearing, wallLen)
    // Skip if too close to door
    if (Math.abs(along - doorOpening.alongM) < 1.5) continue
    openings.push({
      id: `win-${i}`,
      kind: 'window',
      alongM: along,
      width: 1.2,
      sillM: 0.9,
      headM: 2.2,
      bearing_deg: bearing,
    })
  }

  const wall: EcoSmoothWall = {
    id: `${id ?? 'org'}-wall`,
    name: 'Organic wall',
    controls: wallControls,
    closed: true,
    thickness: spec.thick,
    height: spec.height,
    openings: openings.map(({ bearing_deg: _b, ...o }) => o),
    assembly: {
      structure: spec.structure,
      infill: spec.infill,
      insulation: spec.insulation,
    },
  }

  const floor_m2 = ringArea(floorRing)
  const wall_length_m = wallLen
  const wall_gross_m2 = wall_length_m * spec.height
  const glazing_m2 = openings
    .filter((o) => o.kind === 'window')
    .reduce((s, o) => s + o.width * (o.headM - o.sillM), 0)
  const door_m2 = doorOpening.width * doorOpening.headM
  const wall_net_m2 = Math.max(0, wall_gross_m2 - glazing_m2 - door_m2)
  const infill_m3 = wall_net_m2 * spec.thick
  const roof_plan_m2 = ringArea(eaveRing)
  // Surface ≈ plan * factor from rise
  const roof_surface_m2 = roof_plan_m2 * (1 + 0.35 * (spec.rise / Math.max(1, Math.sqrt(roof_plan_m2 / Math.PI))))
  const insulation_m3 = roof_surface_m2 * insulationThick(spec.insulation)
  const frame_kg = wall_length_m * structureKgPerM(spec.structure) * (spec.height / 3)
  const spots = solarSpots(pole, wallControls, spec.height, spec.rise, spec.facing, spec.solar)
  const panels = spots.length || Math.round((roof_surface_m2 * spec.solar) / PANEL_M2)
  const kWp = panels * PANEL_KWP
  void glazingBudget

  const quantities: OrganicQuantities = {
    floor_m2,
    floor_sqft: floor_m2 * M2_TO_SQFT,
    wall_length_m,
    wall_gross_m2,
    wall_net_m2,
    infill_m3,
    glazing_m2,
    roof_plan_m2,
    roof_surface_m2,
    insulation_m3,
    frame_kg,
    panels,
    kWp,
    kWh_year: kWp * KWH_PER_KWP,
  }

  return {
    id: id ?? `organic-${Date.now()}`,
    name: name ?? 'Organic building',
    spec,
    perimeter,
    wallControls,
    wall,
    openings,
    floorRing,
    eaveRing,
    pole,
    quantities,
    floors,
  }
}

function polylineLen(pts: Vec2[]): number {
  let L = 0
  for (let i = 0; i < pts.length - 1; i++) {
    L += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1])
  }
  return L
}

function smoothApproxStep(ring: Vec2[]): number {
  return Math.max(0.35, polylineLen(closeRing(ring)) / 40)
}

function alongForBearing(controls: Vec2[], pole: Vec2, bearing: number, totalLen: number): number {
  const closed = closeRing(controls)
  let bestAlong = 0
  let bestDiff = 999
  let walked = 0
  for (let i = 0; i < closed.length - 1; i++) {
    const a = closed[i]!
    const b = closed[i + 1]!
    const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const br = bearingOf(pole, mid)
    const d = angleDiff(br, bearing)
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (d < bestDiff) {
      bestDiff = d
      bestAlong = walked + seg / 2
    }
    walked += seg
  }
  return Math.min(totalLen, bestAlong)
}

/** Scale an existing plan about its centre to hit target gross sq ft. */
export function scalePlanToGrossSqft(plan: OrganicPlan, targetSqft: number): OrganicPlan {
  return organicPlan({
    id: plan.id,
    name: plan.name,
    spec: plan.spec,
    perimeter: plan.perimeter,
    floors: plan.floors,
    targetGrossSqft: targetSqft,
  })
}
