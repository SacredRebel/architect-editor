/**
 * Eco embed / static-export capability flags.
 *
 * `NEXT_PUBLIC_ECO_STATIC=1` is baked in at `build:static` time so client
 * code can skip server scene APIs without probing. Embed detection is
 * runtime-only (iframe vs top window).
 */

export const isEcoStaticClient = process.env.NEXT_PUBLIC_ECO_STATIC === '1'

/** Public asset prefix for static embed builds (`/builder` by default). */
export const ecoAssetPrefix = isEcoStaticClient
  ? (process.env.NEXT_PUBLIC_ECO_BASE_PATH || '/builder').replace(/\/$/, '')
  : ''

export function ecoPublicPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  // The static build rebases root-relative literals onto the base path, so a
  // path may already carry it.
  if (
    ecoAssetPrefix &&
    (normalized === ecoAssetPrefix || normalized.startsWith(`${ecoAssetPrefix}/`))
  ) {
    return normalized
  }
  return `${ecoAssetPrefix}${normalized}`
}

export function isSceneServerAvailable(): boolean {
  return !isEcoStaticClient
}

export function detectEcoEmbedded(): boolean {
  if (typeof window === 'undefined') return false
  const embedded = window.self !== window.top
  ;(window as Window & { ecoEmbedded?: boolean }).ecoEmbedded = embedded
  return embedded
}

export function isEcoEmbedded(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as Window & { ecoEmbedded?: boolean }).ecoEmbedded)
}
