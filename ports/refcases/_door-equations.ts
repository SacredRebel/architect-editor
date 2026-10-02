// The port note's equations for the door (entry 3), written out as code. Nothing here calls the
// old editor: the reference cases hold these against it. The number in front of each block is
// the equation's number in the note.

export type Q = { x: number; y: number } // a point of the wall's face: x along the wall from its start, y up from its base
export type V3 = [number, number, number]
export type Box = { name: string; size: V3; at: V3 } // a box: its three sizes and its middle
export type Rect = { left: number; right: number; bottom: number; top: number }

export type Segment = {
  type: 'panel' | 'glass' | 'empty'
  heightRatio: number
  columnRatios: readonly number[]
  dividerThickness: number
  panelDepth: number
  panelInset: number
}

export type Door = {
  x: number // the middle's distance from the wall's start, along the chord
  y: number // the middle's height over the wall's base
  yaw: number // 0 on the wall's front (left) face, pi on its back
  width: number
  height: number
  shape: 'rectangle' | 'rounded' | 'arch'
  archHeight: number | undefined
  cornerRadius: number
  radiusMode: 'all' | 'individual'
  topRadii: readonly [number, number] // [left, right]
  revealRadius: number
  frameThickness: number
  frameDepth: number
  threshold: boolean
  thresholdHeight: number
  type: string
  hingesSide: 'left' | 'right'
  swingDirection: 'inward' | 'outward'
  swingAngle: number
  slideDirection: 'left' | 'right'
  leafCount: number
  garagePanelCount: number
  operationState: number
  segments: readonly Segment[]
  contentPadding: readonly [number, number]
  handle: boolean
  handleHeight: number
  handleSide: 'left' | 'right'
  doorCloser: boolean
  panicBar: boolean
  panicBarHeight: number
}

// A door's fields as the old editor stores them, read into the names above. A field that is
// not there takes the default of the note's parameter table.
export function plainDoor(node: Record<string, unknown>): Door {
  const pick = <T>(key: string, otherwise: T): T => (node[key] === undefined ? otherwise : (node[key] as T))
  const position = pick<readonly number[]>('position', [0, 0, 0])
  const rotation = pick<readonly number[]>('rotation', [0, 0, 0])
  const segments = pick<ReadonlyArray<Partial<Segment>>>('segments', [
    { type: 'panel', heightRatio: 0.4 },
    { type: 'panel', heightRatio: 0.6 },
  ])
  return {
    x: position[0]!,
    y: position[1]!,
    yaw: rotation[1]!,
    width: pick('width', 0.9),
    height: pick('height', 2.1),
    shape: pick('openingShape', 'rectangle'),
    archHeight: node.archHeight as number | undefined,
    cornerRadius: pick('cornerRadius', 0.15),
    radiusMode: pick('openingRadiusMode', 'all'),
    topRadii: pick('openingTopRadii', [0.15, 0.15]),
    revealRadius: pick('openingRevealRadius', 0.025),
    frameThickness: pick('frameThickness', 0.05),
    frameDepth: pick('frameDepth', 0.07),
    threshold: pick('threshold', true),
    thresholdHeight: pick('thresholdHeight', 0.02),
    type: pick('doorType', 'hinged'),
    hingesSide: pick('hingesSide', 'left'),
    swingDirection: pick('swingDirection', 'inward'),
    swingAngle: pick('swingAngle', 0),
    slideDirection: pick('slideDirection', 'left'),
    leafCount: pick('leafCount', 1),
    garagePanelCount: pick('garagePanelCount', 4),
    operationState: pick('operationState', 0),
    segments: segments.map((segment) => ({
      type: segment.type ?? 'panel',
      heightRatio: segment.heightRatio ?? 1,
      columnRatios: segment.columnRatios ?? [1],
      dividerThickness: segment.dividerThickness ?? 0.03,
      panelDepth: segment.panelDepth ?? 0.01,
      panelInset: segment.panelInset ?? 0.04,
    })),
    contentPadding: pick('contentPadding', [0.04, 0.04]),
    handle: pick('handle', true),
    handleHeight: pick('handleHeight', 1.05),
    handleSide: pick('handleSide', 'right'),
    doorCloser: pick('doorCloser', false),
    panicBar: pick('panicBar', false),
    panicBarHeight: pick('panicBarHeight', 1.0),
  }
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
const box = (name: string, size: V3, at: V3): Box => ({ name, size, at })

// ------------------------------------------------------------------ where it sits

// (1)
export function placeOnWall(L: number, asked: number, width: number, height: number) {
  return { x: Math.max(width / 2, Math.min(L - width / 2, asked)), y: height / 2 }
}

// (2) the same place in the level: S and E are the wall's ends (u, v); the answer is (u, up, v)
export function placeInLevel(S: Q, E: Q, x: number, y: number, base = 0, levelOffset = 0): V3 {
  const angle = Math.atan2(E.y - S.y, E.x - S.x)
  return [S.x + x * Math.cos(angle), base + y + levelOffset, S.y + x * Math.sin(angle)]
}

// (2) and in the plan: x along the wall, z out of its front (left) face
export function placeInPlan(S: Q, E: Q, x: number, z = 0): Q {
  const c = Math.hypot(E.x - S.x, E.y - S.y)
  const t = { x: (E.x - S.x) / c, y: (E.y - S.y) / c }
  return { x: S.x + x * t.x - z * t.y, y: S.y + x * t.y + z * t.x }
}
// (2) a point of the door's own frame, in the wall's frame: the door is turned by its yaw about the upright
export function inWallFrame(d: Door, p: { x: number; y?: number; z: number }): V3 {
  return [d.x + p.x * Math.cos(d.yaw) + p.z * Math.sin(d.yaw), d.y + (p.y ?? 0), -p.x * Math.sin(d.yaw) + p.z * Math.cos(d.yaw)]
}

// (3)
export function overlap(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom
}
export const faceRect = (x: number, y: number, width: number, height: number): Rect => ({
  left: x - width / 2,
  right: x + width / 2,
  bottom: y - height / 2,
  top: y + height / 2,
})

// (4)
export function handleAfterResize(handleHeight: number, height: number, newHeight: number): number {
  const ratio = height > 0 ? newHeight / height : 1
  return Math.min(Math.max(handleHeight * ratio, 0.5), Math.max(0.5, newHeight - 0.1))
}
export function widthResized(d: Door, arrow: 'left' | 'right', newWidth: number) {
  const sign = arrow === 'right' ? 1 : -1
  const along = Math.cos(d.yaw)
  const held = d.x - sign * (d.width / 2) * along // the edge that stays
  return { x: held + sign * (newWidth / 2) * along, width: newWidth }
}
export function heightResized(d: Door, newHeight: number) {
  const bottom = d.y - d.height / 2
  return {
    y: bottom + newHeight / 2,
    height: newHeight,
    handleHeight: handleAfterResize(d.handleHeight, d.height, newHeight),
  }
}

// ------------------------------------------------------------------ the hole

// (5)
export function bottomLowering(bottom: number): number {
  return bottom < 0.005 ? 0.02 : 0
}
export function holeRect(d: Door): Rect & { lowered: number } {
  const bottom = d.y - d.height / 2
  const lowered = bottomLowering(bottom)
  return { left: d.x - d.width / 2, right: d.x + d.width / 2, bottom: bottom - lowered, top: d.y + d.height / 2, lowered }
}

// (6)
export function rectOutline(r: Rect): Q[] {
  return [
    { x: r.left, y: r.bottom },
    { x: r.right, y: r.bottom },
    { x: r.right, y: r.top },
    { x: r.left, y: r.top },
  ]
}

// (7) the height of a half ellipse over x: 0 at the two ends, `rise` in the middle
export function archY(x: number, middle: number, half: number, spring: number, rise: number): number {
  if (half <= 1e-6) return spring
  const k = Math.min(Math.abs(x - middle) / half, 1)
  return spring + rise * Math.sqrt(Math.max(1 - k * k, 0))
}
export function archRise(asked: number | undefined, width: number, height: number): number {
  return Math.min(Math.max(asked ?? width / 2, 0.01), height)
}
export function archOutline(r: Rect, rise: number, steps = 32): Q[] {
  const W = r.right - r.left
  const spring = r.top - rise
  const points: Q[] = [
    { x: r.left, y: r.bottom },
    { x: r.right, y: r.bottom },
    { x: r.right, y: spring },
  ]
  for (let i = 1; i <= steps; i += 1) {
    const x = r.right - (W * i) / steps
    points.push({ x, y: archY(x, (r.left + r.right) / 2, W / 2, spring, rise) })
  }
  return points
}
// the same head as a number: the 32 chords hold this much of the true half ellipse
export function archHeadShare(steps = 32): number {
  let total = 0
  for (let i = 1; i < steps; i += 1) total += Math.sqrt(1 - (1 - (2 * i) / steps) ** 2)
  return total / steps / (Math.PI / 4)
}

// (8)
export function topRadii(d: Door, width: number, height: number): { left: number; right: number } {
  if (d.radiusMode === 'individual') {
    const left = Math.max(d.topRadii[0], 0)
    const right = Math.max(d.topRadii[1], 0)
    const k = Math.min(1, width / Math.max(left + right, 1e-6), height / Math.max(left, 1e-6), height / Math.max(right, 1e-6))
    return { left: left * k, right: right * k }
  }
  const r = Math.min(Math.max(d.cornerRadius, 0), Math.min(width / 2, height))
  return { left: r, right: r }
}
export function roundedOutline(r: Rect, radii: { left: number; right: number }, chords = 48): Q[] {
  const points: Q[] = []
  const add = (x: number, y: number) => {
    const last = points[points.length - 1]
    if (last && Math.abs(last.x - x) < 1e-12 && Math.abs(last.y - y) < 1e-12) return
    points.push({ x, y })
  }
  add(r.left, r.bottom)
  add(r.right, r.bottom)
  if (radii.right > 1e-6) {
    for (let i = 0; i <= chords; i += 1) {
      const angle = ((Math.PI / 2) * i) / chords
      add(r.right - radii.right + radii.right * Math.cos(angle), r.top - radii.right + radii.right * Math.sin(angle))
    }
  } else add(r.right, r.top)
  if (radii.left > 1e-6) {
    for (let i = 0; i <= chords; i += 1) {
      const angle = Math.PI / 2 + ((Math.PI / 2) * i) / chords
      add(r.left + radii.left + radii.left * Math.cos(angle), r.top - radii.left + radii.left * Math.sin(angle))
    }
  } else add(r.left, r.top)
  return points
}

// (9) every edge of an outline moved outwards by e; neighbours meet where the moved edges cross.
// The outline runs anticlockwise, so an edge's outward side is on its right.
export function grown(polygon: readonly Q[], e: number): Q[] {
  if (e <= 0) return polygon.map((p) => ({ ...p }))
  const n = polygon.length
  const out: Q[] = []
  for (let i = 0; i < n; i += 1) {
    const before = polygon[(i + n - 1) % n]!
    const here = polygon[i]!
    const after = polygon[(i + 1) % n]!
    const a = { x: here.x - before.x, y: here.y - before.y }
    const b = { x: after.x - here.x, y: after.y - here.y }
    const la = Math.hypot(a.x, a.y)
    const lb = Math.hypot(b.x, b.y)
    const na = { x: a.y / la, y: -a.x / la }
    const nb = { x: b.y / lb, y: -b.x / lb }
    const k = e / (1 + na.x * nb.x + na.y * nb.y)
    out.push({ x: here.x + (na.x + nb.x) * k, y: here.y + (na.y + nb.y) * k })
  }
  return out
}
export function revealGrowth(d: Door, wallThickness: number): number {
  if (d.shape !== 'rounded') return 0
  return Math.min(Math.max(d.revealRadius, 0), Math.max(wallThickness * 0.45, 0.001), Math.max(d.cornerRadius * 0.45, 0.001))
}

// (5) to (9) together: the outline as the door's numbers give it, and as the wall is cut with it
export function holeOutline(d: Door, wallThickness: number): { rect: Rect; drawn: Q[]; cut: Q[]; growth: number } {
  const rect = holeRect(d)
  const W = Math.max(rect.right - rect.left, 1e-6)
  const H = Math.max(rect.top - rect.bottom, 1e-6)
  const drawn =
    d.shape === 'arch'
      ? archOutline(rect, archRise(d.archHeight, W, H))
      : d.shape === 'rounded'
        ? roundedOutline(rect, topRadii(d, W, H))
        : rectOutline(rect)
  const growth = revealGrowth(d, wallThickness)
  return { rect, drawn, cut: grown(drawn, growth), growth }
}

export function areaOf(points: readonly Q[]): number {
  let twice = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    twice += a.x * b.y - b.x * a.y
  }
  return Math.abs(twice) / 2
}

// (10) the part of an outline that lies on the wall's face: 0 to L along, from the body's bottom to its top
export function onFace(polygon: readonly Q[], L: number, bottom: number, top: number): Q[] {
  const cut = (points: Q[], inside: (p: Q) => boolean, cross: (a: Q, b: Q) => Q): Q[] => {
    const out: Q[] = []
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i]!
      const b = points[(i + 1) % points.length]!
      if (inside(a)) out.push(a)
      if (inside(a) !== inside(b)) out.push(cross(a, b))
    }
    return out
  }
  const atX = (x: number) => (a: Q, b: Q) => ({ x, y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) })
  const atY = (y: number) => (a: Q, b: Q) => ({ x: a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y), y })
  let points = polygon.map((p) => ({ ...p }))
  points = cut(points, (p) => p.x >= 0, atX(0))
  points = cut(points, (p) => p.x <= L, atX(L))
  points = cut(points, (p) => p.y >= bottom, atY(bottom))
  points = cut(points, (p) => p.y <= top, atY(top))
  return points
}
export function holeVolume(d: Door, wall: { L: number; thickness: number; bottom: number; top: number }): number {
  return areaOf(onFace(holeOutline(d, wall.thickness).cut, wall.L, wall.bottom, wall.top)) * wall.thickness
}

// ------------------------------------------------------------------ the body

export const LEAF_DEPTH = 0.04

// (11) the lengths every part is worked out from
export function lengths(d: Door) {
  const f = d.frameThickness
  return {
    W: d.width,
    H: d.height,
    f,
    D: d.frameDepth,
    inside: d.width - 2 * f, // between the posts
    leafHeight: d.height - f,
    leafMiddle: -f / 2,
    leafTop: d.height / 2 - f,
    leafBottom: -d.height / 2,
  }
}

// the body's shape: these four types are always drawn rectangular
export function bodyShape(d: Door): Door['shape'] {
  return d.type === 'folding' || d.type === 'pocket' || d.type === 'barn' || d.type === 'sliding' ? 'rectangle' : d.shape
}

// (12)
export function frameBoxes(d: Door): Box[] {
  const { W, H, f, D, inside } = lengths(d)
  const out: Box[] = []
  if (bodyShape(d) === 'rectangle') {
    out.push(box('frame.post_left', [f, H, D], [-W / 2 + f / 2, 0, 0]))
    out.push(box('frame.post_right', [f, H, D], [W / 2 - f / 2, 0, 0]))
    out.push(box('frame.head', [W, f, D], [0, H / 2 - f / 2, 0]))
  } else if (bodyShape(d) === 'arch') {
    const a = archFrame(d)
    out.push(box('frame.post_left', [f, a.postHeight, D], [-W / 2 + f / 2, -H / 2 + a.postHeight / 2, 0]))
    out.push(box('frame.post_right', [f, a.postHeight, D], [W / 2 - f / 2, -H / 2 + a.postHeight / 2, 0]))
  }
  if (d.threshold) out.push(box('threshold', [inside, d.thresholdHeight, D], [0, -H / 2 + d.thresholdHeight / 2, 0]))
  return out
}

// (13) the frame of an arched door: two posts and a head
export function archFrame(d: Door) {
  const { W, H, f } = lengths(d)
  const rise = Math.min(Math.max(d.archHeight ?? W / 2, 0.01), Math.max(H, 0.01))
  const spring = H / 2 - rise
  const shallow = rise <= 2 * f
  const headBottom = shallow ? spring - f : spring
  const postHeight = Math.max(headBottom + H / 2, 0.01)
  let head: Q[]
  if (shallow) {
    // a solid bar under the arch
    head = [
      { x: -W / 2, y: headBottom },
      { x: W / 2, y: headBottom },
      { x: W / 2, y: spring },
    ]
    for (let i = 1; i <= 32; i += 1) {
      const x = W / 2 - (W * i) / 32
      head.push({ x, y: archY(x, 0, W / 2, spring, rise) })
    }
  } else {
    // a band between the outer arch and one set in by the frame thickness
    const innerHalf = Math.max(W / 2 - f, 0)
    const innerTop = Math.min(H / 2 - f, H / 2 - 0.001)
    const innerSpring = Math.min(Math.min(spring + f, H / 2 - f), innerTop - 0.001)
    const innerRise = Math.max(innerTop - innerSpring, 0)
    const inner = (x: number) =>
      Math.min(archY(x, 0, innerHalf, innerSpring, innerRise), archY(x, 0, W / 2, spring, rise) - 0.001)
    head = [{ x: -W / 2, y: spring }]
    for (let i = 1; i <= 32; i += 1) {
      const x = -W / 2 + (W * i) / 32
      head.push({ x, y: archY(x, 0, W / 2, spring, rise) })
    }
    if (innerHalf <= 0.001 || innerTop <= innerSpring + 0.001) {
      // no room for an inner arch: the head is solid
    } else {
      head.push({ x: innerHalf, y: spring }, { x: innerHalf, y: inner(innerHalf) })
      for (let i = 31; i >= 0; i -= 1) {
        const x = -innerHalf + (2 * innerHalf * i) / 32
        head.push({ x, y: inner(x) })
      }
      head.push({ x: -innerHalf, y: spring })
    }
  }
  return { rise, spring, shallow, headBottom, postHeight, head }
}

// (14) the frame of a round-cornered door: one ring, open at the bottom
export function roundedFrameArea(d: Door): number {
  const { W, H, f } = lengths(d)
  const radii = topRadii(d, W, H)
  const outer = roundedOutline({ left: -W / 2, right: W / 2, bottom: -H / 2, top: H / 2 }, radii, 48)
  const inset = Math.min(f, W / 2 - 0.005, H - 0.005)
  if (inset <= 0.001) return areaOf(outer)
  const innerRect = { left: -W / 2 + inset, right: W / 2 - inset, bottom: -H / 2, top: H / 2 - inset }
  const innerRadii = fitRadii(
    { left: Math.max(radii.left - inset, 0), right: Math.max(radii.right - inset, 0) },
    innerRect.right - innerRect.left,
    innerRect.top - innerRect.bottom,
  )
  return areaOf(outer) - areaOf(roundedOutline(innerRect, innerRadii, 64))
}
export function fitRadii(radii: { left: number; right: number }, width: number, height: number) {
  const k = Math.min(
    1,
    width / Math.max(radii.left + radii.right, 1e-6),
    height / Math.max(radii.left, 1e-6),
    height / Math.max(radii.right, 1e-6),
  )
  return { left: radii.left * k, right: radii.right * k }
}

// (16) what a leaf is filled with: rails, stiles, rows, columns
export type LeafPlace = { width: number; height: number; middleX: number; middleY: number; z?: number }
export function leafContent(
  name: string,
  leaf: LeafPlace,
  segments: readonly Segment[],
  padding: readonly [number, number],
  keepWhenEmpty = false,
  border = true,
): Box[] {
  const z = leaf.z ?? 0
  const [padX, padY] = padding
  const out: Box[] = []
  const filled = segments.some((segment) => segment.type !== 'empty') || keepWhenEmpty
  if (border && filled && padY > 0) {
    out.push(box(`${name}.rail_top`, [leaf.width, padY, LEAF_DEPTH], [leaf.middleX, leaf.middleY + leaf.height / 2 - padY / 2, z]))
    out.push(box(`${name}.rail_bottom`, [leaf.width, padY, LEAF_DEPTH], [leaf.middleX, leaf.middleY - leaf.height / 2 + padY / 2, z]))
  }
  if (border && filled && padX > 0) {
    const stile = leaf.height - 2 * padY
    out.push(box(`${name}.stile_left`, [padX, stile, LEAF_DEPTH], [leaf.middleX - leaf.width / 2 + padX / 2, leaf.middleY, z]))
    out.push(box(`${name}.stile_right`, [padX, stile, LEAF_DEPTH], [leaf.middleX + leaf.width / 2 - padX / 2, leaf.middleY, z]))
  }
  for (const piece of leafPieces(leaf, segments, padding)) {
    if (piece.kind === 'divider') out.push(box(`${name}.${piece.name}`, [piece.width, piece.height, LEAF_DEPTH + 0.001], [piece.x, piece.y, z]))
    if (piece.kind === 'glass') out.push(box(`${name}.${piece.name}`, [piece.width, piece.height, Math.max(0.004, LEAF_DEPTH * 0.15)], [piece.x, piece.y, z]))
    if (piece.kind === 'panel') out.push(box(`${name}.${piece.name}`, [piece.width, piece.height, LEAF_DEPTH], [piece.x, piece.y, z]))
    if (piece.kind === 'raised') out.push(box(`${name}.${piece.name}`, [piece.width, piece.height, piece.depth], [piece.x, piece.y, z + LEAF_DEPTH / 2 + piece.depth / 2]))
  }
  return out
}
export type Piece = { kind: 'divider' | 'glass' | 'panel' | 'raised'; name: string; width: number; height: number; x: number; y: number; depth: number }
export function leafPieces(leaf: LeafPlace, segments: readonly Segment[], padding: readonly [number, number]): Piece[] {
  const [padX, padY] = padding
  const contentWidth = leaf.width - 2 * padX
  const contentHeight = leaf.height - 2 * padY
  const total = sum(segments.map((segment) => segment.heightRatio))
  const out: Piece[] = []
  let top = leaf.middleY + contentHeight / 2
  segments.forEach((segment, row) => {
    const height = (segment.heightRatio / total) * contentHeight
    const y = top - height / 2
    const count = segment.columnRatios.length
    const usable = contentWidth - (count - 1) * segment.dividerThickness
    const widths = segment.columnRatios.map((ratio) => (ratio / sum(segment.columnRatios)) * usable)
    const middles: number[] = []
    let x = leaf.middleX - contentWidth / 2
    widths.forEach((width, column) => {
      middles.push(x + width / 2)
      x += width
      if (column < count - 1) {
        if (segment.type !== 'empty') {
          out.push({ kind: 'divider', name: `row${row + 1}.divider${column + 1}`, width: segment.dividerThickness, height, x: x + segment.dividerThickness / 2, y, depth: LEAF_DEPTH + 0.001 })
        }
        x += segment.dividerThickness
      }
    })
    widths.forEach((width, column) => {
      const label = `row${row + 1}.column${column + 1}`
      if (segment.type === 'glass') out.push({ kind: 'glass', name: `${label}.glass`, width, height, x: middles[column]!, y, depth: Math.max(0.004, LEAF_DEPTH * 0.15) })
      if (segment.type === 'panel') {
        out.push({ kind: 'panel', name: `${label}.panel`, width, height, x: middles[column]!, y, depth: LEAF_DEPTH })
        const insetWidth = width - 2 * segment.panelInset
        const insetHeight = height - 2 * segment.panelInset
        if (insetWidth > 0.01 && insetHeight > 0.01) {
          const depth = Math.abs(segment.panelDepth) < 0.002 ? 0.005 : Math.abs(segment.panelDepth)
          out.push({ kind: 'raised', name: `${label}.raised`, width: insetWidth, height: insetHeight, x: middles[column]!, y, depth })
        }
      }
    })
    top -= height
  })
  return out
}

// (15) and (17): a leaf that swings, with what hangs on it. The boxes are given with the leaf shut.
export type SwingLeaf = { hinge: number; yaw: number; openYaw: number; width: number; middleX: number; side: 'left' | 'right'; handleSide: 'left' | 'right'; closer: boolean }
export function swingLeaves(d: Door, runtimeAngle?: number): SwingLeaf[] {
  const { inside } = lengths(d)
  const angle = Math.max(0, Math.min(Math.PI / 2, runtimeAngle ?? d.swingAngle))
  const swing = d.swingDirection === 'inward' ? 1 : -1
  if (d.type === 'double' || d.type === 'french') {
    return [
      { hinge: -inside / 2, yaw: -angle * swing, openYaw: (-Math.PI / 2) * swing, width: inside / 2, middleX: -inside / 4, side: 'left', handleSide: 'right', closer: d.doorCloser },
      { hinge: inside / 2, yaw: angle * swing, openYaw: (Math.PI / 2) * swing, width: inside / 2, middleX: inside / 4, side: 'right', handleSide: 'left', closer: false },
    ]
  }
  const hinge = d.hingesSide === 'right' ? 1 : -1
  return [
    { hinge: (hinge * inside) / 2, yaw: angle * swing * hinge, openYaw: (Math.PI / 2) * swing * hinge, width: inside, middleX: 0, side: d.hingesSide, handleSide: d.handleSide, closer: d.doorCloser },
  ]
}
// where the leaf's free edge is, in the door's own frame: (x, z)
export function freeEdge(leaf: SwingLeaf): { x: number; z: number } {
  const reach = leaf.side === 'left' ? leaf.width : -leaf.width
  return { x: leaf.hinge + reach * Math.cos(leaf.yaw), z: -reach * Math.sin(leaf.yaw) }
}
export function hardwareBoxes(d: Door, leaf: SwingLeaf, name: string): Box[] {
  const { H, leafHeight, leafMiddle } = lengths(d)
  const out: Box[] = []
  if (!d.segments.some((segment) => segment.type !== 'empty')) return out
  const face = LEAF_DEPTH / 2
  if (d.handle) {
    const x = leaf.handleSide === 'right' ? leaf.middleX + leaf.width / 2 - 0.045 : leaf.middleX - leaf.width / 2 + 0.045
    const y = d.handleHeight - H / 2
    out.push(box(`${name}.handle.front_plate`, [0.028, 0.14, 0.01], [x, y, face + 0.005]))
    out.push(box(`${name}.handle.front_grip`, [0.022, 0.1, 0.035], [x, y, face + 0.025]))
    out.push(box(`${name}.handle.back_plate`, [0.028, 0.14, 0.01], [x, y, -face - 0.005]))
    out.push(box(`${name}.handle.back_grip`, [0.022, 0.1, 0.035], [x, y, -face - 0.025]))
  }
  if (leaf.closer) {
    const y = leafMiddle + leafHeight / 2 - 0.04
    out.push(box(`${name}.closer.body`, [0.28, 0.055, 0.055], [leaf.middleX, y, face + 0.03]))
    out.push(box(`${name}.closer.arm`, [0.14, 0.015, 0.015], [leaf.middleX + leaf.width / 4, y + 0.025, face + 0.015]))
  }
  if (d.panicBar) {
    out.push(box(`${name}.panic_bar`, [leaf.width * 0.72, 0.04, 0.055], [leaf.middleX, d.panicBarHeight - H / 2, face + 0.03]))
  }
  return out
}
export function hingeBoxes(d: Door, leaf: SwingLeaf, name: string): Box[] {
  const { leafBottom, leafTop } = lengths(d)
  if (!d.segments.some((segment) => segment.type !== 'empty')) return []
  const x = leaf.side === 'right' ? leaf.hinge - 0.012 : leaf.hinge + 0.012
  const size: V3 = [0.024, 0.1, LEAF_DEPTH + 0.016]
  return [
    box(`${name}.hinge_bottom`, size, [x, leafBottom + 0.25, 0]),
    box(`${name}.hinge_middle`, size, [x, (leafBottom + leafTop) / 2, 0]),
    box(`${name}.hinge_top`, size, [x, leafTop - 0.25, 0]),
  ]
}
// every box of a hinged, double or French door with a rectangular top, leaves shut, in the order they are made
export function swingDoorBoxes(d: Door): Box[] {
  const { leafHeight, leafMiddle } = lengths(d)
  const out = frameBoxes(d)
  const leaves = swingLeaves(d)
  for (const leaf of leaves) {
    const name = leaves.length > 1 ? `leaf_${leaf.side}` : 'leaf'
    out.push(...leafContent(name, { width: leaf.width, height: leafHeight, middleX: leaf.middleX, middleY: leafMiddle }, d.segments, d.contentPadding))
    out.push(...hardwareBoxes(d, leaf, name))
    out.push(...hingeBoxes(d, leaf, name))
  }
  return out
}

// (18) leaves under an arch or under round corners
// a rectangle whose top follows a line, read at 21 places from right to left
export function topClipped(left: number, right: number, bottom: number, top: number, line: (x: number) => number): Q[] | null {
  const points: Q[] = []
  for (let i = 0; i <= 20; i += 1) {
    const x = right + ((left - right) * i) / 20
    const y = Math.min(top, line(x))
    if (y > bottom + 0.001) points.push({ x, y })
  }
  if (points.length < 2) return null
  return [{ x: left, y: bottom }, { x: right, y: bottom }, ...points]
}
export function roundedTopY(x: number, left: number, right: number, top: number, radii: { left: number; right: number }): number {
  if (radii.left > 1e-6 && x < left + radii.left) {
    const dx = x - (left + radii.left)
    return top - radii.left + Math.sqrt(Math.max(radii.left * radii.left - dx * dx, 0))
  }
  if (radii.right > 1e-6 && x > right - radii.right) {
    const dx = x - (right - radii.right)
    return top - radii.right + Math.sqrt(Math.max(radii.right * radii.right - dx * dx, 0))
  }
  return top
}
// half an arch over one leaf of a pair: the crown is at the edge where the two leaves meet
export function halfArchY(x: number, left: number, right: number, top: number, rise: number, hingeSide: 'left' | 'right'): number {
  const width = right - left
  if (width <= 1e-6) return top
  const a = Math.max(rise, 0.01)
  const k = hingeSide === 'left' ? clamp((right - x) / width, 0, 1) : clamp((x - left) / width, 0, 1)
  return top - a + a * Math.sqrt(Math.max(1 - k * k, 0))
}
const leafArchRise = (asked: number, width: number, height: number) => Math.min(Math.max(asked, 0.01), Math.max(height, 0.01))

// the line a shaped leaf's top follows, and the area of its border (an outline with a hole)
export function shapedLeaf(d: Door, leaf: SwingLeaf) {
  const { inside, leafHeight, leafTop, leafBottom } = lengths(d)
  const [padX, padY] = d.contentPadding
  const left = leaf.middleX - leaf.width / 2
  const right = leaf.middleX + leaf.width / 2
  const pair = d.type === 'double' || d.type === 'french'
  const asked = d.archHeight ?? 0.45
  const innerLeft = left + padX
  const innerRight = right - padX
  const innerBottom = leafBottom + padY
  const innerTop = leafTop - padY
  const room = innerRight > innerLeft + 0.01 && innerTop > innerBottom + 0.01
  let line: (x: number) => number
  let outer: Q[] | null
  let hole: Q[] | null = null
  if (d.shape === 'arch' && !pair) {
    const rise = leafArchRise(asked, leaf.width, leafHeight)
    line = (x) => archY(x, leaf.middleX, leaf.width / 2, leafTop - rise, rise)
    outer = archOutline({ left, right, bottom: leafBottom, top: leafTop }, rise)
    if (room) {
      const innerRise = leafArchRise(Math.max(rise - padY, 0.01), innerRight - innerLeft, innerTop - innerBottom)
      hole = archOutline({ left: innerLeft, right: innerRight, bottom: innerBottom, top: innerTop }, innerRise)
    }
  } else if (d.shape === 'arch') {
    const rise = leafArchRise(asked, leaf.width, leafHeight)
    line = (x) => halfArchY(x, left, right, leafTop, rise, leaf.side)
    outer = topClipped(left, right, leafBottom, leafTop, (x) => halfArchY(x, left, right, leafTop, asked, leaf.side))
    if (room) {
      const innerRise = leafArchRise(Math.max(asked - padY, 0.01), innerRight - innerLeft, innerTop - innerBottom)
      hole = topClipped(innerLeft, innerRight, innerBottom, innerTop, (x) => halfArchY(x, innerLeft, innerRight, innerTop, innerRise, leaf.side))
    }
  } else if (!pair) {
    const radii = fitRadii(topRadii(d, inside, leafHeight), leaf.width, leafHeight)
    line = (x) => roundedTopY(x, left, right, leafTop, radii)
    outer = roundedOutline({ left, right, bottom: leafBottom, top: leafTop }, radii, 48)
    if (room) {
      const shrink = Math.max(padX, padY)
      const innerRadii = fitRadii({ left: Math.max(radii.left - shrink, 0), right: Math.max(radii.right - shrink, 0) }, innerRight - innerLeft, innerTop - innerBottom)
      hole = roundedOutline({ left: innerLeft, right: innerRight, bottom: innerBottom, top: innerTop }, innerRadii, 80)
    }
  } else {
    // a pair under round corners: each leaf is cut by the outline of the two together
    const radii = fitRadii(topRadii(d, inside, leafHeight), inside, leafHeight)
    line = (x) => roundedTopY(x, -inside / 2, inside / 2, leafTop, radii)
    outer = topClipped(left, right, leafBottom, leafTop, line)
    if (room) {
      const shrink = Math.max(padX, padY)
      const innerRadii = fitRadii({ left: Math.max(radii.left - shrink, 0), right: Math.max(radii.right - shrink, 0) }, inside - 2 * padX, innerTop - innerBottom)
      hole = topClipped(innerLeft, innerRight, innerBottom, innerTop, (x) => roundedTopY(x, -inside / 2 + padX, inside / 2 - padX, innerTop, innerRadii))
    }
  }
  const borderArea = (outer ? areaOf(outer) : 0) - (hole ? areaOf(hole) : 0)
  return { line, borderArea }
}
// the pieces of a shaped leaf: each row's rectangle with its top cut to the line (area), in the order they are made
export function shapedPieces(d: Door, leaf: SwingLeaf): Array<{ name: string; area: number; depth: number }> {
  const { leafHeight, leafMiddle } = lengths(d)
  const { line } = shapedLeaf(d, leaf)
  return leafPieces({ width: leaf.width, height: leafHeight, middleX: leaf.middleX, middleY: leafMiddle }, d.segments, d.contentPadding).map((piece) => {
    const cut = topClipped(piece.x - piece.width / 2, piece.x + piece.width / 2, piece.y - piece.height / 2, piece.y + piece.height / 2, line)
    return { name: piece.name, area: cut ? areaOf(cut) : piece.width * piece.height, depth: piece.depth }
  })
}

// ------------------------------------------------------------------ the other types

// (19) and (20)
export function slidingDoor(d: Door) {
  const { inside, f, D, leafHeight, leafMiddle } = lengths(d)
  const active = d.slideDirection === 'left' ? 1 : -1 // the side the moving panel shuts on
  const panel = inside * 0.54
  return {
    panelWidth: panel,
    fixed: { width: panel, height: leafHeight, middleX: -active * inside * 0.23, middleY: leafMiddle, z: -LEAF_DEPTH / 2 - 0.006 },
    moving: { width: panel, height: leafHeight, middleX: active * inside * 0.23, middleY: leafMiddle, z: LEAF_DEPTH / 2 + 0.016 },
    topRail: box('top_rail', [inside, 0.024, Math.max(D * 0.32, 0.026)], [0, leafMiddle + leafHeight / 2 - Math.min(f * 0.35, 0.02), 0]),
    bottomRail: box('bottom_rail', [inside, 0.018, Math.max(D * 0.28, 0.022)], [0, -leafHeight / 2 + 0.04, 0]),
    shift: (t: number) => -active * inside * 0.44 * openFraction(t),
  }
}
export function pocketDoor(d: Door) {
  const { inside, f, D, leafHeight, leafMiddle, leafTop } = lengths(d)
  const way = d.slideDirection === 'right' ? 1 : -1
  return {
    leaf: { width: inside, height: leafHeight, middleX: 0, middleY: leafMiddle, z: 0 },
    track: box('track', [inside * 2, Math.min(f * 0.45, 0.024), Math.max(D * 0.38, 0.03)], [(way * inside) / 2, leafTop - 0.018, 0]),
    shift: (t: number) => way * inside * openFraction(t),
  }
}
export function barnDoor(d: Door) {
  const { inside, f, D, leafHeight, leafMiddle, leafTop } = lengths(d)
  const way = d.slideDirection === 'right' ? 1 : -1
  const face = D / 2 + LEAF_DEPTH / 2 + 0.028
  const railY = leafTop + Math.max(f * 0.55, 0.045)
  return {
    leaf: { width: inside * 1.06, height: leafHeight, middleX: 0, middleY: leafMiddle, z: face },
    rail: box('rail', [inside * 2.25, 0.035, 0.035], [way * inside * 0.56, railY, face + 0.01]),
    shift: (t: number) => way * inside * openFraction(t),
  }
}
export function foldingDoor(d: Door) {
  const { inside, f, D, leafHeight, leafMiddle, leafTop } = lengths(d)
  const count = d.leafCount === 2 ? 2 : 4
  const length = inside / count
  const yaws = (t: number): number[] => {
    const fold = Math.PI * 0.44 * openFraction(t)
    const out: number[] = []
    let before = 0
    for (let i = 0; i < count; i += 1) {
      const way = i % 2 === 0 ? -1 : 1
      out.push((before - way) * fold)
      before = way
    }
    return out
  }
  return {
    count,
    length,
    // a panel in its own frame: it runs from its joint (x = 0) to x = length
    panel: { width: Math.max(0.08, length), height: leafHeight, middleX: length / 2, middleY: leafMiddle, z: 0 },
    track: box('track', [inside, Math.min(f * 0.5, 0.025), Math.max(D * 0.45, 0.035)], [0, leafTop - 0.018, 0]),
    yaws,
    // where the last panel's free end is, in the door's own frame: (x, z)
    end: (t: number) => {
      let x = -inside / 2
      let z = 0
      let heading = 0
      for (const yaw of yaws(t)) {
        heading += yaw
        x += length * Math.cos(heading)
        z -= length * Math.sin(heading)
      }
      return { x, z }
    },
  }
}
export function sectionalDoor(d: Door) {
  const { inside, leafHeight, leafTop } = lengths(d)
  const count = Math.max(3, Math.min(12, Math.round(d.garagePanelCount)))
  const height = leafHeight / count
  const gap = Math.min(0.012, height * 0.08)
  const R = height * 0.58
  const bend = (Math.PI / 2) * R
  const head = leafTop - height / 2 // the top panel's middle when shut
  return {
    count,
    panel: [inside, Math.max(0.04, height - gap), LEAF_DEPTH] as V3,
    radius: R,
    // panel 0 is the lowest; each answer is the panel's middle (y, z) and its turn about X
    pose: (t: number) => {
      const travel = 0.88 * openFraction(t) * ((count - 1) * height + bend + height * 0.65)
      const out: Array<{ y: number; z: number; turn: number }> = []
      for (let i = 0; i < count; i += 1) {
        const p = travel - (count - 1 - i) * height
        if (p > 0 && p <= bend) out.push({ y: head + R * Math.sin(p / R), z: -R * (1 - Math.cos(p / R)), turn: -p / R })
        else if (p > bend) out.push({ y: head + R, z: -(R + p - bend), turn: -Math.PI / 2 })
        else out.push({ y: head + p, z: 0, turn: 0 })
      }
      return out
    },
  }
}
export function rollupDoor(d: Door) {
  const { inside, f, D, leafHeight, leafTop } = lengths(d)
  const slat = Math.max(0.055, Math.min(0.11, leafHeight / 22))
  const drum = Math.max(0.12, Math.min(0.22, leafHeight * 0.075))
  return {
    slat,
    drumRadius: drum,
    drumLength: inside + f,
    drumAt: [0, leafTop + drum * 0.12, -D / 2 - drum * 0.72] as V3,
    // the curtain as it is built for an open fraction t: its sheet hangs from the lintel
    curtain: (t: number) => {
      const visible = leafHeight * (1 - openFraction(t))
      return { visible, built: visible > 0.01, sheet: [inside, visible, LEAF_DEPTH] as V3, sheetMiddle: leafTop - visible / 2, lines: Math.ceil(visible / slat) }
    },
    // the pose used when a file is written out: the shut curtain squeezed towards the lintel
    scale: (t: number) => Math.max(0.02, 1 - openFraction(t)),
  }
}
export function tiltupDoor(d: Door) {
  const { inside, leafHeight, leafMiddle, leafTop } = lengths(d)
  return {
    leaf: box('leaf', [inside, leafHeight, LEAF_DEPTH], [0, leafMiddle, 0]),
    pose: (t: number) => {
      const angle = (Math.PI / 2) * openFraction(t)
      return {
        turn: -angle,
        at: [0, leafTop * (1 - Math.cos(angle)), Math.sin(angle) * (leafTop - leafHeight)] as V3,
        // the leaf's two long edges, (y, z) in the door's own frame
        lowEdge: { y: leafTop - leafHeight * Math.cos(angle), z: 0 },
        highEdge: { y: leafTop, z: -leafHeight * Math.sin(angle) },
      }
    },
  }
}
// the outer box of a leaf from its place: x, y and z ranges
export function leafBox(leaf: LeafPlace): { min: V3; max: V3 } {
  const z = leaf.z ?? 0
  return {
    min: [leaf.middleX - leaf.width / 2, leaf.middleY - leaf.height / 2, z - LEAF_DEPTH / 2],
    max: [leaf.middleX + leaf.width / 2, leaf.middleY + leaf.height / 2, z + LEAF_DEPTH / 2],
  }
}

// ------------------------------------------------------------------ opening and shutting

// (21)
export function openFraction(value: number | undefined): number {
  return Math.max(0, Math.min(1, value ?? 0))
}
export const SLIDES_OR_FOLDS = ['folding', 'pocket', 'barn', 'sliding', 'garage-sectional', 'garage-rollup', 'garage-tiltup']
export function drawnOpen(type: string, value: number | undefined): number {
  return type === 'garage-sectional' ? openFraction(value) * 0.88 : openFraction(value)
}
export function clearOpening(type: string, value: number | undefined): number {
  return type === 'garage-sectional' ? Math.min(1, openFraction(value) / 0.88) : openFraction(value)
}
// (22) a press: which number moves, and to where
export function toggle(type: string, shown: number): { field: 'operationState' | 'swingAngle'; from: number; to: number; ms: number } {
  if (SLIDES_OR_FOLDS.includes(type)) return { field: 'operationState', from: shown, to: shown >= 0.5 ? 0 : 1, ms: 520 }
  return { field: 'swingAngle', from: shown, to: shown >= Math.PI / 4 ? 0 : Math.PI / 2, ms: 520 }
}
// (23)
export function tween(from: number, to: number, elapsedMs: number, durationMs: number): number {
  const p = Math.min(1, elapsedMs / durationMs)
  return from + (to - from) * p * p * (3 - 2 * p)
}
