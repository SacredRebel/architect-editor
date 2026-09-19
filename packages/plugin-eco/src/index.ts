import type { Plugin } from '@pascal-app/core'

/**
 * Eco world-bridge plugin. E0 registers the manifest; E2 installs the
 * postMessage bridge. Later phases add site overlay, assets, walk, and GLB export.
 */
export const ecoPlugin: Plugin = {
  id: 'eco:plugin-eco',
  apiVersion: 1,
}

if (typeof console !== 'undefined') {
  console.info('eco: plugin registered')
}

if (typeof window !== 'undefined') {
  void import('./bridge').then(({ installEcoBridge }) => {
    installEcoBridge()
  })
}

export { installEcoBridge, isEcoBridgeReady, requestEcoClose } from './bridge'
export type { EcoMsg, EcoSite, EcoWalk } from './bridge-types'
export { roundTripSiteXz, siteToWorldXz, worldToSiteXz } from './coords'
export { EcoExitButton } from './eco-exit-button'
