import {
  type PlanSnapContribution,
  type PlanSnapSegment,
  registerPlanSnapProvider,
} from '@pascal-app/core'
import { siteToWorldXz } from './coords'
import { getEcoSiteState, subscribeEcoSite } from './eco-site-store'

let meshContribution: PlanSnapContribution | null = null
let unsubProvider: (() => void) | null = null
let unsubSite: (() => void) | null = null

function guideContribution(): PlanSnapContribution | null {
  const { site, showGhost } = getEcoSiteState()
  if (!site || !showGhost) return null
  const segments: PlanSnapSegment[] = []
  for (const guide of site.guides) {
    if (
      guide.kind !== 'massing-outline' &&
      guide.kind !== 'footprint' &&
      guide.kind !== 'boundary'
    ) {
      continue
    }
    for (let i = 0; i < guide.pts.length - 1; i++) {
      const a = siteToWorldXz(guide.pts[i]!)
      const b = siteToWorldXz(guide.pts[i + 1]!)
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-4) continue
      segments.push({ a, b })
    }
  }
  if (segments.length === 0 && !meshContribution) return null
  return {
    segments: [...segments, ...(meshContribution?.segments ?? [])],
    horizontals: meshContribution?.horizontals,
  }
}

function combined(): PlanSnapContribution | null {
  const fromGuides = guideContribution()
  if (fromGuides) return fromGuides
  const { showGhost } = getEcoSiteState()
  if (!showGhost) return null
  return meshContribution
}

/** Publish plan edges extracted from the loaded refGlb mesh. */
export function setEcoGhostMeshSnap(contribution: PlanSnapContribution | null): void {
  meshContribution = contribution
}

/**
 * Install the Eco plan-snap provider once (guides + optional GLB silhouette).
 * Call from the eco presentation mount.
 */
export function ensureEcoPlanSnapInstalled(): void {
  if (!unsubProvider) {
    unsubProvider = registerPlanSnapProvider(combined)
  }
  if (!unsubSite) {
    unsubSite = subscribeEcoSite(() => {
      // provider reads live store; no cache to bust
    })
  }
}
