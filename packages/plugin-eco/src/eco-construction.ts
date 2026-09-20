/**
 * H3 construction takeoff — headless geometry extract + Bones member takeoff
 * when Pascal wall/slab/level nodes are present.
 *
 * Basis rules (sacred):
 * - Bones member-counted quantities → `takeoff` only when members came from
 *   real wall/slab geometry (not invented).
 * - Massing / rule-of-thumb rows → `estimate` (default).
 * - Unknowns → `placeholder`.
 * - Never label stud counts from LF÷o.c. as `takeoff`.
 *
 * Jurisdiction climate is local Ventura JSON (no network).
 */

import {
  runBonesMemberTakeoff,
  type BonesTakeoffStatus,
} from './eco-bones-engines'
import {
  VENTURA_COUNTY_JURISDICTION,
  type EcoJurisdictionProfile,
} from './eco-jurisdiction-ventura'

export type TakeoffBasis = 'takeoff' | 'estimate' | 'placeholder'

export type EcoConstructionRow = {
  section: string
  item: string
  quantity: number
  unit: string
  basis: TakeoffBasis
  detail: string
}

export type { EcoJurisdictionProfile, BonesTakeoffStatus }

export type EcoConstructionResult = {
  jurisdiction: EcoJurisdictionProfile
  rows: EcoConstructionRow[]
  bones: BonesTakeoffStatus
  metrics: {
    floorAreaM2: number
    exteriorWallLfM: number
    exteriorWallFaceM2: number
    allWallLfM: number
    wallCount: number
    slabCount: number
    exteriorWallCount: number
  }
}

type NodesRecord = Record<string, Record<string, unknown> | undefined>

const STUD_OC_M = 0.4064 // 16"
const SHEET_M2 = 32 / 10.7639 // 4x8
const M3_TO_YD3 = 1.30795

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function pair(v: unknown): [number, number] | null {
  return Array.isArray(v) &&
    v.length >= 2 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number'
    ? [v[0], v[1]]
    : null
}

/** Shoelace polygon area (m²). Polygon is [x,z][]. */
export function polygonAreaM2(poly: readonly (readonly [number, number])[]): number {
  if (poly.length < 3) return 0
  let sum = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!
    const [xj, zj] = poly[j]!
    sum += xj * zi - xi * zj
  }
  return Math.abs(sum) / 2
}

function pointInPoly(
  p: readonly [number, number],
  poly: readonly (readonly [number, number])[],
): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!
    const [xj, zj] = poly[j]!
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) {
      inside = !inside
    }
  }
  return inside
}

type WallGeom = {
  id: string
  start: [number, number]
  end: [number, number]
  length: number
  height: number
  thickness: number
  exterior: boolean
  curved: boolean
  dir: [number, number]
}

function wallDeclaredExterior(node: Record<string, unknown>): boolean {
  const front = node.frontSide
  const back = node.backSide
  if (front === 'exterior' || back === 'exterior') return true
  if (node.exterior === true) return true
  return false
}

function extractWalls(nodes: NodesRecord): WallGeom[] {
  const walls: WallGeom[] = []
  for (const node of Object.values(nodes)) {
    if (!node || node.type !== 'wall') continue
    if (node.visible === false) continue
    const start = pair(node.start)
    const end = pair(node.end)
    if (!start || !end) continue
    const dx = end[0] - start[0]
    const dz = end[1] - start[1]
    const length = Math.hypot(dx, dz)
    if (length < 0.05) continue
    walls.push({
      id: String(node.id ?? ''),
      start,
      end,
      length,
      height: num(node.height, 2.7),
      thickness: num(node.thickness, 0.1),
      exterior: wallDeclaredExterior(node),
      curved: Math.abs(num(node.curveOffset, 0)) > 1e-6,
      dir: [dx / length, dz / length],
    })
  }
  return walls
}

function extractSlabPolys(nodes: NodesRecord): [number, number][][] {
  const polys: [number, number][][] = []
  for (const node of Object.values(nodes)) {
    if (!node || node.type !== 'slab') continue
    if (node.visible === false) continue
    if (!Array.isArray(node.polygon) || node.polygon.length < 3) continue
    const poly: [number, number][] = []
    for (const p of node.polygon as unknown[]) {
      const pt = pair(p)
      if (pt) poly.push(pt)
    }
    if (poly.length >= 3) polys.push(poly)
  }
  return polys
}

/**
 * When no wall declares an exterior face, infer perimeter walls from slab
 * coverage (Bones wall-model exterior fallback, simplified).
 */
function applyExteriorFallback(walls: WallGeom[], slabs: [number, number][][]): void {
  if (walls.some((w) => w.exterior)) return
  if (slabs.length === 0) return
  const covered = (p: readonly [number, number]) => slabs.some((sl) => pointInPoly(p, sl))
  for (const wall of walls) {
    if (wall.curved) continue
    const mid: [number, number] = [
      wall.start[0] + (wall.dir[0] * wall.length) / 2,
      wall.start[1] + (wall.dir[1] * wall.length) / 2,
    ]
    const probeDist = wall.thickness / 2 + 0.2
    let exposed = 0
    for (const side of [1, -1] as const) {
      const n: [number, number] = [-wall.dir[1] * side, wall.dir[0] * side]
      const p: [number, number] = [mid[0] + n[0] * probeDist, mid[1] + n[1] * probeDist]
      if (!covered(p)) exposed++
    }
    if (exposed === 1) wall.exterior = true
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function getEcoJurisdiction(): EcoJurisdictionProfile {
  return VENTURA_COUNTY_JURISDICTION
}

/**
 * Headless construction quantities for an Eco / Pascal nodes dict.
 * Prefers Bones member takeoff when wall/slab/level geometry is present;
 * otherwise keeps the massing adapter and records why.
 *
 * Async: awaits the Bones engines chunk (dynamic import) on first run so
 * page-open editor bundles never pay for construction engines.
 */
export async function runEcoConstructionTakeoff(
  nodes: NodesRecord,
): Promise<EcoConstructionResult> {
  const jurisdiction = VENTURA_COUNTY_JURISDICTION
  const climate = jurisdiction.climate
  const walls = extractWalls(nodes)
  const slabs = extractSlabPolys(nodes)
  applyExteriorFallback(walls, slabs)

  const floorAreaM2 = slabs.reduce((sum, poly) => sum + polygonAreaM2(poly), 0)
  const exteriorWalls = walls.filter((w) => w.exterior && !w.curved)
  const exteriorWallLfM = exteriorWalls.reduce((sum, w) => sum + w.length, 0)
  const exteriorWallFaceM2 = exteriorWalls.reduce((sum, w) => sum + w.length * w.height, 0)
  const allWallLfM = walls.reduce((sum, w) => sum + w.length, 0)

  const rows: EcoConstructionRow[] = []
  const push = (row: EcoConstructionRow) => rows.push(row)

  // --- Geometry (takeoff) — always from scene polygons / centerlines ---
  push({
    section: 'Geometry',
    item: 'Total floor area',
    quantity: round2(floorAreaM2),
    unit: 'm²',
    basis: slabs.length > 0 ? 'takeoff' : 'placeholder',
    detail:
      slabs.length > 0
        ? `shoelace sum of ${slabs.length} slab polygon(s)`
        : 'no slab polygons in scene',
  })
  push({
    section: 'Geometry',
    item: 'Exterior wall length',
    quantity: round2(exteriorWallLfM),
    unit: 'm',
    basis: exteriorWalls.length > 0 ? 'takeoff' : 'placeholder',
    detail:
      exteriorWalls.length > 0
        ? `${exteriorWalls.length} straight exterior wall(s); curved skipped; face from declaration or slab-probe fallback`
        : 'no exterior walls resolved',
  })
  push({
    section: 'Geometry',
    item: 'Exterior wall face area',
    quantity: round2(exteriorWallFaceM2),
    unit: 'm²',
    basis: exteriorWalls.length > 0 ? 'takeoff' : 'placeholder',
    detail: 'Σ (length × height); openings not deducted',
  })
  push({
    section: 'Geometry',
    item: 'All wall length',
    quantity: round2(allWallLfM),
    unit: 'm',
    basis: walls.length > 0 ? 'takeoff' : 'placeholder',
    detail: `${walls.length} wall segment(s) including partitions`,
  })

  const bones = await runBonesMemberTakeoff(nodes)

  if (bones.status.ok) {
    push({
      section: 'Bones',
      item: 'Member takeoff',
      quantity: bones.status.memberCount,
      unit: 'members',
      basis: 'takeoff',
      detail: `computeLevel + computeTakeoff on level ${bones.status.levelId} (${bones.status.takeoffRowCount} quantity rows)`,
    })
    for (const row of bones.rows) push(row)
  } else {
    push({
      section: 'Bones',
      item: 'Member takeoff',
      quantity: 0,
      unit: '—',
      basis: 'placeholder',
      detail: bones.status.reason,
    })

    // --- Massing framing estimates (default estimate) — only when Bones did not run ---
    const framingLf = allWallLfM > 0 ? allWallLfM : exteriorWallLfM
    if (framingLf > 0) {
      const studPcs = Math.ceil(framingLf / STUD_OC_M) + walls.length
      push({
        section: 'Wall framing',
        item: 'Studs (2x4 / 2x6 class)',
        quantity: studPcs,
        unit: 'pcs',
        basis: 'estimate',
        detail: `rule of thumb: wall LF ÷ ${STUD_OC_M} m (16" o.c.) + 1 end stud per segment — not member-counted`,
      })
      push({
        section: 'Wall framing',
        item: 'Plates (bottom + double top)',
        quantity: round1(framingLf * 3),
        unit: 'lf',
        basis: 'estimate',
        detail: '3 × wall LF (one bottom + two top); stock drop not applied',
      })
    } else {
      push({
        section: 'Wall framing',
        item: 'Studs / plates',
        quantity: 0,
        unit: 'pcs',
        basis: 'placeholder',
        detail: 'no walls to estimate',
      })
    }

    if (exteriorWallFaceM2 > 0) {
      const sheets = Math.ceil(exteriorWallFaceM2 / SHEET_M2)
      push({
        section: 'Sheathing',
        item: 'Wall sheathing 7/16" WSP',
        quantity: sheets,
        unit: 'sheets',
        basis: 'estimate',
        detail: `gross face area ÷ 4x8 (${round2(SHEET_M2)} m²); openings not deducted; +10% waste not stacked into qty`,
      })
    }

    if (exteriorWallLfM > 0) {
      const embedM = climate.footingEmbedmentMinIn * 0.0254
      const widthM = 0.4064 // 16" typical strip
      const m3 = exteriorWallLfM * widthM * embedM
      push({
        section: 'Foundation',
        item: 'Strip footing concrete',
        quantity: Math.max(0.1, round1(m3 * M3_TO_YD3)),
        unit: 'yd³',
        basis: 'estimate',
        detail: `perimeter ${round2(exteriorWallLfM)} m × ${round2(widthM)} m × ${climate.footingEmbedmentMinIn}" min embed (frost ${climate.frostLineIn}" — negligible coastal); SDC ${climate.seismicSdc}`,
      })
      const boltOcM = climate.anchorBoltSpacingFt * 0.3048
      const bolts = Math.ceil(exteriorWallLfM / boltOcM) + exteriorWalls.length
      push({
        section: 'Foundation',
        item: 'Anchor bolts',
        quantity: bolts,
        unit: 'pcs',
        basis: 'estimate',
        detail: `${climate.anchorBoltSpacingFt}' o.c. (seismic hold-downs profile) + ends; R403.1.6 class`,
      })
    }

    if (floorAreaM2 > 0) {
      push({
        section: 'Electrical',
        item: 'Receptacles (rough count)',
        quantity: Math.max(1, Math.ceil(floorAreaM2 / 3.6)),
        unit: 'pcs',
        basis: 'estimate',
        detail: 'NEC 210.52-ish ~12 ft wall walk ≈ 3.6 m²/device — not a receptacle walk',
      })
      push({
        section: 'HVAC',
        item: 'Cooling tonnage (rule of thumb)',
        quantity: Math.max(0.5, round1(floorAreaM2 / 55)),
        unit: 'tons',
        basis: 'estimate',
        detail: '1 ton / 55 m² conditioned floor (Bones characteristics COOLING_M2_PER_TON) — not Manual J',
      })
    }
  }

  push({
    section: 'WUI / fire',
    item: 'Ignition-resistant assembly allowance',
    quantity: 0,
    unit: '—',
    basis: 'placeholder',
    detail: climate.wuiNote,
  })

  push({
    section: 'Flags',
    item: 'Engineered lateral / soils',
    quantity: 1,
    unit: 'ea',
    basis: 'placeholder',
    detail: `SDC ${climate.seismicSdc} — shear walls, hold-downs, and soils report are site engineering, not massing takeoff`,
  })

  return {
    jurisdiction,
    rows,
    bones: bones.status,
    metrics: {
      floorAreaM2: round2(floorAreaM2),
      exteriorWallLfM: round2(exteriorWallLfM),
      exteriorWallFaceM2: round2(exteriorWallFaceM2),
      allWallLfM: round2(allWallLfM),
      wallCount: walls.length,
      slabCount: slabs.length,
      exteriorWallCount: exteriorWalls.length,
    },
  }
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** CSV with basis beside every quantity (first-class column). */
export function ecoConstructionCsv(result: EcoConstructionResult): string {
  const j = result.jurisdiction
  const c = j.climate
  const headerLines = [
    `# jurisdiction,${csvField(j.name)}`,
    `# residentialCode,${csvField(j.residentialCode)}`,
    `# codeEffective,${csvField(j.codeEffective)}`,
    `# frostLineIn,${c.frostLineIn}`,
    `# footingEmbedmentMinIn,${c.footingEmbedmentMinIn}`,
    `# groundSnowLoadPsf,${c.groundSnowLoadPsf}`,
    `# ultimateWindMph,${c.ultimateWindMph}`,
    `# seismicSdc,${c.seismicSdc}`,
    `# seismicHoldDowns,${c.seismicHoldDowns}`,
    `# wui,${c.wui}`,
    'section,item,quantity,unit,basis,detail',
  ]
  const body = result.rows.map((r) =>
    [
      csvField(r.section),
      csvField(r.item),
      String(r.quantity),
      csvField(r.unit),
      r.basis,
      csvField(r.detail),
    ].join(','),
  )
  return [...headerLines, ...body].join('\n')
}
