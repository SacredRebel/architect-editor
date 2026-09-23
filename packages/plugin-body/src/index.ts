import type { AnyNodeDefinition, Plugin } from '@pascal-app/core'
import { bodyDefinition } from './kinds/body/definition'
import { bodyGroupDefinition } from './kinds/body-group/definition'

export const bodyPlugin: Plugin = {
  id: 'pascal:body',
  apiVersion: 1,
  nodes: [
    bodyDefinition as unknown as AnyNodeDefinition,
    bodyGroupDefinition as unknown as AnyNodeDefinition,
  ],
}

export { bodyDefinition } from './kinds/body/definition'
export { buildBodyGeometry } from './kinds/body/geometry'
export { bodyGroupDefinition } from './kinds/body-group/definition'

export {
  BodyCurve,
  BodyFace,
  BodyHalfEdge,
  BodyLoop,
  BodyNode,
  BodyShell,
  BodyVertex,
} from './schema/body'
export { BodyGroupNode } from './schema/body-group'

export {
  DEFAULT_BODY_CURVE_SEGMENTS,
  createCircularArcFaceBody,
  getBodyLoopBoundaryPoints,
  sampleBodyCurve,
} from './kernel/body-curves'
export {
  BodyCsgError,
  intersectBodies,
  subtractBodies,
  unionBodies,
} from './kernel/body-csg'
export { imprintBodyFace } from './kernel/body-imprint'
export { offsetBodyFace } from './kernel/body-offset'
export { pushPullBodyFace as pushPullBodyFaceInsetAware } from './kernel/body-push-pull'
export { inspectBodySolid } from './kernel/body-solid'
export { SweepBodyFaceError, sweepBodyFace } from './kernel/body-sweep'
export {
  createPlanarFaceBody,
  createRectangleBody,
  getBodyFaceFrame,
  getBodyLoopVertices,
  getBodySemanticHash,
  pushPullBodyFace,
  validateBodyTopology,
} from './kernel/body-topology'
export { transformBody } from './kernel/body-transform'
export { createRoundedRectangularFrameBody } from './kernel/body-frame'
export { splitBodyFace } from './kernel/body-face-split'
