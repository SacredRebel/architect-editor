/**
 * H15.4 — true size: imperial ↔ metric display, typed lengths, ANSI Z765 areas.
 */

export const M_TO_FT = 3.280839895
export const FT_TO_M = 1 / M_TO_FT
export const M2_TO_SQFT = 10.76391041671
export const SQFT_TO_M2 = 1 / M2_TO_SQFT
/** ANSI Z765: ceiling under this is not finished area. */
export const ANSI_MIN_CEILING_M = 2.13 // 7 ft

export type LengthOrder = 'imperial-first' | 'metric-first'

export function metresToFeetInches(metres: number): { feet: number; inches: number; frac: number } {
  const totalIn = Math.abs(metres) * M_TO_FT * 12
  const feet = Math.floor(totalIn / 12)
  const inchesRaw = totalIn - feet * 12
  // Nearest ⅛ inch
  const eighths = Math.round(inchesRaw * 8) / 8
  let inches = Math.floor(eighths)
  let frac = eighths - inches
  let f = feet
  if (inches >= 12) {
    f += 1
    inches = 0
    frac = 0
  }
  return { feet: metres < 0 ? -f : f, inches, frac }
}

function fracGlyph(frac: number): string {
  const map: Record<number, string> = {
    0: '',
    0.125: '⅛',
    0.25: '¼',
    0.375: '⅜',
    0.5: '½',
    0.625: '⅝',
    0.75: '¾',
    0.875: '⅞',
  }
  const key = Math.round(frac * 8) / 8
  return map[key] ?? ''
}

/** `32′ 9½″ · 9.99 m` (or metric first). */
export function formatLength(metres: number, order: LengthOrder = 'imperial-first'): string {
  const { feet, inches, frac } = metresToFeetInches(metres)
  const g = fracGlyph(frac)
  const imp = `${Math.abs(feet)}′ ${inches}${g}″`
  const met = `${metres.toFixed(2)} m`
  return order === 'imperial-first' ? `${imp} · ${met}` : `${met} · ${imp}`
}

export function formatArea(m2: number, order: LengthOrder = 'imperial-first'): string {
  const sqft = m2 * M2_TO_SQFT
  const a = `${sqft.toFixed(1)} sq ft`
  const b = `${m2.toFixed(2)} m²`
  return order === 'imperial-first' ? `${a} · ${b}` : `${b} · ${a}`
}

/**
 * Parse typed lengths: `32'6"`, `32.5'`, `9.9m`, bare `20` (metres) + Enter.
 * Returns metres or null if unparseable.
 */
export function parseLengthInput(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/,/g, '')
  if (!s) return null

  // 9.9m / 9.9 m
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*m(?:eters?|etres?)?$/)
  if (m) return Number(m[1])

  // 32'6" / 32′6″ / 32' 6.5" / 32 ft 6 in
  const fi = s.match(
    /^(-?\d+)\s*(?:'|′|ft|feet)\s*(-?\d+(?:\.\d+)?)?\s*(?:"|″|in|inches)?$/,
  )
  if (fi) {
    const feet = Number(fi[1])
    const inches = fi[2] != null ? Number(fi[2]) : 0
    return (Math.abs(feet) + inches / 12) * FT_TO_M * Math.sign(feet || 1)
  }

  // 32.5'
  const ft = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:'|′|ft|feet)$/)
  if (ft) return Number(ft[1]) * FT_TO_M

  // bare number → metres
  const bare = s.match(/^(-?\d+(?:\.\d+)?)$/)
  if (bare) return Number(bare[1])

  return null
}

/** Snap angle with Shift: 90° / 45°. */
export function snapAngleDeg(deg: number, shift: boolean): number {
  if (!shift) return deg
  const step = 45
  return Math.round(deg / step) * step
}

export type FloorAreaRow = {
  level: number
  gross_m2: number
  net_m2: number
  /** Ceiling height used for ANSI finished-area gate. */
  ceiling_m: number
  finished: boolean
}

export type AnsiAreaExtras = {
  gross_m2: number
  net_m2: number
  footprint_m2: number
  floors: FloorAreaRow[]
}

/**
 * ANSI Z765-ish: gross/net per floor + footprint.
 * Ceiling under 7 ft / 2.13 m → not finished area (excluded from net).
 */
export function computeAnsiAreas(floors: { area_m2: number; ceiling_m: number; wall_area_m2?: number }[]): AnsiAreaExtras {
  const rows: FloorAreaRow[] = floors.map((f, i) => {
    const finished = f.ceiling_m >= ANSI_MIN_CEILING_M - 1e-6
    const gross = Math.max(0, f.area_m2)
    const net = finished ? gross : 0
    return {
      level: i,
      gross_m2: gross,
      net_m2: net,
      ceiling_m: f.ceiling_m,
      finished,
    }
  })
  const footprint_m2 = rows[0]?.gross_m2 ?? 0
  return {
    gross_m2: rows.reduce((s, r) => s + r.gross_m2, 0),
    net_m2: rows.reduce((s, r) => s + r.net_m2, 0),
    footprint_m2,
    floors: rows,
  }
}

/** Live dimension readout while drawing. */
export function liveDrawReadout(options: {
  segmentLengthM: number
  segmentAngleDeg: number
  finishedLengthsM: number[]
  closed?: boolean
  areaM2?: number
  perimeterM?: number
  order?: LengthOrder
}): string {
  const order = options.order ?? 'imperial-first'
  const parts = [
    `seg ${formatLength(options.segmentLengthM, order)}`,
    `∠ ${options.segmentAngleDeg.toFixed(1)}°`,
  ]
  if (options.finishedLengthsM.length) {
    parts.push(`Σ ${formatLength(options.finishedLengthsM.reduce((a, b) => a + b, 0), order)}`)
  }
  if (options.closed && options.areaM2 != null && options.perimeterM != null) {
    parts.push(`area ${formatArea(options.areaM2, order)}`)
    parts.push(`perim ${formatLength(options.perimeterM, order)}`)
  }
  return parts.join(' · ')
}
