/**
 * H17.1 — GPU quality tier via detect-gpu (MIT, already pulled in via drei).
 * Auto-detect once; owner can override via viewer preferences.
 */
import { getGPUTier, type ModelEntry } from 'detect-gpu'

// detect-gpu fetches its benchmark tables from unpkg.com by default. Load them
// from the app's own bundle instead (lazy chunks), so the editor makes no
// request outside its own origin and base path (A4).
const BENCHMARKS: Record<string, () => Promise<{ default: unknown }>> = {
  'd-adreno.json': () => import('detect-gpu/dist/benchmarks/d-adreno.json'),
  'd-amd.json': () => import('detect-gpu/dist/benchmarks/d-amd.json'),
  'd-apple.json': () => import('detect-gpu/dist/benchmarks/d-apple.json'),
  'd-geforce.json': () => import('detect-gpu/dist/benchmarks/d-geforce.json'),
  'd-intel.json': () => import('detect-gpu/dist/benchmarks/d-intel.json'),
  'd-nvidia.json': () => import('detect-gpu/dist/benchmarks/d-nvidia.json'),
  'd-radeon.json': () => import('detect-gpu/dist/benchmarks/d-radeon.json'),
  'm-adreno.json': () => import('detect-gpu/dist/benchmarks/m-adreno.json'),
  'm-apple-ipad.json': () => import('detect-gpu/dist/benchmarks/m-apple-ipad.json'),
  'm-apple.json': () => import('detect-gpu/dist/benchmarks/m-apple.json'),
  'm-intel.json': () => import('detect-gpu/dist/benchmarks/m-intel.json'),
  'm-mali-t.json': () => import('detect-gpu/dist/benchmarks/m-mali-t.json'),
  'm-mali.json': () => import('detect-gpu/dist/benchmarks/m-mali.json'),
  'm-nvidia.json': () => import('detect-gpu/dist/benchmarks/m-nvidia.json'),
  'm-powervr.json': () => import('detect-gpu/dist/benchmarks/m-powervr.json'),
  'm-samsung.json': () => import('detect-gpu/dist/benchmarks/m-samsung.json'),
}

async function loadBenchmarks(file: string): Promise<ModelEntry[]> {
  const load = BENCHMARKS[file]
  if (!load) throw new Error(`detect-gpu benchmark not bundled: ${file}`)
  return (await load()).default as ModelEntry[]
}

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
      const tier = await getGPUTier({ override: { loadBenchmarks } })
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

export function resolveGpuQuality(
  preference: GpuQualityPreference,
  auto: GpuQuality | null,
): GpuQuality {
  if (preference !== 'auto') return preference
  return auto ?? 'medium'
}
