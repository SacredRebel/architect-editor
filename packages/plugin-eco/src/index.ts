import type { Plugin } from '@pascal-app/core'

/**
 * Eco world-bridge plugin. E0 only registers an empty manifest; later phases
 * add the postMessage contract, site overlay, user assets, walk, and GLB export.
 */
export const ecoPlugin: Plugin = {
  id: 'eco:plugin-eco',
  apiVersion: 1,
}

if (typeof console !== 'undefined') {
  console.info('eco: plugin registered')
}
