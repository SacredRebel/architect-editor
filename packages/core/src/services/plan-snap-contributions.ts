/**
 * External plan-snap contributions (e.g. Eco refGlb ghost silhouette).
 * Tools consult this after their built-in wall/grid snap.
 */

export type PlanSnapSegment = {
  /** Plan point A [x, z] in building-local / editor metres. */
  a: readonly [number, number]
  /** Plan point B [x, z]. */
  b: readonly [number, number]
}

export type PlanSnapHorizontal = {
  /** Floor/deck height in local Y metres. */
  y: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type PlanSnapContribution = {
  segments: readonly PlanSnapSegment[]
  horizontals?: readonly PlanSnapHorizontal[]
}

export type PlanSnapProvider = () => PlanSnapContribution | null

const providers = new Set<PlanSnapProvider>()

/** Register a provider; returns unsubscribe. */
export function registerPlanSnapProvider(provider: PlanSnapProvider): () => void {
  providers.add(provider)
  return () => {
    providers.delete(provider)
  }
}

export function clearPlanSnapProviders(): void {
  providers.clear()
}

function distPointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { dist: number; qx: number; qz: number } {
  const abx = bx - ax
  const abz = bz - az
  const len2 = abx * abx + abz * abz
  if (len2 < 1e-12) {
    const dx = px - ax
    const dz = pz - az
    return { dist: Math.hypot(dx, dz), qx: ax, qz: az }
  }
  let t = ((px - ax) * abx + (pz - az) * abz) / len2
  t = Math.max(0, Math.min(1, t))
  const qx = ax + abx * t
  const qz = az + abz * t
  return { dist: Math.hypot(px - qx, pz - qz), qx, qz }
}

/**
 * Snap a plan point to the nearest contributed segment within `radius` metres.
 * When `suspended` (modifier held), returns the input unchanged.
 */
export function snapToPlanContributions(
  point: readonly [number, number],
  options?: { radius?: number; suspended?: boolean },
): {
  point: [number, number]
  snapped: boolean
  /** Suggested local Y when over a contributed horizontal band. */
  y?: number
} {
  if (options?.suspended) return { point: [point[0], point[1]], snapped: false }
  const radius = options?.radius ?? 0.55
  let bestDist = radius
  let best: [number, number] | null = null

  let yHint: number | undefined
  let yBest = 0.35

  for (const provider of providers) {
    const contrib = provider()
    if (!contrib) continue
    for (const seg of contrib.segments) {
      const { dist, qx, qz } = distPointToSegment(
        point[0],
        point[1],
        seg.a[0],
        seg.a[1],
        seg.b[0],
        seg.b[1],
      )
      if (dist < bestDist) {
        bestDist = dist
        best = [qx, qz]
      }
    }
    for (const band of contrib.horizontals ?? []) {
      if (
        point[0] >= band.minX - radius &&
        point[0] <= band.maxX + radius &&
        point[1] >= band.minZ - radius &&
        point[1] <= band.maxZ + radius
      ) {
        // Prefer bands whose plan footprint contains the point; else nearest by Y later.
        const inside =
          point[0] >= band.minX &&
          point[0] <= band.maxX &&
          point[1] >= band.minZ &&
          point[1] <= band.maxZ
        const score = inside ? 0 : radius
        if (score <= yBest) {
          yBest = score
          yHint = band.y
        }
      }
    }
  }

  if (!best) return { point: [point[0], point[1]], snapped: false, y: yHint }
  return { point: best, snapped: true, y: yHint }
}
