import type { AnyNodeDefinition, Plugin } from '@pascal-app/core'
import { hsColumnDefinition } from './definition'
import { hsArchDefinition } from './kinds/hs-arch/definition'
import { hsDomeDefinition } from './kinds/hs-dome/definition'
import { hsPendentiveDefinition } from './kinds/hs-pendentive/definition'
import { hsPierDefinition } from './kinds/hs-pier/definition'

/**
 * Hagia Sophia ground-floor plugin — geometry-only structural kinds plus pure
 * generate/refine helpers for deterministic colonnade placement.
 */
export const hagiaSophiaPlugin: Plugin = {
  id: 'pascal:hagia-sophia',
  apiVersion: 1,
  nodes: [
    hsColumnDefinition as unknown as AnyNodeDefinition,
    hsArchDefinition as unknown as AnyNodeDefinition,
    hsDomeDefinition as unknown as AnyNodeDefinition,
    hsPendentiveDefinition as unknown as AnyNodeDefinition,
    hsPierDefinition as unknown as AnyNodeDefinition,
  ],
}

export { hsColumnDefinition } from './definition'
export type {
  DomeAxisNodeSpec,
  DomeAxisParams,
  GalleryParams,
  GeneratorParams,
} from './generate'
export {
  generateArcadeArches,
  generateDomeAxis,
  generateGalleries,
  generateGreatArches,
  generateGroundFloor,
  generateSemiDomes,
  generateVaults,
} from './generate'
export { hsArchDefinition } from './kinds/hs-arch/definition'
export type { HsArchProfileType } from './kinds/hs-arch/schema'
export { HsArchNode, HsArchProfileTypeSchema } from './kinds/hs-arch/schema'
export { hsDomeDefinition } from './kinds/hs-dome/definition'
export { HsDomeNode } from './kinds/hs-dome/schema'
export { hsPendentiveDefinition } from './kinds/hs-pendentive/definition'
export type { HsPendentiveQuadrant } from './kinds/hs-pendentive/schema'
export { HsPendentiveNode, HsPendentiveQuadrantSchema } from './kinds/hs-pendentive/schema'
export { hsPierDefinition } from './kinds/hs-pier/definition'
export { HsPierNode } from './kinds/hs-pier/schema'
export { DOME_AXIS_CONSTANTS, GALLERY_CONSTANTS, GALLERY_FLOOR_H } from './math/constants'
export type { CatenaryFit, ThrustAnalysis } from './math/catenary'
export {
  analyseThrust,
  catenaryY,
  fitCatenary,
  fitEndpointError,
  fitPassesEndpoints,
  sampleCatenary,
  sampleCatenaryMeridian,
} from './math/catenary'
export type { RefineStore, SceneOps } from './refine'
export { applyRefine, planRefine } from './refine'
export { HsColumnNode, HsColumnVariantSchema } from './schema'

// Temple forms — the Sulphur Mountain additions: a domed bay at any size, true pendentives,
// classic proportions, placement tools and the rail panel.
export { templeHostPanel } from './temple/host-panel'
export type {
  ArchForm,
  BayMeasure,
  BayPart,
  DomedBayOptions,
  DomeShape,
  Quadrant,
} from './temple/proportions'
export {
  ARCH_FORMS,
  archFor,
  BYZANTINE,
  composeDomedBay,
  DOME_SHAPES,
  domeRiseRatio,
  measureDomedBay,
  PHI,
  truePendentiveGrid,
} from './temple/proportions'
