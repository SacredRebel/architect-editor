// The port note's equations for the stair and its parts (entry 7), written out as code.
// Nothing here calls the old editor: the reference cases hold these against it.
//
// Words: a "part" is one flight or one landing of a straight stair. The stair's own frame is
// (x, z) in plan with z along the first flight's run and x to the climber's left, and y up
// from the stair's base. A plan point of the note is (u, v).

export type V2 = { x: number; y: number } // (u, v), or (x, z) of the stair's own frame
export type V3 = [number, number, number] // (x, y up, z) of the stair's own frame
export type Side = 'front' | 'left' | 'right'
export type Part = {
  flight: boolean // false: a landing
  width: number
  length: number
  height: number
  steps: number
  side: Side // where it hangs on the part before it
  filled: boolean // down to the stair's base; false: `thickness` under it
  thickness: number
  hidden?: boolean
}
export type Place = { x: number; y: number; z: number; phi: number }
export type Standing = { P: V2; rho: number } // where the stair stands in the plan, and its turn

// the turn used everywhere (the note's lead-in to its equations): a positive angle carries +z
// toward +x
export const turn = (x: number, z: number, phi: number): V2 => ({
  x: x * Math.cos(phi) + z * Math.sin(phi),
  y: -x * Math.sin(phi) + z * Math.cos(phi),
})
export const toPlan = (stair: Standing, x: number, z: number): V2 => {
  const t = turn(x, z, stair.rho)
  return { x: stair.P.x + t.x, y: stair.P.y + t.y }
}

// (1) the rise
export function floorToFloor(levels: Array<{ height?: number; baseElevation?: number }>, k: number): number {
  const bases: number[] = []
  let top = 0
  for (const level of levels) {
    const base = top + (level.baseElevation ?? 0)
    bases.push(base)
    top = base + (level.height ?? 2.5)
  }
  return k + 1 < levels.length ? bases[k + 1]! - bases[k]! : (levels[k]!.height ?? 2.5)
}
export function riseOf(o: { stored?: number; base?: number; deck?: number; floorToFloor?: number }): number {
  if (o.stored !== undefined) return o.stored
  const b = o.base ?? 0
  if (o.deck !== undefined) return o.deck - b
  if (o.floorToFloor === undefined) return 2.5 // the stair is in no level
  return o.floorToFloor - b
}

// (2) risers and treads of one flight; tread k = 1…N
export const riserOf = (part: Pick<Part, 'height' | 'steps'>): number => part.height / part.steps
export const goingOf = (part: Pick<Part, 'length' | 'steps'>): number => part.length / part.steps
export function treadOf(part: Pick<Part, 'height' | 'length' | 'steps'>, k: number) {
  return { from: (k - 1) * goingOf(part), to: k * goingOf(part), height: k * riserOf(part) }
}
// the flight a straight stair stands for when it has no part of its own
export function flightOfStair(
  stair: { width: number; stepCount: number; thickness: number; filled: boolean },
  rise: number,
): Part {
  return {
    flight: true,
    width: stair.width,
    length: 3,
    height: Math.max(rise, 0.1),
    steps: Math.max(2, Math.round(stair.stepCount)),
    side: 'front',
    filled: stair.filled,
    thickness: stair.thickness,
  }
}

// (3) the flights' heights after they are brought in step with the rise; null: nothing changes
export function inStep(parts: Array<Pick<Part, 'flight' | 'height'>>, rise: number): number[] | null {
  const flights = parts.filter((part) => part.flight)
  if (flights.length === 0) return null
  const landings = parts.filter((part) => !part.flight).reduce((sum, part) => sum + part.height, 0)
  const now = flights.reduce((sum, part) => sum + part.height, 0)
  const target = rise - landings
  if (target <= 0 || Math.abs(now - target) <= 1e-4) return null
  return flights.map((part) => (now > 1e-4 ? (part.height * target) / now : target / flights.length))
}

// (4) the chain: where each part starts in the stair's frame, and its turn
export function chainOf(parts: readonly Part[]): Place[] {
  const places: Place[] = []
  let x = 0
  let y = 0
  let z = 0
  let phi = 0
  parts.forEach((part, i) => {
    if (i > 0) {
      const before = parts[i - 1]!
      const d: [number, number] =
        part.side === 'left'
          ? [before.width / 2, before.length / 2]
          : part.side === 'right'
            ? [-before.width / 2, before.length / 2]
            : [0, before.length]
      const moved = turn(d[0], d[1], phi)
      x += moved.x
      z += moved.y
      y += before.height
      phi += part.side === 'left' ? Math.PI / 2 : part.side === 'right' ? -Math.PI / 2 : 0
    }
    places.push({ x, y, z, phi })
  })
  return places
}
// a point of a part: a across (to the left), s along its run
export const inStair = (place: Place, a: number, s: number): V2 => {
  const t = turn(a, s, place.phi)
  return { x: place.x + t.x, y: place.z + t.y }
}

// (5) the plan footprint of a part, and the box of a straight stair (hidden parts are left out
// before the chain is walked)
export function cornersOf(part: Part, place: Place, stair: Standing): V2[] {
  const h = part.width / 2
  const local: Array<[number, number]> = [[-h, 0], [h, 0], [h, part.length], [-h, part.length]]
  return local.map(([a, s]) => {
    const p = inStair(place, a, s)
    return toPlan(stair, p.x, p.y)
  })
}
export type Box = { minX: number; minZ: number; maxX: number; maxZ: number }
export const boxOfPoints = (points: readonly V2[]): Box => ({
  minX: Math.min(...points.map((p) => p.x)),
  minZ: Math.min(...points.map((p) => p.y)),
  maxX: Math.max(...points.map((p) => p.x)),
  maxZ: Math.max(...points.map((p) => p.y)),
})
export function boxOfParts(parts: readonly Part[], stair: Standing): Box {
  const seen = parts.filter((part) => !part.hidden)
  const places = chainOf(seen)
  return boxOfPoints(seen.flatMap((part, i) => cornersOf(part, places[i]!, stair)))
}

// (6) the body of a part: its side outline (s along the run, y up from the part's own start),
// pushed across by its width. y0 is the part's start height in the chain.
export const soffitDrop = (part: Part): number =>
  part.thickness / Math.cos(Math.atan(riserOf(part) / goingOf(part)))
export function outlineOf(part: Part, y0: number): V2[] {
  const L = part.length
  if (!part.flight) {
    const down = part.filled ? y0 : part.thickness
    return [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: -down }, { x: 0, y: -down }]
  }
  const r = riserOf(part)
  const t = goingOf(part)
  const points: V2[] = [{ x: 0, y: 0 }]
  for (let k = 1; k <= part.steps; k += 1) points.push({ x: (k - 1) * t, y: k * r }, { x: k * t, y: k * r })
  if (part.filled) points.push({ x: L, y: -y0 }, { x: 0, y: -y0 })
  else {
    const v = soffitDrop(part)
    points.push({ x: L, y: part.height - v })
    if (y0 === 0) points.push({ x: (L * v) / part.height, y: 0 })
    else points.push({ x: 0, y: -v })
  }
  return points
}
// the same outline's area, in closed form
export function sectionOf(part: Part, y0: number): number {
  const L = part.length
  if (!part.flight) return L * (part.filled ? y0 : part.thickness)
  const H = part.height
  const N = part.steps
  const stepped = (L * H * (N + 1)) / (2 * N)
  if (part.filled) return stepped + L * y0
  const v = soffitDrop(part)
  if (y0 === 0) return stepped - ((H - v) * (H - v) * L) / (2 * H)
  return L * (H / (2 * N) + v)
}
export function volumeOf(parts: readonly Part[]): number {
  const places = chainOf(parts)
  return parts.reduce((sum, part, i) => sum + part.width * sectionOf(part, places[i]!.y), 0)
}
export type Box3 = { min: V3; max: V3 }
export function box3Of(points: readonly V3[]): Box3 {
  const min: V3 = [Infinity, Infinity, Infinity]
  const max: V3 = [-Infinity, -Infinity, -Infinity]
  for (const p of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, p[axis]!)
      max[axis] = Math.max(max[axis]!, p[axis]!)
    }
  }
  return { min, max }
}
// every corner of a straight stair's body, in the level's frame (x = u, y up, z = v)
export function bodyPoints(parts: readonly Part[], stair: Standing, base = 0): V3[] {
  const places = chainOf(parts)
  return parts.flatMap((part, i) => {
    const place = places[i]!
    return outlineOf(part, place.y).flatMap((q) =>
      [-part.width / 2, part.width / 2].map((a): V3 => {
        const p = inStair(place, a, q.x)
        const plan = toPlan(stair, p.x, p.y)
        return [plan.x, base + place.y + q.y, plan.y]
      }),
    )
  })
}

// (7) the curved and the spiral stair
export type Arc = {
  spiral: boolean
  innerRadius: number
  width: number
  sweep: number
  stepCount: number
  thickness: number
  filled: boolean
  rise: number
  column?: boolean
  supports?: boolean
  landingDepth?: number // an integrated top landing of that depth (a spiral's)
}
export function arcOf(a: Arc) {
  const N = Math.max(2, Math.round(a.stepCount))
  const H = Math.max(a.rise, 0.1)
  const ri = Math.max(a.spiral ? 0.05 : 0.2, a.innerRadius)
  const ro = ri + Math.max(a.width, 0.4)
  return { N, H, h: H / N, ri, ro, S: a.sweep, delta: a.sweep / N, th: Math.max(a.thickness, 0.02) }
}
// tread k = 0…N−1: its two angles, its underside and its top
export function arcTread(a: Arc, k: number) {
  const { h, S, delta, th } = arcOf(a)
  const from = -S / 2 + k * delta
  const top = a.spiral ? k * h + th : Math.max((k + 1) * h, th)
  const bottom = a.spiral ? k * h : a.filled ? 0 : Math.max((k + 1) * h - th, 0)
  return { from, to: from + delta, bottom, top }
}
export const onArc = (radius: number, angle: number): V2 => ({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
// a tread is built from this many straight pieces on each rim
export const chordsOf = (delta: number, ri: number, ro: number): number =>
  Math.max(4, Math.min(24, Math.ceil(Math.abs(delta) / (Math.PI / 18) + Math.max(0, (ro - ri) * 3))))
export const wedgeArea = (ri: number, ro: number, delta: number, chords: number): number =>
  (chords * (ro * ro - ri * ri) * Math.sin(Math.abs(delta) / chords)) / 2
export const wedgeAreaExact = (ri: number, ro: number, delta: number): number => ((ro * ro - ri * ri) * Math.abs(delta)) / 2
export function wedgePoints(ri: number, ro: number, from: number, delta: number, bottom: number, top: number): V3[] {
  const chords = chordsOf(delta, ri, ro)
  const points: V3[] = []
  for (let j = 0; j <= chords; j += 1) {
    const angle = from + (delta * j) / chords
    for (const radius of [ri, ro]) {
      const p = onArc(radius, angle)
      points.push([p.x, bottom, p.y], [p.x, top, p.y])
    }
  }
  return points
}

// (8) what a spiral has more: a column, a support under each tread, a top landing
export function spiralExtras(a: Arc) {
  const { N, H, h, ri, ro, S, th } = arcOf(a)
  const columnRadius = Math.max(0.05, Math.min(ri * 0.72, ri - 0.03))
  const sizeX = Math.max(0.04, ri - columnRadius + 0.04)
  const sizeY = Math.max(th * 0.55, 0.025)
  const sizeZ = Math.max(0.04, Math.min(0.12, sizeY * 1.5))
  const lastTop = h * (N - 1) + th
  const landing =
    a.landingDepth === undefined
      ? null
      : {
          from: S / 2,
          sweep: Math.min(Math.PI * 0.75, Math.max(0.3, a.landingDepth) / Math.max(ri + a.width / 2, 0.1)) * (Math.sign(S) || 1),
          bottom: lastTop,
          thickness: Math.max(0.02, H - lastTop),
        }
  return {
    column: { radius: columnRadius, height: H + th, volume: 5 * columnRadius * columnRadius * Math.sin(Math.PI / 5) * (H + th) },
    support: { size: [sizeX, sizeY, sizeZ] as V3, radius: columnRadius + sizeX / 2 - 0.02 },
    landing,
    ro,
  }
}
export function arcVolume(a: Arc, exact = false): number {
  const { N, ri, ro, delta } = arcOf(a)
  const area = exact ? wedgeAreaExact(ri, ro, delta) : wedgeArea(ri, ro, delta, chordsOf(delta, ri, ro))
  let volume = 0
  for (let k = 0; k < N; k += 1) {
    const tread = arcTread(a, k)
    volume += area * Math.max(tread.top - tread.bottom, 0.02)
  }
  if (!a.spiral) return volume
  const extras = spiralExtras(a)
  if (a.column !== false) volume += exact ? Math.PI * extras.column.radius ** 2 * extras.column.height : extras.column.volume
  if (a.supports !== false) volume += N * extras.support.size[0] * extras.support.size[1] * extras.support.size[2]
  if (extras.landing) {
    const sweep = extras.landing.sweep
    const landingArea = exact ? wedgeAreaExact(ri, ro, sweep) : wedgeArea(ri, ro, sweep, chordsOf(sweep, ri, ro))
    volume += landingArea * extras.landing.thickness
  }
  return volume
}
// in plan a full turn is cut 0.001 short, and the landing's sweep is worked out with the width
// kept at 0.4 or more
const underAFullTurn = (sweep: number): number =>
  Math.abs(sweep) >= Math.PI * 2 ? (Math.sign(sweep) || 1) * (Math.PI * 2 - 0.001) : sweep
const landingSweepInPlan = (a: Arc, sweep: number): number =>
  a.spiral && a.landingDepth !== undefined
    ? Math.min(Math.PI * 0.75, Math.max(0.3, a.landingDepth) / Math.max(arcOf(a).ri + Math.max(a.width, 0.4) / 2, 0.1)) * (Math.sign(sweep) || 1)
    : 0
// the plan box of a curved or spiral stair: 49 stations on both rims
export function arcBox(a: Arc, stair: Standing): Box {
  const { ri, ro, S } = arcOf(a)
  const sweep = underAFullTurn(S)
  const points: V2[] = []
  const both = (angle: number) => {
    for (const radius of [ri, ro]) {
      const p = onArc(radius, angle)
      points.push(toPlan(stair, p.x, p.y))
    }
  }
  for (let j = 0; j <= 48; j += 1) both(-sweep / 2 + (sweep * j) / 48)
  const landing = landingSweepInPlan(a, S)
  if (landing !== 0) {
    const n = Math.max(1, Math.ceil(Math.abs(landing) / (Math.PI / 24)))
    for (let j = 0; j <= n; j += 1) both(S / 2 + (landing * j) / n)
  }
  return boxOfPoints(points)
}

// the plan footprint of a curved or spiral stair: its sector as a polygon, outer rim first
export function arcFootprint(a: Arc, stair: Standing): V2[] {
  const { ri } = arcOf(a)
  const ro = ri + a.width
  const S = underAFullTurn(a.sweep)
  const landing = landingSweepInPlan(a, S)
  const drawn = underAFullTurn(S + landing)
  const count = Math.max(24, Math.ceil(Math.abs(S) / (Math.PI / 24)), Math.ceil((Math.abs(S) * ro) / 0.14))
  const rim = (radius: number) =>
    Array.from({ length: count + 1 }, (_, j) => {
      const p = onArc(radius, -S / 2 + (drawn * j) / count)
      return toPlan(stair, p.x, p.y)
    })
  return [...rim(ro), ...rim(ri).reverse()]
}

// (9) railings: the foot of every post, in the stair's frame
export type Rail = { part: number; side: Side; posts: V3[] }
export function landingSides(mode: 'left' | 'right' | 'both', nextSide: Side | undefined): Side[] {
  const wanted: Side[] = mode === 'both' ? ['left', 'right'] : [mode]
  const leaves = nextSide ?? 'front'
  const kept = wanted.filter((side) => side !== leaves)
  return leaves !== 'front' && kept.length > 0 ? ['front', ...kept] : kept
}
export function railsOf(all: readonly Part[], mode: 'left' | 'right' | 'both'): Rail[] {
  const parts = all.filter((part) => !part.hidden)
  const places = chainOf(parts)
  const rails: Rail[] = []
  parts.forEach((part, i) => {
    const place = places[i]!
    const before = parts[i - 1]
    const after = parts[i + 1]
    const post = (a: number, s: number, y: number): V3 => {
      const p = inStair(place, a, s)
      return [p.x, place.y + y, p.y]
    }
    if (part.flight) {
      const N = Math.max(1, part.steps)
      const r = part.height / N
      const t = part.length / N
      for (const side of (mode === 'both' ? ['left', 'right'] : [mode]) as Side[]) {
        const a = (side === 'left' ? 1 : -1) * (part.width / 2 - 0.045)
        const posts: V3[] = []
        if (!(before && !before.flight)) posts.push(post(a, 0, r))
        for (let k = 1; k <= N; k += 1) posts.push(post(a, t * (k - 0.5), k * r))
        if (!(after && !after.flight)) posts.push(post(a, part.length, part.height))
        rails.push({ part: i, side, posts })
      }
      return
    }
    const inset = 0.08
    const across = part.width / 2 - inset
    const nearEnd = Boolean(before?.flight) && part.side !== 'front'
    for (const side of landingSides(mode, after?.side)) {
      const posts =
        side === 'front'
          ? [post(across, nearEnd ? inset : part.length - inset, 0), post(-across, nearEnd ? inset : part.length - inset, 0)]
          : [post((side === 'left' ? 1 : -1) * across, inset, 0), post((side === 'left' ? 1 : -1) * across, part.length - inset, 0)]
      rails.push({ part: i, side, posts })
    }
  })
  return rails
}
export function arcRail(a: Arc, side: 'left' | 'right'): V3[] {
  const { N, h, ri, ro, S, delta, th } = arcOf(a)
  const inner = S >= 0 ? side === 'left' : side === 'right'
  const radius = inner ? ri + 0.04 : ro - 0.04
  const posts: V3[] = []
  for (let k = 0; k < N; k += 1) {
    const p = onArc(radius, -S / 2 + delta * (k + 0.5))
    posts.push([p.x, a.spiral ? k * h + th : (k + 1) * h, p.y])
  }
  return posts
}
export const midRailOf = (railingHeight: number): number => Math.max(railingHeight * 0.45, 0.35)

// (10) the opening in the floor above
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number }
// the outline of rectangles laid together, walked on the grid of their edges
export function outlineOfRects(rects: readonly Rect[]): V2[][] {
  const tidy = (value: number) => Number(value.toFixed(6))
  const xs = [...new Set(rects.flatMap((r) => [r.minX, r.maxX]).map(tidy))].sort((p, q) => p - q)
  const zs = [...new Set(rects.flatMap((r) => [r.minZ, r.maxZ]).map(tidy))].sort((p, q) => p - q)
  if (xs.length < 2 || zs.length < 2) return []
  const full = new Set<string>()
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < zs.length - 1; j += 1) {
      const cx = (xs[i]! + xs[i + 1]!) / 2
      const cz = (zs[j]! + zs[j + 1]!) / 2
      if (rects.some((r) => cx > r.minX && cx < r.maxX && cz > r.minZ && cz < r.maxZ)) full.add(`${i}:${j}`)
    }
  }
  const next = new Map<string, V2>()
  const edge = (from: V2, to: V2) => next.set(`${from.x},${from.y}`, to)
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < zs.length - 1; j += 1) {
      if (!full.has(`${i}:${j}`)) continue
      const [x0, x1, z0, z1] = [xs[i]!, xs[i + 1]!, zs[j]!, zs[j + 1]!]
      if (!full.has(`${i}:${j - 1}`)) edge({ x: x0, y: z0 }, { x: x1, y: z0 })
      if (!full.has(`${i + 1}:${j}`)) edge({ x: x1, y: z0 }, { x: x1, y: z1 })
      if (!full.has(`${i}:${j + 1}`)) edge({ x: x1, y: z1 }, { x: x0, y: z1 })
      if (!full.has(`${i - 1}:${j}`)) edge({ x: x0, y: z1 }, { x: x0, y: z0 })
    }
  }
  const loops: V2[][] = []
  while (next.size > 0) {
    const [key] = next.keys()
    const [sx, sz] = key!.split(',').map(Number)
    const start: V2 = { x: sx!, y: sz! }
    const loop: V2[] = [start]
    let at = start
    for (;;) {
      const atKey = `${at.x},${at.y}`
      const to = next.get(atKey)
      if (!to) break
      next.delete(atKey)
      if (Math.hypot(to.x - start.x, to.y - start.y) <= 1e-5) break
      loop.push(to)
      at = to
    }
    if (loop.length >= 3) {
      let twice = 0
      loop.forEach((p, i) => {
        const q = loop[(i + 1) % loop.length]!
        twice += p.x * q.y - q.x * p.y
      })
      loops.push(twice < 0 ? [...loop].reverse() : loop)
    }
  }
  return loops
}
// a straight stair: target is the height of the floor above over the stair's base
export function straightOpening(
  all: readonly Part[],
  stair: Standing & { rise: number; stepCount: number; offset: number },
  target: number,
): V2[][] {
  const parts = all.filter((part) => !part.hidden)
  if (parts.length === 0) return []
  const places = chainOf(parts)
  const reach = Math.max((stair.rise / Math.max(stair.stepCount, 1)) * 2, 0.35)
  const e = Math.max(stair.offset, 0)
  const slice = (i: number, from: number, to: number): Rect => {
    const part = parts[i]!
    const corners = [[-part.width / 2, from], [part.width / 2, from], [part.width / 2, to], [-part.width / 2, to]].map(
      ([a, s]) => inStair(places[i]!, a!, s!),
    )
    const box = boxOfPoints(corners)
    return { minX: box.minX - e, maxX: box.maxX + e, minZ: box.minZ - e, maxZ: box.maxZ + e }
  }
  const lastMetres = (i: number): Rect => {
    const part = parts[i]!
    const going = Math.max(0.2, part.length / Math.max(part.steps || stair.stepCount || 10, 1))
    const depth = Math.min(part.length, Math.max(going * 10, part.length * 0.8, 3))
    return slice(i, Math.max(0, part.length - depth), part.length)
  }
  const top = (i: number) => places[i]!.y + (parts[i]!.flight ? parts[i]!.height : 0)
  const rects: Rect[] = []
  parts.forEach((part, i) => {
    if (part.flight) {
      if (Math.abs(target - top(i)) <= reach) rects.push(lastMetres(i))
      return
    }
    if (Math.abs(target - places[i]!.y) > reach) return
    rects.push(slice(i, 0, part.length))
    if (i > 0 && parts[i - 1]!.flight && Math.abs(target - top(i - 1)) <= reach) rects.push(lastMetres(i - 1))
  })
  const loops = outlineOfRects(rects)
  if (loops.length > 0) return loops.map((loop) => loop.map((p) => toPlan(stair, p.x, p.y)))
  let last = parts.length - 1
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i]!.flight) {
      last = i
      break
    }
  }
  return [cornersOf(parts[last]!, places[last]!, stair)]
}
// a curved stair: the upper 0.8 of its sweep, between its two rims (the stored numbers, as they are)
export function curvedOpening(
  a: { innerRadius: number; width: number; sweep: number; stepCount: number },
  stair: Standing & { offset: number },
): V2[] {
  const e = Math.max(stair.offset, 0)
  const inner = Math.max(0.01, a.innerRadius - e)
  const outer = a.innerRadius + Math.max(a.width, 0.4) + e
  const S = a.sweep
  const N = Math.max(a.stepCount, 1)
  const open = (Math.sign(S) || 1) * Math.min(Math.abs(S), Math.abs(S) * Math.max(0.8, 1 / N) + (2 * e) / Math.max(inner, 0.1))
  const from = S / 2 - open
  const count = Math.max(10, Math.min(32, Math.ceil(Math.abs(open) / (Math.PI / 24) + N * 0.5)))
  const points: V2[] = []
  for (let j = 0; j <= count; j += 1) {
    const p = onArc(outer, from + (open * j) / count)
    points.push(toPlan(stair, p.x, p.y))
  }
  for (let j = count; j >= 0; j -= 1) {
    const p = onArc(inner, from + (open * j) / count)
    points.push(toPlan(stair, p.x, p.y))
  }
  return points
}
// a spiral stair: the whole circle of its outer rim, 48 sides
export function spiralOpening(a: { innerRadius: number; width: number }, stair: Standing & { offset: number }): V2[] {
  const radius = Math.max(0.05, a.innerRadius) + Math.max(a.width, 0.4) + Math.max(stair.offset, 0)
  return Array.from({ length: 48 }, (_, j) => {
    const p = onArc(radius, (j / 48) * Math.PI * 2)
    return toPlan(stair, p.x, p.y)
  })
}
// which floors and ceilings a stair from level `from` to level `to` opens (level numbers)
export const opensSlab = (from: number, to: number, level: number): boolean =>
  level > Math.min(from, to) && level <= Math.max(from, to)
export const opensCeiling = (from: number, to: number, level: number): boolean =>
  level >= Math.min(from, to) && level < Math.max(from, to)

// (11) the boxes a stair is held against the floors with (which slab it stands on)
export type Pad = { centre: V3; size: V3; turn: number }
export function padsOfParts(parts: readonly Part[], stair: Standing, y = 0): Pad[] {
  const places = chainOf(parts)
  return parts.map((part, i) => {
    const place = places[i]!
    const middle = inStair(place, 0, part.length / 2)
    const plan = toPlan(stair, middle.x, middle.y)
    return {
      centre: [plan.x, y + place.y, plan.y],
      size: [part.width, Math.max(part.height, part.thickness, 0.01), part.length],
      turn: stair.rho + place.phi,
    }
  })
}
export function padsOfArc(a: Arc, stair: Standing, y = 0): Pad[] {
  const { N, ri, ro, S } = arcOf(a)
  const count = Math.max(N, Math.ceil(Math.abs(S) / (Math.PI / 12)))
  const pads: Pad[] = []
  for (let j = 0; j < count; j += 1) {
    const from = -S / 2 + (S * j) / count
    const to = -S / 2 + (S * (j + 1)) / count
    const middle = (from + to) / 2
    const half = Math.abs(to - from) / 2
    const inner = ri * Math.cos(half)
    const p = onArc((ro + inner) / 2, middle)
    const plan = toPlan(stair, p.x, p.y)
    pads.push({
      centre: [plan.x, y, plan.y],
      size: [Math.max(ro - inner, 0.01), 0.01, Math.max(2 * ro * Math.sin(half), 0.01)],
      turn: middle - stair.rho,
    })
  }
  if (a.spiral && a.column !== false) {
    const c = spiralExtras(a).column.radius
    pads.push({ centre: [stair.P.x, y, stair.P.y], size: [2 * c, 0.01, 2 * c], turn: 0 })
  }
  return pads
}

// the four corners the floors take a box to have: they read its turn with the other hand
// (the box's own x axis along (cos, sin) of the turn)
export function padCorners(pad: Pad): V2[] {
  const [w, , d] = pad.size
  const cos = Math.cos(pad.turn)
  const sin = Math.sin(pad.turn)
  const corners: Array<[number, number]> = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
  return corners.map(([a, b]) => ({ x: pad.centre[0] + a * cos - b * sin, y: pad.centre[2] + a * sin + b * cos }))
}

export const polygonArea = (points: readonly V2[]): number => {
  let twice = 0
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!
    twice += p.x * q.y - q.x * p.y
  })
  return Math.abs(twice) / 2
}
