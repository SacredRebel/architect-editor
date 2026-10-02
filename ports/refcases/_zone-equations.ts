// The port note's equations for the zone, the unit and room detection (entry 10), written out
// as code. Nothing here calls the old editor: the reference cases hold these against it.
// Entry 1's wall equations are used where entry 10 refers to them (the sagitta as used, a place
// on a bent wall). The numbers in brackets are the entry's equations.
import { type P, placeOn, sagittaOf } from './_wall-equations'

export type { P }
export type Side = 'interior' | 'exterior' | 'unknown'
// a wall as entry 10 reads it: S and E in plan (u, v), s the stored sagitta, thickness as stored
export type ZWall = { id: string; S: P; E: P; s?: number; thickness?: number; front?: Side; back?: Side }
export type Face = { wallId: string; face: 'front' | 'back'; points: P[] }
export type Room = { polygon: P[]; faces: Face[]; wallIds: string[]; id: string }

const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y })
const mul = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k })
const dot = (a: P, b: P): number => a.x * b.x + a.y * b.y
const cross = (a: P, b: P): number => a.x * b.y - a.y * b.x
const len = (a: P): number => Math.hypot(a.x, a.y)
const dist = (a: P, b: P): number => len(sub(b, a))
const left = (a: P): P => ({ x: -a.y, y: a.x })
const lerp = (a: P, b: P, t: number): P => add(a, mul(sub(b, a), t))
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id))

// the nearest point of the segment a b to p: how far, and where along (not clamped)
function toSegment(p: P, a: P, b: P, tiny = 1e-12): { d: number; t: number } {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 <= tiny) return { d: dist(p, a), t: 0 }
  const t = dot(sub(p, a), ab) / l2
  return { d: dist(p, lerp(a, b, Math.max(0, Math.min(1, t)))), t }
}
const toOutline = (p: P, outline: P[], tiny = 1e-12): number =>
  Math.min(...outline.map((a, i) => toSegment(p, a, outline[(i + 1) % outline.length]!, tiny).d))

// ray casting, as every test of the entry uses it: a point on the outline itself can fall on either side
function rayInside(p: P, outline: P[], guard = 0): boolean {
  let inside = false
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i]!
    const b = outline[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + guard) + a.x) inside = !inside
  }
  return inside
}

// ------------------------------------------------------------------ (1) the outline's measures
export function signedArea(outline: P[]): number {
  let twice = 0
  for (let i = 0; i < outline.length; i += 1) twice += cross(outline[i]!, outline[(i + 1) % outline.length]!)
  return twice / 2
}
export const areaOf = (outline: P[]): number => Math.abs(signedArea(outline))
export const edgesOf = (outline: P[]): number[] => outline.map((a, i) => dist(a, outline[(i + 1) % outline.length]!))
export const perimeterOf = (outline: P[]): number => edgesOf(outline).reduce((sum, edge) => sum + edge, 0)

// ------------------------------------------------------------------ (2) the centroid, and where the labels stand
export function centroidOf(outline: P[]): P | null {
  const A = signedArea(outline)
  if (Math.abs(A) < 1e-9) return null
  let cu = 0
  let cv = 0
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i]!
    const b = outline[(i + 1) % outline.length]!
    cu += (a.x + b.x) * cross(a, b)
    cv += (a.y + b.y) * cross(a, b)
  }
  return { x: cu / (6 * A), y: cv / (6 * A) }
}
// the name in the plan: the centroid, or the middle of the outline's box when it has no area
export function nameLabelAt(outline: P[]): P | null {
  if (outline.length < 3) return null
  const c = centroidOf(outline)
  if (c) return c
  const us = outline.map((p) => p.x)
  const vs = outline.map((p) => p.y)
  return { x: (Math.min(...us) + Math.max(...us)) / 2, y: (Math.min(...vs) + Math.max(...vs)) / 2 }
}
// the area label of a selected zone: none without an area
export function areaLabelAt(outline: P[]): P | null {
  return outline.length < 3 || areaOf(outline) <= 1e-6 ? null : centroidOf(outline)
}
// the anchor of the hover report, 0.08 m up: the level's origin when the outline has no area
export function hoverAnchor(outline: P[], up = 0.08): [number, number, number] | null {
  if (outline.length < 3) return null
  const c = centroidOf(outline)
  return c ? [c.x, up, c.y] : [0, up, 0]
}

// ------------------------------------------------------------------ (3) the walls as a graph
const keyOf = (p: P): string => `${p.x.toFixed(3)},${p.y.toFixed(3)}`
const bent = (w: ZWall): boolean => sagittaOf({ id: w.id, S: w.S, E: w.E, s: w.s ?? 0, thickness: 0.1 }) !== 0

// a bent wall as chords: a span is halved while its middle stands more than 0.04 off its chord, six times at most
export function chordsOf(w: ZWall): P[] {
  const plain = { id: w.id, S: w.S, E: w.E, s: w.s ?? 0, thickness: 0.1 }
  const halve = (t0: number, p0: P, t1: number, p1: P, depth: number): P[] => {
    const tm = (t0 + t1) / 2
    const pm = placeOn(plain, tm).P
    const run = sub(p1, p0)
    const off = dot(run, run) < 1e-9 ? dist(pm, p0) : Math.abs(cross(sub(pm, p0), run)) / len(run)
    if (depth >= 6 || off <= 0.04) return [p0, p1]
    return [...halve(t0, p0, tm, pm, depth + 1).slice(0, -1), ...halve(tm, pm, t1, p1, depth + 1)]
  }
  return halve(0, w.S, 1, w.E, 0)
}

// a straight wall cut at every wall end that lies on it: within 0.08 of it, more than 0.08 from both its ends
function cutAtEnds(w: ZWall, ends: P[]): P[] {
  const L = dist(w.S, w.E)
  if (L < 1e-9) return [w.S, w.E]
  const on: Array<{ V: P; t: number }> = []
  for (const V of ends) {
    const { d, t } = toSegment(V, w.S, w.E)
    if (d > 0.08) continue
    if (t * L <= 0.08 || t * L >= L - 0.08) continue
    on.push({ V, t })
  }
  on.sort((a, b) => a.t - b.t)
  const run = [w.S]
  let last = keyOf(w.S)
  for (const { V } of on) {
    if (keyOf(V) === last) continue
    run.push(V)
    last = keyOf(V)
  }
  if (last !== keyOf(w.E)) run.push(w.E)
  return run
}

type Half = { id: string; back: string; from: string; to: string; angle: number; points: P[]; wallId: string; face: 'front' | 'back' }

// the same outline, wherever it starts and whichever way it runs, gives the same text
function signatureOf(outline: P[]): string {
  const smallestTurn = (keys: string[]) => {
    let best = ''
    for (let i = 0; i < keys.length; i += 1) {
      const text = [...keys.slice(i), ...keys.slice(0, i)].join('|')
      if (!best || text < best) best = text
    }
    return best
  }
  const keys = outline.map(keyOf)
  const one = smallestTurn(keys)
  const other = smallestTurn([...keys].reverse())
  return one < other ? one : other
}

// ------------------------------------------------------------------ (3) (4) (5) the rooms of a level's walls
export function roomsOf(walls: ZWall[], levelId = 'level'): Room[] {
  if (walls.length < 3) return []
  const endByKey = new Map<string, P>()
  for (const w of walls) for (const p of [w.S, w.E]) if (!endByKey.has(keyOf(p))) endByKey.set(keyOf(p), p)
  const ends = [...endByKey.values()]

  const halves = new Map<string, Half>()
  const leaving = new Map<string, string[]>()
  for (const w of walls) {
    if (dist(w.S, w.E) <= 1e-4) continue
    const pieces: P[][] = []
    if (bent(w)) pieces.push(chordsOf(w))
    else {
      const run = cutAtEnds(w, ends)
      for (let i = 0; i + 1 < run.length; i += 1) pieces.push([run[i]!, run[i + 1]!])
    }
    pieces.forEach((points, k) => {
      const from = keyOf(points[0]!)
      const to = keyOf(points[points.length - 1]!)
      if (from === to) return
      const turned = [...points].reverse()
      const heading = (list: P[]) => Math.atan2(list[1]!.y - list[0]!.y, list[1]!.x - list[0]!.x)
      const forward = `${w.id}#${k}:f`
      const reverse = `${w.id}#${k}:r`
      halves.set(forward, { id: forward, back: reverse, from, to, angle: heading(points), points, wallId: w.id, face: 'front' })
      halves.set(reverse, { id: reverse, back: forward, from: to, to: from, angle: heading(turned), points: turned, wallId: w.id, face: 'back' })
      leaving.set(from, [...(leaving.get(from) ?? []), forward])
      leaving.set(to, [...(leaving.get(to) ?? []), reverse])
    })
  }
  // (4) at a node the edges that leave it, by their angle; the next edge of a walk is the one before the way back
  for (const list of leaving.values()) list.sort((a, b) => halves.get(a)!.angle - halves.get(b)!.angle)
  const next = (id: string): string => {
    const edge = halves.get(id)!
    const list = leaving.get(edge.to)!
    return list[(list.indexOf(edge.back) - 1 + list.length) % list.length]!
  }
  // a closed walk cut into loops that pass no node twice
  const loopsOf = (walk: string[]): string[][] => {
    const loops: string[][] = []
    const edges: string[] = []
    const nodes = [halves.get(walk[0]!)!.from]
    for (const id of walk) {
      edges.push(id)
      const at = nodes.indexOf(halves.get(id)!.to)
      if (at < 0) {
        nodes.push(halves.get(id)!.to)
        continue
      }
      const loop = edges.slice(at)
      if (loop.length >= 3) loops.push(loop)
      nodes.length = at + 1
      edges.length = at
    }
    return edges.length === 0 && nodes.length === 1 ? loops : []
  }
  const rooms: Array<Room & { signature: string }> = []
  const walked = new Set<string>()
  const most = Math.min(2000, halves.size + 10)
  for (const first of halves.keys()) {
    if (walked.has(first)) continue
    const walk: string[] = []
    let now = first
    let closed = false
    for (let step = 0; step < most; step += 1) {
      walked.add(now)
      walk.push(now)
      now = next(now)
      if (now === first) {
        closed = true
        break
      }
    }
    if (!closed || walk.length < 3) continue
    for (const loop of loopsOf(walk)) {
      // (5) the loop's own points, neighbours closer than 1e-4 taken as one
      const all = loop.flatMap((id, i) => (i === loop.length - 1 ? halves.get(id)!.points : halves.get(id)!.points.slice(0, -1)))
      const outline: P[] = []
      for (const p of all) if (outline.length === 0 || dist(outline[outline.length - 1]!, p) > 1e-4) outline.push(p)
      if (outline.length > 2 && dist(outline[0]!, outline[outline.length - 1]!) <= 1e-4) outline.pop()
      if (outline.length < 3) continue
      const A = signedArea(outline)
      if (A <= 0 || A < 0.5 || A > 10000) continue
      const signature = signatureOf(outline)
      if (rooms.some((room) => room.signature === signature)) continue
      const faces = loop.map((id) => ({ wallId: halves.get(id)!.wallId, face: halves.get(id)!.face, points: halves.get(id)!.points }))
      rooms.push({
        polygon: outline,
        faces,
        wallIds: [...new Set(faces.map((face) => face.wallId))],
        id: `space-${levelId}-${signature.slice(0, 12)}`,
        signature,
      })
    }
  }
  return rooms.sort((a, b) => areaOf(b.polygon) - areaOf(a.polygon))
}

// ------------------------------------------------------------------ (6) which side of a wall is indoors
export function sidesOf(w: ZWall, rooms: Room[]): { front: Side; back: Side } {
  if (rooms.length === 0) return { front: 'unknown', back: 'unknown' }
  const L = dist(w.S, w.E)
  const middle = L < 1e-9 ? w.S : lerp(w.S, w.E, 0.5)
  const n = L < 1e-9 ? { x: 0, y: 1 } : left(mul(sub(w.E, w.S), 1 / L))
  const reach = Math.max((w.thickness ?? 0.2) / 2 + 0.08, 0.16)
  const indoors = (p: P) => rooms.some((room) => room.polygon.length >= 3 && rayInside(p, room.polygon, 1e-12))
  const front = indoors(add(middle, mul(n, reach)))
  const back = indoors(sub(middle, mul(n, reach)))
  if (front === back) return { front: w.front ?? 'unknown', back: w.back ?? 'unknown' }
  return { front: front ? 'interior' : 'exterior', back: back ? 'interior' : 'exterior' }
}

// ------------------------------------------------------------------ (7) does a wall close a room; do two walls touch
export function closesRoom(walls: ZWall[], w: ZWall): boolean {
  const chords = bent(w) ? chordsOf(w) : [w.S, w.E]
  const places = chords.length === 2 ? [chords[0]!, lerp(chords[0]!, chords[1]!, 0.5), chords[1]!] : chords
  return roomsOf(walls).some((room) => places.filter((p) => toOutline(p, room.polygon, 1e-4) <= 0.08).length >= 2)
}
export function touches(w: ZWall, others: ZWall[]): boolean {
  return others.some(
    (o) =>
      o.id !== w.id &&
      (toSegment(w.S, o.S, o.E, 1e-4).d < 0.1 ||
        toSegment(w.E, o.S, o.E, 1e-4).d < 0.1 ||
        toSegment(o.S, w.S, w.E, 1e-4).d < 0.1 ||
        toSegment(o.E, w.S, w.E, 1e-4).d < 0.1),
  )
}

// ------------------------------------------------------------------ (8) a zone taken from a room
export type ZoneOutline = { polygon: P[]; fromWalls: boolean; wallIds: string[] }
// what detection writes on a zone: null when no room is its own, else only what differs
export function adopted(zone: ZoneOutline, rooms: Room[]): { fromWalls?: true; wallIds?: string[]; polygon?: P[] } | null {
  const room =
    zone.fromWalls && zone.wallIds.length >= 3
      ? rooms.find((candidate) => sameSet(candidate.wallIds, zone.wallIds))
      : rooms.find((candidate) => signatureOf(candidate.polygon) === signatureOf(zone.polygon))
  if (!room) return null
  const samePoints =
    zone.polygon.length === room.polygon.length && zone.polygon.every((p, i) => p.x === room.polygon[i]!.x && p.y === room.polygon[i]!.y)
  return {
    ...(zone.fromWalls ? {} : { fromWalls: true as const }),
    ...(sameSet(zone.wallIds, room.wallIds) ? {} : { wallIds: room.wallIds }),
    ...(samePoints ? {} : { polygon: room.polygon }),
  }
}
// the outline a zone is read with: the room its own walls close now, else the stored one
export function liveOutline(zone: ZoneOutline, wallOf: (id: string) => ZWall | undefined): P[] {
  if (!zone.fromWalls || zone.wallIds.length < 3) return zone.polygon
  const walls = zone.wallIds.flatMap((id) => {
    const w = wallOf(id)
    return w ? [w] : []
  })
  if (walls.length !== zone.wallIds.length) return zone.polygon
  return roomsOf(walls).find((room) => sameSet(room.wallIds, zone.wallIds))?.polygon ?? zone.polygon
}

// ------------------------------------------------------------------ (9) the clear dimensions of a room
type Line = { start: P; end: P }
export type Dim = { start: P; end: P; length: number; label: string }
// a length as the editor writes it in metres: to the centimetre, no zeros at the end
export const metres = (length: number): string => `${Number.parseFloat(Math.abs(length).toFixed(2))}m`
export type RoomZone = {
  id: string
  level: string | null
  role: 'generic' | 'room'
  policy: 'none' | 'inside-faces' | 'finish-faces'
  enclosure: 'auto' | 'enclosed' | 'open'
  fromWalls: boolean
  wallIds: string[]
}
const unit = (a: P, b: P): P | null => (dist(a, b) <= 1e-4 ? null : mul(sub(b, a), 1 / dist(a, b)))

// a room face: the wall's centreline piece moved half the wall's thickness toward the room
function faceLine(face: Face, w: ZWall): Line | null {
  const along = unit(w.S, w.E)
  if (!along) return null
  const shift = mul(left(along), ((w.thickness ?? 0.1) / 2) * (face.face === 'front' ? 1 : -1))
  return { start: add(face.points[0]!, shift), end: add(face.points[face.points.length - 1]!, shift) }
}
function facesOfRoom(zone: RoomZone, wallOf: (id: string) => ZWall | undefined): { room: Room; lines: Line[] } | null {
  const walls = zone.wallIds.flatMap((id) => {
    const w = wallOf(id)
    return w ? [w] : []
  })
  if (walls.length !== zone.wallIds.length) return null
  const room = roomsOf(walls).find((candidate) => sameSet(candidate.wallIds, zone.wallIds))
  if (!room) return null
  const lines: Line[] = []
  for (const face of room.faces) {
    const w = wallOf(face.wallId)!
    if (Math.abs(w.s ?? 0) > 1e-4) return null
    const line = faceLine(face, w)
    if (!line) return null
    lines.push(line)
  }
  return { room, lines }
}
function inLine(a: Line, b: Line): boolean {
  const da = unit(a.start, a.end)
  const db = unit(b.start, b.end)
  if (!(da && db)) return false
  return dot(da, db) > 1 - 1e-3 && Math.abs(cross(da, sub(b.start, a.start))) <= 1e-4
}
function joined(lines: Line[]): Line[] {
  const out: Line[] = []
  for (const line of lines) {
    const before = out[out.length - 1]
    if (before && inLine(before, line)) before.end = line.end
    else out.push({ ...line })
  }
  while (out.length > 1 && inLine(out[out.length - 1]!, out[0]!)) {
    out[0]!.start = out[out.length - 1]!.start
    out.pop()
  }
  return out
}
function meet(a: Line, b: Line): P | null {
  const da = sub(a.end, a.start)
  const db = sub(b.end, b.start)
  const den = cross(da, db)
  if (Math.abs(den) <= 1e-4) return null
  return add(a.start, mul(da, cross(sub(b.start, a.start), db) / den))
}
const cornersOf = (lines: Line[]): Array<P | null> => lines.map((line, i) => meet(lines[(i + lines.length - 1) % lines.length]!, line))

// the outline between the faces of a room (what its clear dimensions are measured in)
export function clearOutline(zone: RoomZone, wallOf: (id: string) => ZWall | undefined): P[] | null {
  const found = facesOfRoom(zone, wallOf)
  if (!found) return null
  const corners = cornersOf(joined(found.lines))
  return corners.some((corner) => corner === null) ? null : (corners as P[])
}

function between(a0: P, a1: P, b0: P, b1: P, at: number): Dim | null {
  const start = lerp(a0, a1, at)
  const end = lerp(b0, b1, at)
  if (!unit(start, end) || dist(start, end) < 0.3) return null
  return { start, end, length: dist(start, end), label: metres(dist(start, end)) }
}
// two faces that run the same way and face each other over a stretch: measured at the middle of that stretch
function across(a: Line, b: Line, along: P, least: number): { start: P; end: P } | null {
  const lo = Math.max(Math.min(dot(a.start, along), dot(a.end, along)), Math.min(dot(b.start, along), dot(b.end, along)))
  const hi = Math.min(Math.max(dot(a.start, along), dot(a.end, along)), Math.max(dot(b.start, along), dot(b.end, along)))
  if (hi - lo < least) return null
  const at = (lo + hi) / 2
  return {
    start: add(a.start, mul(along, at - dot(a.start, along))),
    end: add(b.start, mul(along, at - dot(b.start, along))),
  }
}

export function clearDimensions(zone: RoomZone, wallOf: (id: string) => ZWall | undefined, neighbours: RoomZone[] = []): Dim[] {
  if (zone.role !== 'room' || zone.policy === 'none' || zone.enclosure === 'open' || !zone.fromWalls || !zone.level || zone.wallIds.length < 3) return []
  const found = facesOfRoom(zone, wallOf)
  if (!found) return []
  const lines = joined(found.lines)
  if (lines.length < 4) return []

  let dims: Dim[] = []
  const corners = cornersOf(lines)
  let rectangle: P[] | null = null
  if (lines.length === 4 && corners.every((corner) => corner !== null)) {
    const r = corners as P[]
    const sides = r.map((corner, i) => unit(corner, r[(i + 1) % 4]!))
    if (sides.every((side) => side !== null)) {
      const [a, b, c, d] = sides as P[]
      const square = [dot(a!, b!), dot(b!, c!), dot(c!, d!), dot(d!, a!)].every((value) => Math.abs(value) <= 1e-3)
      if (square && dot(a!, c!) <= -1 + 1e-3 && dot(b!, d!) <= -1 + 1e-3) rectangle = r
    }
  }
  if (rectangle) {
    const first = between(rectangle[0]!, rectangle[1]!, rectangle[3]!, rectangle[2]!, 0.32)
    const second = between(rectangle[1]!, rectangle[2]!, rectangle[0]!, rectangle[3]!, 0.68)
    dims = first && second ? [first, second] : []
  } else {
    if (corners.some((corner) => corner === null)) return []
    const outline = corners as P[]
    const turns = outline.map((corner, i) => unit(corner, outline[(i + 1) % outline.length]!))
    if (turns.some((turn) => turn === null)) return []
    if (turns.some((turn, i) => Math.abs(dot(turn!, turns[(i + 1) % turns.length]!)) > 1e-3)) return []
    const seen = new Set<string>()
    for (let i = 0; i < lines.length; i += 1) {
      const along = unit(lines[i]!.start, lines[i]!.end)
      if (!along) return []
      for (let j = i + 1; j < lines.length; j += 1) {
        const other = unit(lines[j]!.start, lines[j]!.end)
        if (!other) return []
        if (Math.abs(dot(along, other)) < 1 - 1e-3) continue
        const span = across(lines[i]!, lines[j]!, along, 0.3)
        if (!span) continue
        if (!rayInside(lerp(span.start, span.end, 0.5), outline)) continue
        if (!unit(span.start, span.end) || dist(span.start, span.end) < 0.3) continue
        const mark = (p: P) => `${Math.round(p.x / 1e-4)},${Math.round(p.y / 1e-4)}`
        const key = mark(span.start) < mark(span.end) ? `${mark(span.start)}|${mark(span.end)}` : `${mark(span.end)}|${mark(span.start)}`
        if (seen.has(key)) continue
        seen.add(key)
        dims.push({ ...span, length: dist(span.start, span.end), label: metres(dist(span.start, span.end)) })
      }
    }
  }
  if (dims.length === 0) return []

  // across a wall shared with a neighbouring room: only with finish faces, given by the zone whose id sorts first
  if (zone.policy !== 'finish-faces') return dims
  const mine = new Map(found.room.faces.map((face) => [face.wallId, face]))
  for (const other of neighbours) {
    if (other.id === zone.id || !(zone.id < other.id) || other.role !== 'room' || other.policy !== 'finish-faces') continue
    if (other.enclosure === 'open' || !other.fromWalls || other.level !== zone.level) continue
    const shared = other.wallIds.filter((id) => mine.has(id))
    if (shared.length === 0) continue
    const theirs = facesOfWalls(other, wallOf)
    if (!theirs) continue
    for (const id of shared) {
      const w = wallOf(id)
      const a = mine.get(id)
      const b = theirs.get(id)
      if (!(w && a && b)) continue
      const la = faceLine(a, w)
      const lb = faceLine(b, w)
      if (!(la && lb)) continue
      const along = unit(la.start, la.end)
      const other2 = unit(lb.start, lb.end)
      if (!along || !other2 || Math.abs(dot(along, other2)) < 1 - 1e-3) continue
      const span = across(la, lb, along, 0.3)
      if (!span || dist(span.start, span.end) < 0.03 || !unit(span.start, span.end)) continue
      dims.push({ ...span, length: dist(span.start, span.end), label: `R-R ${metres(dist(span.start, span.end))}` })
    }
  }
  return dims
}
function facesOfWalls(zone: RoomZone, wallOf: (id: string) => ZWall | undefined): Map<string, Face> | null {
  const walls = zone.wallIds.flatMap((id) => {
    const w = wallOf(id)
    return w ? [w] : []
  })
  if (walls.length !== zone.wallIds.length) return null
  const room = roomsOf(walls).find((candidate) => sameSet(candidate.wallIds, zone.wallIds))
  return room ? new Map(room.faces.map((face) => [face.wallId, face])) : null
}

// ------------------------------------------------------------------ (10) what a zone holds: surfaces and volume
export type Cover = { polygon: P[]; holes: P[][]; datum: number }
export type Measure = { value: number } | { reason: string }

// inside an outline, a point within 1e-6 of it counting as asked
function within(p: P, outline: P[], onEdge = true): boolean {
  if (outline.length < 3) return false
  if (toOutline(p, outline) <= 1e-6) return onEdge
  return rayInside(p, outline)
}
const properCross = (a: P, b: P, c: P, d: P): boolean =>
  cross(sub(b, a), sub(c, a)) * cross(sub(b, a), sub(d, a)) < -1e-12 && cross(sub(d, c), sub(a, c)) * cross(sub(d, c), sub(b, c)) < -1e-12
const edgesCross = (a: P[], b: P[]): boolean =>
  a.some((p, i) => b.some((q, j) => properCross(p, a[(i + 1) % a.length]!, q, b[(j + 1) % b.length]!)))
function sameRegion(a: P[], b: P[]): boolean {
  if (a.length < 3 || b.length < 3) return false
  if (Math.abs(areaOf(a) - areaOf(b)) > Math.max(0.02, Math.max(areaOf(a), areaOf(b)) * 0.01)) return false
  return a.every((p) => toOutline(p, b) <= 0.08) && b.every((p) => toOutline(p, a) <= 0.08)
}
const reachesInto = (a: P[], b: P[]): boolean =>
  a.some((p, i) => within(p, b, false) || within(lerp(p, a[(i + 1) % a.length]!, 0.5), b, false))
function overlap(a: P[], b: P[]): boolean {
  return sameRegion(a, b) || reachesInto(a, b) || reachesInto(b, a) || edgesCross(a, b)
}
function holds(outer: P[], inner: P[]): boolean {
  if (outer.length < 3 || inner.length < 3) return false
  if (sameRegion(outer, inner)) return true
  if (!inner.every((p) => within(p, outer) || toOutline(p, outer) <= 0.08)) return false
  if (edgesCross(inner, outer)) return false
  return reachesInto(inner, outer)
}
// the share of an outline that lies under some cover: 24 x 24 places in its box
export function coveredShare(outline: P[], covers: P[][]): number {
  if (outline.length < 3 || covers.length === 0) return 0
  const us = outline.map((p) => p.x)
  const vs = outline.map((p) => p.y)
  const u0 = Math.min(...us)
  const v0 = Math.min(...vs)
  const du = Math.max(...us) - u0
  const dv = Math.max(...vs) - v0
  if (du <= 1e-9 || dv <= 1e-9) return 0
  let inside = 0
  let covered = 0
  for (let i = 0; i < 24; i += 1) {
    for (let j = 0; j < 24; j += 1) {
      const p = { x: u0 + ((i + 0.5) / 24) * du, y: v0 + ((j + 0.5) / 24) * dv }
      if (!within(p, outline)) continue
      inside += 1
      if (covers.some((cover) => within(p, cover))) covered += 1
    }
  }
  return inside > 0 ? covered / inside : 0
}
function proven(outline: P[], covers: Cover[], words: { one: string; many: string; datum: string }): { area: number; datum: number } | { reason: string } {
  const over = covers.filter((cover) => overlap(outline, cover.polygon) && coveredShare(outline, [cover.polygon]) > 0)
  if (over.length === 0 || coveredShare(outline, over.map((cover) => cover.polygon)) < 0.95) {
    return { reason: `No ${words.one} coverage proves this zone.` }
  }
  const datum = over[0]!.datum
  if (!Number.isFinite(datum) || over.some((cover) => Math.abs(cover.datum - datum) > 1e-4)) {
    return { reason: `${words.many} covering this zone have different ${words.datum}.` }
  }
  let area = areaOf(outline)
  const seen = new Set<string>()
  for (const cover of over) {
    for (const hole of cover.holes) {
      const one = hole.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join('|')
      const other = [...hole].reverse().map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join('|')
      const key = one < other ? one : other
      if (seen.has(key)) continue
      seen.add(key)
      if (holds(hole, outline)) return { reason: 'A surface opening removes this zone.' }
      if (holds(outline, hole)) area -= areaOf(hole)
      else if (overlap(outline, hole)) return { reason: 'A surface opening crosses the zone boundary.' }
    }
  }
  return { area: Math.max(0, area), datum }
}
// how much of the run a b lies in the outline or within `near` of it
function lengthIn(a: P, b: P, outline: P[], near: number): number {
  const run = sub(b, a)
  if (len(run) <= 1e-9) return 0
  const cuts = [0, 1]
  for (let i = 0; i < outline.length; i += 1) {
    const p = outline[i]!
    const edge = sub(outline[(i + 1) % outline.length]!, p)
    const den = cross(run, edge)
    if (Math.abs(den) > 1e-12) {
      const t = cross(sub(p, a), edge) / den
      const s = cross(sub(p, a), run) / den
      if (t > 0 && t < 1 && s >= -1e-9 && s <= 1 + 1e-9) cuts.push(t)
    }
    const foot = toSegment(p, a, b)
    if (foot.d <= near && foot.t > 0 && foot.t < 1) cuts.push(foot.t)
  }
  cuts.sort((x, y) => x - y)
  const kept = cuts.filter((value, i) => i === 0 || value - cuts[i - 1]! > 1e-7)
  let total = 0
  for (let i = 0; i + 1 < kept.length; i += 1) {
    const middle = lerp(a, b, (kept[i]! + kept[i + 1]!) / 2)
    if (within(middle, outline) || toOutline(middle, outline) <= near) total += len(run) * (kept[i + 1]! - kept[i]!)
  }
  return total
}

export function quantitiesOf(
  outline: P[],
  walls: ZWall[],
  bodyHeight: (wallId: string) => number,
  floors: Cover[],
  ceilings: Cover[],
  levelId = 'level',
) {
  const edges = edgesOf(outline)
  const floor = proven(outline, floors, { one: 'slab', many: 'Slabs', datum: 'elevations' })
  const ceiling = proven(outline, ceilings, { one: 'ceiling', many: 'Ceilings', datum: 'heights' })

  // the room faces that lie in the zone: every face of every room that reaches into it
  const rooms = roomsOf(walls, levelId).filter((room) => overlap(outline, room.polygon))
  const enclosed =
    rooms.length > 0 &&
    coveredShare(outline, rooms.map((room) => room.polygon)) >= 0.95 &&
    rooms.every((room) => coveredShare(room.polygon, [outline]) >= 0.95)
  const wallOf = new Map(walls.map((w) => [w.id, w]))
  const fromRooms: Array<{ id: string; length: number }> = []
  const counted = new Set<string>()
  for (const room of rooms) {
    for (const face of room.faces) {
      const one = face.points.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join('|')
      const other = [...face.points].reverse().map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join('|')
      const key = `${face.wallId}:${face.face}:${one < other ? one : other}`
      if (counted.has(key)) continue
      counted.add(key)
      const near = (wallOf.get(face.wallId)!.thickness ?? 0.1) / 2 + 0.08
      let length = 0
      for (let i = 0; i + 1 < face.points.length; i += 1) length += lengthIn(face.points[i]!, face.points[i + 1]!, outline, near)
      if (length > 1e-6) fromRooms.push({ id: face.wallId, length })
    }
  }
  // else the zone's own outline, where every piece of it runs along a wall's centreline
  const paths = walls.map((w) => ({
    id: w.id,
    points: Array.from({ length: 33 }, (_, i) => placeOn({ id: w.id, S: w.S, E: w.E, s: w.s ?? 0, thickness: 0.1 }, i / 32).P),
  }))
  const toPath = (p: P, points: P[]) => Math.min(...points.slice(1).map((q, i) => toSegment(p, points[i]!, q).d))
  let alongOutline: Array<{ id: string; length: number }> | null = []
  outer: for (let e = 0; e < outline.length; e += 1) {
    const a = outline[e]!
    const b = outline[(e + 1) % outline.length]!
    if (edges[e]! <= 1e-6) continue
    const cuts = [0, 1]
    for (const path of paths) {
      for (const p of path.points) {
        const foot = toSegment(p, a, b)
        if (foot.d <= 0.08 && foot.t > 0 && foot.t < 1) cuts.push(foot.t)
      }
    }
    cuts.sort((x, y) => x - y)
    const kept = cuts.filter((value, i) => i === 0 || value - cuts[i - 1]! > 1e-6)
    for (let i = 0; i + 1 < kept.length; i += 1) {
      if (kept[i + 1]! - kept[i]! <= 1e-6) continue
      const three = [lerp(a, b, kept[i]!), lerp(a, b, (kept[i]! + kept[i + 1]!) / 2), lerp(a, b, kept[i + 1]!)]
      let best: { id: string; sum: number } | null = null
      for (const path of paths) {
        const far = three.map((p) => toPath(p, path.points))
        if (far.some((d) => d > 0.08)) continue
        const sum = far.reduce((x, y) => x + y, 0)
        if (!best || sum < best.sum) best = { id: path.id, sum }
      }
      if (!best) {
        alongOutline = null
        break outer
      }
      alongOutline.push({ id: best.id, length: edges[e]! * (kept[i + 1]! - kept[i]!) })
    }
  }
  if (alongOutline && alongOutline.length === 0) alongOutline = null

  const spans = fromRooms.length > 0 ? fromRooms : alongOutline
  const wallSurface: Measure = spans
    ? { value: spans.reduce((sum, span) => sum + span.length * bodyHeight(span.id), 0) }
    : { reason: 'No indoor-facing wall surface is proven within this zone.' }
  const floorSurface: Measure = 'area' in floor ? { value: floor.area } : floor
  let volume: Measure
  if (!('area' in floor)) volume = floor
  else if (!('area' in ceiling)) volume = ceiling
  else {
    const clear = ceiling.datum - floor.datum
    volume = Number.isFinite(clear) && clear > 0 ? { value: floor.area * clear } : { reason: 'The matching ceiling is not above the slab surface.' }
  }
  return {
    classification: enclosed || alongOutline ? 'enclosed-room' : 'footprint',
    area: areaOf(outline),
    perimeter: edges.reduce((sum, edge) => sum + edge, 0),
    edges,
    boundaryWalls: spans ? [...new Set(spans.map((span) => span.id))] : [],
    wallSurface,
    floorSurface,
    volume,
  }
}

// ------------------------------------------------------------------ (11) the room list
export type ListedRoom = { id: string; name: string; number: string; enclosure: 'auto' | 'enclosed' | 'open'; area: number; classification: string }
// room numbers in their natural order: a run of digits by its worth, letters without their case
function natural(a: string, b: string): number {
  const parts = (text: string) => text.toLowerCase().match(/\d+|\D+/g) ?? []
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < Math.min(pa.length, pb.length); i += 1) {
    const x = pa[i]!
    const y = pb[i]!
    const bothNumbers = /^\d/.test(x) && /^\d/.test(y)
    if (bothNumbers && Number(x) !== Number(y)) return Number(x) - Number(y)
    if (!bothNumbers && x !== y) return /^\d/.test(x) ? -1 : /^\d/.test(y) ? 1 : x < y ? -1 : 1
  }
  return pa.length - pb.length
}
const lettersOnly = (a: string, b: string): number => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0)
export function roomList(rooms: ListedRoom[]) {
  const sorted = [...rooms].sort(
    (a, b) => natural(a.number.trim(), b.number.trim()) || lettersOnly(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  const issues: string[] = []
  const numbered = new Map<string, number>()
  for (const room of sorted) {
    const number = room.number.trim()
    if (!number) issues.push(`Room ${room.name.trim() || room.id} has no room number`)
    else numbered.set(number.toUpperCase(), (numbered.get(number.toUpperCase()) ?? 0) + 1)
    if (room.enclosure === 'enclosed' && room.classification !== 'enclosed-room') {
      issues.push(`Room ${number || room.name.trim() || room.id} is marked enclosed but not proven`)
    }
  }
  for (const [number, count] of numbered) if (count >= 2) issues.push(`Duplicate room number ${number} (${count} rooms)`)
  return {
    rows: sorted.map((room) => ({
      id: room.id,
      number: room.number.trim() || '—',
      area: `${room.area.toFixed(2)} m²`,
      enclosure: room.enclosure === 'enclosed' ? 'Enclosed' : room.enclosure === 'open' ? 'Open' : room.classification === 'enclosed-room' ? 'Enclosed' : 'Open',
    })),
    issues,
  }
}

// ------------------------------------------------------------------ (12) a unit and its zones
export type UZone = { id: string; name: string; level: string | null; outline: P[] }
export type ULevel = { id: string; ordinal: number }
const membersOf = (members: string[], zones: Map<string, UZone>): UZone[] =>
  [...new Set(members)].flatMap((id) => (zones.has(id) ? [zones.get(id)!] : []))

export function unitReport(members: string[], zones: Map<string, UZone>, levels: Map<string, ULevel>) {
  const list = membersOf(members, zones)
  const ordinals = [...new Set(list.flatMap((zone) => (zone.level && levels.has(zone.level) ? [zone.level] : [])))].map((id) => levels.get(id)!.ordinal)
  return {
    count: list.length,
    areas: list.map((zone) => ({ name: zone.name, area: areaOf(zone.outline) })),
    gross: list.reduce((sum, zone) => sum + areaOf(zone.outline), 0),
    span: ordinals.length > 0 ? { from: Math.min(...ordinals), to: Math.max(...ordinals), count: ordinals.length } : null,
  }
}
// the unit a zone wears: the first, in the building's own order, that lists it
export const ownerOf = (zoneId: string, unitsOfBuilding: Array<{ id: string; members: string[] }>): string | null =>
  unitsOfBuilding.find((candidate) => candidate.members.includes(zoneId))?.id ?? null
export function unitWarnings(members: string[], zones: Map<string, UZone>, levels: Map<string, ULevel>): string[] {
  const list = membersOf(members, zones)
  const out: string[] = []
  if (list.length === 0) out.push('empty')
  const ordinals = [...new Set(list.flatMap((zone) => (zone.level && levels.has(zone.level) ? [levels.get(zone.level)!.ordinal] : [])))].sort((a, b) => a - b)
  if (ordinals.some((ordinal, i) => i > 0 && ordinal - ordinals[i - 1]! > 1)) out.push('non-adjacent-levels')
  return out
}

// a point is covered by an outline when it is inside it or within 1e-4 of it, and not inside one of its holes
const onOutline = (p: P, outline: P[]): boolean => toOutline(p, outline, 1e-18) <= 1e-4
function covers(p: P, outline: P[], holes: P[][] = []): boolean {
  if (outline.length < 3) return false
  if (!(rayInside(p, outline) || onOutline(p, outline))) return false
  return !holes.some((hole) => hole.length >= 3 && rayInside(p, hole) && !onOutline(p, hole))
}
// how much of the run a b lies inside an outline (its own edge counting as asked)
function runInside(a: P, b: P, outline: P[], onEdge: boolean): Array<[number, number]> {
  const run = sub(b, a)
  const L = len(run)
  if (L < 1e-9) return []
  const cuts = [0, 1]
  for (let i = 0; i < outline.length; i += 1) {
    const p = outline[i]!
    const edge = sub(outline[(i + 1) % outline.length]!, p)
    const den = cross(run, edge)
    if (Math.abs(den) < 1e-12) continue
    const t = cross(sub(p, a), edge) / den
    const s = cross(sub(p, a), run) / den
    if (t > 0 && t < 1 && s >= -1e-9 && s <= 1 + 1e-9) cuts.push(t)
  }
  cuts.sort((x, y) => x - y)
  const out: Array<[number, number]> = []
  for (let i = 1; i < cuts.length; i += 1) {
    if (cuts[i]! - cuts[i - 1]! < 1e-9) continue
    const middle = lerp(a, b, (cuts[i - 1]! + cuts[i]!) / 2)
    if (onOutline(middle, outline) ? onEdge : rayInside(middle, outline)) out.push([cuts[i - 1]! * L, cuts[i]! * L])
  }
  return out
}
function less(base: Array<[number, number]>, cut: Array<[number, number]>): number {
  // the length of `base` that no stretch of `cut` takes away
  let total = 0
  for (const [b0, b1] of base) {
    let at = b0
    for (const [c0, c1] of [...cut].sort((x, y) => x[0] - y[0])) {
      if (c1 <= at) continue
      if (c0 >= b1) break
      if (c0 > at) total += c0 - at
      at = Math.max(at, c1)
      if (at >= b1) break
    }
    if (at < b1) total += b1 - at
  }
  return total
}
// the same along a line of several runs, measured from the line's start
function lineInside(line: P[], outline: P[], onEdge: boolean): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let before = 0
  for (let i = 1; i < line.length; i += 1) {
    const L = dist(line[i - 1]!, line[i]!)
    if (L < 1e-9) continue
    for (const [from, to] of runInside(line[i - 1]!, line[i]!, outline, onEdge)) out.push([before + from, before + to])
    before += L
  }
  return out
}
// a wall lies on an outline: its centreline or one of its two faces runs in or on it for 0.05 m (half its
// length when shorter); a bent wall is taken as 16 chords, its faces half a thickness off along the arc's normal
export function wallOnOutline(w: ZWall, outline: P[], holes: P[][] = [], thickness = w.thickness ?? 0.1): boolean {
  const h = Math.max(thickness / 2, 0)
  let centre: P[] = [w.S, w.E]
  let faces: P[][] = []
  if (bent(w)) {
    const plain = { id: w.id, S: w.S, E: w.E, s: w.s ?? 0, thickness: 0.1 }
    const frames = Array.from({ length: 17 }, (_, i) => placeOn(plain, i / 16))
    centre = frames.map((frame) => frame.P)
    if (h > 0) faces = [frames.map((frame) => add(frame.P, mul(frame.N, h))), frames.map((frame) => sub(frame.P, mul(frame.N, h)))]
  } else if (dist(w.S, w.E) >= 1e-10 && h > 0) {
    const n = mul(left(sub(w.E, w.S)), h / dist(w.S, w.E))
    faces = [[add(w.S, n), add(w.E, n)], [sub(w.S, n), sub(w.E, n)]]
  }
  const L = centre.slice(1).reduce((sum, p, i) => sum + dist(centre[i]!, p), 0)
  if (L < 1e-9) return false
  let best = 0
  for (const line of [centre, ...faces]) {
    const inside = lineInside(line, outline, true)
    const inHoles = holes.filter((hole) => hole.length >= 3).flatMap((hole) => lineInside(line, hole, false))
    best = Math.max(best, less(inside, inHoles))
  }
  return best >= Math.max(1e-3, Math.min(0.05, L * 0.5))
}

export function unitGathers(
  members: string[],
  zones: Map<string, UZone>,
  levels: Map<string, ULevel>,
  wallsOfLevel: Map<string, ZWall[]>,
  things: Array<{ id: string; level: string; at: P }>,
  surfaces: Array<{ id: string; level: string; polygon: P[]; holes: P[][] }>,
) {
  const list = membersOf(members, zones).filter((zone) => zone.level && levels.has(zone.level))
  const outlinesOf = (levelId: string) => list.filter((zone) => zone.level === levelId).map((zone) => zone.outline)
  const levelIds = [...new Set(list.map((zone) => zone.level!))].sort(
    (a, b) => levels.get(a)!.ordinal - levels.get(b)!.ordinal || (a < b ? -1 : a > b ? 1 : 0),
  )
  const boundary = new Set<string>()
  for (const levelId of levelIds) {
    for (const w of wallsOfLevel.get(levelId) ?? []) {
      if (outlinesOf(levelId).some((outline) => outline.length >= 3 && wallOnOutline(w, outline))) boundary.add(w.id)
    }
  }
  // and every wall of a room that holds a member's centroid, or whose centroid a member holds
  for (const levelId of levelIds) {
    for (const room of roomsOf(wallsOfLevel.get(levelId) ?? [], levelId)) {
      const roomCentre = centroidOf(room.polygon)
      const meets = outlinesOf(levelId).some((outline) => {
        const centre = outline.length >= 3 ? centroidOf(outline) : null
        return (centre !== null && covers(centre, room.polygon)) || (roomCentre !== null && covers(roomCentre, outline))
      })
      if (meets) for (const id of room.wallIds) boundary.add(id)
    }
  }
  const contained = things.filter((thing) => outlinesOf(thing.level).some((outline) => covers(thing.at, outline))).map((thing) => thing.id)
  const supports = surfaces
    .filter((surface) =>
      outlinesOf(surface.level).some(
        (outline) =>
          outline.length >= 3 &&
          surface.polygon.length >= 3 &&
          (outline.some((p) => covers(p, surface.polygon, surface.holes)) ||
            surface.polygon.some((p) => covers(p, outline)) ||
            outline.some((p, i) => wallOnOutline({ id: '', S: p, E: outline[(i + 1) % outline.length]! }, surface.polygon, surface.holes, 0))),
      ),
    )
    .map((surface) => surface.id)
  return { levels: levelIds, boundaryWalls: [...boundary], contained, supports }
}

// ------------------------------------------------------------------ (13) the fade of a zone's fill and border
export const fadeStep = (shown: number, wanted: number, dt: number): number => shown + (wanted - shown) * 10 * dt
