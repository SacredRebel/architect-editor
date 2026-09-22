import {
  type PlanSnapContribution,
  type PlanSnapSegment,
  registerPlanSnapProvider,
} from '@pascal-app/core'
import { getGeometryState } from './store'

let unsub: (() => void) | null = null

function contribution(): PlanSnapContribution | null {
  const { figures } = getGeometryState()
  if (figures.length === 0) return null
  const segments: PlanSnapSegment[] = []
  for (const fig of figures) {
    for (const poly of fig.figure.polylines) {
      for (let i = 0; i < poly.length - 1; i++) {
        const a = poly[i]!
        const b = poly[i + 1]!
        segments.push({ a: [a[0], a[1]], b: [b[0], b[1]] })
      }
    }
    for (const p of fig.figure.points ?? []) {
      // Point snap via degenerate segment (same priority as wall endpoints once within radius).
      segments.push({ a: [p[0], p[1]], b: [p[0], p[1]] })
    }
    for (const c of fig.figure.circles ?? []) {
      // Cardinal points on each arc for snap.
      for (const ang of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        const px = c.c[0] + c.r * Math.cos(ang)
        const pz = c.c[1] + c.r * Math.sin(ang)
        segments.push({ a: [px, pz], b: [px, pz] })
      }
    }
  }
  return segments.length ? { segments } : null
}

/** Install geometry-kit plan snap once. */
export function ensureGeometryPlanSnapInstalled(): void {
  if (!unsub) unsub = registerPlanSnapProvider(contribution)
}
