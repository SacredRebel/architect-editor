/**
 * Eco bridge / harness debug logging.
 * Enable with `?ecoDebug=1` on the embed URL or `localStorage.setItem('eco:debug','1')`.
 */
export function isEcoDebug(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.localStorage?.getItem('eco:debug') === '1') return true
  } catch {
    // ignore
  }
  try {
    return new URLSearchParams(window.location.search).get('ecoDebug') === '1'
  } catch {
    return false
  }
}

export function ecoDebug(...args: unknown[]): void {
  if (!isEcoDebug()) return
  console.info('[eco:bridge]', ...args)
}

export function ecoDebugWarn(...args: unknown[]): void {
  if (!isEcoDebug()) return
  console.warn('[eco:bridge]', ...args)
}
