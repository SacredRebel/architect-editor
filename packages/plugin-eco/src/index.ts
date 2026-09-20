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
export { ecoAssetsHostPanel, ecoDrawingsHostPanel, ecoHostPanel, ecoMaterialsHostPanel, ecoPresentation } from './eco-ui'
export { exportEcoGlb, stampWalkExtras } from './export-glb'
export {
  assertHardGlbAudit,
  auditGlb,
  ECO_GLB_MAX_BYTES,
  ECO_GLB_MAX_EXTENT_M,
  ECO_GLB_MAX_TEX_DIM,
  ECO_GLB_MIN_EXTENT_M,
  formatByteSize,
  formatExportSizeLabel,
} from './glb-audit'
export { optimiseGlb } from './glb-optimise'
export type { OptimiseProfile } from './glb-optimise'
export {
  getEcoExportState,
  resetEcoExportState,
  setEcoExportState,
  subscribeEcoExport,
} from './eco-export-store'
export type { EcoExportUiState } from './eco-export-store'
export {
  buildEcoWalk,
  ECO_CURVE_WALK_TOLERANCE_M,
  ECO_WALK_FLOOR_INSET_M,
  ECO_WALK_SOLID_OUTSET_M,
  ECO_WALL_SAMPLE_STEP_M,
} from './export-walk'
export {
  makeDefaultParamBox,
  paramBoxToNodes,
  paramBoxWalk,
  paramBoxWorldFloorExtents,
  updateEcoParamBox,
  addEcoParamBox,
  clearEcoParamBoxes,
  getEcoParamBoxesState,
  setEcoParamBoxes,
  subscribeEcoParamBoxes,
} from './eco-param-box'
export type { EcoParamBox } from './eco-param-box'
export {
  addEcoShell,
  clearEcoShells,
  getEcoShellsState,
  makeDefaultLeafShell,
  removeEcoShell,
  setEcoShells,
  setShellRise,
  subscribeEcoShells,
  updateEcoShell,
} from './eco-shell-store'
export type { EcoShell } from './eco-shell-store'
export {
  addEcoCatenary,
  addEcoLoft,
  addEcoVault,
  clearEcoOrganic,
  getEcoOrganicState,
  makeDefaultBarrelVault,
  makeDefaultCatenary,
  makeDefaultLeafLoft,
  subscribeEcoOrganic,
} from './eco-organic-store'
export { tessellateLoft } from './eco-loft'
export type { EcoLoft } from './eco-loft'
export { tessellateVault } from './eco-vault'
export type { EcoVault } from './eco-vault'
export { ECO_TREE_IMPOSTOR_DISTANCE_M, EcoTrees } from './eco-trees'
export {
  ECO_TREE_VARIANT_IDS,
  ECO_TREE_VARIANTS,
  addEcoTree,
  clearEcoTrees,
  getEcoTreesState,
  makeEcoTreePlacement,
  removeEcoTree,
  setEcoTrees,
  subscribeEcoTrees,
} from './eco-trees-store'
export type { EcoTreePlacement, EcoTreeVariantId } from './eco-trees-store'
export {
  ECO_MATERIALS,
  createEcoThreeMaterial,
  ecoMaterialById,
  getEcoMaterialsState,
  resetEcoMaterialsState,
  resolveEcoMaterialId,
  setEcoMaterialAssignment,
  setEcoMaterialDefaults,
  subscribeEcoMaterials,
} from './eco-materials'
export type { EcoMaterialDef, EcoMaterialId } from './eco-materials'
export {
  getEcoPresentationState,
  setEcoPresentation,
  setEcoTimeOfDayHours,
  subscribeEcoPresentation,
  toggleEcoPresentation,
} from './eco-presentation-store'
export { solarPosition, sunDirectionAt } from './eco-site-sun'
export { EcoSiteLighting } from './eco-site-lighting'
export {
  exportEcoScenePayload,
  restoreEcoSceneExtras,
  roundTripEcoScenePayload,
  stableStringifyEcoScene,
} from './eco-scene'
export type { EcoScenePayload } from './eco-scene'
