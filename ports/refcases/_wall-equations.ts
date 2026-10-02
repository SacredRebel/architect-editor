// The port note's equations for the wall (entry 1), written out as code. Nothing here calls the
// old editor: the reference cases hold these against it.

export type P = { x: number; y: number } // (u, v) of the note
export type Plain = { id: string; S: P; E: P; s: number; thickness: number }

export const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y })
export const mul = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k })
export const len = (a: P): number => Math.hypot(a.x, a.y)
export const left = (a: P): P => ({ x: -a.y, y: a.x })

export function plain(node: {
  id: string
  start: readonly [number, number] | readonly number[]
  end: readonly [number, number] | readonly number[]
  curveOffset?: number
  thickness?: number
}): Plain {
  return {
    id: node.id,
    S: { x: node.start[0]!, y: node.start[1]! },
    E: { x: node.end[0]!, y: node.end[1]! },
    s: node.curveOffset ?? 0,
    thickness: node.thickness ?? 0.1,
  }
}

// (1)
export function chordOf(w: Plain) {
  const c = len(sub(w.E, w.S))
  if (c < 1e-6) return { c: 0, t: { x: 1, y: 0 }, n: { x: 0, y: 1 }, M: w.S }
  const t = mul(sub(w.E, w.S), 1 / c)
  return { c, t, n: left(t), M: mul(add(w.S, w.E), 0.5) }
}

// (2)
export function sagittaOf(w: Plain, offset = w.s): number {
  const { c } = chordOf(w)
  if (c < 1e-6) return 0
  let s = Math.max(-c / 2, Math.min(c / 2, offset))
  if (Math.abs(s) <= Math.min(0.03, Math.max(0.005, 0.005 * c))) s = 0
  if (Math.abs(s) <= 1e-6) s = 0
  return s
}

// (3)
export function arcOf(w: Plain) {
  const { c, n, M } = chordOf(w)
  const s = sagittaOf(w)
  if (s === 0) return null
  const d = Math.sign(s)
  const R = (c * c) / (8 * Math.abs(s)) + Math.abs(s) / 2
  const C = add(M, mul(n, (R - Math.abs(s)) * d))
  const theta0 = Math.atan2(w.S.y - C.y, w.S.x - C.x)
  const theta1 = Math.atan2(w.E.y - C.y, w.E.x - C.x)
  let delta = theta1 - theta0
  if (d > 0) while (delta <= 0) delta += 2 * Math.PI
  else while (delta >= 0) delta -= 2 * Math.PI
  return { R, C, theta0, delta, d }
}

// (4)
export function placeOn(w: Plain, t: number): { P: P; T: P; N: P } {
  const arc = arcOf(w)
  const q = Math.max(0, Math.min(1, t))
  if (!arc) {
    const chord = chordOf(w)
    return { P: add(w.S, mul(sub(w.E, w.S), q)), T: chord.t, N: chord.n }
  }
  const theta = arc.theta0 + arc.delta * q
  const T = mul({ x: -Math.sin(theta), y: Math.cos(theta) }, arc.d)
  return { P: add(arc.C, mul({ x: Math.cos(theta), y: Math.sin(theta) }, arc.R)), T, N: left(T) }
}

// (5)
export function lengthOf(w: Plain): number {
  const arc = arcOf(w)
  return arc ? 48 * arc.R * Math.sin(Math.abs(arc.delta) / 48) : chordOf(w).c
}

// (7): the mitre points of every wall end, for all the walls together
export type Ends = { startLeft?: P; startRight?: P; endLeft?: P; endRight?: P; startMet?: boolean; endMet?: boolean }

export function mitresOf(walls: Plain[]): Map<string, Ends> {
  const keyOf = (p: P) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`
  const junctions = new Map<string, { J: P; at: Array<{ w: Plain; kind: 'start' | 'end' | 'pass' }> }>()
  for (const w of walls) {
    for (const [p, kind] of [[w.S, 'start'], [w.E, 'end']] as Array<[P, 'start' | 'end']>) {
      const key = keyOf(p)
      if (!junctions.has(key)) junctions.set(key, { J: p, at: [] })
      junctions.get(key)!.at.push({ w, kind })
    }
  }
  for (const junction of junctions.values()) {
    for (const w of walls) {
      if (junction.at.some((entry) => entry.w.id === w.id)) continue
      const chord = sub(w.E, w.S)
      const c = len(chord)
      if (c < 1e-9) continue
      const q = ((junction.J.x - w.S.x) * chord.x + (junction.J.y - w.S.y) * chord.y) / (c * c)
      if (q < 0.001 || q > 1 - 0.001) continue
      if (len(sub(junction.J, add(w.S, mul(chord, q)))) < 0.001) junction.at.push({ w, kind: 'pass' })
    }
  }
  const ends = new Map<string, Ends>()
  const endsOf = (id: string) => {
    if (!ends.has(id)) ends.set(id, {})
    return ends.get(id)!
  }
  for (const { J, at } of junctions.values()) {
    if (at.length < 2) continue
    type Direction = { w: Plain; kind: 'start' | 'end' | 'pass'; dir: P; h: number; angle: number }
    const directions: Direction[] = []
    for (const { w, kind } of at) {
      const h = w.thickness / 2
      const list: P[] =
        kind === 'pass'
          ? [sub(w.E, w.S), sub(w.S, w.E)]
          : arcOf(w)
            ? [kind === 'start' ? placeOn(w, 0).T : mul(placeOn(w, 1).T, -1)]
            : [kind === 'start' ? sub(w.E, w.S) : sub(w.S, w.E)]
      for (const dir of list) directions.push({ w, kind, dir, h, angle: Math.atan2(dir.y, dir.x) })
    }
    directions.sort((a, b) => a.angle - b.angle || (a.w.id < b.w.id ? -1 : a.w.id > b.w.id ? 1 : 0))
    const line = (p: P, dir: P) => {
      const a = -dir.y
      const b = dir.x
      return { a, b, c0: -(a * p.x + b * p.y) }
    }
    for (let i = 0; i < directions.length; i += 1) {
      const one = directions[i]!
      const two = directions[(i + 1) % directions.length]!
      const m1 = mul(left(one.dir), 1 / len(one.dir))
      const m2 = mul(left(two.dir), 1 / len(two.dir))
      const leftEdge = line(add(J, mul(m1, one.h)), one.dir)
      const rightEdge = line(sub(J, mul(m2, two.h)), two.dir)
      const det = leftEdge.a * rightEdge.b - rightEdge.a * leftEdge.b
      if (Math.abs(det) < 1e-9) continue
      const X = {
        x: (leftEdge.b * rightEdge.c0 - rightEdge.b * leftEdge.c0) / det,
        y: (rightEdge.a * leftEdge.c0 - leftEdge.a * rightEdge.c0) / det,
      }
      if (len(sub(X, J)) > 10 * Math.max(one.h, two.h)) continue
      // at a start: startLeft = left, startRight = right; at an end the direction pointed
      // backwards: endLeft = right, endRight = left
      if (one.kind === 'start') Object.assign(endsOf(one.w.id), { startLeft: X, startMet: true })
      if (one.kind === 'end') Object.assign(endsOf(one.w.id), { endRight: X, endMet: true })
      if (two.kind === 'start') Object.assign(endsOf(two.w.id), { startRight: X, startMet: true })
      if (two.kind === 'end') Object.assign(endsOf(two.w.id), { endLeft: X, endMet: true })
    }
  }
  return ends
}

// (6) and the last part of (7)
export function footprintOf(w: Plain, mitres: Map<string, Ends>): P[] {
  const h = w.thickness / 2
  const ends = mitres.get(w.id) ?? {}
  if (!arcOf(w)) {
    const { n } = chordOf(w)
    const polygon = [ends.startRight ?? sub(w.S, mul(n, h)), ends.endRight ?? sub(w.E, mul(n, h))]
    if (ends.endMet) polygon.push(w.E)
    polygon.push(ends.endLeft ?? add(w.E, mul(n, h)), ends.startLeft ?? add(w.S, mul(n, h)))
    if (ends.startMet) polygon.push(w.S)
    return polygon
  }
  const right: P[] = []
  const leftSide: P[] = []
  for (let i = 0; i <= 24; i += 1) {
    const here = placeOn(w, i / 24)
    right.push(sub(here.P, mul(here.N, h)))
    leftSide.push(add(here.P, mul(here.N, h)))
  }
  right[0] = ends.startRight ?? right[0]!
  leftSide[0] = ends.startLeft ?? leftSide[0]!
  right[24] = ends.endRight ?? right[24]!
  leftSide[24] = ends.endLeft ?? leftSide[24]!
  return [...right, ...leftSide.reverse()]
}

// (8)
export function topOf(H: number, b: number, g: number | undefined, onGround: boolean): number {
  if (g === undefined) return H
  if (onGround) return b + g
  return b > 0 ? b + g : g
}

// (9)
export function bandsOf(W: number, count: number, lower = 0.84, middle = 0.61, upper = 0.61) {
  const lowerTop = count >= 2 ? Math.min(W, lower) : 0
  const middleTop = count >= 3 ? lowerTop + Math.min(W - lowerTop, middle) : lowerTop
  const upperTop = count >= 4 ? middleTop + Math.min(W - middleTop, upper) : middleTop
  return { lowerTop, middleTop, upperTop }
}
