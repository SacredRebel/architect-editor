/**
 * H15 — OrganicSpec contract (spatial-map docs/organic-spec.md).
 * `cleanSpec` clamps every field to the published ranges.
 */

export type OrganicForm = 'fit' | 'lobed' | 'oval' | 'leaf' | 'shell'
export type OrganicStructure = 'steel' | 'timber' | 'bamboo' | 'none'
export type OrganicInfill =
  | 'cob'
  | 'hempcrete'
  | 'strawbale'
  | 'rammed_earth'
  | 'adobe'
  | 'stone'
  | 'plaster'
  | 'wood'
  | 'timber'
  | 'glass'
export type OrganicInsulation = 'hemp' | 'wool' | 'cork' | 'strawbale' | 'none'
export type OrganicRoof = 'solar' | 'living' | 'metal' | 'thatch' | 'tile' | 'shingle'
export type OrganicFloor = 'earth' | 'stone' | 'wood' | 'concrete' | 'timber'

export type OrganicSpec = {
  form: OrganicForm
  lobes: number
  depth: number
  turn: number
  inset: number
  height: number
  rise: number
  overhang: number
  thick: number
  structure: OrganicStructure
  infill: OrganicInfill
  insulation: OrganicInsulation
  roof: OrganicRoof
  solar: number
  glazing: number
  facing: number
  door: number
  floor: OrganicFloor
  pad: boolean
}

export const ORGANIC_DEFAULTS: OrganicSpec = {
  form: 'lobed',
  lobes: 5,
  depth: 0.35,
  turn: 0,
  inset: 0.5,
  height: 3.2,
  rise: 2.4,
  overhang: 0.8,
  thick: 0.45,
  structure: 'timber',
  infill: 'cob',
  insulation: 'hemp',
  roof: 'solar',
  solar: 0.55,
  glazing: 0.25,
  facing: 180,
  door: 0,
  floor: 'earth',
  pad: false,
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

/** Clamp / coerce a partial spec to the published organic-spec ranges. */
export function cleanSpec(partial: Partial<OrganicSpec> | null | undefined): OrganicSpec {
  const p = partial ?? {}
  return {
    form: pick(p.form, ['fit', 'lobed', 'oval', 'leaf', 'shell'] as const, ORGANIC_DEFAULTS.form),
    lobes: Math.round(clamp(Number(p.lobes ?? ORGANIC_DEFAULTS.lobes), 2, 12)),
    depth: clamp(Number(p.depth ?? ORGANIC_DEFAULTS.depth), 0, 0.6),
    turn: clamp(Number(p.turn ?? ORGANIC_DEFAULTS.turn), -360, 360),
    inset: clamp(Number(p.inset ?? ORGANIC_DEFAULTS.inset), 0, 10),
    height: clamp(Number(p.height ?? ORGANIC_DEFAULTS.height), 2.2, 9),
    rise: clamp(Number(p.rise ?? ORGANIC_DEFAULTS.rise), 0.3, 8),
    overhang: clamp(Number(p.overhang ?? ORGANIC_DEFAULTS.overhang), 0, 3),
    thick: clamp(Number(p.thick ?? ORGANIC_DEFAULTS.thick), 0.12, 1),
    structure: pick(
      p.structure,
      ['steel', 'timber', 'bamboo', 'none'] as const,
      ORGANIC_DEFAULTS.structure,
    ),
    infill: pick(
      p.infill,
      [
        'cob',
        'hempcrete',
        'strawbale',
        'rammed_earth',
        'adobe',
        'stone',
        'plaster',
        'wood',
        'timber',
        'glass',
      ] as const,
      ORGANIC_DEFAULTS.infill,
    ),
    insulation: pick(
      p.insulation,
      ['hemp', 'wool', 'cork', 'strawbale', 'none'] as const,
      ORGANIC_DEFAULTS.insulation,
    ),
    roof: pick(
      p.roof,
      ['solar', 'living', 'metal', 'thatch', 'tile', 'shingle'] as const,
      ORGANIC_DEFAULTS.roof,
    ),
    solar: clamp(Number(p.solar ?? ORGANIC_DEFAULTS.solar), 0, 1),
    glazing: clamp(Number(p.glazing ?? ORGANIC_DEFAULTS.glazing), 0, 1),
    facing: ((Number(p.facing ?? ORGANIC_DEFAULTS.facing) % 360) + 360) % 360,
    door: ((Number(p.door ?? ORGANIC_DEFAULTS.door) % 360) + 360) % 360,
    floor: pick(
      p.floor,
      ['earth', 'stone', 'wood', 'concrete', 'timber'] as const,
      ORGANIC_DEFAULTS.floor,
    ),
    pad: Boolean(p.pad ?? ORGANIC_DEFAULTS.pad),
  }
}

/** Rough plain-words → partial OrganicSpec (local agent fallback). */
export function parseOrganicWords(text: string): Partial<OrganicSpec> {
  const t = text.toLowerCase()
  const out: Partial<OrganicSpec> = {}
  if (/\blobed\b|\bpetal\b|\bflower\b/.test(t)) out.form = 'lobed'
  else if (/\boval\b|\bellipse\b/.test(t)) out.form = 'oval'
  else if (/\bleaf\b/.test(t)) out.form = 'leaf'
  else if (/\bshell\b|\bnautilus\b/.test(t)) out.form = 'shell'
  else if (/\bfit\b|\bfollow\b/.test(t)) out.form = 'fit'

  const lobes = t.match(/(\d+)\s*lobes?/)
  if (lobes) out.lobes = Number(lobes[1])

  if (/\bcob\b/.test(t)) out.infill = 'cob'
  else if (/\bhempcrete\b/.test(t)) out.infill = 'hempcrete'
  else if (/\bstraw\b/.test(t)) out.infill = 'strawbale'
  else if (/\brammed\b/.test(t)) out.infill = 'rammed_earth'
  else if (/\badobe\b/.test(t)) out.infill = 'adobe'

  if (/\bsteel\b/.test(t)) out.structure = 'steel'
  else if (/\bbamboo\b/.test(t)) out.structure = 'bamboo'
  else if (/\btimber\b|\bwood frame\b/.test(t)) out.structure = 'timber'

  if (/\bhemp\b.*insul|insul.*\bhemp\b/.test(t)) out.insulation = 'hemp'
  else if (/\bwool\b/.test(t)) out.insulation = 'wool'
  else if (/\bcork\b/.test(t)) out.insulation = 'cork'

  if (/\bsolar\b/.test(t)) out.roof = 'solar'
  else if (/\bliving\b|\bgreen roof\b/.test(t)) out.roof = 'living'
  else if (/\bthatch\b/.test(t)) out.roof = 'thatch'
  else if (/\bmetal\b/.test(t)) out.roof = 'metal'
  else if (/\btile\b/.test(t)) out.roof = 'tile'

  return out
}
