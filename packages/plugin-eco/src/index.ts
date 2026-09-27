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
export type { EcoAssetRole } from './eco-assets-store'
export {
  assetRole,
  clearEcoAssets,
  placementsExcludedFromWalkExport,
} from './eco-assets-store'
export type {
  AtlasImage3dConfig,
  AtlasImage3dKind,
  AtlasImage3dStatus,
  AtlasImage3dStatusResult,
} from './eco-atlas-image3d'
export {
  ATLAS_IMAGE_LONG_SIDE_PX,
  ATLAS_IMAGE_MAX_CHARS,
  ATLAS_PART_MAX_BYTES,
  ATLAS_POLL_MS,
  AtlasImage3dClient,
  AtlasImage3dError,
  createAtlasImage3dClient,
  ECO_ATLAS_BASE,
  joinGlbParts,
  shrinkImageToDataUri,
} from './eco-atlas-image3d'
export { EcoBuildableEnvelope } from './eco-buildable-envelope'
export type {
  EcoConstructionResult,
  EcoConstructionRow,
  EcoJurisdictionProfile,
  TakeoffBasis,
} from './eco-construction'
export {
  ecoConstructionCsv,
  getEcoJurisdiction,
  polygonAreaM2,
  runEcoConstructionTakeoff,
} from './eco-construction'
export { EcoExitButton } from './eco-exit-button'
export type { EcoExportUiState } from './eco-export-store'
export {
  getEcoExportState,
  resetEcoExportState,
  setEcoExportState,
  subscribeEcoExport,
} from './eco-export-store'
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
  createImage3dBackend,
  DeferredImage3dBackend,
  IMAGE3D_BANNED_IDS,
  IMAGE3D_DEFAULT_TIER,
  IMAGE3D_MODELS,
  IMAGE3D_PREVIEW,
  IMAGE3D_QUALITY_FIRST_PICK,
  IMAGE3D_SCOPE_NOTE,
  IMAGE3D_WIRE_FIRST,
  image3dModelById,
  image3dModelForTier,
  isBannedImage3dId,
} from './eco-image3d'
export {
  assertImage3dExportBudget,
  enforceImage3dExportBudget,
  IMAGE3D_EXPORT_MAX_BYTES,
  IMAGE3D_EXPORT_MAX_TEX_DIM,
  IMAGE3D_FORBIDDEN_EXTENSIONS,
} from './eco-image3d-budget'
export type {
  Image3dExportOptions,
  Image3dExportResult,
  Image3dSourceFrame,
} from './eco-image3d-export'
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
export { VENTURA_COUNTY_JURISDICTION } from './eco-jurisdiction-ventura'
export type { EcoLoft } from './eco-loft'
export { tessellateLoft } from './eco-loft'
export type { EcoMaterialDef, EcoMaterialId } from './eco-materials'
export {
  createEcoThreeMaterial,
  ECO_MATERIALS,
  ecoMaterialById,
  getEcoMaterialsState,
  resetEcoMaterialsState,
  resolveEcoMaterialId,
  setEcoMaterialAssignment,
  setEcoMaterialDefaults,
  subscribeEcoMaterials,
} from './eco-materials'
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
export { organicPlan, organicShellHeight, solarSpots } from './eco-organic-plan'
export type { OrganicSpec } from './eco-organic-spec'
export {
  cleanSpec,
  ORGANIC_DEFAULTS,
  parseOrganicWords,
} from './eco-organic-spec'
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
export type { EcoParamBox } from './eco-param-box'
export {
  addEcoParamBox,
  clearEcoParamBoxes,
  getEcoParamBoxesState,
  makeDefaultParamBox,
  paramBoxToNodes,
  paramBoxWalk,
  paramBoxWorldFloorExtents,
  setEcoParamBoxes,
  subscribeEcoParamBoxes,
  updateEcoParamBox,
} from './eco-param-box'
export {
  getEcoPresentationState,
  setEcoPresentation,
  setEcoTimeOfDayHours,
  subscribeEcoPresentation,
  toggleEcoPresentation,
} from './eco-presentation-store'
export type { EcoScenePayload } from './eco-scene'
export {
  exportEcoScenePayload,
  restoreEcoSceneExtras,
  roundTripEcoScenePayload,
  stableStringifyEcoScene,
} from './eco-scene'
export type { EcoShell, LeafShellParams } from './eco-shell-store'
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
export { EcoSiteLighting } from './eco-site-lighting'
export {
  ECO_BASE_EXPOSURE,
  ECO_SUNLIGHT_AIR,
  EcoSky,
} from './eco-site-sky'
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
  bulgeSmoothWall,
  makeDemoSmoothWall,
  sampleSmoothWall,
  smoothWallLength,
} from './eco-smooth-wall'
export { ECO_TREE_IMPOSTOR_DISTANCE_M, EcoTrees } from './eco-trees'
export type { EcoTreePlacement, EcoTreeVariantId } from './eco-trees-store'
export {
  addEcoTree,
  clearEcoTrees,
  ECO_TREE_VARIANT_IDS,
  ECO_TREE_VARIANTS,
  getEcoTreesState,
  makeEcoTreePlacement,
  removeEcoTree,
  setEcoTrees,
  subscribeEcoTrees,
} from './eco-trees-store'
export {
  computeAnsiAreas,
  formatArea,
  formatLength,
  parseLengthInput,
  snapAngleDeg,
} from './eco-true-size'
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
export type { EcoVault } from './eco-vault'
export { tessellateVault } from './eco-vault'
export type { BuildableEnvelope, EdgeRole, Point2D } from './envelope/buildable-envelope'
export { classifyEdgeRoles, deriveBuildableEnvelope } from './envelope/buildable-envelope'
export { VENTURA_ENVELOPE } from './envelope/ventura-envelope'
export {
  exportEcoGlb,
  isExcludedFromWalkExport,
  stampGlbExtras,
  stampWalkExtras,
} from './export-glb'
export {
  buildEcoWalk,
  ECO_CURVE_WALK_TOLERANCE_M,
  ECO_WALK_FLOOR_INSET_M,
  ECO_WALK_SOLID_OUTSET_M,
  ECO_WALL_SAMPLE_STEP_M,
} from './export-walk'
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
export type { OptimiseProfile } from './glb-optimise'
export { optimiseGlb } from './glb-optimise'
