// The port note's equations for the column (entry 8), written out as code. Nothing here calls
// the old editor: the reference cases hold these against it. The numbers in brackets are the
// equations of the entry.
//
// The column's own frame: X and Z lie in the plan, Y is up, the origin is the middle of the
// foot. `width` runs along X, `depth` along Z.

export type V3 = [number, number, number]
export type P = { x: number; y: number } // (u, v) of the note

export type Section = 'round' | 'square' | 'rectangular' | 'octagonal' | 'sixteen-sided'
export type Profile = 'straight' | 'tapered' | 'bulged' | 'baluster' | 'hourglass'
export type Spacing = 'ends' | 'even' | 'top' | 'bottom'
export type BaseStyle =
  | 'none'
  | 'simple-square'
  | 'round-rings'
  | 'square-plinth'
  | 'stepped-square'
  | 'lotus'
  | 'ribbed-lotus'
  | 'panelled-pedestal'
export type CapitalStyle =
  | 'none'
  | 'simple'
  | 'simple-slab'
  | 'rounded'
  | 'stepped'
  | 'doric'
  | 'volute'
  | 'ionic-volute'
  | 'leaf-carved'
  | 'corinthian-leaf'
  | 'south-indian-bracket'
  | 'wood-bracket'
export type SupportStyle =
  | 'vertical'
  | 'a-frame'
  | 'y-frame'
  | 'v-frame'
  | 'x-brace'
  | 'k-brace'
  | 'single-strut'
  | 'tripod'
  | 'trestle'
  | 'portal-frame'
  | 'box-frame'

// Every number of a column that its structure reads, with the old editor's defaults.
export type Column = {
  position: V3
  rotation: number
  supportSlabId: string | undefined
  supportStyle: SupportStyle
  crossSection: Section
  style: string
  height: number
  radius: number
  width: number
  depth: number
  edgeSoftness: number
  baseStyle: BaseStyle
  baseHeight: number
  baseWidthScale: number
  baseDepthScale: number
  baseTierCount: number
  baseStepSpread: number
  basePlinthHeightRatio: number
  baseRoundBandScale: number
  baseNeckScale: number
  baseRibCount: number
  basePanelInset: number
  shaftProfile: Profile
  shaftStartScale: number
  shaftEndScale: number
  shaftTaper: number
  shaftBulge: number
  shaftSegmentCount: number
  shaftTwistStep: number
  shaftCornerRadius: number
  shaftDetail: string
  capitalStyle: CapitalStyle
  capitalHeight: number
  capitalWidthScale: number
  capitalDepthScale: number
  capitalTierCount: number
  capitalStepSpread: number
  bracketDepth: number
  bracketTierCount: number
  ringCount: number
  ringPlacement: Spacing
  ringThickness: number
  ringSpread: number
  latheRingCount: number
  latheRingSpacing: Spacing
  fluteCount: number
  fluteWidth: number
  braceWidth: number
  braceDepth: number
  braceBottomSpread: number
  braceTopSpread: number
  bracePlateEnabled: boolean
}

export const DEFAULTS: Column = {
  position: [0, 0, 0],
  rotation: 0,
  supportSlabId: undefined,
  supportStyle: 'vertical',
  crossSection: 'round',
  style: 'plain',
  height: 2.5,
  radius: 0.22,
  width: 0.44,
  depth: 0.44,
  edgeSoftness: 0.025,
  baseStyle: 'round-rings',
  baseHeight: 0.18,
  baseWidthScale: 1.24,
  baseDepthScale: 1.24,
  baseTierCount: 3,
  baseStepSpread: 0.42,
  basePlinthHeightRatio: 0.44,
  baseRoundBandScale: 0.92,
  baseNeckScale: 0.72,
  baseRibCount: 0,
  basePanelInset: 0.02,
  shaftProfile: 'straight',
  shaftStartScale: 0.72,
  shaftEndScale: 0.72,
  shaftTaper: 0,
  shaftBulge: 0,
  shaftSegmentCount: 24,
  shaftTwistStep: 0,
  shaftCornerRadius: 0.035,
  shaftDetail: 'none',
  capitalStyle: 'simple',
  capitalHeight: 0.18,
  capitalWidthScale: 1.46,
  capitalDepthScale: 1.46,
  capitalTierCount: 3,
  capitalStepSpread: 0.42,
  bracketDepth: 0.35,
  bracketTierCount: 3,
  ringCount: 0,
  ringPlacement: 'ends',
  ringThickness: 0.055,
  ringSpread: 0.16,
  latheRingCount: 0,
  latheRingSpacing: 'ends',
  fluteCount: 0,
  fluteWidth: 0.02,
  braceWidth: 0.16,
  braceDepth: 0.16,
  braceBottomSpread: 1.2,
  braceTopSpread: 0.12,
  bracePlateEnabled: true,
}

export function column(over: Partial<Column> = {}): Column {
  return { ...DEFAULTS, ...over }
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const isSquare = (c: Column) => c.crossSection === 'square' || c.crossSection === 'rectangular'

// ------------------------------------------------------------------ (1) where it stands
// A turn by `angle` about the vertical, as the body is turned: anticlockwise seen from above
// when u points east and v south (+X goes toward -v).
export function turned(x: number, z: number, angle: number): [number, number] {
  return [x * Math.cos(angle) + z * Math.sin(angle), -x * Math.sin(angle) + z * Math.cos(angle)]
}

// a point (X, Z) of the column's own plan, in the plan (u, v) of its level
export function planOf(c: Column, x: number, z: number): P {
  const [du, dv] = turned(x, z, c.rotation)
  return { x: c.position[0] + du, y: c.position[2] + dv }
}

// a point (X, Y, Z) of the column's own frame, in its level: (u, height, v)
export function placeOf(c: Column, point: V3, support = 0): V3 {
  const at = planOf(c, point[0], point[2])
  return [at.x, c.position[1] + support + point[1], at.y]
}

// ------------------------------------------------------------------ (2) base, shaft, capital
export function layoutOf(c: Column) {
  const hb = c.baseStyle === 'none' ? 0 : Math.min(c.baseHeight, 0.4 * c.height)
  const hc = c.capitalStyle === 'none' ? 0 : Math.min(c.capitalHeight, 0.4 * c.height)
  const hs = Math.max(0.1, c.height - hb - hc)
  return { hb, hs, hc, shaftY: hb, capitalY: hb + hs }
}

// ------------------------------------------------------------------ (3) how a part is drawn
export type Slot = 'base' | 'shaft' | 'capital' | 'frame'
export type Block = {
  shape: 'block'
  slot: Slot
  size: V3 // along X, up, along Z (before its turn)
  centre: V3
  turn: number // about the vertical, radians, in the sense of (1)
  bevel: number // the radius its edges are rounded with; 0 = sharp
}
export type Prism = {
  shape: 'prism'
  slot: Slot
  sides: number
  radius: number // centre to corner
  stretch: [number, number] // along X and along Z: an oval block has radius 1 and its half-sizes here
  height: number
  centre: V3
  turn: number
}
export type Bar = {
  shape: 'bar'
  slot: Slot
  start: V3
  end: V3
  width: number // along X
  depth: number // along Z
}
export type Part = Block | Prism | Bar

type Maker = {
  block: (w: number, h: number, d: number, y: number, more?: { sharp?: boolean; x?: number; z?: number; turn?: number }) => Part[]
  prism: (sides: number, radius: number, h: number, y: number, more?: { x?: number; z?: number; stretch?: [number, number]; turn?: number }) => Part[]
}

// `y` is the part's underside. A block's edges are rounded with the smaller of `edgeSoftness`
// and 0.35 of its smallest size, unless the part is one of those drawn sharp.
function maker(c: Column, slot: Slot): Maker {
  return {
    block(w, h, d, y, more = {}) {
      if (w <= 0 || h <= 0 || d <= 0) return []
      const bevel = more.sharp ? 0 : Math.min(Math.max(0, c.edgeSoftness), 0.35 * Math.max(0, Math.min(w, h, d)))
      return [{ shape: 'block', slot, size: [w, h, d], centre: [more.x ?? 0, y + h / 2, more.z ?? 0], turn: more.turn ?? 0, bevel }]
    },
    prism(sides, radius, h, y, more = {}) {
      if (h <= 0 || radius <= 0) return []
      return [{ shape: 'prism', slot, sides, radius, stretch: more.stretch ?? [1, 1], height: h, centre: [more.x ?? 0, y + h / 2, more.z ?? 0], turn: more.turn ?? 0 }]
    },
  }
}

export const sidesOf = (c: Column): number =>
  c.crossSection === 'octagonal' ? 8 : c.crossSection === 'sixteen-sided' ? 16 : 32

// a block of the column's own section, `scale` times its size
function sectionBlock(c: Column, make: Maker, y: number, h: number, scale: number): Part[] {
  if (h <= 0) return []
  return isSquare(c) ? make.block(c.width * scale, h, c.depth * scale, y) : make.prism(sidesOf(c), c.radius * scale, h, y)
}

// the corners of a prism's plan: corner k stands at the angle 2 pi k / sides from +Z toward +X
function prismPlan(part: Prism): Array<[number, number]> {
  const corners: Array<[number, number]> = []
  for (let k = 0; k < part.sides; k += 1) {
    const angle = (2 * Math.PI * k) / part.sides
    const [x, z] = turned(part.radius * part.stretch[0] * Math.sin(angle), part.radius * part.stretch[1] * Math.cos(angle), part.turn)
    corners.push([part.centre[0] + x, part.centre[2] + z])
  }
  return corners
}

// the outline of a block in plan: its four corners, or, when its edges are rounded, each corner
// as the quarter circle of 6 chords (ends at the angles atan(j / 3) from either face)
function blockPlan(part: Block): Array<[number, number]> {
  const [w, , d] = part.size
  const b = part.bevel > 0.001 ? part.bevel : 0
  const angles = b > 0 ? [0, Math.atan(1 / 3), Math.atan(2 / 3), Math.PI / 4, Math.PI / 2 - Math.atan(2 / 3), Math.PI / 2 - Math.atan(1 / 3), Math.PI / 2] : [0]
  const corners: Array<[number, number]> = []
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as Array<[number, number]>) {
    for (const angle of angles) {
      const [x, z] = turned(sx * (w / 2 - b + b * Math.cos(angle)), sz * (d / 2 - b + b * Math.sin(angle)), part.turn)
      corners.push([part.centre[0] + x, part.centre[2] + z])
    }
  }
  return corners
}

export function boxOf(part: Part): { min: V3; max: V3 } {
  if (part.shape === 'bar') {
    return {
      min: [Math.min(part.start[0], part.end[0]) - part.width / 2, Math.min(part.start[1], part.end[1]), Math.min(part.start[2], part.end[2]) - part.depth / 2],
      max: [Math.max(part.start[0], part.end[0]) + part.width / 2, Math.max(part.start[1], part.end[1]), Math.max(part.start[2], part.end[2]) + part.depth / 2],
    }
  }
  if (part.shape === 'block') {
    const plan = blockPlan(part)
    const h = part.size[1]
    return {
      min: [Math.min(...plan.map((p) => p[0])), part.centre[1] - h / 2, Math.min(...plan.map((p) => p[1]))],
      max: [Math.max(...plan.map((p) => p[0])), part.centre[1] + h / 2, Math.max(...plan.map((p) => p[1]))],
    }
  }
  const plan = prismPlan(part)
  return {
    min: [Math.min(...plan.map((p) => p[0])), part.centre[1] - part.height / 2, Math.min(...plan.map((p) => p[1]))],
    max: [Math.max(...plan.map((p) => p[0])), part.centre[1] + part.height / 2, Math.max(...plan.map((p) => p[1]))],
  }
}

// A rounded edge is a quarter circle of 6 chords whose ends stand at the angles atan(j / 3),
// j = 0..3, from each of its two faces. QUARTER is the area of that quarter for a unit radius
// (pi / 4 for a true circle); BALL the volume of a block's eight rounded corners put together
// for a unit radius (4 pi / 3 for a true ball; the number is the reference case's own).
export const QUARTER = 1 / Math.sqrt(10) + 3 / Math.sqrt(130) + 1 / Math.sqrt(26)
export const BALL = 4.05125

// what the part holds as the old editor draws it
export function volumeOf(part: Part): number {
  if (part.shape === 'bar') return part.width * part.depth * Math.abs(part.end[1] - part.start[1])
  if (part.shape === 'prism') {
    return (part.sides / 2) * Math.sin((2 * Math.PI) / part.sides) * part.radius ** 2 * part.stretch[0] * part.stretch[1] * part.height
  }
  const [w, h, d] = part.size
  if (part.bevel <= 0.001) return w * h * d
  const r = part.bevel
  const [a, b, e] = [w - 2 * r, h - 2 * r, d - 2 * r]
  return a * b * e + 2 * r * (a * b + b * e + e * a) + 4 * QUARTER * r * r * (a + b + e) + BALL * r ** 3
}

// the same part with true circles for its polygons and its rounded edges
export function trueVolumeOf(part: Part): number {
  if (part.shape === 'bar') return volumeOf(part)
  if (part.shape === 'prism') return Math.PI * part.radius ** 2 * part.stretch[0] * part.stretch[1] * part.height
  const [w, h, d] = part.size
  if (part.bevel <= 0.001) return w * h * d
  const r = part.bevel
  const [a, b, e] = [w - 2 * r, h - 2 * r, d - 2 * r]
  return a * b * e + 2 * r * (a * b + b * e + e * a) + Math.PI * r * r * (a + b + e) + (4 / 3) * Math.PI * r ** 3
}

// how many triangles the old editor draws the part with
export function trianglesOf(part: Part): number {
  if (part.shape === 'bar') return 24
  if (part.shape === 'prism') return 4 * part.sides
  return part.bevel > 0.001 ? 588 : 12
}

export const lengthOf = (bar: Bar): number =>
  Math.hypot(bar.end[0] - bar.start[0], bar.end[1] - bar.start[1], bar.end[2] - bar.start[2])

// ------------------------------------------------------------------ (4) the shaft's scale
export function scaleAt(c: Column, t: number): number {
  const taper = Math.min(c.shaftTaper, 0.85)
  const line = (c.shaftStartScale + (c.shaftEndScale - c.shaftStartScale) * t) * (1 - taper * t)
  let s = line
  if (c.shaftProfile === 'bulged' || c.shaftProfile === 'baluster') s = line + c.shaftBulge * Math.sin(Math.PI * t)
  else if (c.shaftProfile === 'hourglass') s = line - c.shaftBulge * (1 - Math.abs(2 * t - 1))
  return Math.max(0.1, s)
}

// ------------------------------------------------------------------ (5) the shaft
export function slicesOf(c: Column): number {
  const twisted = Math.abs(c.shaftTwistStep) > 0.001
  const plain = c.shaftProfile === 'straight' && c.shaftTaper <= 0 && !twisted
  return Math.max(twisted ? 4 : 1, plain ? 1 : c.shaftSegmentCount)
}

export function shaftParts(c: Column): Part[] {
  const { hs, shaftY } = layoutOf(c)
  const make = maker(c, 'shaft')
  if (c.style === 'cluster') {
    const side = Math.max(0.04, 0.36 * c.radius)
    const off = Math.max(0.78 * c.radius, 0.22 * c.width)
    return [
      ...make.prism(24, 0.62 * c.radius, hs, shaftY),
      ...make.prism(16, side, hs, shaftY, { x: off }),
      ...make.prism(16, side, hs, shaftY, { x: -off }),
      ...make.prism(16, side, hs, shaftY, { z: off }),
      ...make.prism(16, side, hs, shaftY, { z: -off }),
    ]
  }
  const n = slicesOf(c)
  const parts: Part[] = []
  for (let i = 0; i < n; i += 1) {
    const s = scaleAt(c, (i + 0.5) / n)
    const turn = (c.shaftTwistStep * Math.PI * i) / 180
    const y = shaftY + (i * hs) / n
    const h = (1.015 * hs) / n
    if (!isSquare(c)) {
      parts.push(...make.prism(sidesOf(c), c.radius * s, h, y, { turn }))
      continue
    }
    const w = c.width * s
    const d = c.depth * s
    const r = Math.min(Math.max(0, c.shaftCornerRadius * s), 0.45 * Math.min(w, d))
    if (r <= 0.001) {
      parts.push(...make.block(w, h, d, y, { turn }))
      continue
    }
    parts.push(...make.block(w - 2 * r, h, d, y, { sharp: true, turn }))
    parts.push(...make.block(w, h, d - 2 * r, y, { sharp: true, turn }))
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as Array<[number, number]>) {
      const [x, z] = turned(sx * (w / 2 - r), sz * (d / 2 - r), turn)
      parts.push(...make.prism(18, r, h, y, { x, z, turn }))
    }
  }
  return parts
}

// ------------------------------------------------------------------ (6) the base
export function baseParts(c: Column): Part[] {
  const { hb } = layoutOf(c)
  if (hb <= 0 || c.baseStyle === 'none') return []
  const make = maker(c, 'base')
  const kw = c.baseWidthScale
  const kd = c.baseDepthScale
  if (c.baseStyle === 'simple-square') return make.block(c.width * kw, hb, c.depth * kd, 0)
  if (c.baseStyle === 'square-plinth') {
    return [
      ...make.block(c.width * kw, 0.35 * hb, c.depth * kd, 0),
      ...make.block(c.width * Math.max(0.9, 0.84 * kw), 0.65 * hb, c.depth * Math.max(0.9, 0.84 * kd), 0.35 * hb),
    ]
  }
  if (c.baseStyle === 'stepped-square') {
    const tiers = Math.max(3, c.baseTierCount)
    const parts: Part[] = []
    for (let i = 0; i < tiers; i += 1) {
      const t = i / (tiers - 1)
      parts.push(
        ...make.block(
          c.width * Math.max(0.5, kw - t * c.baseStepSpread),
          (1.01 * hb) / tiers,
          c.depth * Math.max(0.5, kd - t * c.baseStepSpread),
          (i * hb) / tiers,
        ),
      )
    }
    return parts
  }
  if (c.baseStyle === 'round-rings') {
    const w = c.width * kw
    const d = c.depth * kd
    const plinth = hb * clamp(c.basePlinthHeightRatio, 0.2, 0.7)
    const band = 0.57 * (hb - plinth)
    const neck = hb - plinth - band
    return [
      ...make.block(w, plinth, d, 0),
      ...make.prism(32, 1, band, plinth, { stretch: [(w * c.baseRoundBandScale) / 2, (d * c.baseRoundBandScale) / 2] }),
      ...make.prism(32, 1, neck, plinth + band, { stretch: [(w * c.baseNeckScale) / 2, (d * c.baseNeckScale) / 2] }),
    ]
  }
  if (c.baseStyle === 'lotus' || c.baseStyle === 'ribbed-lotus') {
    const reach = Math.max(c.radius * kw, (c.width * kw) / 2)
    const parts: Part[] = [
      ...make.block(1.28 * c.width, 0.22 * hb, 1.28 * c.depth, 0),
      ...make.prism(32, 0.86 * reach, 0.24 * hb, 0.22 * hb),
    ]
    for (let i = 0; i < c.baseRibCount; i += 1) {
      const angle = (2 * Math.PI * i) / c.baseRibCount
      parts.push(
        ...make.prism(6, Math.max(0.01, 0.025 * c.width), 0.38 * hb, 0.39 * hb, {
          x: 0.86 * reach * Math.cos(angle),
          z: 0.86 * reach * Math.sin(angle),
          turn: -angle,
        }),
      )
    }
    parts.push(...make.prism(32, 0.72 * reach, 0.16 * hb, 0.82 * hb))
    return parts
  }
  // panelled-pedestal: the block takes the width scale on both of its sides
  const w = c.width * kw
  const d = c.depth * kw
  const panel = (x: number, z: number, turn: number) =>
    make.block(0.36 * c.width, 0.42 * hb, c.basePanelInset, 0.29 * hb, { sharp: true, x, z, turn })
  return [
    ...make.block(w, hb, d, 0),
    ...panel(0, 0.51 * d, 0),
    ...panel(0, -0.51 * d, 0),
    ...panel(0.51 * w, 0, Math.PI / 2),
    ...panel(-0.51 * w, 0, Math.PI / 2),
  ]
}

// ------------------------------------------------------------------ (7) the capital
export function capitalParts(c: Column): Part[] {
  const { hc, capitalY: y } = layoutOf(c)
  if (hc <= 0 || c.capitalStyle === 'none') return []
  const make = maker(c, 'capital')
  const kw = c.capitalWidthScale
  const kd = c.capitalDepthScale
  if (c.capitalStyle === 'south-indian-bracket' || c.capitalStyle === 'wood-bracket') {
    const tiers = Math.max(1, c.bracketTierCount)
    const parts: Part[] = []
    for (let i = 0; i < tiers; i += 1) {
      const t = i / Math.max(1, tiers - 1)
      const scale = kw + 0.32 * t
      parts.push(...make.block(c.width * scale + c.bracketDepth * t, hc / tiers, c.depth * scale + c.bracketDepth * t, y + (i * hc) / tiers))
    }
    return parts
  }
  if (c.capitalStyle === 'rounded' || c.capitalStyle === 'doric') {
    const w = c.width * kw
    const d = c.depth * kd
    return [
      ...make.prism(32, 1, 0.24 * hc, y, { stretch: [0.36 * w, 0.36 * d] }),
      ...make.prism(32, 1, 0.32 * hc, y + 0.24 * hc, { stretch: [0.46 * w, 0.46 * d] }),
      ...make.block(w, 0.44 * hc, d, y + 0.56 * hc),
    ]
  }
  if (c.capitalStyle === 'stepped') {
    const tiers = Math.max(3, c.capitalTierCount)
    const parts: Part[] = []
    for (let i = 0; i < tiers; i += 1) {
      const t = i / (tiers - 1)
      parts.push(
        ...make.block(
          c.width * Math.max(0.5, kw - (1 - t) * c.capitalStepSpread),
          (1.01 * hc) / tiers,
          c.depth * Math.max(0.5, kd - (1 - t) * c.capitalStepSpread),
          y + (i * hc) / tiers,
        ),
      )
    }
    return parts
  }
  if (c.capitalStyle === 'volute' || c.capitalStyle === 'ionic-volute' || c.capitalStyle === 'leaf-carved' || c.capitalStyle === 'corinthian-leaf') {
    return [
      ...sectionBlock(c, make, y, 0.24 * hc, 0.9),
      ...sectionBlock(c, make, y + 0.24 * hc, 0.2 * hc, 1.08),
      ...make.block(c.width * kw, 0.28 * hc, c.depth * kd, y + 0.44 * hc),
    ]
  }
  // simple, simple-slab
  if (isSquare(c)) return make.block(c.width * kw, hc, c.depth * kd, y)
  return make.prism(sidesOf(c), Math.max(c.radius * kw, (c.width * kw) / 2), hc, y)
}

// ------------------------------------------------------------------ (8) rings, lathe bands, flutes
// where along the shaft (0 its foot, 1 its top) the index-th of `count` stands
function along(spacing: Spacing, index: number, count: number, oneSide: number, paired: number): number {
  if (spacing === 'even') return (index + 1) / (count + 1)
  if (spacing === 'top') return 1 - Math.min(0.48, oneSide)
  if (spacing === 'bottom') return Math.min(0.48, oneSide)
  return index % 2 === 1 ? 1 - Math.min(0.48, paired) : Math.min(0.48, paired)
}

export function ringParts(c: Column): Part[] {
  const { hs, shaftY } = layoutOf(c)
  if (c.ringCount <= 0 || hs <= 0) return []
  const make = maker(c, 'shaft')
  const reach = Math.max(0, clamp(c.ringSpread, 0.04, 0.45) - 0.06)
  const h = Math.min(c.ringThickness, hs / Math.max(8, 3 * c.ringCount))
  const pairs = Math.ceil(c.ringCount / 2)
  const rings: Array<{ y: number; scale: number }> = []
  for (let index = 0; index < c.ringCount; index += 1) {
    const pair = Math.floor(index / 2)
    const t = along(
      c.ringPlacement,
      index,
      c.ringCount,
      0.06 + (index / Math.max(1, c.ringCount - 1)) * reach,
      0.06 + (pairs <= 1 ? 0 : pair / (pairs - 1)) * reach,
    )
    rings.push({ y: shaftY + hs * t - h / 2, scale: Math.min(1.4, scaleAt(c, t) + 0.12) })
  }
  rings.sort((a, b) => a.y - b.y)
  return rings.flatMap((ring) => sectionBlock(c, make, ring.y, h, ring.scale))
}

export function latheParts(c: Column): Part[] {
  const { hs, shaftY } = layoutOf(c)
  const count = Math.max(c.latheRingCount, c.shaftDetail === 'lathe-turned' ? 8 : 0)
  if (count <= 0 || hs <= 0) return []
  const make = maker(c, 'shaft')
  const h = Math.min(0.04, hs / Math.max(12, 3 * count))
  const ys: number[] = []
  for (let index = 0; index < count; index += 1) {
    const t = along(c.latheRingSpacing, index, count, 0.08 + 0.04 * index, 0.1 + 0.04 * Math.floor(index / 2))
    ys.push(shaftY + hs * t - h / 2)
  }
  ys.sort((a, b) => a - b)
  return ys.flatMap((y, index) => sectionBlock(c, make, y, h, 0.82 + 0.08 * (index % 2)))
}

export function fluteParts(c: Column): Part[] {
  const { hs, shaftY } = layoutOf(c)
  const count = Math.max(c.fluteCount, c.shaftDetail === 'fluted' ? 16 : 0)
  if (count <= 0 || hs <= 0 || c.crossSection !== 'round') return []
  const make = maker(c, 'shaft')
  const parts: Part[] = []
  for (let k = 0; k < count; k += 1) {
    const angle = (2 * Math.PI * k) / count
    parts.push(
      ...make.prism(8, Math.max(0.006, 0.42 * c.fluteWidth), 0.92 * hs, shaftY + 0.04 * hs, {
        x: 0.74 * c.radius * Math.cos(angle),
        z: 0.74 * c.radius * Math.sin(angle),
      }),
    )
  }
  return parts
}

// ------------------------------------------------------------------ (9) the support frames
export function frameParts(c: Column): Part[] {
  const H = Math.max(0.2, c.height)
  const bw = clamp(c.braceWidth, 0.04, 1.6)
  const bd = clamp(c.braceDepth, 0.04, 1.6)
  const make = maker(c, 'frame')
  const bar = (start: V3, end: V3): Part[] =>
    Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]) <= 0.001 ? [] : [{ shape: 'bar', slot: 'frame', start, end, width: bw, depth: bd }]
  const ph = Math.max(0.035, Math.min(0.08, 0.45 * bw))
  const foot = (x: number, z: number) => make.block(1.9 * bw, ph, 1.75 * bd, 0, { x, z })
  const head = (x: number, z: number, w = 1.9 * bw) => make.block(w, ph, 1.75 * bd, H - ph, { x, z })
  const plates = (list: Part[][]) => (c.bracePlateEnabled ? list.flat() : [])
  const B = Math.max(0.2, c.braceBottomSpread)
  const T = Math.max(0.2, c.braceTopSpread)
  const S = Math.max(0.2, Math.max(c.braceBottomSpread, c.braceTopSpread))

  switch (c.supportStyle) {
    case 'a-frame': {
      const t = clamp(c.braceTopSpread, 0, B)
      return [
        ...bar([-B / 2, 0, 0], [-t / 2, H, 0]),
        ...bar([B / 2, 0, 0], [t / 2, H, 0]),
        ...plates([foot(-B / 2, 0), foot(B / 2, 0), head(0, 0, Math.max(t + 1.9 * bw, 2.2 * bw))]),
      ]
    }
    case 'y-frame':
      return [
        ...bar([0, 0, 0], [0, 0.56 * H, 0]),
        ...bar([0, 0.56 * H, 0], [-T / 2, H, 0]),
        ...bar([0, 0.56 * H, 0], [T / 2, H, 0]),
        ...plates([foot(0, 0), head(0, 0, T + 1.9 * bw)]),
      ]
    case 'v-frame':
      return [
        ...bar([0, 0, 0], [-T / 2, H, 0]),
        ...bar([0, 0, 0], [T / 2, H, 0]),
        ...plates([foot(0, 0), head(0, 0, T + 1.9 * bw)]),
      ]
    case 'x-brace':
      return [
        ...bar([-B / 2, 0, 0], [T / 2, H, 0]),
        ...bar([B / 2, 0, 0], [-T / 2, H, 0]),
        ...plates([foot(-B / 2, 0), foot(B / 2, 0), head(-T / 2, 0), head(T / 2, 0)]),
      ]
    case 'k-brace':
      return [
        ...bar([0, 0, 0], [0, H, 0]),
        ...bar([-S / 2, 0, 0], [0, H / 2, 0]),
        ...bar([-S / 2, H, 0], [0, H / 2, 0]),
        ...plates([foot(-S / 2, 0), foot(0, 0), head(-S / 2, 0), head(0, 0)]),
      ]
    case 'single-strut':
      return [...bar([-S / 2, 0, 0], [S / 2, H, 0]), ...plates([foot(-S / 2, 0), head(S / 2, 0)])]
    case 'tripod': {
      const feet: Array<[number, number]> = [[0, -T / 2], [-B / 2, T / 2], [B / 2, T / 2]]
      return [...feet.flatMap(([x, z]) => bar([x, 0, z], [0, H, 0])), ...plates([...feet.map(([x, z]) => foot(x, z)), head(0, 0)])]
    }
    case 'trestle': {
      const zs = [-T / 2, T / 2]
      return [
        ...zs.flatMap((z) => [...bar([-B / 2, 0, z], [0, H, z]), ...bar([B / 2, 0, z], [0, H, z])]),
        ...bar([0, H, -T / 2], [0, H, T / 2]),
        ...plates([...zs.flatMap((z) => [foot(-B / 2, z), foot(B / 2, z)]), ...zs.map((z) => head(0, z))]),
      ]
    }
    case 'portal-frame':
      return [
        ...bar([-B / 2, 0, 0], [-B / 2, H, 0]),
        ...bar([B / 2, 0, 0], [B / 2, H, 0]),
        ...bar([-B / 2, H, 0], [B / 2, H, 0]),
        ...plates([foot(-B / 2, 0), foot(B / 2, 0), head(-B / 2, 0), head(B / 2, 0)]),
      ]
    case 'box-frame': {
      const corners: Array<[number, number]> = [[-B / 2, -T / 2], [B / 2, -T / 2], [B / 2, T / 2], [-B / 2, T / 2]]
      const next = (i: number) => corners[(i + 1) % 4]!
      return [
        ...corners.flatMap(([x, z]) => bar([x, 0, z], [x, H, z])),
        ...corners.flatMap(([x, z], i) => bar([x, H, z], [next(i)[0], H, next(i)[1]])),
        ...corners.flatMap(([x, z], i) => bar([x, 0, z], [next(i)[0], 0, next(i)[1]])),
        ...plates([...corners.map(([x, z]) => foot(x, z)), ...corners.map(([x, z]) => head(x, z))]),
      ]
    }
    default:
      return []
  }
}

// ------------------------------------------------------------------ the whole body, in the old editor's order
export function structureOf(c: Column): Part[] {
  if (c.supportStyle !== 'vertical') return frameParts(c)
  return [...baseParts(c), ...shaftParts(c), ...ringParts(c), ...latheParts(c), ...fluteParts(c), ...capitalParts(c)]
}

// ------------------------------------------------------------------ (10) the box the level takes it for
export function standingBoxOf(c: Column): { halfX: number; halfZ: number; size: V3 } {
  let halfX: number
  let halfZ: number
  if (c.supportStyle !== 'vertical') {
    halfX = Math.max(c.width, c.braceWidth, c.braceBottomSpread, c.braceTopSpread) / 2
    halfZ = Math.max(c.depth, c.braceDepth) / 2
  } else if (!isSquare(c)) {
    halfX = c.radius
    halfZ = c.radius
  } else if (c.crossSection === 'square') {
    halfX = c.width / 2
    halfZ = c.width / 2
  } else {
    halfX = c.width / 2
    halfZ = c.depth / 2
  }
  return { halfX, halfZ, size: [2 * halfX, c.height, 2 * halfZ] }
}

// its corners in the plan as the level's support and collision rules take them: turned the
// other way round from the body of (1)
export function standingCornersOf(c: Column, inset = 0): P[] {
  const { halfX, halfZ } = standingBoxOf(c)
  const hx = Math.max(0, halfX - inset)
  const hz = Math.max(0, halfZ - inset)
  const cos = Math.cos(c.rotation)
  const sin = Math.sin(c.rotation)
  return ([[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]] as Array<[number, number]>).map(([a, b]) => ({
    x: c.position[0] + a * cos - b * sin,
    y: c.position[2] + a * sin + b * cos,
  }))
}

// two convex outlines share ground when no side of either parts them
export function overlaps(a: P[], b: P[]): boolean {
  for (const outline of [a, b]) {
    for (let i = 0; i < outline.length; i += 1) {
      const p = outline[i]!
      const q = outline[(i + 1) % outline.length]!
      const n = { x: -(q.y - p.y), y: q.x - p.x }
      const span = (points: P[]) => points.map((point) => point.x * n.x + point.y * n.y)
      const [sa, sb] = [span(a), span(b)]
      if (Math.max(...sa) < Math.min(...sb) || Math.max(...sb) < Math.min(...sa)) return false
    }
  }
  return true
}

// how high above its level's zero the thing under the column is (holes in a slab and the
// slab's drawn outline are the slab's own entry)
export type Slab = { id: string; outline: P[]; elevation: number }
export function supportOf(c: Column, slabs: Slab[], ground = 0): number {
  if (c.supportSlabId === 'ground') return ground
  const under = slabs.filter((slab) => overlaps(standingCornersOf(c, 0.01), slab.outline))
  const named = under.find((slab) => slab.id === c.supportSlabId)
  if (named) return named.elevation
  return under.length === 0 ? ground : Math.max(...under.map((slab) => slab.elevation))
}

// ------------------------------------------------------------------ (11) the plan symbol
export function planSymbolOf(c: Column): P[] {
  const rectangle = (w: number, d: number): P[] =>
    ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as Array<[number, number]>).map(([x, z]) => planOf(c, x, z))
  if (c.supportStyle !== 'vertical') {
    const forked = c.supportStyle === 'y-frame' || c.supportStyle === 'v-frame'
    const deep = c.supportStyle === 'tripod' || c.supportStyle === 'trestle' || c.supportStyle === 'box-frame'
    const w = Math.max(forked ? 0 : c.braceBottomSpread, c.braceTopSpread, 2 * c.braceWidth)
    const d = Math.max(deep ? c.braceTopSpread : 0, c.braceDepth, 0.08)
    return rectangle(w, d)
  }
  const round = !isSquare(c)
  const w = Math.max(round ? 2 * c.radius : c.width, c.width * c.baseWidthScale, c.width * c.capitalWidthScale)
  const d = Math.max(round ? 2 * c.radius : c.depth, c.depth * c.baseDepthScale, c.depth * c.capitalDepthScale)
  if (!round) return rectangle(w, d)
  const n = sidesOf(c)
  const points: P[] = []
  for (let k = 0; k < n; k += 1) {
    const angle = (2 * Math.PI * k) / n
    points.push(planOf(c, (w / 2) * Math.cos(angle), (d / 2) * Math.sin(angle)))
  }
  return points
}

// the cross at the middle of the symbol: two diagonals, each reaching this far along u and along v
export function centreMarkOf(c: Column): number {
  const { halfX, halfZ } = standingBoxOf(c)
  return Math.min(0.09, Math.max(0.035, 0.45 * Math.min(halfX, halfZ)))
}

// ------------------------------------------------------------------ the body as one true solid
// Simpson's rule on 2000 strips (the kink of the hourglass falls on a node).
function mean(f: (t: number) => number): number {
  const strips = 2000
  let sum = 0
  for (let i = 0; i <= strips; i += 1) sum += (i === 0 || i === strips ? 1 : i % 2 === 1 ? 4 : 2) * f(i / strips)
  return sum / (3 * strips)
}

// The shaft of (4) and (5) without its steps and without the 1.5 %: its profile taken at every
// height over hs, on a true circle or on a rectangle with truly round corners.
export function trueShaftVolume(c: Column): number {
  const { hs } = layoutOf(c)
  if (!isSquare(c)) return Math.PI * c.radius ** 2 * hs * mean((t) => scaleAt(c, t) ** 2)
  return (
    hs *
    mean((t) => {
      const s = scaleAt(c, t)
      const r = Math.min(Math.max(0, c.shaftCornerRadius * s), 0.45 * Math.min(c.width * s, c.depth * s))
      return c.width * s * c.depth * s - (4 - Math.PI) * r * r
    })
  )
}

// ------------------------------------------------------------------ the round parts as one solid of revolution
// What lane A's `Revolved` would hold of a round column: (radius, height) points from the
// shaft's foot up, straight between them. Every slice of (5) at its own radius and its own
// height hs / n (no 1.5 %), then a round capital of (7) (simple, simple-slab). No twist, no
// cluster, no rings or flutes; the base is not in it.
export function revolvedProfileOf(c: Column): Array<[number, number]> {
  const { hs, hc, shaftY, capitalY } = layoutOf(c)
  const n = slicesOf(c)
  const points: Array<[number, number]> = []
  for (let i = 0; i < n; i += 1) {
    const radius = c.radius * scaleAt(c, (i + 0.5) / n)
    points.push([radius, shaftY + (i * hs) / n], [radius, shaftY + ((i + 1) * hs) / n])
  }
  if (hc > 0 && (c.capitalStyle === 'simple' || c.capitalStyle === 'simple-slab')) {
    const radius = Math.max(c.radius * c.capitalWidthScale, (c.width * c.capitalWidthScale) / 2)
    points.push([radius, capitalY], [radius, capitalY + hc])
  }
  return points
}

// what such an outline holds when turned about its axis: a cone's frustum between each two points
export function revolvedVolume(points: Array<[number, number]>): number {
  let volume = 0
  for (let i = 0; i + 1 < points.length; i += 1) {
    const [r0, z0] = points[i]!
    const [r1, z1] = points[i + 1]!
    volume += (Math.PI * (z1 - z0) * (r0 * r0 + r0 * r1 + r1 * r1)) / 3
  }
  return volume
}

// Base and capital with true circles and truly rounded edges, and the true shaft: nothing is
// counted twice. For the bases and capitals whose parts stack without lapping (simple-square,
// square-plinth, round-rings; simple, simple-slab, rounded, doric), on a shaft without cluster,
// twist, rings, bands or flutes.
export function trueSolidVolume(c: Column): number {
  const stacked = (parts: Part[]) => parts.reduce((sum, part) => sum + trueVolumeOf(part), 0)
  return stacked(baseParts(c)) + trueShaftVolume(c) + stacked(capitalParts(c))
}
