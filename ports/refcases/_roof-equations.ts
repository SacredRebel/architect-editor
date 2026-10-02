// The port note's equations for the roof container (entry 5), written out as code. Nothing here
// calls the old editor: the reference cases hold these against it. The numbers in brackets are
// the entry's equations. A wall's chord, arc and top are entry 1's (_wall-equations.ts).
import { arcOf, type P, type Plain, placeOn, topOf } from './_wall-equations'

export type V3 = [number, number, number] // (u, height, v)
export type Roof = { P: readonly number[]; rho: number } // position (u, height, v), turn
export type Seg = { s: readonly number[]; sigma: number; w: number; d: number; cone?: boolean }
export type Box = { minU: number; maxU: number; minV: number; maxV: number }

// (1) the roof's own frame, into the level
export function roofToLevel(roof: Roof, a: number, b: number, h = 0): V3 {
  const c = Math.cos(roof.rho)
  const s = Math.sin(roof.rho)
  return [roof.P[0]! + a * c + b * s, roof.P[1]! + h, roof.P[2]! - a * s + b * c]
}

// (2) a segment's own frame, into the roof and into the level
export function segToRoof(seg: Seg, x: number, z: number, k = 0): V3 {
  const c = Math.cos(seg.sigma)
  const s = Math.sin(seg.sigma)
  return [seg.s[0]! + x * c + z * s, seg.s[1]! + k, seg.s[2]! - x * s + z * c]
}

export function segToLevel(roof: Roof, seg: Seg, x: number, z: number, k = 0): V3 {
  const [a, h, b] = segToRoof(seg, x, z, k)
  return roofToLevel(roof, a, b, h)
}

// (3) back: from the level into the roof, from the roof into a segment
export function levelToRoof(roof: Roof, u: number, v: number): [number, number] {
  const c = Math.cos(roof.rho)
  const s = Math.sin(roof.rho)
  const du = u - roof.P[0]!
  const dv = v - roof.P[2]!
  return [du * c - dv * s, du * s + dv * c]
}

export function roofToSeg(seg: Seg, a: number, b: number): [number, number] {
  const c = Math.cos(seg.sigma)
  const s = Math.sin(seg.sigma)
  const da = a - seg.s[0]!
  const db = b - seg.s[2]!
  return [da * c - db * s, da * s + db * c]
}

export function levelToSeg(roof: Roof, seg: Seg, u: number, v: number): [number, number] {
  const [a, b] = levelToRoof(roof, u, v)
  return roofToSeg(seg, a, b)
}

// (4) the floors of one building's levels, each in the place its level has in the list
export type Level = { ordinal: number; height?: number; offset?: number }

export function floorsOf(levels: Level[]): number[] {
  const order = levels.map((_, index) => index).sort((i, j) => levels[i]!.ordinal - levels[j]!.ordinal)
  const floors = levels.map(() => 0)
  let next = 0
  for (const index of order) {
    floors[index] = next + (levels[index]!.offset ?? 0)
    next = floors[index]! + (levels[index]!.height ?? 2.5)
  }
  return floors
}

export function levelAbove(levels: Level[], index: number): number {
  let found = -1
  levels.forEach((level, i) => {
    if (level.ordinal > levels[index]!.ordinal && (found < 0 || level.ordinal < levels[found]!.ordinal)) found = i
  })
  return found
}

export function levelBelow(levels: Level[], index: number): number {
  let found = -1
  levels.forEach((level, i) => {
    if (level.ordinal < levels[index]!.ordinal && (found < 0 || level.ordinal > levels[found]!.ordinal)) found = i
  })
  return found
}

// (6) which walls count: a wall's centreline and its two faces against a rectangle
function signedArea(polygon: P[]): number {
  let twice = 0
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!
    twice += a.x * b.y - b.x * a.y
  })
  return twice / 2
}

// how far a point lies inside edge i of a convex polygon (negative: outside)
function depthAt(polygon: P[], i: number, p: P, turn: number): number {
  const a = polygon[i]!
  const b = polygon[(i + 1) % polygon.length]!
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  return (turn * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x))) / length
}

// the length of a line that lies in a convex polygon; a stretch along an edge (within 1e-4) is in
export function lengthInside(line: P[], polygon: P[]): number {
  const turn = Math.sign(signedArea(polygon))
  let total = 0
  for (let n = 1; n < line.length; n += 1) {
    const a = line[n - 1]!
    const b = line[n]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length < 1e-9) continue
    let t0 = 0
    let t1 = 1
    for (let i = 0; i < polygon.length; i += 1) {
      const da = depthAt(polygon, i, a, turn)
      const db = depthAt(polygon, i, b, turn)
      if (da >= -1e-4 && db >= -1e-4) continue
      if (da < 0 && db < 0) {
        t1 = t0
        break
      }
      const cross = da / (da - db)
      if (da < 0) t0 = Math.max(t0, cross)
      else t1 = Math.min(t1, cross)
    }
    if (t1 > t0) total += (t1 - t0) * length
  }
  return total
}

export function wallLines(wall: Plain): P[][] {
  const h = Math.max(wall.thickness / 2, 0)
  const stations = arcOf(wall) ? 16 : 1
  const centre: P[] = []
  const left: P[] = []
  const right: P[] = []
  for (let i = 0; i <= stations; i += 1) {
    const here = placeOn(wall, i / stations)
    centre.push(here.P)
    left.push({ x: here.P.x + here.N.x * h, y: here.P.y + here.N.y * h })
    right.push({ x: here.P.x - here.N.x * h, y: here.P.y - here.N.y * h })
  }
  return h > 0 ? [centre, left, right] : [centre]
}

export function wallCounts(wall: Plain, polygon: P[]): boolean {
  const lines = wallLines(wall)
  let centreLength = 0
  for (let n = 1; n < lines[0]!.length; n += 1) {
    centreLength += Math.hypot(lines[0]![n]!.x - lines[0]![n - 1]!.x, lines[0]![n]!.y - lines[0]![n - 1]!.y)
  }
  if (centreLength < 1e-9) return false
  const overlap = Math.max(...lines.map((line) => lengthInside(line, polygon)))
  return overlap >= Math.max(0.001, Math.min(0.05, centreLength * 0.5))
}

// (5) the plane a wall reaches, its top seen from the roof's level, and the base of a roof that
// follows its walls. b is the height the wall stands at (entry 9), handed in; a deck is a slab
// of the level above (its top and its thickness, 0.05 each when absent).
export type WallIn = Plain & { level: number; g?: number; b?: number; onGround?: boolean }
export type Deck = { level: number; polygon: P[]; elevation?: number; thickness?: number }
export type RoofOnLevel = Roof & { level: number; segs: Seg[] }

export function wallPlane(levels: Level[], wall: WallIn, decks: Deck[] = []): number {
  const floors = floorsOf(levels)
  const up = levelAbove(levels, wall.level)
  const floorToFloor = up >= 0 ? floors[up]! - floors[wall.level]! : (levels[wall.level]!.height ?? 2.5)
  let H = floorToFloor
  for (const deck of decks) {
    if (deck.level !== up) continue
    const underside = floorToFloor + (deck.elevation ?? 0.05) - (deck.thickness ?? 0.05)
    if (underside < H && wallCounts(wall, deck.polygon)) H = underside
  }
  return H
}

export function wallTopFor(levels: Level[], wall: WallIn, roofLevel: number, decks: Deck[] = []): number {
  const floors = floorsOf(levels)
  const top = topOf(wallPlane(levels, wall, decks), wall.b ?? 0, wall.g, wall.onGround ?? false)
  return floors[wall.level]! + top - floors[roofLevel]!
}

export function baseOnWalls(
  levels: Level[],
  roof: RoofOnLevel,
  walls: WallIn[],
  decks: Deck[] = [],
  roomWalls: WallIn[] = [],
): number {
  const down = levelBelow(levels, roof.level)
  const near = walls.filter((wall) => wall.level === roof.level || wall.level === down)
  const cones = roof.segs.filter((seg) => seg.cone)
  let counted: WallIn[]
  if (cones.length > 0) {
    counted = near.filter((wall) => {
      const arc = arcOf(wall)
      if (!arc) return false
      return cones.some((seg) => {
        const [u, , v] = roofToLevel(roof, seg.s[0]!, seg.s[2]!)
        return Math.hypot(arc.C.x - u, arc.C.y - v) <= 1e-4 && Math.abs(arc.R - seg.w / 2) <= 1e-4
      })
    })
  } else if (roof.segs.length > 0) {
    const rectangles = roof.segs.map((seg) => cornersOf(roof, seg, 0))
    counted = near.filter((wall) => rectangles.some((rectangle) => wallCounts(wall, rectangle)))
  } else {
    // no segment: the walls of the room the roof's own point lies in (room detection, handed in)
    counted = roomWalls
  }
  if (counted.length === 0) return roof.P[1]!
  return Math.max(...counted.map((wall) => wallTopFor(levels, wall, roof.level, decks)))
}

// (7) a roof that follows its walls: let go by a move in height, and when its height is rewritten
export function supportAfterMove(support: string, oldHeight: number, newHeight: number): string {
  return support === 'walls' && Math.abs(newHeight - oldHeight) > 1e-4 ? 'level' : support
}

export function heightAfterChange(stored: number, resolved: number): number {
  return Math.abs(stored - resolved) <= 1e-4 ? stored : resolved
}

// (8) the plan outline: a segment's four corners in the level, sides not under `least`
export function cornersOf(roof: Roof, seg: Seg, least = 0.01): P[] {
  const hw = Math.max(seg.w, least) / 2
  const hd = Math.max(seg.d, least) / 2
  const local: Array<[number, number]> = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ]
  return local.map(([x, z]) => {
    const [u, , v] = segToLevel(roof, seg, x, z)
    return { x: u, y: v }
  })
}

// (9) the box round a roof's segments: sides not under 0 for the overlap box, 1 for the alignment box
export function boxOf(roof: Roof, segs: Seg[], least = 0): Box {
  const all = segs.flatMap((seg) => cornersOf(roof, seg, least))
  return {
    minU: Math.min(...all.map((p) => p.x)),
    maxU: Math.max(...all.map((p) => p.x)),
    minV: Math.min(...all.map((p) => p.y)),
    maxV: Math.max(...all.map((p) => p.y)),
  }
}

function within(p: P, polygon: P[]): boolean {
  const turn = Math.sign(signedArea(polygon))
  return polygon.every((_, i) => depthAt(polygon, i, p, turn) > 1e-9)
}

function crossings(A: P[], B: P[]): P[] {
  const found: P[] = []
  for (let i = 0; i < A.length; i += 1) {
    const a0 = A[i]!
    const a1 = A[(i + 1) % A.length]!
    for (let j = 0; j < B.length; j += 1) {
      const b0 = B[j]!
      const b1 = B[(j + 1) % B.length]!
      const det = (a1.x - a0.x) * (b1.y - b0.y) - (a1.y - a0.y) * (b1.x - b0.x)
      if (Math.abs(det) < 1e-12) continue
      const t = ((b0.x - a0.x) * (b1.y - b0.y) - (b0.y - a0.y) * (b1.x - b0.x)) / det
      const q = ((b0.x - a0.x) * (a1.y - a0.y) - (b0.y - a0.y) * (a1.x - a0.x)) / det
      if (t > 1e-9 && t < 1 - 1e-9 && q > 1e-9 && q < 1 - 1e-9) {
        found.push({ x: a0.x + (a1.x - a0.x) * t, y: a0.y + (a1.y - a0.y) * t })
      }
    }
  }
  return found
}

export function sorted(points: P[]): P[] {
  const key = (value: number) => Math.round(value * 1e6)
  return [...points].sort((a, b) => key(a.x) - key(b.x) || key(a.y) - key(b.y))
}

// (8) the corners of the outline of two convex shapes whose edges cross
export function unionCorners(A: P[], B: P[]): P[] {
  return sorted([...A.filter((p) => !within(p, B)), ...B.filter((p) => !within(p, A)), ...crossings(A, B)])
}

// the corners of what is left of a convex shape when another convex shape is taken out of it
export function cutCorners(subject: P[], cutter: P[]): P[] {
  return sorted([
    ...subject.filter((p) => !within(p, cutter)),
    ...cutter.filter((p) => within(p, subject)),
    ...crossings(subject, cutter),
  ])
}

// the part two convex shapes share
export function shared(A: P[], B: P[]): P[] {
  const turn = Math.sign(signedArea(B))
  let out = [...A]
  for (let i = 0; i < B.length && out.length > 0; i += 1) {
    const input = out
    out = []
    for (let n = 0; n < input.length; n += 1) {
      const a = input[n]!
      const b = input[(n + 1) % input.length]!
      const da = depthAt(B, i, a, turn)
      const db = depthAt(B, i, b, turn)
      if (da >= 0) out.push(a)
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
        const t = da / (da - db)
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      }
    }
  }
  return out
}

export function areaOf(polygon: P[]): number {
  return Math.abs(signedArea(polygon))
}

export function unionArea(A: P[], B: P[]): number {
  return areaOf(A) + areaOf(B) - areaOf(shared(A, B))
}

// (10) how far the eaves reach past the segment's rectangle
export function eavesReach(type: string, pitchDeg: number, wallThickness = 0.1, overhang = 0.3, shingle = 0.05) {
  const flat = type === 'flat' || !(pitchDeg > 0)
  const theta = (pitchDeg * Math.PI) / 180
  const e = Math.max(0, wallThickness) / 2 + Math.max(0, overhang) * (flat ? 1 : Math.cos(theta))
  const g = flat ? 0 : Math.max(0, shingle) * Math.sin(theta)
  const allRound = type === 'hip' || type === 'conical' || type === 'mansard' || type === 'dutch'
  const twoSides = type === 'gable' || type === 'gambrel'
  return {
    x: e + (allRound ? g : 0),
    front: e + (allRound || twoSides || (type === 'shed' && !flat) ? g : 0),
    back: e + (allRound || twoSides ? g : 0),
  }
}

// (11), (13), (14) what the tool takes a roof's footprint from: the conical type has no choice
export function footprintFrom(type: string, chosen: string): 'draw' | 'room' | 'walls' {
  if (type === 'conical') return 'walls'
  return chosen === 'room' ? 'room' : 'draw'
}

// (11) a wall the draw tool offers as a guide for its clicks: straight, and along u or along v
export function isGuide(wall: Plain): boolean {
  if (arcOf(wall)) return false
  return Math.abs(wall.E.x - wall.S.x) <= 1e-4 || Math.abs(wall.E.y - wall.S.y) <= 1e-4
}

// (11) the draw tool; (12) uses the same sizes and takes the centre through (3)
export function drawn(c1: P, c2: P, quarter = false, presetTurn = 0) {
  const W = Math.max(Math.abs(c2.x - c1.x), 1)
  const D = Math.max(Math.abs(c2.y - c1.y), 1)
  return {
    centre: { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 },
    W,
    D,
    w: quarter ? D : W,
    d: quarter ? W : D,
    sigma: -presetTurn + (quarter ? Math.PI / 2 : 0),
  }
}

// (13) the room tool: the smallest box that lies along one of the room's edges
export function fitOf(polygon: P[]) {
  let best: { centre: P; W: number; D: number; rho: number; area: number } | undefined
  for (let i = 0; i < polygon.length; i += 1) {
    const p = polygon[i]!
    const q = polygon[(i + 1) % polygon.length]!
    const alpha = Math.atan2(q.y - p.y, q.x - p.x)
    const c = Math.cos(alpha)
    const s = Math.sin(alpha)
    const xs = polygon.map((r) => r.x * c + r.y * s)
    const zs = polygon.map((r) => -r.x * s + r.y * c)
    const W = Math.max(...xs) - Math.min(...xs)
    const D = Math.max(...zs) - Math.min(...zs)
    const area = W * D
    if (area <= 0 || (best && best.area <= area)) continue
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2
    best = { centre: { x: cx * c - cz * s, y: cx * s + cz * c }, W, D, rho: -alpha, area }
  }
  return best ? { ...best, rectangular: areaOf(polygon) / best.area >= 0.96 } : null
}

// (15) a cone drawn as a circle: on the level, or on a roof that carries all of it
export type Host = { roof: Roof; seg: Seg; wallHeight: number; pitchDeg: number }

// the top of a gable segment over its own point z (entry 6 has every roof shape)
export function gableTop(host: Host, z: number): number {
  return host.wallHeight + (host.seg.d / 2 - Math.abs(z)) * Math.tan((host.pitchDeg * Math.PI) / 180)
}

export function coneOn(hosts: Host[], c: P, r: number, curb: number, mode: 'auto' | 'ground' | 'roof') {
  const onLevel = { kind: 'level' as const, P: [c.x, 0, c.y] as V3, wall: Math.max(0, curb) }
  if (mode === 'ground') return onLevel
  const rim: P[] = []
  if (r <= 1e-6) rim.push(c)
  else {
    for (let i = 0; i < 32; i += 1) {
      const angle = (i / 32) * Math.PI * 2
      rim.push({ x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r })
    }
  }
  const samples = [...rim]
  if (r > 1e-6) {
    for (let j = 0; j <= 8; j += 1) {
      const z = -r + (j / 8) * r * 2
      for (let i = 0; i <= 8; i += 1) {
        const x = -r + (i / 8) * r * 2
        if (x * x + z * z <= r * r + 1e-6) samples.push({ x: c.x + x, y: c.y + z })
      }
    }
  }
  let best: { host: Host; low: number; high: number } | undefined
  for (const host of hosts) {
    const carried = rim.every((p) => {
      const [x, z] = levelToSeg(host.roof, host.seg, p.x, p.y)
      return Math.abs(x) <= host.seg.w / 2 + 1e-6 && Math.abs(z) <= host.seg.d / 2 + 1e-6
    })
    if (!carried) continue
    let low = Number.POSITIVE_INFINITY
    let high = Number.NEGATIVE_INFINITY
    for (const p of samples) {
      const [, z] = levelToSeg(host.roof, host.seg, p.x, p.y)
      const y = host.roof.P[1]! + host.seg.s[1]! + gableTop(host, z)
      low = Math.min(low, y)
      high = Math.max(high, y)
    }
    if (best && best.high >= high) continue
    best = { host, low, high }
  }
  if (!best) return mode === 'roof' ? { kind: 'none' as const } : onLevel
  const base = best.low - 0.1
  return {
    kind: 'roof' as const,
    P: [c.x, base, c.y] as V3,
    wall: best.high - base + Math.max(0, curb),
    local: levelToSeg(best.host.roof, best.host.seg, c.x, c.y),
    curb: Math.max(0, curb),
    host: best.host,
  }
}

// the same over the whole disc instead of its samples (a gable host)
export function coneOnExact(host: Host, c: P, r: number, curb: number) {
  const [, z] = levelToSeg(host.roof, host.seg, c.x, c.y)
  const lift = host.roof.P[1]! + host.seg.s[1]!
  const low = lift + gableTop(host, Math.abs(z) + r)
  const high = lift + gableTop(host, Math.max(0, Math.abs(z) - r))
  return { base: low - 0.1, wall: high - (low - 0.1) + Math.max(0, curb) }
}

// (14) a cone on a bent wall
export function coneOnWall(wall: Plain, top: number) {
  const arc = arcOf(wall)
  if (!arc) return null
  return { P: [arc.C.x, top, arc.C.y] as V3, w: 2 * arc.R, start: arc.theta0, sweep: arc.delta }
}

// (16) do two roofs' boxes overlap
export function boxesOverlap(a: Box, b: Box): boolean {
  return !(a.maxU < b.minU - 1e-6 || b.maxU < a.minU - 1e-6 || a.maxV < b.minV - 1e-6 || b.maxV < a.minV - 1e-6)
}

// (17) which of two segments owns the place where they overlap
export type Owner = { roofId: string; segId: string; w: number; d: number; onRoofId?: string; onSegId?: string }

function standsOn(one: Owner, other: Owner): boolean {
  return one.onRoofId === other.roofId || one.onSegId === other.segId
}

export function owns(candidate: Owner, current: Owner): boolean {
  if (standsOn(candidate, current)) return false
  if (standsOn(current, candidate)) return true
  const mine = candidate.w * candidate.d
  const theirs = current.w * current.d
  if (mine > theirs + 1e-6) return true
  if (Math.abs(mine - theirs) > 1e-6) return false
  if (candidate.roofId !== current.roofId) return candidate.roofId < current.roofId
  return candidate.segId < current.segId
}

export function ownsInPlan(candidate: Owner, current: Owner): boolean {
  if (standsOn(candidate, current)) return true
  if (standsOn(current, candidate)) return false
  return owns(candidate, current)
}
