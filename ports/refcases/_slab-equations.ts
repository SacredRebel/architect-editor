// The port note's equations for the slab (entry 4), written out as code. Nothing here calls the
// old editor: the reference cases hold these against it. A plan point is [u, v] of the note.
import { type Plain, placeOn, sagittaOf } from './_wall-equations'

export type V2 = [number, number]
export type Ring = V2[]
export type Slab = {
  id: string
  polygon: Ring
  holes: Ring[]
  elevation: number
  thickness: number
  recessed: boolean
  rim?: number
}

export function slabOf(node: {
  id: string
  polygon: ReadonlyArray<readonly number[]>
  holes?: ReadonlyArray<ReadonlyArray<readonly number[]>>
  elevation?: number
  thickness?: number
  recessed?: boolean
  recessedRimElevation?: number
}): Slab {
  const ring = (points: ReadonlyArray<readonly number[]>): Ring => points.map((p) => [p[0]!, p[1]!])
  return {
    id: node.id,
    polygon: ring(node.polygon),
    holes: (node.holes ?? []).map(ring),
    elevation: node.elevation ?? 0.05,
    thickness: node.thickness ?? 0.05,
    recessed: node.recessed ?? false,
    rim: node.recessedRimElevation,
  }
}

const dist = (a: V2, b: V2) => Math.hypot(b[0] - a[0], b[1] - a[1])

// ------------------------------------------------------------------ (1) a ring
export function twiceArea(ring: Ring): number {
  let sum = 0
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    sum += a[0] * b[1] - b[0] * a[1]
  }
  return sum
}
export const turnOf = (ring: Ring): 1 | -1 => (twiceArea(ring) >= 0 ? 1 : -1)
export const areaOf = (ring: Ring): number => Math.abs(twiceArea(ring)) / 2
export const positive = (ring: Ring): Ring => (twiceArea(ring) < 0 ? [...ring].reverse() : ring)

// ------------------------------------------------------------------ (2) what is measured
export function perimeterOf(ring: Ring): number {
  if (ring.length < 3) return 0
  let sum = 0
  for (let i = 0; i < ring.length; i += 1) sum += dist(ring[i]!, ring[(i + 1) % ring.length]!)
  return sum
}

export function centroidOf(ring: Ring): V2 | null {
  if (ring.length < 3 || areaOf(ring) <= 1e-9) return null
  const o = ring[0]!
  let total = 0
  let u = 0
  let v = 0
  for (let i = 1; i < ring.length - 1; i += 1) {
    const a = ring[i]!
    const b = ring[i + 1]!
    const w = (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    total += w
    u += ((o[0] + a[0] + b[0]) / 3) * w
    v += ((o[1] + a[1] + b[1]) / 3) * w
  }
  return Math.abs(total) <= 1e-9 ? null : [u / total, v / total]
}

export const measuredArea = (outer: Ring, holes: Ring[]): number =>
  Math.max(0, areaOf(outer) - holes.reduce((sum, hole) => sum + areaOf(hole), 0))

// ------------------------------------------------------------------ (4) the outline as built
const ACROSS = 0.05 // a sibling's edge counts as lying on this edge
const BAND = 0.06 // beyond a wall's half thickness
const ENOUGH = 0.05 // overlap that decides
const SHORTEST = 0.05 // a part of an edge
const TIE = 0.02
const SAME_HEIGHT = 1e-4
const ON_THE_PLANE = 0.01
const CORNER_LIMIT = 10

export const floats = (slab: Slab): boolean => !slab.recessed && slab.elevation - slab.thickness > ON_THE_PLANE

type Segment = [number, number, number, number]
type Candidate = { wall: Plain; segments: Segment[]; h: number }
type Facing = { segment: Segment; elevation: number; inU: number; inV: number }
type Match = { overlap: number; lateral: number; start: number; end: number }
type Part = { start: number; end: number; offset: number; key: string }

function centrelineOf(wall: Plain): Segment[] {
  if (sagittaOf(wall) === 0) return [[wall.S.x, wall.S.y, wall.E.x, wall.E.y]]
  const points = Array.from({ length: 33 }, (_, i) => placeOn(wall, i / 32).P)
  return points.slice(1).map((p, i) => [points[i]!.x, points[i]!.y, p.x, p.y] as Segment)
}

// a segment P→Q held against the edge that starts at A with unit direction d and length l
function clip(
  au: number, av: number, du: number, dv: number, l: number,
  pu: number, pv: number, qu: number, qv: number, tolerance: number,
): Match | null {
  const latP = (pu - au) * dv - (pv - av) * du
  if (Math.abs(latP) > tolerance) return null
  const latQ = (qu - au) * dv - (qv - av) * du
  if (Math.abs(latQ) > tolerance) return null
  const t0 = (pu - au) * du + (pv - av) * dv
  const t1 = (qu - au) * du + (qv - av) * dv
  const low = Math.max(Math.min(t0, t1), 0)
  const high = Math.min(Math.max(t0, t1), l)
  if (high - low <= 0) return null
  const share = Math.abs(t1 - t0) < 1e-12 ? 0.5 : ((low + high) / 2 - t0) / (t1 - t0)
  return { overlap: high - low, lateral: latP + (latQ - latP) * share, start: low, end: high }
}

function wallOn(au: number, av: number, du: number, dv: number, l: number, need: number, walls: Candidate[]) {
  let best: { wall: Plain; h: number; overlap: number; lateral: number } | null = null
  for (const candidate of walls) {
    let overlap = 0
    let weighted = 0
    for (const [pu, pv, qu, qv] of candidate.segments) {
      const match = clip(au, av, du, dv, l, pu, pv, qu, qv, candidate.h + BAND)
      if (!match) continue
      overlap += match.overlap
      weighted += match.lateral * match.overlap
    }
    if (overlap < need) continue
    const lateral = weighted / overlap
    const mine = { wall: candidate.wall, h: candidate.h, overlap, lateral }
    if (!best) {
      best = mine
      continue
    }
    const tie = Math.abs(Math.abs(lateral) - Math.abs(best.lateral)) <= TIE
    if (tie ? overlap > best.overlap : Math.abs(lateral) < Math.abs(best.lateral)) best = mine
  }
  return best
}

function classify(
  a: V2, du: number, dv: number, start: number, end: number, s: number,
  elevation: number, walls: Candidate[], facing: Facing[],
): Part {
  const au = a[0] + du * start
  const av = a[1] + dv * start
  const l = end - start
  const need = Math.min(ENOUGH, l * 0.5)
  const inU = -s * dv
  const inV = s * du
  const wall = wallOn(au, av, du, dv, l, need, walls)

  let direct = 0
  let directWeighted = 0
  let directElevation: number | null = null
  for (const other of facing) {
    if (inU * other.inU + inV * other.inV >= -0.5) continue
    const match = clip(au, av, du, dv, l, ...other.segment, ACROSS)
    if (!match) continue
    direct += match.overlap
    directWeighted += match.lateral * match.overlap
    directElevation = directElevation === null ? other.elevation : Math.max(directElevation, other.elevation)
  }

  let seam: number | null = null
  let siblingElevation: number | null = null
  if (direct >= need) {
    seam = wall ? wall.lateral : directWeighted / direct / 2
    siblingElevation = directElevation
  } else if (wall) {
    const band = wall.h + BAND
    let across = 0
    for (const other of facing) {
      if (inU * other.inU + inV * other.inV >= -0.5) continue
      const match = clip(au, av, du, dv, l, ...other.segment, Math.abs(wall.lateral) + band)
      if (!match) continue
      if (Math.abs(match.lateral - wall.lateral) > band) continue
      across += match.overlap
      siblingElevation = siblingElevation === null ? other.elevation : Math.max(siblingElevation, other.elevation)
    }
    if (across >= need) seam = wall.lateral
    else siblingElevation = null
  }

  if (seam !== null) {
    if (wall && siblingElevation !== null) {
      const higher = elevation - siblingElevation
      if (higher > SAME_HEIGHT) return { start, end, offset: s * wall.lateral + wall.h, key: `interior|${wall.wall.id}|higher` }
      if (higher < -SAME_HEIGHT) return { start, end, offset: s * wall.lateral - wall.h, key: `interior|${wall.wall.id}|lower` }
    }
    return { start, end, offset: s * seam, key: `interior|${wall ? wall.wall.id : '~'}` }
  }
  if (wall) return { start, end, offset: s * wall.lateral + wall.h, key: `wall|${wall.wall.id}` }
  return { start, end, offset: 0, key: 'free' }
}

/** The parts each edge of a slab's stored ring falls into, with how far each is moved outward. */
export function edgeParts(slab: Slab, walls: Plain[], siblings: Slab[]): Part[][] {
  const ring = slab.polygon
  const s = turnOf(ring)
  const candidates: Candidate[] = walls.map((wall) => ({ wall, segments: centrelineOf(wall), h: wall.thickness / 2 }))
  const facing: Facing[] = []
  for (const sibling of siblings) {
    if (sibling.id === slab.id || floats(sibling) || sibling.polygon.length < 2) continue
    const turn = turnOf(sibling.polygon)
    for (let i = 0; i < sibling.polygon.length; i += 1) {
      const from = sibling.polygon[i]!
      const to = sibling.polygon[(i + 1) % sibling.polygon.length]!
      const l = dist(from, to)
      if (l < 1e-9) continue
      facing.push({
        segment: [from[0], from[1], to[0], to[1]],
        elevation: sibling.elevation,
        inU: (-turn * (to[1] - from[1])) / l,
        inV: (turn * (to[0] - from[0])) / l,
      })
    }
  }
  let reach = ACROSS
  for (const candidate of candidates) reach = Math.max(reach, 2 * (candidate.h + BAND))

  const all: Part[][] = []
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    const l = dist(a, b)
    if (l < 1e-9) {
      all.push([{ start: 0, end: l, offset: 0, key: 'free' }])
      continue
    }
    const du = (b[0] - a[0]) / l
    const dv = (b[1] - a[1]) / l
    const raw: number[] = []
    for (const candidate of candidates) {
      for (const segment of candidate.segments) {
        const match = clip(a[0], a[1], du, dv, l, ...segment, candidate.h + BAND)
        if (match) raw.push(match.start, match.end)
      }
    }
    const inU = -s * dv
    const inV = s * du
    for (const other of facing) {
      if (inU * other.inU + inV * other.inV >= -0.5) continue
      const match = clip(a[0], a[1], du, dv, l, ...other.segment, reach)
      if (match) raw.push(match.start, match.end)
    }
    raw.sort((x, y) => x - y)
    const cuts: number[] = []
    let previous = 0
    for (const t of raw) {
      if (t - previous < SHORTEST) continue
      if (l - t < SHORTEST) break
      cuts.push(t)
      previous = t
    }
    const bounds = [0, ...cuts, l]
    const parts: Part[] = []
    for (let k = 0; k + 1 < bounds.length; k += 1) {
      parts.push(classify(a, du, dv, bounds[k]!, bounds[k + 1]!, s, slab.elevation, candidates, facing))
    }
    let fused = true
    while (fused && parts.length > 1) {
      fused = false
      for (let k = 0; k + 1 < parts.length; k += 1) {
        if (parts[k]!.key !== parts[k + 1]!.key) continue
        parts.splice(k, 2, classify(a, du, dv, parts[k]!.start, parts[k + 1]!.end, s, slab.elevation, candidates, facing))
        fused = true
        break
      }
    }
    all.push(parts)
  }
  return all
}

/** The ring a slab is built on: its stored ring with every part of every edge moved to its line. */
export function builtRing(slab: Slab, walls: Plain[], siblings: Slab[]): Ring {
  const ring = slab.polygon
  const copy = (): Ring => ring.map(([u, v]) => [u, v])
  if (ring.length < 3 || floats(slab)) return copy()
  const parts = edgeParts(slab, walls, siblings)
  if (parts.every((list) => list.length === 1 && list[0]!.offset === 0)) return copy()

  const n = ring.length
  const s = turnOf(ring)
  const frames = ring.map((a, i) => {
    const b = ring[(i + 1) % n]!
    const l = dist(a, b)
    return { a, du: b[0] - a[0], dv: b[1] - a[1], tu: l < 1e-9 ? 0 : (b[0] - a[0]) / l, tv: l < 1e-9 ? 0 : (b[1] - a[1]) / l }
  })
  const at = (edge: number, t: number, offset: number): V2 => {
    const f = frames[edge]!
    return [f.a[0] + f.tu * t + s * f.tv * offset, f.a[1] + f.tv * t - s * f.tu * offset]
  }
  const out: Ring = []
  const push = (point: V2) => {
    const last = out[out.length - 1]
    if (last && dist(last, point) < 1e-9) return
    out.push(point)
  }
  for (let i = 0; i < n; i += 1) {
    const list = parts[i]!
    for (let k = 1; k < list.length; k += 1) {
      push(at(i, list[k - 1]!.end, list[k - 1]!.offset))
      push(at(i, list[k]!.start, list[k]!.offset))
    }
    const j = (i + 1) % n
    const last = list[list.length - 1]!
    const first = parts[j]![0]!
    const a = at(i, last.start, last.offset)
    const endI = at(i, last.end, last.offset)
    const startJ = at(j, first.start, first.offset)
    const fi = frames[i]!
    const fj = frames[j]!
    const cross = fi.du * fj.dv - fi.dv * fj.du
    if (Math.abs(cross) < 1e-9) {
      push(endI)
      push(startJ)
      continue
    }
    const t = ((startJ[0] - a[0]) * fj.dv - (startJ[1] - a[1]) * fj.du) / cross
    const x: V2 = [a[0] + t * fi.du, a[1] + t * fi.dv]
    const far = Math.max(dist(x, endI), dist(x, startJ))
    const scale = Math.max(Math.abs(last.offset), Math.abs(first.offset), 1e-9)
    if (!(Number.isFinite(x[0]) && Number.isFinite(x[1])) || far > scale * CORNER_LIMIT) {
      push(endI)
      push(startJ)
    } else {
      push(x)
    }
  }
  if (out.length > 1 && dist(out[0]!, out[out.length - 1]!) < 1e-9) out.pop()
  return out
}

// ------------------------------------------------------------------ (5) the automatic slab's ring
const lineDistance = (p: V2, a: V2, b: V2) => {
  const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2
  if (l2 < 1e-9) return dist(p, a)
  return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / Math.sqrt(l2)
}

function thinned(points: Ring, tolerance: number): Ring {
  if (points.length <= 2) return points.map(([u, v]) => [u, v])
  let worst = -1
  let at = -1
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = lineDistance(points[i]!, points[0]!, points[points.length - 1]!)
    if (d > worst) {
      worst = d
      at = i
    }
  }
  if (worst <= tolerance || at === -1) return [points[0]!, points[points.length - 1]!]
  return [...thinned(points.slice(0, at + 1), tolerance).slice(0, -1), ...thinned(points.slice(at), tolerance)]
}

function withoutRepeats(ring: Ring, tolerance: number): Ring {
  const out: Ring = []
  for (const point of ring) {
    const last = out[out.length - 1]
    if (last && dist(last, point) <= tolerance) continue
    out.push(point)
  }
  if (out.length > 2 && dist(out[0]!, out[out.length - 1]!) <= tolerance) out.pop()
  return out
}

export function simplified(ring: Ring, tolerance = 0.08): Ring {
  const clean = withoutRepeats(ring, 1e-6)
  if (clean.length <= 3 || tolerance <= 0) return clean
  let a = 0
  let b = Math.floor(clean.length / 2)
  let far = -1
  for (let i = 0; i < clean.length; i += 1) {
    for (let j = i + 1; j < clean.length; j += 1) {
      const d2 = (clean[j]![0] - clean[i]![0]) ** 2 + (clean[j]![1] - clean[i]![1]) ** 2
      if (d2 > far) {
        far = d2
        a = i
        b = j
      }
    }
  }
  const one = thinned(clean.slice(a, b + 1), tolerance)
  const two = thinned([...clean.slice(b), ...clean.slice(0, a + 1)], tolerance)
  const out = withoutRepeats([...one.slice(0, -1), ...two.slice(0, -1)], tolerance * 0.25)
  return out.length >= 3 ? out : clean
}

/** The room of a plain closed ring of straight walls (every end shared by two walls), as the
 * automatic slab stores it: the ends in the order that turns positive, then simplified. */
export function roomRing(walls: Plain[]): Ring | null {
  if (walls.length < 3) return null
  const key = (p: { x: number; y: number }) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`
  const walk = (forward: boolean): Ring | null => {
    const first = walls[0]!
    let from = forward ? first.S : first.E
    let to = forward ? first.E : first.S
    let wall = first
    const ring: Ring = [[from.x, from.y]]
    for (let step = 0; step < walls.length + 1; step += 1) {
      if (key(to) === key(forward ? first.S : first.E)) return ring
      ring.push([to.x, to.y])
      const next = walls.find((other) => other.id !== wall.id && (key(other.S) === key(to) || key(other.E) === key(to)))
      if (!next) return null
      from = to
      to = key(next.S) === key(from) ? next.E : next.S
      wall = next
    }
    return null
  }
  for (const forward of [true, false]) {
    const ring = walk(forward)
    if (!ring || ring.length < 3) continue
    const signed = twiceArea(ring) / 2
    if (signed <= 0 || signed < 0.5 || signed > 10_000) continue
    return simplified(ring)
  }
  return null
}

// ------------------------------------------------------------------ (6) the body of a solid slab
export type Box = { min: [number, number, number]; max: [number, number, number] }
const boxOf = (ring: Ring, low: number, high: number): Box => ({
  min: [Math.min(...ring.map((p) => p[0])), low, Math.min(...ring.map((p) => p[1]))],
  max: [Math.max(...ring.map((p) => p[0])), high, Math.max(...ring.map((p) => p[1]))],
})

/** A solid slab on its built ring, with the holes that lie wholly inside it (already joined). */
export function solidFacts(ring: Ring, inside: Ring[], elevation: number, thickness: number) {
  const n = ring.length
  const m = inside.reduce((sum, hole) => sum + hole.length, 0)
  const cap = n - 2 + m + 2 * inside.length
  const topArea = areaOf(ring) - inside.reduce((sum, hole) => sum + areaOf(hole), 0)
  return {
    triangles: 2 * cap + 2 * n + 4 * m,
    vertices: 2 * (n + m) + 4 * n + 8 * m,
    topArea,
    volume: topArea * thickness,
    // what a sum of signed tetrahedra gives for this mesh: a hole's wall is there twice, once each way
    signedVolume: thickness * (areaOf(ring) - inside.reduce((sum, hole) => sum + areaOf(hole), 0) / 3),
    box: boxOf(ring, elevation - thickness, elevation),
  }
}

// a ring cut down to what lies inside a convex one
export function insideConvex(subject: Ring, convex: Ring): Ring {
  const clipRing = positive(convex)
  let out = subject
  for (let i = 0; i < clipRing.length && out.length > 0; i += 1) {
    const a = clipRing[i]!
    const b = clipRing[(i + 1) % clipRing.length]!
    const side = (p: V2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    const input = out
    out = []
    for (let k = 0; k < input.length; k += 1) {
      const p = input[k]!
      const q = input[(k + 1) % input.length]!
      const sp = side(p)
      const sq = side(q)
      if (sp >= 0) out.push(p)
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq)
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
      }
    }
  }
  return out
}

/** The top of a solid slab: its built ring less what its holes cover of it (one or two convex holes). */
export function topArea(ring: Ring, holes: Ring[]): number {
  let covered = 0
  for (const hole of holes) covered += areaOf(insideConvex(ring, hole))
  if (holes.length === 2) covered -= areaOf(insideConvex(insideConvex(ring, holes[0]!), holes[1]!))
  return areaOf(ring) - covered
}

// ------------------------------------------------------------------ (7) the pit
/** A recessed slab in its own frame: the floor at 0, the walls up to the depth. */
export function pitFacts(ring: Ring, inside: Ring[], floor: number, rim = 0) {
  const depth = Math.max(0, rim - floor)
  const n = ring.length
  const m = inside.reduce((sum, hole) => sum + hole.length, 0)
  const floorArea = areaOf(ring) - inside.reduce((sum, hole) => sum + areaOf(hole), 0)
  return {
    depth,
    triangles: n - 2 + m + 2 * inside.length + 2 * n,
    vertices: n + m + 4 * n,
    floorArea,
    volume: floorArea * depth,
    box: boxOf(ring, 0, depth),
    setAt: floor,
  }
}

// ------------------------------------------------------------------ (8) the fill down to the land
export type Land = { origin: V2; spacing: number; cols: number; rows: number; height: (u: number, v: number) => number }

/** Where the edge A→B crosses a crease of the land's surface, as shares of the edge. */
export function creases(land: Land, a: V2, b: V2): number[] {
  const u0 = (a[0] - land.origin[0]) / land.spacing
  const v0 = (a[1] - land.origin[1]) / land.spacing
  const u1 = (b[0] - land.origin[0]) / land.spacing
  const v1 = (b[1] - land.origin[1]) / land.spacing
  const out: number[] = []
  const family = (from: number, to: number, low: number, high: number) => {
    if (Math.abs(to - from) < 1e-12) return
    for (let k = Math.max(low, Math.ceil(Math.min(from, to))); k <= Math.min(high, Math.floor(Math.max(from, to))); k += 1) {
      const t = (k - from) / (to - from)
      if (t > 1e-9 && t < 1 - 1e-9) out.push(t)
    }
  }
  family(u0, u1, 0, land.cols - 1)
  family(v0, v1, 0, land.rows - 1)
  family(u0 + v0, u1 + v1, 0, land.cols - 1 + (land.rows - 1))
  out.sort((x, y) => x - y)
  return out.filter((t, i) => i === 0 || t - out[i - 1]! > 1e-9)
}

/** Where the building stands on the site: turned about the vertical, then moved. */
export type SitePlace = { turn: number; x: number; z: number }
export const onSite = (u: number, v: number, at: SitePlace): V2 => [
  Math.cos(at.turn) * u + Math.sin(at.turn) * v + at.x,
  -Math.sin(at.turn) * u + Math.cos(at.turn) * v + at.z,
]

/** The skirt and its bottom under a solid slab. `land.height` is the ground above the level's
 * base at a point of the site. */
export function fillFacts(ring: Ring, elevation: number, thickness: number, land: Land, at: SitePlace = { turn: 0, x: 0, z: 0 }) {
  const outline = positive(ring)
  const top = elevation - thickness
  const points: Ring = []
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i]!
    const b = outline[(i + 1) % outline.length]!
    points.push(a)
    for (const t of creases(land, onSite(a[0], a[1], at), onSite(b[0], b[1], at))) {
      points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  const ground = (u: number, v: number) => land.height(...onSite(u, v, at))
  const bottoms = points.map(([u, v]) => Math.min(top, ground(u, v)))
  if (bottoms.every((y) => y >= top - 1e-4)) return null
  let skirt = 0
  for (let i = 0; i < points.length; i += 1) {
    if (bottoms[i]! >= top - 1e-4 && bottoms[(i + 1) % points.length]! >= top - 1e-4) continue
    skirt += 2
  }
  const centre = centroidOf(outline)!
  return {
    points: points.length,
    skirtTriangles: skirt,
    bottomTriangles: points.length - 2, // every bottom below the underside
    box: boxOf(points, Math.min(...bottoms), top),
    // on a land that is one plane under the whole slab, and below its underside everywhere:
    volumeOnOnePlane: areaOf(outline) * (top - ground(centre[0], centre[1])),
  }
}

// ------------------------------------------------------------------ (9) what stands on a slab
export function within(ring: Ring, u: number, v: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [ui, vi] = ring[i]!
    const [uj, vj] = ring[j]!
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside
  }
  return inside
}

/** The floor height under a plan point. */
export function floorAt(slabs: Slab[], u: number, v: number): number {
  let best = 0
  for (const slab of slabs) {
    if (slab.polygon.length < 3 || !within(slab.polygon, u, v)) continue
    if (slab.holes.some((hole) => hole.length >= 3 && within(hole, u, v))) continue
    if (slab.elevation > best) best = slab.elevation
  }
  return best
}

export function footprintOf(u: number, v: number, width: number, depth: number, turn: number, inset = 0): Ring {
  const hw = Math.max(0, width / 2 - inset)
  const hd = Math.max(0, depth / 2 - inset)
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  return [
    [u + (-hw * c + hd * s), v + (-hw * s - hd * c)],
    [u + (hw * c + hd * s), v + (hw * s - hd * c)],
    [u + (hw * c - hd * s), v + (hw * s + hd * c)],
    [u + (-hw * c - hd * s), v + (-hw * s + hd * c)],
  ]
}

function touch(a: V2, b: V2, c: V2, d: V2): boolean {
  const cross = (o: V2, p: V2, q: V2) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  const on = (p: V2, q: V2, r: V2) =>
    Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1])
  return (d1 === 0 && on(c, d, a)) || (d2 === 0 && on(c, d, b)) || (d3 === 0 && on(a, b, c)) || (d4 === 0 && on(a, b, d))
}

export function overlaps(footprint: Ring, ring: Ring): boolean {
  if (footprint.some(([u, v]) => within(ring, u, v))) return true
  if (ring.some(([u, v]) => within(footprint, u, v))) return true
  for (let i = 0; i < 4; i += 1) {
    for (let k = 0; k < ring.length; k += 1) {
      if (touch(footprint[i]!, footprint[(i + 1) % 4]!, ring[k]!, ring[(k + 1) % ring.length]!)) return true
    }
  }
  return false
}

export type Standing = { elevation: number; slabId: string | null }

/** The slab a thing of a rectangular footprint stands on. `built` gives each slab's built ring. */
export function standsOn(
  slabs: Slab[], built: (slab: Slab) => Ring,
  u: number, v: number, width: number, depth: number, turn: number, cap?: number | null,
): Standing {
  let best: Standing = { elevation: Number.NEGATIVE_INFINITY, slabId: null }
  for (const slab of slabs) {
    if (cap != null && slab.elevation > cap + 0.05) continue
    if (slab.polygon.length < 3) continue
    if (!overlaps(footprintOf(u, v, width, depth, turn, 0.01), built(slab))) continue
    if (slab.holes.some((hole) => hole.length >= 3 && within(hole, u, v))) continue
    if (slab.elevation > best.elevation) best = { elevation: slab.elevation, slabId: slab.id }
  }
  return best.slabId === null ? { elevation: 0, slabId: null } : best
}

const carries = (slab: Slab, ring: Ring, u: number, v: number, width: number, depth: number, turn: number): boolean =>
  slab.polygon.length >= 3 &&
  overlaps(footprintOf(u, v, width, depth, turn, 0.01), ring) &&
  !slab.holes.some((hole) => hole.length >= 3 && within(hole, u, v))

/** Every slab under a footprint, the highest first (the same height: by id). */
export function slabsUnder(slabs: Slab[], built: (slab: Slab) => Ring, u: number, v: number, width: number, depth: number, turn: number) {
  return slabs
    .filter((slab) => carries(slab, built(slab), u, v, width, depth, turn))
    .map((slab) => ({ slabId: slab.id, elevation: slab.elevation }))
    .sort((a, b) => b.elevation - a.elevation || (a.slabId < b.slabId ? -1 : a.slabId > b.slabId ? 1 : 0))
}

/** The height a thing takes from the slab stored on it as its host, while that slab still carries it. */
export function heldBy(slabs: Slab[], built: (slab: Slab) => Ring, id: string, u: number, v: number, width: number, depth: number, turn: number): number | null {
  const slab = slabs.find((one) => one.id === id)
  return slab && carries(slab, built(slab), u, v, width, depth, turn) ? slab.elevation : null
}

/** The surface a ray points at: the nearest slab top it crosses inside that slab, else the level's plane. */
export function pointedAt(slabs: Slab[], built: (slab: Slab) => Ring, o: [number, number, number], d: [number, number, number]) {
  if (Math.abs(d[1]) < 1e-9) return { elevation: 0, slabId: null as string | null, point: null as V2 | null }
  let best: { t: number; elevation: number; slabId: string } | null = null
  for (const slab of slabs) {
    if (slab.polygon.length < 3) continue
    const t = (slab.elevation - o[1]) / d[1]
    if (t <= 0 || (best && t >= best.t)) continue
    const u = o[0] + d[0] * t
    const v = o[2] + d[2] * t
    const ring = built(slab)
    if (ring.length < 3 || !within(ring, u, v)) continue
    if (slab.holes.some((hole) => hole.length >= 3 && within(hole, u, v))) continue
    best = { t, elevation: slab.elevation, slabId: slab.id }
  }
  if (best) return { elevation: best.elevation, slabId: best.slabId as string | null, point: [o[0] + d[0] * best.t, o[2] + d[2] * best.t] as V2 | null }
  const t = -o[1] / d[1]
  return { elevation: 0, slabId: null as string | null, point: (t > 0 ? [o[0] + d[0] * t, o[2] + d[2] * t] : null) as V2 | null }
}

// --- a wall on slabs
type Span = [number, number]
const merged = (spans: Span[]): Span[] => {
  if (spans.length <= 1) return spans
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  const out: Span[] = [[sorted[0]![0], sorted[0]![1]]]
  for (const [from, to] of sorted.slice(1)) {
    const last = out[out.length - 1]!
    if (from <= last[1] + 1e-9) last[1] = Math.max(last[1], to)
    else out.push([from, to])
  }
  return out
}
const lengthOfSpans = (spans: Span[]) => spans.reduce((sum, [from, to]) => sum + (to - from), 0)
const less = (base: Span[], cut: Span[]): Span[] => {
  if (base.length === 0 || cut.length === 0) return merged(base)
  const cuts = merged(cut)
  const out: Span[] = []
  for (const [from, to] of merged(base)) {
    let cursor = from
    for (const [cutFrom, cutTo] of cuts) {
      if (cutTo <= cursor) continue
      if (cutFrom >= to) break
      if (cutFrom > cursor) out.push([cursor, cutFrom])
      cursor = cutTo
      if (cursor >= to) break
    }
    if (cursor < to) out.push([cursor, to])
  }
  return out
}

const onEdge = (ring: Ring, u: number, v: number): boolean => {
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    const du = b[0] - a[0]
    const dv = b[1] - a[1]
    const l2 = du * du + dv * dv
    const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((u - a[0]) * du + (v - a[1]) * dv) / l2))
    if (Math.hypot(u - (a[0] + du * t), v - (a[1] + dv * t)) <= 1e-4) return true
  }
  return false
}

// the parts of a line of points that lie in a ring, in metres from the line's start
function covered(line: Ring, ring: Ring, edgeCounts: boolean): Span[] {
  const out: Span[] = []
  let before = 0
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!
    const b = line[i]!
    const du = b[0] - a[0]
    const dv = b[1] - a[1]
    const l = Math.hypot(du, dv)
    if (l < 1e-9) continue
    const ts = [0, 1]
    for (let k = 0; k < ring.length; k += 1) {
      const p = ring[k]!
      const q = ring[(k + 1) % ring.length]!
      const eu = q[0] - p[0]
      const ev = q[1] - p[1]
      const cross = du * ev - dv * eu
      if (Math.abs(cross) < 1e-12) continue
      const t = ((p[0] - a[0]) * ev - (p[1] - a[1]) * eu) / cross
      const s = ((p[0] - a[0]) * dv - (p[1] - a[1]) * du) / cross
      if (t > 0 && t < 1 && s >= -1e-9 && s <= 1 + 1e-9) ts.push(t)
    }
    ts.sort((x, y) => x - y)
    for (let k = 1; k < ts.length; k += 1) {
      const t0 = ts[k - 1]!
      const t1 = ts[k]!
      if (t1 - t0 < 1e-9) continue
      const mu = a[0] + (du * (t0 + t1)) / 2
      const mv = a[1] + (dv * (t0 + t1)) / 2
      if (onEdge(ring, mu, mv) ? edgeCounts : within(ring, mu, mv)) out.push([before + t0 * l, before + t1 * l])
    }
    before += l
  }
  return merged(out)
}

function linesOf(wall: Plain): Ring[] {
  const h = Math.max(wall.thickness / 2, 0)
  if (wall.s !== 0 && sagittaOf(wall) !== 0) {
    const centre: Ring = []
    const left: Ring = []
    const right: Ring = []
    for (let i = 0; i <= 16; i += 1) {
      const here = placeOn(wall, i / 16)
      centre.push([here.P.x, here.P.y])
      left.push([here.P.x + here.N.x * h, here.P.y + here.N.y * h])
      right.push([here.P.x - here.N.x * h, here.P.y - here.N.y * h])
    }
    return h > 0 ? [centre, left, right] : [centre]
  }
  const centre: Ring = [[wall.S.x, wall.S.y], [wall.E.x, wall.E.y]]
  const l = Math.hypot(wall.E.x - wall.S.x, wall.E.y - wall.S.y)
  if (l < 1e-10 || h <= 0) return [centre]
  const nu = (-(wall.E.y - wall.S.y) / l) * h
  const nv = ((wall.E.x - wall.S.x) / l) * h
  return [
    centre,
    [[wall.S.x + nu, wall.S.y + nv], [wall.E.x + nu, wall.E.y + nv]],
    [[wall.S.x - nu, wall.S.y - nv], [wall.E.x - nu, wall.E.y - nv]],
  ]
}
const lineLength = (line: Ring) => line.slice(1).reduce((sum, p, i) => sum + dist(line[i]!, p), 0)

/** Whether a wall lies on a ring for long enough to count (holes taken out). */
export function wallLiesOn(wall: Plain, ring: Ring, holes: Ring[] = []): boolean {
  const lines = linesOf(wall)
  const l = lineLength(lines[0]!)
  if (l < 1e-9) return false
  let longest = 0
  for (const line of lines) {
    let spans = covered(line, ring, true)
    for (const hole of holes) {
      if (spans.length === 0) break
      if (hole.length < 3) continue
      spans = less(spans, covered(line, hole, false))
    }
    longest = Math.max(longest, lengthOfSpans(spans))
  }
  return longest >= Math.max(1e-3, Math.min(0.05, l * 0.5))
}

export type WallStanding = {
  elevation: number
  slabId: string | null
  lowest: number
  runs: Array<{ start: number; end: number; elevation: number }>
}

/** The height a wall stands at on the slabs of its level, and the run of heights under it. */
export function wallStandsOn(
  wall: Plain, slabs: Slab[], built: (slab: Slab) => Ring,
  preferred?: string | null, cap?: number | null, ground = 0,
): WallStanding {
  const lines = linesOf(wall)
  const lengths = lines.map(lineLength)
  if (lengths[0]! < 1e-9) return { elevation: ground, slabId: null, lowest: ground, runs: [] }
  const least = Math.max(1e-3, Math.min(0.05, lengths[0]! * 0.5))

  type Group = { elevation: number; ids: string[]; spans: Span[][] }
  const groups: Group[] = []
  let pinned: number | null = null
  let pinnedId: string | null = null
  for (const slab of slabs) {
    if (slab.polygon.length < 3) continue
    const ring = built(slab)
    let longest = 0
    const perLine = lines.map((line) => {
      let spans = covered(line, ring, true)
      for (const hole of slab.holes) {
        if (spans.length === 0) break
        if (hole.length < 3) continue
        spans = less(spans, covered(line, hole, false))
      }
      longest = Math.max(longest, lengthOfSpans(spans))
      return spans
    })
    if (longest < least) continue
    if (preferred != null && slab.id === preferred) {
      pinned = slab.elevation
      pinnedId = slab.id
    }
    let group = groups.find((g) => Math.abs(g.elevation - slab.elevation) <= 1e-4)
    if (!group) {
      group = { elevation: slab.elevation, ids: [], spans: lines.map(() => []) }
      groups.push(group)
    }
    group.ids.push(slab.id)
    perLine.forEach((spans, i) => group!.spans[i]!.push(...spans))
  }

  const shares = groups.map((group) => ({
    elevation: group.elevation,
    perLine: group.spans.map((spans, i) =>
      lengths[i]! < 1e-9 ? [] : merged(spans).map(([from, to]) => [from / lengths[i]!, to / lengths[i]!] as Span),
    ),
  }))
  const marks = [0, 1]
  for (const group of shares) for (const spans of group.perLine) for (const [from, to] of spans) marks.push(from, to)
  marks.sort((a, b) => a - b)
  const cuts = marks.filter((value, i) => i === 0 || value - marks[i - 1]! > 1e-7)
  const highest = (list: typeof shares, line: number, t: number) => {
    let top = Number.NEGATIVE_INFINITY
    for (const group of list) {
      if (group.perLine[line]?.some(([from, to]) => t >= from - 1e-7 && t <= to + 1e-7)) top = Math.max(top, group.elevation)
    }
    return top
  }
  const electable = cap == null ? shares : shares.filter((group) => group.elevation <= cap + 0.05)
  const heightAt = (list: typeof shares, t: number) => {
    const centre = highest(list, 0, t)
    const faces = (lines.length >= 3 ? [highest(list, 1, t), highest(list, 2, t)] : []).filter(Number.isFinite)
    return {
      held: faces.length > 0 || Number.isFinite(centre),
      elevation: faces.length > 0 ? Math.min(...faces) : Math.max(centre, ground),
    }
  }

  const runs: WallStanding['runs'] = []
  const carried: Array<{ elevation: number; share: number }> = []
  const carry = (elevation: number, share: number) => {
    let entry = carried.find((c) => Math.abs(c.elevation - elevation) <= 1e-4)
    if (!entry) {
      entry = { elevation, share: 0 }
      carried.push(entry)
    }
    entry.share += share
  }
  for (let i = 1; i < cuts.length; i += 1) {
    const start = cuts[i - 1]!
    const end = cuts[i]!
    if (end - start < 1e-7) continue
    const middle = (start + end) / 2
    const here = heightAt(shares, middle)
    const chosen = electable === shares ? here : heightAt(electable, middle)
    if (chosen.held) carry(chosen.elevation, end - start)
    const last = runs[runs.length - 1]
    if (last && Math.abs(last.elevation - here.elevation) <= 1e-4) last.end = end
    else runs.push({ start, end, elevation: here.elevation })
  }

  let most = Number.NEGATIVE_INFINITY
  let best = Number.NEGATIVE_INFINITY
  let bestShare = -1
  for (const c of carried) {
    if (c.share >= 0.5 - 1e-6) most = Math.max(most, c.elevation)
    if (c.share > bestShare + 1e-6 || (Math.abs(c.share - bestShare) <= 1e-6 && c.elevation > best)) {
      bestShare = c.share
      best = c.elevation
    }
  }
  const elevation =
    pinned !== null ? pinned : most !== Number.NEGATIVE_INFINITY ? most : best === Number.NEGATIVE_INFINITY ? ground : best
  const slabId =
    pinnedId ??
    groups
      .filter((g) => cap == null || g.elevation <= cap + 0.05)
      .find((g) => Math.abs(g.elevation - elevation) <= 1e-4)
      ?.ids.slice()
      .sort()[0] ??
    null
  if (runs.length === 0) runs.push({ start: 0, end: 1, elevation })
  return { elevation, slabId, lowest: Math.min(...runs.map((run) => run.elevation)), runs }
}

// ------------------------------------------------------------------ (3) and (10) heights
export const undersideOf = (slab: { elevation: number; thickness: number }) => slab.elevation - slab.thickness
export const anchorOf = (slab: Slab) => (slab.recessed ? (slab.rim ?? 0) : undersideOf(slab))
export const depthOf = (slab: Slab) => Math.max(0.02, (slab.rim ?? 0) - slab.elevation)

export const withThickness = (slab: Slab, thickness: number) => {
  const t = Math.max(0.02, thickness)
  return { elevation: undersideOf(slab) + t, thickness: t, recessed: false }
}
export function withTop(slab: Slab, top: number) {
  if (slab.recessed) {
    const rim = anchorOf(slab)
    if (top < rim) return { elevation: top, recessed: true }
    return { elevation: Math.max(top, rim + 0.02), thickness: Math.max(0.02, top - rim), recessed: false }
  }
  if (Math.abs(slab.elevation - slab.thickness) < 1e-3 && top <= 0) return { elevation: top, recessed: true }
  return { elevation: top, recessed: false }
}
export function withPreset(slab: Slab, signed: number) {
  const anchor = anchorOf(slab)
  if (signed < 0) return { elevation: anchor + signed, recessed: true, rim: anchor }
  const t = Math.max(0.02, signed)
  return { elevation: anchor + t, thickness: t, recessed: false }
}
export const withDepth = (slab: Slab, depth: number) => ({ elevation: (slab.rim ?? 0) - Math.max(0.02, depth) })
export const drawnAt = (slab: Slab, plane: number | null) =>
  slab.recessed || plane === null || !Number.isFinite(plane) ? slab.elevation : slab.elevation + plane

/** The highest a slab's top may be put while walls with no height of their own stand on it. */
export function heldUnderWalls(
  proposed: number, slab: Slab, walls: Array<Plain & { height?: number }>, slabs: Slab[], storey: number,
): { elevation: number; held: boolean } {
  const limit = storey - 0.5
  if (proposed <= limit || slab.polygon.length < 3) return { elevation: proposed, held: false }
  const raised = slabs.some((other) => other.id === slab.id)
    ? slabs.map((other) => (other.id === slab.id ? { ...other, elevation: proposed } : other))
    : [...slabs, { ...slab, elevation: proposed }]
  for (const wall of walls) {
    if (wall.height != null) continue
    if (!wallLiesOn(wall, slab.polygon)) continue
    const standing = wallStandsOn(wall, raised, (one) => builtRing(one, walls, raised.filter((other) => other.id !== one.id)))
    if (Math.abs(standing.elevation - proposed) <= 1e-4) return { elevation: limit, held: true }
  }
  return { elevation: proposed, held: false }
}

export function highestUnderWalls(slab: Slab, walls: Array<Plain & { height?: number }>, slabs: Slab[], storey: number): number {
  const far = Math.max(storey, ...slabs.map((one) => one.elevation)) + 1
  return heldUnderWalls(far, slab, walls, slabs, storey).held ? storey - 0.5 : Number.POSITIVE_INFINITY
}
