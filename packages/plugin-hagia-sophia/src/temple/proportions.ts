/**
 * Temple forms — the proportions, and a domed bay composed at any size.
 *
 * ActArtech's kinds (dome, arch, pendentive, pier, column) are the pieces. This file is the
 * arithmetic that puts them together the way the Byzantine builders did: four piers on the
 * corners of a square, four round arches between them, four pendentives, and a dome on the
 * ring the pendentives make. All of it is one sphere. The sphere of radius span/√2, centred
 * on the square at the springing line, is cut by the four walls of the square into four
 * semicircles — the arches' soffits — and by the level plane span/2 above into the circle the
 * dome stands on. What is left between is the pendentives.
 *
 * Every length below is a fraction of the span, so the same bay comes out right at 20 ft or at
 * the Hagia Sophia's 31.2 m. Pure functions only: the panel and the tests call these.
 */
import { DEFAULT_PIER_FOOTPRINT, DOME_AXIS_CONSTANTS } from '../math/constants'

/** the golden ratio */
export const PHI = (1 + Math.sqrt(5)) / 2
export const SQRT2 = Math.SQRT2
export const SQRT3 = Math.sqrt(3)
export const FT = 0.3048

// ---- arches --------------------------------------------------------------------------------------

export type ArchForm = 'roman' | 'gothic' | 'golden' | 'segmental' | 'catenary'

export const ARCH_FORMS: ReadonlyArray<{ id: ArchForm; label: string; note: string }> = [
  { id: 'roman', label: 'Roman — round', note: 'rise is half the span (a semicircle)' },
  { id: 'gothic', label: 'Gothic — equilateral', note: 'rise is span × √3/2; each arc is centred on the other springing' },
  { id: 'golden', label: 'Golden — pointed', note: 'rise to half-span is φ : 1 (rise = span × 0.809)' },
  { id: 'segmental', label: 'Segmental', note: 'a flat arc of a large circle' },
  { id: 'catenary', label: 'Catenary — hanging chain', note: 'inverted chain y = a·cosh(x/a); Hooke 1675 / Poleni 1748' },
]

/** the profile and the rise (to the outer curve) of an arch of this form and span */
export function archFor(form: ArchForm, span: number): { profileType: 'round' | 'pointed' | 'segmental' | 'catenary'; rise: number } {
  switch (form) {
    case 'roman':
      return { profileType: 'round', rise: span / 2 }
    case 'gothic':
      return { profileType: 'pointed', rise: (span * SQRT3) / 2 }
    case 'golden':
      return { profileType: 'pointed', rise: (span * PHI) / 2 }
    case 'segmental':
      // ActArtech's segmental profile draws a sagitta of rise × 0.55; this gives a quarter-span sagitta
      return { profileType: 'segmental', rise: span / 4 / 0.55 }
    case 'catenary':
      // Comfortable masonry rise ≈ 0.4 · span (shallower than a semicircle)
      return { profileType: 'catenary', rise: span * 0.4 }
  }
}

// ---- domes ---------------------------------------------------------------------------------------

export type DomeShape = 'hemisphere' | 'saucer' | 'golden'

/** height of the dome over its diameter */
export const DOME_SHAPES: ReadonlyArray<{ id: DomeShape; label: string; riseRatio: number; note: string }> = [
  { id: 'hemisphere', label: 'Hemisphere', riseRatio: 0.5, note: 'height is half the width' },
  { id: 'saucer', label: 'Saucer', riseRatio: 0.25, note: 'height is a quarter of the width' },
  { id: 'golden', label: 'Golden', riseRatio: 1 / PHI, note: 'height to width is 1 : φ' },
]

export function domeRiseRatio(shape: DomeShape): number {
  return DOME_SHAPES.find((s) => s.id === shape)?.riseRatio ?? 0.5
}

// ---- the domed bay -------------------------------------------------------------------------------

/**
 * The Byzantine bay's proportions, as fractions of the clear span, taken from the Hagia Sophia
 * figures ActArtech assembled (math/constants.ts): the 31.2 m square, springing at 23.14 m,
 * 12 m piers, a 5.5 m window ring. The arch ring and dome band thicknesses are modelled, not measured.
 */
export const BYZANTINE = {
  springing: DOME_AXIS_CONSTANTS.SPRINGING_H / DOME_AXIS_CONSTANTS.PIER_SQUARE,
  pier: 12 / DOME_AXIS_CONSTANTS.PIER_SQUARE,
  archRing: 0.06,
  drum: 5.5 / DOME_AXIS_CONSTANTS.PIER_SQUARE,
  domeBand: 0.8 / DOME_AXIS_CONSTANTS.PIER_SQUARE,
} as const

export type Quadrant = 'ne' | 'nw' | 'se' | 'sw'

/**
 * Corner signs in Pascal's plan: +x is east, +z is south (the eco site frame flips its z-north
 * to this on the way in), so north is −z.
 */
export const QUADRANT_SIGNS: Record<Quadrant, { sx: 1 | -1; sz: 1 | -1 }> = {
  ne: { sx: 1, sz: -1 },
  nw: { sx: -1, sz: -1 },
  se: { sx: 1, sz: 1 },
  sw: { sx: -1, sz: 1 },
}
const QUADRANTS: readonly Quadrant[] = ['ne', 'nw', 'se', 'sw']

export type DomedBayOptions = {
  /** clear span between the piers' inner corners (m) */
  span: number
  /** level-local centre of the square */
  center?: readonly [number, number]
  /** level-local height of the pier bases */
  base?: number
  /** the bay's axis, degrees clockwise from north */
  bearingDeg?: number
  dome?: DomeShape
  /** a ring of windows under the dome, as at the Hagia Sophia */
  drum?: boolean
  /** override the Byzantine springing height (m) */
  springing?: number
  /** groups the parts; written to every part's metadata */
  bayId?: string
}

export type BayPart = {
  object: 'node'
  type: string
  name: string
  parentId: null
  visible: true
  metadata: { templeBay: string; templePart: string }
  position: [number, number, number]
  rotation: [number, number, number]
  [key: string]: unknown
}

export type BayMeasure = {
  span: number
  springing: number
  /** top of the pendentives, where the dome (or its drum) stands */
  ring: number
  crown: number
  pier: number
  /** outside width of the whole bay, pier face to pier face */
  outside: number
  /** radius of the one sphere the arches and pendentives are cut from */
  sphere: number
  domeRadius: number
  drum: number
}

export function measureDomedBay(opts: DomedBayOptions): BayMeasure {
  const S = opts.span
  const springing = opts.springing ?? S * BYZANTINE.springing
  const drum = opts.drum ? S * BYZANTINE.drum : 0
  const ring = springing + S / 2
  const riseRatio = domeRiseRatio(opts.dome ?? 'hemisphere')
  return {
    span: S,
    springing,
    ring,
    crown: ring + drum + riseRatio * S,
    pier: S * BYZANTINE.pier,
    outside: S + 2 * S * BYZANTINE.pier,
    sphere: S / SQRT2,
    domeRadius: S / 2,
    drum,
  }
}

/**
 * The thirteen parts of a domed bay as plain node records for the level: four piers, four round
 * arches whose soffits are the sphere's semicircles, four pendentives cut from the same sphere,
 * and the dome on the ring. Positions and rotations are level-local; the bay is turned about its
 * centre so its axis runs along `bearingDeg`.
 */
export function composeDomedBay(opts: DomedBayOptions): BayPart[] {
  const m = measureDomedBay(opts)
  const S = m.span
  if (!(S > 0)) throw new Error('span must be positive')
  const bayId = opts.bayId ?? 'bay'
  const [cx, cz] = opts.center ?? [0, 0]
  const base = opts.base ?? 0
  const yaw = -((opts.bearingDeg ?? 0) * Math.PI) / 180
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  // three.js turns (x, z) by rotation.y = yaw to (x cos + z sin, −x sin + z cos)
  const place = (x: number, y: number, z: number): [number, number, number] => [
    cx + x * cos + z * sin,
    base + y,
    cz - x * sin + z * cos,
  ]
  const turn = (ry = 0): [number, number, number] => [0, ry + yaw, 0]
  const meta = (part: string) => ({ templeBay: bayId, templePart: part })
  const p = m.pier
  const t = S * BYZANTINE.archRing
  const off = S / 2 + p / 2
  const impost = p / 12
  const k = p / 12 // ActArtech's pier plan is 12 m across
  const footprint = DEFAULT_PIER_FOOTPRINT.map(([x, z]) => [x * k, z * k] as [number, number])
  const parts: BayPart[] = []

  for (const q of QUADRANTS) {
    const { sx, sz } = QUADRANT_SIGNS[q]
    parts.push({
      object: 'node',
      type: 'hagia-sophia:pier',
      name: `Pier ${q.toUpperCase()}`,
      parentId: null,
      visible: true,
      metadata: meta('pier'),
      position: place(sx * off, 0, sz * off),
      rotation: turn(),
      footprint,
      height: Math.max(0.1, m.springing - impost),
      impostSize: p / 10,
      impostThickness: impost,
      batter: 0,
    })
  }

  const sides: ReadonlyArray<{ key: string; x: number; z: number; ry: number }> = [
    { key: 'N', x: 0, z: -off, ry: 0 },
    { key: 'S', x: 0, z: off, ry: 0 },
    { key: 'E', x: off, z: 0, ry: Math.PI / 2 },
    { key: 'W', x: -off, z: 0, ry: Math.PI / 2 },
  ]
  for (const s of sides) {
    parts.push({
      object: 'node',
      type: 'hagia-sophia:arch',
      name: `Arch ${s.key}`,
      parentId: null,
      visible: true,
      metadata: meta('arch'),
      position: place(s.x, m.springing, s.z),
      rotation: turn(s.ry),
      // the outer curve is a semicircle of radius S/2 + t; offset inward by t, the soffit is the
      // sphere's semicircle of radius S/2 in the plane of the square's side
      span: S + 2 * t,
      rise: S / 2 + t,
      depth: p,
      profileType: 'round',
      thickness: t,
    })
  }

  for (const q of QUADRANTS) {
    parts.push({
      object: 'node',
      type: 'hagia-sophia:pendentive',
      name: `Pendentive ${q.toUpperCase()}`,
      parentId: null,
      visible: true,
      metadata: meta('pendentive'),
      position: place(0, m.springing, 0),
      rotation: turn(),
      sphereRadius: m.sphere,
      squareSide: S,
      quadrant: q,
    })
  }

  const windows = opts.drum ? 4 * Math.max(2, Math.round((10 * S) / DOME_AXIS_CONSTANTS.PIER_SQUARE)) : 0
  const k31 = S / DOME_AXIS_CONSTANTS.PIER_SQUARE
  parts.push({
    object: 'node',
    type: 'hagia-sophia:dome',
    name: 'Dome',
    parentId: null,
    visible: true,
    metadata: meta('dome'),
    // the dome's base is its own y = 0 and the drum hangs below it
    position: place(0, m.ring + m.drum, 0),
    rotation: turn(),
    radius: S / 2,
    riseRatio: domeRiseRatio(opts.dome ?? 'hemisphere'),
    shellThickness: S * BYZANTINE.domeBand,
    drumHeight: m.drum,
    drumRadius: S / 2,
    windowCount: windows,
    windowWidth: Math.max(0.2, 0.9 * k31),
    windowHeight: Math.max(0.4, 2.4 * k31),
    oculusRadius: 0,
    sectorStart: 0,
    sectorAngle: Math.PI * 2,
  })
  return parts
}

// ---- the true pendentive -------------------------------------------------------------------------

/**
 * Points of a true pendentive: the part of the sphere of radius side/√2 (centred on the square
 * at the springing line) that lies inside one corner of the square and below the ring. `a` runs
 * across the corner from one arch's crown to the other; `u` from the ring (u = 0) to the square's
 * sides (u = 1), where the surface meets the arches' soffits and comes down to the corner.
 * Returns rows of [x, y, z], (A + 1) × (U + 1), in the node's own frame.
 */
export function truePendentiveGrid(side: number, quadrant: Quadrant, A = 24, U = 12): number[][][] {
  const { sx, sz } = QUADRANT_SIGNS[quadrant]
  const half = side / 2
  const R2 = (side * side) / 2
  const rows: number[][][] = []
  for (let i = 0; i <= A; i++) {
    const a = (i / A) * (Math.PI / 2)
    const c = Math.cos(a)
    const s = Math.sin(a)
    const rEdge = half / Math.max(c, s)
    const row: number[][] = []
    for (let j = 0; j <= U; j++) {
      const r = half + (j / U) * (rEdge - half)
      const y = Math.sqrt(Math.max(0, R2 - r * r))
      row.push([sx * r * c, y, sz * r * s])
    }
    rows.push(row)
  }
  return rows
}

/** ft·in for the panel, to the nearest inch */
export function feet(m: number): string {
  const inches = Math.round(m / 0.0254)
  const f = Math.floor(inches / 12)
  const i = inches - f * 12
  return i ? `${f}′ ${i}″` : `${f}′`
}
