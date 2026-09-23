/**
 * Inverted hanging-chain (catenary) arches — Hooke 1675 / Poleni 1748.
 *
 * The arch centreline is y = a · (cosh(L/(2a)) − cosh(x/a)), fitted so the
 * curve passes through both springings (±L/2, 0) and the crown (0, rise).
 * The line of thrust under self-weight is that same curve; Poleni's test asks
 * whether it stays inside the middle third of the masonry thickness.
 */

export type CatenaryPoint = { x: number; y: number }

export type CatenaryFit = {
  /** Parameter a in metres (characteristic length of the chain). */
  a: number
  span: number
  rise: number
}

export type ThrustAnalysis = {
  fit: CatenaryFit
  /** Sampled thrust line (centreline catenary). */
  points: CatenaryPoint[]
  /** True when every sample lies within ±thickness/6 of the geometric centreline. */
  withinMiddleThird: boolean
  /** Max |signed offset from centreline| along the local normal (m). */
  maxOffset: number
  /** Middle-third half-width = thickness/6 (m). */
  middleThirdHalf: number
}

const MM = 0.001

/**
 * Solve a · (cosh(half/a) − 1) = rise for a > 0.
 * Seeded by the shallow (parabola) approximation a ≈ L²/(8·rise).
 */
export function fitCatenary(span: number, rise: number): CatenaryFit {
  const L = Math.max(span, 1e-9)
  const h = Math.max(rise, 1e-9)
  const half = L / 2
  // Parabola seed; clamp so Newton stays in a safe basin.
  let a = Math.max((L * L) / (8 * h), h * 0.25)

  for (let i = 0; i < 48; i++) {
    const u = half / a
    const ch = Math.cosh(u)
    const sh = Math.sinh(u)
    const f = a * (ch - 1) - h
    // d/da [a(cosh(half/a)−1)] = cosh(u)−1 − u·sinh(u)
    const df = ch - 1 - u * sh
    if (Math.abs(df) < 1e-18) break
    const next = a - f / df
    if (!(next > 0) || !Number.isFinite(next)) break
    if (Math.abs(next - a) < 1e-14 * Math.max(1, a)) {
      a = next
      break
    }
    a = next
  }

  return { a, span: L, rise: h }
}

/** Height of the fitted inverted catenary at horizontal offset x from midspan. */
export function catenaryY(fit: CatenaryFit, x: number): number {
  const half = fit.span / 2
  return fit.a * (Math.cosh(half / fit.a) - Math.cosh(x / fit.a))
}

/** Sample the inverted catenary from left springing to right. */
export function sampleCatenary(fit: CatenaryFit, segments = 48): CatenaryPoint[] {
  const segs = Math.max(2, segments)
  const half = fit.span / 2
  const pts: CatenaryPoint[] = []
  for (let i = 0; i <= segs; i++) {
    const x = -half + (fit.span * i) / segs
    pts.push({ x, y: catenaryY(fit, x) })
  }
  return pts
}

/**
 * Max absolute error at the two springings and the crown (m).
 * Acceptance for H16.2: ≤ 1 mm.
 */
export function fitEndpointError(fit: CatenaryFit): number {
  const half = fit.span / 2
  const left = Math.abs(catenaryY(fit, -half) - 0)
  const right = Math.abs(catenaryY(fit, half) - 0)
  const crown = Math.abs(catenaryY(fit, 0) - fit.rise)
  return Math.max(left, right, crown)
}

export function fitPassesEndpoints(fit: CatenaryFit, tol = MM): boolean {
  return fitEndpointError(fit) <= tol
}

/** Meridian for a dome of revolution: rim (radius, 0) → crown (0, height). */
export function sampleCatenaryMeridian(
  radius: number,
  height: number,
  segments = 32,
): CatenaryPoint[] {
  const fit = fitCatenary(radius * 2, height)
  const segs = Math.max(2, segments)
  const pts: CatenaryPoint[] = []
  for (let i = 0; i <= segs; i++) {
    // i=0 at rim (x=+radius), i=segs at crown (x=0) — matches existing dome lathe order
    const t = i / segs
    const x = radius * (1 - t)
    pts.push({ x, y: catenaryY(fit, x) })
  }
  return pts
}

type ArchPoint = { x: number; y: number }

/** Inward (toward opening) unit normal for an upper L→R arch polyline. */
function inwardNormal(prev: ArchPoint, next: ArchPoint): { nx: number; ny: number } {
  const dx = next.x - prev.x
  const dy = next.y - prev.y
  const len = Math.hypot(dx, dy) || 1
  return { nx: dy / len, ny: -dx / len }
}

/**
 * Poleni's test: the self-weight thrust line is the inverted hanging chain fitted
 * to the arch centreline's own span and rise. It must stay within the middle third
 * of the ring (± thickness/6 from that centreline).
 */
export function analyseThrust(
  centreline: ArchPoint[],
  thickness: number,
  _span?: number,
  _rise?: number,
  segments = 48,
): ThrustAnalysis {
  const first = centreline[0]!
  const last = centreline[centreline.length - 1]!
  const span = Math.abs(last.x - first.x)
  const rise = Math.max(...centreline.map((p) => p.y))
  const midX = (first.x + last.x) / 2
  const fit = fitCatenary(span, rise)
  const raw = sampleCatenary(fit, segments)
  // Shift so the fitted chain shares the centreline's midspan (handles offset springings)
  const points = raw.map((p) => ({ x: p.x + midX, y: p.y }))
  const halfBand = Math.max(thickness, 1e-9) / 6
  let maxOffset = 0

  for (const p of points) {
    let best = centreline[0]!
    let bestD = Infinity
    let bestIdx = 0
    for (let i = 0; i < centreline.length; i++) {
      const c = centreline[i]!
      const d = Math.hypot(c.x - p.x, c.y - p.y)
      if (d < bestD) {
        bestD = d
        best = c
        bestIdx = i
      }
    }
    const prev = centreline[Math.max(0, bestIdx - 1)]!
    const next = centreline[Math.min(centreline.length - 1, bestIdx + 1)]!
    const { nx, ny } = inwardNormal(prev, next)
    const signed = (p.x - best.x) * nx + (p.y - best.y) * ny
    maxOffset = Math.max(maxOffset, Math.abs(signed))
  }

  return {
    fit,
    points,
    withinMiddleThird: maxOffset <= halfBand + 1e-9,
    maxOffset,
    middleThirdHalf: halfBand,
  }
}
