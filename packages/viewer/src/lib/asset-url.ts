import { loadAssetUrl } from '@pascal-app/core'

export const ASSETS_CDN_URL = process.env.NEXT_PUBLIC_ASSETS_CDN_URL || 'https://editor.pascal.app'

// A4 — a static build served under a base path (the world's /builder) resolves
// app-relative assets on its own origin under that base, not on a CDN, unless a
// CDN is set explicitly. Paths that already carry the base (the static build
// rebases root-relative literals) are left as they are.
const STATIC_BASE =
  process.env.NEXT_PUBLIC_ECO_STATIC === '1' && !process.env.NEXT_PUBLIC_ASSETS_CDN_URL
    ? (process.env.NEXT_PUBLIC_ECO_BASE_PATH || '/builder').replace(/\/+$/, '')
    : null

function appRelativeUrl(url: string): string {
  const normalizedPath = url.startsWith('/') ? url : `/${url}`
  if (STATIC_BASE === null) return `${ASSETS_CDN_URL}${normalizedPath}`
  if (normalizedPath === STATIC_BASE || normalizedPath.startsWith(`${STATIC_BASE}/`))
    return normalizedPath
  return `${STATIC_BASE}${normalizedPath}`
}

/**
 * Resolves an asset URL to the appropriate format:
 * - If URL starts with http:// or https://, return as-is (external URL)
 * - If URL starts with asset://, resolve from IndexedDB storage
 * - If URL starts with /, prepend CDN URL (absolute path)
 * - Otherwise, prepend CDN URL (relative path)
 */
export async function resolveAssetUrl(url: string | undefined | null): Promise<string | null> {
  if (!url) return null

  // External URL - use as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  // IndexedDB asset - resolve from storage
  if (url.startsWith('asset://')) {
    return loadAssetUrl(url)
  }

  // Absolute or relative path - the CDN, or this build's own base path
  return appRelativeUrl(url)
}

/**
 * Synchronous version for URLs that don't need IndexedDB resolution
 * Only use this if you're sure the URL is not an asset:// URL
 */
export function resolveCdnUrl(url: string | undefined | null): string | null {
  if (!url) return null

  // External URL - use as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  // Don't use this for asset:// URLs - use resolveAssetUrl instead
  if (url.startsWith('asset://')) {
    console.warn('Use resolveAssetUrl() for asset:// URLs, not resolveCdnUrl()')
    return null
  }

  // Absolute or relative path - the CDN, or this build's own base path
  return appRelativeUrl(url)
}
