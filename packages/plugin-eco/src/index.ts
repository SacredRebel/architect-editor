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
  setShowEnvelope,
  setShowGhost,
  subscribeEcoSite,
} from './eco-site-store'
export {
  ecoAssetsHostPanel,
  ecoConstructionHostPanel,
  ecoDrawingsHostPanel,
  ecoHostPanel,
  ecoImage3dHostPanel,
  ecoMaterialsHostPanel,
  ecoMinimalHostPanel,
  ecoOrganicHostPanel,
  ecoPresentation,
  ecoShellHostPanel,
} from './eco-ui'
export { exportEcoGlb, stampGlbExtras, stampWalkExtras } from './export-glb'
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
  getLeafShellParams,
  makeDefaultLeafShell,
  removeEcoShell,
  setEcoShells,
  setLeafShellParams,
  setShellRise,
  subscribeEcoShells,
  updateEcoShell,
} from './eco-shell-store'
export type { EcoShell, LeafShellParams } from './eco-shell-store'
export {
  addEcoCatenary,
  addEcoLoft,
  addEcoMinimal,
  addEcoVault,
  clearEcoOrganic,
  getEcoOrganicState,
  makeDefaultBarrelVault,
  makeDefaultCatenary,
  makeDefaultLeafLoft,
  subscribeEcoOrganic,
  updateEcoCatenary,
  updateEcoLoft,
  updateEcoVault,
} from './eco-organic-store'
export {
  cleanSpec,
  ORGANIC_DEFAULTS,
  parseOrganicWords,
} from './eco-organic-spec'
export type { OrganicSpec } from './eco-organic-spec'
export { organicPlan, organicShellHeight, solarSpots } from './eco-organic-plan'
export {
  addMinimalFromClosedCurve,
  addSmoothWall,
  applyOrganicWords,
  clearEcoOrganicBuildings,
  generateOrganicBuilding,
  getEcoOrganicBuildingState,
  restoreOrganicBuildings,
  serializeOrganicBuildings,
  subscribeEcoOrganicBuilding,
  undoEcoOrganicBuilding,
  updateOrganicSpecField,
} from './eco-organic-building-store'
export {
  formatArea,
  formatLength,
  parseLengthInput,
  computeAnsiAreas,
  snapAngleDeg,
} from './eco-true-size'
export {
  makeDemoSmoothWall,
  sampleSmoothWall,
  smoothWallLength,
  bulgeSmoothWall,
} from './eco-smooth-wall'
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
export {
  ECO_DEFAULT_LAT,
  ECO_DEFAULT_LNG,
  ECO_DEFAULT_TZ,
  instantAt,
  solarPosition,
  sunDirectionAt,
  sunPosition,
  sunVector,
} from './eco-site-sun'
export {
  ECO_BASE_EXPOSURE,
  ECO_SUNLIGHT_AIR,
  EcoSky,
} from './eco-site-sky'
export { EcoSiteLighting } from './eco-site-lighting'
export {
  exportEcoScenePayload,
  restoreEcoSceneExtras,
  roundTripEcoScenePayload,
  stableStringifyEcoScene,
} from './eco-scene'
export type { EcoScenePayload } from './eco-scene'
export {
  ecoConstructionCsv,
  getEcoJurisdiction,
  polygonAreaM2,
  runEcoConstructionTakeoff,
} from './eco-construction'
export type {
  EcoConstructionResult,
  EcoConstructionRow,
  EcoJurisdictionProfile,
  TakeoffBasis,
} from './eco-construction'
export { VENTURA_COUNTY_JURISDICTION } from './eco-jurisdiction-ventura'
export { deriveBuildableEnvelope, classifyEdgeRoles } from './envelope/buildable-envelope'
export type { BuildableEnvelope, EdgeRole, Point2D } from './envelope/buildable-envelope'
export { VENTURA_ENVELOPE } from './envelope/ventura-envelope'
export { EcoBuildableEnvelope } from './eco-buildable-envelope'
export {
  IMAGE3D_BANNED_IDS,
  IMAGE3D_DEFAULT_TIER,
  IMAGE3D_MODELS,
  IMAGE3D_PREVIEW,
  IMAGE3D_QUALITY_FIRST_PICK,
  IMAGE3D_SCOPE_NOTE,
  IMAGE3D_WIRE_FIRST,
  DeferredImage3dBackend,
  createImage3dBackend,
  image3dModelById,
  image3dModelForTier,
  isBannedImage3dId,
} from './eco-image3d'
export type {
  Image3dBackend,
  Image3dBackendStatus,
  Image3dInput,
  Image3dKnownDimension,
  Image3dModelDef,
  Image3dModelId,
  Image3dResult,
  Image3dTier,
} from './eco-image3d'
export {
  applyGroundSeat,
  applyUniformScale,
  applyZForwardToWorldZSouth,
  guessServiceHeightM,
  measureGlbAabb,
  measureGlbExtents,
  prepareImage3dGlb,
  scaleFactorForKnownDimension,
} from './eco-image3d-export'
export type {
  Image3dExportOptions,
  Image3dExportResult,
  Image3dSourceFrame,
} from './eco-image3d-export'
export {
  ATLAS_IMAGE_LONG_SIDE_PX,
  ATLAS_IMAGE_MAX_CHARS,
  ATLAS_PART_MAX_BYTES,
  ATLAS_POLL_MS,
  AtlasImage3dClient,
  AtlasImage3dError,
  ECO_ATLAS_BASE,
  createAtlasImage3dClient,
  joinGlbParts,
  shrinkImageToDataUri,
} from './eco-atlas-image3d'
export type {
  AtlasImage3dConfig,
  AtlasImage3dKind,
  AtlasImage3dStatus,
  AtlasImage3dStatusResult,
} from './eco-atlas-image3d'
export {
  IMAGE3D_EXPORT_MAX_BYTES,
  IMAGE3D_EXPORT_MAX_TEX_DIM,
  IMAGE3D_FORBIDDEN_EXTENSIONS,
  assertImage3dExportBudget,
  enforceImage3dExportBudget,
} from './eco-image3d-budget'
export {
  assetRole,
  clearEcoAssets,
  placementsExcludedFromWalkExport,
} from './eco-assets-store'
export type { EcoAssetRole } from './eco-assets-store'
export { isExcludedFromWalkExport } from './export-glb'
