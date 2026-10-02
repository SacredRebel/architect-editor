// The port note's equations for the window (entry 2), written out as code. Nothing here calls
// the old editor: the reference cases hold these against it.

export type XY = { x: number; y: number }
export type V3 = [number, number, number]
export type Rect = { left: number; right: number; bottom: number; top: number }
export type Radii = { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number }

// the fields of a window that the equations read (the fork's own names)
export type Win = {
  position: readonly number[] // x along the chord from the wall's start, y of the centre above the wall's base, z across
  rotation: readonly number[] // [0, the turn about the vertical, 0]: 0 on the front, pi on the back
  width: number
  height: number
  openingShape: 'rectangle' | 'rounded' | 'arch'
  openingRadiusMode: 'all' | 'individual'
  openingCornerRadii: readonly number[] // top-left, top-right, bottom-right, bottom-left
  cornerRadius: number
  archHeight?: number
  openingRevealRadius: number
  windowType: string
  operationState: number
  awningDirection: 'up' | 'down'
  casementStyle: 'single' | 'french'
  hingesSide: 'left' | 'right'
  frameThickness: number
  frameDepth: number
  columnRatios: readonly number[]
  rowRatios: readonly number[]
  columnDividerThickness: number
  rowDividerThickness: number
  sill: boolean
  sillDepth: number
  sillThickness: number
}

// ------------------------------------------------------------------ (1) where it sits
export function inPlan(S: XY, E: XY, x: number, z = 0): XY {
  const c = Math.hypot(E.x - S.x, E.y - S.y)
  const t = { x: (E.x - S.x) / c, y: (E.y - S.y) / c }
  const n = { x: -t.y, y: t.x }
  return { x: S.x + t.x * x + n.x * z, y: S.y + t.y * x + n.y * z }
}

// a point of the window's own frame, in the wall-local frame
export function toWall(win: Pick<Win, 'position' | 'rotation'>, own: V3): V3 {
  const turn = win.rotation[1] ?? 0
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  return [
    win.position[0]! + own[0] * cos + own[2] * sin,
    win.position[1]! + own[1],
    (win.position[2] ?? 0) - own[0] * sin + own[2] * cos,
  ]
}

// ------------------------------------------------------------------ (2) the limits of the place
export const FRESH_SILL = 0.5

// L the wall's chord length, G its height above its base
export function placeWithin(L: number, G: number, x: number, y: number, w: number, h: number): XY {
  return { x: Math.max(w / 2, Math.min(L - w / 2, x)), y: Math.max(h / 2, Math.min(G - h / 2, y)) }
}

// ------------------------------------------------------------------ (3) two openings on one wall
export function rectAt(x: number, y: number, w: number, h: number): Rect {
  return { left: x - w / 2, right: x + w / 2, bottom: y - h / 2, top: y + h / 2 }
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom
}

// ------------------------------------------------------------------ (4) the cutter's rectangle
export function flatBottom(win: Pick<Win, 'openingShape' | 'openingRadiusMode' | 'openingCornerRadii' | 'cornerRadius'>): boolean {
  if (win.openingShape !== 'rounded') return true
  if (win.openingRadiusMode === 'individual') {
    return (win.openingCornerRadii[2] ?? 0) <= 1e-6 && (win.openingCornerRadii[3] ?? 0) <= 1e-6
  }
  return Math.max(win.cornerRadius, 0) <= 1e-6
}

export function padding(win: Parameters<typeof flatBottom>[0], bottom: number): number {
  return bottom < 0.005 && flatBottom(win) ? 0.02 : 0
}

export function cutRect(win: Win): Rect {
  const rect = rectAt(win.position[0]!, win.position[1]!, win.width, win.height)
  return { ...rect, bottom: rect.bottom - padding(win, rect.bottom) }
}

// ------------------------------------------------------------------ (5) and (6) rectangle, arch
export function rectangleOutline(rect: Rect): XY[] {
  return [
    { x: rect.left, y: rect.bottom },
    { x: rect.right, y: rect.bottom },
    { x: rect.right, y: rect.top },
    { x: rect.left, y: rect.top },
  ]
}

export function archRise(archHeight: number | undefined, W: number, H: number): number {
  return Math.min(Math.max(archHeight ?? W / 2, 0.01), H)
}

export function archOutline(rect: Rect, rise: number): XY[] {
  const W = rect.right - rect.left
  const spring = rect.top - rise
  const points: XY[] = [
    { x: rect.left, y: rect.bottom },
    { x: rect.right, y: rect.bottom },
    { x: rect.right, y: spring },
  ]
  for (let i = 1; i <= 32; i += 1) {
    const q = 1 - i / 16 // +1 at the right springing, 0 at the crown, -1 at the left springing
    points.push({ x: rect.right - (W * i) / 32, y: spring + rise * Math.sqrt(Math.max(1 - q * q, 0)) })
  }
  return points
}

// what 32 chords equal in x leave of a half ellipse: K in area = W (H - a) + a W K
export function archChordFactor(): number {
  let sum = 0
  for (let i = 1; i <= 31; i += 1) sum += Math.sqrt(1 - (1 - i / 16) ** 2)
  return sum / 32
}

// height of the arch's line over a point x from its middle (springing height Ys, half width hw)
export function archHeightAt(x: number, hw: number, Ys: number, rise: number): number {
  if (hw <= 1e-6) return Ys
  const q = Math.min(Math.abs(x) / hw, 1)
  return Ys + rise * Math.sqrt(Math.max(1 - q * q, 0))
}

// half the arch's width at a height y
export function archHalfWidthAt(y: number, hw: number, Ys: number, rise: number): number {
  if (y <= Ys || rise <= 1e-6) return hw
  const q = Math.min(Math.max((y - Ys) / rise, 0), 1)
  return hw * Math.sqrt(Math.max(1 - q * q, 0))
}

// ------------------------------------------------------------------ (7) and (8) rounded
export function fitRadii(r: Radii, W: number, H: number): Radii {
  const k = Math.min(
    1,
    W / Math.max(r.topLeft + r.topRight, 1e-6),
    W / Math.max(r.bottomLeft + r.bottomRight, 1e-6),
    H / Math.max(r.topLeft + r.bottomLeft, 1e-6),
    H / Math.max(r.topRight + r.bottomRight, 1e-6),
  )
  if (k >= 1) return r
  return { topLeft: r.topLeft * k, topRight: r.topRight * k, bottomRight: r.bottomRight * k, bottomLeft: r.bottomLeft * k }
}

export function radiiOf(
  win: Pick<Win, 'openingRadiusMode' | 'openingCornerRadii' | 'cornerRadius'>,
  W: number,
  H: number,
): Radii {
  if (win.openingRadiusMode === 'individual') {
    const [tl = 0, tr = 0, br = 0, bl = 0] = win.openingCornerRadii
    return fitRadii(
      { topLeft: Math.max(tl, 0), topRight: Math.max(tr, 0), bottomRight: Math.max(br, 0), bottomLeft: Math.max(bl, 0) },
      W,
      H,
    )
  }
  const r = Math.min(Math.max(win.cornerRadius, 0), Math.min(W / 2, H / 2))
  return { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r }
}

// the radii of an outline drawn `inset` inside another
export function insetRadii(r: Radii, inset: number, W: number, H: number): Radii {
  return fitRadii(
    {
      topLeft: Math.max(r.topLeft - inset, 0),
      topRight: Math.max(r.topRight - inset, 0),
      bottomRight: Math.max(r.bottomRight - inset, 0),
      bottomLeft: Math.max(r.bottomLeft - inset, 0),
    },
    W,
    H,
  )
}

export function roundedOutline(rect: Rect, r: Radii, chords = 48): XY[] {
  const points: XY[] = []
  const put = (p: XY) => {
    const last = points[points.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-9) points.push(p)
  }
  const quarter = (cx: number, cy: number, radius: number, from: number) => {
    for (let j = 0; j <= chords; j += 1) {
      const phi = from + ((Math.PI / 2) * j) / chords
      put({ x: cx + radius * Math.cos(phi), y: cy + radius * Math.sin(phi) })
    }
  }
  const { left, right, bottom, top } = rect
  put({ x: left + r.bottomLeft, y: bottom })
  put({ x: right - r.bottomRight, y: bottom })
  if (r.bottomRight > 1e-6) quarter(right - r.bottomRight, bottom + r.bottomRight, r.bottomRight, -Math.PI / 2)
  else put({ x: right, y: bottom })
  put({ x: right, y: top - r.topRight })
  if (r.topRight > 1e-6) quarter(right - r.topRight, top - r.topRight, r.topRight, 0)
  else put({ x: right, y: top })
  put({ x: left + r.topLeft, y: top })
  if (r.topLeft > 1e-6) quarter(left + r.topLeft, top - r.topLeft, r.topLeft, Math.PI / 2)
  else put({ x: left, y: top })
  put({ x: left, y: bottom + r.bottomLeft })
  if (r.bottomLeft > 1e-6) quarter(left + r.bottomLeft, bottom + r.bottomLeft, r.bottomLeft, Math.PI)
  else put({ x: left, y: bottom })
  const first = points[0]!
  const last = points[points.length - 1]!
  if (points.length > 1 && Math.hypot(first.x - last.x, first.y - last.y) <= 1e-9) points.pop()
  return points
}

// what 48 chords leave of a quarter disc: the outline's area is W H - (1 - Q) (sum of r squared)
export function quarterChordFactor(chords = 48): number {
  return (chords / 2) * Math.sin(Math.PI / (2 * chords))
}

// where a rounded outline's top line is over x, and how wide it is at a height y (top corners only)
export function roundedTopAt(x: number, rect: Rect, r: Radii): number {
  if (r.topLeft > 1e-6 && x < rect.left + r.topLeft) {
    const dx = x - (rect.left + r.topLeft)
    return rect.top - r.topLeft + Math.sqrt(Math.max(r.topLeft * r.topLeft - dx * dx, 0))
  }
  if (r.topRight > 1e-6 && x > rect.right - r.topRight) {
    const dx = x - (rect.right - r.topRight)
    return rect.top - r.topRight + Math.sqrt(Math.max(r.topRight * r.topRight - dx * dx, 0))
  }
  return rect.top
}

export function roundedSidesAt(y: number, rect: Rect, r: Radii): { minX: number; maxX: number } {
  let minX = rect.left
  let maxX = rect.right
  if (r.topLeft > 1e-6 && y > rect.top - r.topLeft) {
    const dy = y - (rect.top - r.topLeft)
    minX = rect.left + r.topLeft - Math.sqrt(Math.max(r.topLeft * r.topLeft - dy * dy, 0))
  }
  if (r.topRight > 1e-6 && y > rect.top - r.topRight) {
    const dy = y - (rect.top - r.topRight)
    maxX = rect.right - r.topRight + Math.sqrt(Math.max(r.topRight * r.topRight - dy * dy, 0))
  }
  return { minX, maxX }
}

// ------------------------------------------------------------------ (9) the bevel moves the outline out
export function bevelOf(win: Pick<Win, 'openingShape' | 'openingRevealRadius' | 'cornerRadius'>, T: number): number {
  if (win.openingShape !== 'rounded') return 0
  return Math.min(
    Math.max(win.openingRevealRadius, 0),
    Math.max(0.45 * T, 0.001),
    Math.max(0.45 * win.cornerRadius, 0.001),
  )
}

// every edge of a counter-clockwise outline moved outwards by b; a corner is where its two
// moved edges meet
export function movedOut(points: readonly XY[], b: number): XY[] {
  if (b <= 0) return [...points]
  const count = points.length
  return points.map((p1, i) => {
    const p0 = points[(i + count - 1) % count]!
    const p2 = points[(i + 1) % count]!
    const a = { x: p1.x - p0.x, y: p1.y - p0.y }
    const c = { x: p2.x - p1.x, y: p2.y - p1.y }
    const la = Math.hypot(a.x, a.y)
    const lc = Math.hypot(c.x, c.y)
    const na = { x: a.y / la, y: -a.x / la } // outwards: the right of the direction of travel
    const nc = { x: c.y / lc, y: -c.x / lc }
    const cross = a.x * c.y - a.y * c.x
    if (Math.abs(cross) <= 1e-12 * la * lc) return { x: p1.x + b * na.x, y: p1.y + b * na.y }
    const s = (b * ((nc.x - na.x) * c.y - (nc.y - na.y) * c.x)) / cross
    return { x: p1.x + b * na.x + s * a.x, y: p1.y + b * na.y + s * a.y }
  })
}

// the hole as the cutter has it through the wall (thickness T)
export function holeOutline(win: Win, T: number, rect: Rect = cutRect(win)): XY[] {
  const W = rect.right - rect.left
  const H = rect.top - rect.bottom
  if (win.openingShape === 'arch') return archOutline(rect, archRise(win.archHeight, W, H))
  if (win.openingShape === 'rounded') return movedOut(roundedOutline(rect, radiiOf(win, W, H)), bevelOf(win, T))
  return rectangleOutline(rect)
}

// ------------------------------------------------------------------ areas
export function areaOf(points: readonly XY[]): number {
  let twice = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    twice += a.x * b.y - b.x * a.y
  }
  return Math.abs(twice) / 2
}

export function boxOf(points: readonly XY[]): Rect {
  return {
    left: Math.min(...points.map((p) => p.x)),
    right: Math.max(...points.map((p) => p.x)),
    bottom: Math.min(...points.map((p) => p.y)),
    top: Math.max(...points.map((p) => p.y)),
  }
}

// what two convex outlines share (both counter-clockwise)
export function shared(subject: readonly XY[], cutter: readonly XY[]): XY[] {
  let out = [...subject]
  for (let i = 0; i < cutter.length && out.length > 0; i += 1) {
    const c1 = cutter[i]!
    const c2 = cutter[(i + 1) % cutter.length]!
    const side = (p: XY) => (c2.x - c1.x) * (p.y - c1.y) - (c2.y - c1.y) * (p.x - c1.x)
    const next: XY[] = []
    for (let j = 0; j < out.length; j += 1) {
      const p = out[j]!
      const q = out[(j + 1) % out.length]!
      const sp = side(p)
      const sq = side(q)
      if (sp >= 0) next.push(p)
      if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
        const k = sp / (sp - sq)
        next.push({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k })
      }
    }
    out = next
  }
  return out
}

// ------------------------------------------------------------------ (10) the wall with its holes
// a wall alone: length L, thickness T, its body from yb to yt above the plane it stands on.
// Holes are taken where they lie in the wall's face; where two meet the shared part is counted
// once (three over one place are not worked out here: the cases have none).
export function holesArea(holes: readonly XY[][], L: number, yb: number, yt: number): number {
  const face = rectangleOutline({ left: 0, right: L, bottom: yb, top: yt })
  const inside = holes.map((hole) => shared(hole, face))
  let area = 0
  for (let i = 0; i < inside.length; i += 1) {
    area += areaOf(inside[i]!)
    for (let j = 0; j < i; j += 1) area -= areaOf(shared(inside[i]!, inside[j]!))
  }
  return area
}

export function wallVolume(L: number, T: number, yb: number, yt: number, holes: readonly XY[][]): number {
  return L * T * (yt - yb) - T * holesArea(holes, L, yb, yt)
}

// ------------------------------------------------------------------ the body: parts
export type Hold = { name?: string; at: V3; turnX?: number; turnY?: number }
export type Part =
  | { kind: 'box'; name: string; slot: 'frame' | 'glass'; size: V3; at: V3; hold?: Hold }
  | { kind: 'sheet'; name: string; slot: 'frame' | 'glass'; points: V3[]; area: number }

const box = (name: string, slot: 'frame' | 'glass', size: V3, at: V3, hold?: Hold): Part => ({
  kind: 'box',
  name,
  slot,
  size,
  at,
  hold,
})

export const glassDepth = (win: Pick<Win, 'frameDepth'>) => Math.max(0.004, 0.08 * win.frameDepth)
export const sashBar = (win: Pick<Win, 'frameThickness'>) => Math.max(0.72 * win.frameThickness, 0.032)

// (11) the four bars of the frame
export function frameBars(win: Win): Part[] {
  const { width: w, height: h, frameThickness: f, frameDepth: d } = win
  const ih = h - 2 * f
  return [
    box('frame_top', 'frame', [w, f, d], [0, h / 2 - f / 2, 0]),
    box('frame_bottom', 'frame', [w, f, d], [0, -h / 2 + f / 2, 0]),
    box('frame_left', 'frame', [f, ih, d], [-w / 2 + f / 2, 0, 0]),
    box('frame_right', 'frame', [f, ih, d], [w / 2 - f / 2, 0, 0]),
  ]
}

// (12) the pane grid inside an opening iw by ih
export function grid(win: Win, iw: number, ih: number) {
  const n = win.columnRatios.length
  const m = win.rowRatios.length
  const cd = win.columnDividerThickness
  const rd = win.rowDividerThickness
  const sumC = win.columnRatios.reduce((a, b) => a + b, 0)
  const sumR = win.rowRatios.reduce((a, b) => a + b, 0)
  const widths = win.columnRatios.map((c) => (c / sumC) * (iw - (n - 1) * cd))
  const heights = win.rowRatios.map((r) => (r / sumR) * (ih - (m - 1) * rd))
  const xs: number[] = []
  let x = -iw / 2
  for (let j = 0; j < n; j += 1) {
    xs.push(x + widths[j]! / 2)
    x += widths[j]! + cd
  }
  const ys: number[] = []
  let y = ih / 2
  for (let k = 0; k < m; k += 1) {
    ys.push(y - heights[k]! / 2)
    y -= heights[k]! + rd
  }
  return { n, m, cd, rd, widths, heights, xs, ys }
}

// (13) the sill
export function sillOf(win: Win): Part[] {
  if (!win.sill) return []
  const { width: w, height: h, frameDepth: d, sillDepth: sd, sillThickness: st } = win
  return [box('sill', 'frame', [w + 0.4 * sd, st, sd], [0, -h / 2 - st / 2, d / 2 + sd / 2])]
}

// (11) to (13): the plain window (fixed, rectangle), in the order the fork builds it
export function plainParts(win: Win): Part[] {
  const { width: w, height: h, frameThickness: f, frameDepth: d } = win
  const iw = w - 2 * f
  const ih = h - 2 * f
  const g = grid(win, iw, ih)
  const parts = frameBars(win)
  for (let j = 0; j < g.n - 1; j += 1) {
    parts.push(box(`column_divider_${j + 1}`, 'frame', [g.cd, ih, d], [g.xs[j]! + g.widths[j]! / 2 + g.cd / 2, 0, 0]))
  }
  for (let k = 0; k < g.m - 1; k += 1) {
    for (let j = 0; j < g.n; j += 1) {
      parts.push(
        box(`row_divider_${k + 1}_in_column_${j + 1}`, 'frame', [g.widths[j]!, g.rd, d], [
          g.xs[j]!,
          g.ys[k]! - g.heights[k]! / 2 - g.rd / 2,
          0,
        ]),
      )
    }
  }
  for (let j = 0; j < g.n; j += 1) {
    for (let k = 0; k < g.m; k += 1) {
      parts.push(box(`pane_column_${j + 1}_row_${k + 1}`, 'glass', [g.widths[j]!, g.heights[k]!, glassDepth(win)], [g.xs[j]!, g.ys[k]!, 0]))
    }
  }
  return [...parts, ...sillOf(win)]
}

// ------------------------------------------------------------------ (14) arched and rounded fixed windows
export function shapedFixed(win: Win) {
  const { width: w, height: h, frameThickness: f, frameDepth: d } = win
  const e = Math.max(0, Math.min(f, w / 2 - 0.005, h / 2 - 0.005))
  const outer: Rect = { left: -w / 2, right: w / 2, bottom: -h / 2, top: h / 2 }
  const inner: Rect = { left: outer.left + e, right: outer.right - e, bottom: outer.bottom + e, top: outer.top - e }
  const iw = inner.right - inner.left
  const ih = inner.top - inner.bottom
  let outerArea: number
  let ringHoleArea: number
  let glassArea: number
  let topAt: (x: number) => number
  let sidesAt: (y: number) => { minX: number; maxX: number }
  if (win.openingShape === 'arch') {
    const a = Math.min(Math.max(win.archHeight ?? w / 2, 0.01), Math.max(h, 0.01))
    const aIn = Math.min(Math.max(a - e, 0.01), Math.max(ih, 0.01))
    const Ys = inner.top - aIn
    outerArea = areaOf(archOutline(outer, a))
    glassArea = areaOf(archOutline(inner, aIn))
    ringHoleArea = glassArea
    topAt = (x) => archHeightAt(x, iw / 2, Ys, aIn)
    sidesAt = (y) => {
      const half = archHalfWidthAt(y, iw / 2, Ys, aIn)
      return { minX: -half, maxX: half }
    }
  } else {
    const r = radiiOf(win, w, h)
    const rIn = insetRadii(r, e, iw, ih)
    outerArea = areaOf(roundedOutline(outer, r, 48))
    glassArea = areaOf(roundedOutline(inner, rIn, 48))
    ringHoleArea = areaOf(roundedOutline(inner, rIn, 64)) // the ring's hole is taken at 64 chords a quarter
    topAt = (x) => roundedTopAt(x, inner, rIn)
    sidesAt = (y) => roundedSidesAt(y, inner, rIn)
  }
  const g = grid(win, iw, ih)
  const columnDividers: Rect[] = []
  let x = inner.left
  for (let j = 0; j < g.n - 1; j += 1) {
    x += g.widths[j]!
    const top = Math.min(topAt(x), topAt(x + g.cd))
    if (top > inner.bottom + 0.01) columnDividers.push({ left: x, right: x + g.cd, bottom: inner.bottom, top })
    x += g.cd
  }
  const rowDividers: Rect[] = []
  let y = inner.top
  for (let k = 0; k < g.m - 1; k += 1) {
    y -= g.heights[k]!
    const { minX, maxX } = sidesAt(y)
    if (maxX - minX > 0.01 && y > inner.bottom) {
      rowDividers.push({ left: minX, right: maxX, bottom: Math.max(y - g.rd, inner.bottom), top: y })
    }
    y -= g.rd
  }
  const ring = e > 0.001
  const glazed = iw > 0.01 && ih > 0.01
  return {
    inset: e,
    frameVolume: (ring ? outerArea - ringHoleArea : outerArea) * d,
    glassVolume: glazed ? glassArea * glassDepth(win) : 0,
    columnDividers: glazed ? columnDividers : [],
    rowDividers: glazed ? rowDividers : [],
    dividerDepth: d + 0.001,
  }
}

// ------------------------------------------------------------------ (15) and (16) the types and their poses
// the overlap of sliding and hung sashes, and how far the moving one travels at open fraction t
export function overlapOf(win: Win, inner: number): number {
  return Math.min(Math.max(0.9 * win.frameThickness, 0.04), 0.12 * inner)
}

// the moving parts' places and turns at open fraction t
export function poseOf(win: Win, t: number): Hold[] {
  const { width: w, height: h, frameThickness: f, frameDepth: d } = win
  const iw = w - 2 * f
  const ih = h - 2 * f
  switch (win.windowType) {
    case 'sliding': {
      const o = overlapOf(win, iw)
      return [{ name: 'sliding-window-active-panel', at: [-iw / 4 - o / 4 + Math.max(iw / 2 - o, 0) * t, 0, 0.16 * d] }]
    }
    case 'single-hung': {
      const o = overlapOf(win, ih)
      return [{ name: 'single-hung-active-sash', at: [0, -ih / 4 - o / 4 + Math.max(ih / 2 - o, 0) * t, 0.16 * d] }]
    }
    case 'double-hung': {
      const o = overlapOf(win, ih)
      const travel = Math.max(ih / 2 - o, 0) * t
      return [
        { name: 'double-hung-top-sash', at: [0, ih / 4 + o / 4 - travel, -0.12 * d] },
        { name: 'double-hung-bottom-sash', at: [0, -ih / 4 - o / 4 + travel, 0.16 * d] },
      ]
    }
    case 'casement': {
      if (win.casementStyle === 'french') {
        return [
          { name: 'french-casement-left-sash', at: [-iw / 2, 0, 0.06 * d], turnY: (-t * Math.PI) / 2 },
          { name: 'french-casement-right-sash', at: [iw / 2, 0, 0.06 * d], turnY: (t * Math.PI) / 2 },
        ]
      }
      const sign = win.hingesSide === 'left' ? -1 : 1
      return [{ name: 'casement-window-sash', at: [(sign * iw) / 2, 0, 0.06 * d], turnY: (sign * t * Math.PI) / 2 }]
    }
    case 'awning':
    case 'hopper': {
      const down = win.windowType === 'hopper' || win.awningDirection === 'down'
      return [{ name: 'awning-window-sash', at: [0, down ? -ih / 2 : ih / 2, 0.06 * d], turnX: (-t * Math.PI) / 3 }]
    }
    case 'louvered': {
      const count = Math.max(4, Math.min(9, Math.round(h / 0.22)))
      const gap = ih / count
      return Array.from({ length: count }, (_, i) => ({
        name: `slat_${i + 1}`,
        at: [0, ih / 2 - gap * (i + 0.5), 0] as V3,
        turnX: (-t * Math.PI) / 3,
      }))
    }
    default:
      return [] // fixed, bay and bow have nothing that moves
  }
}

// every part of a rectangular window of any type at open fraction t
export function bodyOf(win: Win, t = Math.min(Math.max(win.operationState, 0), 1)): Part[] {
  if (win.windowType === 'fixed') return plainParts(win)
  const { width: w, height: h, frameThickness: f, frameDepth: d } = win
  const iw = w - 2 * f
  const ih = h - 2 * f
  const parts = frameBars(win)
  if (!(iw > 0.01 && ih > 0.01)) return [...parts, ...sillOf(win)]
  const g = glassDepth(win)
  const s = sashBar(win)
  const sashDepth = 0.72 * d
  const pose = poseOf(win, t)
  const marker = Math.max(0.38 * f, 0.018)
  // a sash of four bars and a pane, pw by ph, its middle at (cx, cy) of the hold
  const sash = (hold: Hold, pw: number, ph: number, cx: number, cy: number, depth: number, glassZ: number): Part[] => [
    box('sash_top', 'frame', [pw, s, depth], [cx, cy + ph / 2 - s / 2, 0], hold),
    box('sash_bottom', 'frame', [pw, s, depth], [cx, cy - ph / 2 + s / 2, 0], hold),
    box('sash_left', 'frame', [s, ph, depth], [cx - pw / 2 + s / 2, cy, 0], hold),
    box('sash_right', 'frame', [s, ph, depth], [cx + pw / 2 - s / 2, cy, 0], hold),
    box('sash_pane', 'glass', [Math.max(pw - 2 * s, 0.01), Math.max(ph - 2 * s, 0.01), g], [cx, cy, glassZ], hold),
  ]
  switch (win.windowType) {
    case 'sliding': {
      const rail = Math.max(0.55 * f, 0.025)
      const track = Math.max(0.35 * f, 0.018)
      const o = overlapOf(win, iw)
      const pw = (iw + o) / 2
      const ph = Math.max(ih - 2 * track, 0.01)
      const active = pose[0]!
      const fixedX = iw / 4 + o / 4
      const fixedZ = -0.12 * d
      parts.push(
        box('track_top', 'frame', [iw, track, d], [0, ih / 2 - track / 2, 0]),
        box('track_bottom', 'frame', [iw, track, d], [0, -ih / 2 + track / 2, 0]),
        box('active_pane', 'glass', [pw, ph, g], [0, 0, 0], active),
        box('fixed_pane', 'glass', [pw, ph, g], [fixedX, 0, fixedZ]),
        box('active_outer_stile', 'frame', [rail, ph, 0.72 * d], [-pw / 2 + rail / 2, 0, 0], active),
        box('fixed_outer_stile', 'frame', [rail, ph, 0.72 * d], [fixedX + pw / 2 - rail / 2, 0, fixedZ]),
        box('active_meeting_stile', 'frame', [rail, ph, 0.78 * d], [pw / 2 - rail / 2, 0, 0], active),
        box('fixed_meeting_stile', 'frame', [rail, ph, 0.78 * d], [fixedX - pw / 2 + rail / 2, 0, fixedZ]),
      )
      break
    }
    case 'single-hung':
    case 'double-hung': {
      const rail = Math.max(0.55 * f, 0.025)
      const track = Math.max(0.35 * f, 0.018)
      const o = overlapOf(win, ih)
      const ph = (ih + o) / 2
      const pw = Math.max(iw - 2 * track, 0.01)
      const both = win.windowType === 'double-hung'
      const top: Hold = both ? pose[0]! : { at: [0, ih / 4 + o / 4, -0.12 * d] }
      const bottom: Hold = both ? pose[1]! : pose[0]!
      const hung = (hold: Hold): Part[] => [
        box('sash_top', 'frame', [pw, s, sashDepth], [0, ph / 2 - s / 2, 0], hold),
        box('sash_bottom', 'frame', [pw, s, sashDepth], [0, -ph / 2 + s / 2, 0], hold),
        box('sash_left', 'frame', [s, ph, sashDepth], [-pw / 2 + s / 2, 0, 0], hold),
        box('sash_right', 'frame', [s, ph, sashDepth], [pw / 2 - s / 2, 0, 0], hold),
        box('sash_pane', 'glass', [Math.max(pw - 2 * s, 0.01), Math.max(ph - 2 * s, 0.01), g], [0, 0, 0], hold),
      ]
      parts.push(
        box('track_left', 'frame', [track, ih, d], [-iw / 2 + track / 2, 0, 0]),
        box('track_right', 'frame', [track, ih, d], [iw / 2 - track / 2, 0, 0]),
        ...hung(top),
        ...hung(bottom),
        box('top_meeting_rail', 'frame', [pw, rail, 0.78 * d], [0, -ph / 2 + rail / 2, 0], top),
        box('bottom_meeting_rail', 'frame', [pw, rail, 0.78 * d], [0, ph / 2 - rail / 2, 0], bottom),
      )
      break
    }
    case 'casement': {
      if (win.casementStyle === 'french') {
        const lw = iw / 2
        parts.push(...sash(pose[0]!, lw, ih, lw / 2, 0, sashDepth, 0.08 * sashDepth))
        parts.push(...sash(pose[1]!, lw, ih, -lw / 2, 0, sashDepth, 0.08 * sashDepth))
        for (const px of [-iw / 2, iw / 2]) {
          parts.push(
            box('hinge_marker', 'frame', [marker, 0.24 * ih, 1.1 * d], [px, 0.25 * ih, 0.08 * d]),
            box('hinge_marker', 'frame', [marker, 0.24 * ih, 1.1 * d], [px, -0.25 * ih, 0.08 * d]),
          )
        }
        break
      }
      const hold = pose[0]!
      const px = hold.at[0]
      parts.push(...sash(hold, iw, ih, -px, 0, sashDepth, 0.08 * sashDepth))
      parts.push(
        box('hinge_marker', 'frame', [marker, 0.28 * ih, 1.1 * d], [px, 0.24 * ih, 0.08 * d]),
        box('hinge_marker', 'frame', [marker, 0.28 * ih, 1.1 * d], [px, -0.24 * ih, 0.08 * d]),
      )
      break
    }
    case 'awning':
    case 'hopper': {
      const hold = pose[0]!
      const py = hold.at[1]
      parts.push(...sash(hold, iw, ih, 0, -py, sashDepth, 0.08 * sashDepth))
      parts.push(box('hinge_rail', 'frame', [0.42 * iw, marker, 1.1 * d], [0, py, 0.08 * d]))
      break
    }
    case 'louvered': {
      const rail = Math.max(0.45 * f, 0.022)
      const gap = ih / pose.length
      const slatHeight = Math.max(Math.min(0.62 * gap, 0.14), 0.045)
      const slatDepth = Math.max(0.16 * d, 0.012)
      parts.push(
        box('rail_left', 'frame', [rail, ih, 0.95 * d], [-iw / 2 + rail / 2, 0, 0]),
        box('rail_right', 'frame', [rail, ih, 0.95 * d], [iw / 2 - rail / 2, 0, 0]),
      )
      for (const hold of pose) {
        parts.push(box('slat', 'glass', [Math.max(iw - 2 * rail, 0.01), slatHeight, slatDepth], [0, 0, 0], hold))
      }
      break
    }
    case 'bay': {
      const p = Math.max(0.22 * w, 0.28)
      const cw = 0.48 * iw
      const run = Math.max((iw - cw) / 2, 0.01)
      const side = Math.hypot(run, p)
      const angle = Math.atan2(p, run)
      const depth = Math.max(0.72 * d, 0.04)
      parts.push(...sash({ at: [0, 0, p] }, cw, ih, 0, 0, depth, 0.08 * depth))
      parts.push(...sash({ at: [(-iw / 2 - cw / 2) / 2, 0, p / 2], turnY: -angle }, side, ih, 0, 0, depth, 0.08 * depth))
      parts.push(...sash({ at: [(iw / 2 + cw / 2) / 2, 0, p / 2], turnY: angle }, side, ih, 0, 0, depth, 0.08 * depth))
      const foot: Array<[number, number]> = [
        [-iw / 2, 0],
        [-cw / 2, p],
        [cw / 2, p],
        [iw / 2, 0],
      ]
      const around = iw + cw + 2 * Math.hypot((iw - cw) / 2, p)
      for (const cy of [ih / 2, -ih / 2]) {
        parts.push({
          kind: 'sheet',
          name: 'cap',
          slot: 'frame',
          points: [...foot.map(([x, z]) => [x, cy - f / 2, z] as V3), ...foot.map(([x, z]) => [x, cy + f / 2, z] as V3)],
          area: (iw + cw) * p + f * around,
        })
      }
      break
    }
    case 'bow': {
      const p = Math.max(0.18 * w, 0.22)
      const half = iw / 2
      const zAt = (x: number) => p * (1 - (x / half) ** 2)
      const xs = Array.from({ length: 29 }, (_, k) => -half + (iw * k) / 28)
      let along = 0 // the length of the 28 chords
      let under = 0 // the area between them and the wall line
      for (let k = 0; k < 28; k += 1) {
        along += Math.hypot(xs[k + 1]! - xs[k]!, zAt(xs[k + 1]!) - zAt(xs[k]!))
        under += ((xs[k + 1]! - xs[k]!) * (zAt(xs[k]!) + zAt(xs[k + 1]!))) / 2
      }
      const band = (name: string, slot: 'frame' | 'glass', y0: number, y1: number, dz: number): Part => ({
        kind: 'sheet',
        name,
        slot,
        points: xs.flatMap((x) => [[x, y0, zAt(x) + dz] as V3, [x, y1, zAt(x) + dz] as V3]),
        area: (y1 - y0) * along,
      })
      parts.push(
        band('band_top', 'frame', ih / 2 - s, ih / 2, 0),
        band('band_bottom', 'frame', -ih / 2, -ih / 2 + s, 0),
        band('band_glass', 'glass', -ih / 2 + s, ih / 2 - s, 0.04 * d),
      )
      for (const cy of [ih / 2, -ih / 2]) {
        parts.push({
          kind: 'sheet',
          name: 'cap',
          slot: 'frame',
          points: xs.flatMap((x) => [
            [x, cy - f / 2, 0] as V3,
            [x, cy - f / 2, zAt(x)] as V3,
            [x, cy + f / 2, 0] as V3,
            [x, cy + f / 2, zAt(x)] as V3,
          ]),
          area: iw * f + along * f + 2 * under,
        })
      }
      for (let i = 0; i <= 5; i += 1) {
        const x = -half + (iw * i) / 5
        parts.push(box('mullion', 'frame', [s, ih, 0.72 * d], [x, 0, zAt(x)]))
      }
      break
    }
  }
  return [...parts, ...sillOf(win)]
}

// a point of a held part, in the window's own frame
export function held(hold: Hold | undefined, p: V3): V3 {
  if (!hold) return p
  let [x, y, z] = p
  if (hold.turnY) {
    const c = Math.cos(hold.turnY)
    const s = Math.sin(hold.turnY)
    ;[x, z] = [x * c + z * s, -x * s + z * c]
  }
  if (hold.turnX) {
    const c = Math.cos(hold.turnX)
    const s = Math.sin(hold.turnX)
    ;[y, z] = [y * c - z * s, y * s + z * c]
  }
  return [hold.at[0] + x, hold.at[1] + y, hold.at[2] + z]
}

// the box that holds every part, in the window's own frame
export function reachOf(parts: readonly Part[]): { min: V3; max: V3 } {
  const min: V3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  const max: V3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  const take = (p: V3) => {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, p[axis]!)
      max[axis] = Math.max(max[axis]!, p[axis]!)
    }
  }
  for (const part of parts) {
    if (part.kind === 'sheet') {
      for (const p of part.points) take(p)
      continue
    }
    for (const sx of [-0.5, 0.5]) {
      for (const sy of [-0.5, 0.5]) {
        for (const sz of [-0.5, 0.5]) {
          take(
            held(part.hold, [
              part.at[0] + sx * part.size[0],
              part.at[1] + sy * part.size[1],
              part.at[2] + sz * part.size[2],
            ]),
          )
        }
      }
    }
  }
  return { min, max }
}

// how many boxes of each slot, and what they hold together
export function boxTotals(parts: readonly Part[]) {
  const totals = { frame: { count: 0, volume: 0 }, glass: { count: 0, volume: 0 } }
  for (const part of parts) {
    if (part.kind !== 'box') continue
    totals[part.slot].count += 1
    totals[part.slot].volume += part.size[0] * part.size[1] * part.size[2]
  }
  return totals
}
