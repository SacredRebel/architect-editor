// The port note's equations for the level (entry 9), written out as code. Nothing here calls the
// old editor: the reference cases hold these against it. A number in brackets is the equation's
// number in the entry. Plan points are (u, v) of the note, held as {x, y}; heights are metres up.
import { arcOf, type P, placeOn, plain } from './_wall-equations'

export type Ring = ReadonlyArray<readonly [number, number]>
export type Span = [number, number]

const at = (ring: Ring, i: number): P => ({ x: ring[i]![0], y: ring[i]![1] })
const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y })
const len = (a: P): number => Math.hypot(a.x, a.y)
const POOL = 1e-4 // two heights closer than this are one height

// ------------------------------------------------------------------ (1) the stack, (3) neighbours and the way to the next floor
export type LevelIn = { id: string; ordinal: number; height?: number; base?: number; parent?: string | null }
export type BuildingIn = { id: string; children: readonly string[] }
export type Storey = {
  id: string
  building: string | null
  ordinal: number
  h: number // storey height
  F: number // floor above the building's own origin
  D: number // to the next floor up
  above: string | null
  below: string | null
}

export function stackOf(levels: readonly LevelIn[], buildings: readonly BuildingIn[] = []): Map<string, Storey> {
  const owner = (level: LevelIn): string | null =>
    buildings.find((b) => b.id === level.parent)?.id ?? buildings.find((b) => b.children.includes(level.id))?.id ?? null
  // by ordinal, lowest first; equal ordinals keep the order they were given in
  const order = levels.map((level, i) => ({ level, i })).sort((a, b) => a.level.ordinal - b.level.ordinal || a.i - b.i)
  const top = new Map<string | null, number>()
  const out = new Map<string, Storey>()
  for (const { level } of order) {
    const building = owner(level)
    const h = level.height ?? 2.5
    const F = (top.get(building) ?? 0) + (level.base ?? 0)
    top.set(building, F + h)
    out.set(level.id, { id: level.id, building, ordinal: level.ordinal, h, F, D: h, above: null, below: null })
  }
  const all = [...out.values()]
  for (const me of all) {
    let above: Storey | null = null
    let below: Storey | null = null
    for (const other of all) {
      if (other === me || other.building !== me.building) continue
      if (other.ordinal > me.ordinal && (above === null || other.ordinal < above.ordinal)) above = other
      if (other.ordinal < me.ordinal && (below === null || other.ordinal > below.ordinal)) below = other
    }
    me.above = above?.id ?? null
    me.below = below?.id ?? null
    me.D = above ? above.F - me.F : me.h
  }
  return out
}

// the ordinals of one building as the old editor renumbers them when a file is opened
export function renumbered(ordinals: readonly number[]): number[] {
  const order = ordinals.map((ordinal, i) => ({ ordinal, i })).sort((a, b) => a.ordinal - b.ordinal || a.i - b.i)
  const below = ordinals.filter((ordinal) => ordinal < 0).length
  const out = new Array<number>(ordinals.length)
  order.forEach((entry, place) => {
    out[entry.i] = place - below
  })
  return out
}

// ------------------------------------------------------------------ (5) what of a line lies on a slab
export function insideOf(p: P, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = at(ring, i)
    const b = at(ring, j)
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function distanceToEdge(p: P, a: P, b: P): number {
  const d = sub(b, a)
  const dd = d.x * d.x + d.y * d.y
  if (dd < 1e-18) return len(sub(p, a))
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / dd))
  return len({ x: p.x - (a.x + d.x * t), y: p.y - (a.y + d.y * t) })
}

export function onRimOf(p: P, ring: Ring): boolean {
  for (let i = 0; i < ring.length; i += 1) {
    if (distanceToEdge(p, at(ring, i), at(ring, (i + 1) % ring.length)) <= 1e-4) return true
  }
  return false
}

function joined(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  const out: Span[] = []
  for (const [from, to] of sorted) {
    const last = out[out.length - 1]
    if (last && from <= last[1] + 1e-9) last[1] = Math.max(last[1], to)
    else out.push([from, to])
  }
  return out
}

function less(spans: Span[], cut: Span[]): Span[] {
  const cuts = joined(cut)
  const out: Span[] = []
  for (const [from, to] of joined(spans)) {
    let cursor = from
    for (const [a, b] of cuts) {
      if (b <= cursor) continue
      if (a >= to) break
      if (a > cursor) out.push([cursor, a])
      cursor = b
      if (cursor >= to) break
    }
    if (cursor < to) out.push([cursor, to])
  }
  return out
}

const total = (spans: readonly Span[]): number => spans.reduce((sum, [from, to]) => sum + (to - from), 0)

// the parts of a line of points that lie in a ring, as metres from the line's start;
// rim: whether a part that runs along the ring's own edge counts
function partsIn(line: readonly P[], ring: Ring, rim: boolean): Span[] {
  const out: Span[] = []
  let before = 0
  for (let k = 1; k < line.length; k += 1) {
    const a = line[k - 1]!
    const b = line[k]!
    const d = sub(b, a)
    const run = len(d)
    if (run < 1e-9) continue
    const cuts = [0, 1]
    for (let i = 0; i < ring.length; i += 1) {
      const p = at(ring, i)
      const e = sub(at(ring, (i + 1) % ring.length), p)
      const det = d.x * e.y - d.y * e.x
      if (Math.abs(det) < 1e-12) continue
      const t = ((p.x - a.x) * e.y - (p.y - a.y) * e.x) / det // the entry's λ: along the line
      const s = ((p.x - a.x) * d.y - (p.y - a.y) * d.x) / det // the entry's μ: along the edge
      if (t > 0 && t < 1 && s >= -1e-9 && s <= 1 + 1e-9) cuts.push(t)
    }
    cuts.sort((x, y) => x - y)
    for (let i = 1; i < cuts.length; i += 1) {
      const t0 = cuts[i - 1]!
      const t1 = cuts[i]!
      if (t1 - t0 < 1e-9) continue
      const middle = { x: a.x + d.x * ((t0 + t1) / 2), y: a.y + d.y * ((t0 + t1) / 2) }
      if (onRimOf(middle, ring) ? rim : insideOf(middle, ring)) out.push([before + t0 * run, before + t1 * run])
    }
    before += run
  }
  return joined(out)
}

// on a slab: inside its outline or along its edge, and not inside one of its holes (a hole's rim holds)
export function coveredOf(line: readonly P[], outline: Ring, holes: readonly Ring[] = []): Span[] {
  let spans = partsIn(line, outline, true)
  for (const hole of holes) {
    if (spans.length === 0) break
    if (hole.length < 3) continue
    spans = less(spans, partsIn(line, hole, false))
  }
  return spans
}

const lengthOfLine = (line: readonly P[]): number => {
  let sum = 0
  for (let k = 1; k < line.length; k += 1) sum += len(sub(line[k]!, line[k - 1]!))
  return sum
}

// ------------------------------------------------------------------ (6) a wall's three lines, the least support, the band
export type WallIn = { start: readonly [number, number]; end: readonly [number, number]; thickness?: number; curveOffset?: number }

export function linesOf(wall: WallIn): P[][] {
  const w = plain({ id: 'w', start: wall.start, end: wall.end, curveOffset: wall.curveOffset, thickness: wall.thickness })
  const half = Math.max(w.thickness / 2, 0)
  if (arcOf(w)) {
    // a bent wall (entry 1, equations (2) to (4)): 17 stations along the arc, each face along the arc's own normal
    const centre: P[] = []
    const left: P[] = []
    const right: P[] = []
    for (let i = 0; i <= 16; i += 1) {
      const here = placeOn(w, i / 16)
      centre.push(here.P)
      left.push({ x: here.P.x + here.N.x * half, y: here.P.y + here.N.y * half })
      right.push({ x: here.P.x - here.N.x * half, y: here.P.y - here.N.y * half })
    }
    return half > 0 ? [centre, left, right] : [centre]
  }
  const centre = [w.S, w.E]
  const c = len(sub(w.E, w.S))
  if (c < 1e-10 || half <= 0) return [centre]
  const n = { x: (-(w.E.y - w.S.y) / c) * half, y: ((w.E.x - w.S.x) / c) * half }
  return [
    centre,
    [{ x: w.S.x + n.x, y: w.S.y + n.y }, { x: w.E.x + n.x, y: w.E.y + n.y }],
    [{ x: w.S.x - n.x, y: w.S.y - n.y }, { x: w.E.x - n.x, y: w.E.y - n.y }],
  ]
}

// the least length a slab must hold of a wall to count: 0.05 m, half the wall when it is shorter, never under 0.001 m
const leastOf = (wallLength: number): number => Math.max(1e-3, Math.min(0.05, wallLength * 0.5))

// a wall's band is over a slab when the longest of its three lines' lengths on it reaches the least support
export function bandOverlaps(wall: WallIn, outline: Ring, holes: readonly Ring[] = []): boolean {
  const lines = linesOf(wall)
  const L = lengthOfLine(lines[0]!)
  if (L < 1e-9) return false
  let longest = 0
  for (const line of lines) longest = Math.max(longest, total(coveredOf(line, outline, holes)))
  return longest >= leastOf(L)
}

// ------------------------------------------------------------------ (4) the storey plane
// top: the slab's walking surface above its level's floor (0.05 when not stored); thickness: down from it (0.05)
export type SlabIn = { id: string; outline: Ring; holes?: readonly Ring[]; top?: number; thickness?: number; recessed?: boolean }

export const undersideOf = (D: number, slab: SlabIn): number => D + ((slab.top ?? 0.05) - (slab.thickness ?? 0.05))
const covering = (slabsAbove: readonly SlabIn[]): SlabIn[] => slabsAbove.filter((slab) => !slab.recessed && slab.outline.length >= 3)

export function planeOf(D: number, slabsAbove: readonly SlabIn[], wall: WallIn): number {
  let H = D
  for (const slab of covering(slabsAbove)) {
    const U = undersideOf(D, slab)
    if (U < H && bandOverlaps(wall, slab.outline, slab.holes)) H = U
  }
  return H
}

function covers(slab: SlabIn, p: P): boolean {
  if (!insideOf(p, slab.outline) && !onRimOf(p, slab.outline)) return false
  for (const hole of slab.holes ?? []) {
    if (hole.length >= 3 && insideOf(p, hole) && !onRimOf(p, hole)) return false
  }
  return true
}

export function undersideAt(D: number, slabsAbove: readonly SlabIn[], p: P): number | null {
  let lowest: number | null = null
  for (const slab of covering(slabsAbove)) {
    if (!covers(slab, p)) continue
    const U = undersideOf(D, slab)
    if (lowest === null || U < lowest) lowest = U
  }
  return lowest
}

export function ceilingBoundOf(D: number, slabsAbove: readonly SlabIn[], polygon: Ring): number {
  let bound = D
  if (polygon.length > 0) {
    const sum = { x: 0, y: 0 }
    for (const [u, v] of polygon) {
      sum.x += u
      sum.y += v
    }
    const mean = { x: sum.x / polygon.length, y: sum.y / polygon.length }
    for (const p of [...polygon.map(([u, v]) => ({ x: u, y: v })), mean]) {
      const U = undersideAt(D, slabsAbove, p)
      if (U !== null && U < bound) bound = U
    }
  }
  return bound - 0.01
}

// ------------------------------------------------------------------ (7) what a wall stands on
export type Run = { start: number; end: number; height: number }
export type Stand = { stands: number; on: string | null; lowest: number; runs: Run[] }

// slabs: the slabs of the wall's level, each with the outline it is drawn with; g: the level base under
// the wall; stored: the slab the wall names as its host; cap: the height the pointer aimed at
export function electWall(
  wall: WallIn,
  slabs: readonly SlabIn[],
  g = 0,
  stored: string | null = null,
  cap: number | null = null,
): Stand {
  const lines = linesOf(wall)
  const lengths = lines.map(lengthOfLine)
  const L = lengths[0]!
  if (L < 1e-9) return { stands: g, on: null, lowest: g, runs: [] }
  const least = leastOf(L)

  // slabs of one height hold the wall together
  type Group = { top: number; ids: string[]; spans: Span[][] }
  const groups: Group[] = []
  let storedTop: number | null = null
  let storedId: string | null = null
  for (const slab of slabs) {
    if (slab.outline.length < 3) continue
    const spans = lines.map((line) => coveredOf(line, slab.outline, slab.holes))
    if (Math.max(...spans.map(total)) < least) continue
    const top = slab.top ?? 0.05
    if (stored !== null && slab.id === stored) {
      storedTop = top
      storedId = slab.id
    }
    let group = groups.find((entry) => Math.abs(entry.top - top) <= POOL)
    if (!group) {
      group = { top, ids: [], spans: lines.map(() => []) }
      groups.push(group)
    }
    group.ids.push(slab.id)
    spans.forEach((list, i) => group.spans[i]!.push(...list))
  }
  // as fractions of each line's own length
  const held = groups.map((group) => ({
    top: group.top,
    ids: group.ids,
    spans: group.spans.map((list, i) => (lengths[i]! < 1e-9 ? [] : joined(list).map(([a, b]) => [a / lengths[i]!, b / lengths[i]!] as Span))),
  }))
  const electable = cap === null ? held : held.filter((group) => group.top <= cap + 0.05)

  const marks = [0, 1]
  for (const group of held) for (const list of group.spans) for (const [a, b] of list) marks.push(a, b)
  marks.sort((x, y) => x - y)
  const cutsAt = marks.filter((value, i) => i === 0 || value - marks[i - 1]! > 1e-7)

  const highest = (among: typeof held, line: number, t: number): number => {
    let top = Number.NEGATIVE_INFINITY
    for (const group of among) {
      if (group.spans[line]?.some(([a, b]) => t >= a - 1e-7 && t <= b + 1e-7)) top = Math.max(top, group.top)
    }
    return top
  }
  // the height a piece of the wall is carried at: the lower of its two faces' supports; with no
  // support under either face, the support under its centreline but never under the level base
  const carriedAt = (among: typeof held, t: number): number | null => {
    const centre = highest(among, 0, t)
    const faces = lines.length >= 3 ? [highest(among, 1, t), highest(among, 2, t)].filter(Number.isFinite) : []
    if (faces.length === 0 && !Number.isFinite(centre)) return null
    return faces.length > 0 ? Math.min(...faces) : Math.max(centre, g)
  }

  const runs: Run[] = []
  const tally: Array<{ height: number; length: number }> = []
  for (let i = 1; i < cutsAt.length; i += 1) {
    const from = cutsAt[i - 1]!
    const to = cutsAt[i]!
    if (to - from < 1e-7) continue
    const middle = (from + to) / 2
    const carried = carriedAt(electable, middle)
    if (carried !== null) {
      let entry = tally.find((one) => Math.abs(one.height - carried) <= POOL)
      if (!entry) {
        entry = { height: carried, length: 0 }
        tally.push(entry)
      }
      entry.length += to - from
    }
    const bottom = carriedAt(held, middle) ?? g
    const last = runs[runs.length - 1]
    if (last && Math.abs(last.height - bottom) <= POOL) last.end = to
    else runs.push({ start: from, end: to, height: bottom })
  }

  let majority = Number.NEGATIVE_INFINITY
  let best = Number.NEGATIVE_INFINITY
  let bestLength = -1
  for (const entry of tally) {
    if (entry.length >= 0.5 - 1e-6) majority = Math.max(majority, entry.height)
    if (entry.length > bestLength + 1e-6 || (Math.abs(entry.length - bestLength) <= 1e-6 && entry.height > best)) {
      bestLength = entry.length
      best = entry.height
    }
  }
  const stands = storedTop !== null ? storedTop : Number.isFinite(majority) ? majority : Number.isFinite(best) ? best : g
  const on =
    storedId ??
    held
      .filter((group) => cap === null || group.top <= cap + 0.05)
      .find((group) => Math.abs(group.top - stands) <= POOL)
      ?.ids.slice()
      .sort()[0] ??
    null
  if (runs.length === 0) runs.push({ start: 0, end: 1, height: stands })
  return { stands, on, lowest: Math.min(...runs.map((run) => run.height)), runs }
}

// ------------------------------------------------------------------ (8) a wall's base, in the order of the tests
export function wallBase(
  wall: WallIn & { host?: string | null; offset?: number },
  slabs: readonly SlabIn[],
  g = 0,
  cap: number | null = null,
): Stand {
  const o = wall.offset ?? 0
  if (wall.host === 'ground' || slabs.length === 0) {
    return { stands: g + o, on: null, lowest: g + o, runs: [{ start: 0, end: 1, height: g + o }] }
  }
  const elected = electWall(wall, slabs, g, wall.host ?? null, cap)
  return {
    stands: elected.stands + o,
    on: elected.on,
    lowest: elected.lowest + o,
    runs: elected.runs.map((run) => ({ ...run, height: run.height + o })),
  }
}

// ------------------------------------------------------------------ (10) the rectangle a thing stands on, and the slab under it
export type Foot = { u: number; v: number; width: number; depth: number; turn?: number }

export function cornersOf(foot: Foot, inset = 0): P[] {
  const hw = Math.max(0, foot.width / 2 - inset)
  const hd = Math.max(0, foot.depth / 2 - inset)
  const c = Math.cos(foot.turn ?? 0)
  const s = Math.sin(foot.turn ?? 0)
  return [
    { x: foot.u + (-hw * c + hd * s), y: foot.v + (-hw * s - hd * c) },
    { x: foot.u + (hw * c + hd * s), y: foot.v + (hw * s - hd * c) },
    { x: foot.u + (hw * c - hd * s), y: foot.v + (hw * s + hd * c) },
    { x: foot.u + (-hw * c - hd * s), y: foot.v + (-hw * s + hd * c) },
  ]
}

function meet(a1: P, a2: P, b1: P, b2: P): boolean {
  const side = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const d1 = side(b1, b2, a1)
  const d2 = side(b1, b2, a2)
  const d3 = side(a1, a2, b1)
  const d4 = side(a1, a2, b2)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  const within = (p: P, q: P, r: P) =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y)
  return (
    (d1 === 0 && within(b1, b2, a1)) ||
    (d2 === 0 && within(b1, b2, a2)) ||
    (d3 === 0 && within(a1, a2, b1)) ||
    (d4 === 0 && within(a1, a2, b2))
  )
}

export function rectangleOverlaps(foot: Foot, outline: Ring, inset = 0): boolean {
  const corners = cornersOf(foot, inset)
  if (corners.some((corner) => insideOf(corner, outline))) return true
  const ring: Ring = corners.map((corner) => [corner.x, corner.y] as const)
  if (outline.some(([u, v]) => insideOf({ x: u, y: v }, ring))) return true
  for (let i = 0; i < 4; i += 1) {
    for (let k = 0; k < outline.length; k += 1) {
      if (meet(corners[i]!, corners[(i + 1) % 4]!, at(outline, k), at(outline, (k + 1) % outline.length))) return true
    }
  }
  return false
}

export function carries(slab: SlabIn, foot: Foot): boolean {
  if (slab.outline.length < 3) return false
  if (!rectangleOverlaps(foot, slab.outline, 0.01)) return false
  for (const hole of slab.holes ?? []) {
    if (hole.length >= 3 && insideOf({ x: foot.u, y: foot.v }, hole)) return false
  }
  return true
}

// ------------------------------------------------------------------ (9) what a floor-standing thing stands on
export function footSupport(foot: Foot, slabs: readonly SlabIn[], cap: number | null = null): { top: number; on: string | null } {
  let top = Number.NEGATIVE_INFINITY
  let on: string | null = null
  for (const slab of slabs) {
    const t = slab.top ?? 0.05
    if (cap !== null && t > cap + 0.05) continue
    if (!carries(slab, foot)) continue
    if (t > top) {
      top = t
      on = slab.id
    }
  }
  return on === null ? { top: 0, on: null } : { top, on }
}

// feet: the thing's rectangles; g: the level base under its own point; host: the slab it names; cap: the pointer's
export function liftOf(
  feet: readonly Foot[],
  slabs: readonly SlabIn[],
  g = 0,
  host: string | null = null,
  cap: number | null = null,
): number {
  if (cap === null && host) {
    if (host === 'ground') return g
    const named = slabs.find((slab) => slab.id === host)
    if (named && feet.some((foot) => carries(named, foot))) {
      const top = named.top ?? 0.05
      return Number.isFinite(top) ? top : 0
    }
  }
  let rest = Number.NEGATIVE_INFINITY
  for (const foot of feet) {
    const support = footSupport(foot, slabs, cap)
    const height = support.on === null ? g : Number.isFinite(support.top) ? support.top : 0
    if (height > rest) rest = height
  }
  return Number.isFinite(rest) ? rest : g
}

// under one point (the elevator's rule): the highest slab top over the point, never under 0
export function topUnderPoint(p: P, slabs: readonly SlabIn[]): number {
  let top = 0
  for (const slab of slabs) {
    if (slab.outline.length < 3 || !insideOf(p, slab.outline)) continue
    if ((slab.holes ?? []).some((hole) => hole.length >= 3 && insideOf(p, hole))) continue
    top = Math.max(top, slab.top ?? 0.05)
  }
  return top
}

// ------------------------------------------------------------------ (2) a level's point on the site, (11) the level base
export type BuildingAt = { u: number; up: number; v: number; turn: number } // its place on the site, its turn about the vertical

// a point of a level, on the site
export function onSite(p: P, building: BuildingAt | null): P {
  if (!building) return p
  const c = Math.cos(building.turn)
  const s = Math.sin(building.turn)
  return { x: c * p.x + s * p.y + building.u, y: -s * p.x + c * p.y + building.v }
}

// F: the level's floor (1); ground: the terrain's height at a site point, or null when the site has none
export function levelBase(p: P, F: number, building: BuildingAt | null, ground: ((site: P) => number) | null): number {
  if (!ground) return 0
  const floor = (building?.up ?? 0) + F
  if (Math.abs(floor) >= 1e-4) return 0
  return ground(onSite(p, building)) - floor
}

// ------------------------------------------------------------------ (12) a slab's limit under walls, a slab on a plane
// walls: the level's walls with whether a height is stored; h: the level's stored storey height
export function slabLimit(
  proposed: number,
  slab: SlabIn,
  walls: ReadonlyArray<WallIn & { height?: number }>,
  slabs: readonly SlabIn[],
  h: number,
): { top: number; held: boolean } {
  const limit = h - 0.5
  if (proposed <= limit || slab.outline.length < 3) return { top: proposed, held: false }
  const raised = { ...slab, top: proposed }
  const set = slabs.some((one) => one.id === slab.id) ? slabs.map((one) => (one.id === slab.id ? raised : one)) : [...slabs, raised]
  for (const wall of walls) {
    if (wall.height !== undefined) continue
    if (!bandOverlaps(wall, slab.outline)) continue
    if (Math.abs(electWall(wall, set).stands - proposed) <= POOL) return { top: limit, held: true }
  }
  return { top: proposed, held: false }
}

// how high the slab may be dragged at all: the limit when a wall with no stored height would stand on it
export function slabCeiling(
  slab: SlabIn,
  walls: ReadonlyArray<WallIn & { height?: number }>,
  slabs: readonly SlabIn[],
  h: number,
): number {
  const probe = Math.max(h, ...slabs.map((one) => one.top ?? 0.05)) + 1
  return slabLimit(probe, slab, walls, slabs, h).held ? h - 0.5 : Number.POSITIVE_INFINITY
}

export const slabOnPlane = (top: number, recessed: boolean, plane: number | null): number =>
  recessed || plane === null || !Number.isFinite(plane) ? top : top + plane

// ------------------------------------------------------------------ (13) the name
export function nameOf(ordinal: number, stored?: string): string {
  if (stored) return stored
  if (ordinal === 0) return 'Ground Floor'
  return ordinal > 0 ? `Floor ${ordinal}` : `Basement ${-ordinal}`
}

// ------------------------------------------------------------------ (14) how a level is shown (display only)
export type Mode = 'stacked' | 'exploded' | 'solo' | 'manual'
export const shownAt = (F: number, ordinal: number, mode: Mode): number => F + (mode === 'exploded' ? ordinal * 5 : 0)
export const afterFrame = (y: number, target: number, seconds: number): number => y + (target - y) * Math.min(1, 12 * seconds)
// in solo, with a level chosen: the chosen one is drawn, those above it only cast shadows, those below are not drawn
export function soloState(ordinal: number, chosen: number | null, isChosen: boolean, mode: Mode): 'drawn' | 'shadow only' | 'not drawn' {
  if (mode !== 'solo' || chosen === null || isChosen) return 'drawn'
  return ordinal > chosen ? 'shadow only' : 'not drawn'
}
