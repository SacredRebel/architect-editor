/**
 * Jurisdiction profiles — how location changes the framing.
 *
 * Eco H3 ships the **county**, not the nation: Ventura County climate/code
 * values are inlined here so FramingSpec never pulls the national
 * `jurisdictions-climate.json` / `jurisdictions-adoption.json` tables
 * (~115 KB). Those files remain under `data/` for upstream parity / future
 * jurisdiction changes; they are not on the default load path.
 */

import {
  DEFAULT_SPEC,
  type FramingSpec,
  headerBandForSnow,
  rafterSpansForSnow,
} from '../core/spec'
import { feet, inches } from '../core/units'

export type JurisdictionProfile = {
  code: string
  name: string
  residentialCode: string
  frostLineIn: number
  groundSnowLoadPsf: number
  ultimateWindMph: number
  seismicSdc: string
  hurricaneTies: boolean
  seismicHoldDowns: boolean
  /** Default construction for EXTERIOR walls in this jurisdiction. */
  exteriorWallDefault: 'framed' | 'cmu'
  /**
   * True when the researched adoption row DECLARES a non-IRC residential
   * code (`ircBase: null` — Wisconsin's UDC, the Canadian NBC rows). The
   * engines' prescriptive machinery cites IRC sections unconditionally, so
   * compute confesses it as generic practice on these jurisdictions
   * (`nonIrcCodeWarning`) instead of implying the labels cite local law.
   * INTL and unknown codes stay false: they claim no local code at all.
   */
  nonIrcCode: boolean
  notes: string[]
}

/**
 * Ventura County, CA — matches `packages/plugin-eco/data/jurisdiction/ventura-county.json`
 * and `src/eco-jurisdiction-ventura.ts`. Wired into FramingSpec via applyJurisdiction.
 */
export const VENTURA_PROFILE: JurisdictionProfile = {
  code: 'US-CA-VENTURA',
  name: 'Ventura County, California (unincorporated / VCBC)',
  residentialCode:
    '2025 California Residential Code (CRC), Title 24 Part 2.5 (2024 IRC base), as adopted by the 2025 Ventura County Building Code (VCBC Ordinance 4655)',
  frostLineIn: 0,
  groundSnowLoadPsf: 0,
  ultimateWindMph: 100,
  seismicSdc: 'D',
  hurricaneTies: false,
  seismicHoldDowns: true,
  exteriorWallDefault: 'framed',
  nonIrcCode: false,
  notes: [
    'Coastal Ventura: negligible frost; R403 12 in embedment floor still applies via applyJurisdiction.',
    'WUI / Hazardous Fire Area assumed for Eco Village Sulphur Mountain context.',
    'National jurisdictions-*.json not loaded — county profile only.',
  ],
}

export const INTL_PROFILE: JurisdictionProfile = {
  code: 'INTL',
  name: 'International (generic)',
  residentialCode: 'Generic light-frame practice — no local code applied',
  frostLineIn: 24,
  groundSnowLoadPsf: 30,
  ultimateWindMph: 115,
  seismicSdc: 'B',
  hurricaneTies: false,
  seismicHoldDowns: false,
  exteriorWallDefault: 'framed',
  nonIrcCode: false,
  notes: ['Pick a US state for code-informed sizing; INTL uses conservative generic defaults.'],
}

/** Eco default: Ventura County. US-CA / CA aliases map here (no national table). */
export function profileFor(code: string): JurisdictionProfile {
  if (code === 'INTL' || code === 'AUTO') return INTL_PROFILE
  if (
    code === 'US-CA-VENTURA' ||
    code === 'US-CA' ||
    code === 'CA' ||
    code === 'VENTURA'
  ) {
    return VENTURA_PROFILE
  }
  // Unknown codes: stamp the code on INTL defaults — do not pull national JSON.
  return { ...INTL_PROFILE, code, name: code }
}

/**
 * The ircBase:null honesty line (Wisconsin-UDC / Canadian-NBC class): the
 * engines' member labels, flags and prescriptive checks cite IRC (and
 * IECC/NEC) sections UNCONDITIONALLY — nothing downstream keys on the
 * adoption row's `ircBase`. On a jurisdiction whose researched code is not
 * an IRC adoption, silence would imply those cites are local law. Compute
 * pushes this one level warning instead (300+ only — LOD 200 makes no code
 * claims), so the panel warnings drawer and the paper flag block both carry
 * the confession. Suppressing/re-citing every engine label per code family
 * is the real fix — tracked on the board, blast radius is every engine.
 */
export function nonIrcCodeWarning(profile: JurisdictionProfile): string | null {
  if (!profile.nonIrcCode) return null
  // Rows whose residentialCode DESCRIBES the absence of a statewide code
  // (VT: 'No statewide residential building code…') cannot be 'verified
  // against the governing code' — there isn't one; point at local/municipal
  // requirements instead (CANADA round-1 skeptic F2c).
  const tail = /^No\b/.test(profile.residentialCode)
    ? `verify against local/municipal requirements: ${profile.residentialCode}`
    : `verify against the governing code: ${profile.residentialCode}`
  return (
    `non-IRC jurisdiction (${profile.name}): members and checks cite IRC/IECC/NEC ` +
    `sections from the generic engine — treat as generic practice and ${tail}`
  )
}

/** Selectable codes on Eco's default path: INTL + Ventura only. */
export function jurisdictionOptions(): { code: string; name: string }[] {
  return [
    { code: 'INTL', name: 'International (generic)' },
    { code: VENTURA_PROFILE.code, name: VENTURA_PROFILE.name },
  ]
}

/**
 * Apply a jurisdiction to the framing spec (LOD 300). Pure — returns a new
 * spec; LOD 200 skips this and frames with generic defaults.
 */
export function applyJurisdiction(
  spec: FramingSpec,
  profile: JurisdictionProfile,
): FramingSpec {
  const next: FramingSpec = { ...spec }
  // Footings chase the frost line (IRC R403.1.4.1), never shallower than 12".
  next.footingDepth = Math.max(inches(12), inches(profile.frostLineIn))
  // SDC D+ tightens sill anchorage (state amendments commonly 4' o.c. + plate washers).
  next.seismicHoldDowns = profile.seismicHoldDowns
  next.anchorBoltSpacing = profile.seismicHoldDowns ? feet(4) : feet(6)
  // High-wind coastal: rafter-to-plate ties.
  next.hurricaneTies = profile.hurricaneTies || profile.ultimateWindMph >= 130
  // ≥ 130 mph the uplift path must CONTINUE down the wall to the foundation
  // (R802.11, R301.2.1/WFCM — LOD-400 B10): stud-to-plate connectors,
  // opening uplift straps, plate-to-foundation straps. The trigger is the
  // data's own highWind overlay rule (wall-assemblies.json:
  // 'ultimateWindMph >= 130 && flags.hurricaneTies') — the broader
  // hurricaneTies set (sub-130 coastal states: TX/AL/GA/NY…) keeps its
  // belt-and-braces roof ties with no wall-side claim, byte-equal walls.
  next.highWindUplift = profile.hurricaneTies && profile.ultimateWindMph >= 130
  // ≥ 130 mph WITHOUT the researched flag (today exactly CA-NU — extreme
  // Arctic wind, flags per the row's NBC research): the wind leg above
  // still mints roof ties, but neither shipped tie label is true for this
  // class — the belt clause claims 'below 130 mph' and the plain label
  // implies the B10 wall continuation. Fold the third-class signal ONLY
  // when it applies (absent field == byte-identical spec, E5).
  if (!profile.hurricaneTies && profile.ultimateWindMph >= 130) {
    next.highWindTiesOnly = true
  }
  // Heavy snow bumps the default rafter one size (span tables shrink fast).
  if (profile.groundSnowLoadPsf >= 50) next.rafterSize = '2x8'
  if (profile.groundSnowLoadPsf >= 70) next.rafterSize = '2x10'
  // …and swaps the allowable-span table to the matching snow band
  // (R802.4.1(1) low-snow / R802.4.1(5) at ≥ 50 psf) — the sizes and the
  // spans the roof engine checks against always move together.
  next.rafterSpans = rafterSpansForSnow(profile.groundSnowLoadPsf)
  // Heavy snow deepens the prescriptive WALL headers too (LOD-400 B11):
  // IRC Table R602.7(1) tabulates header spans by ground snow load
  // (30/50/70 psf columns) AND building width; VT at 60 psf used to frame
  // headers byte-equal to INTL. The band snaps UP to the governing column;
  // width isn't in the spec, so the band carries an assumption the wall
  // engine prints on every header it sizes (low-snow: none — byte-equal).
  const headerBand = headerBandForSnow(profile.groundSnowLoadPsf)
  next.headerRules = headerBand.rules
  next.headerAssumption = headerBand.assumption
  // The band's 2-ply table ends at its 2-2x12 cell (83" @ 50 psf / 74" @
  // 70 psf) — past it the open-ended 4x12 rule would claim the table
  // outside its domain, so the engineered threshold caps there too: a
  // longer span routes to the supplier/flag path, never a silent lumber
  // 4x12 with the assumption label (round-2 skeptic). Low-snow keeps the
  // shipped 10 ft (its labels make no table claim).
  if (headerBand.engineeredSpanCap !== undefined) {
    next.engineeredHeaderSpan = Math.min(next.engineeredHeaderSpan, headerBand.engineeredSpanCap)
  }
  return next
}

export const DEFAULT_PROFILE = VENTURA_PROFILE
export { DEFAULT_SPEC }
