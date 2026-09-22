/** Shared constants and 2D helpers for the geometry kit. */

export const PHI = (1 + Math.sqrt(5)) / 2
export const SQRT2 = Math.SQRT2
export const SQRT3 = Math.sqrt(3)
export const FT = 0.3048

export type Vec2 = [number, number]

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

export function mid(a: Vec2, b: Vec2): Vec2 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]]
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]]
}

export function scale(a: Vec2, s: number): Vec2 {
  return [a[0] * s, a[1] * s]
}

export function rot(a: Vec2, deg: number, origin: Vec2 = [0, 0]): Vec2 {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const d = sub(a, origin)
  return add(origin, [d[0] * c - d[1] * s, d[0] * s + d[1] * c])
}

/** Parse typed lengths: `32'6"`, `32.5'`, `9.9m`, bare metres. */
export function parseLengthInput(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/,/g, '')
  if (!s) return null
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*m(?:eters?|etres?)?$/)
  if (m) return Number(m[1])
  const fi = s.match(/^(-?\d+)\s*(?:'|′|ft|feet)\s*(-?\d+(?:\.\d+)?)?\s*(?:"|″|in|inches)?$/)
  if (fi) {
    const feet = Number(fi[1])
    const inches = fi[2] != null ? Number(fi[2]) : 0
    return (Math.abs(feet) + inches / 12) * FT * Math.sign(feet || 1)
  }
  const ft = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:'|′|ft|feet)$/)
  if (ft) return Number(ft[1]) * FT
  const bare = s.match(/^(-?\d+(?:\.\d+)?)$/)
  if (bare) return Number(bare[1])
  return null
}

/** Labels banned from UI strings (search keywords only). */
export const BANNED_UI_LABELS = [
  'sacred',
  'divine',
  'flower of life',
  'metatron',
  'seed of life',
  'vesica piscis',
  'platonic',
] as const
