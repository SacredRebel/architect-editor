/**
 * H19.2b — the adaptive-dpr decision, driven by GPU render time.
 *
 * The loop it replaces judged speed from its own requestAnimationFrame interval,
 * which is the display's refresh rate, so it always read "fast" and climbed to
 * the tier cap whatever the GPU cost. This decides from two measured inputs:
 *   - the device's render time per frame (three's timestamp queries), against
 *     the frame budget (1000 / maxFps);
 *   - the achieved render cadence (time between rendered frames). Render-pass
 *     timestamps do not see presentation and compositing, which grow with the
 *     canvas; at 2x density the frame can miss the cap with render time well
 *     under budget. Missing the cap while render time is a large share of the
 *     frame period means the GPU is the bottleneck, and fewer pixels help.
 *
 * Pure and stateful per instance so it can be driven by a check with forged
 * samples; the component only feeds it and applies the result.
 */

export type DprControllerOptions = {
  /** Highest dpr allowed: min(tier cap, devicePixelRatio) — the H19.2a clamp. */
  ceiling: number
  /** Lowest dpr allowed. */
  floor?: number
  /** Frame budget in ms (1000 / the frame cap). */
  budgetMs: number
  /** dpr change per decision. */
  step?: number
  /** Samples per decision. */
  windowSize?: number
  /** Samples ignored after a change: the resize reallocates targets. */
  settleSamples?: number
  /** Step down when the median render time exceeds this share of the budget. */
  downAt?: number
  /** Step up only if the render time predicted at the next dpr stays under this share. */
  upAt?: number
  /** Frames count as missing the cap when the mean interval exceeds budget by this factor. */
  missAt?: number
  /** ...and as GPU-bound when render time is at least this share of the interval. */
  gpuShare?: number
}

export type DprController = {
  readonly dpr: number
  /** The dpr range this controller moves in; equal ends mean it cannot move. */
  readonly ceiling: number
  readonly floor: number
  /**
   * Feed one render-time sample (ms) and the interval of the frame it belongs
   * to (ms between rendered frames; omit when unknown). Returns the new dpr
   * when it changes.
   */
  sample(renderMs: number, intervalMs?: number): number | null
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

const round2 = (value: number) => Math.round(value * 100) / 100

export function createDprController({
  ceiling,
  floor = 1,
  budgetMs,
  step = 0.25,
  windowSize = 30,
  settleSamples = 15,
  downAt = 0.8,
  upAt = 0.5,
  missAt = 1.1,
  gpuShare = 0.4,
}: DprControllerOptions): DprController {
  const top = Math.max(floor, ceiling)
  let dpr = top
  let renders: number[] = []
  let intervals: number[] = []
  let skip = 0

  return {
    get dpr() {
      return dpr
    },
    ceiling: top,
    floor,
    sample(renderMs: number, intervalMs?: number) {
      if (!Number.isFinite(renderMs) || renderMs <= 0) return null
      if (skip > 0) {
        skip--
        return null
      }
      renders.push(renderMs)
      if (typeof intervalMs === 'number' && Number.isFinite(intervalMs) && intervalMs > 0) {
        intervals.push(intervalMs)
      }
      if (renders.length < windowSize) return null
      const gpu = median(renders)
      const cadence = intervals.length
        ? intervals.reduce((sum, v) => sum + v, 0) / intervals.length
        : budgetMs
      renders = []
      intervals = []

      const missing = cadence > missAt * budgetMs
      const gpuBound = gpu >= gpuShare * cadence
      let next = dpr
      if (dpr > floor && (gpu > downAt * budgetMs || (missing && gpuBound))) {
        next = Math.max(floor, round2(dpr - step))
      } else if (dpr < top && !missing) {
        const up = Math.min(top, round2(dpr + step))
        // Render cost scales with pixel count, i.e. with dpr squared.
        const predicted = gpu * (up / dpr) ** 2
        if (predicted < upAt * budgetMs) next = up
      }
      if (next === dpr) return null
      dpr = next
      skip = settleSamples
      return dpr
    },
  }
}
