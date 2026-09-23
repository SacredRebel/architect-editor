/**
 * H17.1 — GPU quality tier via detect-gpu (MIT, already pulled in via drei).
 * Auto-detect once; owner can override via viewer preferences.
 */
import { getGPUTier } from 'detect-gpu'

export type GpuQuality = 'high' | 'medium' | 'low'

export type GpuQualityPreference = GpuQuality | 'auto'

const TIER_TO_QUALITY: Record<number, GpuQuality> = {
  0: 'low',
  1: 'low',
  2: 'medium',
  3: 'high',
}

/** DPR caps — hard ceiling 2 per H17.1 brief. */
export function maxDprForQuality(quality: GpuQuality, coarsePointer: boolean): number {
  if (coarsePointer) {
    return quality === 'high' ? 1.25 : 1
  }
  switch (quality) {
    case 'high':
      return 2
    case 'medium':
      return 1.5
    case 'low':
      return 1
  }
}

/** Shadow map edge length by tier. */
export function shadowMapSizeForQuality(quality: GpuQuality): number {
  switch (quality) {
    case 'high':
      return 2048
    case 'medium':
      return 1024
    case 'low':
      return 512
  }
}

let detected: GpuQuality | null = null
let detecting: Promise<GpuQuality> | null = null

export function peekDetectedGpuQuality(): GpuQuality | null {
  return detected
}

export async function detectGpuQuality(): Promise<GpuQuality> {
  if (detected) return detected
  if (detecting) return detecting
  detecting = (async () => {
    try {
      const tier = await getGPUTier()
      const q = TIER_TO_QUALITY[tier.tier ?? 1] ?? 'medium'
      detected = q
      return q
    } catch {
      detected = 'medium'
      return detected
    } finally {
      detecting = null
    }
  })()
  return detecting
}

export function resolveGpuQuality(preference: GpuQualityPreference, auto: GpuQuality | null): GpuQuality {
  if (preference !== 'auto') return preference
  return auto ?? 'medium'
}
