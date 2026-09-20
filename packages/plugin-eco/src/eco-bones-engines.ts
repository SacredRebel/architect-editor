/**
 * Deep-load Bones pure engines (computeLevel / computeTakeoff / FramingNode).
 *
 * Not on `@pascal-app/plugin-bones` public exports — resolve from the local
 * clone at `.cache/plugin-bones` or the installed package root. Eco's Ventura
 * climate profile stays in-repo; we never network-fetch jurisdiction climate.
 */

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type NodesRecord = Record<string, Record<string, unknown> | undefined>

/** Local row shape — mirrors EcoConstructionRow without a circular import. */
type BonesLabeledRow = {
  section: string
  item: string
  quantity: number
  unit: string
  basis: 'takeoff' | 'estimate' | 'placeholder'
  detail: string
}

type FramingNode = {
  parentId?: string
  jurisdiction?: string
  [key: string]: unknown
}

type TakeoffRow = {
  section: string
  item: string
  detail: string
  quantity: number
  unit: string
}

type ComputeResult = {
  members: unknown[]
  fixtures: unknown[]
  warnings: string[]
  areas: Record<string, number | undefined>
  walls: { id: string; curved?: boolean }[]
}

type BonesEngines = {
  computeLevel: (nodes: Record<string, Record<string, unknown>>, config: FramingNode) => ComputeResult
  computeTakeoff: (
    members: unknown[],
    fixtures: unknown[],
    areas?: Record<string, number | undefined>,
  ) => TakeoffRow[]
  FramingNode: { parse: (input: unknown) => FramingNode }
}

export type BonesTakeoffStatus =
  | {
      ok: true
      levelId: string
      memberCount: number
      takeoffRowCount: number
      warnings: string[]
    }
  | { ok: false; reason: string }

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../..')

let cached: BonesEngines | null | undefined

function tryLoadFromRoot(root: string): BonesEngines | null {
  try {
    const compute = require(join(root, 'src/framing/compute.ts')) as {
      computeLevel: BonesEngines['computeLevel']
    }
    const takeoff = require(join(root, 'src/engines/takeoff.ts')) as {
      computeTakeoff: BonesEngines['computeTakeoff']
    }
    const schema = require(join(root, 'src/framing/schema.ts')) as {
      FramingNode: BonesEngines['FramingNode']
    }
    if (!compute.computeLevel || !takeoff.computeTakeoff || !schema.FramingNode) return null
    return {
      computeLevel: compute.computeLevel,
      computeTakeoff: takeoff.computeTakeoff,
      FramingNode: schema.FramingNode,
    }
  } catch {
    return null
  }
}

/** Sync load — bun can require .ts; returns null when bones is unavailable. */
export function loadBonesEngines(): BonesEngines | null {
  if (cached !== undefined) return cached

  const cacheClone = tryLoadFromRoot(join(repoRoot, '.cache/plugin-bones'))
  if (cacheClone) {
    cached = cacheClone
    return cached
  }

  try {
    const pkgJson = require.resolve('@pascal-app/plugin-bones/package.json')
    const fromPkg = tryLoadFromRoot(dirname(pkgJson))
    if (fromPkg) {
      cached = fromPkg
      return cached
    }
  } catch {
    // package not installed
  }

  cached = null
  return null
}

function num(v: unknown, fallback = 0): number {
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

function levelIds(nodes: NodesRecord): string[] {
  const ids: string[] = []
  for (const node of Object.values(nodes)) {
    if (node && node.type === 'level' && typeof node.id === 'string') ids.push(node.id)
  }
  return ids
}

/** Straight Pascal walls parented to `levelId` (Bones skips curved). */
function straightWallsOnLevel(nodes: NodesRecord, levelId: string): number {
  let n = 0
  for (const node of Object.values(nodes)) {
    if (!node || node.type !== 'wall' || node.parentId !== levelId) continue
    if (node.visible === false) continue
    if (!pair(node.start) || !pair(node.end)) continue
    if (Math.abs(num(node.curveOffset)) > 1e-6) continue
    n++
  }
  return n
}

function slabsOnLevel(nodes: NodesRecord, levelId: string): number {
  let n = 0
  for (const node of Object.values(nodes)) {
    if (!node || node.type !== 'slab' || node.parentId !== levelId) continue
    if (node.visible === false) continue
    if (!Array.isArray(node.polygon) || node.polygon.length < 3) continue
    n++
  }
  return n
}

function pickFramingLevel(nodes: NodesRecord): { levelId: string } | { reason: string } {
  const levels = levelIds(nodes)
  if (levels.length === 0) return { reason: 'no Pascal level node — Bones computeLevel needs a level parent' }

  let best: { levelId: string; walls: number; slabs: number } | null = null
  let curvedOnly = false
  for (const levelId of levels) {
    const walls = straightWallsOnLevel(nodes, levelId)
    const slabs = slabsOnLevel(nodes, levelId)
    let curved = 0
    for (const node of Object.values(nodes)) {
      if (!node || node.type !== 'wall' || node.parentId !== levelId) continue
      if (Math.abs(num(node.curveOffset)) > 1e-6) curved++
    }
    if (walls === 0 && curved > 0) curvedOnly = true
    if (walls === 0) continue
    if (!best || walls + slabs > best.walls + best.slabs) best = { levelId, walls, slabs }
  }

  if (!best) {
    if (curvedOnly) {
      return {
        reason:
          'only curved walls on level(s) — Bones skips curved framing; massing adapter kept',
      }
    }
    return {
      reason: 'no straight wall/slab geometry parented to a level — Bones engines not run',
    }
  }
  if (best.slabs === 0 && best.walls === 0) {
    return { reason: 'no wall/slab geometry for Bones extract' }
  }
  return { levelId: best.levelId }
}

/**
 * Run Bones computeLevel + computeTakeoff when the scene has extractable
 * Pascal wall/slab/level nodes. Member-counted rows → basis `takeoff`.
 */
export function runBonesMemberTakeoff(nodes: NodesRecord): {
  status: BonesTakeoffStatus
  rows: BonesLabeledRow[]
} {
  const engines = loadBonesEngines()
  if (!engines) {
    return {
      status: {
        ok: false,
        reason:
          'Bones engines unavailable (clone github.com/pascalorg/plugin-bones → .cache/plugin-bones or install @pascal-app/plugin-bones)',
      },
      rows: [],
    }
  }

  const pick = pickFramingLevel(nodes)
  if ('reason' in pick) {
    return { status: { ok: false, reason: pick.reason }, rows: [] }
  }

  const { levelId } = pick
  try {
    const config = engines.FramingNode.parse({
      parentId: levelId,
      // State-typical CA for Bones engines; Eco UI still stamps Ventura in-repo.
      jurisdiction: 'US-CA',
      detail: '400',
      studSpacingIn: 16,
      showWalls: true,
      showFloor: true,
      showRoof: true,
      showFoundation: true,
      showElectrical: true,
      showPlumbing: false,
      showHvac: true,
    })

    const result = engines.computeLevel(nodes as Record<string, Record<string, unknown>>, config)
    if (!result.members.length) {
      return {
        status: {
          ok: false,
          reason: `Bones computeLevel returned 0 members on level ${levelId} (warnings: ${result.warnings.slice(0, 3).join('; ') || 'none'})`,
        },
        rows: [],
      }
    }

    const takeoff = engines.computeTakeoff(result.members, result.fixtures, result.areas)
    const rows: BonesLabeledRow[] = takeoff.map((r) => ({
      section: `Bones · ${r.section}`,
      item: r.item,
      quantity: r.quantity,
      unit: r.unit,
      basis: 'takeoff' as const,
      detail: `Bones member count from wall/slab geometry on ${levelId}: ${r.detail}`,
    }))

    for (const w of result.warnings.slice(0, 12)) {
      rows.push({
        section: 'Bones · Flags',
        item: 'Engine warning',
        quantity: 1,
        unit: 'ea',
        basis: 'placeholder',
        detail: w,
      })
    }

    return {
      status: {
        ok: true,
        levelId,
        memberCount: result.members.length,
        takeoffRowCount: takeoff.length,
        warnings: result.warnings,
      },
      rows,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      status: { ok: false, reason: `Bones engines threw: ${msg}` },
      rows: [],
    }
  }
}
