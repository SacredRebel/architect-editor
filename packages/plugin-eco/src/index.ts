import type { Plugin } from '@pascal-app/core'

/**
 * Eco world-bridge plugin. E0 registers the manifest; E2 installs the
 * postMessage bridge; E3 applies site terrain + overlays.
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

export { applyEcoSite, terrainFieldFromEcoSite } from './apply-site'
export {
  CAPS,
  installEcoBridge,
  isEcoBridgeReady,
  requestEcoClose,
  requestEcoGlbExport,
} from './bridge'
export type { EcoMsg, EcoSite, EcoWalk } from './bridge-types'
export { roundTripSiteXz, siteToWorldXz, worldToSiteXz } from './coords'
export { EcoExitButton } from './eco-exit-button'
export {
  getEcoSiteState,
  setEcoSite,
  setGuideVisible,
  setShowCompass,
  setShowGhost,
  subscribeEcoSite,
} from './eco-site-store'
export { ecoAssetsHostPanel, ecoHostPanel, ecoPresentation } from './eco-ui'
export { exportEcoGlb, stampWalkExtras } from './export-glb'
export { buildEcoWalk } from './export-walk'
