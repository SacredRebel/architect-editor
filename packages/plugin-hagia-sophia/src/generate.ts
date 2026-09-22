import { HsArchNode } from './kinds/hs-arch/schema'
import { HsDomeNode } from './kinds/hs-dome/schema'
import type { HsPendentiveQuadrant } from './kinds/hs-pendentive/schema'
import {
  ARCADE_ARCH_CONSTANTS,
  COLUMN_SPECS,
  DOME_AXIS_CONSTANTS,
  GALLERY_FLOOR_H,
  GREAT_ARCH_CONSTANTS,
  type HsColumnVariant,
  SEMI_DOME_CONSTANTS,
} from './math/constants'
import {
  solveGalleryLayout,
  solveGreatArches,
  solveGroundFloorLayout,
  solveNaveArcadeBays,
} from './math/layout'
import { HsColumnNode } from './schema'

export type GeneratorParams = {
  /** Multiplies all linear dimensions (shaft, capital, radius, positions). */
  bftScale?: number
  /** When a variant is false, omit it from the output. Missing keys default true. */
  includeVariants?: Partial<Record<HsColumnVariant, boolean>>
  /** Override default flute count. */
  fluteCount?: number
  /** Override default entasis fraction. */
  entasis?: number
}

/**
 * Deterministic ground-floor column nodes from measured layout + COLUMN_SPECS.
 * Every returned value has passed HsColumnNode.parse.
 */
export function generateGroundFloor(params?: Partial<GeneratorParams>): HsColumnNode[] {
  const scale = params?.bftScale ?? 1
  const fluteCount = params?.fluteCount ?? 0
  const entasis = params?.entasis ?? 0.03
  const include = params?.includeVariants

  const layout = solveGroundFloorLayout()
  const nodes: HsColumnNode[] = []

  for (const col of layout) {
    if (include?.[col.variant] === false) continue
    const spec = COLUMN_SPECS[col.variant]
    const raw = {
      object: 'node' as const,
      id: `hs-column_${col.key}`,
      type: 'hagia-sophia:column' as const,
      name: `${spec.label} (${col.key})`,
      parentId: null,
      visible: true,
      metadata: {},
      position: [col.x * scale, 0, col.z * scale] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      variant: col.variant,
      shaftHeight: spec.shaftHeight * scale,
      capitalHeight: spec.capitalHeight * scale,
      shaftRadius: spec.shaftRadius * scale,
      flutes: fluteCount,
      entasis,
    }
    nodes.push(HsColumnNode.parse(raw))
  }

  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return nodes
}

export type GalleryParams = {
  /** Multiplies all linear dimensions (shaft, capital, radius, XZ positions). */
  bftScale?: number
  /** Override default flute count. */
  fluteCount?: number
  /** Override default entasis fraction. */
  entasis?: number
  /**
   * Gallery floor Y (m). Default GALLERY_FLOOR_H (TBD — ground colonnade total height).
   * Does not scale with bftScale (elevation is a storey datum, not a member size).
   */
  floorHeight?: number
}

/**
 * Deterministic gallery-storey column nodes (Phase 2c).
 * Justified subset of RESEARCH §1's 67 gallery supports: 12 arcade (6/side) +
 * 16 aisle + 8 pillars = 36. Remainder open — RESEARCH §5.
 * Ids are `hs-gallery_<key>`; Y = GALLERY_FLOOR_H; every value passes HsColumnNode.parse.
 */
export function generateGalleries(params?: Partial<GalleryParams>): HsColumnNode[] {
  const scale = params?.bftScale ?? 1
  const fluteCount = params?.fluteCount ?? 0
  const entasis = params?.entasis ?? 0.03
  const floorY = params?.floorHeight ?? GALLERY_FLOOR_H

  const layout = solveGalleryLayout()
  const nodes: HsColumnNode[] = []
  const spec = COLUMN_SPECS.gallery_verde

  for (const col of layout) {
    const raw = {
      object: 'node' as const,
      id: `hs-gallery_${col.key}`,
      type: 'hagia-sophia:column' as const,
      name: `${spec.label} (${col.key})`,
      parentId: null,
      visible: true,
      metadata: {},
      position: [col.x * scale, floorY, col.z * scale] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      variant: col.variant,
      shaftHeight: spec.shaftHeight * scale,
      capitalHeight: spec.capitalHeight * scale,
      shaftRadius: spec.shaftRadius * scale,
      flutes: fluteCount,
      entasis,
    }
    nodes.push(HsColumnNode.parse(raw))
  }

  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return nodes
}

export type DomeAxisParams = {
  /** Side of the central pier square (m). Default DOME_AXIS_CONSTANTS.PIER_SQUARE. */
  pierSquare?: number
  /** Great-pier height to arch springing (m). Default SPRINGING_H. */
  springingHeight?: number
  /** Main dome radius (m). Default DOME_RADIUS. */
  domeRadius?: number
}

/** Heterogeneous plain node specs for the dome-axis assembly (not Zod-parsed). */
export type DomeAxisNodeSpec = {
  object: 'node'
  id: string
  type: string
  name?: string
  parentId: null
  visible: true
  metadata: Record<string, never>
  position: [number, number, number]
  [key: string]: unknown
}

const PIER_QUADRANTS = [
  { key: 'ne', sx: 1, sz: 1 },
  { key: 'nw', sx: -1, sz: 1 },
  { key: 'se', sx: 1, sz: -1 },
  { key: 'sw', sx: -1, sz: -1 },
] as const

const PENDENTIVE_QUADRANTS: readonly HsPendentiveQuadrant[] = ['ne', 'nw', 'se', 'sw']

/**
 * Deterministic dome-axis assembly: 4 great piers, 4 pendentives, 1 main dome.
 * Plain objects sorted by id — ready for apply_patch (not Zod-parsed).
 * Pier footprint/height come from HsPierNode schema defaults.
 */
export function generateDomeAxis(params?: DomeAxisParams): DomeAxisNodeSpec[] {
  const pierSquare = params?.pierSquare ?? DOME_AXIS_CONSTANTS.PIER_SQUARE
  const springingHeight = params?.springingHeight ?? DOME_AXIS_CONSTANTS.SPRINGING_H
  const domeRadius = params?.domeRadius ?? DOME_AXIS_CONSTANTS.DOME_RADIUS
  const half = pierSquare / 2
  const domeY = springingHeight + DOME_AXIS_CONSTANTS.PENDENTIVE_RISE

  const nodes: DomeAxisNodeSpec[] = []

  for (const q of PIER_QUADRANTS) {
    nodes.push({
      object: 'node',
      id: `hs-pier_${q.key}`,
      type: 'hagia-sophia:pier',
      name: `Great pier (${q.key.toUpperCase()})`,
      parentId: null,
      visible: true,
      metadata: {},
      position: [q.sx * half, 0, q.sz * half],
    })
  }

  for (const quadrant of PENDENTIVE_QUADRANTS) {
    nodes.push({
      object: 'node',
      id: `hs-pendentive_${quadrant}`,
      type: 'hagia-sophia:pendentive',
      name: `Pendentive (${quadrant.toUpperCase()})`,
      parentId: null,
      visible: true,
      metadata: {},
      position: [0, springingHeight, 0],
      rotation: [0, 0, 0],
      sphereRadius: domeRadius,
      quadrant,
    })
  }

  nodes.push({
    object: 'node',
    id: 'hs-dome_main',
    type: 'hagia-sophia:dome',
    name: 'Main dome',
    parentId: null,
    visible: true,
    metadata: {},
    position: [0, domeY, 0],
    rotation: [0, 0, 0],
    radius: domeRadius,
    windowCount: 40,
    drumHeight: 5.5,
  })

  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return nodes
}

function archFromLayout(
  layout: { key: string; x: number; z: number; span: number; rotationY: number },
  opts: { springingH: number; rise: number; depth: number; thickness: number; name: string },
): HsArchNode {
  return HsArchNode.parse({
    object: 'node',
    id: `hs-arch_${layout.key}`,
    type: 'hagia-sophia:arch',
    name: opts.name,
    parentId: null,
    visible: true,
    metadata: {},
    position: [layout.x, opts.springingH, layout.z],
    rotation: [0, layout.rotationY, 0],
    span: layout.span,
    rise: opts.rise,
    depth: opts.depth,
    profileType: 'round',
    thickness: opts.thickness,
  })
}

/**
 * Ground nave arcade: 10 round arches (5 bays × 2 sides) at colonnade springing.
 * RESEARCH §3 — semicircular, rise = span/2.
 */
export function generateArcadeArches(): HsArchNode[] {
  const bays = solveNaveArcadeBays()
  const { SPRINGING_H, DEPTH, THICKNESS } = ARCADE_ARCH_CONSTANTS
  const nodes = bays.map((bay) =>
    archFromLayout(bay, {
      springingH: SPRINGING_H,
      rise: bay.span / 2,
      depth: DEPTH,
      thickness: THICKNESS,
      name: `Nave arcade (${bay.key})`,
    }),
  )
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return nodes
}

/** Four great arches on the 31.2 m pier square at springing 23.14 m. */
export function generateGreatArches(): HsArchNode[] {
  const { RISE, SPRINGING_H, DEPTH, THICKNESS } = GREAT_ARCH_CONSTANTS
  const nodes = solveGreatArches().map((bay) =>
    archFromLayout(bay, {
      springingH: SPRINGING_H,
      rise: RISE,
      depth: DEPTH,
      thickness: THICKNESS,
      name: `Great arch (${bay.key})`,
    }),
  )
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return nodes
}

/**
 * Apse (+Z) and west (-Z) great semi-domes. Local +Z half, west rotated π
 * so the cut face sits on the pier-square E/W great-arch plane.
 */
export function generateSemiDomes(): HsDomeNode[] {
  const c = SEMI_DOME_CONSTANTS
  const half = DOME_AXIS_CONSTANTS.PIER_SQUARE / 2
  const specs = [
    {
      id: 'hs-dome_semi_apse',
      name: 'Semi-dome (apse)',
      position: [0, c.SPRINGING_H, half] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
    },
    {
      id: 'hs-dome_semi_west',
      name: 'Semi-dome (west)',
      position: [0, c.SPRINGING_H, -half] as [number, number, number],
      rotation: [0, Math.PI, 0] as [number, number, number],
    },
  ]
  const nodes = specs.map((s) =>
    HsDomeNode.parse({
      object: 'node',
      id: s.id,
      type: 'hagia-sophia:dome',
      name: s.name,
      parentId: null,
      visible: true,
      metadata: {},
      position: s.position,
      rotation: s.rotation,
      radius: c.RADIUS,
      riseRatio: c.RISE_RATIO,
      drumHeight: c.DRUM_HEIGHT,
      drumRadius: c.RADIUS * 0.92,
      windowCount: c.WINDOW_COUNT,
      sectorStart: c.SECTOR_START,
      sectorAngle: c.SECTOR_ANGLE,
    }),
  )
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return nodes
}

/** Arcade + great arches + semi-domes (vaults injection phase). */
export function generateVaults(): Array<HsArchNode | HsDomeNode> {
  const nodes = [...generateArcadeArches(), ...generateGreatArches(), ...generateSemiDomes()]
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return nodes
}
