import {
  AISLE_COLUMN_COUNT_PER_ROW,
  ARCADE_ARCH_CONSTANTS,
  ARCADE_COLUMNS_PER_ROW,
  CENTRAL_SQUARE_SIDE_M,
  DEFAULT_LAYOUT_PARAMS,
  GALLERY_CONSTANTS,
  type HsColumnVariant,
  type LayoutParams,
} from './constants'

export type LayoutColumn = {
  key: string
  variant: HsColumnVariant
  x: number
  z: number
}

/** Plan placement for a masonry arch (Y is applied by the generator). */
export type LayoutArch = {
  key: string
  x: number
  z: number
  span: number
  rotationY: number
}

/** Documentary ground-floor support count (RESEARCH §1). */
export const LAYOUT_TOTAL_COLUMNS = 40

/**
 * Justified gallery emit count (RESEARCH §1 DOCUMENTED_TOTAL 67 minus open remainder).
 * Arcade 12 + aisle verde 16 + aisle pillars 8 = 36; 31 unplaced (exedrae/west gallery) — §5.
 */
export const GALLERY_LAYOUT_TOTAL = GALLERY_CONSTANTS.EMITTED_TOTAL

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/**
 * Pure ground-floor layout solver.
 * Origin at building center; nave LENGTH along Z (+Z = apse); SPAN along X.
 */
export function solveGroundFloorLayout(params?: Partial<LayoutParams>): LayoutColumn[] {
  const p: LayoutParams = { ...DEFAULT_LAYOUT_PARAMS, ...params }
  const arcadeX = p.naveSpan / 2
  const outerX = arcadeX + p.aisleOffset
  const halfLength = p.naveLength / 2
  const baySpacing = p.naveLength / 5
  const aisleSpacing = p.naveLength / AISLE_COLUMN_COUNT_PER_ROW
  const columns: LayoutColumn[] = []

  // Nave arcade: 4 per side → keys nave_verde_n01..n08 (−X then +X)
  let n = 1
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < ARCADE_COLUMNS_PER_ROW; i++) {
      columns.push({
        key: `nave_verde_n${pad2(n)}`,
        variant: 'nave_verde',
        x: side * arcadeX,
        z: (i - 1.5) * baySpacing,
      })
      n++
    }
  }

  // Exedra porphyry: 4 per flank on 90° arc in the +Z half
  const zArcCenter = halfLength - p.exedraArcRadius
  const r = p.exedraArcRadius
  let e = 1
  // −X flank: sweep π/2 → π (arcade +Z toward outer −X)
  for (let i = 0; i < 4; i++) {
    const theta = Math.PI / 2 + ((i + 0.5) * Math.PI) / 2 / 4
    columns.push({
      key: `porphyry_exedra_e${pad2(e)}`,
      variant: 'porphyry_exedra',
      x: -arcadeX + r * Math.cos(theta),
      z: zArcCenter + r * Math.sin(theta),
    })
    e++
  }
  // +X flank: sweep π/2 → 0 (arcade +Z toward outer +X)
  for (let i = 0; i < 4; i++) {
    const theta = Math.PI / 2 - ((i + 0.5) * Math.PI) / 2 / 4
    columns.push({
      key: `porphyry_exedra_e${pad2(e)}`,
      variant: 'porphyry_exedra',
      x: arcadeX + r * Math.cos(theta),
      z: zArcCenter + r * Math.sin(theta),
    })
    e++
  }

  // Aisle verde: 8 per outer row
  let a = 1
  for (const side of [-1, 1] as const) {
    for (let j = 0; j < AISLE_COLUMN_COUNT_PER_ROW; j++) {
      columns.push({
        key: `aisle_verde_a${pad2(a)}`,
        variant: 'aisle_verde',
        x: side * outerX,
        z: (j - 3.5) * aisleSpacing,
      })
      a++
    }
  }

  // Aisle pillars at arcade/outer × ±half-length corners
  const pillarPositions: Array<{ x: number; z: number }> = [
    { x: -arcadeX, z: -halfLength },
    { x: arcadeX, z: -halfLength },
    { x: -outerX, z: -halfLength },
    { x: outerX, z: -halfLength },
    { x: -arcadeX, z: halfLength },
    { x: arcadeX, z: halfLength },
    { x: -outerX, z: halfLength },
    { x: outerX, z: halfLength },
  ]
  for (let i = 0; i < pillarPositions.length; i++) {
    const pos = pillarPositions[i]!
    columns.push({
      key: `aisle_pillar_p${pad2(i + 1)}`,
      variant: 'aisle_pillar',
      x: pos.x,
      z: pos.z,
    })
  }

  columns.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return columns
}

/**
 * Pure gallery-storey layout (Phase 2c).
 * Same X arcade/aisle lines as ground; Z uses 6-bay spacing (RESEARCH §1).
 * All keys use gallery_verde variant; Y is applied by generateGalleries.
 *
 * Open (not emitted): 67 − 36 = 31 supports (gallery exedrae, west gallery, etc.)
 * — RESEARCH §5; no published sub-counts to place them without invention.
 */
export function solveGalleryLayout(params?: Partial<LayoutParams>): LayoutColumn[] {
  const p: LayoutParams = { ...DEFAULT_LAYOUT_PARAMS, ...params }
  const arcadeX = p.naveSpan / 2
  const outerX = arcadeX + p.aisleOffset
  const halfLength = p.naveLength / 2
  const baySpacing = p.naveLength / GALLERY_CONSTANTS.ARCADE_BAYS
  const aisleSpacing = p.naveLength / GALLERY_CONSTANTS.AISLE_COLUMNS_PER_ROW
  const arcadeN = GALLERY_CONSTANTS.ARCADE_COLUMNS_PER_ROW
  const aisleN = GALLERY_CONSTANTS.AISLE_COLUMNS_PER_ROW
  const columns: LayoutColumn[] = []

  // Nave gallery arcade: 6 per side → gallery_arcade_n01..n12 (−X then +X)
  let n = 1
  const arcadeCenter = (arcadeN - 1) / 2
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < arcadeN; i++) {
      columns.push({
        key: `gallery_arcade_n${pad2(n)}`,
        variant: 'gallery_verde',
        x: side * arcadeX,
        z: (i - arcadeCenter) * baySpacing,
      })
      n++
    }
  }

  // Gallery aisle verde: 8 per outer row (mirrors ground aisle count)
  let a = 1
  const aisleCenter = (aisleN - 1) / 2
  for (const side of [-1, 1] as const) {
    for (let j = 0; j < aisleN; j++) {
      columns.push({
        key: `gallery_aisle_a${pad2(a)}`,
        variant: 'gallery_verde',
        x: side * outerX,
        z: (j - aisleCenter) * aisleSpacing,
      })
      a++
    }
  }

  // Gallery aisle pillars at arcade/outer × ±half-length corners
  const pillarPositions: Array<{ x: number; z: number }> = [
    { x: -arcadeX, z: -halfLength },
    { x: arcadeX, z: -halfLength },
    { x: -outerX, z: -halfLength },
    { x: outerX, z: -halfLength },
    { x: -arcadeX, z: halfLength },
    { x: arcadeX, z: halfLength },
    { x: -outerX, z: halfLength },
    { x: outerX, z: halfLength },
  ]
  for (let i = 0; i < pillarPositions.length; i++) {
    const pos = pillarPositions[i]!
    columns.push({
      key: `gallery_pillar_p${pad2(i + 1)}`,
      variant: 'gallery_verde',
      x: pos.x,
      z: pos.z,
    })
  }

  columns.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return columns
}

/**
 * Ground nave arcade bays: aisle-pillar / 4 columns / aisle-pillar along Z
 * at each arcade X. 5 bays per side, span along Z so rotationY = π/2.
 * RESEARCH §3 — bay count from 4 columns → 5 bays over NAVE_LENGTH.
 */
export function solveNaveArcadeBays(params?: Partial<LayoutParams>): LayoutArch[] {
  const p: LayoutParams = { ...DEFAULT_LAYOUT_PARAMS, ...params }
  const arcadeX = p.naveSpan / 2
  const halfLength = p.naveLength / 2
  const bays = ARCADE_ARCH_CONSTANTS.BAYS_PER_ROW
  const baySpacing = p.naveLength / bays
  const supportZ: number[] = [-halfLength]
  for (let i = 0; i < ARCADE_COLUMNS_PER_ROW; i++) {
    supportZ.push((i - 1.5) * baySpacing)
  }
  supportZ.push(halfLength)

  const arches: LayoutArch[] = []
  for (const side of [-1, 1] as const) {
    const sideKey = side < 0 ? 'n' : 'p'
    for (let b = 0; b < supportZ.length - 1; b++) {
      const z0 = supportZ[b]!
      const z1 = supportZ[b + 1]!
      arches.push({
        key: `nave_${sideKey}_b${pad2(b + 1)}`,
        x: side * arcadeX,
        z: (z0 + z1) / 2,
        span: z1 - z0,
        rotationY: Math.PI / 2,
      })
    }
  }
  arches.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return arches
}

/**
 * Four great arches on the pier-square edges.
 * N/S (z = ±half) span along X (rotationY 0); E/W (x = ±half) span along Z.
 * Pier keys treat +X as east and +Z as north — same convention here.
 */
export function solveGreatArches(): LayoutArch[] {
  const half = CENTRAL_SQUARE_SIDE_M / 2
  const span = CENTRAL_SQUARE_SIDE_M
  const arches: LayoutArch[] = [
    { key: 'great_n', x: 0, z: half, span, rotationY: 0 },
    { key: 'great_s', x: 0, z: -half, span, rotationY: 0 },
    { key: 'great_e', x: half, z: 0, span, rotationY: Math.PI / 2 },
    { key: 'great_w', x: -half, z: 0, span, rotationY: Math.PI / 2 },
  ]
  arches.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return arches
}
