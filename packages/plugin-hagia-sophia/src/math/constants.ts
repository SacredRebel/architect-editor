/** Byzantine foot in metres. RESEARCH §3 — Hoffmann & Theocharis 2002. */
export const BYZANTINE_FOOT_M = 0.312

/** Central dome square side (= 100 BFT). RESEARCH §1/§3 — laser-verified plan. */
export const CENTRAL_SQUARE_SIDE_M = 31.2

/** Great pier height to arch springing (Phase 2). RESEARCH §1 — Mainstone-derived. */
export const PIER_SPRINGING_HEIGHT_M = 23.14

/**
 * Dome-axis assembly constants (Phase 2a).
 * RESEARCH §1 — central square 31.2 m (= 100 BFT); springing 23.14 m; dome R ≈ 15.55 m.
 * PENDENTIVE_RISE is a placement estimate (~7 m) so the drum base sits above springing.
 */
export const DOME_AXIS_CONSTANTS = {
  /** Central square side under the main dome (= CENTRAL_SQUARE_SIDE_M). */
  PIER_SQUARE: 31.2,
  /** Great pier height to arch springing. */
  SPRINGING_H: 23.14,
  /** Vertical offset from springing to dome drum base (placement estimate). */
  PENDENTIVE_RISE: 7,
  /** Main dome clear radius (m). */
  DOME_RADIUS: 15.55,
} as const

/** Great-pier shaft height — same as arch springing (Mainstone-derived). */
export const PIER_HEIGHT = DOME_AXIS_CONSTANTS.SPRINGING_H

/**
 * Default great-pier plan polygon (local XZ metres, CCW).
 * RESEARCH §1 — four piers ~100 m² irregular ashlar; exact Van Nice pl. 45–46
 * polygons unknown, so this is a 12×12 m square with two 2.5×2.2 m re-entrant
 * niches per side (shoelace ≈ 100 m²) until survey plates land.
 */
export const DEFAULT_PIER_FOOTPRINT: ReadonlyArray<readonly [number, number]> = [
  [-6, -6],
  [-4.5, -6],
  [-4.5, -3.8],
  [-2, -3.8],
  [-2, -6],
  [2, -6],
  [2, -3.8],
  [4.5, -3.8],
  [4.5, -6],
  [6, -6],
  [6, -4.5],
  [3.8, -4.5],
  [3.8, -2],
  [6, -2],
  [6, 2],
  [3.8, 2],
  [3.8, 4.5],
  [6, 4.5],
  [6, 6],
  [4.5, 6],
  [4.5, 3.8],
  [2, 3.8],
  [2, 6],
  [-2, 6],
  [-2, 3.8],
  [-4.5, 3.8],
  [-4.5, 6],
  [-6, 6],
  [-6, 4.5],
  [-3.8, 4.5],
  [-3.8, 2],
  [-6, 2],
  [-6, -2],
  [-3.8, -2],
  [-3.8, -4.5],
  [-6, -4.5],
]

/** Colonnade-to-colonnade nave span. RESEARCH §1 — Van Nice/Mainstone. */
export const NAVE_SPAN_M = 30.48

/** Nave length along the building axis. RESEARCH §1 — Van Nice/Mainstone. */
export const NAVE_LENGTH_M = 76.2

/** Arcade columns per row → 5 bays. RESEARCH §1 — Justinianic 5-bay rhythm. */
export const ARCADE_COLUMNS_PER_ROW = 4

/** Aisle verde columns per outer row (16 total both aisles). RESEARCH §1. */
export const AISLE_COLUMN_COUNT_PER_ROW = 8

/** Exedra quarter-circle radius from arcade line (half aisle width). TBD Van Nice. */
export const EXEDRA_ARC_RADIUS_M = 7.62

/** Outer aisle row offset beyond arcade line. TBD Van Nice. */
export const AISLE_OFFSET_M = 7.62

/**
 * Gallery storey constants (Phase 2c).
 * RESEARCH §1 — building-wide 107 supports = 40 ground + 67 galleries.
 * Gallery arcade uses documented 6-column / 6-bay convention (as-built distortion;
 * ground remains idealized 4-col / 5-bay Justinianic intent).
 * Exact gallery shaft heights unpublished — sensible TBD placeholders below.
 */
export const GALLERY_CONSTANTS = {
  /**
   * Gallery floor elevation above ground slab (m).
   * TBD Van Nice sections — set to ground nave total height (10.36 m) so the
   * gallery deck sits on the ground colonnade entablature line.
   */
  FLOOR_H: 10.36,
  /** Gallery arcade columns per side (RESEARCH §1 conflict flag: 6 cols/side). */
  ARCADE_COLUMNS_PER_ROW: 6,
  /**
   * Bay count along each gallery arcade (= columns/side under free-standing
   * pier-to-pier model). baySpacing = NAVE_LENGTH_M / BAYS.
   */
  ARCADE_BAYS: 6,
  /**
   * Gallery aisle outer-row column count per side — mirrors ground 8/side until
   * Van Nice gallery plans are sourced (RESEARCH §5 open).
   */
  AISLE_COLUMNS_PER_ROW: 8,
  /** Gallery aisle pillars at arcade/outer × ±half-length corners (mirrors ground). */
  AISLE_PILLAR_COUNT: 8,
  /**
   * Documented gallery total (RESEARCH §1). Justified emit = arcade 12 + aisle
   * verde 16 + aisle pillars 8 = 36; remainder 31 (exedrae galleries, west
   * gallery, etc.) left open — RESEARCH §5.
   */
  DOCUMENTED_TOTAL: 67,
  /** Justified subset emitted by generateGalleries (see layout comment). */
  EMITTED_TOTAL: 36,
} as const

/** Alias for GALLERY_CONSTANTS.FLOOR_H — gallery column Y. */
export const GALLERY_FLOOR_H = GALLERY_CONSTANTS.FLOOR_H

/**
 * Ground nave arcade arches (closes 4 columns → 5 bays).
 * RESEARCH §3 — semicircular arcs, radius = half clear span.
 * Springing sits on the nave-verde entablature line (shaft + capital).
 */
export const ARCADE_ARCH_CONSTANTS = {
  BAYS_PER_ROW: 5,
  /** Nave verde total height (8.53 + 1.83). */
  SPRINGING_H: 10.36,
  DEPTH: 1.2,
  THICKNESS: 0.6,
} as const

/**
 * Four great arches on the 31.2 m pier square (Phase 2 vaults).
 * Span = square side; round profile so rise = span/2.
 */
export const GREAT_ARCH_CONSTANTS = {
  SPAN: CENTRAL_SQUARE_SIDE_M,
  RISE: CENTRAL_SQUARE_SIDE_M / 2,
  SPRINGING_H: PIER_SPRINGING_HEIGHT_M,
  DEPTH: 2.4,
  THICKNESS: 1.2,
} as const

/**
 * East/west (apse/narthex) great semi-domes. RESEARCH §1 — same radius class
 * as the main dome; they spring from the E/W great arches (not the pendentives).
 * sectorStart = -π/2, sectorAngle = π → local +Z half (Three.js lathe phi).
 */
export const SEMI_DOME_CONSTANTS = {
  RADIUS: DOME_AXIS_CONSTANTS.DOME_RADIUS,
  SPRINGING_H: PIER_SPRINGING_HEIGHT_M,
  SECTOR_START: -Math.PI / 2,
  SECTOR_ANGLE: Math.PI,
  RISE_RATIO: 0.5,
  DRUM_HEIGHT: 1,
  WINDOW_COUNT: 12,
} as const

/** THREE.LOD level distances (m): L0 detailed, L1 mid, L2 low. DESIGN §2. */
export const LOD_DISTANCES = [0, 45, 110] as const

export type HsColumnVariant =
  | 'nave_verde'
  | 'porphyry_exedra'
  | 'aisle_verde'
  | 'aisle_pillar'
  | 'gallery_verde'

export const COLUMN_SPECS: Record<
  HsColumnVariant,
  {
    count: number
    shaftHeight: number
    capitalHeight: number
    shaftRadius: number
    color: string
    label: string
  }
> = {
  // RESEARCH §1 — shaft 8.53 m, total 10.36 m; Ø~0.9 TBD Van Nice pl.9–11
  nave_verde: {
    count: 8,
    shaftHeight: 8.53,
    capitalHeight: 1.83,
    shaftRadius: 0.45,
    color: '#3d5c45',
    label: 'Nave verde antico',
  },
  // RESEARCH §1 — shaft 7.54 m, total 9.45 m; Ø0.94
  porphyry_exedra: {
    count: 8,
    shaftHeight: 7.54,
    capitalHeight: 1.91,
    shaftRadius: 0.47,
    color: '#6e2b3c',
    label: 'Exedra porphyry',
  },
  // RESEARCH §1 — heights unpublished — assume nave values TBD
  aisle_verde: {
    count: 16,
    shaftHeight: 8.53,
    capitalHeight: 1.83,
    shaftRadius: 0.45,
    color: '#3d5c45',
    label: 'Aisle verde antico',
  },
  // RESEARCH §1 — rectangular Proconnesian modeled as column, TBD
  aisle_pillar: {
    count: 8,
    shaftHeight: 8.53,
    capitalHeight: 1.83,
    shaftRadius: 0.55,
    color: '#b8b2a6',
    label: 'Aisle pillar',
  },
  /**
   * Gallery-level verde (arcade + aisle rows). RESEARCH §1 — shorter than ground;
   * exact heights unpublished → shaft ~6.5 m / capital ~1.4 m TBD Van Nice sections.
   * count = EMITTED_TOTAL (justified subset of DOCUMENTED_TOTAL 67).
   */
  gallery_verde: {
    count: GALLERY_CONSTANTS.EMITTED_TOTAL,
    shaftHeight: 6.5,
    capitalHeight: 1.4,
    shaftRadius: 0.4,
    color: '#3d5c45',
    label: 'Gallery verde antico',
  },
}

export type LayoutParams = {
  naveSpan: number
  naveLength: number
  exedraArcRadius: number
  aisleOffset: number
}

export const DEFAULT_LAYOUT_PARAMS: LayoutParams = {
  naveSpan: NAVE_SPAN_M,
  naveLength: NAVE_LENGTH_M,
  exedraArcRadius: EXEDRA_ARC_RADIUS_M,
  aisleOffset: AISLE_OFFSET_M,
}
